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
    profile = await db.get_user_full_profile(real_target_id)
    if not profile: raise HTTPException(status_code=404, detail="Пользователь не найден")

    async with db.conn.execute("SELECT secondary_id FROM account_links WHERE primary_id = ?", (real_target_id,)) as cur:
        rows = await cur.fetchall()

    linked_ids = [r[0] for r in rows]
    has_tg = (real_target_id > 0) or any(sid > 0 for sid in linked_ids)
    has_max = (real_target_id < 0) or any(sid < 0 for sid in linked_ids)

    return {
        "profile": dict(profile),
        "logs": await db.get_specific_user_logs(real_target_id),
        "links": {
            "has_tg": has_tg,
            "has_max": has_max,
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
async def api_update_profile(target_id: int, tg_id: int = Form(...), fio: str = Form(...), role: str = Form(...),
                             team_id: int = Form(0), position: str = Form("")):
    admin = await db.get_user(tg_id)
    if not admin or admin['role'] not in ['superadmin', 'boss', 'moderator']: raise HTTPException(status_code=403,
                                                                                                  detail="Нет прав")
    real_target_id = await resolve_id(target_id)
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