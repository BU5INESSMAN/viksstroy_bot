import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
from database_deps import db
from utils import resolve_id, get_all_linked_ids

router = APIRouter(tags=["Users"])


@router.get("/api/users")
async def get_users():
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT user_id, fio, role, is_blacklisted FROM users") as cur:
        return [{"user_id": r[0], "fio": r[1], "role": r[2], "is_blacklisted": r[3]} for r in await cur.fetchall()]


@router.get("/api/users/{target_id}/profile")
async def get_profile(target_id: int, member_id: int = 0, equip_id: int = 0):
    if db.conn is None: await db.init_db()

    # 1. Попытка достать профиль из базы
    if target_id != 0:
        real_tg_id = await resolve_id(target_id)
        # Обрати внимание на добавленные поля notify_tg и notify_max
        async with db.conn.execute(
                "SELECT user_id, fio, role, avatar_url, notify_tg, notify_max, notify_new_users, notify_orders, notify_reports, notify_errors FROM users WHERE user_id = ?",
                (real_tg_id,)) as cur:
            row = await cur.fetchone()

        if row:
            profile = {
                "user_id": row[0],
                "fio": row[1],
                "role": row[2],
                "avatar_url": row[3],
                "notify_tg": row[4] if row[4] is not None else 1,
                "notify_max": row[5] if row[5] is not None else 1,
                "notify_new_users": row[6] if row[6] is not None else 1,
                "notify_orders": row[7] if row[7] is not None else 1,
                "notify_reports": row[8] if row[8] is not None else 1,
                "notify_errors": row[9] if row[9] is not None else 1,
            }

            # Ищем дополнительные данные профиля из связанных таблиц
            async with db.conn.execute(
                    "SELECT team_id, position, max_invite_link FROM team_members WHERE tg_user_id = ?",
                    (real_tg_id,)) as cur:
                tm = await cur.fetchone()
                if tm:
                    profile.update({"team_id": tm[0], "position": tm[1], "max_invite_link": tm[2]})

            async with db.conn.execute("SELECT id, name, category FROM equipment WHERE tg_id = ?",
                                       (real_tg_id,)) as cur:
                eq = await cur.fetchone()
                if eq:
                    profile.update({"equip_id": eq[0], "position": eq[2], "max_invite_link": ""})

            # Собираем привязки аккаунта
            links = {"has_tg": False, "has_max": False, "is_linked": False}
            linked_ids = await get_all_linked_ids(real_tg_id)
            for lid in linked_ids:
                if lid > 0:
                    links["has_tg"] = True
                    links["tg_account_id"] = lid
                elif lid < 0:
                    links["has_max"] = True
                    links["max_account_id"] = abs(lid)

            if len(linked_ids) > 1: links["is_linked"] = True

            return {"status": "ok", "profile": profile, "links": links}

    # 2. Если профиль не найден по ID, создаем "заглушку" из рабочих/техники
    if member_id > 0:
        async with db.conn.execute("SELECT fio, position FROM team_members WHERE id = ?", (member_id,)) as cur:
            m_row = await cur.fetchone()
        if m_row:
            return {"status": "ok", "profile": {"user_id": 0, "fio": m_row[0], "role": "worker", "position": m_row[1],
                                                "unregistered": True}, "links": {}}

    if equip_id > 0:
        async with db.conn.execute("SELECT driver_fio, category FROM equipment WHERE id = ?", (equip_id,)) as cur:
            e_row = await cur.fetchone()
        if e_row:
            return {"status": "ok",
                    "profile": {"user_id": 0, "fio": e_row[0] or "Водитель", "role": "driver", "position": e_row[1],
                                "unregistered": True}, "links": {}}

    raise HTTPException(404, "Профиль не найден")


@router.post("/api/users/{target_id}/update_profile")
async def update_profile(target_id: int, tg_id: int = Form(...), fio: str = Form(...), role: str = Form(...),
                         team_id: str = Form(""), position: str = Form(""), max_invite_link: str = Form(""),
                         notify_tg: int = Form(1), notify_max: int = Form(1),
                         notify_new_users: int = Form(1), notify_orders: int = Form(1),
                         notify_reports: int = Form(1), notify_errors: int = Form(1)):
    if db.conn is None: await db.init_db()
    admin_id = await resolve_id(tg_id)
    user = await db.get_user(admin_id)

    is_admin = dict(user).get('role') in ['boss', 'superadmin', 'moderator'] if user else False
    if admin_id != target_id and not is_admin:
        raise HTTPException(403, "Нет прав для изменения этого профиля")

    try:
        # Обновляем таблицу users
        await db.conn.execute(
            "UPDATE users SET fio=?, role=?, notify_tg=?, notify_max=?, notify_new_users=?, notify_orders=?, notify_reports=?, notify_errors=? WHERE user_id=?",
            (fio, role, notify_tg, notify_max, notify_new_users, notify_orders, notify_reports, notify_errors, target_id)
        )

        # Обновляем таблицу team_members, если человек состоит в бригаде
        await db.conn.execute(
            "UPDATE team_members SET fio=?, position=?, max_invite_link=? WHERE tg_user_id=?",
            (fio, position, max_invite_link, target_id)
        )

        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка сохранения: {e}")

    return {"status": "ok"}


