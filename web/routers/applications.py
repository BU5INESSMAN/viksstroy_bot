import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
import json
from database_deps import db
from utils import resolve_id, notify_users, execute_app_publish, fetch_teams_dict, enrich_app_with_team_name

router = APIRouter(tags=["Applications"])


async def ensure_is_team_freed():
    try:
        await db.conn.execute("ALTER TABLE applications ADD COLUMN is_team_freed INTEGER DEFAULT 0")
        await db.conn.commit()
    except:
        pass


async def enrich_app_with_members_data(app_dict):
    selected_m = app_dict.get('selected_members')
    members_list = []
    if selected_m:
        m_ids = [int(x) for x in selected_m.split(',') if x.strip().isdigit()]
        if m_ids:
            pl = ','.join(['?'] * len(m_ids))
            async with db.conn.execute(f"SELECT id, fio, tg_user_id, position FROM team_members WHERE id IN ({pl})",
                                       m_ids) as cur:
                for r in await cur.fetchall():
                    members_list.append({"id": r[0], "fio": r[1], "tg_user_id": r[2], "position": r[3]})
    app_dict['members_data'] = members_list


@router.post("/api/applications/create")
async def create_app(tg_id: int = Form(...), team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form("")):
    await ensure_is_team_freed()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    fio = dict(user).get('fio', 'Web-Пользователь') if user else "Web-Пользователь"
    await db.conn.execute(
        "INSERT INTO applications (foreman_id, foreman_name, team_id, equip_id, date_target, object_address, time_start, time_end, comment, status, selected_members, equipment_data, is_team_freed) VALUES (?, ?, ?, 0, ?, ?, '08', '17', ?, 'waiting', ?, ?, 0)",
        (real_tg_id, fio, team_id, date_target, object_address, comment, selected_members, equipment_data))
    await db.conn.commit()
    await notify_users(["report_group", "moderator"],
                       f"📝 <b>Новая заявка на выезд</b>\n👷‍♂️ Прораб: {fio}\n📍 Объект: {object_address}\n📅 Дата: {date_target}",
                       "review")
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/update")
async def update_app(app_id: int, tg_id: int = Form(...), team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form("")):
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(403)
    async with db.conn.execute("SELECT status FROM applications WHERE id = ?", (app_id,)) as cur:
        row = await cur.fetchone()
        if not row or row[0] != 'waiting': raise HTTPException(400, "Заявка уже в работе или проверена")
    try:
        await db.conn.execute(
            "UPDATE applications SET team_id=?, date_target=?, object_address=?, comment=?, selected_members=?, equipment_data=? WHERE id = ?",
            (team_id, date_target, object_address, comment, selected_members, equipment_data, app_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await db.add_log(real_tg_id, dict(user).get('fio', 'Пользователь'), f"Отредактировал заявку №{app_id}")
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/delete")
async def delete_app(app_id: int, tg_id: int = Form(0)):
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(403, "Нет прав для удаления заявки")

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()

    if not app_row:
        raise HTTPException(404, "Заявка не найдена")

    try:
        app_dict = dict(zip([c[0] for c in cur.description], app_row))
        if app_dict.get('status') in ['approved', 'published', 'in_progress']:
            if app_dict.get('equipment_data'):
                try:
                    eq_list = json.loads(app_dict['equipment_data'])
                    for e in eq_list:
                        await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (e['id'],))
                except:
                    pass

        await db.conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        await db.conn.commit()
        await db.add_log(real_tg_id, dict(user).get('fio', 'Админ'),
                         f"Полностью удалил заявку №{app_id} (Объект: {app_dict.get('object_address')})")
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка удаления: {e}")

    return {"status": "ok"}


@router.get("/api/applications/review")
async def get_review_apps():
    await ensure_is_team_freed()
    teams_dict = await fetch_teams_dict()
    async with db.conn.execute(
            "SELECT * FROM applications WHERE status IN ('waiting', 'approved', 'published', 'in_progress') ORDER BY id DESC") as cursor:
        rows = await cursor.fetchall()
    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
        await enrich_app_with_members_data(app_dict)
        eq_data_str = app_dict.get('equipment_data', '')
        equip_text = ""
        if eq_data_str:
            try:
                eq_list = json.loads(eq_data_str)
                if eq_list: equip_text = ", ".join(
                    [f"{e['name']} ({e['time_start']}:00-{e['time_end']}:00)" for e in eq_list])
            except:
                pass
        app_dict['formatted_equip'] = equip_text or "Не требуется"
        result.append(app_dict)
    return result


@router.post("/api/applications/{app_id}/review")
async def review_app(app_id: int, new_status: str = Form(...), reason: str = Form(""), tg_id: int = Form(0)):
    if new_status not in ['approved', 'rejected', 'completed']: raise HTTPException(400, "Неверный статус")
    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()
    if not app_row: raise HTTPException(404, "Заявка не найдена")
    app_dict = dict(zip([c[0] for c in cur.description], app_row))
    user = await db.get_user(tg_id)
    mod_fio = dict(user).get('fio', 'Модератор') if user else 'Модератор'

    try:
        if new_status == 'approved':
            await db.conn.execute(
                "UPDATE applications SET status = ?, approved_by = ?, approved_by_id = ? WHERE id = ?",
                (new_status, mod_fio, tg_id, app_id))
        else:
            await db.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (new_status, app_id))

        if new_status in ['completed', 'rejected']:
            if app_dict.get('equipment_data'):
                try:
                    eq_list = json.loads(app_dict['equipment_data'])
                    for e in eq_list: await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?",
                                                            (e['id'],))
                except:
                    pass
        await db.conn.commit()
    except:
        await db.conn.rollback()

    status_ru = "✅ Одобрена" if new_status == 'approved' else (
        "❌ Отклонена / Отозвана" if new_status == 'rejected' else "🏁 Досрочно завершена")
    msg_group = f"📋 <b>Заявка №{app_id} {status_ru}</b>\n👤 Кто: {mod_fio}\n📍 Объект: {app_dict['object_address']}"
    if reason: msg_group += f"\n💬 Причина: {reason}"
    await notify_users(["report_group"], msg_group, "review")

    if new_status in ['approved', 'rejected']:
        msg_foreman = f"🔔 <b>Ваша заявка {status_ru}!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
        if reason: msg_foreman += f"\n💬 Причина: {reason}"
        await notify_users([], msg_foreman, "dashboard", extra_tg_ids=[app_dict['foreman_id']])
    return {"status": "ok"}


