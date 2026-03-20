import sys
import os
# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
from database_deps import db, TZ_BARNAUL
from datetime import datetime
from utils import resolve_id, fetch_teams_dict, enrich_app_with_team_name, notify_users, execute_app_publish

router = APIRouter(tags=["Dashboard"])

@router.get("/api/dashboard")
async def get_dashboard_data(tg_id: int = 0):
    stats = await db.get_general_statistics()
    teams = await db.get_all_teams()
    teams_dict = {t['id']: t['name'] for t in teams}

    async with db.conn.execute("SELECT * FROM equipment ORDER BY category, name") as cur:
        equip = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    async with db.conn.execute("SELECT DISTINCT category FROM equipment WHERE category IS NOT NULL AND category != ''") as cur:
        cat_rows = await cur.fetchall()
    categories = [r[0].strip().capitalize() for r in cat_rows if r[0].strip()]

    async with db.conn.execute("SELECT * FROM applications WHERE date_target >= date('now', '-14 days') ORDER BY id DESC") as cur:
        all_apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

    for a in all_apps: enrich_app_with_team_name(a, teams_dict)

    recent_addresses = []
    if tg_id != 0:
        real_tg_id = await resolve_id(tg_id)
        async with db.conn.execute("SELECT object_address FROM applications WHERE foreman_id = ? ORDER BY id DESC", (real_tg_id,)) as cur:
            for r in await cur.fetchall():
                if r[0] and r[0] not in recent_addresses: recent_addresses.append(r[0])
                if len(recent_addresses) >= 5: break

    return {"stats": stats, "teams": [{"id": t['id'], "name": t['name']} for t in teams], "equipment": equip,
            "equip_categories": list(set(categories)), "kanban_apps": all_apps, "recent_addresses": recent_addresses}

@router.get("/api/logs")
async def get_logs(): return await db.get_recent_logs(50)

@router.get("/api/settings")
async def get_settings():
    async with db.conn.execute("SELECT key, value FROM settings") as cur:
        rows = await cur.fetchall()
    return {r[0]: r[1] for r in rows}

@router.post("/api/settings/update")
async def update_settings(auto_publish_time: str = Form(""), foreman_reminder_time: str = Form(""),
                          foreman_reminder_weekends: str = Form("0"), tg_id: int = Form(0)):
    user = await db.get_user(tg_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']: raise HTTPException(403, "Нет прав")
    try:
        await db.conn.execute("UPDATE settings SET value = ? WHERE key = 'auto_publish_time'", (auto_publish_time,))
        await db.conn.execute("UPDATE settings SET value = ? WHERE key = 'foreman_reminder_time'", (foreman_reminder_time,))
        await db.conn.execute("UPDATE settings SET value = ? WHERE key = 'foreman_reminder_weekends'", (foreman_reminder_weekends,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
        raise HTTPException(500, "Database error")
    await db.add_log(tg_id, dict(user).get('fio'), "Обновил системные настройки")
    return {"status": "ok"}

@router.post("/api/cron/start_day")
async def cron_start_day(): return {"status": "ok"}

@router.post("/api/cron/end_day")
async def cron_end_day(): return {"status": "ok"}

@router.post("/api/cron/check_timeouts")
async def cron_check_timeouts(): return {"status": "ok"}

# НОВЫЙ ЭНДПОИНТ ДЛЯ ТЕСТИРОВАНИЯ УВЕДОМЛЕНИЙ
@router.post("/api/system/test_notification")
async def test_notification(tg_id: int = Form(...)):
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') != 'superadmin':
        raise HTTPException(403, "Нет прав")

    fio = dict(user).get('fio', 'Супер-Админ')

    await notify_users([], "🧪 <b>Тестовое уведомление:</b> Вас добавили в наряд!", "my-apps", [real_tg_id])
    await notify_users(["moderator"], f"📝 <b>Тестовая заявка:</b>\n👷‍♂️ Прораб: {fio}\n📍 Объект: Проверка уведомлений", "review", [real_tg_id])

    fake_app = {
        'id': 9999,
        'date_target': datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d"),
        'object_address': 'Тестовый объект (Проверка интеграции)',
        'foreman_id': real_tg_id,
        'foreman_name': fio,
        'team_name': 'Тестовая бригада',
        'selected_members': '',
        'equipment_data': '[]',
        'comment': 'Это тестовый наряд для проверки доставки изображений в мессенджеры',
        'approved_by': 'Автоматика',
        'approved_by_id': real_tg_id
    }
    await execute_app_publish(fake_app)

    return {"status": "ok"}