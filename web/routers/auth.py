import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Query, Cookie, Request
from fastapi.responses import JSONResponse
import asyncio
import time
import hashlib
import hmac
import os
import secrets
import logging
from datetime import datetime, timedelta
from database_deps import db
from utils import resolve_id
from services.notifications import notify_users, notify_fio_match

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Auth"])


def _check_role_password(provided: str, env_var: str) -> bool:
    """Timing-safe password comparison against an env var (M-08 fix)."""
    expected = os.getenv(env_var, "")
    if not expected or not provided:
        return False
    return secrets.compare_digest(provided, expected)


def _make_auth_response(data: dict, session_token: str) -> JSONResponse:
    """Wrap auth response with an HttpOnly session cookie for PWA persistence."""
    response = JSONResponse(content=data)
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=30 * 24 * 3600,  # 30 days
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return response


async def _create_session(user_id: int) -> str:
    """Generate a session token and store it in DB with 30-day expiry."""
    token = secrets.token_urlsafe(32)
    try:
        await db.conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))",
            (token, user_id)
        )
        await db.conn.commit()
    except Exception:
        pass
    return token


async def _check_fio_match(new_user_id: int, new_fio: str):
    """Stage 5B-1: Ищет пользователей с совпадающим ФИО на другой платформе."""
    if not new_fio or new_fio.startswith("Пользователь"):
        return

    try:
        # Определяем платформу нового пользователя
        if new_user_id > 0:
            platform_filter = "user_id < 0"
        else:
            platform_filter = "user_id > 0"

        async with db.conn.execute(
            f"SELECT user_id, fio FROM users "
            f"WHERE {platform_filter} AND linked_user_id IS NULL "
            f"AND user_id != ? AND LOWER(TRIM(fio)) = LOWER(TRIM(?))",
            (new_user_id, new_fio)
        ) as cur:
            matches = await cur.fetchall()

        for match in matches:
            async def _send_fio_match(m=match):
                try:
                    await notify_fio_match(new_user_id, new_fio, m[0], m[1])
                except Exception as e:
                    logger.error(f"FIO match notification error: {e}")

            asyncio.create_task(_send_fio_match())
    except Exception:
        pass  # Не ломаем регистрацию из-за ошибки поиска


@router.post("/api/auth/code")
async def api_auth_by_code(code: str = Form(...)):
    async with db.conn.execute("SELECT user_id, expires FROM link_codes WHERE code = ?", (code,)) as cur:
        row = await cur.fetchone()
    if not row or time.time() > row[1]: raise HTTPException(400, "Код недействителен или устарел")
    primary_id = row[0]
    user = await db.get_user(primary_id)
    if not user: raise HTTPException(404, "Пользователь не найден")
    user_dict = dict(user)
    if user_dict.get('is_blacklisted'): raise HTTPException(status_code=403, detail="Ваш аккаунт заблокирован")
    try:
        await db.conn.execute("DELETE FROM link_codes WHERE code = ?", (code,))
        await db.conn.commit()
    except:
        pass

    token = await _create_session(primary_id)
    return _make_auth_response(
        {"status": "ok", "role": user_dict['role'], "tg_id": primary_id}, token)


