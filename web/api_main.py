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
import re
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


# --- НОВЫЙ ГЕНЕРАТОР КАРТИНОК НАРЯДОВ (ДИЗАЙН КАК НА САЙТЕ) ---
def download_font(url, filename):
    if not os.path.exists(filename):
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        try:
            urllib.request.urlretrieve(url, filename)
        except Exception as e:
            print(f"Font download error: {e}")


def get_fonts():
    font_dir = "data/fonts"
    os.makedirs(font_dir, exist_ok=True)
    reg_path = os.path.join(font_dir, "Roboto-Regular.ttf")
    bold_path = os.path.join(font_dir, "Roboto-Bold.ttf")

    # Безопасное скачивание (обход проблем с сертификатами SSL в Docker)
    import ssl
    try:
        _create_unverified_https_context = ssl._create_unverified_context
    except AttributeError:
        pass
    else:
        ssl._create_default_https_context = _create_unverified_https_context

    download_font("https://github.com/google/fonts/raw/main/ofl/roboto/Roboto-Regular.ttf", reg_path)
    download_font("https://github.com/google/fonts/raw/main/ofl/roboto/Roboto-Bold.ttf", bold_path)

    try:
        font_title = ImageFont.truetype(bold_path, 36)
        font_label = ImageFont.truetype(reg_path, 20)
        font_value = ImageFont.truetype(bold_path, 28)
    except Exception as e:
        font_title = font_label = font_value = ImageFont.load_default()

    return font_title, font_label, font_value


def clean_text(text):
    """Удаляет эмодзи, чтобы не рисовались квадраты"""
    if not text: return ""
    return re.sub(r'[^\w\sА-Яа-яЁёA-Za-z0-9,.:\-!/()«»]', '', str(text))


def create_app_image(date_str, address, foreman, team_name, equip_text, comment_str=""):
    font_title, font_label, font_value = get_fonts()

    img_w = 800
    img_h = 1400  # Высота с запасом (потом обрезаем)
    img = Image.new('RGB', (img_w, img_h), color=(243, 244, 246))  # Фон как на сайте bg-gray-100
    draw = ImageDraw.Draw(img)

    logo_x, logo_y = 40, 40
    logo_path = "frontend/public/logo.png"

    logo_drawn = False
    if os.path.exists(logo_path):
        try:
            logo_img = Image.open(logo_path).convert("RGBA")
            aspect = logo_img.width / logo_img.height
            new_h = 50
            new_w = int(new_h * aspect)
            logo_img = logo_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            # Вставляем логотип (с прозрачностью)
            img.paste(logo_img, (logo_x, logo_y), logo_img)
            draw.text((logo_x + new_w + 15, logo_y), "ВИКС", fill=(37, 99, 235), font=font_title)
            logo_drawn = True
        except:
            pass

    if not logo_drawn:
        draw.text((logo_x, logo_y), "ВИКС Расписание", fill=(37, 99, 235), font=font_title)

    draw.text((logo_x, logo_y + 80), "ДЕТАЛИ ЗАЯВКИ", fill=(31, 41, 55), font=font_title)

    y_offset = 190

    def draw_block(content_pairs, current_y):
        padding = 30
        line_height = 40

        box_h = padding * 2
        for lbl, val in content_pairs:
            box_h += 30
            val_lines = clean_text(val).strip().split('\n')
            box_h += len(val_lines) * line_height + 15

            # Рисуем белую карточку (блок как на сайте)
        draw.rounded_rectangle([40, current_y, 760, current_y + box_h], radius=16, fill=(255, 255, 255),
                               outline=(229, 231, 235), width=2)

        text_y = current_y + padding
        for lbl, val in content_pairs:
            draw.text((70, text_y), lbl.upper(), fill=(107, 114, 128), font=font_label)
            text_y += 30
            val_lines = clean_text(val).strip().split('\n')
            for line in val_lines:
                if line.strip():
                    color = (37, 99, 235) if "ТЕХНИКА" in lbl else (31, 41, 55)
                    draw.text((70, text_y), line.strip(), fill=color, font=font_value)
                    text_y += line_height
            text_y += 15

        return current_y + box_h + 20

    # Блоки заявки
    y_offset = draw_block([("ДАТА ВЫЕЗДА", date_str), ("АДРЕС ОБЪЕКТА", address)], y_offset)
    y_offset = draw_block([("ВЫБОР БРИГАДЫ", f"{team_name}\n(Прораб: {foreman})")], y_offset)

    eq_text = "Не требуется" if not equip_text else equip_text
    y_offset = draw_block([("ТРЕБУЕМАЯ ТЕХНИКА", eq_text)], y_offset)

    if comment_str and comment_str.lower() != 'нет':
        y_offset = draw_block([("КОММЕНТАРИЙ", comment_str)], y_offset)

    # Обрезаем картинку по контенту
    img = img.crop((0, 0, img_w, y_offset + 30))

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf


