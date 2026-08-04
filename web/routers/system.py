import sys
import os
import logging

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional
from database_deps import db, TZ_BARNAUL
from datetime import datetime, timedelta
from utils import get_all_linked_ids
from auth_deps import get_current_user, require_role
from services.notifications import notify_users, send_schedule_notifications
from services.image_service import strip_html
from services.schedule_helpers import get_waiting_apps_for_date, get_schedule_dates
from services.max_api import get_max_dm_chat_id, send_max_message
from services.broadcast_service import broadcast_group, broadcast_dm_roles, broadcast_dm_users, run_test_notification
from schedule_generator import publish_schedule_to_group, generate_schedule_images
import asyncio

router = APIRouter(tags=["System"])
logger = logging.getLogger("SYSTEM")

LOG_FILE_PATH = os.path.join("data", "server.log")

_require_office = require_role("superadmin", "boss", "moderator")
_require_superadmin = require_role("superadmin")


# --- Models ---

class BroadcastGroupRequest(BaseModel):
    message: str


class BroadcastDMRequest(BaseModel):
    message: str
    mode: str  # "roles" or "users"
    roles: Optional[List[str]] = None
    user_ids: Optional[List[int]] = None


# --- Broadcast Endpoints ---

@router.post("/api/system/broadcast/group")
async def broadcast_to_group(req: BroadcastGroupRequest, current_user=Depends(_require_office)):
    """Send a broadcast message to the group chat."""
    if not req.message.strip():
        raise HTTPException(400, "Сообщение не может быть пустым")
    real_id = current_user["tg_id"]
    fio = current_user.get('fio', 'Администратор')
    asyncio.create_task(broadcast_group(real_id, fio, req.message))
    return {"status": "ok"}


@router.post("/api/system/broadcast/dm")
async def broadcast_to_dm(req: BroadcastDMRequest, current_user=Depends(_require_office)):
    """Send a broadcast message to DMs — by roles or specific users."""
    if not req.message.strip():
        raise HTTPException(400, "Сообщение не может быть пустым")
    real_id = current_user["tg_id"]
    fio = current_user.get('fio', 'Администратор')

    if req.mode == "roles":
        if not req.roles:
            raise HTTPException(400, "Не выбраны роли")
        # Moderator cannot broadcast to boss/superadmin
        if current_user.get("role") == "moderator":
            forbidden = {"superadmin", "boss"} & set(req.roles)
            if forbidden:
                raise HTTPException(403, f"Модератор не может рассылать роли: {', '.join(forbidden)}")
        asyncio.create_task(broadcast_dm_roles(real_id, fio, req.message, req.roles))
    elif req.mode == "users":
        if not req.user_ids:
            raise HTTPException(400, "Не выбраны пользователи")
        asyncio.create_task(broadcast_dm_users(real_id, fio, req.message, req.user_ids))
    else:
        raise HTTPException(400, "Неверный режим рассылки")

    return {"status": "ok"}


# --- Server Logs Endpoint ---

