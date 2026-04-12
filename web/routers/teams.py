import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
from datetime import datetime
from database_deps import db, TZ_BARNAUL
from utils import resolve_id
from services.notifications import notify_users

router = APIRouter(tags=["Teams"])


@router.post("/api/teams/{team_id}/generate_invite")
async def api_generate_invite(team_id: int):
    invite_code, join_password = await db.generate_team_invite(team_id)
    return {
        "invite_link": f"https://miniapp.viks22.ru/invite/{invite_code}",
        "tg_bot_link": f"https://t.me/viksstroy_bot?start=invite_{invite_code}",
        "invite_code": invite_code,
        "join_password": join_password
    }


@router.get("/api/invite/{invite_code}")
async def api_get_invite_info(invite_code: str):
    team = await db.get_team_by_invite(invite_code)
    if not team: raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return {"team_name": team['name'],
            "unclaimed_workers": [{"id": w['id'], "fio": w['fio'], "position": w['position']} for w in
                                  await db.get_unclaimed_workers(team['id'])]}


@router.post("/api/invite/join")
async def api_join_team(invite_code: str = Form(...), worker_id: int = Form(...), tg_id: int = Form(...)):
    team = await db.get_team_by_invite(invite_code)
    real_tg_id = await resolve_id(tg_id)
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

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    await notify_users(["report_group", "boss", "superadmin"],
                       f"🔗 <b>Привязка аккаунта (Бригада)</b>\n👤 Рабочий: {fio}\n🏗 Добавлен в бригаду: «{team['name']}»\n🕒 Время: {now}",
                       "teams", category="new_users")
    return {"status": "ok"}


@router.post("/api/teams/create")
async def create_team(name: str = Form(...), tg_id: int = Form(0), fio: str = Form("Пользователь")):
    cursor = await db.conn.execute("INSERT INTO teams (name) VALUES (?)", (name,))
    new_team_id = cursor.lastrowid
    await db.conn.commit()

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    await notify_users(["report_group", "boss", "superadmin"],
                       f"🏗 <b>Новая бригада</b>\n👤 Создал: {fio}\n📍 Название: «{name}»\n🕒 Время: {now}", "teams", category="orders")
    real_tg_id = await resolve_id(tg_id) if tg_id else 0
    await db.add_log(real_tg_id, fio, f"Создал бригаду: {name}", target_type='team', target_id=new_team_id)
    return {"status": "ok"}


@router.get("/api/teams/{team_id}/details")
async def get_team_details(team_id: int):
    async with db.conn.execute("SELECT name FROM teams WHERE id = ?",
                               (team_id,)) as cur: team_row = await cur.fetchone()
    async with db.conn.execute(
            "SELECT id, fio, position, tg_user_id, is_foreman FROM team_members WHERE team_id = ? ORDER BY is_foreman DESC, id ASC",
            (team_id,)) as cur:
        members = [{"id": r[0], "fio": r[1], "position": r[2], "is_linked": bool(r[3]), "is_foreman": bool(r[4])} for r
                   in await cur.fetchall()]
    return {"id": team_id, "name": team_row[0], "members": members}


@router.post("/api/teams/{team_id}/members/add")
async def add_team_member(team_id: int, fio: str = Form(...), position: str = Form(...), is_foreman: int = Form(0),
                          tg_id: int = Form(0)):
    await db.conn.execute("INSERT INTO team_members (team_id, fio, position, is_foreman) VALUES (?, ?, ?, ?)",
                          (team_id, fio, position, is_foreman))
    await db.conn.commit()
    real_tg_id = await resolve_id(tg_id) if tg_id else 0
    user = await db.get_user(real_tg_id) if real_tg_id else None
    admin_fio = dict(user).get('fio', 'Система') if user else 'Система'
    await db.add_log(real_tg_id, admin_fio, f"Добавил участника «{fio}» в бригаду №{team_id}", target_type='team', target_id=team_id)
    return {"status": "ok"}


@router.post("/api/teams/members/{member_id}/toggle_foreman")
async def toggle_foreman(member_id: int, is_foreman: int = Form(...), tg_id: int = Form(0)):
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
async def unlink_team_member(member_id: int, tg_id: int = Form(0)):
    user = await db.get_user(tg_id)
    # Добавил 'foreman' в проверку прав
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator', 'foreman']:
        raise HTTPException(status_code=403, detail="Нет прав")
    try:
        await db.conn.execute("UPDATE team_members SET tg_user_id = NULL WHERE id = ?", (member_id,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


@router.post("/api/teams/members/{member_id}/delete")
async def delete_team_member(member_id: int, tg_id: int = Form(0)):
    async with db.conn.execute("SELECT team_id, fio FROM team_members WHERE id = ?", (member_id,)) as cur:
        m_row = await cur.fetchone()
    m_team_id = m_row[0] if m_row else 0
    m_fio = m_row[1] if m_row else ''
    await db.conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
    await db.conn.commit()
    real_tg_id = await resolve_id(tg_id) if tg_id else 0
    user = await db.get_user(real_tg_id) if real_tg_id else None
    admin_fio = dict(user).get('fio', 'Система') if user else 'Система'
    await db.add_log(real_tg_id, admin_fio, f"Удалил участника «{m_fio}» из бригады №{m_team_id}", target_type='team', target_id=m_team_id)
    return {"status": "ok"}


@router.post("/api/teams/{team_id}/delete")
async def delete_entire_team(team_id: int, tg_id: int = Form(0)):
    user = await db.get_user(tg_id)
    # Удаление всей бригады по-прежнему доступно только руководству!
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']: raise HTTPException(
        status_code=403, detail="Нет прав")
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
    await db.add_log(tg_id, dict(user).get('fio', 'Система'), f"Удалил бригаду «{t_name}»", target_type='team', target_id=team_id)
    return {"status": "ok"}