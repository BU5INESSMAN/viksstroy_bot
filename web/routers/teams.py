import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import asyncio
import logging
from datetime import datetime
from database_deps import db, TZ_BARNAUL
from auth_deps import get_current_user, require_role
from utils import normalize_invite_code
from services.notifications import notify_users

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Teams"])

_require_office = require_role("superadmin", "boss", "moderator")


@router.post("/api/teams/{team_id}/generate_invite")
async def api_generate_invite(team_id: int, current_user=Depends(get_current_user)):
    invite_code, join_password = await db.generate_team_invite(team_id)
    return {
        "invite_link": f"https://miniapp.viks22.ru/invite/{invite_code}",
        "tg_bot_link": f"https://t.me/viksstroy_bot?start=invite_{invite_code}",
        "invite_code": invite_code,
        "join_password": join_password
    }


@router.get("/api/invite/{invite_code}")
async def api_get_invite_info(invite_code: str):
    """Public endpoint — returns team name + unclaimed workers for invite page."""
    team = await db.get_team_by_invite(invite_code)
    if not team: raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return {"team_name": team['name'],
            "unclaimed_workers": [{"id": w['id'], "fio": w['fio'], "position": w['position']} for w in
                                  await db.get_unclaimed_workers(team['id'])]}


@router.post("/api/invite/join")
async def api_join_team(invite_code: str = Form(...), worker_id: int = Form(...),
                        current_user=Depends(get_current_user)):
    real_tg_id = current_user["tg_id"]
    invite_code = normalize_invite_code(invite_code)
    team = await db.get_team_by_invite(invite_code)
    if not team:
        raise HTTPException(404, "Ссылка недействительна")

    await db.conn.execute("UPDATE team_members SET tg_user_id = ? WHERE id = ?", (real_tg_id, worker_id))
    user = await db.get_user(real_tg_id)
    async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
        w_row = await cur.fetchone()
        fio = w_row[0] if w_row else f"Рабочий {real_tg_id}"
    if not user:
        await db.add_user(real_tg_id, fio, "worker")
    elif user['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
        await db.update_user_role(real_tg_id, "worker")
    await db.conn.commit()

    try:
        team_name = dict(team).get('name', f'#{dict(team).get("id", "?")}') if team else '?'
        await db.add_log(real_tg_id, fio, f"Привязан к бригаде «{team_name}» по приглашению", target_type='team', target_id=dict(team).get('id') if team else 0)
    except Exception:
        pass

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_join_notification():
        try:
            await notify_users(["report_group", "boss", "superadmin"],
                               f"🔗 <b>Привязка аккаунта (Бригада)</b>\n👤 Рабочий: {fio}\n🏗 Добавлен в бригаду: «{team['name']}»\n🕒 Время: {now}",
                               "teams", category="new_users")
        except Exception as e:
            logger.error(f"Team join notification error: {e}")

    asyncio.create_task(_send_join_notification())
    return {"status": "ok"}


@router.post("/api/teams/create")
async def create_team(name: str = Form(...), current_user=Depends(_require_office)):
    fio = current_user.get("fio", "Пользователь")
    tg_id = current_user["tg_id"]

    cursor = await db.conn.execute("INSERT INTO teams (name, creator_id) VALUES (?, ?)", (name, tg_id))
    new_team_id = cursor.lastrowid
    await db.conn.commit()

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_create_team_notification():
        try:
            await notify_users(["report_group", "boss", "superadmin"],
                               f"🏗 <b>Новая бригада</b>\n👤 Создал: {fio}\n📍 Название: «{name}»\n🕒 Время: {now}", "teams", category="orders")
        except Exception as e:
            logger.error(f"Team create notification error: {e}")

    asyncio.create_task(_send_create_team_notification())
    await db.add_log(tg_id, fio, f"Создал бригаду: {name}", target_type='team', target_id=new_team_id)
    return {"status": "ok"}


@router.get("/api/teams/{team_id}/details")
async def get_team_details(
    team_id: int,
    date: str | None = None,
    exclude_app_id: int | None = None,
    current_user=Depends(get_current_user),
):
    """Team + members. When ``date`` is provided, each member carries
    availability flags derived from OTHER applications on that date:

      - ``is_used``          — member is booked in another app that date.
      - ``used_in_app_id``   — the app id that booked them.
      - ``used_in_object``   — object name / address from that app.

    ``exclude_app_id`` lets the edit flow ignore the current application
    (otherwise an edit would always see its own members as "used").
    Apps that pick the whole team (no ``selected_members``) mark every
    member of the team as used for that date.
    """
    async with db.conn.execute("SELECT name, icon FROM teams WHERE id = ?",
                               (team_id,)) as cur: team_row = await cur.fetchone()
    if not team_row:
        raise HTTPException(404, "Бригада не найдена")
    async with db.conn.execute(
            "SELECT id, fio, position, tg_user_id, is_foreman, status, status_from, status_until, status_reason FROM team_members WHERE team_id = ? ORDER BY is_foreman DESC, id ASC",
            (team_id,)) as cur:
        members = [{
            "id": r[0], "fio": r[1], "position": r[2], "is_linked": bool(r[3]), "is_foreman": bool(r[4]),
            "status": r[5] or "available", "status_from": r[6] or "", "status_until": r[7] or "", "status_reason": r[8] or "",
            "is_used": False, "used_in_app_id": None, "used_in_object": "",
        } for r in await cur.fetchall()]

    if date:
        # Pull every active app on that date that references this team.
        params: list = [date]
        q = (
            "SELECT a.id, a.team_id, a.selected_members, "
            "       COALESCE(o.name, a.object_address, '') AS obj_name "
            "FROM applications a "
            "LEFT JOIN objects o ON o.id = a.object_id "
            "WHERE a.date_target = ? "
            "  AND a.status NOT IN ('rejected', 'cancelled', 'archived') "
            "  AND (a.is_team_freed = 0 OR a.is_team_freed IS NULL)"
        )
        if exclude_app_id:
            q += " AND a.id != ?"
            params.append(exclude_app_id)
        async with db.conn.execute(q, params) as cur:
            rows = await cur.fetchall()

        usage: dict[int, dict] = {}  # member_id → {app_id, object_name}
        all_team_member_ids = [m["id"] for m in members]

        for r in rows:
            other_app_id = r[0]
            other_team_raw = str(r[1] or "")
            other_selected_raw = str(r[2] or "")
            other_obj = r[3] or ""

            team_ids_on_other = {
                int(p) for p in other_team_raw.split(",")
                if p.strip().isdigit()
            }
            if team_id not in team_ids_on_other:
                continue

            # Parse selected_members — empty = whole-team semantics.
            picked: set[int] = set()
            for p in other_selected_raw.split(","):
                p = p.strip()
                if p.isdigit():
                    picked.add(int(p))

            if picked:
                touched = picked
            else:
                # Whole team — everyone on this team is considered used.
                touched = set(all_team_member_ids)

            for mid in touched:
                if mid in usage:
                    continue  # first hit wins (stable ordering)
                usage[mid] = {"app_id": other_app_id, "object_name": other_obj}

        for m in members:
            info = usage.get(m["id"])
            if info:
                m["is_used"] = True
                m["used_in_app_id"] = info["app_id"]
                m["used_in_object"] = info["object_name"] or ""

    return {"id": team_id, "name": team_row[0], "icon": team_row[1] or '', "members": members}


@router.post("/api/teams/{team_id}/members/add")
async def add_team_member(team_id: int, fio: str = Form(...), position: str = Form(...), is_foreman: int = Form(0),
                          current_user=Depends(get_current_user)):
    role = current_user.get("role")
    is_office = role in ("superadmin", "boss", "moderator")
    if not is_office and role != "foreman":
        raise HTTPException(403, "Недостаточно прав")

    await db.conn.execute("INSERT INTO team_members (team_id, fio, position, is_foreman) VALUES (?, ?, ?, ?)",
                          (team_id, fio, position, is_foreman))
    await db.conn.commit()

    admin_fio = current_user.get("fio", "Система")
    _t_name = f"#{team_id}"
    try:
        async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,)) as c:
            r = await c.fetchone()
            if r: _t_name = r[0]
    except Exception: pass
    await db.add_log(current_user["tg_id"], admin_fio, f"Добавил участника «{fio}» в бригаду «{_t_name}»", target_type='team', target_id=team_id)
    return {"status": "ok"}