# --- УВЕДОМЛЕНИЯ ---
async def notify_users(target_roles: list, text: str, url_path: str = "dashboard", extra_tg_ids: list = None):
    bot_token = os.getenv("BOT_TOKEN")
    group_report_id = os.getenv("GROUP_REPORT_ID") or os.getenv("GROUP_CHAT_ID")
    if not bot_token: return
    chat_ids = set()
    if "report_group" in target_roles and group_report_id: chat_ids.add(str(group_report_id))

    roles_to_fetch = [r for r in target_roles if r != "report_group"]
    if roles_to_fetch:
        pl = ','.join(['?'] * len(roles_to_fetch))
        try:
            async with db.conn.execute(f"SELECT user_id FROM users WHERE role IN ({pl}) AND is_blacklisted = 0",
                                       roles_to_fetch) as cur:
                for row in await cur.fetchall():
                    if row[0]: chat_ids.add(str(row[0]))
        except:
            pass

    if extra_tg_ids:
        for tid in extra_tg_ids:
            if tid: chat_ids.add(str(tid))

    if not chat_ids: return
    markup = {
        "inline_keyboard": [[{"text": "📱 Открыть платформу", "web_app": {"url": f"https://islandvpn.sbs/{url_path}"}}]]}

    async with aiohttp.ClientSession() as session:
        for cid in chat_ids:
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


@app.on_event("startup")
async def startup():
    await db.init_db()
    await db.conn.execute(
        "CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER, fio TEXT, action TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)")
    await db.conn.execute(
        "CREATE TABLE IF NOT EXISTS equipment (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, category TEXT, is_active INTEGER DEFAULT 1, driver TEXT DEFAULT '')")
    columns_to_add = [
        ("applications", "foreman_id", "INTEGER"), ("applications", "foreman_name", "TEXT"),
        ("applications", "equip_id", "INTEGER DEFAULT 0"),
        ("applications", "time_start", "TEXT DEFAULT '08'"), ("applications", "time_end", "TEXT DEFAULT '17'"),
        ("applications", "comment", "TEXT"),
        ("applications", "selected_members", "TEXT"), ("applications", "equipment_data", "TEXT"),
        ("applications", "status", "TEXT DEFAULT 'waiting'"),
        ("team_members", "tg_id", "INTEGER"), ("team_members", "is_foreman", "INTEGER DEFAULT 0"),
        ("users", "avatar_url", "TEXT"),
        ("equipment", "driver", "TEXT DEFAULT ''"), ("equipment", "status", "TEXT DEFAULT 'free'"),
        ("equipment", "tg_id", "INTEGER"), ("equipment", "invite_code", "TEXT"), ("equipment", "photo_url", "TEXT"),
        ("teams", "invite_code", "TEXT")
    ]
    for table, col_name, col_type in columns_to_add:
        try:
            await db.conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
        except:
            pass
    await db.conn.execute("PRAGMA journal_mode=WAL;")
    await db.conn.commit()


@app.on_event("shutdown")
async def shutdown():
    await db.close()


