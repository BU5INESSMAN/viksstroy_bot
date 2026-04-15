import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
import asyncio
import logging
from database_deps import db, TZ_BARNAUL
from datetime import datetime, timedelta
from utils import resolve_id, fetch_teams_dict, enrich_app_with_team_name
from services.notifications import notify_users
from services.publish_service import execute_app_publish

logger = logging.getLogger(__name__)
from routers.applications import enrich_app_with_members_data

router = APIRouter(tags=["Dashboard"])


@router.get("/api/dashboard")
async def get_dashboard_data(tg_id: int = 0):
    stats = await db.get_general_statistics()
    teams = await db.get_all_teams()
    teams_dict = {t['id']: t['name'] for t in teams}

    # Синхронизация статусов техники: сбрасываем 'work' если нет активных заявок
    import json as _json
    async with db.conn.execute("SELECT id FROM equipment WHERE status = 'work'") as cur:
        work_equip_ids = [r[0] for r in await cur.fetchall()]
    if work_equip_ids:
        async with db.conn.execute(
            "SELECT equipment_data FROM applications WHERE status IN ('approved', 'published', 'in_progress')"
        ) as cur:
            active_eq_ids = set()
            for r in await cur.fetchall():
                if r[0]:
                    try:
                        for e in _json.loads(r[0]):
                            if not e.get('is_freed'):
                                active_eq_ids.add(e['id'])
                    except:
                        pass
        for eq_id in work_equip_ids:
            if eq_id not in active_eq_ids:
                await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (eq_id,))
        await db.conn.commit()

    async with db.conn.execute("SELECT * FROM equipment ORDER BY category, name") as cur:
        equip = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    async with db.conn.execute(
            "SELECT DISTINCT category FROM equipment WHERE category IS NOT NULL AND category != ''") as cur:
        cat_rows = await cur.fetchall()
    categories = [r[0].strip().capitalize() for r in cat_rows if r[0].strip()]

    async with db.conn.execute(
            "SELECT * FROM applications WHERE date_target >= date('now', '-14 days') AND (is_archived = 0 OR is_archived IS NULL) ORDER BY id DESC") as cur:
        all_apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

    for a in all_apps:
        enrich_app_with_team_name(a, teams_dict)
        await enrich_app_with_members_data(a)

    recent_addresses = []
    real_tg_id = None
    user_role = None
    if tg_id != 0:
        real_tg_id = await resolve_id(tg_id)
        user = await db.get_user(real_tg_id)
        user_role = dict(user).get('role') if user else None
        async with db.conn.execute("SELECT object_address FROM applications WHERE foreman_id = ? ORDER BY id DESC",
                                   (real_tg_id,)) as cur:
            for r in await cur.fetchall():
                if r[0] and r[0] not in recent_addresses: recent_addresses.append(r[0])
                if len(recent_addresses) >= 5: break

    # Фильтрация для прорабов и бригадиров: только свои заявки
    if user_role in ('foreman', 'brigadier') and real_tg_id:
        all_apps = [a for a in all_apps if a.get('foreman_id') == real_tg_id]

    # Enrich teams with member_count + brigadier_name
    enriched_teams = []
    for t in teams:
        tid = t['id']
        team_info = {"id": tid, "name": t['name'], "member_count": 0, "brigadier_name": None}
        try:
            async with db.conn.execute("SELECT COUNT(*) FROM team_members WHERE team_id = ?", (tid,)) as c:
                row = await c.fetchone()
                team_info["member_count"] = row[0] if row else 0
            async with db.conn.execute("SELECT fio FROM team_members WHERE team_id = ? AND is_foreman = 1 LIMIT 1", (tid,)) as c:
                row = await c.fetchone()
                if row:
                    team_info["brigadier_name"] = row[0]
        except Exception:
            pass
        enriched_teams.append(team_info)

    return {"stats": stats, "teams": enriched_teams, "equipment": equip,
            "equip_categories": list(set(categories)), "kanban_apps": all_apps, "recent_addresses": recent_addresses}


@router.get("/api/logs")
async def get_logs(): return await db.get_recent_logs(50)


# ── Online users ──

