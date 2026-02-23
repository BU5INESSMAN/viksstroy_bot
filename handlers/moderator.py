# viksstroy_bot/handlers/moderator.py
from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db_manager import DatabaseManager
from keyboards.inline_factory import AppAction  # Используем существующую фабрику или расширим
from aiogram.utils.keyboard import InlineKeyboardBuilder

router = Router()


class ModStates(StatesGroup):
    wait_for_rejection_reason = State()


# --- КЛАВИАТУРЫ МОДЕРАТОРА ---

def get_mod_decision_kb(app_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Одобрить", callback_data=f"mod_approve_{app_id}")
    builder.button(text="❌ Отклонить", callback_data=f"mod_reject_{app_id}")
    builder.adjust(2)
    return builder.as_markup()


# --- ЛОГИКА ---

async def send_new_app_to_moderators(bot, app_id: int, db: DatabaseManager):
    """Функция рассылки новой заявки модераторам (вызывать в конце foreman.py)"""
    data = await db.get_application_details(app_id)
    if not data: return

    app = data['details']
    staff = ", ".join([f"{m['fio']} ({m['position']})" for m in data['staff']])

    text = (
        f"🔔 <b>НОВАЯ ЗАЯВКА №{app_id}</b>\n\n"
        f"📍 <b>Объект:</b> {app['object_address']}\n"
        f"👤 <b>Прораб:</b> {app['foreman_name']}\n"
        f"📅 <b>Дата:</b> {app['date_target']}\n"
        f"⏰ <b>Время:</b> {app['time_start']}:00 - {app['time_end']}:00\n"
        f"🚜 <b>Техника:</b> {app['equip_name']} (Водитель: {app['driver_fio']})\n"
        f"👥 <b>Состав:</b> {staff}\n"
        f"💬 <b>Коммент:</b> {app['comment']}\n"
    )

    # В реальности здесь должен быть список ID модераторов из БД или .env
    # Для примера отправим в лог или конкретному админу
    # (В main.py мы добавим логику рассылки по ролям)
    pass


@router.callback_query(F.data.startswith("mod_approve_"))
async def approve_application(callback: types.CallbackQuery, db: DatabaseManager):
    app_id = int(callback.data.split("_")[2])
    await db.update_app_status(app_id, "approved")

    app_data = await db.get_application_details(app_id)
    foreman_id = app_data['details']['foreman_id']

    await callback.message.edit_text(callback.message.text + "\n\n✅ <b>ОДОБРЕНО</b>")

    # Уведомляем прораба
    try:
        await callback.bot.send_message(
            foreman_id,
            f"🎉 Ваша заявка №{app_id} на объект {app_data['details']['object_address']} <b>ОДОБРЕНА</b>!"
        )
    except:
        pass


@router.callback_query(F.data.startswith("mod_reject_"))
async def reject_application_start(callback: types.CallbackQuery, state: FSMContext):
    app_id = int(callback.data.split("_")[2])
    await state.update_data(reject_app_id=app_id, mod_msg_id=callback.message.message_id)
    await callback.message.answer("Введите причину отказа:")
    await state.set_state(ModStates.wait_for_rejection_reason)


@router.message(ModStates.wait_for_rejection_reason)
async def process_rejection(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    app_id = data['reject_app_id']
    reason = message.text.strip()

    await db.update_app_status(app_id, "rejected", reason)
    app_data = await db.get_application_details(app_id)

    await message.answer(f"✅ Заявка №{app_id} отклонена.")

    # Уведомляем прораба
    try:
        await message.bot.send_message(
            app_data['details']['foreman_id'],
            f"❌ Ваша заявка №{app_id} на объект {app_data['details']['object_address']} <b>ОТКЛОНЕНА</b>.\n\n"
            f"<b>Причина:</b> {reason}"
        )
    except:
        pass
    await state.clear()


async def send_new_app_to_moderators(bot, app_id: int, db: DatabaseManager):
    """Рассылает карточку новой заявки всем модераторам и админам"""
    data = await db.get_application_details(app_id)
    if not data: return

    app = data['details']
    # Формируем список ФИО сотрудников
    staff_list = "\n".join([f"— {m['fio']} ({m['position']})" for m in data['staff']])

    text = (
        f"🔔 <b>НОВАЯ ЗАЯВКА №{app_id}</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"📍 <b>Объект:</b> {app['object_address']}\n"
        f"👤 <b>Прораб:</b> {app['foreman_name']}\n"
        f"📅 <b>Дата:</b> {app['date_target']}\n"
        f"⏰ <b>Время:</b> {app['time_start']}:00 - {app['time_end']}:00\n"
        f"🚜 <b>Техника:</b> {app['equip_name']}\n"
        f"👨‍🔧 <b>Водитель:</b> {app['driver_fio']}\n"
        f"👥 <b>Состав:</b>\n{staff_list}\n"
        f"💬 <b>Коммент:</b> {app['comment']}\n"
        f"━━━━━━━━━━━━━━━"
    )

    # Получаем всех, кому нужно отправить
    mod_ids = await db.get_admins_and_moderators()

    # Добавляем ID из .env (суперадминов) для подстраховки
    super_admins = os.getenv("SUPER_ADMIN_IDS", "").split(",")
    all_recipients = set(mod_ids + [int(i) for i in super_admins if i.strip()])

    for m_id in all_recipients:
        try:
            await bot.send_message(
                m_id,
                text,
                reply_markup=get_mod_decision_kb(app_id),  # Кнопки ✅/❌
                parse_mode="HTML"
            )
        except Exception as e:
            print(f"Не удалось отправить уведомление модератору {m_id}: {e}")


# 1. Обработка кнопки из главного меню (текстовая команда)
@router.message(F.text == "📂 Список заявок")
async def show_pending_applications(message: types.Message, db: DatabaseManager, role: str):
    if role not in ["moderator", "admin"]:
        return

    apps = await db.get_pending_applications()

    if not apps:
        await message.answer("✅ Все заявки обработаны. Новых пока нет.")
        return

    await message.answer(
        "📂 <b>Список ожидающих заявок:</b>\nВыберите для просмотра деталей:",
        reply_markup=get_pending_list_kb(apps),
        parse_mode="HTML"
    )


# 2. Обработка нажатия на конкретную заявку из списка
@router.callback_query(F.data.startswith("mod_view_"))
async def view_app_details(callback: types.CallbackQuery, db: DatabaseManager):
    app_id = int(callback.data.split("_")[2])

    # Используем уже готовую функцию рассылки, чтобы показать карточку
    data = await db.get_application_details(app_id)
    if not data:
        await callback.answer("Заявка не найдена.")
        return

    app = data['details']
    staff_list = "\n".join([f"— {m['fio']}" for m in data['staff']])

    text = (
        f"📋 <b>ДЕТАЛИ ЗАЯВКИ №{app_id}</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"📍 <b>Объект:</b> {app['object_address']}\n"
        f"👤 <b>Прораб:</b> {app['foreman_name']}\n"
        f"📅 <b>Дата:</b> {app['date_target']}\n"
        f"👥 <b>Состав:</b>\n{staff_list}\n"
        f"━━━━━━━━━━━━━━━"
    )

    # Редактируем старое сообщение, превращая его в карточку с кнопками ✅/❌
    await callback.message.edit_text(
        text,
        reply_markup=get_mod_decision_kb(app_id),
        parse_mode="HTML"
    )