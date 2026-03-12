from fastapi import FastAPI, Form, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from database.db_manager import DatabaseManager
import os
import hashlib
import hmac
import time
import aiohttp
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ВИКС Расписание API")

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)


@app.on_event("startup")
async def startup():
    await db.init_db()

    # Авто-обновление базы данных для заявок
    columns_to_add = [
        ("foreman_id", "INTEGER"),
        ("foreman_name", "TEXT"),
        ("equip_id", "INTEGER DEFAULT 0"),
        ("time_start", "TEXT DEFAULT '08'"),
        ("time_end", "TEXT DEFAULT '17'"),
        ("comment", "TEXT"),
        ("selected_members", "TEXT"),
        ("equipment_data", "TEXT"),
        ("status", "TEXT DEFAULT 'waiting'")
    ]
    for col_name, col_type in columns_to_add:
        try:
            await db.conn.execute(f"ALTER TABLE applications ADD COLUMN {col_name} {col_type}")
        except Exception:
            pass

    # Авто-обновление базы данных для ТЕХНИКИ (добавляем водителя)
    try:
        await db.conn.execute("ALTER TABLE equipment ADD COLUMN driver TEXT DEFAULT ''")
    except Exception:
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
    bot_token = os.getenv("BOT_TOKEN")
    received_hash = data.pop('hash', None)
    if time.time() - int(data.get('auth_date', 0)) > 86400:
        raise HTTPException(status_code=403, detail="Данные устарели")

    data_check_string = "\n".join([f"{k}={data[k]}" for k in sorted(data.keys()) if data[k] is not None])
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    hash_calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if hash_calc != received_hash:
        raise HTTPException(status_code=403, detail="Неверная подпись")

    tg_id = int(data['id'])
    photo_url = data.get('photo_url', '')

    user = await db.get_user(tg_id)
    if user:
        if user['is_blacklisted']:
            raise HTTPException(status_code=403, detail="Пользователь заблокирован")
        if photo_url:
            await db.update_user_avatar(tg_id, photo_url)
        return {
            "status": "ok",
            "role": user['role'],
            "fio": user['fio'],
            "tg_id": tg_id,
            "avatar_url": user.get('avatar_url', photo_url)
        }

    env_role = check_env_roles(tg_id)
    if env_role:
        return {
            "status": "ok",
            "role": env_role,
            "fio": data.get('first_name', 'Руководство'),
            "tg_id": tg_id,
            "avatar_url": photo_url
        }

    return {
        "status": "needs_password",
        "tg_id": tg_id,
        "first_name": data.get('first_name', ''),
        "last_name": data.get('last_name', ''),
        "photo_url": photo_url
    }


@app.post("/api/tma/auth")
async def api_tma_auth(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form("")):
    env_role = check_env_roles(tg_id)
    if env_role:
        return {"status": "ok", "role": env_role, "fio": "Руководство", "tg_id": tg_id}

    user = await db.get_user(tg_id)
    if user:
        if user['is_blacklisted']:
            raise HTTPException(status_code=403, detail="Заблокирован")
        return {"status": "ok", "role": user['role'], "fio": user['fio'], "tg_id": tg_id}

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

    if not role:
        raise HTTPException(status_code=401, detail="Неверный пароль")

    fio = f"{last_name} {first_name}".strip() or f"Пользователь {tg_id}"
    await db.add_user(tg_id, fio, role)
    if photo_url:
        await db.update_user_avatar(tg_id, photo_url)

    await db.add_log(tg_id, fio, f"Зарегистрировался в системе (Роль: {role})")
    return {"status": "ok", "role": role, "tg_id": tg_id}


@app.get("/api/dashboard")
async def get_dashboard_data():
    stats = await db.get_general_statistics()
    teams = await db.get_all_teams()
    equip = await db.get_all_equipment_admin()

    async with db.conn.execute(
            "SELECT DISTINCT category FROM equipment WHERE category IS NOT NULL AND category != ''") as cur:
        cat_rows = await cur.fetchall()

    categories = []
    for r in cat_rows:
        cat = r[0].strip().capitalize()
        if cat and cat not in categories:
            categories.append(cat)

    # Проверяем наличие ключа 'driver' безопасно
    return {
        "stats": stats,
        "teams": [{"id": t['id'], "name": t['name']} for t in teams],
        "equipment": [{"id": e['id'], "name": e['name'], "category": e['category'],
                       "driver": e['driver'] if 'driver' in e.keys() else ""} for e in equip if e['is_active']],
        "equip_categories": categories
    }


@app.get("/api/logs")
async def get_logs():
    return await db.get_recent_logs(50)


@app.get("/api/users")
async def api_get_users():
    users = await db.get_all_users()
    return [{"user_id": u['user_id'], "fio": u['fio'], "role": u['role'], "is_blacklisted": u['is_blacklisted'],
             "avatar_url": u.get('avatar_url', '')} for u in users]


