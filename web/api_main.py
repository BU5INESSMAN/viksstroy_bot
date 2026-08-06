import sys
import os
import logging

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio

from database_deps import db, TZ_BARNAUL
from services.publish_service import execute_app_publish
from routers import auth, dashboard, users, teams, equipment, applications, objects, kp, system, exchange, support, push, drivers
from scheduler import start_scheduler
from smr_calculations import SmrNumberError
from system_monitoring import notify_system_incident

# --- File-based logging for server-logs endpoint ---
os.makedirs("data", exist_ok=True)
file_handler = logging.FileHandler(os.path.join("data", "server.log"), encoding="utf-8")
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s"))
logging.getLogger().addHandler(file_handler)

app = FastAPI(title="VIKS API")

# M-03: Environment-aware CORS origins — localhost only in dev mode.
# Keep the legacy origin during the migration window so an already-open old
# PWA can finish its current session while every generated link points at the
# new canonical domain.
_canonical_origin = os.getenv("WEB_APP_URL", "https://n.viksstroy.online").rstrip("/")
_configured_origins = [item.strip().rstrip("/") for item in os.getenv("CORS_ORIGINS", "").split(",") if item.strip()]
_prod_origins = list(dict.fromkeys([_canonical_origin, "https://miniapp.viks22.ru", *_configured_origins]))
_dev_origins = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
_is_dev = os.getenv("ENV", "production").lower() in ("dev", "development", "local")
origins = _prod_origins + (_dev_origins if _is_dev else [])
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

os.makedirs("data/uploads", exist_ok=True)
os.makedirs("data/uploads/objects", exist_ok=True)
# N-01: Static mount removed — files served via authenticated /api/files/{id}/download only

_last_active_cache = {}  # user_id → last_update_time (throttle to 1 update per 60s)
_session_user_cache = {}  # session_token → (user_id, cached_at) — avoid per-request SELECT on sessions


async def _resolve_user_from_session(token: str) -> int | None:
    """Resolve user_id from session cookie token with a short in-process cache.

    Returns the canonical (resolved) user_id or ``None`` if the session is
    invalid. Cached for 5 minutes; expired sessions are evicted lazily.
    """
    import time
    now = time.time()
    cached = _session_user_cache.get(token)
    if cached and now - cached[1] < 300:
        return cached[0]
    try:
        async with db.conn.execute(
            "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')",
            (token,),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            _session_user_cache.pop(token, None)
            return None
        from utils import resolve_id
        real_id = await resolve_id(row[0])
        _session_user_cache[token] = (real_id, now)
        return real_id
    except Exception:
        return None


@app.middleware("http")
async def track_activity(request: Request, call_next):
    response = await call_next(request)
    try:
        import time
        user_id: int | None = None

        # Primary signal: session cookie (covers every cookie-auth request).
        token = request.cookies.get("session_token")
        if token:
            user_id = await _resolve_user_from_session(token)

        # Fallback: legacy tg_id query param (bot flows, pre-session callers).
        if user_id is None:
            tg_id = request.query_params.get("tg_id")
            if tg_id and tg_id not in ("0", "undefined", "null", ""):
                try:
                    from utils import resolve_id
                    user_id = await resolve_id(int(tg_id))
                except Exception:
                    user_id = None

        if user_id:
            now = time.time()
            last = _last_active_cache.get(user_id, 0)
            if now - last > 60:  # Throttle: max once per 60 seconds per user
                _last_active_cache[user_id] = now
                asyncio.create_task(_update_last_active(user_id))
    except Exception:
        pass
    return response


async def _update_last_active(user_id: int):
    try:
        await db.conn.execute(
            "UPDATE users SET last_active = datetime('now', 'localtime') WHERE user_id = ?",
            (user_id,)
        )
        await db.conn.commit()
    except Exception:
        pass


app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(teams.router)
app.include_router(equipment.router)
app.include_router(applications.router)
app.include_router(objects.router)
app.include_router(kp.router)
app.include_router(system.router)
app.include_router(exchange.router)
app.include_router(support.router)
app.include_router(push.router)
app.include_router(drivers.router)


@app.get("/api/health", include_in_schema=False)
async def healthcheck():
    """Lightweight public liveness plus DB/scheduler readiness."""
    import time
    db_ok = False
    scheduler_last_success = None
    try:
        async with db.conn.execute("SELECT 1") as cur:
            db_ok = bool(await cur.fetchone())
        async with db.conn.execute(
            "SELECT last_success_at FROM system_heartbeats WHERE component='scheduler'"
        ) as cur:
            row = await cur.fetchone()
            scheduler_last_success = row[0] if row else None
    except Exception:
        db_ok = False
    status = "ok" if db_ok else "degraded"
    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": status,
            "database": "ok" if db_ok else "error",
            "scheduler_last_success": scheduler_last_success,
            "version": os.getenv("APP_VERSION", "dev"),
            "commit": os.getenv("GIT_COMMIT", "unknown")[:12],
            "timestamp": int(time.time()),
        },
    )


