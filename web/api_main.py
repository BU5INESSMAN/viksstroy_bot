from fastapi import FastAPI, Form, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from database.db_manager import DatabaseManager
import os
import hashlib
import hmac
import time
import aiohttp
import json
import uuid
import base64
import urllib.request
import ssl
import re
import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw, ImageFont
import io
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ВИКС Расписание API")

origins = ["*"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])

db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

os.makedirs("data/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")

TZ_BARNAUL = ZoneInfo("Asia/Barnaul")


async def fetch_teams_dict():
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
        except Exception as e:
            print(f"Font download error: {e}")


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
    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    tg_chat_ids = set()

    if "report_group" in target_roles and group_id:
        tg_chat_ids.add(str(group_id))

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

    if not bot_token or not tg_chat_ids: return

    markup = {"inline_keyboard": [
        [{"text": "📱 Открыть платформу", "web_app": {"url": f"https://miniapp.viks22.ru/{url_path}"}}]]}

    async with aiohttp.ClientSession() as session:
        for cid in tg_chat_ids:
            try:
                await session.post(f"https://api.telegram.org/bot{bot_token}/sendMessage",
                                   json={"chat_id": cid, "text": text, "parse_mode": "HTML", "reply_markup": markup})
            except:
                pass


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        async with db.conn.execute("SELECT fio, action FROM logs ORDER BY id DESC LIMIT 1") as cur:
            row = await cur.fetchone()
            last_user = row[0] if row else "Неизвестно"
            last_action = row[1] if row else "Нет данных"
        err_msg = f"🚨 <b>ОШИБКА СИСТЕМЫ (500)</b>\n\n👤 <b>Юзер:</b> {last_user}\n👣 <b>Действие:</b> {last_action}\n❌ <b>Ошибка:</b> {str(exc)}"
        await notify_users(["report_group"], err_msg, "system")
    except:
        pass
    return JSONResponse(status_code=500, content={"detail": f"Внутренняя ошибка сервера"})


last_auto_publish_date = None
last_reminder_date = None


async def background_scheduler():
    global last_auto_publish_date, last_reminder_date
    while True:
        try:
            now = datetime.now(TZ_BARNAUL)
            current_time_str = now.strftime("%H:%M")
            current_date_str = now.strftime("%Y-%m-%d")
            is_weekend = now.weekday() >= 5

            async with db.conn.execute("SELECT key, value FROM settings") as cur:
                settings = {r[0]: r[1] for r in await cur.fetchall()}

            auto_pub_time = settings.get('auto_publish_time', '')
            rem_time = settings.get('foreman_reminder_time', '')
            rem_weekends = settings.get('foreman_reminder_weekends', '0') == '1'

            if auto_pub_time and current_time_str == auto_pub_time and last_auto_publish_date != current_date_str:
                last_auto_publish_date = current_date_str
                async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved' AND date_target = ?",
                                           (current_date_str,)) as cur:
                    apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

                if apps:
                    count = 0
                    for app_dict in apps:
                        if await execute_app_publish(app_dict): count += 1
                    await db.add_log(0, "Система", f"Авто-публикация: {count} нарядов")

            if rem_time and current_time_str == rem_time and last_reminder_date != current_date_str:
                if not is_weekend or rem_weekends:
                    last_reminder_date = current_date_str
                    await notify_users(["foreman"],
                                       "🔔 <b>Напоминание</b>\nПожалуйста, не забудьте заполнить и отправить заявки на следующий день!",
                                       "dashboard")

            if current_time_str >= '08:00':
                async with db.conn.execute(
                        "SELECT * FROM applications WHERE status = 'published' AND date_target = ? AND is_started_notified = 0",
                        (current_date_str,)) as cur:
                    apps_to_start = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

                if apps_to_start:
                    for app_dict in apps_to_start:
                        workers_ids = []
                        selected_list = [int(x.strip()) for x in
                                         app_dict.get('selected_members', '').split(',')] if app_dict.get(
                            'selected_members') else []
                        if selected_list:
                            pl = ','.join(['?'] * len(selected_list))
                            async with db.conn.execute(f"SELECT tg_id FROM team_members WHERE id IN ({pl})",
                                                       selected_list) as cur:
                                for r in await cur.fetchall():
                                    if r[0]: workers_ids.append(r[0])

                        drivers_ids = []
                        eq_data_str = app_dict.get('equipment_data', '')
                        if eq_data_str:
                            try:
                                for eq in json.loads(eq_data_str):
                                    async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?",
                                                               (eq['id'],)) as cur:
                                        eq_row = await cur.fetchone()
                                        if eq_row and eq_row[0]: drivers_ids.append(eq_row[0])
                            except:
                                pass

                        all_involved = list(set(workers_ids + drivers_ids))
                        if app_dict.get('foreman_id'):
                            all_involved.append(app_dict['foreman_id'])

                        if all_involved:
                            msg = f"🚀 <b>Наряд начался!</b>\n📍 Объект: {app_dict['object_address']}\nУдачной смены и безопасной работы!"
                            await notify_users([], msg, "my-apps", extra_tg_ids=all_involved)

                        try:
                            await db.conn.execute("UPDATE applications SET is_started_notified = 1 WHERE id = ?",
                                                  (app_dict['id'],))
                            await db.conn.commit()
                        except:
                            await db.conn.rollback()

        except Exception as e:
            pass
        await asyncio.sleep(30)


