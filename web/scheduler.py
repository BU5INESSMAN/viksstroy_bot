import sys
import os
import json
import asyncio
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database_deps import db, TZ_BARNAUL
from utils import notify_users, execute_app_publish

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
        auto_complete_time = settings.get('auto_complete_time', '')
        foreman_reminder_time = settings.get('foreman_reminder_time', '')
        remind_on_weekends = settings.get('foreman_reminder_weekends', '0') == '1'

        # =========================================================================
        # ТРИГГЕР 1: АВТО-ПУБЛИКАЦИЯ И СТАРТ НАРЯДА (Переход в 'in_progress')
        # =========================================================================
        if auto_publish_time and current_time_str == auto_publish_time:
            print(f"🚀 [SCHEDULER] {current_time_str} - Запуск нарядов на сегодня...")

            # Сначала публикуем все одобренные заявки
            async with db.conn.execute("SELECT * FROM applications WHERE status = 'approved' AND date_target = ?",
                                       (today_date_str,)) as cur:
                approved_apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

            count = 0
            for app_dict in approved_apps:
                if await execute_app_publish(app_dict):
                    count += 1
            if count > 0:
                await db.add_log(0, "Система", f"Авто-публикация: {count} нарядов")

            # Теперь переводим опубликованные наряды в статус "В работе" и уведомляем
            async with db.conn.execute("SELECT * FROM applications WHERE status = 'published' AND date_target = ?",
                                       (today_date_str,)) as cur:
                apps_to_start = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

            for app_dict in apps_to_start:
                await db.conn.execute(
                    "UPDATE applications SET status = 'in_progress', is_started_notified = 1 WHERE id = ?",
                    (app_dict['id'],))

                workers_ids = []
                selected_list = [int(x.strip()) for x in
                                 app_dict.get('selected_members', '').split(',')] if app_dict.get(
                    'selected_members') else []
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
                    await notify_users([], msg, "my-apps", extra_tg_ids=all_involved)

            await db.conn.commit()

        # =========================================================================
        # ТРИГГЕР 2: АВТО-ЗАВЕРШЕНИЕ НАРЯДА (Переход в 'pending_report')
        # =========================================================================
        if auto_complete_time and current_time_str == auto_complete_time:
            print(f"🏁 [SCHEDULER] {current_time_str} - Завершение нарядов на сегодня...")

            async with db.conn.execute(
                    "SELECT id, object_address, foreman_id FROM applications WHERE date_target = ? AND status IN ('in_progress', 'published')",
                    (today_date_str,)) as cur:
                apps_to_complete = await cur.fetchall()

            for app in apps_to_complete:
                app_id, address, foreman_id = app

                # Меняем статус на "Ожидает отчета"
                await db.conn.execute("UPDATE applications SET status = 'pending_report' WHERE id = ?", (app_id,))

                if foreman_id:
                    msg = f"📋 <b>Смена окончена!</b>\n📍 Объект: {address}\n\nПожалуйста, заполните табель/отчет по этому наряду."
                    await notify_users([], msg, "dashboard", extra_tg_ids=[foreman_id])

            await db.conn.commit()

        # =========================================================================
        # ТРИГГЕР 3: НАПОМИНАНИЕ ПРОРАБАМ
        # =========================================================================
        if foreman_reminder_time and current_time_str == foreman_reminder_time:
            if not is_weekend or remind_on_weekends:
                print(f"🔔 [SCHEDULER] {current_time_str} - Отправка напоминаний прорабам...")
                msg = "🔔 <b>Напоминание!</b>\nПожалуйста, не забудьте заполнить и отправить заявки на следующий день!"
                await notify_users(["foreman"], msg, "dashboard")

    except Exception as e:
        print(f"❌ Ошибка в планировщике: {e}")


def start_scheduler():
    """Запускает проверку каждую минуту"""
    scheduler.add_job(check_and_run_tasks, 'cron', minute='*')
    scheduler.start()
    print("⏳ Планировщик задач успешно запущен (Часовой пояс: Азия/Барнаул)")