import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import asyncio

from database_deps import db, TZ_BARNAUL
from utils import notify_users, execute_app_publish
from routers import auth, dashboard, users, teams, equipment, applications, objects, kp # <-- ПОДКЛЮЧЕН KP
from scheduler import start_scheduler

app = FastAPI(title="ВИКС Расписание API")

origins = ["*"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

os.makedirs("data/uploads", exist_ok=True)
os.makedirs("data/uploads/objects", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(teams.router)
app.include_router(equipment.router)
app.include_router(applications.router)
app.include_router(objects.router)
app.include_router(kp.router) # <-- ВНЕДРЕН РОУТЕР KP


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        last_action = str(request.url)
        last_user = "Неизвестно"
        err_msg = f"🚨 <b>ОШИБКА СИСТЕМЫ (500)</b>\n\n👤 <b>Юзер:</b> {last_user}\n👣 <b>Действие:</b> {last_action}\n❌ <b>Ошибка:</b> {str(exc)}"
        await notify_users(["report_group"], err_msg, "system")
    except: pass
    return JSONResponse(status_code=500, content={"detail": f"Внутренняя ошибка сервера"})

@app.on_event("startup")
async def startup():
    await db.init_db()
    try:
        await db.conn.execute("CREATE TABLE IF NOT EXISTS web_codes (code TEXT, max_id INTEGER, expires REAL)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS account_links (primary_id INTEGER, secondary_id INTEGER UNIQUE)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS link_codes (code TEXT UNIQUE, user_id INTEGER, expires REAL)")
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_tg INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE users ADD COLUMN notify_max INTEGER DEFAULT 1")
        except: pass
        try: await db.conn.execute("ALTER TABLE team_members ADD COLUMN is_foreman INTEGER DEFAULT 0")
        except: pass
        await db.conn.commit()
    except Exception as e:
        print("Ошибка создания таблиц:", e)

    try: start_scheduler()
    except Exception as e: print(f"Ошибка при запуске планировщика: {e}")

@app.on_event("shutdown")
async def shutdown():
    await db.close()