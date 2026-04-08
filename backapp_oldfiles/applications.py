import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
import json
from datetime import datetime
from database_deps import db, TZ_BARNAUL
from utils import resolve_id, notify_users, execute_app_publish, fetch_teams_dict, enrich_app_with_team_name

router = APIRouter(tags=["Applications"])


async def ensure_app_columns():
    try:
        await db.conn.execute("ALTER TABLE applications ADD COLUMN is_team_freed INTEGER DEFAULT 0")
    except:
        pass
    try:
        await db.conn.execute("ALTER TABLE applications ADD COLUMN freed_team_ids TEXT DEFAULT ''")
    except:
        pass
    await db.conn.commit()


async def enrich_app_with_members_data(app_dict):
    selected_m = app_dict.get('selected_members')
    members_list = []
    if selected_m:
        m_ids = [int(x) for x in selected_m.split(',') if x.strip().isdigit()]
        if m_ids:
            pl = ','.join(['?'] * len(m_ids))
            # Присоединяем таблицу teams, чтобы сразу получать названия бригад для каждого рабочего
            query = f"""
                SELECT tm.id, tm.fio, tm.tg_user_id, tm.position, tm.team_id, t.name 
                FROM team_members tm
                LEFT JOIN teams t ON tm.team_id = t.id
                WHERE tm.id IN ({pl})
            """
            async with db.conn.execute(query, m_ids) as cur:
                for r in await cur.fetchall():
                    members_list.append({
                        "id": r[0],
                        "fio": r[1],
                        "tg_user_id": r[2],
                        "position": r[3],
                        "team_id": r[4],
                        "team_name": r[5] or f"Бригада {r[4]}"
                    })
    app_dict['members_data'] = members_list


@router.post("/api/applications/create")
async def create_app(tg_id: int = Form(...), team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form("")):
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    fio = dict(user).get('fio', 'Web-Пользователь') if user else "Web-Пользователь"
    await db.conn.execute(
        "INSERT INTO applications (foreman_id, foreman_name, team_id, equip_id, date_target, object_address, time_start, time_end, comment, status, selected_members, equipment_data, is_team_freed, freed_team_ids) VALUES (?, ?, ?, 0, ?, ?, '08', '17', ?, 'waiting', ?, ?, 0, '')",
        (real_tg_id, fio, team_id, date_target, object_address, comment, selected_members, equipment_data))
    await db.conn.commit()

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    await notify_users(["report_group", "moderator", "boss", "superadmin"],
                       f"📝 <b>Новая заявка на выезд</b>\n👤 Создал: {fio}\n📍 Объект: {object_address}\n📅 Дата: {date_target}\n🕒 Время: {now}",
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

    fio = dict(user).get('fio', 'Пользователь')
    await db.add_log(real_tg_id, fio, f"Отредактировал заявку №{app_id}")
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    await notify_users(["report_group", "boss", "superadmin"],
                       f"✏️ <b>Заявка №{app_id} изменена</b>\n👤 Кто: {fio}\n📍 Объект: {object_address}\n🕒 Время: {now}",
                       "review")
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

        fio = dict(user).get('fio', 'Админ')
        await db.add_log(real_tg_id, fio,
                         f"Полностью удалил заявку №{app_id} (Объект: {app_dict.get('object_address')})")

        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        await notify_users(["report_group", "boss", "superadmin"],
                           f"🗑 <b>Заявка №{app_id} удалена</b>\n👤 Кто: {fio}\n📍 Объект: {app_dict.get('object_address')}\n🕒 Время: {now}",
                           "review")
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка удаления: {e}")

    return {"status": "ok"}


@router.get("/api/applications/review")
async def get_review_apps():
    await ensure_app_columns()
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

    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)

    user_role = dict(user).get('role') if user else ''
    if user_role not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав на модерацию")

    mod_fio = dict(user).get('fio', 'Модератор') if user else 'Модератор'

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()
    if not app_row: raise HTTPException(404, "Заявка не найдена")
    app_dict = dict(zip([c[0] for c in cur.description], app_row))

    try:
        if new_status == 'approved':
            await db.conn.execute(
                "UPDATE applications SET status = ?, approved_by = ?, approved_by_id = ? WHERE id = ?",
                (new_status, mod_fio, real_tg_id, app_id))
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
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    msg_group = f"📋 <b>Заявка №{app_id} {status_ru}</b>\n👤 Проверил: {mod_fio}\n📍 Объект: {app_dict['object_address']}\n🕒 Время: {now}"
    if reason: msg_group += f"\n💬 Причина: {reason}"
    await notify_users(["report_group", "boss", "superadmin"], msg_group, "review")

    if new_status in ['approved', 'rejected']:
        msg_foreman = f"🔔 <b>Ваша заявка {status_ru}!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
        if reason: msg_foreman += f"\n💬 Причина: {reason}"
        await notify_users([], msg_foreman, "dashboard", extra_tg_ids=[app_dict['foreman_id']])

        # --- НОВАЯ ЛОГИКА: УВЕДОМЛЕНИЯ ПРИ ОДОБРЕНИИ (Добавление в наряд) ---
        if new_status == 'approved':
            workers_ids = []
            selected_members = app_dict.get('selected_members', '')
            if selected_members:
                m_ids = [int(x.strip()) for x in selected_members.split(',') if x.strip().isdigit()]
                if m_ids:
                    pl = ','.join(['?'] * len(m_ids))
                    async with db.conn.execute(f"SELECT tg_user_id FROM team_members WHERE id IN ({pl})", m_ids) as c:
                        for r in await c.fetchall():
                            if r[0]: workers_ids.append(r[0])

            drivers_ids = []
            eq_data_str = app_dict.get('equipment_data', '')
            if eq_data_str:
                try:
                    eq_list = json.loads(eq_data_str)
                    for e in eq_list:
                        async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?", (e['id'],)) as c:
                            eq_row = await c.fetchone()
                            if eq_row and eq_row[0]: drivers_ids.append(eq_row[0])
                except:
                    pass

            all_involved = list(set(workers_ids + drivers_ids))
            if all_involved:
                msg_inv = f"👷‍♂️ <b>Вас добавили в наряд! (Предварительная бронь)</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}\n\nОжидайте публикации наряда."
                await notify_users([], msg_inv, "my-apps", extra_tg_ids=all_involved)

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
    fio = dict(user).get('fio', 'Руководство') if user else "Руководство"
    await db.add_log(tg_id, fio, f"Опубликовал {count} нарядов в группу")

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    await notify_users(["boss", "superadmin"],
                       f"📤 <b>Публикация нарядов</b>\n👤 Кто: {fio}\n✅ Опубликовано: {count} шт.\n🕒 Время: {now}",
                       "dashboard")

    return {"status": "ok", "published": count}


