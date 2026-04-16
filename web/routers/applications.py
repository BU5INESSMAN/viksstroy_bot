import sys
import os
import asyncio
import logging
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Depends
from datetime import datetime, timedelta
from database_deps import db, TZ_BARNAUL
from utils import resolve_id, fetch_teams_dict, enrich_app_with_team_name
from auth_deps import get_current_user, require_role
from services.notifications import notify_users
from services.app_service import (
    ensure_app_columns, enrich_app_with_members_data, get_active_objects_list,
    create_application, update_application, delete_application,
    update_last_used_objects, get_last_used_objects,
)
from services.app_workflow import (
    review_application, send_review_notifications,
    change_application_status, send_status_change_notification,
    publish_applications, free_equipment, free_team,
    archive_application, unarchive_application, remind_foreman_smr, send_remind_notification,
)
from schedule_generator import generate_schedule_image, publish_schedule_to_group

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Applications"])

_require_office = require_role("superadmin", "boss", "moderator")


@router.get("/api/objects/active")
async def get_active_objects(current_user=Depends(get_current_user)):
    return await get_active_objects_list(current_user["tg_id"])


@router.post("/api/applications/check_availability")
async def check_availability(
        date_target: str = Form(...),
        object_id: int = Form(0),
        team_ids: str = Form(""),
        equip_data: str = Form(""),
        exclude_app_id: int = Form(0),
        current_user=Depends(get_current_user),
):
    if db.conn is None: await db.init_db()
    occupied = await db.check_resource_availability(date_target, object_id, team_ids, equip_data, exclude_app_id=exclude_app_id or None)
    if occupied:
        return {"status": "occupied", "message": "Выбранные ресурсы недоступны:\n\n" + "\n".join(occupied)}
    return {"status": "free"}


@router.post("/api/applications/create")
async def create_app(team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form(""), object_id: int = Form(0),
                     current_user=Depends(get_current_user)):
    tg_id = current_user["tg_id"]
    new_app_id, real_tg_id, fio = await create_application(
        tg_id, team_id, date_target, object_address, comment, selected_members, equipment_data, object_id)
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    asyncio.create_task(notify_users(["report_group", "moderator", "boss", "superadmin"],
                       f"📝 <b>Новая заявка на выезд</b>\n👤 Создал: {fio}\n📍 Объект: {object_address}\n📅 Дата: {date_target}\n🕒 Время: {now}",
                       "review", category="orders"))
    return {"status": "ok", "id": new_app_id}


@router.post("/api/applications/{app_id}/update")
async def update_app(app_id: int, team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form(""), object_id: int = Form(0),
                     current_user=Depends(get_current_user)):
    tg_id = current_user["tg_id"]
    real_tg_id, fio = await update_application(
        app_id, tg_id, team_id, date_target, object_address, comment, selected_members, equipment_data, object_id)
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    asyncio.create_task(notify_users(["report_group", "moderator", "boss", "superadmin"],
                       f"⚠️ <b>Заявка #{app_id} (Объект: {object_address}) была отредактирована</b>\n👤 Прораб: {fio}\n🕒 Время: {now}",
                       "review", category="orders"))
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/delete")
async def delete_app(app_id: int, current_user=Depends(get_current_user)):
    tg_id = current_user["tg_id"]
    real_tg_id, fio, app_dict = await delete_application(app_id, tg_id)
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    asyncio.create_task(notify_users(["report_group", "boss", "superadmin"],
                       f"🗑 <b>Заявка №{app_id} удалена</b>\n👤 Кто: {fio}\n📍 Объект: {app_dict.get('object_address')}\n🕒 Время: {now}",
                       "review", category="orders"))
    return {"status": "ok"}


