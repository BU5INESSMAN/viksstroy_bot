import sys
import os
import logging

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from database_deps import db, TZ_BARNAUL
from datetime import datetime, timedelta
from utils import (resolve_id, notify_users, notify_group_chat, strip_html,
                   send_schedule_notifications,
                   get_waiting_apps_for_date, get_schedule_dates)
from schedule_generator import publish_schedule_to_group, generate_schedule_image

router = APIRouter(tags=["System"])
logger = logging.getLogger("SYSTEM")

LOG_FILE_PATH = os.path.join("data", "server.log")


# --- Models ---

class BroadcastGroupRequest(BaseModel):
    tg_id: int
    message: str


class BroadcastDMRequest(BaseModel):
    tg_id: int
    message: str
    mode: str  # "roles" or "users"
    roles: Optional[List[str]] = None
    user_ids: Optional[List[int]] = None


# --- Helpers ---

async def verify_moderator_plus(tg_id: int):
    """Verify user is moderator, boss, or superadmin."""
    real_id = await resolve_id(tg_id)
    user = await db.get_user(real_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(403, "Нет прав")
    return real_id, dict(user)


# --- Broadcast Endpoints ---

@router.post("/api/system/broadcast/group")
async def broadcast_to_group(req: BroadcastGroupRequest):
    """Send a broadcast message to the group chat."""
    real_id, user = await verify_moderator_plus(req.tg_id)
    if not req.message.strip():
        raise HTTPException(400, "Сообщение не может быть пустым")

    text = f"📢 <b>Рассылка от {user.get('fio', 'Администратор')}:</b>\n\n{req.message}"
    await notify_group_chat(text, "dashboard")
    await db.add_log(real_id, user.get('fio'), f"Отправил рассылку в группу")
    return {"status": "ok"}


@router.post("/api/system/broadcast/dm")
async def broadcast_to_dm(req: BroadcastDMRequest):
    """Send a broadcast message to DMs — by roles or specific users."""
    real_id, user = await verify_moderator_plus(req.tg_id)
    if not req.message.strip():
        raise HTTPException(400, "Сообщение не может быть пустым")

    text = f"📢 <b>Рассылка от {user.get('fio', 'Администратор')}:</b>\n\n{req.message}"

    if req.mode == "roles":
        if not req.roles:
            raise HTTPException(400, "Не выбраны роли")
        await notify_users(req.roles, text, "dashboard")
        await db.add_log(real_id, user.get('fio'), f"Отправил рассылку в ЛС (роли: {', '.join(req.roles)})")

    elif req.mode == "users":
        if not req.user_ids:
            raise HTTPException(400, "Не выбраны пользователи")
        await notify_users([], text, "dashboard", extra_tg_ids=req.user_ids)
        await db.add_log(real_id, user.get('fio'), f"Отправил рассылку в ЛС ({len(req.user_ids)} пользователей)")

    else:
        raise HTTPException(400, "Неверный режим рассылки")

    return {"status": "ok"}


# --- Server Logs Endpoint ---

@router.get("/api/system/server-logs")
async def get_server_logs(tg_id: int = 0):
    """Read last 100 lines of the server log file."""
    await verify_moderator_plus(tg_id)

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
async def test_notification_extended(tg_id: int = Form(...), test_type: str = Form(...), platform: str = Form("all")):
    """Extended test notifications for specific scenarios."""
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') != 'superadmin':
        raise HTTPException(403, "Нет прав")

    fio = dict(user).get('fio', 'Супер-Админ')
    platform_name = "MAX" if platform == "max" else "Telegram" if platform == "tg" else "MAX + Telegram"

    if test_type == "brigadier":
        # Fixed: sends to the requesting user as a brigadier-role notification
        await notify_users(
            ["brigadier"],
            f"🧪 <b>Тест (Бригадир):</b> Вы назначены на смену завтра.\n📍 Объект: Тестовый объект\n⏰ Начало: 08:00 ({platform_name})",
            "my-apps",
            [real_tg_id],
            target_platform=platform
        )

    elif test_type == "resource_freed":
        await notify_users(
            ["foreman", "moderator"],
            f"🔓 <b>Ресурс освобождён ({platform_name}):</b>\n🚜 Кран КС-55713 свободен с 14:00\n👷 Водитель: Иванов И.И.",
            "dashboard",
            [real_tg_id],
            target_platform=platform,
            category="orders"
        )

    elif test_type == "schedule_published":
        await notify_users(
            ["foreman", "brigadier"],
            f"📅 <b>Расписание опубликовано ({platform_name}):</b>\n📆 Расписание на завтра готово и утверждено.\nОткройте платформу для просмотра нарядов.",
            "dashboard",
            [real_tg_id],
            target_platform=platform,
            category="orders"
        )

    elif test_type == "kp_review":
        await notify_users(
            ["moderator", "boss"],
            f"📋 <b>Требуется проверка КП ({platform_name}):</b>\n👷 Прораб: {fio}\n📍 Объект: Тестовый объект\n💰 Сумма: 150 000 ₽",
            "kp",
            [real_tg_id],
            target_platform=platform,
            category="reports"
        )

    elif test_type == "system_error":
        # HARDCODED: system errors go STRICTLY to superadmins via DM + main group chat.
        # Never send debug/error alerts to moderators.
        error_msg = f"🚨 <b>Тест системной ошибки ({platform_name}):</b>\n❌ RuntimeError: Test exception\n👣 Маршрут: /api/system/test\n🕐 {datetime.now(TZ_BARNAUL).strftime('%H:%M:%S')}"
        await notify_users(
            ["report_group", "superadmin"],
            error_msg,
            "system",
            extra_tg_ids=[real_tg_id],
            target_platform=platform,
            category="errors"
        )

    else:
        raise HTTPException(400, f"Неизвестный тип теста: {test_type}")

    return {"status": "ok", "test_type": test_type}


# --- Debtors Endpoint ---

@router.get("/api/system/debtors")
async def get_debtors(tg_id: int = 0):
    """Должники СМР: прорабы с просроченными нарядами, сгруппированные по прорабу."""
    if tg_id:
        await verify_moderator_plus(tg_id)

    today_str = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d")
    async with db.conn.execute(
        "SELECT foreman_id, foreman_name, object_address, date_target FROM applications "
        "WHERE status = 'in_progress' AND date_target <= ? AND foreman_id IS NOT NULL "
        "ORDER BY foreman_name, date_target ASC",
        (today_str,)
    ) as cur:
        rows = await cur.fetchall()

    grouped = {}
    for r in rows:
        fid = r[0]
        if fid not in grouped:
            grouped[fid] = {"foreman_id": fid, "foreman_name": r[1] or "Неизвестный", "smrs": []}
        grouped[fid]["smrs"].append({"object_address": r[2] or "—", "date_target": r[3]})

    return list(grouped.values())


# --- Smart Scheduling Endpoints ---

@router.get("/api/system/schedule_dates")
async def api_schedule_dates(tg_id: int = 0):
    """Даты с группировкой заявок по статусу (approved / waiting)."""
    if tg_id:
        await verify_moderator_plus(tg_id)

    dates = await get_schedule_dates()
    result = []
    for d in dates:
        async with db.conn.execute(
            "SELECT object_address, foreman_name, status FROM applications "
            "WHERE date_target = ? AND status IN ('approved','waiting') "
            "AND (is_archived = 0 OR is_archived IS NULL) "
            "ORDER BY status, id",
            (d,)
        ) as cur:
            rows = await cur.fetchall()

        approved = [{"object_address": r[0] or "—", "foreman_name": r[1] or "—"}
                     for r in rows if r[2] == "approved"]
        waiting = [{"object_address": r[0] or "—", "foreman_name": r[1] or "—"}
                    for r in rows if r[2] == "waiting"]
        result.append({"date": d, "approved": approved, "waiting": waiting})

    return result


@router.get("/api/system/schedule_warnings")
async def api_schedule_warnings(tg_id: int = 0, date: str = ""):
    """Получить непроверенные заявки на дату (для предупреждения в модалке)."""
    if tg_id:
        await verify_moderator_plus(tg_id)
    if not date:
        raise HTTPException(400, "Не указана дата")
    waiting = await get_waiting_apps_for_date(date)
    return waiting


@router.post("/api/system/send_schedule_group")
async def api_send_schedule_group(tg_id: int = Form(0), date: str = Form("")):
    """Отправить расстановку-картинку в групповой чат (TG + MAX)."""
    real_id, user_info = await verify_moderator_plus(tg_id)
    if not date:
        raise HTTPException(400, "Не указана дата")

    await publish_schedule_to_group(date)

    # Уведомить всех участников одобренных заявок
    count = await send_schedule_notifications(date)

    # Очищаем таймер авто-публикации
    try:
        await db.conn.execute("DELETE FROM settings WHERE key = 'smart_publish_at'")
        await db.conn.commit()
    except:
        pass

    await db.add_log(real_id, user_info.get('fio'),
                     f"Отправил расстановку на {date} в группу ({count} нарядов)")
    return {"status": "ok", "notified": count}


@router.post("/api/system/send_schedule_self")
async def api_send_schedule_self(tg_id: int = Form(0), date: str = Form("")):
    """Отправить расстановку-картинку в ЛС запрашивающему пользователю."""
    real_id, user_info = await verify_moderator_plus(tg_id)
    if not date:
        raise HTTPException(400, "Не указана дата")

    import aiohttp
    buf = await generate_schedule_image(date)

    # Сохраняем файл
    import time as _time
    filename = f"schedule_{date}_{int(_time.time())}.png"
    filepath = os.path.join("data", "uploads", filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(buf.getvalue())

    # TG — отправляем фото в ЛС
    bot_token = os.getenv("BOT_TOKEN")
    if bot_token:
        buf.seek(0)
        form = aiohttp.FormData()
        form.add_field("chat_id", str(real_id))
        form.add_field("photo", buf.getvalue(), filename="schedule.png", content_type="image/png")
        form.add_field("caption", f"📋 Расстановка на {date}")
        form.add_field("parse_mode", "HTML")
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"https://api.telegram.org/bot{bot_token}/sendPhoto", data=form
                ) as resp:
                    pass
        except Exception:
            pass

    # MAX — отправляем фото в ЛС
    from utils import send_max_message
    max_bot_token = os.getenv("MAX_BOT_TOKEN")
    if max_bot_token:
        # Найти MAX chat_id пользователя
        async with db.conn.execute(
            "SELECT max_chat_id FROM users WHERE user_id = ?", (real_id,)
        ) as cur:
            row = await cur.fetchone()
        max_chat_id = row[0] if row else None
        if max_chat_id:
            await send_max_message(max_bot_token, max_chat_id,
                                   f"📋 Расстановка на {date}", filepath)

    await db.add_log(real_id, user_info.get('fio'),
                     f"Запросил расстановку на {date} себе в ЛС")
    return {"status": "ok"}


@router.post("/api/system/delay_publish")
async def api_delay_publish(tg_id: int = Form(0)):
    """Delay auto-publish by 10 minutes."""
    if tg_id:
        real_id, user_info = await verify_moderator_plus(tg_id)

    new_time = datetime.now(TZ_BARNAUL) + timedelta(minutes=10)
    new_time_str = new_time.strftime("%Y-%m-%d %H:%M:%S")

    await db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('smart_publish_at', ?)",
        (new_time_str,))
    await db.conn.commit()

    if tg_id:
        await db.add_log(real_id, user_info.get('fio'), "Отложил авто-публикацию на 10 минут")

    return {"status": "ok", "publish_at": new_time_str}