@router.get("/api/system/server-logs")
async def get_server_logs(current_user=Depends(_require_office)):
    """Read last 100 lines of the server log file."""
    if not os.path.exists(LOG_FILE_PATH):
        return {"lines": ["[Лог-файл не найден. Убедитесь, что серверное логирование настроено.]"]}

    try:
        with open(LOG_FILE_PATH, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        filtered = [line for line in all_lines if 'apscheduler' not in line.lower()]
        last_100 = filtered[-100:] if len(filtered) > 100 else filtered
        return {"lines": [line.rstrip('\n') for line in last_100]}
    except Exception as e:
        return {"lines": [f"[Ошибка чтения лог-файла: {e}]"]}


# --- Extended Test Notifications ---

@router.post("/api/system/test_notification_extended")
async def test_notification_extended(test_type: str = Form(...), platform: str = Form("all"),
                                     current_user=Depends(_require_superadmin)):
    """Extended test notifications for specific scenarios. Superadmin only."""
    real_tg_id = current_user["tg_id"]
    fio = current_user.get('fio', 'Супер-Админ')

    async def _run_test():
        try:
            success, error = await run_test_notification(real_tg_id, fio, test_type, platform)
            if not success:
                logger.error(f"Test notification failed: {error}")
        except Exception as e:
            logger.error(f"Test notification error: {e}")

    asyncio.create_task(_run_test())
    return {"status": "ok", "test_type": test_type}


# --- v2.4.10: precise test-notification panel (user × channels × type) ---

_require_boss_plus = require_role("superadmin", "boss")


@router.post("/api/system/test_notification")
async def api_test_notification(request: Request, current_user=Depends(_require_boss_plus)):
    """Send a test notification to a specific user via selected channels.

    Body: {
      target_user_id: int | null,      # null = self
      channels: ["max", "pwa"],
      notification_type: str,          # e.g. "app_approved"
      custom_message: str,
    }
    Returns {results: ["MAX → …: OK", "Push → …: OK"]}.
    """
    data = await request.json()
    try:
        target_id = int(data.get('target_user_id') or current_user['tg_id'])
    except (TypeError, ValueError):
        target_id = current_user['tg_id']
    channels = data.get('channels') or []
    notif_type = (data.get('notification_type') or '').strip() or 'app_approved'
    custom_msg = (data.get('custom_message') or '').strip() or 'Тестовое уведомление'

    async with db.conn.execute("SELECT * FROM users WHERE user_id = ?", (target_id,)) as cur:
        target_row = await cur.fetchone()
    if not target_row:
        raise HTTPException(404, "Пользователь не найден")
    target_user = dict(target_row)
    target_name = target_user.get('fio') or str(target_id)

    results: list[str] = []

    # Gather linked account ids; active messenger identities are MAX ids.
    try:
        from utils import get_all_linked_ids
        linked_ids = await get_all_linked_ids(target_id)
    except Exception:
        linked_ids = [target_id]

    if 'max' in channels:
        max_ids = [abs(i) for i in linked_ids if i < 0]
        if not max_ids:
            results.append(f"MAX → {target_name}: не привязан")
        else:
            import os as _os
            mtoken = _os.getenv("MAX_BOT_TOKEN")
            if not mtoken:
                results.append("MAX → MAX_BOT_TOKEN не задан")
            else:
                from services.max_api import get_max_dm_chat_id, send_max_text
                for mid in max_ids:
                    try:
                        chat_id = await get_max_dm_chat_id(str(mid))
                        if chat_id:
                            await send_max_text(mtoken, chat_id, custom_msg)
                            results.append(f"MAX → {target_name}: OK")
                        else:
                            results.append(f"MAX → {target_name}: нет DM-чата")
                    except Exception as e:
                        results.append(f"MAX → {target_name}: {str(e)[:80]}")

    if 'pwa' in channels:
        try:
            async with db.conn.execute(
                "SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?", (target_id,)
            ) as cur:
                sub_count = (await cur.fetchone())[0]
        except Exception:
            sub_count = 0
        if sub_count == 0:
            results.append(f"Push → {target_name}: нет подписок")
        else:
            try:
                from services.notifications import _send_web_push_safe
                await _send_web_push_safe([target_id], 'Тест', custom_msg, url='/dashboard', push_type=notif_type)
                results.append(f"Push → {target_name}: отправлено в {sub_count} подписок")
            except Exception as e:
                results.append(f"Push → {target_name}: {str(e)[:80]}")

    await db.add_log(
        current_user["tg_id"], current_user.get('fio', ''),
        f"Тестовое уведомление для {target_name} ({', '.join(channels) or '—'})",
        target_type='system',
    )
    return {"results": results}


@router.post("/api/system/test_schedule")
async def api_test_schedule(current_user=Depends(_require_boss_plus)):
    """Generate tomorrow's schedule images and send them to the caller in MAX."""
    import os as _os

    tomorrow = (datetime.now(TZ_BARNAUL) + timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        # v2.7.2: route through the two-image generator (бригады + техника).
        buf_a, buf_b = await generate_schedule_images(tomorrow)
    except Exception as e:
        raise HTTPException(500, f"Не удалось сгенерировать PNG: {e}")

    token = _os.getenv("MAX_BOT_TOKEN")
    if not token:
        raise HTTPException(500, "MAX_BOT_TOKEN не задан")

    user_id = current_user["tg_id"]
    linked_ids = await get_all_linked_ids(user_id)
    max_ids = [abs(item) for item in linked_ids if item < 0]
    if not max_ids:
        raise HTTPException(400, "MAX не привязан — откройте приложение через MAX")

    # v2.7.2: two images — бригады first, техника second.
    images = [
        (buf_a, f'Тестовая расстановка на {tomorrow} — Бригады'),
        (buf_b, f'Тестовая расстановка на {tomorrow} — Техника'),
    ]
    try:
        import time as _time
        os.makedirs(os.path.join("data", "uploads"), exist_ok=True)
        for index, (_buf, _caption) in enumerate(images, start=1):
            filepath = os.path.join(
                "data", "uploads",
                f"schedule_test_{tomorrow}_{index}_{int(_time.time())}.png",
            )
            with open(filepath, "wb") as file_obj:
                file_obj.write(_buf.getvalue())
            for max_id in max_ids:
                chat_id = await get_max_dm_chat_id(str(max_id))
                await send_max_message(token, chat_id, _caption, filepath)
    except Exception as e:
        raise HTTPException(500, f"Ошибка отправки: {e}")

    await db.add_log(user_id, current_user.get('fio', ''),
                     f"Отправил тестовую расстановку на {tomorrow}", target_type='system')
    return {"status": "ok", "date": tomorrow}


# --- Debtors Endpoint ---

@router.get("/api/system/debtors")
async def get_debtors(current_user=Depends(_require_office)):
    """Должники СМР: прорабы с незаполненным СМР, сгруппированные по прорабу."""
    today = datetime.now(TZ_BARNAUL).date()
    grace_str = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    async with db.conn.execute(
        "SELECT a.id, a.foreman_id, a.foreman_name, a.object_address, a.date_target, a.status, "
        "       o.name AS obj_name, o.address AS obj_address "
        "FROM applications a "
        "LEFT JOIN objects o ON a.object_id = o.id "
        "WHERE a.status IN ('in_progress', 'completed') "
        "AND a.date_target <= ? AND a.foreman_id IS NOT NULL "
        "AND (a.kp_status IS NULL OR a.kp_status NOT IN ('approved', 'submitted')) "
        "AND (a.kp_archived = 0 OR a.kp_archived IS NULL) "
        "ORDER BY a.foreman_name, a.date_target ASC",
        (grace_str,)
    ) as cur:
        rows = await cur.fetchall()

    grouped = {}
    for r in rows:
        fid = r[1]
        date_target = r[4]
        try:
            dt = datetime.strptime(date_target, "%Y-%m-%d").date()
            days_overdue = (today - dt).days
        except (ValueError, TypeError):
            days_overdue = 0
        if fid not in grouped:
            grouped[fid] = {"foreman_id": fid, "foreman_name": r[2] or "Неизвестный", "smrs": []}
        legacy = r[3] or "—"
        obj_name = r[6] or legacy
        obj_address = r[7] or ""
        grouped[fid]["smrs"].append({
            "app_id": r[0],
            "object_address": obj_address,
            "object_name": obj_name,
            "date_target": date_target,
            "status": r[5],
            "days_overdue": days_overdue,
        })

    return list(grouped.values())


class RemindSMRRequest(BaseModel):
    foreman_id: int
    app_ids: List[int]


@router.post("/api/system/remind_smr")
async def remind_smr(req: RemindSMRRequest, current_user=Depends(_require_office)):
    """Отправить напоминание прорабу о незаполненных СМР."""
    real_id = current_user["tg_id"]
    fio = current_user.get('fio', 'Администратор')

    if not req.app_ids:
        raise HTTPException(400, "Нет заявок для напоминания")

    placeholders = ','.join(['?'] * len(req.app_ids))
    async with db.conn.execute(
        f"SELECT id, object_address, date_target FROM applications WHERE id IN ({placeholders})",
        req.app_ids
    ) as cur:
        apps = await cur.fetchall()

    if not apps:
        raise HTTPException(404, "Заявки не найдены")

    lines = [f"• {a[1] or '—'} ({a[2]})" for a in apps]
    message = "⏰ <b>Напоминание: заполните СМР отчёт</b>\n\n" + "\n".join(lines)

    async def _do_remind():
        try:
            # One canonical dispatch resolves the foreman's MAX account and
            # applies the user's notification settings.
            await notify_users(
                [], message, "kp", extra_tg_ids=[req.foreman_id],
                category="reports", event_key="smr_debt",
            )
            await db.add_log(real_id, fio,
                             f"Напомнил о СМР прорабу (ID: {req.foreman_id}, {len(req.app_ids)} заявок)",
                             target_type='smr')
        except Exception as e:
            logger.error(f"Remind SMR error: {e}")

    asyncio.create_task(_do_remind())
    return {"status": "ok"}


# --- Smart Scheduling Endpoints ---

@router.get("/api/system/schedule_dates")
async def api_schedule_dates(current_user=Depends(_require_office)):
    """Даты с группировкой заявок по статусу (approved / waiting)."""
    dates = await get_schedule_dates()
    result = []
    for d in dates:
        async with db.conn.execute(
            "SELECT object_address, foreman_name, status FROM applications "
            "WHERE date_target = ? AND status IN ('approved','pending','waiting') "
            "AND (is_archived = 0 OR is_archived IS NULL) "
            "ORDER BY status, id",
            (d,)
        ) as cur:
            rows = await cur.fetchall()

        approved = [{"object_address": r[0] or "—", "foreman_name": r[1] or "—"}
                     for r in rows if r[2] == "approved"]
        waiting = [{"object_address": r[0] or "—", "foreman_name": r[1] or "—"}
                    for r in rows if r[2] in ("waiting", "pending")]

        if approved or waiting:
            result.append({"date": d, "approved": approved, "waiting": waiting})

    return result


@router.get("/api/system/schedule_warnings")
async def api_schedule_warnings(date: str = "", current_user=Depends(_require_office)):
    """Получить непроверенные заявки на дату."""
    if not date:
        raise HTTPException(400, "Не указана дата")
    return await get_waiting_apps_for_date(date)


@router.post("/api/system/send_schedule_group")
async def api_send_schedule_group(date: str = Form(""), current_user=Depends(_require_office)):
    """Отправить расстановку-картинку в групповой чат MAX."""
    real_id = current_user["tg_id"]
    user_fio = current_user.get('fio', 'Модератор')
    if not date:
        raise HTTPException(400, "Не указана дата")

    async def _do_send_group():
        try:
            await publish_schedule_to_group(date)
            count = await send_schedule_notifications(date)
            try:
                await db.conn.execute("DELETE FROM settings WHERE key = 'smart_publish_at'")
                await db.conn.commit()
            except:
                pass
            await db.add_log(real_id, user_fio,
                             f"Отправил расстановку на {date} в группу ({count} нарядов)",
                             target_type='system')
        except Exception as e:
            logger.error(f"Error sending schedule group for {date}: {e}")

    asyncio.create_task(_do_send_group())
    return {"status": "ok"}


@router.post("/api/system/send_schedule_self")
async def api_send_schedule_self(date: str = Form(""), current_user=Depends(_require_office)):
    """Отправить расстановку-картинку в ЛС запрашивающему пользователю."""
    real_id = current_user["tg_id"]
    user_fio = current_user.get('fio', 'Модератор')
    if not date:
        raise HTTPException(400, "Не указана дата")

    async def _do_send_self():
        try:
            # v2.7.2: two images (бригады + техника), matching group publish.
            # Generate BOTH up-front — if either fails, send neither.
            buf_a, buf_b = await generate_schedule_images(date)

            import time as _time
            ts = int(_time.time())
            os.makedirs(os.path.join("data", "uploads"), exist_ok=True)

            def _save(buf, suffix):
                fn = f"schedule_{date}_{suffix}_{ts}.png"
                fp = os.path.join("data", "uploads", fn)
                with open(fp, "wb") as f:
                    f.write(buf.getvalue())
                return fp

            filepath_a = _save(buf_a, "a_brigades")
            filepath_b = _save(buf_b, "b_equipment")

            cap_a = f"📋 Расстановка на {date} — Бригады"
            cap_b = f"📋 Расстановка на {date} — Техника"

            linked_ids = await get_all_linked_ids(real_id)
            max_ids = [abs(lid) for lid in linked_ids if lid < 0]

            max_bot_token = os.getenv("MAX_BOT_TOKEN")

            if max_bot_token and max_ids:
                for mid in max_ids:
                    dm_chat_id = await get_max_dm_chat_id(str(mid))
                    await send_max_message(max_bot_token, dm_chat_id, cap_a, filepath_a)
                    await send_max_message(max_bot_token, dm_chat_id, cap_b, filepath_b)

            await db.add_log(real_id, user_fio,
                             f"Запросил расстановку на {date} себе в ЛС",
                             target_type='system')
        except Exception as e:
            logger.error(f"Error sending schedule self for {real_id}: {e}")

    asyncio.create_task(_do_send_self())
    return {"status": "ok"}


@router.post("/api/system/delay_publish")
async def api_delay_publish(current_user=Depends(_require_office)):
    """Defer the daily-prep prompt by 10 minutes.

    v2.4.9: the prompt itself is re-sent after 10 minutes (clears
    `smart_prompt_sent_<date>` + sets `smart_prompt_at`). The old
    behaviour silently auto-published — now the moderator gets a fresh
    decision point, matching the task requirement for the defer button.
    """
    real_id = current_user["tg_id"]
    new_time = datetime.now(TZ_BARNAUL) + timedelta(minutes=10)
    new_time_str = new_time.strftime("%Y-%m-%d %H:%M:%S")

    # Keep the auto-publish fallback but push it further out to avoid
    # racing the re-prompt (20 min after defer).
    fallback = datetime.now(TZ_BARNAUL) + timedelta(minutes=20)
    await db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('smart_publish_at', ?)",
        (fallback.strftime("%Y-%m-%d %H:%M:%S"),))
    await db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('smart_prompt_at', ?)",
        (new_time_str,))
    # Clear today's "prompt sent" flag so the scheduler re-sends it.
    today_key = f"smart_prompt_sent_{datetime.now(TZ_BARNAUL).strftime('%Y-%m-%d')}"
    await db.conn.execute("DELETE FROM settings WHERE key = ?", (today_key,))
    await db.conn.commit()

    await db.add_log(real_id, current_user.get('fio', 'Модератор'),
                     "Отложил запрос на публикацию на 10 минут", target_type='system')
    return {"status": "ok", "prompt_at": new_time_str}