@app.get("/api/users/{target_id}/profile")
async def api_get_profile(target_id: int):
    profile = await db.get_user_full_profile(target_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    logs = await db.get_specific_user_logs(target_id)
    return {"profile": profile, "logs": logs}


@app.post("/api/users/{target_id}/update_avatar")
async def api_update_avatar(target_id: int, avatar_url: str = Form(...), tg_id: int = Form(0)):
    await db.update_user_avatar(target_id, avatar_url)
    user = await db.get_user(tg_id)
    await db.add_log(tg_id, user['fio'] if user else "Система", f"Обновил аватар профиля ID:{target_id}")
    return {"status": "ok"}


@app.post("/api/users/{target_id}/update_profile")
async def api_update_profile(target_id: int, tg_id: int = Form(...), fio: str = Form(...), role: str = Form(...),
                             team_id: int = Form(0), position: str = Form("")):
    admin = await db.get_user(tg_id)
    if not admin or admin['role'] not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    await db.update_user_profile_data(target_id, fio, role)
    profile = await db.get_user_full_profile(target_id)

    if profile['member_id']:
        if team_id > 0:
            await db.conn.execute("UPDATE team_members SET team_id = ?, position = ? WHERE id = ?",
                                  (team_id, position, profile['member_id']))
        else:
            await db.conn.execute("DELETE FROM team_members WHERE id = ?", (profile['member_id'],))
    else:
        if team_id > 0:
            await db.conn.execute("INSERT INTO team_members (team_id, fio, position, tg_id) VALUES (?, ?, ?, ?)",
                                  (team_id, fio, position, target_id))

    await db.conn.commit()
    await db.add_log(tg_id, admin['fio'], f"Изменил данные профиля ID:{target_id}")
    return {"status": "ok"}


@app.post("/api/users/{target_id}/delete")
async def api_delete_user(target_id: int, tg_id: int = Form(...)):
    admin = await db.get_user(tg_id)
    if not admin or admin['role'] not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(403, "Нет прав")

    await db.conn.execute("DELETE FROM users WHERE user_id = ?", (target_id,))
    await db.conn.execute("DELETE FROM team_members WHERE tg_id = ?", (target_id,))
    await db.conn.commit()
    await db.add_log(tg_id, admin['fio'], f"Удалил пользователя ID:{target_id}")
    return {"status": "ok"}


@app.post("/api/teams/{team_id}/generate_invite")
async def api_generate_invite(team_id: int):
    invite_code = await db.get_or_create_team_invite(team_id)
    return {"invite_link": f"https://islandvpn.sbs/invite/{invite_code}",
            "tg_bot_link": f"https://t.me/{os.getenv('BOT_USERNAME', 'viksstroy_bot')}?start=team_{invite_code}"}


@app.get("/api/invite/{invite_code}")
async def api_get_invite_info(invite_code: str):
    team = await db.get_team_by_invite(invite_code)
    if not team:
        raise HTTPException(status_code=404, detail="Ссылка недействительна")
    unclaimed = await db.get_unclaimed_workers(team['id'])
    return {"team_name": team['name'],
            "unclaimed_workers": [{"id": w['id'], "fio": w['fio'], "position": w['position']} for w in unclaimed]}


@app.post("/api/invite/join")
async def api_join_team(invite_code: str = Form(...), worker_id: int = Form(...), tg_id: int = Form(...)):
    team = await db.get_team_by_invite(invite_code)
    await db.conn.execute("UPDATE team_members SET tg_id = ? WHERE id = ?", (tg_id, worker_id))
    user = await db.get_user(tg_id)
    fio = f"Рабочий {tg_id}"

    async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
        w_row = await cur.fetchone()
        if w_row:
            fio = w_row[0]

    if not user:
        await db.add_user(tg_id, fio, "worker")
    elif user['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
        await db.update_user_role(tg_id, "worker")

    await db.conn.commit()
    await db.add_log(tg_id, fio, f"Привязал аккаунт к бригаде «{team['name']}»")
    return {"status": "ok"}


@app.post("/api/teams/create")
async def create_team(name: str = Form(...), tg_id: int = Form(0), fio: str = Form("Пользователь")):
    await db.conn.execute("INSERT INTO teams (name) VALUES (?)", (name,))
    await db.conn.commit()
    await db.add_log(tg_id, fio, f"Создал бригаду «{name}»")
    return {"status": "ok"}


@app.get("/api/teams/{team_id}/details")
async def get_team_details(team_id: int):
    async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,)) as cur:
        team_row = await cur.fetchone()

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
    await db.add_log(tg_id, admin_fio, f"Добавил участника «{fio}» в бригаду #{team_id}")
    return {"status": "ok"}


