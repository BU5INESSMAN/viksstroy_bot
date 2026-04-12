import logging
from datetime import datetime

from database_deps import db, TZ_BARNAUL
from services.notifications import notify_users, notify_group_chat

logger = logging.getLogger("SYSTEM")


async def broadcast_group(real_id: int, fio: str, message: str):
    """Format and send a broadcast message to the group chat."""
    text = f"📢 <b>Рассылка от {fio}:</b>\n\n{message}"
    try:
        await notify_group_chat(text, "dashboard")
        await db.add_log(real_id, fio, f"Отправил рассылку в группу", target_type='system')
    except Exception as e:
        logger.error(f"Broadcast group error: {e}")


async def broadcast_dm_roles(real_id: int, fio: str, message: str, roles: list):
    """Send a broadcast DM to users by roles."""
    text = f"📢 <b>Рассылка от {fio}:</b>\n\n{message}"
    try:
        await notify_users(roles, text, "dashboard")
        await db.add_log(real_id, fio, f"Отправил рассылку в ЛС (роли: {', '.join(roles)})", target_type='system')
    except Exception as e:
        logger.error(f"Broadcast DM roles error: {e}")


async def broadcast_dm_users(real_id: int, fio: str, message: str, user_ids: list):
    """Send a broadcast DM to specific users."""
    text = f"📢 <b>Рассылка от {fio}:</b>\n\n{message}"
    try:
        await notify_users([], text, "dashboard", extra_tg_ids=user_ids)
        await db.add_log(real_id, fio, f"Отправил рассылку в ЛС ({len(user_ids)} пользователей)", target_type='system')
    except Exception as e:
        logger.error(f"Broadcast DM users error: {e}")


async def run_test_notification(real_tg_id: int, fio: str, test_type: str, platform: str):
    """Execute an extended test notification scenario. Returns (success, error_msg)."""
    platform_name = "MAX" if platform == "max" else "Telegram" if platform == "tg" else "MAX + Telegram"

    if test_type == "brigadier":
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
        error_msg = (
            f"🚨 <b>Тест системной ошибки ({platform_name}):</b>\n"
            f"❌ RuntimeError: Test exception\n"
            f"👣 Маршрут: /api/system/test\n"
            f"🕐 {datetime.now(TZ_BARNAUL).strftime('%H:%M:%S')}"
        )
        await notify_users(
            ["report_group", "superadmin"],
            error_msg,
            "system",
            extra_tg_ids=[real_tg_id],
            target_platform=platform,
            category="errors"
        )

    else:
        return False, f"Неизвестный тип теста: {test_type}"

    return True, None