@router.post("/api/system/notify_debtors_and_defer")
async def api_notify_debtors_and_defer(current_user=Depends(_require_office)):
    """v2.4.9: send reminders to foremen who have no approved applications
    for tomorrow, then schedule a re-prompt in 10 minutes (same as defer)."""
    import asyncio as _asyncio
    from services.schedule_helpers import get_application_debtors_for_date
    from services.notifications import notify_users

    real_id = current_user["tg_id"]
    tomorrow = (datetime.now(TZ_BARNAUL) + timedelta(days=1)).strftime("%Y-%m-%d")
    debtors = await get_application_debtors_for_date(tomorrow)

    # Defer the prompt + push auto-publish out.
    new_time = datetime.now(TZ_BARNAUL) + timedelta(minutes=10)
    fallback = datetime.now(TZ_BARNAUL) + timedelta(minutes=20)
    await db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('smart_publish_at', ?)",
        (fallback.strftime("%Y-%m-%d %H:%M:%S"),))
    await db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('smart_prompt_at', ?)",
        (new_time.strftime("%Y-%m-%d %H:%M:%S"),))
    today_key = f"smart_prompt_sent_{datetime.now(TZ_BARNAUL).strftime('%Y-%m-%d')}"
    await db.conn.execute("DELETE FROM settings WHERE key = ?", (today_key,))
    await db.conn.commit()

    # Notify debtors (fire-and-forget per recipient).
    notified = 0
    if debtors:
        recipient_ids = [d['user_id'] for d in debtors]
        _asyncio.create_task(notify_users(
            [],
            f"📝 <b>Нужно подать заявку</b>\n📅 Дата работ: {tomorrow}\n\nОткройте приложение и заполните состав бригады и технику.",
            "dashboard", extra_tg_ids=recipient_ids, category="orders",
            event_key="app_reminder",
        ))
        notified = len(recipient_ids)

    await db.add_log(
        real_id, current_user.get('fio', 'Модератор'),
        f"Уведомил должников ({notified}) и отложил публикацию на 10 минут",
        target_type='system',
    )
    return {"status": "ok", "notified": notified, "prompt_at": new_time.strftime("%Y-%m-%d %H:%M:%S")}