@app.post("/api/teams/members/{member_id}/toggle_foreman")
async def toggle_foreman(member_id: int, is_foreman: int = Form(...), tg_id: int = Form(0),
                         admin_fio: str = Form("Пользователь")):
    await db.conn.execute("UPDATE team_members SET is_foreman = ? WHERE id = ?", (is_foreman, member_id))
    await db.conn.commit()
    await db.add_log(tg_id, admin_fio, f"Изменил статус бригадира для #{member_id}")
    return {"status": "ok"}


@app.post("/api/teams/members/{member_id}/delete")
async def delete_team_member(member_id: int, tg_id: int = Form(0), admin_fio: str = Form("Пользователь")):
    await db.conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
    await db.conn.commit()
    await db.add_log(tg_id, admin_fio, f"Удалил участника #{member_id} из бригады")
    return {"status": "ok"}


@app.post("/api/applications/create")
async def create_app(
        tg_id: int = Form(...),
        team_id: int = Form(...),
        date_target: str = Form(...),
        object_address: str = Form(...),
        comment: str = Form(""),
        selected_members: str = Form(""),
        equipment_data: str = Form("")
):
    user = await db.get_user(tg_id)
    fio = user['fio'] if user else "Web-Пользователь"
    await db.conn.execute("""
                          INSERT INTO applications
                          (foreman_id, foreman_name, team_id, equip_id, date_target, object_address, time_start,
                           time_end, comment, status, selected_members, equipment_data)
                          VALUES (?, ?, ?, 0, ?, ?, '08', '17', ?, 'waiting', ?, ?)
                          """,
                          (tg_id, fio, team_id, date_target, object_address, comment, selected_members, equipment_data))
    await db.conn.commit()
    await db.add_log(tg_id, fio, f"Создал заявку на выезд ({date_target}, {object_address})")
    return {"status": "ok"}


@app.get("/api/applications/review")
async def get_review_apps():
    async with db.conn.execute("""
                               SELECT a.*, t.name as team_name
                               FROM applications a
                                        LEFT JOIN teams t ON a.team_id = t.id
                               WHERE a.status IN ('waiting', 'approved')
                               ORDER BY a.id DESC
                               """) as cursor:
        rows = await cursor.fetchall()

    result = []
    for row in rows:
        app_dict = dict(zip([c[0] for c in cursor.description], row))
        eq_data_str = app_dict.get('equipment_data', '')
        equip_text = ""

        if eq_data_str:
            try:
                eq_list = json.loads(eq_data_str)
                if eq_list:
                    equip_text = ", ".join([f"{e['name']} ({e['time_start']}:00-{e['time_end']}:00)" for e in eq_list])
            except:
                pass

        app_dict['formatted_equip'] = equip_text or "Не требуется"
        result.append(app_dict)

    return result


@app.post("/api/applications/{app_id}/review")
async def review_app(app_id: int, new_status: str = Form(...), tg_id: int = Form(0)):
    if new_status not in ['approved', 'rejected']:
        raise HTTPException(400, "Неверный статус")

    await db.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (new_status, app_id))
    await db.conn.commit()
    user = await db.get_user(tg_id)
    await db.add_log(tg_id, user['fio'] if user else "Модератор",
                     f"{'Одобрил' if new_status == 'approved' else 'Отклонил'} заявку №{app_id}")
    return {"status": "ok"}


