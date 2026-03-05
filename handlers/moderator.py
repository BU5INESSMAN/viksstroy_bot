import os
import asyncio
from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db_manager import DatabaseManager
from keyboards import inline_factory as kb
from utils.notifications import notify_workers_about_app, notify_bosses

router = Router()


class ModStates(StatesGroup):
    wait_for_rejection_reason = State()


@router.message(F.text == "🛡 Панель модератора")
@router.message(Command("mod"))
async def mod_panel_main(message: types.Message, db: DatabaseManager, role: str):
    if role not in ["moderator", "boss", "superadmin"]: return
    await message.answer("🛡 <b>Панель модератора | ВИКС Расписание</b>\n\n<i>Выберите доступное действие:</i>",
                         reply_markup=kb.get_mod_panel_kb(), parse_mode="HTML")


async def send_new_app_to_moderators(bot, app_id: int, db: DatabaseManager):
    data = await db.get_application_details(app_id)
    if not data: return

    details = data['details']
    mods = await db.get_admins_and_moderators()

    total_foremen = await db.get_foremen_count()
    today_apps = await db.get_today_apps_count()
    missing = await db.get_missing_foremen_today()

    missing_text = ""
    if missing:
        missing_links = [f"• <a href='tg://user?id={m['user_id']}'>{m['fio']}</a>" for m in missing]
        missing_text = f"❌ <b>Должники ({len(missing)}):</b>\n" + "\n".join(missing_links)
    else:
        missing_text = "✅ <b>Все прорабы сдали заявки!</b>"

    text = (
        f"📦 <b>НОВАЯ ЗАЯВКА №{app_id}</b>\n"
        f"👤 От прораба: <b>{details['foreman_name']}</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"📊 <b>Статистика:</b> заполнили <code>{today_apps} из {total_foremen}</code>\n\n"
        f"{missing_text}\n"
        f"━━━━━━━━━━━━━━━\n"
        f"<i>Нажмите кнопку ниже, чтобы взять заявку в работу.</i>"
    )

    markup = kb.get_mod_take_kb(app_id)
    for mod_id in mods:
        try:
            await bot.send_message(mod_id, text, reply_markup=markup, parse_mode="HTML")
        except Exception:
            pass
        await asyncio.sleep(0.05)


@router.callback_query(F.data == "mod_remind_all")
async def mod_remind_all(callback: types.CallbackQuery, db: DatabaseManager):
    missing = await db.get_missing_foremen_today()
    if not missing:
        return await callback.answer("✅ Все прорабы уже сдали заявки!", show_alert=True)

    count = 0
    for m in missing:
        try:
            await callback.bot.send_message(
                m['user_id'],
                "⚠️ <b>НАПОМИНАНИЕ ОТ МОДЕРАТОРА | ВИКС Расписание</b>\n\n"
                "Пожалуйста, не забудьте сформировать и отправить заявку на бригаду и технику на следующий день!",
                parse_mode="HTML"
            )
            count += 1
        except Exception:
            pass
        await asyncio.sleep(0.05)

    await callback.answer(f"Напоминания успешно отправлены {count} прорабам.", show_alert=True)


@router.message(F.text == "📤 Отправить наряды в группу")
@router.callback_query(F.data == "mod_publish_apps")
async def publish_approved_apps(callback: types.CallbackQuery, db: DatabaseManager):
    group_id = os.getenv("GROUP_CHAT_ID")
    if not group_id:
        return await callback.answer("❌ Ошибка: В файле .env не настроен GROUP_CHAT_ID", show_alert=True)

    apps = await db.get_approved_apps_for_publish()
    if not apps:
        return await callback.answer("Нет новых одобренных заявок для публикации.", show_alert=True)

    count = 0
    errors = []

    for row in apps:
        app_id = row['id']
        data = await db.get_application_details(app_id)
        details = data['details']
        staff_str = "\n".join([f"  ├ {s['fio']} (<i>{s['position']}</i>)" for s in data['staff']])

        text = (
            f"🟢 <b>УТВЕРЖДЕННЫЙ НАРЯД №{app_id}</b>\n"
            f"🏢 <b>ВИКС Расписание</b>\n"
            f"━━━━━━━━━━━━━━━\n"
            f"📅 <b>Дата:</b> <code>{details['date_target']}</code>\n"
            f"📍 <b>Объект:</b> {details['object_address']}\n"
            f"⏰ <b>Время:</b> {details['time_start']}:00 - {details['time_end']}:00\n"
            f"🚜 <b>Техника:</b> {details['equip_name']}\n"
            f"👷‍♂️ <b>Прораб:</b> <b>{details['foreman_name']}</b>\n\n"
            f"👥 <b>Бригада «{details['team_name']}»:</b>\n{staff_str}\n"
        )
        if details['comment'] and details['comment'].lower() != 'нет':
            text += f"\n💬 <b>Комментарий:</b> {details['comment']}"

        publish_success = False
        try:
            await callback.bot.send_message(group_id, text, parse_mode="HTML")
            await db.mark_app_as_published(app_id)
            publish_success = True
            count += 1
        except Exception as e:
            errors.append(f"Заявка №{app_id} (в группу): {e}")

        if publish_success:
            try:
                await notify_workers_about_app(callback.bot, app_id, db)
            except Exception as e:
                errors.append(f"Заявка №{app_id} (рабочим): {e}")

        await asyncio.sleep(0.05)

    final_msg = f"✅ <b>Успешно опубликовано в группу заявок:</b> <code>{count}</code>."
    if errors:
        final_msg += "\n\n⚠️ <b>Возникли ошибки при отправке:</b>\n" + "\n".join(errors[:10])

    await callback.message.answer(final_msg, parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data.startswith("mod_take_"))