@router.post("/api/teams/members/{member_id}/toggle_foreman")
async def toggle_foreman(member_id: int, is_foreman: int = Form(...), current_user=Depends(get_current_user)):
    role = current_user.get("role")
    is_office = role in ("superadmin", "boss", "moderator")
    if not is_office and role != "foreman":
        raise HTTPException(403, "Недостаточно прав")

    await db.conn.execute("UPDATE team_members SET is_foreman = ? WHERE id = ?", (is_foreman, member_id))
    # Update global user role in DB
    async with db.conn.execute("SELECT tg_user_id FROM team_members WHERE id = ?", (member_id,)) as cur:
        row = await cur.fetchone()
    if row and row[0]:
        member_tg_id = row[0]
        if is_foreman:
            await db.update_user_role(member_tg_id, "brigadier")
        else:
            # Only downgrade to worker if not a foreman in any other team
            async with db.conn.execute(
                "SELECT 1 FROM team_members WHERE tg_user_id = ? AND is_foreman = 1 AND id != ? LIMIT 1",
                (member_tg_id, member_id)
            ) as cur2:
                if not await cur2.fetchone():
                    await db.update_user_role(member_tg_id, "worker")
    await db.conn.commit()
    return {"status": "ok"}


@router.post("/api/teams/members/{member_id}/unlink")
async def unlink_team_member(member_id: int, current_user=Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ('superadmin', 'boss', 'moderator', 'foreman'):
        raise HTTPException(status_code=403, detail="Нет прав")
    try:
        await db.conn.execute("UPDATE team_members SET tg_user_id = NULL WHERE id = ?", (member_id,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(status_code=500, detail="Ошибка при отвязке")
    return {"status": "ok"}


@router.post("/api/teams/members/{member_id}/delete")
async def delete_team_member(member_id: int, current_user=Depends(get_current_user)):
    role = current_user.get("role")
    is_office = role in ("superadmin", "boss", "moderator")
    if not is_office and role != "foreman":
        raise HTTPException(403, "Недостаточно прав")

    async with db.conn.execute("SELECT team_id, fio FROM team_members WHERE id = ?", (member_id,)) as cur:
        m_row = await cur.fetchone()
    m_team_id = m_row[0] if m_row else 0
    m_fio = m_row[1] if m_row else ''
    await db.conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
    await db.conn.commit()

    admin_fio = current_user.get("fio", "Система")
    _t_name = f"#{m_team_id}"
    try:
        async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (m_team_id,)) as c:
            r = await c.fetchone()
            if r: _t_name = r[0]
    except Exception: pass
    await db.add_log(current_user["tg_id"], admin_fio, f"Удалил участника «{m_fio}» из бригады «{_t_name}»", target_type='team', target_id=m_team_id)
    return {"status": "ok"}


@router.post("/api/teams/{team_id}/delete")
async def delete_entire_team(team_id: int, current_user=Depends(_require_office)):
    """Delete entire team. Office (moderator+) only."""
    async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,)) as cur:
        t_row = await cur.fetchone()
        t_name = t_row[0] if t_row else f"ID:{team_id}"
    try:
        await db.conn.execute("DELETE FROM teams WHERE id = ?", (team_id,))
        await db.conn.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
        await db.conn.execute("UPDATE applications SET team_id = '0' WHERE team_id = ?", (str(team_id),))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await db.add_log(current_user["tg_id"], current_user.get('fio', 'Система'), f"Удалил бригаду «{t_name}»", target_type='team', target_id=team_id)
    return {"status": "ok"}


