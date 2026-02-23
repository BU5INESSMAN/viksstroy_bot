# viksstroy_bot/handlers/foreman.py
from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from keyboards import inline_factory as kb
from aiogram.filters import StateFilter
# Импортируем явно, если используется без приставки kb.
from keyboards.inline_factory import get_staff_selection_kb
from utils.states import TeamStates, AppStates
from utils.callbacks import TeamCallback, AppAction, TimeAction
from database.db_manager import DatabaseManager
import datetime
import re
from handlers.moderator import send_new_app_to_moderators

router = Router()


# --- УПРАВЛЕНИЕ БРИГАДАМИ ---

@router.message(F.text == "👥 Управление бригадами")
async def menu_teams(message: types.Message, db: DatabaseManager):
    teams = await db.get_all_teams()
    await message.answer("Список бригад:", reply_markup=kb.get_teams_main_kb(teams))

@router.callback_query(F.data == "menu_teams_list")
async def back_to_teams(callback: types.CallbackQuery, db: DatabaseManager):
    teams = await db.get_all_teams()
    await callback.message.edit_text("Список бригад:", reply_markup=kb.get_teams_main_kb(teams))

@router.callback_query(TeamCallback.filter(F.action == "create"))
async def create_team(callback: types.CallbackQuery, db: DatabaseManager):
    tid = await db.create_empty_team(callback.from_user.id)
    await callback.message.edit_text(f"Бригада №{tid} создана.",
                                     reply_markup=kb.get_team_edit_kb(tid, False, 0))


@router.callback_query(TeamCallback.filter(F.action == "view"))
async def view_team(callback: types.CallbackQuery, callback_data: TeamCallback, db: DatabaseManager):
    # 1. Получаем данные о бригаде и её участниках из базы
    t = await db.get_team(callback_data.team_id)
    m = await db.get_team_members(callback_data.team_id)

    # 2. ФОРМИРУЕМ ТЕКСТ (этот блок у вас, скорее всего, пропал)
    text = (
        f"🏗 <b>Бригада:</b> {t['name']}\n"
        f"👥 <b>Участников:</b> {len(m)}\n\n"
        f"Ниже представлен список людей. Нажмите на имя сотрудника, чтобы изменить его ФИО, "
        f"специальность или создать ссылку-приглашение."
    )

    # 3. Отправляем сообщение с текстом и клавиатурой
    await callback.message.edit_text(
        text,  # Переменная 'text' теперь определена выше
        reply_markup=kb.get_team_edit_kb(t['id'], m),
        parse_mode="HTML"
    )

@router.callback_query(TeamCallback.filter(F.action == "add_leader"))
async def add_leader_start(callback: types.CallbackQuery, callback_data: TeamCallback, state: FSMContext):
    await state.update_data(tid=callback_data.team_id)
    await callback.message.answer("Введите ФИО бригадира:")
    await state.set_state(TeamStates.wait_for_leader)

