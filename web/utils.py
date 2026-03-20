import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import aiohttp
import json
import base64
import urllib.request
import ssl
import re
import time
from PIL import Image, ImageDraw, ImageFont
import io

# Инструменты MAX
from maxapi import Bot
from maxapi.types import InputMedia

from database_deps import db


async def resolve_id(raw_id: int):
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT primary_id FROM account_links WHERE secondary_id = ?", (raw_id,)) as cur:
        row = await cur.fetchone()
        if row: return row[0]
    return raw_id


async def fetch_teams_dict():
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT id, name FROM teams") as cur:
        return {r[0]: r[1] for r in await cur.fetchall()}


def enrich_app_with_team_name(app_dict, teams_dict):
    t_val = str(app_dict.get('team_id', '0'))
    if t_val and t_val != '0':
        t_ids = [int(x) for x in t_val.split(',') if x.strip().isdigit()]
        app_dict['team_name'] = ", ".join(
            [teams_dict.get(tid, "Неизвестная бригада") for tid in t_ids]) if t_ids else "Без бригады"
    else:
        app_dict['team_name'] = "Без бригады"
    return app_dict


def process_base64_image(base64_str: str, prefix: str) -> str:
    if not base64_str: return ""
    try:
        header, encoded = base64_str.split(",", 1)
        ext = header.split(";")[0].split("/")[1]
        if ext not in ['jpeg', 'jpg', 'png', 'gif', 'webp']: ext = 'png'
        filename = f"{prefix}_{int(time.time())}.{ext}"
        filepath = os.path.join("data", "uploads", filename)
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(encoded))
        return f"/uploads/{filename}"
    except:
        return ""


def download_font(url, filename):
    if not os.path.exists(filename) or os.path.getsize(filename) < 10000:
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx) as response, open(filename, 'wb') as out_file:
                out_file.write(response.read())
        except Exception:
            pass


def get_fonts():
    font_dir = "data/fonts"
    reg_path = os.path.join(font_dir, "Roboto-Regular.ttf")
    bold_path = os.path.join(font_dir, "Roboto-Bold.ttf")
    download_font("https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf", reg_path)
    download_font("https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Bold.ttf", bold_path)
    try:
        font_header = ImageFont.truetype(bold_path, 36)
        font_label = ImageFont.truetype(reg_path, 28)
        font_value = ImageFont.truetype(bold_path, 34)
        font_time = ImageFont.truetype(reg_path, 28)
    except:
        font_header = font_label = font_value = font_time = ImageFont.load_default()
    return font_header, font_label, font_value, font_time


def clean_text(text):
    if not text: return ""
    return re.sub(r'[^\w\sА-Яа-яЁёA-Za-z0-9,.:\-!/()«»]', '', str(text))


def strip_html(text):
    if not text: return ""
    clean = re.compile('<.*?>')
    return re.sub(clean, '', str(text))