def check_env_roles(tg_id: int):
    super_admins = [x.strip() for x in os.getenv("SUPER_ADMIN_IDS", "").split(",") if x.strip()]
    bosses = [x.strip() for x in os.getenv("BOSS_IDS", "").split(",") if x.strip()]
    if str(tg_id) in super_admins: return "superadmin"
    if str(tg_id) in bosses: return "boss"
    return None


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
    async with db.conn.execute("SELECT * FROM equipment ORDER BY category, name") as cur:
        equip = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    async with db.conn.execute(
        "SELECT DISTINCT category FROM equipment WHERE category IS NOT NULL AND category != ''") as cur:
        cat_rows = await cur.fetchall()
    categories = [r[0].strip().capitalize() for r in cat_rows if r[0].strip()]
    async with db.conn.execute(
            "SELECT a.*, t.name as team_name FROM applications a LEFT JOIN teams t ON a.team_id = t.id WHERE date_target >= date('now', '-14 days') ORDER BY a.id DESC") as cur:
        all_apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
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
    await db.conn.execute("DELETE FROM users WHERE user_id = ?", (target_id,))
    await db.conn.execute("DELETE FROM team_members WHERE tg_id = ?", (target_id,))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/teams/{team_id}/generate_invite")
async def api_generate_invite(team_id: int):
    invite_code = await db.get_or_create_team_invite(team_id)
    return {"invite_link": f"https://islandvpn.sbs/invite/{invite_code}",
            "tg_bot_link": f"https://t.me/{os.getenv('BOT_USERNAME', 'viksstroy_bot')}?start=team_{invite_code}"}


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
    await db.conn.execute("UPDATE team_members SET tg_id = ? WHERE id = ?", (tg_id, worker_id))
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
            "SELECT id, fio, position, tg_id, is_foreman FROM team_members WHERE team_id = ? ORDER BY is_foreman DESC, id ASC",
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


@app.post("/api/applications/create")
async def create_app(tg_id: int = Form(...), team_id: int = Form(0), date_target: str = Form(...),
                     object_address: str = Form(...), comment: str = Form(""), selected_members: str = Form(""),
                     equipment_data: str = Form("")):
    user = await db.get_user(tg_id)
    fio = dict(user).get('fio', 'Web-Пользователь') if user else "Web-Пользователь"
    await db.conn.execute("""
                          INSERT INTO applications (foreman_id, foreman_name, team_id, equip_id, date_target,
                                                    object_address, time_start, time_end, comment, status,
                                                    selected_members, equipment_data)
                          VALUES (?, ?, ?, 0, ?, ?, '08', '17', ?, 'waiting', ?, ?)
                          """,
                          (tg_id, fio, team_id, date_target, object_address, comment, selected_members, equipment_data))
    await db.conn.commit()
    await notify_users(["report_group", "moderator"],
                       f"📝 <b>Новая заявка на выезд</b>\n👷‍♂️ Прораб: {fio}\n📍 Объект: {object_address}\n📅 Дата: {date_target}",
                       "review")
    return {"status": "ok"}


@app.get("/api/applications/review")
async def get_review_apps():
    async with db.conn.execute(
            "SELECT a.*, t.name as team_name FROM applications a LEFT JOIN teams t ON a.team_id = t.id WHERE a.status IN ('waiting', 'approved') ORDER BY a.id DESC") as cursor:
        rows = await cursor.fetchall()
    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
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

    await db.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (new_status, app_id))

    if new_status in ['completed', 'rejected']:
        if app_dict.get('equipment_data'):
            try:
                eq_list = json.loads(app_dict['equipment_data'])
                for e in eq_list: await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (e['id'],))
            except:
                pass

    await db.conn.commit()
    user = await db.get_user(tg_id)
    mod_fio = dict(user).get('fio', 'Модератор') if user else 'Модератор'

    status_ru = "✅ Одобрена" if new_status == 'approved' else (
        "❌ Отклонена" if new_status == 'rejected' else "🏁 Завершена")
    msg_group = f"📋 <b>Заявка №{app_id} {status_ru}</b>\n👤 Кто: {mod_fio}\n📍 Объект: {app_dict['object_address']}"
    if reason: msg_group += f"\n💬 Причина: {reason}"
    await notify_users(["report_group"], msg_group, "review")

    if new_status in ['approved', 'rejected']:
        msg_foreman = f"🔔 <b>Ваша заявка {status_ru}!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
        if reason: msg_foreman += f"\n💬 Причина: {reason}"
        await notify_users([], msg_foreman, "dashboard", extra_tg_ids=[app_dict['foreman_id']])

    return {"status": "ok"}