@router.post("/api/users/{target_id}/update_avatar")
async def update_avatar(target_id: int, tg_id: int = Form(...), avatar_base64: str = Form(...)):
    if db.conn is None: await db.init_db()
    admin_id = await resolve_id(tg_id)

    if admin_id != target_id:
        user = await db.get_user(admin_id)
        if not user or dict(user).get('role') not in ['boss', 'superadmin', 'moderator']:
            raise HTTPException(403, "Нет прав")

    from utils import process_base64_image
    url = process_base64_image(avatar_base64, f"avatar_{target_id}")
    if url:
        try:
            await db.conn.execute("UPDATE users SET avatar_url=? WHERE user_id=?", (url, target_id))
            await db.conn.commit()
            return {"status": "ok", "avatar_url": url}
        except:
            await db.conn.rollback()
            raise HTTPException(500, "Ошибка записи в БД")
    raise HTTPException(400, "Ошибка загрузки фото")


@router.post("/api/users/{target_id}/delete")
async def delete_user(target_id: int, tg_id: int = Form(...)):
    if db.conn is None: await db.init_db()
    admin_id = await resolve_id(tg_id)
    user = await db.get_user(admin_id)

    if not user or dict(user).get('role') not in ['boss', 'superadmin']:
        raise HTTPException(403, "Только руководство может удалять пользователей")

    if admin_id == target_id:
        raise HTTPException(400, "Нельзя удалить самого себя")

    try:
        await db.conn.execute("UPDATE team_members SET tg_user_id = NULL WHERE tg_user_id = ?", (target_id,))
        await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE tg_id = ?", (target_id,))
        await db.conn.execute("DELETE FROM account_links WHERE primary_id = ? OR secondary_id = ?",
                              (target_id, target_id))
        await db.conn.execute("DELETE FROM users WHERE user_id = ?", (target_id,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка удаления: {e}")

    return {"status": "ok"}


@router.post("/api/users/link_account")
async def link_account(tg_id: int = Form(...), code: str = Form(...)):
    if db.conn is None: await db.init_db()
    real_tg_id = await resolve_id(tg_id)

    import time
    async with db.conn.execute("SELECT user_id, expires FROM link_codes WHERE code = ?", (code,)) as cur:
        row = await cur.fetchone()

    if not row or time.time() > row[1]:
        raise HTTPException(400, "Код недействителен или устарел")

    primary_id = row[0]

    try:
        await db.conn.execute("INSERT OR REPLACE INTO account_links (primary_id, secondary_id) VALUES (?, ?)",
                              (primary_id, real_tg_id))
        await db.conn.execute("DELETE FROM link_codes WHERE code = ?", (code,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка БД: {e}")

    user = await db.get_user(primary_id)
    if not user:
        raise HTTPException(404, "Основной профиль не найден")

    return {"status": "ok", "new_tg_id": primary_id, "role": dict(user).get('role')}


@router.post("/api/users/unlink_platform")
async def unlink_platform(tg_id: int = Form(...), platform: str = Form(...)):
    if db.conn is None: await db.init_db()
    real_tg_id = await resolve_id(tg_id)

    # Ищем все связи пользователя
    linked_ids = await get_all_linked_ids(real_tg_id)
    if len(linked_ids) <= 1:
        raise HTTPException(400, "У вас нет привязанных устройств для отвязки")

    target_to_remove = None
    for lid in linked_ids:
        if platform == "max" and lid < 0:
            target_to_remove = lid
            break
        elif platform == "tg" and lid > 0 and lid != real_tg_id:
            target_to_remove = lid
            break

    if not target_to_remove:
        raise HTTPException(400, "Аккаунт этой платформы не найден")

    try:
        await db.conn.execute("DELETE FROM account_links WHERE secondary_id = ?", (target_to_remove,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, "Ошибка отвязки")

    return {"status": "ok"}