@router.post("/api/teams/members/{member_id}/status")
async def update_member_status(
    member_id: int,
    status: str = Form(...),
    status_from: str = Form(""),
    status_until: str = Form(""),
    status_reason: str = Form(""),
    current_user=Depends(get_current_user),
):
    """Update team member availability status (available / vacation / sick)."""
    role = current_user.get("role")
    if role not in ('foreman', 'moderator', 'boss', 'superadmin'):
        raise HTTPException(403, "Недостаточно прав")

    if status not in ('available', 'vacation', 'sick'):
        raise HTTPException(400, "Недопустимый статус")

    await db.conn.execute(
        "UPDATE team_members SET status=?, status_from=?, status_until=?, status_reason=? WHERE id=?",
        (status, status_from or None, status_until or None, status_reason, member_id),
    )
    await db.conn.commit()

    # Fetch member info for log message
    async with db.conn.execute("SELECT fio, team_id FROM team_members WHERE id = ?", (member_id,)) as cur:
        m_row = await cur.fetchone()
    member_fio = m_row[0] if m_row else f"#{member_id}"
    team_id = m_row[1] if m_row else 0

    team_name = ""
    if team_id:
        async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,)) as cur:
            t_row = await cur.fetchone()
            if t_row: team_name = t_row[0]

    status_labels = {"available": "Доступен", "vacation": "Отпуск", "sick": "Больничный"}
    status_label = status_labels.get(status, status)
    fio = current_user.get('fio', 'Система')
    period = f" ({status_from} — {status_until})" if status_from and status_until and status != 'available' else ""

    await db.add_log(
        current_user["tg_id"], fio,
        f"Изменил статус {member_fio} ({team_name}): {status_label}{period}",
        target_type='team', target_id=team_id,
    )
    return {"status": "ok"}


# =============================================
# Stage 6: team icon update
# =============================================

class TeamPatch(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None


@router.patch("/api/teams/{team_id}")
async def api_update_team(team_id: int, body: TeamPatch, current_user=Depends(_require_office)):
    """Update team name and/or icon. Moderator+ only."""
    updates: dict = {}
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(400, "Имя бригады не может быть пустым")
        updates["name"] = n
    if body.icon is not None:
        updates["icon"] = body.icon.strip() or None

    if not updates:
        return {"status": "ok"}

    fields = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [team_id]
    try:
        await db.conn.execute(f"UPDATE teams SET {fields} WHERE id = ?", values)
        await db.conn.commit()
    except Exception as e:
        logger.error(f"Team {team_id} update failed: {e}")
        raise HTTPException(500, "Ошибка сохранения")

    fio = current_user.get("fio", "")
    await db.add_log(
        current_user["tg_id"], fio,
        f"Обновил бригаду #{team_id}: {list(updates.keys())}",
        target_type="team", target_id=team_id,
    )
    return {"status": "ok", "updates": updates}