# --- ГЛОБАЛЬНАЯ ПУБЛИКАЦИЯ КАРТИНКОЙ + ЦИТАТОЙ ---
async def execute_app_publish(app_dict, bot_token, group_id):
    app_id = app_dict['id']
    team_name = "Без бригады"
    if app_dict['team_id']:
        async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (app_dict['team_id'],)) as cur:
            t_row = await cur.fetchone()
            if t_row: team_name = t_row[0]

    selected = app_dict.get('selected_members', '')
    selected_list = [int(x.strip()) for x in selected.split(',')] if selected else []
    staff_rows = []
    if selected_list:
        pl = ','.join('?' for _ in selected_list)
        async with db.conn.execute(f"SELECT fio, position, tg_id FROM team_members WHERE id IN ({pl})",
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
    equip_text = ""
    drivers_ids = []
    if eq_data_str:
        try:
            eq_list = json.loads(eq_data_str)
            if eq_list:
                for eq in eq_list:
                    equip_text += f"{eq['name']} (⏰ {eq['time_start']}:00 - {eq['time_end']}:00)\n"
                    async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?", (eq['id'],)) as cur:
                        eq_db_row = await cur.fetchone()
                        if eq_db_row and eq_db_row[0]: drivers_ids.append(eq_db_row[0])
        except:
            pass

    comment_text = app_dict.get('comment', '')

    # 1. ГЕНЕРАЦИЯ КАРТИНКИ НОВОГО ФОРМАТА
    img_buf = create_app_image(app_dict['date_target'], app_dict['object_address'], app_dict['foreman_name'], team_name,
                               equip_text, comment_text)

    # 2. ФОРМИРОВАНИЕ ЦИТАТЫ (СПОЙЛЕРА)
    comment_html = f"\n💬 <b>Комментарий:</b> {comment_text}" if comment_text and comment_text.lower() != 'нет' else ""
    equip_html = ""
    if equip_text:
        for line in equip_text.split('\n'):
            if line.strip(): equip_html += f"  ├ {line.strip()}\n"
    else:
        equip_html = "  ├ Не требуется\n"

    html_caption = f"""<blockquote expandable>🟢 <b>УТВЕРЖДЕННЫЙ НАРЯД №{app_id}</b>
📅 <b>Дата:</b> <code>{app_dict['date_target']}</code>
📍 <b>Объект:</b> {app_dict['object_address']}
🚜 <b>Техника:</b>
{equip_html}👷‍♂️ <b>Прораб:</b> <a href='tg://user?id={app_dict['foreman_id']}'>{app_dict['foreman_name']}</a>
👥 <b>Бригада «{team_name}»:</b>{staff_str}{comment_html}</blockquote>"""

    async with aiohttp.ClientSession() as session:
        data = aiohttp.FormData()
        data.add_field('chat_id', str(group_id))
        data.add_field('photo', img_buf, filename='app.png', content_type='image/png')
        data.add_field('caption', html_caption)
        data.add_field('parse_mode', 'HTML')

        async with session.post(f"https://api.telegram.org/bot{bot_token}/sendPhoto", data=data) as resp:
            if resp.status == 200:
                await db.conn.execute("UPDATE applications SET status = 'published' WHERE id = ?", (app_id,))
                if eq_data_str:
                    try:
                        for e in json.loads(eq_data_str): await db.conn.execute(
                            "UPDATE equipment SET status = 'work' WHERE id = ?", (e['id'],))
                    except:
                        pass
                await db.conn.commit()

                all_involved = list(set(workers_ids + drivers_ids))
                if all_involved:
                    msg_inv = f"👷‍♂️ <b>Вас добавили в наряд!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
                    await notify_users([], msg_inv, "my-apps", extra_tg_ids=all_involved)
                return True
    return False


@app.post("/api/applications/publish")
async def publish_apps(tg_id: int = Form(0)):
    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    if not group_id: raise HTTPException(status_code=500, detail="Группа не настроена")
    async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved'") as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    if not apps: raise HTTPException(status_code=400, detail="Нет одобренных заявок")

    count = 0
    for app_dict in apps:
        success = await execute_app_publish(app_dict, bot_token, group_id)
        if success: count += 1

    user = await db.get_user(tg_id)
    await db.add_log(tg_id, dict(user).get('fio', 'Руководство') if user else "Руководство",
                     f"Опубликовал {count} нарядов в группу")
    return {"status": "ok", "published": count}


# --- КРОН ---
@app.post("/api/cron/start_day")
async def cron_start_day():
    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    now_date = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d")
    async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved' AND date_target = ?",
                               (now_date,)) as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    for app_dict in apps: await execute_app_publish(app_dict, bot_token, group_id)
    return {"status": "ok"}


