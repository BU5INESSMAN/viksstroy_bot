import sys
import os
import json
import logging
import asyncio

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
from database_deps import db
from utils import resolve_id, get_all_linked_ids
from services.user_service import delete_user_cascade, unlink_user_platform, can_change_role
from services.account_link_service import link_account, admin_link_accounts
from services.notifications import notify_users
from auth_deps import get_current_user, require_role
from utils_fio import format_fio, merge_user_settings, get_user_settings

logger = logging.getLogger("USERS")

# Mirror of frontend roleConfig.js for log + notification messages
ROLE_NAMES_RU = {
    'superadmin': 'Супер-Админ',
    'boss': 'Руководитель',
    'moderator': 'Модератор',
    'foreman': 'Прораб',
    'brigadier': 'Бригадир',
    'worker': 'Рабочий',
    'driver': 'Водитель',
}

router = APIRouter(tags=["Users"])

_require_office = require_role("superadmin", "boss", "moderator")
_require_boss_plus = require_role("superadmin", "boss")


@router.get("/api/users")
async def get_users(current_user=Depends(_require_office)):
    """List all users. Office (moderator+) only."""
    async with db.conn.execute(
        "SELECT user_id, fio, last_name, first_name, middle_name, specialty, "
        "role, is_blacklisted, linked_user_id, avatar_url FROM users"
    ) as cur:
        users = []
        for r in await cur.fetchall():
            user_id = r[0]
            linked_uid = r[8]

            linked_platform = None
            if linked_uid is not None:
                linked_platform = "TG" if linked_uid > 0 else "MAX"

            own_platform = "TG" if user_id > 0 else "MAX"
            platforms = [own_platform]
            if linked_uid is not None:
                other_platform = "TG" if linked_uid > 0 else "MAX"
                if other_platform not in platforms:
                    platforms.append(other_platform)

            users.append({
                "user_id": user_id,
                "fio": r[1] or "",
                "last_name": r[2] or "",
                "first_name": r[3] or "",
                "middle_name": r[4] or "",
                "specialty": r[5] or "",
                "role": r[6] or "",
                "is_blacklisted": r[7],
                "linked_user_id": linked_uid,
                "linked_platform": linked_platform,
                "platforms": platforms,
                "avatar_url": r[9] or "",
            })
        return users


@router.get("/api/users/{target_id}/profile")
async def get_profile(target_id: int, member_id: int = 0, equip_id: int = 0,
                      current_user=Depends(get_current_user)):
    """Get user profile. Self or office can view registered profiles.
    member_id/equip_id lookups for unregistered workers/drivers also allowed.
    """
    if target_id != 0:
        real_tg_id = await resolve_id(target_id)
        async with db.conn.execute(
                "SELECT user_id, fio, last_name, first_name, middle_name, specialty, settings, "
                "role, avatar_url, notify_tg, notify_max, notify_new_users, notify_orders, "
                "notify_reports, notify_errors, notify_exchange FROM users WHERE user_id = ?",
                (real_tg_id,)) as cur:
            row = await cur.fetchone()

        if row:
            profile = {
                "user_id": row[0],
                "fio": row[1] or "",
                "last_name": row[2] or "",
                "first_name": row[3] or "",
                "middle_name": row[4] or "",
                "specialty": row[5] or "",
                "settings": get_user_settings(row[6]),
                "role": row[7],
                "avatar_url": row[8],
                "notify_tg": row[9] if row[9] is not None else 1,
                "notify_max": row[10] if row[10] is not None else 1,
                "notify_new_users": row[11] if row[11] is not None else 1,
                "notify_orders": row[12] if row[12] is not None else 1,
                "notify_reports": row[13] if row[13] is not None else 1,
                "notify_errors": row[14] if row[14] is not None else 1,
                "notify_exchange": row[15] if row[15] is not None else 1,
            }

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
                    profile["equip_id"] = eq[0]
                    if not profile.get("position"):
                        profile["position"] = eq[2] or ''

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
async def update_profile(target_id: int, fio: str = Form(...), role: str = Form(""),
                         team_id: str = Form(""), position: str = Form(""), max_invite_link: str = Form(""),
                         notify_tg: int = Form(1), notify_max: int = Form(1),
                         notify_new_users: int = Form(1), notify_orders: int = Form(1),
                         notify_reports: int = Form(1), notify_errors: int = Form(1),
                         notify_exchange: int = Form(1),
                         current_user=Depends(get_current_user)):
    """Update user profile. Users can edit own fio/notifications.
    Only boss+ can change roles. Self-role escalation is blocked.
    """
    current_role = current_user.get("role")
    is_self = current_user["user_id"] == target_id
    is_admin = current_role in ("superadmin", "boss")
    is_moderator = current_role in ("superadmin", "boss", "moderator")

    if not is_self and not is_moderator:
        raise HTTPException(403, "Нет прав для изменения этого профиля")

    target_user = await db.get_user(target_id)
    if not target_user:
        raise HTTPException(404, "Пользователь не найден")
    existing_role = dict(target_user).get("role", "worker")

    if role and is_admin and not is_self:
        allowed_roles = {"superadmin", "boss", "moderator", "foreman", "brigadier", "worker", "driver"}
        if role not in allowed_roles:
            raise HTTPException(400, "Недопустимая роль")
        if role == "superadmin" and current_role != "superadmin":
            raise HTTPException(403, "Только superadmin может назначать superadmin")
        effective_role = role
    else:
        effective_role = existing_role

    try:
        await db.conn.execute(
            "UPDATE users SET fio=?, role=?, notify_tg=?, notify_max=?, notify_new_users=?, notify_orders=?, notify_reports=?, notify_errors=?, notify_exchange=? WHERE user_id=?",
            (fio, effective_role, notify_tg, notify_max, notify_new_users, notify_orders, notify_reports, notify_errors, notify_exchange, target_id)
        )

        await db.conn.execute(
            "UPDATE team_members SET fio=?, position=?, max_invite_link=? WHERE tg_user_id=?",
            (fio, position, max_invite_link, target_id)
        )

        await db.conn.commit()
    except Exception:
        await db.conn.rollback()
        raise HTTPException(500, "Ошибка сохранения профиля")

    await db.add_log(current_user["user_id"], current_user.get("fio", ""), f"Обновил профиль пользователя {fio}", target_type='user', target_id=target_id)
    return {"status": "ok"}


