from fastapi import FastAPI, Form, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from database.db_manager import DatabaseManager
import os
import hashlib
import hmac
import time
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ВИКС Расписание API")

origins = [
    "https://islandvpn.sbs",
    "http://islandvpn.sbs",
    "https://www.islandvpn.sbs",
    "http://localhost:5173",
]

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
    await db.upgrade_db_for_invites()
    await db.conn.execute("PRAGMA journal_mode=WAL;")
    await db.conn.commit()


@app.on_event("shutdown")
async def shutdown():
    await db.close()


# Функция проверки ID в .env
def check_env_roles(tg_id: int):
    super_admins = [x.strip() for x in os.getenv("SUPER_ADMIN_IDS", "").split(",") if x.strip()]
    bosses = [x.strip() for x in os.getenv("BOSS_IDS", "").split(",") if x.strip()]
    if str(tg_id) in super_admins:
        return "superadmin"
    if str(tg_id) in bosses:
        return "boss"
    return None


# --- ВХОД ЧЕРЕЗ TELEGRAM WIDGET (ОБЫЧНЫЙ САЙТ) ---
@app.post("/api/telegram_auth")
async def telegram_auth(data: dict):
    bot_token = os.getenv("BOT_TOKEN")
    received_hash = data.pop('hash', None)

    if time.time() - int(data.get('auth_date', 0)) > 86400:
        raise HTTPException(status_code=403, detail="Данные авторизации устарели")

    data_check_arr = [f"{k}={data[k]}" for k in sorted(data.keys()) if data[k] is not None]
    data_check_string = "\n".join(data_check_arr)

    secret_key = hashlib.sha256(bot_token.encode()).digest()
    hash_calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if hash_calc != received_hash:
        raise HTTPException(status_code=403, detail="Неверная подпись Telegram")

    tg_id = int(data['id'])

    # 1. Проверяем .env
    env_role = check_env_roles(tg_id)
    if env_role:
        return {"status": "ok", "role": env_role, "fio": data.get('first_name', 'Руководство')}

    # 2. Проверяем Базу Данных
    user = await db.get_user(tg_id)
    if user:
        if user['is_blacklisted']:
            raise HTTPException(status_code=403, detail="Пользователь заблокирован")
        return {"status": "ok", "role": user['role'], "fio": user['fio']}

    # 3. Если нигде нет -> просим пароль
    return {
        "status": "needs_password",
        "tg_id": tg_id,
        "first_name": data.get('first_name', ''),
        "last_name": data.get('last_name', '')
    }


# --- ВХОД ЧЕРЕЗ TELEGRAM MINI APP ---
@app.post("/api/tma/auth")
async def api_tma_auth(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form("")):
    env_role = check_env_roles(tg_id)
    if env_role:
        return {"status": "ok", "role": env_role, "fio": "Руководство"}

    user = await db.get_user(tg_id)
    if user:
        if user['is_blacklisted']:
            raise HTTPException(status_code=403, detail="Пользователь заблокирован")
        return {"status": "ok", "role": user['role'], "fio": user['fio']}

    return {
        "status": "needs_password",
        "tg_id": tg_id,
        "first_name": first_name,
        "last_name": last_name
    }


# --- РЕГИСТРАЦИЯ ПРИ ВХОДЕ ВПЕРВЫЕ ---
@app.post("/api/register_telegram")
async def register_telegram(tg_id: int = Form(...), first_name: str = Form(""), last_name: str = Form(""),
                            password: str = Form(...)):
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

    fio = f"{last_name} {first_name}".strip()
    if not fio:
        fio = f"Пользователь {tg_id}"

    await db.add_user(tg_id, fio, role)
    return {"status": "ok", "role": role}


# --- API ДАШБОРДА ---
@app.get("/api/dashboard")
async def get_dashboard_data():
    stats = await db.get_general_statistics()
    teams = await db.get_all_teams()
    return {
        "stats": stats,
        "teams": [{"id": t['id'], "name": t['name']} for t in teams]
    }


# --- ГЕНЕРАЦИЯ ССЫЛКИ ДЛЯ БРИГАДЫ (Только для прорабов/боссов) ---
@app.post("/api/teams/{team_id}/generate_invite")
async def api_generate_invite(team_id: int):
    # Здесь можно добавить проверку роли через куки/токен, для простоты пока открыто
    invite_code, join_password = await db.generate_team_invite(team_id)
    return {
        "invite_link": f"https://islandvpn.sbs/invite/{invite_code}",
        "tg_bot_link": f"https://t.me/{os.getenv('BOT_USERNAME', 'viksstroy_bot')}?start=team_{invite_code}",
        "password": join_password
    }


# --- ПОЛУЧЕНИЕ ДАННЫХ ПРИ ПЕРЕХОДЕ ПО ССЫЛКЕ ---
@app.get("/api/invite/{invite_code}")
async def api_get_invite_info(invite_code: str):
    team = await db.get_team_by_invite(invite_code)
    if not team:
        raise HTTPException(status_code=404, detail="Ссылка недействительна или устарела")

    unclaimed = await db.get_unclaimed_workers(team['id'])
    return {
        "team_name": team['name'],
        "unclaimed_workers": [{"id": w['id'], "fio": w['fio'], "position": w['position']} for w in unclaimed]
    }


# --- ПОДТВЕРЖДЕНИЕ ВЫБОРА СЕБЯ (Сайт) ---
@app.post("/api/invite/join")
async def api_join_team(invite_code: str = Form(...), password: str = Form(...), worker_id: int = Form(...)):
    team = await db.get_team_by_invite(invite_code)

    if not team:
        raise HTTPException(status_code=404, detail="Бригада не найдена")
    if team['join_password'] != password:
        raise HTTPException(status_code=403, detail="Неверный пароль бригады")

    # Привязываем слот к веб-пользователю
    await db.claim_worker_slot(worker_id, is_web_only=True)
    return {"status": "ok", "message": "Вы успешно присоединены к бригаде!"}