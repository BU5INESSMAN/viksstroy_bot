import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
from database_deps import db
from utils import resolve_id, process_base64_image

router = APIRouter(tags=["Users"])


@router.get("/api/users")
async def api_get_users():
    users = await db.get_all_users()
    return [{"user_id": dict(u)['user_id'], "fio": dict(u)['fio'], "role": dict(u)['role'],
             "is_blacklisted": dict(u)['is_blacklisted'], "avatar_url": dict(u).get('avatar_url', '')} for u in users]


@router.get("/api/users/{target_id}/profile")
async def api_get_profile(target_id: int):
    real_target_id = await resolve_id(target_id)

    # Автоматическая миграция (создаем колонку для ссылки MAX, если её еще нет)
    try:
        await db.conn.execute("ALTER TABLE users ADD COLUMN max_invite_link TEXT")
        await db.conn.commit()
    except:
        pass

    profile = await db.get_user_full_profile(real_target_id)
    if not profile: raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Достаем ссылку MAX из базы
    async with db.conn.execute("SELECT max_invite_link FROM users WHERE user_id = ?", (real_target_id,)) as cur:
        link_row = await cur.fetchone()
        max_invite_link = link_row[0] if link_row else ""

    profile_dict = dict(profile)
    profile_dict['max_invite_link'] = max_invite_link

    async with db.conn.execute("SELECT secondary_id FROM account_links WHERE primary_id = ?", (real_target_id,)) as cur:
        rows = await cur.fetchall()

    linked_ids = [r[0] for r in rows]

    tg_account_id = real_target_id if real_target_id > 0 else None
    max_account_id = abs(real_target_id) if real_target_id < 0 else None

    for sid in linked_ids:
        if sid > 0: tg_account_id = sid
        if sid < 0: max_account_id = abs(sid)

    has_tg = tg_account_id is not None
    has_max = max_account_id is not None

    return {
        "profile": profile_dict,
        "logs": await db.get_specific_user_logs(real_target_id),
        "links": {
            "has_tg": has_tg,
            "has_max": has_max,
            "tg_account_id": tg_account_id,
            "max_account_id": max_account_id,
            "is_linked": len(linked_ids) > 0,
            "secondary_tg": any(sid > 0 for sid in linked_ids) or (real_target_id > 0 and len(linked_ids) > 0),
            "secondary_max": any(sid < 0 for sid in linked_ids) or (real_target_id < 0 and len(linked_ids) > 0)
        }
    }


@router.post("/api/users/{target_id}/update_avatar")
async def api_update_avatar(target_id: int, avatar_url: str = Form(""), avatar_base64: str = Form(""),
                            tg_id: int = Form(0)):
    real_target_id = await resolve_id(target_id)
    final_url = avatar_url
    if avatar_base64: final_url = process_base64_image(avatar_base64, f"avatar_{real_target_id}") or avatar_url
    if final_url: await db.update_user_avatar(real_target_id, final_url)
    return {"status": "ok", "avatar_url": final_url}


@router.post("/api/users/{target_id}/update_profile")
async def api_update_profile(target_id: int, tg_id: int = Form(...), fio: str = Form(""), role: str = Form(""),
                             team_id: int = Form(0), position: str = Form(""), max_invite_link: str = Form("")):
    admin = await db.get_user(tg_id)
    if not admin: raise HTTPException(status_code=403, detail="Пользователь не найден")

    is_admin = admin['role'] in ['superadmin', 'boss', 'moderator']
    real_target_id = await resolve_id(target_id)
    real_admin_id = await resolve_id(tg_id)

    # Запрещаем редактировать чужой профиль, если ты не админ
    if not is_admin and real_target_id != real_admin_id:
        raise HTTPException(status_code=403, detail="Нет прав")

    # Админы могут редактировать ФИО, роль и бригаду
    if is_admin and fio and role:
        await db.update_user_profile_data(real_target_id, fio, role)
        profile = await db.get_user_full_profile(real_target_id)
        if profile['member_id']:
            if team_id > 0:
                await db.conn.execute("UPDATE team_members SET team_id = ?, position = ? WHERE id = ?",
                                      (team_id, position, profile['member_id']))
            else:
                await db.conn.execute("DELETE FROM team_members WHERE id = ?", (profile['member_id'],))
        elif team_id > 0:
            await db.conn.execute("INSERT INTO team_members (team_id, fio, position, tg_id) VALUES (?, ?, ?, ?)",
                                  (team_id, fio, position, real_target_id))

    # Любой пользователь может обновить свою ссылку MAX
    try:
        await db.conn.execute("ALTER TABLE users ADD COLUMN max_invite_link TEXT")
    except:
        pass
    await db.conn.execute("UPDATE users SET max_invite_link = ? WHERE user_id = ?", (max_invite_link, real_target_id))

    await db.conn.commit()
    return {"status": "ok"}


@router.post("/api/users/{target_id}/delete")
async def api_delete_user(target_id: int, tg_id: int = Form(...)):
    admin = await db.get_user(tg_id)
    if not admin or dict(admin).get('role') not in ['superadmin', 'boss', 'moderator']: raise HTTPException(403,
                                                                                                            "Нет прав")
    real_target_id = await resolve_id(target_id)
    try:
        await db.conn.execute("DELETE FROM users WHERE user_id = ?", (real_target_id,))
        await db.conn.execute("DELETE FROM team_members WHERE tg_id = ?", (real_target_id,))
        await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE tg_id = ?", (real_target_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}