@router.get("/api/applications/active")
async def get_active_app(tg_id: int):
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: return []
    role = dict(user).get('role')

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

        if app_dict['foreman_id'] == real_tg_id:
            involved = True

        if role in ['worker', 'foreman', 'boss', 'superadmin', 'moderator']:
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (real_tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0]:
                    t_ids = [int(x) for x in str(app_dict['team_id']).split(',') if x.strip().isdigit()]
                    if tm_row[0] in t_ids: involved = True

        if role in ['driver', 'boss', 'superadmin', 'moderator']:
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
    await ensure_app_columns()
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

        if app_dict['foreman_id'] == real_tg_id:
            involved = True

        if role in ['worker', 'foreman', 'boss', 'superadmin', 'moderator']:
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (real_tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0]:
                    t_ids = [int(x) for x in str(app_dict['team_id']).split(',') if x.strip().isdigit()]
                    if tm_row[0] in t_ids: involved = True

        if role in ['driver', 'boss', 'superadmin', 'moderator']:
            async with db.conn.execute("SELECT id FROM equipment WHERE tg_id = ?", (real_tg_id,)) as cur:
                eq_row = await cur.fetchone()
                if eq_row:
                    my_eq_id = eq_row[0]
                    if any(e['id'] == my_eq_id for e in equip_list): involved = True

        if involved: result.append(app_dict)
    return result


@router.post("/api/applications/{app_id}/free_equipment")
async def free_app_equipment(app_id: int, tg_id: int = Form(...)):
    await ensure_app_columns()
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

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    await notify_users(["report_group", "boss", "superadmin"],
                       f"🟢 <b>Техника свободна</b>\n👤 Водитель: {fio}\n📍 Объект: {obj_addr}\n🕒 Время: {now}",
                       "equipment")
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/free_team")
async def free_app_team(app_id: int, tg_id: int = Form(...), team_id: int = Form(0)):
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)

    async with db.conn.execute("SELECT object_address, team_id, freed_team_ids FROM applications WHERE id = ?",
                               (app_id,)) as cur:
        app_row = await cur.fetchone()
        if not app_row:
            raise HTTPException(404, "Заявка не найдена")
        obj_addr = app_row[0]
        all_team_ids_str = str(app_row[1] or "")
        freed_str = str(app_row[2] or "")

    freed_list = [int(x) for x in freed_str.split(',') if x.strip().isdigit()]
    all_t_ids = [int(x) for x in all_team_ids_str.split(',') if x.strip().isdigit()]

    if team_id > 0:
        if team_id not in freed_list:
            freed_list.append(team_id)
        new_freed_str = ",".join(map(str, freed_list))
        await db.conn.execute("UPDATE applications SET freed_team_ids = ? WHERE id = ?", (new_freed_str, app_id))

        if set(all_t_ids).issubset(set(freed_list)) and len(all_t_ids) > 0:
            await db.conn.execute("UPDATE applications SET is_team_freed = 1 WHERE id = ?", (app_id,))

        await db.conn.commit()

        async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,)) as cur:
            t_row = await cur.fetchone()
            t_name = t_row[0] if t_row else f"ID:{team_id}"

        fio = dict(user).get('fio', '') if user else ''
        await db.add_log(real_tg_id, fio, f"Освободил бригаду '{t_name}' на объекте {obj_addr}")

        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        await notify_users(["report_group", "boss", "superadmin"],
                           f"🟢 <b>Бригада свободна</b>\n🏗 {t_name}\n👤 Ответственный: {fio}\n📍 Объект: {obj_addr}\n🕒 Время: {now}",
                           "dashboard")

    else:
        await db.conn.execute("UPDATE applications SET is_team_freed = 1, freed_team_ids = ? WHERE id = ?",
                              (all_team_ids_str, app_id))
        await db.conn.commit()

        fio = dict(user).get('fio', '') if user else ''
        await db.add_log(real_tg_id, fio, f"Освободил все бригады на объекте {obj_addr}")

        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        await notify_users(["report_group", "boss", "superadmin"],
                           f"🟢 <b>Все бригады свободны</b>\n👤 Ответственный: {fio}\n📍 Объект: {obj_addr}\n🕒 Время: {now}",
                           "dashboard")

    return {"status": "ok"}