@app.on_event("startup")
async def startup():
    await db.init_db()
    # Создаем таблицу для хранения токенов авторизации MAX (если ее еще нет)
    try:
        await db.conn.execute("CREATE TABLE IF NOT EXISTS web_codes (code TEXT, max_id INTEGER, expires REAL)")
        await db.conn.commit()
    except:
        pass
    asyncio.create_task(background_scheduler())


@app.on_event("shutdown")
async def shutdown():
    await db.close()

# =======================================================
# АВТОРИЗАЦИЯ В MAX ИЛИ БРАУЗЕРЕ (С ТОКЕНОМ И БЕЗ)
# =======================================================

@app.post("/api/max/web_auth")
async def max_web_auth(code: str = Form(...)):
    async with db.conn.execute("SELECT max_id, expires FROM web_codes WHERE code = ?", (code,)) as cur:
        row = await cur.fetchone()

    if not row or time.time() > row[1]:
        raise HTTPException(400, "Код недействителен или устарел")

    max_id = row[0]
    pseudo_tg_id = -int(max_id)
    user = await db.get_user(pseudo_tg_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден. Зарегистрируйтесь в боте (/start)")

    await db.conn.execute("DELETE FROM web_codes WHERE code = ?", (code,))
    await db.conn.commit()

    return {"status": "ok", "role": dict(user)['role'], "tg_id": dict(user)['user_id']}


@app.get("/api/settings")
async def get_settings():
    async with db.conn.execute("SELECT key, value FROM settings") as cur:
        rows = await cur.fetchall()
    return {r[0]: r[1] for r in rows}


@app.post("/api/settings/update")
async def update_settings(auto_publish_time: str = Form(""), foreman_reminder_time: str = Form(""),
                          foreman_reminder_weekends: str = Form("0"), tg_id: int = Form(0)):
    user = await db.get_user(tg_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']: raise HTTPException(403,
                                                                                                          "Нет прав")
    try:
        await db.conn.execute("UPDATE settings SET value = ? WHERE key = 'auto_publish_time'", (auto_publish_time,))
        await db.conn.execute("UPDATE settings SET value = ? WHERE key = 'foreman_reminder_time'",
                              (foreman_reminder_time,))
        await db.conn.execute("UPDATE settings SET value = ? WHERE key = 'foreman_reminder_weekends'",
                              (foreman_reminder_weekends,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
        raise HTTPException(500, "Database error")
    await db.add_log(tg_id, dict(user).get('fio'), "Обновил системные настройки")
    return {"status": "ok"}


@app.post("/api/telegram_auth")
async def telegram_auth(data: dict):
    try:
        bot_token = os.getenv("BOT_TOKEN")
        received_hash = data.pop('hash', None)
        if time.time() - int(data.get('auth_date', 0)) > 86400: raise HTTPException(status_code=403,
                                                                                    detail="Данные устарели")
        data_check_string = "\n".join([f"{k}={data[k]}" for k in sorted(data.keys()) if data[k] is not None])
        secret_key = hashlib.sha256(bot_token.encode()).digest()
        hash_calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if hash_calc != received_hash: raise HTTPException(status_code=403, detail="Неверная подпись")

        tg_id = int(data['id'])
        photo_url = data.get('photo_url', '')
        user = await db.get_user(tg_id)
        if user:
            user_dict = dict(user)
            if user_dict.get('is_blacklisted'): raise HTTPException(status_code=403, detail="Заблокирован")
            if photo_url and not user_dict.get('avatar_url'):
                await db.update_user_avatar(tg_id, photo_url)
                user_dict['avatar_url'] = photo_url
            return {"status": "ok", "role": user_dict['role'], "fio": user_dict['fio'], "tg_id": tg_id,
                    "avatar_url": user_dict.get('avatar_url', photo_url)}
        return {"status": "needs_password", "tg_id": tg_id, "first_name": data.get('first_name', ''),
                "last_name": data.get('last_name', ''), "photo_url": photo_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


@app.post("/api/tma/auth")
async def api_tma_auth(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form("")):
    user = await db.get_user(tg_id)
    if user:
        user_dict = dict(user)
        if user_dict.get('is_blacklisted'): raise HTTPException(status_code=403, detail="Заблокирован")
        return {"status": "ok", "role": user_dict['role'], "fio": user_dict['fio'], "tg_id": tg_id}
    return {"status": "needs_password", "tg_id": tg_id, "first_name": first_name, "last_name": last_name}


@app.post("/api/register_telegram")
async def register_telegram(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form(""),
                            password: str = Form(...), photo_url: str = Form("")):
    role = None
    if password == os.getenv("FOREMAN_PASS"):
        role = "foreman"
    elif password == os.getenv("MODERATOR_PASS"):
        role = "moderator"
    elif password == os.getenv("BOSS_PASS"):
        role = "boss"
    elif password == os.getenv("SUPERADMIN_PASS"):
        role = "superadmin"

    if not role: raise HTTPException(status_code=401, detail="Неверный пароль")
    fio = f"{last_name} {first_name}".strip() or f"Пользователь {tg_id}"
    await db.add_user(tg_id, fio, role)
    if photo_url: await db.update_user_avatar(tg_id, photo_url)
    await db.add_log(tg_id, fio, f"Зарегистрировался (Роль: {role})")
    await notify_users(["report_group", "moderator"], f"🆕 <b>Новая регистрация</b>\n👤 {fio}\n💼 {role}", "system")
    return {"status": "ok", "role": role, "tg_id": tg_id}


@app.get("/api/dashboard")
async def get_dashboard_data(tg_id: int = 0):
    stats = await db.get_general_statistics()
    teams = await db.get_all_teams()
    teams_dict = {t['id']: t['name'] for t in teams}

    async with db.conn.execute("SELECT * FROM equipment ORDER BY category, name") as cur:
        equip = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    async with db.conn.execute(
            "SELECT DISTINCT category FROM equipment WHERE category IS NOT NULL AND category != ''") as cur:
        cat_rows = await cur.fetchall()
    categories = [r[0].strip().capitalize() for r in cat_rows if r[0].strip()]

    async with db.conn.execute(
            "SELECT * FROM applications WHERE date_target >= date('now', '-14 days') ORDER BY id DESC") as cur:
        all_apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

    for a in all_apps:
        enrich_app_with_team_name(a, teams_dict)

    recent_addresses = []
    if tg_id > 0:
        async with db.conn.execute("SELECT object_address FROM applications WHERE foreman_id = ? ORDER BY id DESC",
                                   (tg_id,)) as cur:
            for r in await cur.fetchall():
                if r[0] and r[0] not in recent_addresses: recent_addresses.append(r[0])
                if len(recent_addresses) >= 5: break

    return {"stats": stats, "teams": [{"id": t['id'], "name": t['name']} for t in teams], "equipment": equip,
            "equip_categories": list(set(categories)), "kanban_apps": all_apps, "recent_addresses": recent_addresses}


@app.get("/api/logs")
async def get_logs(): return await db.get_recent_logs(50)


@app.get("/api/users")
async def api_get_users():
    users = await db.get_all_users()
    return [{"user_id": dict(u)['user_id'], "fio": dict(u)['fio'], "role": dict(u)['role'],
             "is_blacklisted": dict(u)['is_blacklisted'], "avatar_url": dict(u).get('avatar_url', '')} for u in users]


@app.get("/api/users/{target_id}/profile")
async def api_get_profile(target_id: int):
    profile = await db.get_user_full_profile(target_id)
    if not profile: raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {"profile": profile, "logs": await db.get_specific_user_logs(target_id)}


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


@app.post("/api/users/{target_id}/update_avatar")
async def api_update_avatar(target_id: int, avatar_url: str = Form(""), avatar_base64: str = Form(""),
                            tg_id: int = Form(0)):
    final_url = avatar_url
    if avatar_base64: final_url = process_base64_image(avatar_base64, f"avatar_{target_id}") or avatar_url
    if final_url: await db.update_user_avatar(target_id, final_url)
    return {"status": "ok", "avatar_url": final_url}


@app.post("/api/users/{target_id}/update_profile")
async def api_update_profile(target_id: int, tg_id: int = Form(...), fio: str = Form(...), role: str = Form(...),
                             team_id: int = Form(0), position: str = Form("")):
    admin = await db.get_user(tg_id)
    if not admin or admin['role'] not in ['superadmin', 'boss', 'moderator']: raise HTTPException(status_code=403,
                                                                                                  detail="Нет прав")
    await db.update_user_profile_data(target_id, fio, role)
    profile = await db.get_user_full_profile(target_id)
    if profile['member_id']:
        if team_id > 0:
            await db.conn.execute("UPDATE team_members SET team_id = ?, position = ? WHERE id = ?",
                                  (team_id, position, profile['member_id']))
        else:
            await db.conn.execute("DELETE FROM team_members WHERE id = ?", (profile['member_id'],))
    elif team_id > 0:
        await db.conn.execute("INSERT INTO team_members (team_id, fio, position, tg_id) VALUES (?, ?, ?, ?)",
                              (team_id, fio, position, target_id))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/users/{target_id}/delete")
async def api_delete_user(target_id: int, tg_id: int = Form(...)):
    admin = await db.get_user(tg_id)
    if not admin or dict(admin).get('role') not in ['superadmin', 'boss', 'moderator']: raise HTTPException(403,
                                                                                                            "Нет прав")
    try:
        await db.conn.execute("DELETE FROM users WHERE user_id = ?", (target_id,))
        await db.conn.execute("DELETE FROM team_members WHERE tg_id = ?", (target_id,))
        await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE tg_id = ?", (target_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}


@app.post("/api/teams/{team_id}/generate_invite")
async def api_generate_invite(team_id: int):
    invite_code, join_password = await db.generate_team_invite(team_id)
    return {"invite_link": f"https://miniapp.viks22.ru/invite/{invite_code}", "join_password": join_password}


@app.get("/api/invite/{invite_code}")
async def api_get_invite_info(invite_code: str):
    team = await db.get_team_by_invite(invite_code)
    if not team: raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return {"team_name": team['name'],
            "unclaimed_workers": [{"id": w['id'], "fio": w['fio'], "position": w['position']} for w in
                                  await db.get_unclaimed_workers(team['id'])]}


@app.post("/api/invite/join")
async def api_join_team(invite_code: str = Form(...), worker_id: int = Form(...), tg_id: int = Form(...)):
    team = await db.get_team_by_invite(invite_code)
    await db.conn.execute("UPDATE team_members SET tg_user_id = ? WHERE id = ?", (tg_id, worker_id))
    user = await db.get_user(tg_id)
    async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
        w_row = await cur.fetchone()
        fio = w_row[0] if w_row else f"Рабочий {tg_id}"
    if not user:
        await db.add_user(tg_id, fio, "worker")
    elif user['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
        await db.update_user_role(tg_id, "worker")
    await db.conn.commit()
    await notify_users(["report_group"],
                       f"🔗 <b>Привязка аккаунта</b>\nРабочий {fio} привязал Telegram к бригаде «{team['name']}».",
                       "teams")
    return {"status": "ok"}


@app.post("/api/teams/create")
async def create_team(name: str = Form(...), tg_id: int = Form(0), fio: str = Form("Пользователь")):
    await db.conn.execute("INSERT INTO teams (name) VALUES (?)", (name,))
    await db.conn.commit()
    await notify_users(["report_group"], f"🏗 <b>Новая бригада</b>\n{fio} создал бригаду «{name}»", "teams")
    return {"status": "ok"}


@app.get("/api/teams/{team_id}/details")
async def get_team_details(team_id: int):
    async with db.conn.execute("SELECT name FROM teams WHERE id = ?",
                               (team_id,)) as cur: team_row = await cur.fetchone()
    async with db.conn.execute(
            "SELECT id, fio, position, tg_user_id, is_foreman FROM team_members WHERE team_id = ? ORDER BY is_foreman DESC, id ASC",
            (team_id,)) as cur:
        members = [{"id": r[0], "fio": r[1], "position": r[2], "is_linked": bool(r[3]), "is_foreman": bool(r[4])} for r
                   in await cur.fetchall()]
    return {"id": team_id, "name": team_row[0], "members": members}


@app.post("/api/teams/{team_id}/members/add")
async def add_team_member(team_id: int, fio: str = Form(...), position: str = Form(...), is_foreman: int = Form(0),
                          tg_id: int = Form(0), admin_fio: str = Form("Пользователь")):
    await db.conn.execute("INSERT INTO team_members (team_id, fio, position, is_foreman) VALUES (?, ?, ?, ?)",
                          (team_id, fio, position, is_foreman))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/teams/members/{member_id}/toggle_foreman")
async def toggle_foreman(member_id: int, is_foreman: int = Form(...), tg_id: int = Form(0),
                         admin_fio: str = Form("Пользователь")):
    await db.conn.execute("UPDATE team_members SET is_foreman = ? WHERE id = ?", (is_foreman, member_id))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/teams/members/{member_id}/delete")
async def delete_team_member(member_id: int, tg_id: int = Form(0), admin_fio: str = Form("Пользователь")):
    await db.conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/teams/{team_id}/delete")
async def delete_entire_team(team_id: int, tg_id: int = Form(0)):
    user = await db.get_user(tg_id)
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
    await db.add_log(tg_id, dict(user).get('fio', 'Система'), f"Удалил бригаду «{t_name}»")
    return {"status": "ok"}


@app.post("/api/applications/create")
async def create_app(tg_id: int = Form(...), team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form("")):
    user = await db.get_user(tg_id)
    fio = dict(user).get('fio', 'Web-Пользователь') if user else "Web-Пользователь"
    await db.conn.execute(
        "INSERT INTO applications (foreman_id, foreman_name, team_id, equip_id, date_target, object_address, time_start, time_end, comment, status, selected_members, equipment_data) VALUES (?, ?, ?, 0, ?, ?, '08', '17', ?, 'waiting', ?, ?)",
        (tg_id, fio, team_id, date_target, object_address, comment, selected_members, equipment_data))
    await db.conn.commit()
    await notify_users(["report_group", "moderator"],
                       f"📝 <b>Новая заявка на выезд</b>\n👷‍♂️ Прораб: {fio}\n📍 Объект: {object_address}\n📅 Дата: {date_target}",
                       "review")
    return {"status": "ok"}


@app.post("/api/applications/{app_id}/update")
async def update_app(app_id: int, tg_id: int = Form(...), team_id: str = Form("0"), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form("")):
    user = await db.get_user(tg_id)
    if not user: raise HTTPException(403)
    async with db.conn.execute("SELECT status FROM applications WHERE id = ?", (app_id,)) as cur:
        row = await cur.fetchone()
        if not row or row[0] != 'waiting': raise HTTPException(400,
                                                               "Заявка уже в работе или проверена, редактирование запрещено")
    try:
        await db.conn.execute(
            "UPDATE applications SET team_id=?, date_target=?, object_address=?, comment=?, selected_members=?, equipment_data=? WHERE id = ?",
            (team_id, date_target, object_address, comment, selected_members, equipment_data, app_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await db.add_log(tg_id, dict(user).get('fio', 'Пользователь'), f"Отредактировал заявку №{app_id}")
    return {"status": "ok"}


@app.get("/api/applications/review")
async def get_review_apps():
    teams_dict = await fetch_teams_dict()
    async with db.conn.execute(
            "SELECT * FROM applications WHERE status IN ('waiting', 'approved', 'published') ORDER BY id DESC") as cursor:
        rows = await cursor.fetchall()
    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
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


@app.post("/api/applications/{app_id}/review")
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


async def execute_app_publish(app_dict):
    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
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
    comment_html = f"\n💬 <b>Комментарий:</b> {comment_text}" if comment_text and comment_text.lower() != 'нет' else ""

    approved_by_str = ""
    if app_dict.get('approved_by'):
        if app_dict.get('approved_by_id'):
            approved_by_str = f"\n🛡 <b>Одобрил(а):</b> <a href='tg://user?id={app_dict['approved_by_id']}'>{app_dict['approved_by']}</a>"
        else:
            approved_by_str = f"\n🛡 <b>Одобрил(а):</b> {app_dict['approved_by']}"

    html_caption = f"""<blockquote expandable>🟢 <b>УТВЕРЖДЕННЫЙ НАРЯД №{app_id}</b>\n📅 <b>Дата:</b> <code>{app_dict['date_target']}</code>\n📍 <b>Объект:</b> {app_dict['object_address']}\n🚜 <b>Техника:</b>\n{equip_html}👷‍♂️ <b>Прораб:</b> <a href='tg://user?id={app_dict['foreman_id']}'>{app_dict['foreman_name']}</a>\n👥 <b>Бригада «{team_name}»:</b>{staff_str}{comment_html}{approved_by_str}</blockquote>"""

    if not bot_token or not group_id: return False

    data = aiohttp.FormData()
    data.add_field('chat_id', str(group_id))
    data.add_field('photo', img_buf.getvalue(), filename='app.png', content_type='image/png')
    data.add_field('caption', html_caption)
    data.add_field('parse_mode', 'HTML')

    published = False
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"https://api.telegram.org/bot{bot_token}/sendPhoto", data=data) as resp:
                if resp.status == 200: published = True
    except:
        pass

    if published:
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


@app.post("/api/applications/publish")
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


@app.post("/api/cron/start_day")
async def cron_start_day(): return {"status": "ok"}


@app.post("/api/cron/end_day")
async def cron_end_day(): return {"status": "ok"}


@app.post("/api/cron/check_timeouts")
async def cron_check_timeouts(): return {"status": "ok"}


@app.get("/api/applications/active")
async def get_active_app(tg_id: int):
    user = await db.get_user(tg_id)
    if not user: return []
    role = dict(user).get('role')
    if role in ['superadmin', 'boss', 'moderator']: return []

    teams_dict = await fetch_teams_dict()
    async with db.conn.execute(
            "SELECT * FROM applications WHERE status IN ('approved', 'published') ORDER BY date_target ASC") as cursor:
        rows = await cursor.fetchall()

    result = []
    for row in rows:
        app_dict = dict(zip([col[0] for col in cursor.description], row))
        enrich_app_with_team_name(app_dict, teams_dict)
        involved = False

        if role == 'foreman' and app_dict['foreman_id'] == tg_id: involved = True

        if role in ['worker', 'foreman']:
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0]:
                    t_ids = [int(x) for x in str(app_dict['team_id']).split(',') if x.strip().isdigit()]
                    if tm_row[0] in t_ids: involved = True

        if role == 'driver':
            async with db.conn.execute("SELECT id FROM equipment WHERE tg_id = ?", (tg_id,)) as cur:
                eq_row = await cur.fetchone()
                if eq_row:
                    my_eq_id = eq_row[0]
                    eq_data_str = app_dict.get('equipment_data', '')
                    if eq_data_str:
                        try:
                            eq_list = json.loads(eq_data_str)
                            if any(e['id'] == my_eq_id for e in eq_list): involved = True
                        except:
                            pass
        if involved: result.append(app_dict)
    return result


@app.get("/api/applications/my")
async def get_my_apps(tg_id: int):
    user = await db.get_user(tg_id)
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
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0]:
                    t_ids = [int(x) for x in str(app_dict['team_id']).split(',') if x.strip().isdigit()]
                    if tm_row[0] in t_ids: involved = True
        if role in ['driver']:
            async with db.conn.execute("SELECT id FROM equipment WHERE tg_id = ?", (tg_id,)) as cur:
                eq_row = await cur.fetchone()
                if eq_row:
                    my_eq_id = eq_row[0]
                    if any(e['id'] == my_eq_id for e in equip_list): involved = True
        if involved: result.append(app_dict)
    return result


@app.post("/api/equipment/set_free")
async def set_equipment_free(tg_id: int = Form(...)):
    try:
        await db.conn.execute("UPDATE equipment SET status = 'free' WHERE tg_id = ?", (tg_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()

    user = await db.get_user(tg_id)
    if user:
        fio = dict(user).get('fio', '')
        await db.add_log(tg_id, fio, "Освободил свою технику")
        await notify_users(["report_group"], f"🟢 <b>Техника освобождена</b>\nВодитель {fio} завершил работу.",
                           "equipment")
    return {"status": "ok"}


@app.get("/api/equipment/admin_list")
async def admin_equip_list():
    async with db.conn.execute("SELECT * FROM equipment ORDER BY category, name") as cur: rows = await cur.fetchall()
    return [dict(zip([c[0] for c in cur.description], r)) for r in rows]


@app.post("/api/equipment/add")
async def add_equipment(name: str = Form(...), category: str = Form(...), driver: str = Form(""), tg_id: int = Form(0)):
    try:
        await db.conn.execute("INSERT INTO equipment (name, category, driver, status) VALUES (?, ?, ?, 'free')",
                              (name, category, driver))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await notify_users(["report_group"], f"🚜 <b>Автопарк изменен</b>\nДобавлена новая техника: {name}", "equipment")
    return {"status": "ok"}


@app.post("/api/equipment/bulk_add")
async def bulk_add_equipment(request: Request):
    data = await request.json()
    items = data.get("items", [])
    count = 0
    try:
        for item in items:
            name = item.get("name", "").strip()
            category = item.get("category", "Другое").strip()
            driver = item.get("driver", "").strip()
            if name:
                await db.conn.execute("INSERT INTO equipment (name, category, driver, status) VALUES (?, ?, ?, 'free')",
                                      (name, category, driver))
                count += 1
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await notify_users(["report_group"], f"🚜 <b>Массовая загрузка</b>\nДобавлено {count} единиц техники.", "equipment")
    return {"status": "ok", "added": count}


@app.post("/api/equipment/{equip_id}/update_photo")
async def update_equip_photo(equip_id: int, photo_base64: str = Form(...), tg_id: int = Form(0)):
    url = process_base64_image(photo_base64, f"equip_{equip_id}")
    if url:
        try:
            await db.conn.execute("UPDATE equipment SET photo_url=? WHERE id=?", (url, equip_id))
            await db.conn.commit()
        except:
            await db.conn.rollback()
        return {"status": "ok", "photo_url": url}
    raise HTTPException(400, "Ошибка фото")


@app.post("/api/equipment/{equip_id}/update")
async def update_equipment(equip_id: int, name: str = Form(...), category: str = Form(...), driver: str = Form(""),
                           status: str = Form("free"), tg_id: int = Form(0)):
    try:
        await db.conn.execute("UPDATE equipment SET name=?, category=?, driver=?, status=? WHERE id=?",
                              (name, category, driver, status, equip_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}


@app.post("/api/equipment/{equip_id}/delete")
async def delete_equipment(equip_id: int, tg_id: int = Form(0)):
    try:
        await db.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}


@app.post("/api/equipment/{equip_id}/generate_invite")
async def generate_equip_invite(equip_id: int):
    async with db.conn.execute("SELECT invite_code FROM equipment WHERE id = ?", (equip_id,)) as cursor:
        row = await cursor.fetchone()
        if row and row[0]:
            code = row[0]
        else:
            code = str(uuid.uuid4())[:8]
            try:
                await db.conn.execute("UPDATE equipment SET invite_code = ? WHERE id = ?", (code, equip_id))
                await db.conn.commit()
            except:
                await db.conn.rollback()
    return {"invite_link": f"https://miniapp.viks22.ru/equip-invite/{code}",
            "tg_bot_link": f"https://t.me/{os.getenv('BOT_USERNAME', 'viksstroy_bot')}?start=equip_{code}"}


@app.get("/api/equipment/invite/{invite_code}")
async def get_equip_invite_info(invite_code: str):
    async with db.conn.execute("SELECT * FROM equipment WHERE invite_code = ?", (invite_code,)) as cur:
        row = await cur.fetchone()
    if not row: raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return dict(zip([c[0] for c in cur.description], row))


@app.post("/api/equipment/invite/join")
async def join_equipment(invite_code: str = Form(...), tg_id: int = Form(...)):
    async with db.conn.execute("SELECT id, name FROM equipment WHERE invite_code = ?", (invite_code,)) as cur:
        eq_row = await cur.fetchone()
    if not eq_row: raise HTTPException(status_code=404, detail="Техника не найдена")

    try:
        await db.conn.execute("UPDATE equipment SET tg_id = ? WHERE id = ?", (tg_id, eq_row[0]))

        user = await db.get_user(tg_id)
        fio = dict(user).get('fio', f"Пользователь {tg_id}") if user else f"Пользователь {tg_id}"
        if not user:
            await db.add_user(tg_id, fio, "driver")
        elif dict(user)['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
            await db.update_user_role(tg_id, "driver")
        await db.conn.commit()
    except:
        await db.conn.rollback()

    await notify_users(["report_group"],
                       f"🔗 <b>Привязка аккаунта</b>\nВодитель {fio} привязан к технике «{eq_row[1]}».", "equipment")
    return {"status": "ok"}


@app.post("/api/equipment/{equip_id}/unlink")
async def unlink_equipment(equip_id: int, tg_id: int = Form(0)):
    try:
        await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE id = ?", (equip_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}