import os
import json
import time
import asyncio
import logging

from maxapi.types import ButtonsPayload, LinkButton

from database_deps import db
from utils import fetch_teams_dict, enrich_app_with_team_name
from services.image_service import create_app_image, strip_html
from services.max_api import get_max_group_id, send_max_message
from services import driver_service
from services.notifications import notify_driver_assignment
from application_numbers import display_application_number

logger = logging.getLogger(__name__)


async def _track_and_notify_drivers(app_id: int, app_dict: dict) -> None:
    """For each (equipment, driver) on the published app, bump popularity
    and fire a personal driver notification. Synthetic drivers (id < 0)
    are skipped for notifications. Failures swallowed — popularity is
    best-effort, must not fail the publish."""
    try:
        rows = await driver_service.get_application_drivers(db, app_id)
    except Exception as e:
        logger.warning(f"publish: get_application_drivers({app_id}) failed: {e}")
        return

    if not rows:
        return

    date_target = app_dict.get("date_target", "")
    object_name = app_dict.get("object_name") or app_dict.get("object_address") or ""

    for r in rows:
        eq_id = r.get("equipment_id")
        drv_id = r.get("driver_user_id")
        eq_name = r.get("equipment_name") or f"#{eq_id}"
        if not eq_id or not drv_id:
            continue
        if int(drv_id) > 0:
            try:
                await driver_service.increment_usage(db, int(eq_id), int(drv_id))
            except Exception as e:
                logger.warning(f"increment_usage eq={eq_id} drv={drv_id}: {e}")
        try:
            asyncio.create_task(notify_driver_assignment(
                int(drv_id), eq_name, app_id, date_target, object_name,
                action="assigned",
            ))
        except Exception as e:
            logger.warning(f"driver_assigned notify eq={eq_id} drv={drv_id}: {e}")


async def execute_app_publish(app_dict, target_platform: str = "all"):
    """Генерация и публикация наряда (УБРАНЫ ОТМЕТКИ MAX)"""
    if db.conn is None: await db.init_db()

    max_bot_token = os.getenv("MAX_BOT_TOKEN")
    max_group_id = await get_max_group_id()
    app_id = app_dict['id']
    app_number = display_application_number(app_id, app_dict.get("public_number"))

    teams_dict = await fetch_teams_dict()
    enrich_app_with_team_name(app_dict, teams_dict)
    team_name = app_dict['team_name']

    selected = app_dict.get('selected_members', '')
    selected_list = [int(x.strip()) for x in selected.split(',')] if selected else []
    staff_rows = []
    if selected_list:
        pl = ','.join('?' for _ in selected_list)
        async with db.conn.execute(f"SELECT fio, position, tg_user_id FROM team_members WHERE id IN ({pl})",
                                   selected_list) as cur:
            staff_rows = await cur.fetchall()

    staff_str_max = ""
    workers_ids = []

    if staff_rows:
        for r in staff_rows:
            name, position, user_id = r[0], r[1], r[2]
            if user_id:
                workers_ids.append(user_id)
            staff_str_max += f"\n  ├ {name} ({position})"
    else:
        staff_str_max = "\n  ├ Только техника"

    eq_data_str = app_dict.get('equipment_data', '')
    equip_list = []
    drivers_ids = []
    equip_html = ""

    # v2.6: per-application driver assignments from the junction table.
    drivers_map: dict[int, dict] = {}
    try:
        for r in await driver_service.get_application_drivers(db, app_id):
            drivers_map[int(r["equipment_id"])] = r
    except Exception:
        pass

    if eq_data_str:
        try:
            equip_list = json.loads(eq_data_str)
            if equip_list:
                for eq in equip_list:
                    eq_id_int = int(eq['id'])
                    drv = drivers_map.get(eq_id_int)
                    driver_line = ""
                    if drv:
                        drv_uid = int(drv["driver_user_id"])
                        drv_fio = drv.get("driver_fio") or "—"
                        if drv_uid > 0:
                            drivers_ids.append(drv_uid)
                        driver_line = f"\n  │   👤 Водитель: {drv_fio}"
                    equip_html += (
                        f"  ├ {eq['name']}\n"
                        f"  │   ⏰ {eq['time_start']}:00 - {eq['time_end']}:00"
                        f"{driver_line}\n"
                    )
        except Exception:
            pass

    if not equip_html: equip_html = "  ├ Не требуется\n"

    comment_text = app_dict.get('comment', '')

    img_buf = create_app_image(app_dict['date_target'], app_dict['object_address'], app_dict['foreman_name'], team_name,
                               equip_list, comment_text)

    filename = f"app_publish_{app_id}_{int(time.time())}.png"
    filepath = os.path.join("data", "uploads", filename)
    with open(filepath, "wb") as f:
        f.write(img_buf.getvalue())

    file_url = f"https://miniapp.viks22.ru/uploads/{filename}"

    comment_html_max = f"\n💬 Комментарий: {comment_text}" if comment_text and comment_text.lower() != 'нет' else ""

    foreman_name = app_dict.get('foreman_name', 'Неизвестно')
    foreman_max = foreman_name

    approved_name = app_dict.get('approved_by', '')
    approved_max = f"\n🛡 Одобрил(а): {approved_name}" if approved_name else ""

    max_caption = f"🟢 УТВЕРЖДЕННЫЙ НАРЯД {app_number}\n📅 Дата: {app_dict['date_target']}\n📍 Объект: {app_dict['object_address']}\n🚜 Техника:\n{equip_html}👷‍♂️ Прораб: {foreman_max}\n👥 Бригада «{team_name}»:{staff_str_max}{comment_html_max}{approved_max}"

    published_max = False
    if max_bot_token and max_group_id:
        max_text = strip_html(max_caption)
        base_url = os.getenv("WEB_APP_URL", "https://miniapp.viks22.ru")
        max_buttons = [[LinkButton(text="📱 Открыть платформу", url=f"{base_url}/dashboard")]]
        max_payload = ButtonsPayload(buttons=max_buttons).pack()

        published_max = await send_max_message(
            max_bot_token,
            max_group_id,
            max_text,
            filepath,
            file_url,
            attachments=[max_payload]
        )

    if published_max:
        try:
            await _track_and_notify_drivers(app_id, app_dict)
        except Exception as e:
            logger.warning(f"driver popularity/notify pass for app #{app_id}: {e}")
        return True
    return False