@router.post("/api/users/{target_id}/update_avatar")
async def update_avatar(target_id: int, avatar_base64: str = Form(...),
                        current_user=Depends(get_current_user)):
    """Update user avatar. Self or office."""
    is_self = current_user["tg_id"] == target_id
    is_office = current_user.get("role") in ("superadmin", "boss", "moderator")
    if not is_self and not is_office:
        raise HTTPException(403, "Нет прав")

    from services.image_service import process_base64_image
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
async def delete_user(target_id: int, current_user=Depends(_require_boss_plus)):
    """Delete user with cascade. Boss+ only."""
    if current_user["tg_id"] == target_id:
        raise HTTPException(400, "Нельзя удалить свой собственный аккаунт")

    target = await db.get_user(target_id)
    if target and dict(target).get("role") == "superadmin" and current_user.get("role") != "superadmin":
        raise HTTPException(403, "Только superadmin может удалить superadmin")

    await delete_user_cascade(current_user["tg_id"], target_id)

    await db.add_log(current_user["tg_id"], current_user.get("fio", "Система"),
                     f"Удалил пользователя #{target_id}", target_type='user', target_id=target_id)
    return {"status": "ok"}


@router.post("/api/users/unlink_platform")
async def unlink_platform(platform: str = Form(...), current_user=Depends(get_current_user)):
    """Unlink a platform (TG or MAX) from own account."""
    await unlink_user_platform(current_user["tg_id"], platform)
    return {"status": "ok"}


# =============================================
# Account linking
# =============================================

class LinkAccountRequest(BaseModel):
    link_code: str


class AdminLinkRequest(BaseModel):
    user_id_1: int
    user_id_2: int


@router.post("/api/users/link-account")
async def link_account_v2(body: LinkAccountRequest, current_user=Depends(get_current_user)):
    """Связывание аккаунтов через одноразовый код."""
    return await link_account(current_user["tg_id"], body.link_code)


@router.post("/api/users/admin-link")
async def admin_link(body: AdminLinkRequest, current_user=Depends(_require_boss_plus)):
    """Принудительное связывание аккаунтов администратором."""
    return await admin_link_accounts(current_user["tg_id"], body.user_id_1, body.user_id_2)


