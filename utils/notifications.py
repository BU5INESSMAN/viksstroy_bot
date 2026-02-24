import asyncio
from database.db_manager import DatabaseManager
import logging
import os


async def notify_workers_about_app(bot, app_id: int, db: DatabaseManager):
    app_data = await db.get_application_details(app_id)
    if not app_data:
        return

    details = app_data['details']

    text = (
        f"🔔 <b>ВЫ НАЗНАЧЕНЫ НА СМЕНУ!</b>\n\n"
        f"📅 <b>Дата:</b> {details['date_target']}\n"
        f"📍 <b>Объект:</b> {details['object_address']}\n"
        f"⏰ <b>Время:</b> {details['time_start']}:00 - {details['time_end']}:00\n"
        f"🚜 <b>Техника:</b> {details['equip_name']}\n\n"
        f"👷‍♂️ <b>Прораб:</b> {details['foreman_name']}"
    )

    members = await db.get_app_members_with_tg(app_id)
    success_count = 0
    for m in members:
        try:
            await bot.send_message(m['tg_user_id'], text, parse_mode="HTML")
            success_count += 1
        except Exception as e:
            logging.error(f"Не удалось отправить уведомление рабочему {m['tg_user_id']}: {e}")

        await asyncio.sleep(0.05)

    logging.info(f"Уведомления отправлены {success_count} из {len(members)} рабочих по заявке №{app_id}")


async def notify_management(bot, text: str, level: str = "boss"):
    """
    Отправляет уведомления руководству.
    level="boss" -> получают и Боссы, и Суперадмины
    level="superadmin" -> получают ТОЛЬКО Суперадмины (ошибки системы)
    """
    bosses = [int(x.strip()) for x in os.getenv("BOSS_IDS", "").split(",") if x.strip()]
    superadmins = [int(x.strip()) for x in os.getenv("SUPERADMIN_IDS", "").split(",") if x.strip()]

    targets = set(superadmins)
    if level == "boss":
        targets.update(bosses)

    for admin_id in targets:
        try:
            await bot.send_message(admin_id, text, parse_mode="HTML")
        except Exception:
            pass
        await asyncio.sleep(0.05)