@router.post("/api/applications/publish")
async def publish_apps(app_ids: str = Form(...), tg_id: int = Form(0)):
    ids = [int(x) for x in app_ids.split(',') if x.strip().isdigit()]
    if not ids: raise HTTPException(400, "Нет выбранных заявок")
    pl = ','.join(['?'] * len(ids))
    async with db.conn.execute(f"SELECT * FROM applications WHERE status = 'approved' AND id IN ({pl})", ids) as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    if not apps: raise HTTPException(status_code=400, detail="Заявки не найдены")

    count = 0
    for app_dict in apps:
        if await execute_app_publish(app_dict): count += 1

    user = await db.get_user(tg_id)
    await db.add_log(tg_id, dict(user).get('fio', 'Руководство') if user else "Руководство",
                     f"Опубликовал {count} нарядов в группу")
    return {"status": "ok", "published": count}


@router.get("/api/applications/active")
async def get_active_app(tg_id: int):
    await ensure_is_team_freed()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: return []
    role = dict(user).get('role')
    if role in ['superadmin', 'boss', 'moderator']: return []

    teams_dict = await fetch_teams_dict()
    async with db.conn.execute(
            "SELECT * FROM applications WHERE status IN ('approved', 'published', 'in_progress') ORDER BY date_target ASC") as cursor:
        rows = await cursor.fetchall()

    result = []
    for row in rows:
        app_dict = dict(zip([col[0] for col in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
        await enrich_app_with_members_data(app_dict)
        involved = False

        if role == 'foreman' and app_dict['foreman_id'] == real_tg_id: involved = True
        if role in ['worker', 'foreman']:
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (real_tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0]:
                    t_ids = [int(x) for x in str(app_dict['team_id']).split(',') if x.strip().isdigit()]
                    if tm_row[0] in t_ids: involved = True
        if role in ['driver']:
            async with db.conn.execute("SELECT id FROM equipment WHERE tg_id = ?", (real_tg_id,)) as cur:
                eq_row = await cur.fetchone()
                if eq_row:
                    my_eq_id = eq_row[0]
                    eq_data_str = app_dict.get('equipment_data', '')
                    if eq_data_str:
                        try:
                            eq_list = json.loads(eq_data_str)
                            for e in eq_list:
                                if e['id'] == my_eq_id:
                                    involved = True
                                    app_dict['my_equip_is_freed'] = e.get('is_freed', False)
                        except:
                            pass
        if involved: result.append(app_dict)
    return result


@router.get("/api/applications/my")
async def get_my_apps(tg_id: int):
    await ensure_is_team_freed()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: return []
    role = dict(user).get('role')
    teams_dict = await fetch_teams_dict()
    async with db.conn.execute(
            "SELECT * FROM applications WHERE status = 'completed' ORDER BY date_target DESC") as cursor:
        rows = await cursor.fetchall()

    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
        await enrich_app_with_members_data(app_dict)
        eq_data_str = app_dict.get('equipment_data', '')
        equip_text, equip_list = "", []
        if eq_data_str:
            try:
                equip_list = json.loads(eq_data_str)
                if equip_list: equip_text = ", ".join(
                    [f"{e['name']} ({e['time_start']}:00-{e['time_end']}:00)" for e in equip_list])
            except:
                pass
        app_dict['formatted_equip'] = equip_text or "Не требуется"

        involved = False
        if role in ['worker', 'foreman']:
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (real_tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0]:
                    t_ids = [int(x) for x in str(app_dict['team_id']).split(',') if x.strip().isdigit()]
                    if tm_row[0] in t_ids: involved = True
        if role in ['driver']:
            async with db.conn.execute("SELECT id FROM equipment WHERE tg_id = ?", (real_tg_id,)) as cur:
                eq_row = await cur.fetchone()
                if eq_row:
                    my_eq_id = eq_row[0]
                    if any(e['id'] == my_eq_id for e in equip_list): involved = True
        if involved: result.append(app_dict)
    return result


@router.post("/api/applications/{app_id}/free_equipment")
async def free_app_equipment(app_id: int, tg_id: int = Form(...)):
    await ensure_is_team_freed()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(403)

    async with db.conn.execute("SELECT id FROM equipment WHERE tg_id = ?", (real_tg_id,)) as cur:
        eq_row = await cur.fetchone()
    if not eq_row: raise HTTPException(404, "Ваша техника не найдена")
    my_eq_id = eq_row[0]

    await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (my_eq_id,))

    async with db.conn.execute("SELECT equipment_data, object_address FROM applications WHERE id = ?",
                               (app_id,)) as cur:
        app_row = await cur.fetchone()

    if app_row and app_row[0]:
        eq_data_str = app_row[0]
        obj_addr = app_row[1]
        try:
            eq_list = json.loads(eq_data_str)
            for eq in eq_list:
                if eq['id'] == my_eq_id:
                    eq['is_freed'] = True
            new_eq_data = json.dumps(eq_list, ensure_ascii=False)
            await db.conn.execute("UPDATE applications SET equipment_data = ? WHERE id = ?", (new_eq_data, app_id))
        except:
            pass

    await db.conn.commit()
    fio = dict(user).get('fio', '')
    await db.add_log(real_tg_id, fio, f"Освободил технику на объекте {obj_addr}")
    await notify_users(["report_group"],
                       f"🟢 <b>Техника свободна</b>\nВодитель {fio} завершил работу на объекте:\n📍 {obj_addr}",
                       "equipment")
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/free_team")
async def free_app_team(app_id: int, tg_id: int = Form(...)):
    await ensure_is_team_freed()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)

    async with db.conn.execute("SELECT object_address FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()
        obj_addr = app_row[0] if app_row else ""

    await db.conn.execute("UPDATE applications SET is_team_freed = 1 WHERE id = ?", (app_id,))
    await db.conn.commit()

    fio = dict(user).get('fio', '') if user else ''
    await db.add_log(real_tg_id, fio, f"Освободил бригаду на объекте {obj_addr}")
    await notify_users(["report_group"],
                       f"🟢 <b>Бригада свободна</b>\nПрораб {fio} завершил работу на объекте:\n📍 {obj_addr}",
                       "dashboard")
    return {"status": "ok"}