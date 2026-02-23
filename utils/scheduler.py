# viksstroy_bot/utils/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timedelta
import os
import logging
from database.db_manager import DatabaseManager


async def send_daily_report(bot, db: DatabaseManager):
    """Сбор и отправка отчета по одобренным заявкам на завтра"""
    # Определяем дату завтрашнего дня в формате ДД.ММ
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%d.%m")

    # Получаем данные из БД
    report_data = await db.get_daily_report(tomorrow)

    if not report_data:
        logging.info(f"На {tomorrow} одобренных заявок нет. Отчет не отправлен.")
        return

    # Формируем заголовок отчета
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

    # ID группы для отчетов берем из .env
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
    """Инициализация планировщика"""
    scheduler = AsyncIOScheduler(timezone="Europe/Moscow")

    # Добавляем задачу на 13:00 каждый день
    scheduler.add_job(
        send_daily_report,
        trigger='cron',
        hour=13,
        minute=0,
        args=[bot, db]
    )

    return scheduler