@router.post("/api/max/web_auth")
async def max_web_auth(code: str = Form(...)):
    async with db.conn.execute("SELECT max_id, expires FROM web_codes WHERE code = ?", (code,)) as cur:
        row = await cur.fetchone()
    if not row or time.time() > row[1]: raise HTTPException(400, "Код недействителен или устарел")
    max_id = row[0]
    pseudo_tg_id = -int(max_id)
    real_tg_id = await resolve_id(pseudo_tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(404, "Пользователь не найден. Зарегистрируйтесь в боте (/start)")
    await db.conn.execute("DELETE FROM web_codes WHERE code = ?", (code,))
    await db.conn.commit()

    token = await _create_session(real_tg_id)
    return _make_auth_response(
        {"status": "ok", "role": dict(user)['role'], "tg_id": real_tg_id}, token)


@router.post("/api/max/auth")
async def api_max_auth(code: str = Form(...)):
    """MAX web auth via one-time code from bot.

    SECURITY: Requires a verified one-time code from the web_codes table.
    Never trusts raw max_id from the client.

    Flow:
    1. User sends /login to the MAX bot
    2. Bot generates a short-lived code and stores it in web_codes
    3. User enters the code on the web login page
    4. This endpoint validates the code and creates a session
    """
    async with db.conn.execute(
        "SELECT max_id, expires FROM web_codes WHERE code = ?", (code,)
    ) as cur:
        row = await cur.fetchone()

    if not row or time.time() > row[1]:
        raise HTTPException(400, "Код недействителен или истёк")

    max_id = row[0]

    # Consume the code (one-time use)
    await db.conn.execute("DELETE FROM web_codes WHERE code = ?", (code,))
    await db.conn.commit()

    pseudo_tg_id = -int(max_id)
    real_tg_id = await resolve_id(pseudo_tg_id)
    user = await db.get_user(real_tg_id)

    if user:
        if dict(user).get("is_blacklisted"):
            raise HTTPException(status_code=403, detail="Заблокирован")
        token = await _create_session(real_tg_id)
        user_dict = dict(user)
        return _make_auth_response(
            {"status": "ok", "role": user_dict["role"], "fio": user_dict["fio"],
             "tg_id": real_tg_id},
            token,
        )

    # User not registered — return max_id for registration form
    return {"status": "needs_password", "max_id": max_id}


@router.post("/api/max/register")
async def register_max(max_id: int = Form(...), first_name: str = Form(""), last_name: str = Form(""),
                       password: str = Form(...)):
    role = None
    if _check_role_password(password, "FOREMAN_PASS"):
        role = "foreman"
    elif _check_role_password(password, "MODERATOR_PASS"):
        role = "moderator"
    elif _check_role_password(password, "BOSS_PASS"):
        role = "boss"
    elif _check_role_password(password, "SUPERADMIN_PASS"):
        role = "superadmin"
    if not role: raise HTTPException(status_code=401, detail="Неверный пароль")
    pseudo_tg_id = -int(max_id)
    fio = f"{last_name} {first_name}".strip() or f"Пользователь MAX {max_id}"
    await db.add_user(pseudo_tg_id, fio, role)
    await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался через MAX (Роль: {role})", target_type='user', target_id=pseudo_tg_id)

    async def _send_register_max_notifications():
        try:
            await notify_users(["report_group", "moderator"], f"🆕 <b>Новая регистрация (MAX)</b>\n👤 {fio}\n💼 {role}", "system", category="new_users")
        except Exception as e:
            logger.error(f"Registration notification error: {e}")

    asyncio.create_task(_send_register_max_notifications())

    # Stage 5B-1: Поиск совпадений ФИО на другой платформе
    await _check_fio_match(pseudo_tg_id, fio)

    token = await _create_session(pseudo_tg_id)
    return _make_auth_response(
        {"status": "ok", "role": role, "tg_id": pseudo_tg_id}, token)


@router.post("/api/telegram_auth")
async def telegram_auth(data: dict):
    try:
        bot_token = os.getenv("BOT_TOKEN")
        received_hash = data.pop('hash', None)
        if time.time() - int(data.get('auth_date', 0)) > 86400: raise HTTPException(status_code=403,
                                                                                    detail="Данные устарели")
        data_check_string = "\n".join([f"{k}={data[k]}" for k in sorted(data.keys()) if data[k] is not None])
        secret_key = hashlib.sha256(bot_token.encode()).digest()
        hash_calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if not secrets.compare_digest(hash_calc, received_hash): raise HTTPException(status_code=403, detail="Неверная подпись")
        raw_id = int(data['id'])
        real_tg_id = await resolve_id(raw_id)
        photo_url = data.get('photo_url', '')
        user = await db.get_user(real_tg_id)
        if user:
            user_dict = dict(user)
            if user_dict.get('is_blacklisted'): raise HTTPException(status_code=403, detail="Заблокирован")
            if photo_url and not user_dict.get('avatar_url'):
                await db.update_user_avatar(real_tg_id, photo_url)
                user_dict['avatar_url'] = photo_url

            token = await _create_session(real_tg_id)
            return _make_auth_response(
                {"status": "ok", "role": user_dict['role'], "fio": user_dict['fio'], "tg_id": real_tg_id,
                 "avatar_url": user_dict.get('avatar_url', photo_url)}, token)
        return {"status": "needs_password", "tg_id": raw_id, "first_name": data.get('first_name', ''),
                "last_name": data.get('last_name', ''), "photo_url": photo_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


@router.post("/api/tma/auth")
async def api_tma_auth(init_data: str = Form(...)):
    """Telegram Mini App auth via initData HMAC verification.

    SECURITY: Verifies HMAC-SHA256 signature using the WebAppData scheme.
    Never trusts raw tg_id — extracts it from cryptographically verified data.
    """
    import json
    from urllib.parse import parse_qsl

    bot_token = os.getenv("BOT_TOKEN", "")
    if not bot_token:
        raise HTTPException(500, "Auth not configured")

    try:
        # Parse initData query string
        pairs = parse_qsl(init_data, keep_blank_values=True)
        received_hash = None
        check_pairs = []
        raw_data = {}

        for k, v in pairs:
            if k == "hash":
                received_hash = v
            else:
                check_pairs.append(f"{k}={v}")
                raw_data[k] = v

        if not received_hash:
            raise HTTPException(401, "Отсутствует hash в initData")

        # Build data-check-string (sorted alphabetically by key)
        check_pairs.sort()
        data_check_string = "\n".join(check_pairs)

        # WebAppData HMAC scheme (different from Login Widget!)
        secret_key = hmac.new(
            b"WebAppData",
            bot_token.encode(),
            hashlib.sha256,
        ).digest()

        expected_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not secrets.compare_digest(received_hash, expected_hash):
            raise HTTPException(401, "Недействительная подпись initData")

        # Verify auth_date is recent (24 h window to prevent replay)
        auth_date = int(raw_data.get("auth_date", "0"))
        if time.time() - auth_date > 86400:
            raise HTTPException(401, "Данные initData устарели")

        # Extract verified user
        user_json = raw_data.get("user", "{}")
        user_data = json.loads(user_json)
        tg_id = int(user_data.get("id", 0))
        if not tg_id:
            raise HTTPException(401, "Не удалось извлечь user.id из initData")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(401, f"Ошибка валидации initData: {str(e)[:100]}")

    # Resolve linked accounts and look up user
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)

    if user:
        if dict(user).get("is_blacklisted"):
            raise HTTPException(status_code=403, detail="Заблокирован")
        token = await _create_session(real_tg_id)
        user_dict = dict(user)
        return _make_auth_response(
            {"status": "ok", "role": user_dict["role"], "fio": user_dict["fio"],
             "tg_id": real_tg_id},
            token,
        )

    # User not found — return verified data for registration form
    first_name = user_data.get("first_name", "")
    last_name = user_data.get("last_name", "")
    return {"status": "needs_password", "tg_id": tg_id,
            "first_name": first_name, "last_name": last_name}


@router.post("/api/register_telegram")
async def register_telegram(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form(""),
                            password: str = Form(...), photo_url: str = Form("")):
    role = None
    if _check_role_password(password, "FOREMAN_PASS"):
        role = "foreman"
    elif _check_role_password(password, "MODERATOR_PASS"):
        role = "moderator"
    elif _check_role_password(password, "BOSS_PASS"):
        role = "boss"
    elif _check_role_password(password, "SUPERADMIN_PASS"):
        role = "superadmin"
    if not role: raise HTTPException(status_code=401, detail="Неверный пароль")
    fio = f"{last_name} {first_name}".strip() or f"Пользователь {tg_id}"
    await db.add_user(tg_id, fio, role)
    if photo_url: await db.update_user_avatar(tg_id, photo_url)
    await db.add_log(tg_id, fio, f"Зарегистрировался (Роль: {role})", target_type='user', target_id=tg_id)

    async def _send_register_tg_notifications():
        try:
            await notify_users(["report_group", "moderator"], f"🆕 <b>Новая регистрация</b>\n👤 {fio}\n💼 {role}", "system", category="new_users")
        except Exception as e:
            logger.error(f"Registration notification error: {e}")

    asyncio.create_task(_send_register_tg_notifications())

    # Stage 5B-1: Поиск совпадений ФИО на другой платформе
    await _check_fio_match(tg_id, fio)

    token = await _create_session(tg_id)
    return _make_auth_response(
        {"status": "ok", "role": role, "tg_id": tg_id}, token)


@router.get("/api/auth/session")
async def validate_session(
    token: str = Query(default=None),
    session_token: str = Cookie(default=None),
):
    """Validate session. Prefers HttpOnly cookie; query ?token= accepted only
    for the bot deep-link redirect flow (sets cookie on success so subsequent
    requests use cookie only — L-05 mitigation)."""
    # Prefer cookie; fall back to query token for initial auth redirect
    effective_token = session_token or token
    if not effective_token:
        raise HTTPException(status_code=401, detail="No session token")
    if db.conn is None:
        await db.init_db()
    async with db.conn.execute(
        "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')",
        (effective_token,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        try:
            await db.conn.execute("DELETE FROM sessions WHERE token = ?", (effective_token,))
            await db.conn.commit()
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Сессия не найдена или истекла")
    raw_user_id = row[0]
    user_id = await resolve_id(raw_user_id)
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    user_dict = dict(user)

    data = {"status": "ok", "tg_id": user_id, "role": user_dict['role'], "fio": user_dict.get('fio', '')}

    # If token came via query param (redirect flow), set HttpOnly cookie
    # so subsequent requests use cookie only (token no longer in URL)
    if token and not session_token:
        resp = JSONResponse(content=data)
        resp.set_cookie(
            key="session_token", value=effective_token,
            max_age=30 * 24 * 3600, httponly=True, secure=True,
            samesite="lax", path="/",
        )
        return resp

    return data


@router.post("/api/auth/logout")
async def api_logout(request: Request):
    """Logout: invalidate session server-side and clear cookie."""
    token = request.cookies.get("session_token")
    if token:
        try:
            await db.conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            await db.conn.commit()
        except Exception:
            pass

    resp = JSONResponse(content={"status": "ok"})
    resp.delete_cookie("session_token", path="/")
    return resp