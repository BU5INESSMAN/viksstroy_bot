import sys
import os
import asyncio
import logging

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
import json
from datetime import datetime, timedelta
from database_deps import db, TZ_BARNAUL
from utils import resolve_id, notify_users, notify_group_chat, execute_app_publish, fetch_teams_dict, enrich_app_with_team_name
from schedule_generator import generate_schedule_image, publish_schedule_to_group

logger = logging.getLogger(__name__)

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


# ==========================================
# НОВЫЕ ЭНДПОИНТЫ ОБЪЕКТОВ И ПРОВЕРОК
# ==========================================
@router.get("/api/objects/active")
async def get_active_objects(tg_id: int = 0):
    """Отдает список активных объектов, отсортированных по последним использованным."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute(
            "SELECT id, name, address, default_team_ids, default_equip_ids FROM objects WHERE is_archived = 0 ORDER BY name") as cur:
        rows = await cur.fetchall()
        objects = [{"id": r[0], "name": r[1], "address": r[2], "default_team_ids": r[3], "default_equip_ids": r[4]} for r in rows]

    # Sort by user's last used objects
    if tg_id:
        real_id = await resolve_id(tg_id)
        try:
            async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
                row = await cur.fetchone()
                if row and row[0]:
                    last_ids = json.loads(row[0])
                    def sort_key(obj):
                        try:
                            return last_ids.index(obj['id'])
                        except ValueError:
                            return len(last_ids) + obj['id']
                    objects.sort(key=sort_key)
        except:
            pass

    return objects


@router.post("/api/applications/check_availability")
async def check_availability(
        date_target: str = Form(...),
        object_id: int = Form(0),
        team_ids: str = Form(""),
        equip_data: str = Form(""),
        exclude_app_id: int = Form(0)
):
    """Проверяет занятость ресурсов перед подстановкой"""
    if db.conn is None: await db.init_db()
    occupied = await db.check_resource_availability(date_target, object_id, team_ids, equip_data, exclude_app_id=exclude_app_id or None)

    if occupied:
        return {"status": "occupied", "message": "Выбранные ресурсы недоступны:\n\n" + "\n".join(occupied)}
    return {"status": "free"}


# ==========================================
# ОСНОВНЫЕ ЭНДПОИНТЫ ЗАЯВОК
# ==========================================
@router.post("/api/applications/create")
async def create_app(tg_id: int = Form(...), team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form(""), object_id: int = Form(0)):
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    fio = dict(user).get('fio', 'Web-Пользователь') if user else "Web-Пользователь"

    # Строгая серверная проверка занятости перед сохранением
    occupied = await db.check_resource_availability(date_target, object_id, team_id, equipment_data)
    if occupied:
        raise HTTPException(409, "Ошибка создания наряда:\n" + "\n".join(occupied))

    await db.conn.execute(
        "INSERT INTO applications (foreman_id, foreman_name, team_id, object_id, date_target, object_address, time_start, time_end, comment, status, selected_members, equipment_data, is_team_freed, freed_team_ids) VALUES (?, ?, ?, ?, ?, ?, '08', '17', ?, 'waiting', ?, ?, 0, '')",
        (real_tg_id, fio, team_id, object_id, date_target, object_address, comment, selected_members, equipment_data))
    await db.conn.commit()

    logger.info("Action saved to DB, sending notifications in background")
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    asyncio.create_task(notify_users(["report_group", "moderator", "boss", "superadmin"],
                       f"📝 <b>Новая заявка на выезд</b>\n👤 Создал: {fio}\n📍 Объект: {object_address}\n📅 Дата: {date_target}\n🕒 Время: {now}",
                       "review", category="orders"))
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/update")
async def update_app(app_id: int, tg_id: int = Form(...), team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form(""), object_id: int = Form(0)):
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(403)
    async with db.conn.execute("SELECT status FROM applications WHERE id = ?", (app_id,)) as cur:
        row = await cur.fetchone()
        if not row or row[0] != 'waiting': raise HTTPException(400, "Заявка уже в работе или проверена")

    # Строгая серверная проверка занятости перед сохранением (исключаем текущую заявку)
    occupied = await db.check_resource_availability(date_target, object_id, team_id, equipment_data, exclude_app_id=app_id)
    if occupied:
        raise HTTPException(409, "Ошибка обновления наряда:\n" + "\n".join(occupied))

    try:
        await db.conn.execute(
            "UPDATE applications SET team_id=?, date_target=?, object_address=?, object_id=?, comment=?, selected_members=?, equipment_data=? WHERE id = ?",
            (team_id, date_target, object_address, object_id, comment, selected_members, equipment_data, app_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()

    fio = dict(user).get('fio', 'Пользователь')
    await db.add_log(real_tg_id, fio, f"Отредактировал заявку №{app_id}")

    logger.info("Action saved to DB, sending notifications in background")
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    asyncio.create_task(notify_users(["report_group", "moderator", "boss", "superadmin"],
                       f"⚠️ <b>Заявка #{app_id} (Объект: {object_address}) была отредактирована</b>\n👤 Прораб: {fio}\n🕒 Время: {now}",
                       "review", category="orders"))
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

        logger.info("Action saved to DB, sending notifications in background")
        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        asyncio.create_task(notify_users(["report_group", "boss", "superadmin"],
                           f"🗑 <b>Заявка №{app_id} удалена</b>\n👤 Кто: {fio}\n📍 Объект: {app_dict.get('object_address')}\n🕒 Время: {now}",
                           "review", category="orders"))
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка удаления: {e}")

    return {"status": "ok"}


@router.get("/api/applications/review")
async def get_review_apps(tg_id: int = 0):
    await ensure_app_columns()
    teams_dict = await fetch_teams_dict()

    # Определяем роль пользователя для фильтрации
    real_tg_id = None
    user_role = None
    if tg_id:
        real_tg_id = await resolve_id(tg_id)
        user = await db.get_user(real_tg_id)
        user_role = dict(user).get('role') if user else None

    async with db.conn.execute(
            "SELECT * FROM applications WHERE status IN ('waiting', 'approved', 'published', 'in_progress', 'completed') AND (is_archived = 0 OR is_archived IS NULL) ORDER BY id DESC") as cursor:
        rows = await cursor.fetchall()
    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
        await enrich_app_with_members_data(app_dict)

        # Фильтрация для прорабов и бригадиров: только свои заявки
        if user_role in ('foreman', 'brigadier') and real_tg_id:
            if app_dict.get('foreman_id') != real_tg_id:
                continue

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
        elif new_status == 'completed':
            now_ts = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d %H:%M:%S")
            await db.conn.execute("UPDATE applications SET status = ?, completed_at = ? WHERE id = ?", (new_status, now_ts, app_id))
        else:
            await db.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (new_status, app_id))

        if new_status in ['completed', 'rejected']:
            # Освобождаем технику
            if app_dict.get('equipment_data'):
                try:
                    eq_list = json.loads(app_dict['equipment_data'])
                    for e in eq_list: await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?",
                                                            (e['id'],))
                except:
                    pass
            # Освобождаем бригады (помечаем как freed)
            all_team_ids_str = str(app_dict.get('team_id') or "")
            if all_team_ids_str and all_team_ids_str != '0':
                await db.conn.execute(
                    "UPDATE applications SET is_team_freed = 1, freed_team_ids = ? WHERE id = ?",
                    (all_team_ids_str, app_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()

    logger.info("Action saved to DB, sending notifications in background")

    async def _send_review_notifications():
        try:
            status_ru = "✅ Одобрена" if new_status == 'approved' else (
                "❌ Отклонена / Отозвана" if new_status == 'rejected' else "🏁 Досрочно завершена")
            now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

            msg_group = f"📋 <b>Заявка №{app_id} {status_ru}</b>\n👤 Проверил: {mod_fio}\n📍 Объект: {app_dict['object_address']}\n🕒 Время: {now}"
            if reason: msg_group += f"\n💬 Причина: {reason}"
            await notify_users(["report_group", "boss", "superadmin"], msg_group, "review", category="orders")

            if new_status in ['approved', 'rejected']:
                msg_foreman = f"🔔 <b>Ваша заявка {status_ru}!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
                if reason: msg_foreman += f"\n💬 Причина: {reason}"
                await notify_users([], msg_foreman, "dashboard", extra_tg_ids=[app_dict['foreman_id']], category="orders")

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
                        await notify_users([], msg_inv, "my-apps", extra_tg_ids=all_involved, category="orders")
        except Exception as e:
            logger.error(f"Background notification error for app #{app_id}: {e}")

    asyncio.create_task(_send_review_notifications())
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

    logger.info("Action saved to DB, sending notifications in background")
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    asyncio.create_task(notify_users(["boss", "superadmin"],
                       f"📤 <b>Публикация нарядов</b>\n👤 Кто: {fio}\n✅ Опубликовано: {count} шт.\n🕒 Время: {now}",
                       "dashboard", category="orders"))

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
    user_role = dict(user).get('role', 'Водитель')
    await db.add_log(real_tg_id, fio, f"Освободил технику на объекте {obj_addr}")

    # Получаем название техники
    async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (my_eq_id,)) as cur:
        eq_name_row = await cur.fetchone()
    eq_name = eq_name_row[0] if eq_name_row else "Техника"

    role_names = {'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель'}
    role_label = role_names.get(user_role, user_role)

    # Отправляем только в групповой чат
    await notify_group_chat(f"{eq_name} освобожден(а) {fio} ({role_label})", "equipment")
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
        user_role = dict(user).get('role', '') if user else ''
        await db.add_log(real_tg_id, fio, f"Освободил бригаду '{t_name}' на объекте {obj_addr}")

        role_names = {'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель'}
        role_label = role_names.get(user_role, user_role)

        # Отправляем только в групповой чат
        await notify_group_chat(f"Бригада «{t_name}» освобожден(а) {fio} ({role_label})", "dashboard")

    else:
        await db.conn.execute("UPDATE applications SET is_team_freed = 1, freed_team_ids = ? WHERE id = ?",
                              (all_team_ids_str, app_id))
        await db.conn.commit()

        fio = dict(user).get('fio', '') if user else ''
        user_role = dict(user).get('role', '') if user else ''
        await db.add_log(real_tg_id, fio, f"Освободил все бригады на объекте {obj_addr}")

        role_names = {'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель'}
        role_label = role_names.get(user_role, user_role)

        # Отправляем только в групповой чат
        await notify_group_chat(f"Все бригады освобожден(а) {fio} ({role_label})", "dashboard")

    return {"status": "ok"}


# ==========================================
# РАССТАНОВКА (SCHEDULE IMAGE)
# ==========================================
@router.post("/api/applications/publish_schedule")
async def publish_schedule(tg_id: int = Form(0), target_date: str = Form("")):
    """Ручная публикация расстановки в групповой чат (для модераторов+)."""
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав для публикации расстановки")

    if not target_date:
        tomorrow = datetime.now(TZ_BARNAUL) + timedelta(days=1)
        target_date = tomorrow.strftime("%Y-%m-%d")

    result = await publish_schedule_to_group(target_date)
    if not result:
        raise HTTPException(500, "Не удалось опубликовать расстановку")

    fio = dict(user).get('fio', 'Модератор')
    await db.add_log(real_tg_id, fio, f"Опубликовал расстановку на {target_date}")
    return {"status": "ok", "date": target_date}


# ==========================================
# АРХИВ ЗАЯВОК
# ==========================================
@router.post("/api/applications/{app_id}/archive")
async def archive_app(app_id: int, tg_id: int = Form(0)):
    """Ручная архивация заявки (moderator/boss/superadmin)."""
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав для архивации")

    async with db.conn.execute("SELECT status FROM applications WHERE id = ?", (app_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Заявка не найдена")
    if row[0] != 'completed':
        raise HTTPException(400, "Архивировать можно только завершённые заявки")

    await db.conn.execute("UPDATE applications SET is_archived = 1 WHERE id = ?", (app_id,))
    await db.conn.commit()

    fio = dict(user).get('fio', 'Модератор')
    await db.add_log(real_tg_id, fio, f"Архивировал заявку №{app_id}")
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/remind")
async def remind_foreman(app_id: int, tg_id: int = Form(0)):
    """Отправляет напоминание прорабу о необходимости заполнить СМР."""
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав для отправки напоминаний")

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()
    if not app_row:
        raise HTTPException(404, "Заявка не найдена")

    app_dict = dict(zip([c[0] for c in cur.description], app_row))
    foreman_id = app_dict.get('foreman_id')
    if not foreman_id:
        raise HTTPException(400, "У заявки не указан прораб")

    object_name = app_dict.get('object_address', 'Неизвестный объект')
    date_target = app_dict.get('date_target', '')

    async def _send_reminder():
        try:
            msg = f"⚠️ <b>Напоминание:</b> Необходимо заполнить СМР по объекту <b>{object_name}</b> на дату <b>{date_target}</b>"
            await notify_users([], msg, "kp", extra_tg_ids=[foreman_id], category="reports")
        except Exception as e:
            logger.error(f"Error sending SMR reminder for app #{app_id}: {e}")

    asyncio.create_task(_send_reminder())

    mod_fio = dict(user).get('fio', 'Модератор')
    await db.add_log(real_tg_id, mod_fio, f"Отправил напоминание о СМР по заявке №{app_id}")
    return {"status": "ok"}


@router.get("/api/applications/archive")
async def get_archived_apps(date_from: str = "", date_to: str = ""):
    """Получение архивных заявок с фильтрацией по дате."""
    teams_dict = await fetch_teams_dict()

    query = "SELECT * FROM applications WHERE is_archived = 1"
    params = []
    if date_from:
        query += " AND date_target >= ?"
        params.append(date_from)
    if date_to:
        query += " AND date_target <= ?"
        params.append(date_to)
    query += " ORDER BY date_target DESC, id DESC"

    async with db.conn.execute(query, params) as cursor:
        rows = await cursor.fetchall()

    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
        await enrich_app_with_members_data(app_dict)
        result.append(app_dict)
    return result


# ==========================================
# ПОСЛЕДНИЕ ОБЪЕКТЫ ПОЛЬЗОВАТЕЛЯ
# ==========================================
@router.post("/api/users/{user_id}/last_objects")
async def update_last_objects(user_id: int, object_id: int = Form(...)):
    """Обновляет список последних использованных объектов."""
    real_id = await resolve_id(user_id)
    user = await db.get_user(real_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    # Get current list
    last_used = '[]'
    try:
        async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                last_used = row[0]
    except:
        pass

    try:
        ids = json.loads(last_used)
    except:
        ids = []

    # Move to front, keep max 10
    if object_id in ids:
        ids.remove(object_id)
    ids.insert(0, object_id)
    ids = ids[:10]

    await db.conn.execute("UPDATE users SET last_used_objects = ? WHERE user_id = ?", (json.dumps(ids), real_id))
    await db.conn.commit()
    return {"status": "ok"}


@router.get("/api/users/{user_id}/last_objects")
async def get_last_objects(user_id: int):
    """Возвращает список последних использованных объектов."""
    real_id = await resolve_id(user_id)
    try:
        async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                return json.loads(row[0])
    except:
        pass
    return []