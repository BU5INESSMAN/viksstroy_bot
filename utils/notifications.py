from database.db_manager import DatabaseManager
import logging


async def notify_workers_about_app(bot, app_id: int, db: DatabaseManager):
    """
    Рассылает уведомления рабочим, зарегистрированным в боте (с tg_user_id),
    о том, что их добавили в подтвержденную заявку (смену).
    Вызывать после публикации заявок в общую группу.
    """
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

    # Получаем только тех, кто активировал бота по инвайт-ссылке
    members = await db.get_app_members_with_tg(app_id)

    success_count = 0
    for m in members:
        try:
            await bot.send_message(m['tg_user_id'], text, parse_mode="HTML")
            success_count += 1
        except Exception as e:
            logging.error(f"Не удалось отправить уведомление рабочему {m['tg_user_id']}: {e}")

    logging.info(f"Уведомления отправлены {success_count} из {len(members)} рабочих по заявке №{app_id}")