@router.get("/api/users/{user_id}/linked")
async def get_linked_account(user_id: int, current_user=Depends(get_current_user)):
    """Возвращает информацию о связанном аккаунте."""
    real_id = await resolve_id(user_id)
    user = await db.get_user(real_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    user_dict = dict(user)
    linked_uid = user_dict.get('linked_user_id')

    if linked_uid is None:
        return {"linked": False}

    linked_user = await db.get_user(linked_uid)
    if not linked_user:
        return {"linked": False}

    linked_dict = dict(linked_user)
    linked_platform = "TG" if linked_uid > 0 else "MAX"

    is_primary = user_dict.get('role') != 'linked'

    return {
        "linked": True,
        "linked_user_id": linked_uid,
        "linked_fio": linked_dict.get('fio', ''),
        "linked_platform": linked_platform,
        "primary": is_primary,
    }


# =============================================
# Stage 2: unified user update endpoint
# =============================================

class UpdateUserRequest(BaseModel):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    specialty: Optional[str] = None
    settings: Optional[dict] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None
    max_invite_link: Optional[str] = None


SELF_EDITABLE_FIELDS = {
    "last_name", "first_name", "middle_name",
    "specialty", "avatar_url", "max_invite_link", "settings",
}


@router.patch("/api/users/{user_id}")
async def update_user(user_id: int, body: UpdateUserRequest, current_user=Depends(get_current_user)):
    """Unified user update. Covers own-profile edits and admin role changes.

    - self can edit: last/first/middle name, specialty, avatar, max_invite_link, settings
    - self CANNOT change own role (explicitly rejected via can_change_role)
    - moderator+ can edit any user's non-role fields
    - role changes go through can_change_role() (boss/superadmin only)
    """
    target_id = await resolve_id(user_id)
    target_row = await db.get_user(target_id)
    if not target_row:
        raise HTTPException(404, "Пользователь не найден")
    target = dict(target_row)

    actor_id = current_user["user_id"]
    is_self = actor_id == target_id
    actor_role = current_user.get("role")
    is_office = actor_role in ("superadmin", "boss", "moderator")

    requested = body.model_dump(exclude_none=True)
    if not requested:
        return {"status": "ok", "user": _user_public(target)}

    if is_self:
        disallowed = set(requested.keys()) - SELF_EDITABLE_FIELDS
        if disallowed:
            raise HTTPException(403, f"Нельзя менять: {', '.join(sorted(disallowed))}")
    elif not is_office:
        raise HTTPException(403, "Нет прав для изменения этого профиля")

    updates: dict = {}
    name_changed = False
    old_role = target.get("role", "")
    role_changed_to = None

    # Names
    for field in ("last_name", "first_name", "middle_name"):
        if field in requested:
            updates[field] = (requested[field] or "").strip()
            name_changed = True

    # Recompute fio for backward compatibility if any name part changed
    if name_changed:
        ln = updates.get("last_name", target.get("last_name") or "")
        fn = updates.get("first_name", target.get("first_name") or "")
        mn = updates.get("middle_name", target.get("middle_name") or "")
        updates["fio"] = format_fio(ln, fn, mn)

    if "specialty" in requested:
        updates["specialty"] = (requested["specialty"] or "").strip()

    if "avatar_url" in requested:
        updates["avatar_url"] = requested["avatar_url"] or ""

    if "settings" in requested:
        merged = merge_user_settings(target.get("settings") or "{}", requested["settings"] or {})
        updates["settings"] = merged

    # Role changes — authorized via can_change_role
    if "role" in requested and requested["role"] != old_role:
        allowed, reason = await can_change_role(current_user, target, requested["role"], db)
        if not allowed:
            raise HTTPException(403, reason)
        updates["role"] = requested["role"]
        role_changed_to = requested["role"]

    # Write to users table
    if updates:
        fields = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [target_id]
        try:
            await db.conn.execute(f"UPDATE users SET {fields} WHERE user_id = ?", values)
        except Exception as e:
            logger.error(f"User {target_id} update failed: {e}")
            raise HTTPException(500, "Ошибка сохранения профиля")

    # Keep team_members in sync for max_invite_link (stored there)
    if "max_invite_link" in requested:
        try:
            await db.conn.execute(
                "UPDATE team_members SET max_invite_link = ? WHERE tg_user_id = ?",
                ((requested["max_invite_link"] or "").strip(), target_id),
            )
        except Exception:
            pass

    # Keep team_members.fio in sync when the user FIO is edited
    if name_changed and "fio" in updates:
        try:
            await db.conn.execute(
                "UPDATE team_members SET fio = ? WHERE tg_user_id = ? OR tg_id = ?",
                (updates["fio"], target_id, target_id),
            )
        except Exception:
            pass

    await db.conn.commit()

    logger.info(f"User {target_id} updated: fields={list(updates.keys())}")

    # Audit log
    actor_fio = current_user.get("fio", "")
    if role_changed_to:
        old_ru = ROLE_NAMES_RU.get(old_role, old_role)
        new_ru = ROLE_NAMES_RU.get(role_changed_to, role_changed_to)
        target_fio = updates.get("fio") or target.get("fio", f"#{target_id}")
        await db.add_log(
            actor_id, actor_fio,
            f"Изменил роль {target_fio}: {old_ru} → {new_ru}",
            target_type='user', target_id=target_id,
        )
        # Background DM notification to the target user
        try:
            msg = f"Ваша роль изменена: <b>{new_ru}</b>. Изменил: {actor_fio or 'Администратор'}"
            asyncio.create_task(
                notify_users([], msg, "dashboard", extra_tg_ids=[target_id], category=None)
            )
        except Exception:
            pass
    elif updates:
        await db.add_log(
            actor_id, actor_fio,
            f"Обновил профиль пользователя {updates.get('fio') or target.get('fio', f'#{target_id}')}",
            target_type='user', target_id=target_id,
        )

    # Return updated user
    refreshed = await db.get_user(target_id)
    return {"status": "ok", "user": _user_public(dict(refreshed) if refreshed else target)}


@router.get("/api/users/me")
async def get_me(current_user=Depends(get_current_user)):
    """Current-user snapshot with parsed settings."""
    return {"user": _user_public(current_user)}


@router.patch("/api/users/me/settings")
async def update_my_settings(patch: dict, current_user=Depends(get_current_user)):
    """Convenience endpoint used by the /settings page — merges a partial
    patch into the current user's settings JSON."""
    new_json = merge_user_settings(current_user.get('settings') or '{}', patch or {})
    await db.update_user_settings(current_user["user_id"], new_json)
    logger.info(f"User {current_user['user_id']} settings updated: keys={list((patch or {}).keys())}")
    return {"settings": json.loads(new_json)}


def _user_public(user: dict) -> dict:
    """Serialize a user dict for API responses — parses settings, adds fio_parts."""
    if not user:
        return {}
    settings = get_user_settings(user.get('settings') or '{}')
    return {
        "user_id": user.get("user_id"),
        "fio": user.get("fio") or "",
        "last_name": user.get("last_name") or "",
        "first_name": user.get("first_name") or "",
        "middle_name": user.get("middle_name") or "",
        "specialty": user.get("specialty") or "",
        "role": user.get("role") or "",
        "avatar_url": user.get("avatar_url") or "",
        "is_blacklisted": int(user.get("is_blacklisted") or 0),
        "linked_user_id": user.get("linked_user_id"),
        "settings": settings,
    }


@router.put("/api/users/{user_id}/role")
async def set_user_role(user_id: int, role: str = Form(...),
                        current_user=Depends(get_current_user)):
    """Установка роли пользователя. Только boss+ может менять роли."""
    if current_user.get("role") not in ("superadmin", "boss"):
        raise HTTPException(403, "Недостаточно прав")

    if role == "superadmin" and current_user["role"] != "superadmin":
        raise HTTPException(403, "Только superadmin может назначать superadmin")

    valid_roles = ['superadmin', 'boss', 'moderator', 'foreman', 'brigadier', 'worker', 'driver']
    if role not in valid_roles:
        raise HTTPException(400, f"Недопустимая роль: {role}")

    await db.conn.execute("UPDATE users SET role = ? WHERE user_id = ?", (role, user_id))
    await db.conn.commit()

    admin_fio = current_user.get("fio", "Админ")
    _target_fio = ''
    try:
        _tu = await db.get_user(user_id)
        if _tu: _target_fio = dict(_tu).get('fio', '')
    except Exception:
        pass
    await db.add_log(current_user["user_id"], admin_fio,
                     f"Изменил роль {_target_fio or f'#{user_id}'}: {role}",
                     target_type='user', target_id=user_id)

    return {"status": "ok", "user_id": user_id, "role": role}
