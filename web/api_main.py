import sys
import os
# Добавляем папку web в пути поиска модулей
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import asyncio
import json
from datetime import datetime

# Теперь импорты сработают
from database_deps import db, TZ_BARNAUL
from utils import notify_users, execute_app_publish
from routers import auth, dashboard, users, teams, equipment, applications

app = FastAPI(title="ВИКС Расписание API")

origins = ["*"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

os.makedirs("data/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(teams.router)
app.include_router(equipment.router)
app.include_router(applications.router)

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
                async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved' AND date_target = ?", (current_date_str,)) as cur:
                    apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
                if apps:
                    count = 0
                    for app_dict in apps:
                        if await execute_app_publish(app_dict): count += 1
                    await db.add_log(0, "Система", f"Авто-публикация: {count} нарядов")

            if rem_time and current_time_str == rem_time and last_reminder_date != current_date_str:
                if not is_weekend or rem_weekends:
                    last_reminder_date = current_date_str
                    await notify_users(["foreman"], "🔔 <b>Напоминание</b>\nПожалуйста, не забудьте заполнить и отправить заявки на следующий день!", "dashboard")

            if current_time_str >= '08:00':
                async with db.conn.execute("SELECT * FROM applications WHERE status = 'published' AND date_target = ? AND is_started_notified = 0", (current_date_str,)) as cur:
                    apps_to_start = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

                if apps_to_start:
                    for app_dict in apps_to_start:
                        workers_ids = []
                        selected_list = [int(x.strip()) for x in app_dict.get('selected_members', '').split(',')] if app_dict.get('selected_members') else []
                        if selected_list:
                            pl = ','.join(['?'] * len(selected_list))
                            async with db.conn.execute(f"SELECT tg_id FROM team_members WHERE id IN ({pl})", selected_list) as cur:
                                for r in await cur.fetchall():
                                    if r[0]: workers_ids.append(r[0])
                        drivers_ids = []
                        eq_data_str = app_dict.get('equipment_data', '')
                        if eq_data_str:
                            try:
                                for eq in json.loads(eq_data_str):
                                    async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?", (eq['id'],)) as cur:
                                        eq_row = await cur.fetchone()
                                        if eq_row and eq_row[0]: drivers_ids.append(eq_row[0])
                            except: pass

                        all_involved = list(set(workers_ids + drivers_ids))
                        if app_dict.get('foreman_id'): all_involved.append(app_dict['foreman_id'])

                        if all_involved:
                            msg = f"🚀 <b>Наряд начался!</b>\n📍 Объект: {app_dict['object_address']}\nУдачной смены и безопасной работы!"
                            await notify_users([], msg, "my-apps", extra_tg_ids=all_involved)
                        try:
                            await db.conn.execute("UPDATE applications SET is_started_notified = 1 WHERE id = ?", (app_dict['id'],))
                            await db.conn.commit()
                        except: await db.conn.rollback()

        except Exception:
            pass
        await asyncio.sleep(30)

@app.on_event("startup")
async def startup():
    await db.init_db()
    try:
        await db.conn.execute("CREATE TABLE IF NOT EXISTS web_codes (code TEXT, max_id INTEGER, expires REAL)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS account_links (primary_id INTEGER, secondary_id INTEGER UNIQUE)")
        await db.conn.execute("CREATE TABLE IF NOT EXISTS link_codes (code TEXT UNIQUE, user_id INTEGER, expires REAL)")
        await db.conn.commit()
    except: pass
    asyncio.create_task(background_scheduler())

@app.on_event("shutdown")
async def shutdown():
    await db.close()