@app.post("/api/cron/end_day")
async def cron_end_day():
    now_date = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d")
    async with db.conn.execute("SELECT * FROM applications WHERE status = 'published' AND date_target = ?",
                               (now_date,)) as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    for app_dict in apps:
        app_id = app_dict['id']
        await db.conn.execute("UPDATE applications SET status = 'completed' WHERE id = ?", (app_id,))
        if app_dict.get('equipment_data'):
            try:
                for e in json.loads(app_dict['equipment_data']): await db.conn.execute(
                    "UPDATE equipment SET status = 'free' WHERE id = ?", (e['id'],))
            except:
                pass
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/cron/check_timeouts")
async def cron_check_timeouts():
    now = datetime.now(TZ_BARNAUL)
    now_date = now.strftime("%Y-%m-%d")
    current_hour = now.hour
    async with db.conn.execute(
            "SELECT equipment_data, object_address FROM applications WHERE status = 'published' AND date_target = ?",
            (now_date,)) as cur:
        apps = await cur.fetchall()
    for row in apps:
        eq_str, address = row[0], row[1]
        if not eq_str: continue
        try:
            for eq in json.loads(eq_str):
                end_hour = int(eq['time_end'])
                if current_hour >= end_hour:
                    async with db.conn.execute("SELECT tg_id, status FROM equipment WHERE id = ?", (eq['id'],)) as cur2:
                        eq_db = await cur2.fetchone()
                        if eq_db and eq_db[0] and eq_db[1] == 'work':
                            msg = f"⏳ <b>Время вышло!</b>\nПо графику работа вашей техники на объекте ({address}) завершена.\n\nПожалуйста, нажмите кнопку <b>✅ Готово</b> в приложении."
                            await notify_users([], msg, "dashboard", extra_tg_ids=[eq_db[0]])
        except:
            pass
    return {"status": "ok"}


@app.get("/api/applications/active")
async def get_active_app(tg_id: int):
    user = await db.get_user(tg_id)
    if not user: return None
    role = dict(user).get('role')
    if role in ['superadmin', 'boss', 'moderator']: return None

    async with db.conn.execute(
            "SELECT a.*, t.name as team_name FROM applications a LEFT JOIN teams t ON a.team_id = t.id WHERE a.status IN ('approved', 'published') ORDER BY a.date_target ASC") as cursor:
        rows = await cursor.fetchall()

    for row in rows:
        app_dict = dict(zip([col[0] for col in cursor.description], row))
        involved = False
        if role == 'foreman' and app_dict['foreman_id'] == tg_id: involved = True
        if role in ['worker', 'foreman']:
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_id = ?", (tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0] == app_dict['team_id']: involved = True
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
        if involved: return app_dict
    return None


