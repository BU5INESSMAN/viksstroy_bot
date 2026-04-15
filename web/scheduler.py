import sys
import os
import json
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database_deps import db, TZ_BARNAUL
from services.notifications import notify_users
from services.publish_service import execute_app_publish
from schedule_generator import check_all_foremen_approved, publish_schedule_to_group

# Настраиваем логгер для планировщика
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger("SCHEDULER")

# Инициализируем планировщик с часовым поясом Барнаула
scheduler = AsyncIOScheduler(timezone=TZ_BARNAUL)


async def check_and_run_tasks():
    if db.conn is None:
        await db.init_db()

    now = datetime.now(TZ_BARNAUL)
    current_time_str = now.strftime("%H:%M")
    today_date_str = now.strftime("%Y-%m-%d")
    is_weekend = now.weekday() >= 5  # 5 = Суббота, 6 = Воскресенье

    try:
        # Получаем настройки из БД
        async with db.conn.execute("SELECT key, value FROM settings") as cur:
            settings = {r[0]: r[1] for r in await cur.fetchall()}

        auto_publish_time = settings.get('auto_publish_time', '')
        auto_publish_enabled = settings.get('auto_publish_enabled', '0') == '1'
        auto_start_orders_time = settings.get('auto_start_orders_time', '')
        report_request_time = settings.get('report_request_time', '')
        auto_complete_time = settings.get('auto_complete_time', '')
        foreman_reminder_time = settings.get('foreman_reminder_time', '')
        remind_on_weekends = settings.get('foreman_reminder_weekends', '0') == '1'

        # =========================================================================
        # ТРИГГЕР 1: АВТО-ПУБЛИКАЦИЯ НАРЯДОВ В БЕСЕДУ
        # =========================================================================
        if auto_publish_enabled and auto_publish_time and current_time_str == auto_publish_time:
            logger.info(f"🚀 {current_time_str} - Авто-публикация нарядов в беседу...")

            async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved' AND date_target = ?",
                                       (today_date_str,)) as cur:
                approved_apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

            count = 0
            for app_dict in approved_apps:
                if await execute_app_publish(app_dict):
                    count += 1
            if count > 0:
                await db.add_log(0, "Система", f"Авто-публикация: {count} нарядов", target_type='system')

        # =========================================================================
        # ТРИГГЕР 2: АВТО-СТАРТ НАРЯДОВ (перевод в in_progress)
        # Забирает ВСЕ approved/published заявки на сегодня и стартует их.
        # =========================================================================
        if auto_start_orders_time and current_time_str == auto_start_orders_time:
            logger.info(f"▶️ {current_time_str} - Авто-старт всех одобренных нарядов на сегодня...")

            async with db.conn.execute(
                "SELECT * FROM applications WHERE status IN ('approved', 'published') AND date_target = ?",
                (today_date_str,)
            ) as cur:
                apps_to_start = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

            started_count = 0
            for app_dict in apps_to_start:
                await db.conn.execute(
                    "UPDATE applications SET status = 'in_progress' WHERE id = ?",
                    (app_dict['id'],))
                started_count += 1

                workers_ids = []
                selected_list = [int(x.strip()) for x in app_dict.get('selected_members', '').split(',') if
                                 x.strip().isdigit()] if app_dict.get('selected_members') else []
                if selected_list:
                    pl = ','.join(['?'] * len(selected_list))
                    async with db.conn.execute(f"SELECT tg_user_id FROM team_members WHERE id IN ({pl})",
                                               selected_list) as c:
                        for r in await c.fetchall():
                            if r[0]: workers_ids.append(r[0])

                drivers_ids = []
                eq_data_str = app_dict.get('equipment_data', '')
                if eq_data_str:
                    try:
                        for eq in json.loads(eq_data_str):
                            async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?", (eq['id'],)) as c:
                                eq_row = await c.fetchone()
                                if eq_row and eq_row[0]: drivers_ids.append(eq_row[0])
                    except:
                        pass

                all_involved = list(set(workers_ids + drivers_ids))
                if app_dict.get('foreman_id'): all_involved.append(app_dict['foreman_id'])

                if all_involved:
                    msg = f"🚀 <b>Наряд начался!</b>\n📍 Объект: {app_dict['object_address']}\nУдачной смены и безопасной работы!"
                    await notify_users([], msg, "my-apps", extra_tg_ids=all_involved, category="orders")

            await db.conn.commit()
            if started_count > 0:
                await db.add_log(0, "Система", f"Авто-старт: {started_count} нарядов переведены в работу", target_type='system')

        # =========================================================================
        # ТРИГГЕР 3: ЗАПРОС ОТЧЁТОВ (report_request_time)
        # Уведомляет прорабов о необходимости заполнить отчёт по активным нарядам.
        # =========================================================================
        if report_request_time and current_time_str == report_request_time:
            logger.info(f"📋 {current_time_str} - Запрос отчётов по активным нарядам...")

            async with db.conn.execute(
                "SELECT id, object_address, foreman_id FROM applications WHERE date_target = ? AND status = 'in_progress'",
                (today_date_str,)
            ) as cur:
                active_apps = await cur.fetchall()

            for app in active_apps:
                app_id, address, foreman_id = app
                if foreman_id:
                    msg = f"📋 <b>Пора заполнить отчёт!</b>\n📍 Объект: {address}\n\nПожалуйста, заполните табель/отчет по этому наряду."
                    await notify_users([], msg, "dashboard", extra_tg_ids=[foreman_id], category="orders")

        # =========================================================================
        # ТРИГГЕР 4: АВТО-ЗАВЕРШЕНИЕ НАРЯДА
        # =========================================================================
        if auto_complete_time and current_time_str == auto_complete_time:
            logger.info(f"🏁 {current_time_str} - Завершение нарядов на сегодня...")

            async with db.conn.execute(
                    "SELECT id, object_address, foreman_id FROM applications WHERE date_target = ? AND status IN ('in_progress', 'published')",
                    (today_date_str,)) as cur:
                apps_to_complete = await cur.fetchall()

            for app in apps_to_complete:
                app_id, address, foreman_id = app

                await db.conn.execute(
                    "UPDATE applications SET status = 'completed', completed_at = ? WHERE id = ?",
                    (now.strftime("%Y-%m-%d %H:%M:%S"), app_id))

                # Освобождаем технику при завершении наряда
                try:
                    async with db.conn.execute("SELECT equipment_data FROM applications WHERE id = ?", (app_id,)) as eq_cur:
                        eq_row = await eq_cur.fetchone()
                    if eq_row and eq_row[0]:
                        eq_list = json.loads(eq_row[0])
                        for e in eq_list:
                            await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (e['id'],))
                except:
                    pass

                if foreman_id:
                    msg = f"📋 <b>Смена окончена!</b>\n📍 Объект: {address}\n\nПожалуйста, заполните табель/отчет по этому наряду."
                    await notify_users([], msg, "dashboard", extra_tg_ids=[foreman_id], category="orders")

            await db.conn.commit()

        # =========================================================================
        # ТРИГГЕР 5: НАПОМИНАНИЕ ПРОРАБАМ
        # =========================================================================
        if foreman_reminder_time and current_time_str == foreman_reminder_time:
            if not is_weekend or remind_on_weekends:
                logger.info(f"🔔 {current_time_str} - Отправка напоминаний прорабам...")
                msg = "🔔 <b>Напоминание!</b>\nПожалуйста, не забудьте заполнить и отправить заявки на следующий день!"
                await notify_users(["foreman"], msg, "dashboard", category="orders")

        # =========================================================================
        # ТРИГГЕР 6: АВТО-ПУБЛИКАЦИЯ РАССТАНОВКИ (когда все прорабы утвердили)
        # =========================================================================
        # Проверяем каждую минуту с 12:00 до 22:00, опубликована ли уже расстановка на завтра
        if 12 <= now.hour <= 22:
            tomorrow_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")
            schedule_flag_key = f"schedule_published_{tomorrow_str}"
            already_published = False
            try:
                async with db.conn.execute("SELECT value FROM settings WHERE key = ?", (schedule_flag_key,)) as cur:
                    flag_row = await cur.fetchone()
                    if flag_row and flag_row[0] == '1':
                        already_published = True
            except:
                pass

            if not already_published and await check_all_foremen_approved(tomorrow_str):
                logger.info(f"📋 Все прорабы утвердили заявки на {tomorrow_str}! Публикуем расстановку...")
                # Устанавливаем флаг ДО отправки, чтобы избежать повторной публикации
                try:
                    await db.conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')",
                        (schedule_flag_key,),
                    )
                    await db.conn.commit()
                except Exception:
                    pass
                if await publish_schedule_to_group(tomorrow_str):
                    await db.add_log(0, "Система", f"Авто-публикация расстановки на {tomorrow_str}", target_type='system')

        # =========================================================================
        # ТРИГГЕР 7: АВТО-АРХИВАЦИЯ ЗАВЕРШЁННЫХ НАРЯДОВ (через 48 часов)
        # =========================================================================
        try:
            cutoff = (now - timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S")
            async with db.conn.execute(
                "UPDATE applications SET is_archived = 1 WHERE status = 'completed' AND is_archived = 0 AND completed_at IS NOT NULL AND completed_at <= ?",
                (cutoff,)
            ) as cur:
                pass
            await db.conn.commit()
        except Exception as e:
            logger.error(f"Ошибка авто-архивации: {e}")

        # =========================================================================
        # ТРИГГЕР 9: SMART SCHEDULING — запрос модераторам на публикацию расстановки
        # =========================================================================
        if auto_publish_enabled and auto_publish_time and current_time_str == auto_publish_time:
            prompt_flag_key = f"smart_prompt_sent_{today_date_str}"
            already_prompted = False
            try:
                async with db.conn.execute("SELECT value FROM settings WHERE key = ?", (prompt_flag_key,)) as cur:
                    if await cur.fetchone():
                        already_prompted = True
            except:
                pass

            if not already_prompted:
                from services.schedule_helpers import send_smart_schedule_prompt
                logger.info(f"📅 {current_time_str} - Отправка запроса на публикацию расстановки на завтра...")
                await send_smart_schedule_prompt()
                await db.conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')", (prompt_flag_key,))
                await db.conn.commit()

        # =========================================================================
        # ТРИГГЕР 10: АВТО-ПУБЛИКАЦИЯ ПО ТАЙМЕРУ (10-мин таймаут)
        # =========================================================================
        try:
            async with db.conn.execute("SELECT value FROM settings WHERE key = 'smart_publish_at'") as cur:
                timer_row = await cur.fetchone()
            if timer_row and timer_row[0]:
                publish_at = datetime.strptime(timer_row[0], "%Y-%m-%d %H:%M:%S")
                if now.replace(tzinfo=None) >= publish_at:
                    from services.notifications import send_schedule_notifications
                    tomorrow_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")
                    count = await send_schedule_notifications(tomorrow_str)
                    await db.conn.execute("DELETE FROM settings WHERE key = 'smart_publish_at'")
                    await db.conn.commit()
                    logger.info(f"⏰ Авто-публикация по таймеру: {count} нарядов на завтра")
                    if count > 0:
                        await notify_users(
                            ["moderator", "boss", "superadmin"],
                            f"✅ <b>Расстановка на завтра опубликована автоматически</b>\n"
                            f"📋 Опубликовано нарядов: {count}",
                            "dashboard", category="orders")
                        await db.add_log(0, "Система",
                                         f"Авто-публикация расстановки на завтра: {count} нарядов", target_type='system')
        except Exception as e:
            logger.error(f"Ошибка проверки таймера авто-публикации: {e}")

        # =========================================================================
        # ТРИГГЕР 8: АВТО-СТАРТ одобренных заявок на сегодня (каждую минуту)
        # Если заявка одобрена и дата наступила — сразу переводим в работу.
        # =========================================================================
        try:
            async with db.conn.execute(
                "SELECT id, object_address, foreman_id FROM applications WHERE status = 'approved' AND date_target <= ?",
                (today_date_str,)
            ) as cur:
                same_day_apps = await cur.fetchall()

            for app in same_day_apps:
                app_id, address, foreman_id = app
                await db.conn.execute("UPDATE applications SET status = 'in_progress' WHERE id = ?", (app_id,))
                if foreman_id:
                    msg = f"🚀 <b>Наряд начался!</b>\n📍 Объект: {address}\nЗаявка одобрена и автоматически переведена в работу."
                    await notify_users([], msg, "my-apps", extra_tg_ids=[foreman_id], category="orders")
            if same_day_apps:
                await db.conn.commit()
                await db.add_log(0, "Система", f"Авто-старт: {len(same_day_apps)} одобренных нарядов переведены в работу")
        except Exception as e:
            logger.error(f"Ошибка авто-старта одобренных заявок: {e}")

        # =========================================================================
        # ТРИГГЕР 11: АВТО-ИСТЕЧЕНИЕ ОБМЕНОВ ТЕХНИКИ (30 минут)
        # =========================================================================
        try:
            expired_exchanges = await db.get_expired_exchanges(minutes=30)
            for ex in expired_exchanges:
                await db.resolve_exchange(ex['id'], 'expired')
                # Уведомить инициатора
                try:
                    async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (ex['requested_equip_id'],)) as cur:
                        eq_row = await cur.fetchone()
                        equip_name = eq_row[0] if eq_row else f"Техника #{ex['requested_equip_id']}"
                    await notify_users(
                        [], f"⏰ Время обмена истекло. Запрос на {equip_name} отменён.",
                        "dashboard", extra_tg_ids=[ex['requester_id']]
                    )
                except Exception as ne:
                    logger.error(f"Ошибка уведомления об истечении обмена: {ne}")
            if expired_exchanges:
                logger.info(f"🔄 Истекло обменов: {len(expired_exchanges)}")
        except Exception as e:
            logger.error(f"Ошибка авто-истечения обменов: {e}")

    except Exception as e:
        logger.error(f"Ошибка в планировщике: {e}")