@app.post("/api/applications/publish")
async def publish_apps(tg_id: int = Form(0)):
    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    if not group_id:
        raise HTTPException(status_code=500, detail="Группа не настроена")

    async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved'") as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

    if not apps:
        raise HTTPException(status_code=400, detail="Нет одобренных заявок для публикации")

    count = 0
    async with aiohttp.ClientSession() as session:
        for app_dict in apps:
            app_id = app_dict['id']
            async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (app_dict['team_id'],)) as cur:
                t_row = await cur.fetchone()
                team_name = t_row[0] if t_row else "Неизвестно"

            selected = app_dict.get('selected_members', '')
            selected_list = [int(x.strip()) for x in selected.split(',')] if selected else []

            if selected_list:
                placeholders = ','.join('?' for _ in selected_list)
                async with db.conn.execute(f"SELECT fio, position FROM team_members WHERE id IN ({placeholders})",
                                           selected_list) as cur:
                    staff_rows = await cur.fetchall()
            else:
                staff_rows = []

            staff_str = "\n".join(
                [f"  ├ {r[0]} (<i>{r[1]}</i>)" for r in staff_rows]) if staff_rows else "  ├ Состав не выбран"

            eq_data_str = app_dict.get('equipment_data', '')
            equip_text = ""

            if eq_data_str:
                try:
                    eq_list = json.loads(eq_data_str)
                    if eq_list:
                        equip_text = "🚜 <b>Техника:</b>\n"
                        for eq in eq_list:
                            equip_text += f"  ├ {eq['name']} (⏰ <i>{eq['time_start']}:00 - {eq['time_end']}:00</i>)\n"
                except:
                    pass

            if not equip_text:
                equip_text = "🚜 <b>Техника:</b> Не требуется\n"

            text = (f"🟢 <b>УТВЕРЖДЕННЫЙ НАРЯД №{app_id}</b>\n🏢 <b>ВИКС Расписание</b>\n━━━━━━━━━━━━━━━\n"
                    f"📅 <b>Дата:</b> <code>{app_dict['date_target']}</code>\n📍 <b>Объект:</b> {app_dict['object_address']}\n"
                    f"{equip_text}\n👷‍♂️ <b>Прораб:</b> <b>{app_dict['foreman_name']}</b>\n\n👥 <b>Бригада «{team_name}»:</b>\n{staff_str}\n")

            if app_dict.get('comment') and app_dict['comment'].lower() != 'нет':
                text += f"\n💬 <b>Комментарий:</b> {app_dict['comment']}"

            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            async with session.post(url, json={"chat_id": group_id, "text": text, "parse_mode": "HTML"}) as resp:
                if resp.status == 200:
                    await db.conn.execute("UPDATE applications SET status = 'published' WHERE id = ?", (app_id,))
                    await db.conn.commit()
                    count += 1

    user = await db.get_user(tg_id)
    await db.add_log(tg_id, user['fio'] if user else "Руководство", f"Опубликовал {count} нарядов в группу")
    return {"status": "ok", "published": count}


@app.get("/api/applications/active")
async def get_active_app(tg_id: int):
    async with db.conn.execute(
            "SELECT a.*, t.name as team_name, e.name as equip_name FROM applications a LEFT JOIN teams t ON a.team_id = t.id LEFT JOIN equipment e ON a.equip_id = e.id LEFT JOIN team_members tm ON tm.team_id = t.id WHERE (a.foreman_id = ? OR tm.tg_id = ?) AND a.status IN ('approved', 'published') ORDER BY a.id DESC LIMIT 1",
            (tg_id, tg_id)) as cursor:
        row = await cursor.fetchone()
        if row: return dict(zip([col[0] for col in cursor.description], row))
        return None


@app.get("/api/equipment/admin_list")
async def admin_equip_list():
    # Теперь запрашиваем driver из базы
    async with db.conn.execute(
            "SELECT id, name, category, is_active, driver FROM equipment ORDER BY category, name") as cur:
        rows = await cur.fetchall()

    # Безопасное извлечение driver, если колонка вдруг не успела создаться
    result = []
    for r in rows:
        driver = r[4] if len(r) > 4 and r[4] else ""
        result.append({"id": r[0], "name": r[1], "category": r[2], "is_active": bool(r[3]), "driver": driver})
    return result


@app.post("/api/equipment/add")
async def add_equipment(name: str = Form(...), category: str = Form(...), driver: str = Form(""), tg_id: int = Form(0)):
    # Сохраняем имя и водителя отдельно, как вы и просили
    await db.conn.execute("INSERT INTO equipment (name, category, driver, is_active) VALUES (?, ?, ?, 1)",
                          (name, category, driver))
    await db.conn.commit()
    user = await db.get_user(tg_id)
    await db.add_log(tg_id, user['fio'] if user else "Система", f"Добавил новую технику: {name}")
    return {"status": "ok"}


@app.post("/api/equipment/bulk_add")
async def bulk_add_equipment(request: Request):
    """Новый эндпоинт для массового добавления техники (JSON)"""
    data = await request.json()
    items = data.get("items", [])
    tg_id = data.get("tg_id", 0)

    count = 0
    for item in items:
        name = item.get("name", "").strip()
        category = item.get("category", "Другое").strip()
        driver = item.get("driver", "").strip()

        if name:
            await db.conn.execute("INSERT INTO equipment (name, category, driver, is_active) VALUES (?, ?, ?, 1)",
                                  (name, category, driver))
            count += 1

    await db.conn.commit()

    user = await db.get_user(tg_id)
    await db.add_log(tg_id, user['fio'] if user else "Система", f"Массово добавил {count} ед. техники")
    return {"status": "ok", "added": count}


@app.post("/api/equipment/{equip_id}/toggle")
async def toggle_equipment(equip_id: int, is_active: int = Form(...), tg_id: int = Form(0)):
    await db.conn.execute("UPDATE equipment SET is_active = ? WHERE id = ?", (is_active, equip_id))
    await db.conn.commit()
    return {"status": "ok"}


@app.post("/api/equipment/{equip_id}/delete")
async def delete_equipment(equip_id: int, tg_id: int = Form(0)):
    await db.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
    await db.conn.commit()
    return {"status": "ok"}