def wrap_text(text, font, max_width, draw):
    lines = []
    for paragraph in text.split('\n'):
        words = paragraph.split(' ')
        if not words or not words[0]:
            lines.append('')
            continue
        current_line = words[0]
        for word in words[1:]:
            bbox = draw.textbbox((0, 0), current_line + " " + word, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current_line += " " + word
            else:
                lines.append(current_line)
                current_line = word
        lines.append(current_line)
    return lines


def create_app_image(date_str, address, foreman, team_name, equip_list, comment_str=""):
    font_header, font_label, font_value, font_time = get_fonts()
    img_w, img_h = 900, 2400
    img = Image.new('RGB', (img_w, img_h), color=(243, 244, 246))
    draw = ImageDraw.Draw(img)

    header_h = 140
    draw.rounded_rectangle([40, 40, img_w - 40, 40 + header_h], radius=24, fill=(37, 99, 235))
    draw.rectangle([40, 40 + header_h - 24, img_w - 40, 40 + header_h], fill=(37, 99, 235))

    logo_path = "frontend/public/logo.png"
    logo_drawn = False
    if os.path.exists(logo_path):
        try:
            logo_img = Image.open(logo_path).convert("RGBA")
            aspect = logo_img.width / logo_img.height
            new_h = 80
            new_w = int(new_h * aspect)
            logo_img = logo_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            r, g, b, a = logo_img.split()
            white_logo = Image.merge("RGBA", (Image.new('L', a.size, 255), Image.new('L', a.size, 255),
                                              Image.new('L', a.size, 255), a))
            start_x = (img_w - new_w) // 2
            img.paste(white_logo, (start_x, 40 + (header_h - new_h) // 2), white_logo)
            logo_drawn = True
        except:
            pass

    if not logo_drawn:
        bbox = draw.textbbox((0, 0), "ВИКС РАСПИСАНИЕ", font=font_header)
        draw.text(((img_w - (bbox[2] - bbox[0])) // 2, 40 + (header_h - (bbox[3] - bbox[1])) // 2), "ВИКС РАСПИСАНИЕ",
                  fill=(255, 255, 255), font=font_header)

    y_offset = 40 + header_h

    def draw_block(content_pairs, current_y, is_first=False):
        padding_x, padding_y = 40, 40
        max_text_w = img_w - (40 * 2) - (padding_x * 2)
        parsed_content = []
        box_h = padding_y * 2
        if is_first: box_h += 65

        for lbl, val in content_pairs:
            if isinstance(val, list):
                bbox_lbl = draw.textbbox((0, 0), lbl.upper(), font=font_label)
                lbl_h = bbox_lbl[3] - bbox_lbl[1]
                val_h = 0
                if not val:
                    bbox_val = draw.textbbox((0, 0), "Без техники", font=font_value)
                    val_h = (bbox_val[3] - bbox_val[1]) + 12
                    parsed_content.append((lbl, "Без техники", (bbox_val[3] - bbox_val[1]) + 12, "text"))
                else:
                    items_parsed = []
                    for eq in val:
                        eq_name = clean_text(eq.get('name', ''))
                        eq_time = f"⏰ {eq.get('time_start', '08')}:00 - {eq.get('time_end', '17')}:00"
                        bbox_name = draw.textbbox((0, 0), eq_name, font=font_value)
                        name_h = (bbox_name[3] - bbox_name[1]) + 12
                        bbox_time = draw.textbbox((0, 0), eq_time, font=font_time)
                        time_h = (bbox_time[3] - bbox_time[1]) + 12
                        items_parsed.append((eq_name, eq_time, name_h, time_h))
                        val_h += name_h + time_h + 15
                    parsed_content.append((lbl, items_parsed, 0, "list"))
                box_h += lbl_h + 15 + val_h + 30
            else:
                val_clean = clean_text(val).strip()
                wrapped_val = wrap_text(val_clean, font_value, max_text_w, draw)
                bbox_lbl = draw.textbbox((0, 0), lbl.upper(), font=font_label)
                lbl_h = bbox_lbl[3] - bbox_lbl[1]
                val_h, line_h = 0, 0
                if wrapped_val:
                    bbox_val = draw.textbbox((0, 0), wrapped_val[0], font=font_value)
                    line_h = (bbox_val[3] - bbox_val[1]) + 12
                    val_h = len(wrapped_val) * line_h
                box_h += lbl_h + 15 + val_h + 30
                parsed_content.append((lbl, wrapped_val, line_h, "text"))

        draw.rounded_rectangle([40, current_y, img_w - 40, current_y + box_h], radius=24, fill=(255, 255, 255))

        if is_first:
            draw.rectangle([40, current_y, img_w - 40, current_y + 24], fill=(255, 255, 255))
            draw.line([80, current_y + 70, img_w - 80, current_y + 70], fill=(229, 231, 235), width=3)
            draw.text((80, current_y + 25), "ДЕТАЛИ ЗАЯВКИ", fill=(31, 41, 55), font=font_header)
            text_y = current_y + 110
        else:
            text_y = current_y + padding_y

        for lbl, val_data, line_h, val_type in parsed_content:
            draw.text((80, text_y), lbl.upper(), fill=(156, 163, 175), font=font_label)
            text_y += 35
            if val_type == "text":
                if isinstance(val_data, str):
                    draw.text((80, text_y), val_data, fill=(107, 114, 128), font=font_value)
                    text_y += line_h
                else:
                    for line in val_data:
                        if line.strip():
                            draw.text((80, text_y), line.strip(), fill=(17, 24, 39), font=font_value)
                            text_y += line_h
            elif val_type == "list":
                for eq_name, eq_time, n_h, t_h in val_data:
                    draw.text((80, text_y), eq_name, fill=(37, 99, 235), font=font_value)
                    text_y += n_h
                    draw.text((80, text_y), eq_time, fill=(107, 114, 128), font=font_time)
                    text_y += t_h + 15
            text_y += 20
        return current_y + box_h + 20

    y_offset = draw_block([("ДАТА ВЫЕЗДА", date_str), ("АДРЕС ОБЪЕКТА", address)], y_offset, is_first=True)
    y_offset = draw_block([("ВЫБРАННЫЕ БРИГАДЫ", f"{team_name}\n(Прораб: {foreman})")], y_offset)
    y_offset = draw_block([("ТРЕБУЕМАЯ ТЕХНИКА", equip_list)], y_offset)
    if comment_str and comment_str.lower() != 'нет': y_offset = draw_block([("КОММЕНТАРИЙ", comment_str)], y_offset)

    img = img.crop((0, 0, img_w, int(y_offset) + 30))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf


async def notify_users(target_roles: list, text: str, url_path: str = "dashboard", extra_tg_ids: list = None):
    if db.conn is None: await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")

    async with db.conn.execute("SELECT value FROM settings WHERE key = 'max_group_chat_id'") as cur:
        row = await cur.fetchone()
        db_max_group_id = row[0] if row else None

    max_group_id = db_max_group_id or os.getenv("MAX_GROUP_CHAT_ID")

    tg_chat_ids = set()

    if "report_group" in target_roles:
        if group_id:
            tg_chat_ids.add(str(group_id))
        if max_group_id:
            tg_chat_ids.add(f"MAX_GROUP:{max_group_id}")

    roles_to_fetch = [r for r in target_roles if r != "report_group"]
    if roles_to_fetch:
        pl = ','.join(['?'] * len(roles_to_fetch))
        try:
            async with db.conn.execute(f"SELECT user_id FROM users WHERE role IN ({pl}) AND is_blacklisted = 0",
                                       roles_to_fetch) as cur:
                for row in await cur.fetchall():
                    if row[0]: tg_chat_ids.add(str(row[0]))
        except:
            pass

    if extra_tg_ids:
        for tid in extra_tg_ids:
            if tid: tg_chat_ids.add(str(tid))

    if not tg_chat_ids: return

    markup = {"inline_keyboard": [
        [{"text": "📱 Открыть платформу", "web_app": {"url": f"https://miniapp.viks22.ru/{url_path}"}}]]}

    max_plain_text = f"{strip_html(text)}\n\n📱 Платформа: https://miniapp.viks22.ru/{url_path}"
    max_bot = Bot(token=max_bot_token) if max_bot_token else None

    async with aiohttp.ClientSession() as session:
        for cid_raw in tg_chat_ids:
            cid_str = str(cid_raw)

            # Отправка в ГРУППУ MAX
            if cid_str.startswith("MAX_GROUP:"):
                actual_max_id = cid_str.split(":", 1)[1]
                if max_bot:
                    try:
                        await max_bot.send_message(chat_id=actual_max_id, text=max_plain_text)
                    except Exception as e:
                        print(f"MAX BOT GROUP NOTIFY ERROR: {e}")
                continue

            try:
                cid_int = int(cid_str)
            except ValueError:
                continue

            # Отправка ЛИЧНО В MAX
            if cid_int < 0:
                if max_bot:
                    actual_max_id = str(abs(cid_int))
                    try:
                        await max_bot.send_message(chat_id=actual_max_id, text=max_plain_text)
                    except Exception as e:
                        print(f"MAX BOT DM NOTIFY ERROR: {e}")

            # Отправка ЛИЧНО В TELEGRAM
            else:
                if bot_token:
                    try:
                        await session.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": cid_int, "text": text, "parse_mode": "HTML", "reply_markup": markup}
                        )
                    except:
                        pass


async def execute_app_publish(app_dict):
    if db.conn is None: await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")

    async with db.conn.execute("SELECT value FROM settings WHERE key = 'max_group_chat_id'") as cur:
        row = await cur.fetchone()
        db_max_group_id = row[0] if row else None

    max_group_id = db_max_group_id or os.getenv("MAX_GROUP_CHAT_ID")
    app_id = app_dict['id']

    if not ((bot_token and group_id) or (max_bot_token and max_group_id)):
        return False

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

    staff_str = ""
    workers_ids = []
    if staff_rows:
        for r in staff_rows:
            w_tg_id = r[2]
            if w_tg_id:
                staff_str += f"\n  ├ <a href='tg://user?id={w_tg_id}'>{r[0]}</a> (<i>{r[1]}</i>)"
                workers_ids.append(w_tg_id)
            else:
                staff_str += f"\n  ├ {r[0]} (<i>{r[1]}</i>)"
    else:
        staff_str = "\n  ├ Только техника"

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

    # Получаем абсолютный путь к файлу для передачи в InputMedia
    abs_filepath = os.path.abspath(filepath)

    comment_html = f"\n💬 <b>Комментарий:</b> {comment_text}" if comment_text and comment_text.lower() != 'нет' else ""

    approved_by_str = ""
    if app_dict.get('approved_by'):
        if app_dict.get('approved_by_id'):
            approved_by_str = f"\n🛡 <b>Одобрил(а):</b> <a href='tg://user?id={app_dict['approved_by_id']}'>{app_dict['approved_by']}</a>"
        else:
            approved_by_str = f"\n🛡 <b>Одобрил(а):</b> {app_dict['approved_by']}"

    html_caption = f"""<blockquote expandable>🟢 <b>УТВЕРЖДЕННЫЙ НАРЯД №{app_id}</b>\n📅 <b>Дата:</b> <code>{app_dict['date_target']}</code>\n📍 <b>Объект:</b> {app_dict['object_address']}\n🚜 <b>Техника:</b>\n{equip_html}👷‍♂️ <b>Прораб:</b> <a href='tg://user?id={app_dict['foreman_id']}'>{app_dict['foreman_name']}</a>\n👥 <b>Бригада «{team_name}»:</b>{staff_str}{comment_html}{approved_by_str}</blockquote>"""

    published_tg = False
    if bot_token and group_id:
        data = aiohttp.FormData()
        data.add_field('chat_id', str(group_id))
        data.add_field('photo', img_buf.getvalue(), filename='app.png', content_type='image/png')
        data.add_field('caption', html_caption)
        data.add_field('parse_mode', 'HTML')

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"https://api.telegram.org/bot{bot_token}/sendPhoto", data=data) as resp:
                    if resp.status == 200: published_tg = True
        except:
            pass

    published_max = False
    if max_bot_token and max_group_id:
        max_bot = Bot(token=max_bot_token)

        # 1. Отправляем КАРТИНКУ без текста
        try:
            await max_bot.send_message(
                chat_id=str(max_group_id),
                attachments=[InputMedia(path=abs_filepath)]
            )
            published_max = True
        except Exception as e:
            print(f"MAX BOT MEDIA ERROR: {e}")

        # 2. Отправляем ТЕКСТ наряда
        try:
            await max_bot.send_message(
                chat_id=str(max_group_id),
                text=strip_html(html_caption)
            )
            published_max = True
        except Exception as e:
            print(f"MAX BOT TEXT ERROR: {e}")

    if published_tg or published_max:
        try:
            await db.conn.execute("UPDATE applications SET status = 'published' WHERE id = ?", (app_id,))
            if eq_data_str:
                try:
                    for e in json.loads(eq_data_str): await db.conn.execute(
                        "UPDATE equipment SET status = 'work' WHERE id = ?", (e['id'],))
                except:
                    pass
            await db.conn.commit()
        except:
            await db.conn.rollback()

        all_involved = list(set(workers_ids + drivers_ids))
        if all_involved:
            msg_inv = f"👷‍♂️ <b>Вас добавили в наряд!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
            await notify_users([], msg_inv, "my-apps", extra_tg_ids=all_involved)
        return True
    return False