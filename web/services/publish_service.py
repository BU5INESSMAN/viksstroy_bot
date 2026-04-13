import os
import json
import time
import aiohttp

from maxapi.types import ButtonsPayload, LinkButton

from database_deps import db
from utils import fetch_teams_dict, enrich_app_with_team_name
from services.image_service import create_app_image, strip_html
from services.max_api import get_max_group_id, send_max_message
from services.tg_session import get_tg_session


async def execute_app_publish(app_dict, target_platform: str = "all"):
    """Генерация и публикация наряда (УБРАНЫ ОТМЕТКИ MAX)"""
    if db.conn is None: await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")
    max_group_id = await get_max_group_id()
    app_id = app_dict['id']

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

    staff_str_tg = ""
    staff_str_max = ""
    workers_ids = []

    if staff_rows:
        for r in staff_rows:
            name, position, w_tg_id = r[0], r[1], r[2]
            if w_tg_id:
                workers_ids.append(w_tg_id)
                staff_str_tg += f"\n  ├ <a href='tg://user?id={w_tg_id}'>{name}</a> (<i>{position}</i>)" if int(
                    w_tg_id) > 0 else f"\n  ├ {name} (<i>{position}</i>)"
            else:
                staff_str_tg += f"\n  ├ {name} (<i>{position}</i>)"

            # MAX всегда получает только чистый текст
            staff_str_max += f"\n  ├ {name} ({position})"
    else:
        staff_str_tg = "\n  ├ Только техника"
        staff_str_max = "\n  ├ Только техника"

    eq_data_str = app_dict.get('equipment_data', '')
    equip_list = []
    drivers_ids = []
    equip_html = ""
    if eq_data_str:
        try:
            equip_list = json.loads(eq_data_str)
            if equip_list:
                for eq in equip_list:
                    equip_html += f"  ├ {eq['name']}\n  │   ⏰ {eq['time_start']}:00 - {eq['time_end']}:00\n"
                    async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?", (eq['id'],)) as cur:
                        eq_db_row = await cur.fetchone()
                        if eq_db_row and eq_db_row[0]: drivers_ids.append(eq_db_row[0])
        except:
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

    comment_html_tg = f"\n💬 <b>Комментарий:</b> {comment_text}" if comment_text and comment_text.lower() != 'нет' else ""
    comment_html_max = f"\n💬 Комментарий: {comment_text}" if comment_text and comment_text.lower() != 'нет' else ""

    foreman_id = app_dict.get('foreman_id', 0)
    foreman_name = app_dict.get('foreman_name', 'Неизвестно')
    foreman_tg = f"<a href='tg://user?id={foreman_id}'>{foreman_name}</a>" if int(foreman_id) > 0 else foreman_name

    # В MAX просто красивое ФИО прораба
    foreman_max = foreman_name

    approved_name = app_dict.get('approved_by', '')
    approved_id = app_dict.get('approved_by_id')
    approved_tg = f"\n🛡 <b>Одобрил(а):</b> <a href='tg://user?id={approved_id}'>{approved_name}</a>" if approved_id and int(
        approved_id) > 0 else f"\n🛡 <b>Одобрил(а):</b> {approved_name}"

    # В MAX просто ФИО одобрившего
    approved_max = f"\n🛡 Одобрил(а): {approved_name}" if approved_name else ""

    tg_caption = f"<blockquote expandable>🟢 <b>УТВЕРЖДЕННЫЙ НАРЯД №{app_id}</b>\n📅 <b>Дата:</b> <code>{app_dict['date_target']}</code>\n📍 <b>Объект:</b> {app_dict['object_address']}\n🚜 <b>Техника:</b>\n{equip_html}👷‍♂️ <b>Прораб:</b> {foreman_tg}\n👥 <b>Бригада «{team_name}»:</b>{staff_str_tg}{comment_html_tg}{approved_tg}</blockquote>"

    max_caption = f"🟢 УТВЕРЖДЕННЫЙ НАРЯД №{app_id}\n📅 Дата: {app_dict['date_target']}\n📍 Объект: {app_dict['object_address']}\n🚜 Техника:\n{equip_html}👷‍♂️ Прораб: {foreman_max}\n👥 Бригада «{team_name}»:{staff_str_max}{comment_html_max}{approved_max}"

    published_tg = False
    if target_platform in ["all", "tg"] and bot_token and group_id:
        data = aiohttp.FormData()
        data.add_field('chat_id', str(group_id))
        data.add_field('photo', img_buf.getvalue(), filename='app.png', content_type='image/png')
        data.add_field('caption', tg_caption)
        data.add_field('parse_mode', 'HTML')

        try:
            async with await get_tg_session() as session:
                async with session.post(f"https://api.telegram.org/bot{bot_token}/sendPhoto", data=data) as resp:
                    if resp.status == 200: published_tg = True
        except:
            pass

    published_max = False
    if target_platform in ["all", "max"] and max_bot_token and max_group_id:
        max_text = strip_html(max_caption)
        max_buttons = [[LinkButton(text="📱 Открыть платформу", url="https://miniapp.viks22.ru/dashboard")]]
        max_payload = ButtonsPayload(buttons=max_buttons).pack()

        published_max = await send_max_message(
            max_bot_token,
            max_group_id,
            max_text,
            filepath,
            file_url,
            attachments=[max_payload]
        )

    if published_tg or published_max:
        return True
    return False