@router.get("/api/applications/review")
async def get_review_apps(current_user=Depends(get_current_user)):
    await ensure_app_columns()
    teams_dict = await fetch_teams_dict()

    real_tg_id = current_user["tg_id"]
    user_role = current_user.get("role")

    async with db.conn.execute(
            "SELECT * FROM applications WHERE status IN ('waiting', 'approved', 'published', 'in_progress', 'completed') AND (is_archived = 0 OR is_archived IS NULL) ORDER BY id DESC") as cursor:
        rows = await cursor.fetchall()
    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
        await enrich_app_with_members_data(app_dict)

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
async def review_app(app_id: int, new_status: str = Form(...), reason: str = Form(""),
                     current_user=Depends(_require_office)):
    if new_status not in ['approved', 'rejected', 'completed']: raise HTTPException(400, "Неверный статус")
    tg_id = current_user["tg_id"]
    app_dict, mod_fio, real_tg_id, status, reas = await review_application(app_id, new_status, reason, tg_id)
    asyncio.create_task(send_review_notifications(app_id, app_dict, mod_fio, status, reas))
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/change_status")
async def change_status(app_id: int, new_status: str = Form(...), current_user=Depends(get_current_user)):
    if new_status not in ('approved', 'in_progress', 'completed'):
        raise HTTPException(400, "Неверный статус")
    tg_id = current_user["tg_id"]
    app_dict, mod_fio, real_tg_id = await change_application_status(app_id, new_status, tg_id)
    asyncio.create_task(send_status_change_notification(app_id, app_dict, new_status))
    return {"success": True, "new_status": new_status, "message": "Статус изменён"}


@router.post("/api/applications/publish")
async def publish_apps(app_ids: str = Form(...), current_user=Depends(_require_office)):
    tg_id = current_user["tg_id"]
    count, fio = await publish_applications(app_ids, tg_id)
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
    asyncio.create_task(notify_users(["boss", "superadmin"],
                       f"📤 <b>Публикация нарядов</b>\n👤 Кто: {fio}\n✅ Опубликовано: {count} шт.\n🕒 Время: {now}",
                       "dashboard", category="orders"))
    return {"status": "ok", "published": count}


@router.get("/api/applications/active")
async def get_active_app(current_user=Depends(get_current_user)):
    await ensure_app_columns()
    real_tg_id = current_user["tg_id"]
    role = current_user.get("role")

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
async def get_my_apps(current_user=Depends(get_current_user)):
    await ensure_app_columns()
    real_tg_id = current_user["tg_id"]
    role = current_user.get("role")
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
async def free_app_equipment(app_id: int, current_user=Depends(get_current_user)):
    await free_equipment(app_id, current_user["tg_id"])
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/free_team")
async def free_app_team(app_id: int, team_id: int = Form(0), current_user=Depends(get_current_user)):
    await free_team(app_id, current_user["tg_id"], team_id)
    return {"status": "ok"}


@router.post("/api/applications/publish_schedule")
async def publish_schedule(target_date: str = Form(""), current_user=Depends(_require_office)):
    real_tg_id = current_user["tg_id"]

    if not target_date:
        tomorrow = datetime.now(TZ_BARNAUL) + timedelta(days=1)
        target_date = tomorrow.strftime("%Y-%m-%d")

    result = await publish_schedule_to_group(target_date)
    if not result:
        raise HTTPException(500, "Не удалось опубликовать расстановку")

    fio = current_user.get('fio', 'Модератор')
    await db.add_log(real_tg_id, fio, f"Опубликовал расстановку на {target_date}", target_type='system')
    return {"status": "ok", "date": target_date}


@router.post("/api/applications/{app_id}/archive")
async def archive_app(app_id: int, current_user=Depends(get_current_user)):
    await archive_application(app_id, current_user["tg_id"])
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/unarchive")
async def unarchive_app(app_id: int, current_user=Depends(get_current_user)):
    await unarchive_application(app_id, current_user["tg_id"])
    return {"status": "ok"}


@router.post("/api/applications/{app_id}/remind")
async def remind_foreman(app_id: int, current_user=Depends(_require_office)):
    app_dict = await remind_foreman_smr(app_id, current_user["tg_id"])
    asyncio.create_task(send_remind_notification(app_dict))
    return {"status": "ok"}


@router.get("/api/applications/archive")
async def get_archived_apps(date_from: str = "", date_to: str = "", current_user=Depends(get_current_user)):
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


@router.post("/api/users/{user_id}/last_objects")
async def update_last_objects(user_id: int, object_id: int = Form(...), current_user=Depends(get_current_user)):
    await update_last_used_objects(current_user["tg_id"], object_id)
    return {"status": "ok"}


@router.get("/api/users/{user_id}/last_objects")
async def get_last_objects(user_id: int, current_user=Depends(get_current_user)):
    return await get_last_used_objects(current_user["tg_id"])
