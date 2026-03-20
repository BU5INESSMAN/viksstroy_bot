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
    """Очищает текст от HTML тегов для мессенджера MAX"""
    if not text: return ""
    clean = re.compile('<.*?>')
    return re.sub(clean, '', str(text)).strip()


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


async def get_max_group_id():
    """Получает актуальный ID группы MAX"""
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT value FROM settings WHERE key = 'max_group_chat_id'") as cur:
        row = await cur.fetchone()
        if row and str(row[0]).strip().lower() not in ["none", "null", ""]:
            return str(row[0]).strip()

    env_val = os.getenv("MAX_GROUP_CHAT_ID")
    if env_val and str(env_val).strip().lower() not in ["none", "null", ""]:
        return str(env_val).strip()
    return None


async def get_max_mention(user_id_raw, user_name: str):
    """
    Умный поиск аккаунта: проверяет, есть ли у пользователя привязанный аккаунт MAX.
    Возвращает кликабельное упоминание @[id] для мессенджера MAX.
    """
    if not user_id_raw: return user_name
    try:
        uid = int(user_id_raw)
    except:
        return user_name

    max_id = None
    if uid < 0:
        max_id = abs(uid)
    else:
        # Если это пользователь Telegram (uid > 0), ищем его вторичный MAX-аккаунт
        if db.conn is None: await db.init_db()
        async with db.conn.execute("SELECT secondary_id FROM account_links WHERE primary_id = ? AND secondary_id < 0",
                                   (uid,)) as cur:
            row = await cur.fetchone()
            if row: max_id = abs(row[0])

    if max_id:
        return f"@[{max_id}]"
    return user_name


async def send_max_text(bot_token: str, chat_id: str, text: str):
    """Отправка текста в MAX. Работает И для личных сообщений (ЛС), И для групп"""
    if not bot_token or not chat_id or str(chat_id).lower() in ["none", "null", ""]:
        return False

    try:
        int_chat_id = int(str(chat_id).strip())
    except ValueError:
        return False

    try:
        bot = Bot(token=bot_token)
        await bot.send_message(chat_id=int_chat_id, text=str(text))
        return True
    except Exception as e:
        print(f"❌ Ошибка MAX API (send_max_text): {e}")
        return False


async def notify_users(target_roles: list, text: str, url_path: str = "dashboard", extra_tg_ids: list = None,
                       target_platform: str = "all"):
    """
    Универсальная рассылка.
    Теперь она УМЕЕТ отправлять в ЛС MAX, но НЕ СПАМИТ в группу MAX обычными системными уведомлениями.
    """
    if db.conn is None: await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")

    tg_chat_ids = set()

    # Группа MAX вырезана отсюда. Она получает ТОЛЬКО готовые наряды.
    if "report_group" in target_roles:
        if group_id: tg_chat_ids.add(str(group_id))

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

    async with aiohttp.ClientSession() as session:
        for cid_raw in tg_chat_ids:
            cid_str = str(cid_raw)

            # --- Отправка в ГРУППУ TELEGRAM ---
            if cid_str == str(group_id):
                if target_platform in ["all", "tg"] and bot_token:
                    try:
                        await session.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": cid_str, "text": text, "parse_mode": "HTML", "reply_markup": markup}
                        )
                    except:
                        pass
                continue

            try:
                cid_int = int(cid_str)
            except ValueError:
                continue

            # Определяем, куда слать ЛС: в TG, MAX или в оба (если аккаунты связаны)
            tg_id = None
            max_id = None

            if cid_int > 0:
                tg_id = cid_int
                # Ищем привязанный аккаунт MAX
                async with db.conn.execute(
                        "SELECT secondary_id FROM account_links WHERE primary_id = ? AND secondary_id < 0",
                        (cid_int,)) as cur:
                    row = await cur.fetchone()
                    if row: max_id = abs(row[0])
            else:
                max_id = abs(cid_int)
                # Ищем привязанный аккаунт Telegram
                async with db.conn.execute(
                        "SELECT secondary_id FROM account_links WHERE primary_id = ? AND secondary_id > 0",
                        (cid_int,)) as cur:
                    row = await cur.fetchone()
                    if row: tg_id = row[0]

            # --- Отправка ЛС В MAX ---
            if target_platform in ["all", "max"] and max_bot_token and max_id:
                await send_max_text(max_bot_token, str(max_id), max_plain_text)

            # --- Отправка ЛС В TELEGRAM ---
            if target_platform in ["all", "tg"] and bot_token and tg_id:
                try:
                    await session.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={"chat_id": tg_id, "text": text, "parse_mode": "HTML", "reply_markup": markup}
                    )
                except:
                    pass


