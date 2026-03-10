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
    await db.conn.execute("PRAGMA journal_mode=WAL;")
    await db.conn.commit()


@app.on_event("shutdown")
async def shutdown():
    await db.close()


# --- ВХОД ПО ПАРОЛЮ ---
@app.post("/api/login")
async def process_login(password: str = Form(...)):
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

    return {"status": "ok", "role": role}


# --- ВХОД ЧЕРЕЗ TELEGRAM WIDGET (САЙТ) ---
@app.post("/api/telegram_auth")
async def telegram_auth(data: dict):
    bot_token = os.getenv("BOT_TOKEN")
    if not bot_token:
        raise HTTPException(status_code=500, detail="Токен бота не настроен")

    received_hash = data.pop('hash', None)

    # Проверка на устаревание данных (защита от перехвата)
    if time.time() - int(data.get('auth_date', 0)) > 86400:  # 24 часа
        raise HTTPException(status_code=403, detail="Данные авторизации устарели")

    # Сортируем данные для проверки подписи
    data_check_arr = []
    for key in sorted(data.keys()):
        if data[key] is not None:
            data_check_arr.append(f"{key}={data[key]}")
    data_check_string = "\n".join(data_check_arr)

    # Вычисляем SHA256 хэш
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    hash_calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    # Сравниваем хэши
    if hash_calc != received_hash:
        raise HTTPException(status_code=403, detail="Неверная подпись Telegram")

    # Подпись верна! Ищем пользователя в БД
    tg_id = int(data['id'])
    user = await db.get_user(tg_id)

    if user and user['is_active'] and not user['is_blacklisted']:
        return {"status": "ok", "role": user['role'], "fio": user['fio']}

    raise HTTPException(status_code=403, detail="Доступ запрещен: Вы не зарегистрированы или заблокированы")


# --- ВХОД ЧЕРЕЗ TELEGRAM MINI APP ---
@app.post("/api/tma/auth")
async def api_tma_auth(tg_id: int = Form(...)):
    user = await db.get_user(tg_id)
    if user and user['is_active'] and not user['is_blacklisted']:
        return {"status": "ok", "role": user['role'], "fio": user['fio']}
    raise HTTPException(status_code=403, detail="Доступ запрещен или пользователь не найден")


# --- API ДАШБОРДА ---
@app.get("/api/dashboard")
async def get_dashboard_data():
    stats = await db.get_general_statistics()
    teams = await db.get_all_teams()

    return {
        "stats": stats,
        "teams": [{"id": t['id'], "name": t['name']} for t in teams]
    }