@router.get("/api/online")
async def get_online_users(tg_id: int = 0):
    """Returns users active in the last 5 minutes."""
    if tg_id:
        real_id = await resolve_id(tg_id)
        user = await db.get_user(real_id)
        if not user:
            raise HTTPException(401, "Not authenticated")

    cutoff = (datetime.now() - timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S")
    async with db.conn.execute(
        "SELECT user_id, fio, role, last_active FROM users WHERE last_active > ? AND is_blacklisted = 0 ORDER BY last_active DESC",
        (cutoff,)
    ) as cur:
        rows = await cur.fetchall()

    users_list = [{"user_id": r[0], "fio": r[1], "role": r[2], "last_active": r[3]} for r in rows]
    return {"count": len(users_list), "users": users_list}


# ── Notification center ──

@router.get("/api/notifications/my")
async def get_my_notifications(tg_id: int = 0, limit: int = 50):
    if not tg_id:
        raise HTTPException(401, "Not authenticated")
    real_id = await resolve_id(tg_id)

    async with db.conn.execute(
        "SELECT id, type, title, body, is_read, created_at, link_url FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (real_id, limit)
    ) as cur:
        rows = await cur.fetchall()

    notifications = []
    unread = 0
    for r in rows:
        is_read = bool(r[4])
        notifications.append({"id": r[0], "type": r[1], "title": r[2], "body": r[3], "is_read": is_read, "created_at": r[5], "link_url": r[6]})
        if not is_read:
            unread += 1

    return {"notifications": notifications, "unread_count": unread}


@router.post("/api/notifications/read")
async def mark_notifications_read(tg_id: int = Form(...), notification_ids: str = Form("")):
    if not tg_id:
        raise HTTPException(401, "Not authenticated")
    real_id = await resolve_id(tg_id)

    if notification_ids == "all":
        await db.conn.execute("UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", (real_id,))
    else:
        ids = [int(x) for x in notification_ids.split(",") if x.strip().isdigit()]
        if ids:
            pl = ",".join("?" * len(ids))
            await db.conn.execute(f"UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND id IN ({pl})", (real_id, *ids))

    await db.conn.commit()
    return {"status": "ok"}


@router.get("/api/settings")
async def get_settings():
    async with db.conn.execute("SELECT key, value FROM settings") as cur:
        rows = await cur.fetchall()
    return {r[0]: r[1] for r in rows}


@router.get("/api/settings/support")
async def get_support_settings():
    """Public endpoint — returns support messenger links (no auth required)."""
    result = {"support_tg_link": "", "support_max_link": ""}
    async with db.conn.execute(
        "SELECT key, value FROM settings WHERE key IN ('support_tg_link', 'support_max_link')"
    ) as cur:
        for row in await cur.fetchall():
            result[row[0]] = row[1]
    return result


@router.post("/api/settings/update")
async def update_settings(auto_publish_time: str = Form(""), auto_publish_enabled: str = Form("0"),
                          auto_start_orders_time: str = Form(""),
                          report_request_time: str = Form(""),
                          foreman_reminder_time: str = Form(""),
                          foreman_reminder_weekends: str = Form("0"), auto_complete_time: str = Form(""),
                          auto_backup_enabled: str = Form("0"),
                          office_reminder_enabled: str = Form("0"),
                          office_reminder_time: str = Form(""),
                          smr_unlock_time: str = Form(""),
                          equip_base_time_start: str = Form("08:00"),
                          equip_base_time_end: str = Form("18:00"),
                          exchange_enabled: str = Form("1"),
                          log_retention_days: str = Form("90"),
                          support_tg_link: str = Form(""),
                          support_max_link: str = Form(""),
                          gemini_api_key: str = Form(""),
                          tg_id: int = Form(0)):
    user = await db.get_user(tg_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']: raise HTTPException(403,
                                                                                                          "Нет прав")

    pairs = [
        ('auto_publish_time', auto_publish_time),
        ('auto_publish_enabled', auto_publish_enabled),
        ('auto_start_orders_time', auto_start_orders_time),
        ('report_request_time', report_request_time),
        ('foreman_reminder_time', foreman_reminder_time),
        ('foreman_reminder_weekends', foreman_reminder_weekends),
        ('auto_complete_time', auto_complete_time),
        ('auto_backup_enabled', auto_backup_enabled),
        ('office_reminder_enabled', office_reminder_enabled),
        ('office_reminder_time', office_reminder_time),
        ('smr_unlock_time', smr_unlock_time),
        ('equip_base_time_start', equip_base_time_start),
        ('equip_base_time_end', equip_base_time_end),
        ('exchange_enabled', exchange_enabled),
        ('log_retention_days', log_retention_days),
    ]

    # Support settings — superadmin only
    if dict(user).get('role') == 'superadmin':
        pairs.extend([
            ('support_tg_link', support_tg_link),
            ('support_max_link', support_max_link),
            ('gemini_api_key', gemini_api_key),
        ])

    try:
        for k, v in pairs:
            await db.conn.execute("UPDATE settings SET value = ? WHERE key = ?", (v, k))
            await db.conn.execute("INSERT INTO settings (key, value) SELECT ?, ? WHERE (SELECT Changes() = 0)", (k, v))

        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Database error: {e}")

    await db.add_log(tg_id, dict(user).get('fio'), "Обновил системные настройки", target_type='settings')
    return {"status": "ok"}


@router.post("/api/cron/start_day")
async def cron_start_day():
    # Проверяем, включена ли автопубликация
    async with db.conn.execute("SELECT value FROM settings WHERE key = 'auto_publish_enabled'") as cur:
        row = await cur.fetchone()
        if not row or row[0] != '1':
            return {"status": "disabled", "reason": "auto_publish_enabled is off"}

    # Получаем базовое время
    async with db.conn.execute("SELECT value FROM settings WHERE key = 'auto_publish_time'") as cur:
        row_time = await cur.fetchone()
        default_time = row_time[0] if row_time and row_time[0] else "08:00"

    default_hour = default_time.split(":")[0].zfill(2)

    now = datetime.now(TZ_BARNAUL)
    current_date = now.strftime("%Y-%m-%d")
    current_hour = now.strftime("%H")

    # Ищем все одобренные заявки на сегодня
    async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved' AND date_target = ?",
                               (current_date,)) as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

    published_count = 0
    for app in apps:
        app_start_hour = default_hour

        # Если есть техника, берем самое раннее время
        if app.get('equipment_data'):
            try:
                import json
                eq_list = json.loads(app['equipment_data'])
                if eq_list:
                    min_eq_hour = min([int(str(e.get('time_start', default_hour)).split(':')[0]) for e in eq_list])
                    app_start_hour = str(min_eq_hour).zfill(2)
            except:
                pass

        # Если текущий час совпадает с временем старта — публикуем
        if app_start_hour == current_hour:
            if await execute_app_publish(app):
                published_count += 1

    return {"status": "ok", "published": published_count}


