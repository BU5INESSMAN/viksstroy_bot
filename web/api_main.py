import sys
import os
import logging

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import asyncio

from database_deps import db, TZ_BARNAUL
from services.notifications import notify_users
from services.publish_service import execute_app_publish
from routers import auth, dashboard, users, teams, equipment, applications, objects, kp, system, exchange, support, push
from scheduler import start_scheduler

# --- File-based logging for server-logs endpoint ---
os.makedirs("data", exist_ok=True)
file_handler = logging.FileHandler(os.path.join("data", "server.log"), encoding="utf-8")
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s"))
logging.getLogger().addHandler(file_handler)

app = FastAPI(title="VIKS API")

origins = [
    "https://miniapp.viks22.ru",
    "http://localhost:5173",
    "http://localhost:3000",
]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

os.makedirs("data/uploads", exist_ok=True)
os.makedirs("data/uploads/objects", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")

_last_active_cache = {}  # tg_id → last_update_time (throttle to 1 update per 60s)


@app.middleware("http")
async def track_activity(request: Request, call_next):
    response = await call_next(request)
    try:
        tg_id = request.query_params.get("tg_id")
        if not tg_id:
            # Also check form body for POST — but only from query params to keep it cheap
            pass
        if tg_id and tg_id not in ("0", "undefined", "null", ""):
            import time
            tg_id_int = int(tg_id)
            now = time.time()
            last = _last_active_cache.get(tg_id_int, 0)
            if now - last > 60:  # Throttle: max once per 60 seconds per user
                _last_active_cache[tg_id_int] = now
                asyncio.create_task(_update_last_active(tg_id_int))
    except Exception:
        pass
    return response


async def _update_last_active(tg_id: int):
    try:
        from utils import resolve_id
        real_id = await resolve_id(tg_id)
        await db.conn.execute(
            "UPDATE users SET last_active = datetime('now', 'localtime') WHERE user_id = ?",
            (real_id,)
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        import asyncio
        last_action = str(request.url)
        last_user = "Неизвестно"
        err_msg = f"🚨 <b>ОШИБКА СИСТЕМЫ (500)</b>\n\n👤 <b>Юзер:</b> {last_user}\n👣 <b>Действие:</b> {last_action}\n❌ <b>Ошибка:</b> {str(exc)}"

        async def _send_error_notification():
            try:
                await notify_users(["report_group", "superadmin"], err_msg, "system", category="errors")
            except Exception:
                pass

        asyncio.create_task(_send_error_notification())
    except: pass
    return JSONResponse(status_code=500, content={"detail": f"Внутренняя ошибка сервера"})

@app.on_event("startup")
async def startup():
    await db.init_db()
    try:
        await db.conn.execute("CREATE TABLE IF NOT EXISTS web_codes (code TEXT, max_id INTEGER, expires REAL)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS account_links (primary_id INTEGER, secondary_id INTEGER UNIQUE)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS link_codes (code TEXT UNIQUE, user_id INTEGER, expires REAL)")
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
        ('support_tg_link', ''),
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