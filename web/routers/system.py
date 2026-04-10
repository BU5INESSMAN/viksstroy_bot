import sys
import os
import logging

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from database_deps import db, TZ_BARNAUL
from datetime import datetime, timedelta
from utils import resolve_id, notify_users, notify_group_chat, strip_html, publish_tomorrow_apps

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
    """Должники СМР: прорабы с просроченными нарядами (in_progress, date_target <= сегодня)."""
    if tg_id:
        await verify_moderator_plus(tg_id)

    today_str = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d")
    async with db.conn.execute(
        "SELECT DISTINCT foreman_id, foreman_name, object_address, date_target FROM applications "
        "WHERE status = 'in_progress' AND date_target <= ? AND foreman_id IS NOT NULL "
        "ORDER BY date_target ASC",
        (today_str,)
    ) as cur:
        rows = await cur.fetchall()

    return [
        {"foreman_id": r[0], "foreman_name": r[1] or "Неизвестный",
         "object_address": r[2] or "—", "date_target": r[3]}
        for r in rows
    ]


# --- Smart Scheduling Endpoints ---

@router.post("/api/system/publish_tomorrow")
async def api_publish_tomorrow(tg_id: int = Form(0)):
    """Publish all waiting apps for tomorrow and notify teams."""
    user_info = None
    if tg_id:
        real_id, user_info = await verify_moderator_plus(tg_id)

    count = await publish_tomorrow_apps()

    # Clear pending auto-publish timer
    try:
        await db.conn.execute("DELETE FROM settings WHERE key = 'smart_publish_at'")
        await db.conn.commit()
    except:
        pass

    if user_info:
        await db.add_log(real_id, user_info.get('fio'), f"Ручная публикация расстановки на завтра ({count} нарядов)")

    return {"status": "ok", "published": count}


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