async def execute_app_publish(app_dict, target_platform: str = "all"):
    """Здесь формируется финальный наряд и отправляется в ГРУППУ MAX"""
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

    # --- УМНОЕ ФОРМИРОВАНИЕ СПИСКА ---
    staff_str_tg = ""
    staff_str_max = ""
    workers_ids = []

    if staff_rows:
        for r in staff_rows:
            name, position, w_tg_id = r[0], r[1], r[2]
            if w_tg_id:
                workers_ids.append(w_tg_id)
                # Тег для TG
                staff_str_tg += f"\n  ├ <a href='tg://user?id={w_tg_id}'>{name}</a> (<i>{position}</i>)"
                # Умный тег для MAX @[id]
                mention_max = await get_max_mention(w_tg_id, name)
                staff_str_max += f"\n  ├ {mention_max} ({position})"
            else:
                staff_str_tg += f"\n  ├ {name} (<i>{position}</i>)"
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

    # Отметки для Прораба и Одобрившего
    foreman_id = app_dict.get('foreman_id', 0)
    foreman_name = app_dict.get('foreman_name', 'Неизвестно')
    foreman_tg = f"<a href='tg://user?id={foreman_id}'>{foreman_name}</a>" if int(foreman_id) > 0 else foreman_name
    foreman_max = await get_max_mention(foreman_id, foreman_name)

    approved_name = app_dict.get('approved_by', '')
    approved_id = app_dict.get('approved_by_id')
    approved_tg = f"\n🛡 <b>Одобрил(а):</b> <a href='tg://user?id={approved_id}'>{approved_name}</a>" if approved_id and int(
        approved_id) > 0 else f"\n🛡 <b>Одобрил(а):</b> {approved_name}"
    approved_max = f"\n🛡 Одобрил(а): {await get_max_mention(approved_id, approved_name)}" if approved_id else f"\n🛡 Одобрил(а): {approved_name}"

    # ФИНАЛЬНЫЕ ТЕКСТЫ
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
            async with aiohttp.ClientSession() as session:
                async with session.post(f"https://api.telegram.org/bot{bot_token}/sendPhoto", data=data) as resp:
                    if resp.status == 200: published_tg = True
        except:
            pass

    published_max = False
    if target_platform in ["all", "max"] and max_bot_token and max_group_id:

        photo_sent = False
        try:
            max_bot = Bot(token=max_bot_token)
            await max_bot.send_message(
                chat_id=int(max_group_id),
                attachments=[InputMedia(path=os.path.abspath(filepath))]
            )
            photo_sent = True
        except Exception as e:
            print(f"❌ Ошибка фото в MAX: {e}")

        final_text = max_caption
        if not photo_sent:
            final_text += f"\n\n🖼 Наряд: {file_url}"

        published_max = await send_max_text(max_bot_token, max_group_id, final_text)

    # 3. Рассылка ЛИЧНЫХ СООБЩЕНИЙ всем участникам наряда
    if (published_tg or published_max) and target_platform == "all":
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
        if app_dict.get('foreman_id'):
            all_involved.append(app_dict['foreman_id'])

        if all_involved:
            # Эти ЛС теперь уйдут и в Telegram, и в MAX!
            msg_inv = f"👷‍♂️ <b>Вас добавили в наряд!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
            await notify_users([], msg_inv, "my-apps", extra_tg_ids=all_involved)
        return True
    return False