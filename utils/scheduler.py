from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timedelta
import os
import logging
import aiosqlite
from database.db_manager import DatabaseManager
from utils.notifications import notify_bosses


async def backup_database(bot, db: DatabaseManager):
    try:
        backup_dir = "data/backups"
        os.makedirs(backup_dir, exist_ok=True)
        date_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        backup_path = f"{backup_dir}/bot_database_{date_str}.db"

        async with aiosqlite.connect(backup_path) as backup_conn:
            await db.conn.backup(backup_conn)

        await notify_bosses(
            bot, db,
            f"💾 <b>Создана резервная копия базы данных!</b>\nПуть: <code>{backup_path}</code>",
            level='info'
        )
        logging.info(f"Бэкап БД успешно создан: {backup_path}")
    except Exception as e:
        await notify_bosses(bot, db, f"Ошибка при резервном копировании БД: {e}", level='error')
        logging.error(f"Ошибка бэкапа: {e}")


async def send_daily_report(bot, db: DatabaseManager):
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%d.%m")
    report_data = await db.get_daily_report(tomorrow)

    if not report_data:
        logging.info(f"На {tomorrow} одобренных заявок нет. Отчет не отправлен.")
        return

    report_text = f"📋 <b>ПЛАН РАБОТ НА ЗАВТРА ({tomorrow}) | ВИКС Расписание</b>\n"
    report_text += "━" * 20 + "\n\n"

    for idx, item in enumerate(report_data, 1):
        info = item['info']
        members = ", ".join(item['members'])

        report_text += (
            f"📍 <b>Объект №{idx}:</b> {info['object_address']}\n"
            f"👤 <b>Прораб:</b> {info['foreman_fio']}\n"
            f"🚜 <b>Техника:</b> {info['equip_name']}\n"
            f"👨‍🔧 <b>Водитель:</b> {info['driver_fio']}\n"
            f"⏰ <b>Время:</b> <code>{info['time_start']}:00 - {info['time_end']}:00</code>\n"
            f"👥 <b>Состав бригады:</b> <i>{members}</i>\n"
        )

        if info['comment'] and info['comment'].lower() != 'нет':
            report_text += f"💬 <b>Комментарий:</b> {info['comment']}\n"

        report_text += "\n" + "━" * 20 + "\n\n"

    group_id = os.getenv("REPORT_GROUP_ID")

    if group_id:
        try:
            await bot.send_message(group_id, report_text, parse_mode="HTML")
            logging.info(f"Ежедневный отчет на {tomorrow} успешно отправлен в группу.")
        except Exception as e:
            logging.error(f"Ошибка при отправке отчета в группу: {e}")
    else:
        logging.warning("REPORT_GROUP_ID не задан в .env. Отчет не отправлен.")


def setup_scheduler(bot, db: DatabaseManager):
    scheduler = AsyncIOScheduler(timezone="Europe/Moscow")
    scheduler.add_job(send_daily_report, trigger='cron', hour=13, minute=0, args=[bot, db])
    scheduler.add_job(backup_database, trigger='cron', hour=2, minute=0, args=[bot, db])
    return scheduler