@router.message(TeamStates.wait_for_leader)
async def save_leader(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    fio = message.text.strip()
    await db.add_team_member(data['tid'], fio, "Бригадир")
    await db.update_team_name(data['tid'], f"Бригада {fio}")
    await state.clear()
    await message.answer(f"✅ Бригадир {fio} добавлен.")


@router.callback_query(TeamCallback.filter(F.action == "edit_name"))
async def edit_name(callback: types.CallbackQuery, callback_data: TeamCallback, state: FSMContext):
    await state.update_data(tid=callback_data.team_id)
    await callback.message.answer("Введите новое название для бригады:")
    await state.set_state(TeamStates.wait_for_name)


@router.message(TeamStates.wait_for_name)
async def save_name(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    await db.update_team_name(data['tid'], message.text.strip())
    await state.clear()
    t, m, hl = await db.get_team_full_data(data['tid'])
    await message.answer("✅ Название обновлено", reply_markup=kb.get_team_edit_kb(t['id'], hl, len(m)))


# Вызов меню конкретного сотрудника
@router.callback_query(TeamCallback.filter(F.action == "manage_member"))
async def manage_member(callback: types.CallbackQuery, callback_data: TeamCallback, db: DatabaseManager):
    # Теперь callback_data.member_id существует
    member = await db.get_member(callback_data.member_id)

    if not member:
        await callback.answer("Ошибка: участник не найден")
        return

    status = "✅ Зарегистрирован" if member['tg_user_id'] else "⚠️ Ожидает входа по ссылке"

    text = (
        f"👤 <b>Управление: {member['fio']}</b>\n"
        f"🛠 Специальность: {member['position']}\n"
        f"Статус: {status}"
    )

    # Вызываем меню управления (которое мы создавали в прошлых шагах)
    await callback.message.edit_text(
        text,
        reply_markup=kb.get_member_edit_kb(callback_data.team_id, callback_data.member_id),
        parse_mode="HTML"
    )


# Генерация и отправка ссылки
@router.callback_query(TeamCallback.filter(F.action == "m_invite"))
async def invite_member(callback: types.CallbackQuery, callback_data: TeamCallback, db: DatabaseManager):
    code = await db.get_or_create_invite_code(callback_data.member_id)
    bot_info = await callback.bot.get_me()
    invite_link = f"https://t.me/{bot_info.username}?start=reg_{code}"

    await callback.message.answer(
        f"🔗 <b>Ссылка-приглашение для {callback_data.member_id}:</b>\n\n"
        f"<code>{invite_link}</code>\n\n"
        f"Перешлите это сообщение сотруднику. После перехода он будет закреплен за вашей бригадой.",
        parse_mode="HTML"
    )
    await callback.answer()


# 3. Начало изменения ФИО/Специальности
@router.callback_query(TeamCallback.filter(F.action.in_(["m_edit_fio", "m_edit_pos"])))
async def edit_member_start(callback: types.CallbackQuery, callback_data: TeamCallback, state: FSMContext):
    await state.update_data(edit_m_id=callback_data.member_id, edit_t_id=callback_data.team_id)

    if callback_data.action == "m_edit_fio":
        await callback.message.answer("Введите новое ФИО сотрудника:")
        await state.set_state(TeamStates.wait_for_member_fio)
    else:
        await callback.message.answer("Введите новую специальность:")
        await state.set_state(TeamStates.wait_for_member_pos)
    await callback.answer()

@router.message(TeamStates.wait_for_member_fio)
async def edit_member_fio_done(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    await db.update_member(data['edit_m_id'], fio=message.text.strip())
    await message.answer("✅ ФИО обновлено")
    await state.clear()

# --- БЛОК: СОЗДАНИЕ ЗАЯВКИ ---
@router.message(F.text == "📝 Создать заявку")
async def start_app(message: types.Message, state: FSMContext, db: DatabaseManager):
    history = await db.get_object_history(message.from_user.id)
    await message.answer("Введите адрес или выберите из истории:",
                         reply_markup=kb.get_object_history_kb(history))
    await state.set_state(AppStates.wait_for_object)

@router.message(AppStates.wait_for_object)
async def set_object_manual(message: types.Message, state: FSMContext, db: DatabaseManager):
    await state.update_data(object_address=message.text)
    teams = await db.get_all_teams()
    await message.answer("Выберите бригаду:", reply_markup=kb.get_teams_for_app_kb(teams))

@router.callback_query(AppAction.filter(F.step == "select_team"))
async def process_select_team(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext, db: DatabaseManager):
    team_id = int(callback_data.val)
    await state.update_data(team_id=team_id, sel_m=[])
    _, members, _ = await db.get_team_full_data(team_id)
    await callback.message.edit_text("Выберите состав:",
                                     reply_markup=kb.get_staff_selection_kb(team_id, members, []))

@router.callback_query(AppAction.filter(F.step == "toggle_staff"))
async def process_toggle_staff(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    m_id = int(callback_data.val)
    sel = data.get('sel_m', [])
    if m_id in sel: sel.remove(m_id)
    else: sel.append(m_id)
    await state.update_data(sel_m=sel)
    _, members, _ = await db.get_team_full_data(data['team_id'])
    await callback.message.edit_reply_markup(reply_markup=kb.get_staff_selection_kb(data['team_id'], members, sel))

# --- ШАГ 3.1: ПОДТВЕРЖДЕНИЕ СОСТАВА ---
@router.callback_query(AppAction.filter(F.step == "confirm_staff"))
async def confirm_staff(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    if not data.get('sel_m'):
        await callback.answer("⚠️ Выберите хотя бы одного сотрудника!", show_alert=True)
        return

    await callback.message.edit_text(
        "<b>Шаг 4: Дата</b>\nВыберите день выполнения работ:",
        reply_markup=kb.get_dates_kb(),  # ИСПРАВЛЕНО имя функции
        parse_mode="HTML"
    )


# --- ШАГ 4: ВЫБОР ДАТЫ ---
@router.callback_query(AppAction.filter(F.step == "select_date"))
async def process_select_date(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                              db: DatabaseManager):
    target_date = callback_data.val
    await state.update_data(date_target=target_date)
    cats = await db.get_equipment_categories()
    await callback.message.edit_text(
        f"Дата: {target_date}\n\n<b>Шаг 5: Техника</b>\nВыберите категорию:",
        reply_markup=kb.get_categories_kb(cats),
        parse_mode="HTML"
    )


# --- ШАГ 5: ВЫБОР ТЕХНИКИ И ВРЕМЕНИ ---
@router.callback_query(AppAction.filter(F.step == "select_equip"))
async def process_select_equip(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext):
    equip_id = int(callback_data.value)
    await state.update_data(equipment_id=equip_id)
    await callback.message.edit_text(
        "<b>Шаг 6: Время начала</b>\nВыберите час начала работ:",
        reply_markup=kb.get_hours_kb("start"),  # ИСПРАВЛЕНО имя функции
        parse_mode="HTML"
    )


@router.callback_query(AppAction.filter(F.step == "time_start"))
async def process_time_start(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext):
    start_h = int(callback_data.value)
    await state.update_data(time_start=start_h)
    await callback.message.edit_text(
        f"Начало в {start_h}:00\n\n<b>Шаг 7: Время окончания</b>\nВыберите час завершения:",
        reply_markup=kb.get_hours_kb("end", start_h),  # ИСПРАВЛЕНО имя функции
        parse_mode="HTML"
    )


@router.callback_query(AppAction.filter(F.step == "time_end"))
async def process_time_end(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext):
    end_h = int(callback_data.value)
    await state.update_data(time_end=end_h)
    await callback.message.answer("<b>Шаг 8: Комментарий</b>\nВведите пояснение к заявке (или напишите 'Нет'):")
    await state.set_state(AppStates.wait_for_comment)


@router.message(AppStates.wait_for_comment)
async def finish_app(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    data['comment'] = message.text
    data['selected_member_ids'] = data['sel_m']
    app_id = await db.save_application(data, message.from_user.id)
    await state.clear()
    await message.answer(f"✅ <b>Заявка №{app_id} создана!</b>\nОжидайте решения модератора.", parse_mode="HTML")
    await send_new_app_to_moderators(message.bot, app_id, db)


# --- ВСПОМОГАТЕЛЬНЫЕ ХЕНДЛЕРЫ ---
@router.callback_query(AppAction.filter(F.step == "back_to_cats"))
async def back_to_categories(callback: types.CallbackQuery, db: DatabaseManager):
    cats = await db.get_equipment_categories()
    await callback.message.edit_text("<b>Шаг 5: Техника</b>\nВыберите категорию:",
                                     reply_markup=kb.get_categories_kb(cats), parse_mode="HTML")


@router.callback_query(F.data == "ignore")
async def ignore_callback(callback: types.CallbackQuery):
    await callback.answer("Эта техника уже забронирована!", show_alert=True)


@router.callback_query(TeamCallback.filter(F.action == "add_member"))
async def add_member_start(callback: types.CallbackQuery, callback_data: TeamCallback, state: FSMContext):
    await state.update_data(tid=callback_data.team_id)
    await callback.message.answer("Введите ФИО участника:")
    await state.set_state(TeamStates.wait_for_member)


@router.message(TeamStates.wait_for_member)
async def add_member_fio(message: types.Message, state: FSMContext):
    await state.update_data(m_fio=message.text.strip())
    await message.answer("Теперь введите должность (например: Разнорабочий):")
    await state.set_state(TeamStates.wait_for_pos)


@router.message(TeamStates.wait_for_pos)
async def add_member_final(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    pos = message.text.strip()
    await db.add_team_member(data['tid'], data['m_fio'], pos)

    t, m, hl = await db.get_team_full_data(data['tid'])
    await state.clear()
    await message.answer(f"✅ {data['m_fio']} добавлен в бригаду!",
                         reply_markup=kb.get_team_edit_kb(t['id'], hl, len(m)))


@router.callback_query(AppAction.filter(F.step == "manual_date"))
async def process_manual_date_start(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.answer("Введите дату в формате ДД.ММ (например, 25.02):")
    await state.set_state(AppStates.select_date)


@router.message(AppStates.select_date)
async def process_manual_date_input(message: types.Message, state: FSMContext):
    date_text = message.text.strip()
    # Проверка формата ДД.ММ
    if not re.match(r"^\d{2}\.\d{2}$", date_text):
        await message.answer("❌ Неверный формат! Введите ДД.ММ (например, 10.03):")
        return

    await state.update_data(date_target=date_text)
    await message.answer(f"✅ Дата {date_text} принята. Введите комментарий:")
    await state.set_state(AppStates.wait_for_comment)