@app.exception_handler(SmrNumberError)
async def smr_number_exception_handler(_request: Request, exc: SmrNumberError):
    """Business-input errors are client errors, never system incidents."""
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        user_id = None
        token = request.cookies.get("session_token")
        if token:
            user_id = await _resolve_user_from_session(token)
        fingerprint = f"{request.method}:{request.url.path}:{type(exc).__name__}"

        async def _send_error_notification():
            try:
                await notify_system_incident(
                    db,
                    event_key="system_error",
                    title="Ошибка приложения (500)",
                    component=fingerprint,
                    details=f"Пользователь: {user_id or 'не определён'}; {str(exc)[:500]}",
                )
            except Exception:
                logging.exception("Failed to dispatch system incident")

        asyncio.create_task(_send_error_notification())
    except Exception:
        logging.exception("Failed to prepare system incident")
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})

@app.on_event("startup")
async def startup():
    await db.init_db()
    # v2.7.1 (M-2): cron endpoints fail closed when CRON_SECRET is unset.
    # Warn loudly at startup so a misconfigured deploy is obvious — cron
    # stays disabled (rejects all) until the secret is configured.
    if not os.getenv("CRON_SECRET"):
        logging.getLogger(__name__).warning(
            "CRON_SECRET not configured — cron endpoints are disabled until it is set"
        )
    try:
        from services.notifications import validate_vapid_keys
        validate_vapid_keys()
    except Exception:
        pass
    try:
        await db.conn.execute("CREATE TABLE IF NOT EXISTS web_codes (code TEXT, max_id INTEGER, expires REAL)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS account_links (primary_id INTEGER, secondary_id INTEGER UNIQUE)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS link_codes (code TEXT UNIQUE, user_id INTEGER, expires REAL)")
        await db.conn.execute("""CREATE TABLE IF NOT EXISTS max_login_requests (
            request_id TEXT PRIMARY KEY,
            poll_token_hash TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            user_id INTEGER,
            expires REAL NOT NULL,
            created_at REAL NOT NULL,
            approved_at REAL,
            consumed_at REAL
        )""")
        await db.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_max_login_requests_expires "
            "ON max_login_requests(expires)"
        )
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_tg INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_max INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_new_users INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_orders INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_reports INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_errors INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE team_members ADD COLUMN is_foreman INTEGER DEFAULT 0")
        except: pass
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_exchange INTEGER DEFAULT 1")
        except: pass
        await db.conn.execute("""CREATE TABLE IF NOT EXISTS support_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        await db.conn.commit()
    except Exception as e:
        print("Ошибка создания таблиц:", e)

    # Seed default settings for new features (safe upserts)
    for key, default_val in [
        ('auto_backup_enabled', '0'),
        ('office_reminder_enabled', '0'),
        ('office_reminder_time', ''),
        ('auto_start_orders_time', ''),
        ('report_request_time', ''),
        ('support_max_link', ''),
        ('gemini_api_key', ''),
    ]:
        try:
            await db.conn.execute(
                "INSERT INTO settings (key, value) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)",
                (key, default_val, key)
            )
        except:
            pass
    await db.conn.commit()

    try: start_scheduler()
    except Exception as e: print(f"Ошибка при запуске планировщика: {e}")

@app.on_event("shutdown")
async def shutdown():
    await db.close()
