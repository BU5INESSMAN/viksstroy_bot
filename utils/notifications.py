import asyncio
import os
import logging
from database.db_manager import DatabaseManager


async def notify_workers_about_app(bot, app_id: int, db: DatabaseManager):
    app_data = await db.get_application_details(app_id)
    if not app_data:
        return

    details = app_data['details']

    text = (
        f"🔔 <b>ВИКС Расписание | ВЫ НАЗНАЧЕНЫ НА СМЕНУ!</b>\n\n"
        f"📅 <b>Дата:</b> <code>{details['date_target']}</code>\n"
        f"📍 <b>Объект:</b> {details['object_address']}\n"
        f"⏰ <b>Время:</b> <code>{details['time_start']}:00 - {details['time_end']}:00</code>\n"
        f"🚜 <b>Техника:</b> {details['equip_name']}\n\n"
        f"👷‍♂️ <b>Прораб:</b> <b>{details['foreman_name']}</b>\n\n"
        f"<i>Пожалуйста, будьте на объекте без опозданий!</i>"
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


async def notify_bosses(bot, db: DatabaseManager, text: str, level: str = 'info'):
    users = await db.get_all_users()
    targets = []

    for u in users:
        if u['role'] == 'superadmin':
            targets.append(u['user_id'])
        elif u['role'] == 'boss' and level == 'info':
            targets.append(u['user_id'])

    super_env = os.getenv("SUPER_ADMIN_IDS", "")
    if super_env:
        targets.extend([int(x) for x in super_env.split(",") if x.strip().isdigit()])

    boss_env = os.getenv("BOSS_IDS", "")
    if boss_env and level == 'info':
        targets.extend([int(x) for x in boss_env.split(",") if x.strip().isdigit()])

    targets = list(set(targets))
    if not targets:
        return

    prefix = "🔴 <b>СИСТЕМНАЯ ОШИБКА:</b>\n\n" if level == 'error' else "👁‍🗨 <b>ЛОГ ДЕЙСТВИЙ:</b>\n"
    full_text = prefix + text

    for tg_id in targets:
        try:
            await bot.send_message(tg_id, full_text, parse_mode="HTML")
        except Exception:
            pass
        await asyncio.sleep(0.05)