@app.get("/api/applications/my")
async def get_my_apps(tg_id: int):
    user = await db.get_user(tg_id)
    if not user: return []
    role = dict(user).get('role')
    async with db.conn.execute(
            "SELECT a.*, t.name as team_name FROM applications a LEFT JOIN teams t ON a.team_id = t.id WHERE a.status = 'completed' ORDER BY a.date_target DESC") as cursor:
        rows = await cursor.fetchall()

    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
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
            async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_id = ?", (tg_id,)) as cur:
                tm_row = await cur.fetchone()
                if tm_row and tm_row[0] == app_dict['team_id']: involved = True
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
    await db.conn.execute("UPDATE equipment SET status = 'free' WHERE tg_id = ?", (tg_id,))
    await db.conn.commit()
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
    await db.conn.execute("INSERT INTO equipment (name, category, driver, status) VALUES (?, ?, ?, 'free')",
                          (name, category, driver))
    await db.conn.commit()
    await notify_users(["report_group"], f"🚜 <b>Автопарк изменен</b>\nДобавлена новая техника: {name}", "equipment")
    return {"status": "ok"}


@app.post("/api/equipment/bulk_add")
async def bulk_add_equipment(request: Request):
    data = await request.json()
    items = data.get("items", [])
    tg_id = data.get("tg_id", 0)
    count = 0
    for item in items:
        name = item.get("name", "").strip()
        category = item.get("category", "Другое").strip()
        driver = item.get("driver", "").strip()
        if name:
            await db.conn.execute("INSERT INTO equipment (name, category, driver, status) VALUES (?, ?, ?, 'free')",
                                  (name, category, driver))
            count += 1
    await db.conn.commit()
    await notify_users(["report_group"], f"🚜 <b>Массовая загрузка</b>\nДобавлено {count} единиц техники.", "equipment")
    return {"status": "ok", "added": count}


@app.post("/api/equipment/{equip_id}/update_photo")
async def update_equip_photo(equip_id: int, photo_base64: str = Form(...), tg_id: int = Form(0)):
    url = process_base64_image(photo_base64, f"equip_{equip_id}")
    if url:
        await db.conn.execute("UPDATE equipment SET photo_url=? WHERE id=?", (url, equip_id))
        await db.conn.commit()
        return {"status": "ok", "photo_url": url}
    raise HTTPException(400, "Ошибка фото")


@app.post("/api/equipment/{equip_id}/update")
async def update_equipment(equip_id: int, name: str = Form(...), category: str = Form(...), driver: str = Form(""),
                           status: str = Form("free"), tg_id: int = Form(0)):
    await db.conn.execute("UPDATE equipment SET name=?, category=?, driver=?, status=? WHERE id=?",
                          (name, category, driver, status, equip_id))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/equipment/{equip_id}/delete")
async def delete_equipment(equip_id: int, tg_id: int = Form(0)):
    await db.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/equipment/{equip_id}/generate_invite")
async def generate_equip_invite(equip_id: int):
    async with db.conn.execute("SELECT invite_code FROM equipment WHERE id = ?", (equip_id,)) as cursor:
        row = await cursor.fetchone()
        if row and row[0]:
            code = row[0]
        else:
            code = str(uuid.uuid4())[:8]
            await db.conn.execute("UPDATE equipment SET invite_code = ? WHERE id = ?", (code, equip_id))
            await db.conn.commit()
    return {"invite_link": f"https://islandvpn.sbs/equip-invite/{code}",
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
    await db.conn.execute("UPDATE equipment SET tg_id = ? WHERE id = ?", (tg_id, eq_row[0]))

    user = await db.get_user(tg_id)
    fio = dict(user).get('fio', f"Пользователь {tg_id}") if user else f"Пользователь {tg_id}"
    if not user:
        await db.add_user(tg_id, fio, "driver")
    elif dict(user)['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
        await db.update_user_role(tg_id, "driver")
    await db.conn.commit()

    await notify_users(["report_group"],
                       f"🔗 <b>Привязка аккаунта</b>\nВодитель {fio} привязан к технике «{eq_row[1]}».", "equipment")
    return {"status": "ok"}


@app.post("/api/equipment/{equip_id}/unlink")
async def unlink_equipment(equip_id: int, tg_id: int = Form(0)):
    await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE id = ?", (equip_id,))
    await db.conn.commit()
    return {"status": "ok"}