@router.post("/api/cron/end_day")
async def cron_end_day(): return {"status": "ok"}


@router.post("/api/cron/check_timeouts")
async def cron_check_timeouts(): return {"status": "ok"}


@router.post("/api/system/test_notification")
async def test_notification(tg_id: int = Form(...), platform: str = Form("all")):
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') != 'superadmin':
        raise HTTPException(403, "Нет прав")

    fio = dict(user).get('fio', 'Супер-Админ')
    platform_name = "MAX" if platform == "max" else "Telegram"

    fake_app = {
        'id': 9999,
        'date_target': datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d"),
        'object_address': f'Тестовый объект ({platform_name})',
        'foreman_id': real_tg_id,
        'foreman_name': fio,
        'team_name': f'Тестовая бригада {platform_name}',
        'selected_members': '',
        'equipment_data': '[]',
        'comment': f'Это тестовый наряд для проверки доставки изображений в {platform_name}',
        'approved_by': 'Автоматика',
        'approved_by_id': real_tg_id
    }

    async def _send_test_notifications():
        try:
            await notify_users([], f"🧪 <b>Тестовое уведомление:</b> Вас добавили в наряд! ({platform_name})", "my-apps",
                               [real_tg_id], target_platform=platform)
            await notify_users(["moderator"],
                               f"📝 <b>Тестовая заявка ({platform_name}):</b>\n👷‍♂️ Прораб: {fio}\n📍 Объект: Проверка уведомлений",
                               "review", [real_tg_id], target_platform=platform)
            await execute_app_publish(fake_app, target_platform=platform)
        except Exception as e:
            logger.error(f"Test notification error: {e}")

    asyncio.create_task(_send_test_notifications())
    return {"status": "ok"}


@router.get("/api/dashboard/sidebar_counts")
async def sidebar_counts(tg_id: int = 0):
    """Counts for sidebar badges."""
    if db.conn is None:
        await db.init_db()

    counts = {
        "object_requests": 0,
        "approved_apps": 0,
        "kp_to_fill": 0,
        "kp_to_review": 0,
        "kp_done": 0,
    }

    try:
        async with db.conn.execute("SELECT COUNT(*) FROM object_requests WHERE status = 'pending'") as cur:
            row = await cur.fetchone()
            counts["object_requests"] = row[0] if row else 0
    except Exception:
        pass

    try:
        async with db.conn.execute("SELECT COUNT(*) FROM applications WHERE status = 'approved' AND is_archived = 0") as cur:
            row = await cur.fetchone()
            counts["approved_apps"] = row[0] if row else 0
    except Exception:
        pass

    try:
        async with db.conn.execute(
            "SELECT COUNT(*) FROM applications WHERE status IN ('in_progress', 'completed') AND kp_status NOT IN ('approved', 'submitted') AND kp_archived = 0 AND is_archived = 0"
        ) as cur:
            row = await cur.fetchone()
            counts["kp_to_fill"] = row[0] if row else 0
    except Exception:
        pass

    try:
        async with db.conn.execute(
            "SELECT COUNT(*) FROM applications WHERE kp_status = 'submitted' AND kp_archived = 0 AND is_archived = 0"
        ) as cur:
            row = await cur.fetchone()
            counts["kp_to_review"] = row[0] if row else 0
    except Exception:
        pass

    try:
        async with db.conn.execute(
            "SELECT COUNT(*) FROM applications WHERE kp_status = 'approved' AND kp_archived = 0 AND is_archived = 0"
        ) as cur:
            row = await cur.fetchone()
            counts["kp_done"] = row[0] if row else 0
    except Exception:
        pass

    return counts