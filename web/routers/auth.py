from fastapi import APIRouter, Form, HTTPException
import time
import hashlib
import hmac
import os
from database_deps import db
from utils import resolve_id, notify_users

router = APIRouter(tags=["Auth"])

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
    except: pass
    return {"status": "ok", "role": user_dict['role'], "tg_id": primary_id}

@router.post("/api/users/link_account")
async def api_link_account(tg_id: int = Form(...), code: str = Form(...)):
    raw_id = tg_id
    async with db.conn.execute("SELECT user_id, expires FROM link_codes WHERE code = ?", (code,)) as cur:
        row = await cur.fetchone()
    if not row or time.time() > row[1]: raise HTTPException(400, "Код недействителен или устарел")
    primary_id = row[0]
    if primary_id == raw_id: raise HTTPException(400, "Нельзя привязать аккаунт к самому себе")
    try:
        await db.conn.execute("INSERT OR REPLACE INTO account_links (primary_id, secondary_id) VALUES (?, ?)", (primary_id, raw_id))
        await db.conn.execute("DELETE FROM link_codes WHERE code = ?", (code,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, "Ошибка БД при связке аккаунтов")
    user = await db.get_user(primary_id)
    return {"status": "ok", "new_tg_id": primary_id, "role": dict(user)['role'] if user else "worker"}

@router.post("/api/users/unlink_platform")
async def api_unlink_platform(tg_id: int = Form(...), platform: str = Form(...)):
    real_target_id = await resolve_id(tg_id)
    try:
        if platform == 'max':
            if real_target_id < 0: await db.conn.execute("DELETE FROM account_links WHERE primary_id = ?", (real_target_id,))
            else: await db.conn.execute("DELETE FROM account_links WHERE primary_id = ? AND secondary_id < 0", (real_target_id,))
        elif platform == 'tg':
            if real_target_id > 0: await db.conn.execute("DELETE FROM account_links WHERE primary_id = ?", (real_target_id,))
            else: await db.conn.execute("DELETE FROM account_links WHERE primary_id = ? AND secondary_id > 0", (real_target_id,))
        await db.conn.commit()
    except Exception:
        await db.conn.rollback()
        raise HTTPException(500, "Ошибка БД при отвязке")
    return {"status": "ok"}

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
    return {"status": "ok", "role": dict(user)['role'], "tg_id": real_tg_id}

@router.post("/api/max/auth")
async def api_max_auth(max_id: int = Form(...), first_name: str = Form(""), last_name: str = Form("")):
    pseudo_tg_id = -int(max_id)
    real_tg_id = await resolve_id(pseudo_tg_id)
    user = await db.get_user(real_tg_id)
    if user:
        if dict(user).get('is_blacklisted'): raise HTTPException(status_code=403, detail="Заблокирован")
        return {"status": "ok", "role": dict(user)['role'], "fio": dict(user)['fio'], "tg_id": real_tg_id}
    return {"status": "needs_password", "max_id": max_id, "first_name": first_name, "last_name": last_name}

@router.post("/api/max/register")
async def register_max(max_id: int = Form(...), first_name: str = Form(""), last_name: str = Form(""), password: str = Form(...)):
    role = None
    if password == os.getenv("FOREMAN_PASS"): role = "foreman"
    elif password == os.getenv("MODERATOR_PASS"): role = "moderator"
    elif password == os.getenv("BOSS_PASS"): role = "boss"
    elif password == os.getenv("SUPERADMIN_PASS"): role = "superadmin"
    if not role: raise HTTPException(status_code=401, detail="Неверный пароль")
    pseudo_tg_id = -int(max_id)
    fio = f"{last_name} {first_name}".strip() or f"Пользователь MAX {max_id}"
    await db.add_user(pseudo_tg_id, fio, role)
    await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался через MAX (Роль: {role})")
    await notify_users(["report_group", "moderator"], f"🆕 <b>Новая регистрация (MAX)</b>\n👤 {fio}\n💼 {role}", "system")
    return {"status": "ok", "role": role, "tg_id": pseudo_tg_id}

@router.post("/api/telegram_auth")
async def telegram_auth(data: dict):
    try:
        bot_token = os.getenv("BOT_TOKEN")
        received_hash = data.pop('hash', None)
        if time.time() - int(data.get('auth_date', 0)) > 86400: raise HTTPException(status_code=403, detail="Данные устарели")
        data_check_string = "\n".join([f"{k}={data[k]}" for k in sorted(data.keys()) if data[k] is not None])
        secret_key = hashlib.sha256(bot_token.encode()).digest()
        hash_calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if hash_calc != received_hash: raise HTTPException(status_code=403, detail="Неверная подпись")
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
            return {"status": "ok", "role": user_dict['role'], "fio": user_dict['fio'], "tg_id": real_tg_id, "avatar_url": user_dict.get('avatar_url', photo_url)}
        return {"status": "needs_password", "tg_id": raw_id, "first_name": data.get('first_name', ''), "last_name": data.get('last_name', ''), "photo_url": photo_url}
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")

@router.post("/api/tma/auth")
async def api_tma_auth(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form("")):
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if user:
        if dict(user).get('is_blacklisted'): raise HTTPException(status_code=403, detail="Заблокирован")
        return {"status": "ok", "role": dict(user)['role'], "fio": dict(user)['fio'], "tg_id": real_tg_id}
    return {"status": "needs_password", "tg_id": tg_id, "first_name": first_name, "last_name": last_name}

@router.post("/api/register_telegram")
async def register_telegram(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form(""), password: str = Form(...), photo_url: str = Form("")):
    role = None
    if password == os.getenv("FOREMAN_PASS"): role = "foreman"
    elif password == os.getenv("MODERATOR_PASS"): role = "moderator"
    elif password == os.getenv("BOSS_PASS"): role = "boss"
    elif password == os.getenv("SUPERADMIN_PASS"): role = "superadmin"
    if not role: raise HTTPException(status_code=401, detail="Неверный пароль")
    fio = f"{last_name} {first_name}".strip() or f"Пользователь {tg_id}"
    await db.add_user(tg_id, fio, role)
    if photo_url: await db.update_user_avatar(tg_id, photo_url)
    await db.add_log(tg_id, fio, f"Зарегистрировался (Роль: {role})")
    await notify_users(["report_group", "moderator"], f"🆕 <b>Новая регистрация</b>\n👤 {fio}\n💼 {role}", "system")
    return {"status": "ok", "role": role, "tg_id": tg_id}