async def process_take_app(callback: types.CallbackQuery, db: DatabaseManager):
    app_id = int(callback.data.split("_")[2])
    data = await db.get_application_details(app_id)
    if not data:
        return await callback.answer("Заявка не найдена!")

    details = data['details']
    foreman_id = details['foreman_id']
    mod_name = callback.from_user.username or callback.from_user.first_name

    await notify_bosses(callback.bot, db, f"👀 Модератор <b>@{mod_name}</b> начал рассмотрение заявки <b>№{app_id}</b>.")

    try:
        await callback.bot.send_message(foreman_id,
                                        f"👀 <b>ВИКС Расписание:</b> Ваша заявка №{app_id} рассматривается модератором @{mod_name}.")
    except Exception:
        pass

    staff_str = "\n".join([f"  ├ {s['fio']} (<i>{s['position']}</i>)" for s in data['staff']])
    text = (
        f"📋 <b>ЗАЯВКА №{app_id} (РАССМОТРЕНИЕ)</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"👤 <b>Прораб:</b> {details['foreman_name']}\n"
        f"📅 <b>Дата:</b> {details['date_target']}\n"
        f"📍 <b>Объект:</b> {details['object_address']}\n"
        f"⏰ <b>Время:</b> {details['time_start']}:00 - {details['time_end']}:00\n"
        f"🚜 <b>Техника:</b> {details['equip_name']}\n\n"
        f"👥 <b>Бригада:</b> {details['team_name']}\n"
        f"👨‍🔧 <b>Состав:</b>\n{staff_str}\n\n"
        f"💬 <b>Комментарий:</b> {details['comment']}\n"
        f"━━━━━━━━━━━━━━━\n"
        f"<i>Выберите решение:</i>"
    )

    await callback.message.edit_text(text, reply_markup=kb.get_mod_decision_kb(app_id), parse_mode="HTML")


@router.callback_query(F.data.startswith("mod_approve_"))
async def mod_approve(callback: types.CallbackQuery, db: DatabaseManager):
    app_id = int(callback.data.split("_")[2])
    await db.update_app_status(app_id, "approved")

    mod_name = callback.from_user.username or callback.from_user.first_name
    await notify_bosses(callback.bot, db, f"✅ Модератор <b>@{mod_name}</b> ОДОБРИЛ заявку <b>№{app_id}</b>.")

    data = await db.get_application_details(app_id)
    foreman_id = data['details']['foreman_id']

    try:
        await callback.bot.send_message(foreman_id, f"✅ <b>ВИКС Расписание:</b> Ваша заявка №{app_id} ОДОБРЕНА!",
                                        parse_mode="HTML")
    except Exception:
        pass

    await callback.message.edit_text(callback.message.text + "\n\n✅ <b>СТАТУС: ОДОБРЕНО</b>", parse_mode="HTML")


@router.callback_query(F.data.startswith("mod_reject_"))
async def mod_reject_start(callback: types.CallbackQuery, state: FSMContext):
    app_id = int(callback.data.split("_")[2])
    await state.update_data(reject_app_id=app_id)
    await callback.message.answer(f"✍️ Напишите причину отклонения заявки <b>№{app_id}</b>:")
    await state.set_state(ModStates.wait_for_rejection_reason)
    await callback.answer()


@router.message(ModStates.wait_for_rejection_reason)
async def mod_reject_finish(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    app_id = data['reject_app_id']
    reason = message.text.strip()

    await db.update_app_status(app_id, "rejected", reason)

    mod_name = message.from_user.username or message.from_user.first_name
    await notify_bosses(
        message.bot, db,
        f"❌ Модератор <b>@{mod_name}</b> ОТКЛОНИЛ заявку <b>№{app_id}</b>.\n💬 <b>Причина:</b> <i>{reason}</i>"
    )

    app_data = await db.get_application_details(app_id)
    foreman_id = app_data['details']['foreman_id']

    text_to_foreman = (
        f"❌ <b>ВАША ЗАЯВКА №{app_id} ОТКЛОНЕНА!</b>\n\n"
        f"💬 <b>Причина от модератора:</b>\n<blockquote>{reason}</blockquote>\n\n"
        f"<i>Нажмите кнопку ниже, чтобы исправить ошибки и отправить заново.</i>"
    )

    try:
        await message.bot.send_message(foreman_id, text_to_foreman,
                                       reply_markup=kb.get_foreman_edit_rejected_kb(app_id), parse_mode="HTML")
    except Exception:
        pass

    await message.answer(f"✅ Заявка <b>№{app_id}</b> успешно отклонена. Прораб уведомлен.")
    await state.clear()