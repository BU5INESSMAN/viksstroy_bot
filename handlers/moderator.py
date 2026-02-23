# viksstroy_bot/handlers/moderator.py
from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db_manager import DatabaseManager
from keyboards import inline_factory as kb

router = Router()


class ModStates(StatesGroup):
    wait_for_rejection_reason = State()


async def send_new_app_to_moderators(bot, app_id: int, db: DatabaseManager):
    """Рассылка новой заявки модераторам"""
    data = await db.get_application_details(app_id)
    if not data: return

    details = data['details']
    mods = await db.get_admins_and_moderators()

    total_foremen = await db.get_foremen_count()
    today_apps = await db.get_today_apps_count()

    text = (
        f"📦 <b>НОВАЯ ЗАЯВКА №{app_id}</b>\n"
        f"👤 От прораба: <b>{details['foreman_name']}</b>\n"
        f"📊 Заполнено за сегодня: <b>{today_apps} из {total_foremen}</b>\n\n"
        f"Нажмите кнопку ниже, чтобы взять заявку в работу."
    )

    markup = kb.get_mod_take_kb(app_id)
    for mod_id in mods:
        try:
            await bot.send_message(mod_id, text, reply_markup=markup, parse_mode="HTML")
        except Exception:
            pass


# --- ОБРАБОТЧИКИ МОДЕРАТОРА ---

@router.callback_query(F.data.startswith("mod_take_"))
async def process_take_app(callback: types.CallbackQuery, db: DatabaseManager):
    app_id = int(callback.data.split("_")[2])
    data = await db.get_application_details(app_id)
    if not data:
        return await callback.answer("Заявка не найдена!")

    details = data['details']
    foreman_id = details['foreman_id']
    mod_name = callback.from_user.username or callback.from_user.first_name

    # Уведомляем прораба
    try:
        await callback.bot.send_message(foreman_id, f"👀 Ваша заявка №{app_id} рассматривается модератором @{mod_name}.")
    except Exception:
        pass

    # Показываем полную карточку модератору
    staff_str = "\n".join([f"  — {s['fio']} ({s['position']})" for s in data['staff']])
    text = (
        f"📋 <b>ЗАЯВКА №{app_id} (РАССМОТРЕНИЕ)</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"👤 Прораб: {details['foreman_name']}\n"
        f"📅 Дата: {details['date_target']}\n"
        f"📍 Объект: {details['object_address']}\n"
        f"👥 Бригада: {details['team_name']}\n"
        f"👨‍🔧 Состав:\n{staff_str}\n"
        f"🚜 Техника: {details['equip_name']}\n"
        f"⏰ Время: {details['time_start']}:00 - {details['time_end']}:00\n"
        f"💬 Комментарий: {details['comment']}\n"
        f"━━━━━━━━━━━━━━━\n"
        f"Выберите решение:"
    )

    await callback.message.edit_text(text, reply_markup=kb.get_mod_decision_kb(app_id), parse_mode="HTML")


@router.callback_query(F.data.startswith("mod_approve_"))
async def mod_approve(callback: types.CallbackQuery, db: DatabaseManager):
    app_id = int(callback.data.split("_")[2])
    await db.update_app_status(app_id, "approved")

    data = await db.get_application_details(app_id)
    foreman_id = data['details']['foreman_id']

    # Уведомляем прораба
    try:
        await callback.bot.send_message(foreman_id, f"✅ <b>Ваша заявка №{app_id} ОДОБРЕНА!</b>", parse_mode="HTML")
    except Exception:
        pass

    await callback.message.edit_text(callback.message.text + "\n\n✅ <b>СТАТУС: ОДОБРЕНО</b>", parse_mode="HTML")


@router.callback_query(F.data.startswith("mod_reject_"))
async def mod_reject_start(callback: types.CallbackQuery, state: FSMContext):
    app_id = int(callback.data.split("_")[2])
    await state.update_data(reject_app_id=app_id)
    await callback.message.answer(f"Напишите причину отклонения заявки №{app_id}:")
    await state.set_state(ModStates.wait_for_rejection_reason)
    await callback.answer()


@router.message(ModStates.wait_for_rejection_reason)
async def mod_reject_finish(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    app_id = data['reject_app_id']
    reason = message.text.strip()

    await db.update_app_status(app_id, "rejected", reason)

    # Уведомляем прораба с кнопкой "Исправить"
    app_data = await db.get_application_details(app_id)
    foreman_id = app_data['details']['foreman_id']

    text_to_foreman = (
        f"❌ <b>ВАША ЗАЯВКА №{app_id} ОТКЛОНЕНА!</b>\n\n"
        f"💬 <b>Причина:</b> {reason}\n\n"
        f"Нажмите кнопку ниже, чтобы исправить ошибки и отправить заново."
    )

    try:
        await message.bot.send_message(foreman_id, text_to_foreman,
                                       reply_markup=kb.get_foreman_edit_rejected_kb(app_id), parse_mode="HTML")
    except Exception:
        pass

    await message.answer(f"✅ Заявка №{app_id} отклонена. Прораб уведомлен.")
    await state.clear()