from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timedelta
from aiogram.types import FSInputFile
import os
import shutil
import asyncio
import logging
from database.db_manager import DatabaseManager
from utils.notifications import notify_management


async def backup_database(bot):
    """Создает копию БД и отправляет Суперадминам"""
    try:
        db_path = os.getenv("DB_PATH", "data/viksstroy.db")
        if not os.path.exists(db_path):
            return

        backup_dir = "data/backups"
        os.makedirs(backup_dir, exist_ok=True)

        date_str = datetime.now().strftime("%Y-%m-%d_%H-%M")
        backup_path = f"{backup_dir}/viksstroy_backup_{date_str}.db"

        shutil.copy2(db_path, backup_path)

        superadmins = [int(x.strip()) for x in os.getenv("SUPERADMIN_IDS", "").split(",") if x.strip()]
        if superadmins:
            doc = FSInputFile(backup_path)
            for sa in superadmins:
                try:
                    await bot.send_document(sa, doc, caption=f"💾 Ежедневный бэкап БД ({date_str})")
                except Exception:
                    pass
                await asyncio.sleep(0.05)

    except Exception as e:
        await notify_management(bot, f"🚨 <b>Ошибка резервного копирования БД:</b>\n{e}", level="superadmin")


async def send_daily_report(bot, db: DatabaseManager):
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%d.%m")
    report_data = await db.get_daily_report(tomorrow)

    if not report_data:
        logging.info(f"На {tomorrow} одобренных заявок нет. Отчет не отправлен.")
        return

    report_text = f"📋 <b>ПЛАН РАБОТ НА ЗАВТРА ({tomorrow})</b>\n"
    report_text += "—" * 15 + "\n\n"

    for idx, item in enumerate(report_data, 1):
        info = item['info']
        members = ", ".join(item['members'])

        report_text += (
            f"📍 <b>Объект №{idx}:</b> {info['object_address']}\n"
            f"👤 <b>Прораб:</b> {info['foreman_fio']}\n"
            f"🚜 <b>Техника:</b> {info['equip_name']}\n"
            f"👨‍🔧 <b>Водитель:</b> {info['driver_fio']}\n"
            f"⏰ <b>Время:</b> {info['time_start']}:00 - {info['time_end']}:00\n"
            f"👥 <b>Состав бригады:</b> {members}\n"
        )

        if info['comment'] and info['comment'].lower() != 'нет':
            report_text += f"💬 <b>Комментарий:</b> {info['comment']}\n"

        report_text += "—" * 15 + "\n"

    group_id = os.getenv("REPORT_GROUP_ID")
    if group_id:
        try:
            await bot.send_message(group_id, report_text, parse_mode="HTML")
        except Exception as e:
            await notify_management(bot, f"⚠️ <b>Ошибка отправки отчета:</b>\n{e}", level="superadmin")


def setup_scheduler(bot, db: DatabaseManager):
    scheduler = AsyncIOScheduler(timezone="Europe/Moscow")

    # Отчет в группу в 13:00
    scheduler.add_job(send_daily_report, trigger='cron', hour=13, minute=0, args=[bot, db])

    # Бэкап БД в 02:00 ночи
    scheduler.add_job(backup_database, trigger='cron', hour=2, minute=0, args=[bot])

    return scheduler