async def cleanup_old_logs_job():
    """Ежедневная очистка старых логов по настройке log_retention_days."""
    try:
        if db.conn is None:
            await db.init_db()
        async with db.conn.execute("SELECT value FROM settings WHERE key = 'log_retention_days'") as cur:
            row = await cur.fetchone()
        days = int(row[0]) if row and row[0] else 90
        await db.cleanup_old_logs(days)
        logger.info(f"🧹 Очистка логов: удалены записи старше {days} дней")
    except Exception as e:
        logger.error(f"Ошибка очистки логов: {e}")


async def cleanup_expired_sessions_job():
    """Удаление истекших сессий."""
    try:
        if db.conn is None:
            await db.init_db()
        await db.conn.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")
        await db.conn.commit()
        logger.info("🧹 Очистка истекших сессий выполнена")
    except Exception as e:
        logger.error(f"Ошибка очистки сессий: {e}")


async def cleanup_old_notifications_job():
    """Удаление уведомлений старше 30 дней."""
    try:
        if db.conn is None:
            await db.init_db()
        await db.conn.execute("DELETE FROM user_notifications WHERE created_at < datetime('now', '-30 days')")
        await db.conn.commit()
        logger.info("🧹 Очистка старых уведомлений выполнена")
    except Exception as e:
        logger.error(f"Ошибка очистки уведомлений: {e}")


def start_scheduler():
    """Запускает проверку каждую минуту"""
    scheduler.add_job(check_and_run_tasks, 'cron', minute='*')
    scheduler.add_job(cleanup_old_logs_job, 'cron', hour=3, minute=0, id='cleanup_logs')
    scheduler.add_job(cleanup_expired_sessions_job, 'cron', hour=4, minute=0, id='cleanup_sessions')
    scheduler.add_job(cleanup_old_notifications_job, 'cron', hour=4, minute=30, id='cleanup_notifications')
    scheduler.start()
    logger.info("⏳ Планировщик задач успешно запущен (Часовой пояс: Азия/Барнаул)")
