from fastapi import FastAPI, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from database.db_manager import DatabaseManager
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ВИКС Расписание API")

# Настройка CORS (разрешаем запросы с React)
origins = [
    "https://islandvpn.sbs",
    "http://islandvpn.sbs",
    "https://www.islandvpn.sbs",
    "http://localhost:5173",  # Для локальной разработки
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


# --- API АВТОРИЗАЦИИ (По паролю) ---
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


# --- API АВТОРИЗАЦИИ (Telegram Mini App) ---
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