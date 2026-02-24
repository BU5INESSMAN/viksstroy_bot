# viksstroy_bot/handlers/foreman.py
from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from keyboards import inline_factory as kb
from utils.states import TeamStates, AppStates
from utils.callbacks import TeamCallback, AppAction
from database.db_manager import DatabaseManager
import re
from handlers.moderator import send_new_app_to_moderators

router = Router()


# ==========================================
# УПРАВЛЕНИЕ БРИГАДАМИ (БЕЗ ИЗМЕНЕНИЙ)
# ==========================================

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
    await callback.message.edit_text(f"Бригада №{tid} создана.", reply_markup=kb.get_team_edit_kb(tid, []))


@router.callback_query(TeamCallback.filter(F.action == "main_menu"))
async def back_to_teams_from_team(callback: types.CallbackQuery, db: DatabaseManager, state: FSMContext):
    await state.clear()
    teams = await db.get_all_teams()
    await callback.message.edit_text("Список бригад:", reply_markup=kb.get_teams_main_kb(teams))


@router.callback_query(TeamCallback.filter(F.action == "view"))
async def view_team(callback: types.CallbackQuery, callback_data: TeamCallback, db: DatabaseManager, state: FSMContext):
    await state.clear()
    t = await db.get_team(callback_data.team_id)
    m = await db.get_team_members(callback_data.team_id)
    text = (f"🏗 <b>Бригада:</b> {t['name']}\n👥 <b>Участников:</b> {len(m)}\n\n"
            f"Ниже представлен список людей. Нажмите на имя сотрудника, чтобы изменить его ФИО, "
            f"специальность или создать ссылку-приглашение.")
    await callback.message.edit_text(text, reply_markup=kb.get_team_edit_kb(t['id'], m), parse_mode="HTML")


@router.callback_query(TeamCallback.filter(F.action == "add_leader"))
async def add_leader_start(callback: types.CallbackQuery, callback_data: TeamCallback, state: FSMContext):
    await state.update_data(tid=callback_data.team_id)
    await callback.message.answer("Введите ФИО бригадира:")
    await state.set_state(TeamStates.wait_for_leader)


@router.message(TeamStates.wait_for_leader)
async def save_leader(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    fio = message.text.strip()
    # Передаем is_leader=1, чтобы бот запомнил, что это старший
    await db.add_team_member(data['tid'], fio, "Бригадир", is_leader=1)
    await db.update_team_name(data['tid'], f"Бригада {fio}")
    await state.clear()

    t, m, hl = await db.get_team_full_data(data['tid'])
    # Возвращаем обновленную клавиатуру
    await message.answer(
        f"✅ Бригадир <b>{fio}</b> успешно добавлен в бригаду!",
        reply_markup=kb.get_team_edit_kb(t['id'], m),
        parse_mode="HTML"
    )


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
    await message.answer("✅ Название обновлено", reply_markup=kb.get_team_edit_kb(t['id'], m))


@router.callback_query(TeamCallback.filter(F.action == "manage_member"))
async def manage_member(callback: types.CallbackQuery, callback_data: TeamCallback, db: DatabaseManager,
                        state: FSMContext):
    await state.clear()
    member = await db.get_member(callback_data.member_id)
    if not member: return await callback.answer("Ошибка: участник не найден")
    status = "✅ Зарегистрирован" if member['tg_user_id'] else "⚠️ Ожидает входа по ссылке"
    text = (f"👤 <b>Управление: {member['fio']}</b>\n🛠 Специальность: {member['position']}\nСтатус: {status}")
    await callback.message.edit_text(text,
                                     reply_markup=kb.get_member_edit_kb(callback_data.team_id, callback_data.member_id),
                                     parse_mode="HTML")


@router.callback_query(TeamCallback.filter(F.action == "get_invite"))
async def invite_member(callback: types.CallbackQuery, callback_data: TeamCallback, db: DatabaseManager):
    code = await db.get_or_create_invite_code(callback_data.member_id)
    bot_info = await callback.bot.get_me()
    invite_link = f"https://t.me/{bot_info.username}?start=reg_{code}"
    await callback.message.answer(
        f"🔗 <b>Ссылка-приглашение:</b>\n\n<code>{invite_link}</code>\n\nПерешлите это сообщение сотруднику.",
        parse_mode="HTML")
    await callback.answer()


@router.callback_query(TeamCallback.filter(F.action.in_(["edit_m_fio", "edit_m_pos"])))
async def edit_member_start(callback: types.CallbackQuery, callback_data: TeamCallback, state: FSMContext):
    await state.update_data(edit_m_id=callback_data.member_id, edit_t_id=callback_data.team_id)
    markup = kb.get_cancel_edit_kb(callback_data.team_id, callback_data.member_id)
    if callback_data.action == "edit_m_fio":
        await callback.message.edit_text("Введите новое ФИО сотрудника:", reply_markup=markup)
        await state.set_state(TeamStates.wait_for_member_fio)
    else:
        await callback.message.edit_text("Введите новую специальность:", reply_markup=markup)
        await state.set_state(TeamStates.wait_for_member_pos)


@router.message(TeamStates.wait_for_member_fio)
async def edit_member_fio_done(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    await db.update_member(data['edit_m_id'], fio=message.text.strip())
    t = await db.get_team(data['edit_t_id'])
    m = await db.get_team_members(data['edit_t_id'])
    await state.clear()
    await message.answer(f"✅ ФИО успешно обновлено.\n🏗 <b>Бригада:</b> {t['name']}",
                         reply_markup=kb.get_team_edit_kb(t['id'], m), parse_mode="HTML")


@router.message(TeamStates.wait_for_member_pos)
async def edit_member_pos_done(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    await db.update_member(data['edit_m_id'], position=message.text.strip())
    t = await db.get_team(data['edit_t_id'])
    m = await db.get_team_members(data['edit_t_id'])
    await state.clear()
    await message.answer(f"✅ Специальность успешно обновлена.\n🏗 <b>Бригада:</b> {t['name']}",
                         reply_markup=kb.get_team_edit_kb(t['id'], m), parse_mode="HTML")


@router.callback_query(TeamCallback.filter(F.action == "delete_member"))
async def delete_member_handler(callback: types.CallbackQuery, callback_data: TeamCallback, db: DatabaseManager):
    await db.remove_team_member(callback_data.member_id)
    t = await db.get_team(callback_data.team_id)
    m = await db.get_team_members(callback_data.team_id)
    text = (f"🏗 <b>Бригада:</b> {t['name']}\n👥 <b>Участников:</b> {len(m)}\n\n✅ Участник успешно удален.")
    await callback.message.edit_text(text, reply_markup=kb.get_team_edit_kb(t['id'], m), parse_mode="HTML")
    await callback.answer("Участник удален", show_alert=True)


@router.callback_query(TeamCallback.filter(F.action == "add_member"))
async def add_member_start(callback: types.CallbackQuery, callback_data: TeamCallback, state: FSMContext):
    await state.update_data(tid=callback_data.team_id)
    markup = kb.get_cancel_add_kb(callback_data.team_id)
    await callback.message.edit_text("Введите ФИО участника:", reply_markup=markup)
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
    await message.answer(f"✅ {data['m_fio']} добавлен в бригаду!", reply_markup=kb.get_team_edit_kb(t['id'], m))


# ==========================================
# СОЗДАНИЕ ЗАЯВКИ (ИНТЕЛЛЕКТУАЛЬНОЕ ВРЕМЯ И WYSIWYG)
# ==========================================

def get_busy_hours_set(busy_intervals):
    """Превращает интервалы занятости в плоский набор занятых часов"""
    busy = set()
    for s, e in busy_intervals:
        for h in range(s, e):
            busy.add(h)
    return busy


def get_available_start_hours(busy_intervals):
    """Час начала доступен, если свободны 3 часа подряд (минимум заказа)"""
    busy = get_busy_hours_set(busy_intervals)
    avail = []
    for h in range(0, 22):  # Нельзя начать позже 21:00 (так как конец в 24:00)
        if h not in busy and (h + 1) not in busy and (h + 2) not in busy:
            avail.append(h)
    return avail


def get_available_end_hours(start_h, busy_intervals):
    """Час конца смены доступен, если от старта до него нет занятых окон"""
    busy = get_busy_hours_set(busy_intervals)
    avail = []
    for h in range(start_h + 3, 25):  # Минимум 3 часа
        valid = True
        for ch in range(start_h, h):
            if ch in busy:
                valid = False
                break
        if valid:
            avail.append(h)
        else:
            break  # Нельзя перепрыгнуть через занятый блок
    return avail


def build_app_card(data: dict) -> str:
    """Генерирует карточку заявки на лету для отображения прорабу"""
    text = "📋 <b>ФОРМИРОВАНИЕ ЗАЯВКИ:</b>\n━━━━━━━━━━━━━━━\n"
    if 'date_target' in data: text += f"📅 <b>Дата:</b> {data['date_target']}\n"
    if 'object_address' in data: text += f"📍 <b>Объект:</b> {data['object_address']}\n"
    if 'team_name' in data: text += f"👥 <b>Бригада:</b> {data['team_name']}\n"
    if 'sel_m_names' in data and data['sel_m_names']:
        text += f"👨‍🔧 <b>Состав:</b>\n" + "\n".join([f"  — {n}" for n in data['sel_m_names']]) + "\n"
    if 'equip_name' in data: text += f"🚜 <b>Техника:</b> {data['equip_name']}\n"
    if 'time_start' in data and 'time_end' in data:
        text += f"⏰ <b>Время:</b> {data['time_start']}:00 - {data['time_end']}:00\n"
    if 'comment' in data: text += f"💬 <b>Коммент:</b> {data['comment']}\n"
    text += "━━━━━━━━━━━━━━━\n\n"
    return text


async def show_review_card(message_or_callback, state: FSMContext):
    """Универсальная функция для вывода карточки проверки перед отправкой"""
    data = await state.get_data()
    text = build_app_card(data) + "👀 <b>ПРОВЕРКА ЗАЯВКИ:</b>\nВсе ли верно? Вы можете изменить любой пункт."
    markup = kb.get_review_kb()
    if isinstance(message_or_callback, types.Message):
        await message_or_callback.answer(text, reply_markup=markup, parse_mode="HTML")
    else:
        await message_or_callback.message.edit_text(text, reply_markup=markup, parse_mode="HTML")


async def validate_time_on_date_change(message_or_callback, state: FSMContext, db: DatabaseManager, new_date: str):
    """Секретная проверка: если при редактировании изменили дату, проверяем, не занята ли техника"""
    data = await state.get_data()
    if data.get('equipment_id') and data.get('time_start'):
        busy_intervals = await db.get_equipment_busy_intervals(data['equipment_id'], new_date)
        busy = get_busy_hours_set(busy_intervals)
        conflict = any(h in busy for h in range(data['time_start'], data.get('time_end', data['time_start'] + 3)))

        if conflict:
            msg = "⚠️ На новую дату выбранная техника уже занята в ваше время! Выберите технику заново."
            await state.update_data(equipment_id=None, equip_name=None, time_start=None, time_end=None,
                                    is_editing_equip=True)
            cats = await db.get_equipment_categories()
            if isinstance(message_or_callback, types.Message):
                await message_or_callback.answer(msg)
                await message_or_callback.answer("Выберите категорию техники:", reply_markup=kb.get_categories_kb(cats))
            else:
                await message_or_callback.answer(msg, show_alert=True)
                await message_or_callback.message.edit_text("Выберите категорию техники:",
                                                            reply_markup=kb.get_categories_kb(cats))
            return False
    return True


# --- ОСНОВНАЯ ЦЕПОЧКА ---

@router.message(F.text == "📝 Создать заявку")
async def start_app(message: types.Message, state: FSMContext):
    await state.clear()
    text = "📋 <b>ФОРМИРОВАНИЕ ЗАЯВКИ:</b>\n━━━━━━━━━━━━━━━\n\n<b>Шаг 1: Дата</b>\nВыберите день выполнения работ:"
    await message.answer(text, reply_markup=kb.get_dates_kb(), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "manual_date"))
async def process_manual_date_start(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Введите дату в формате ДД.ММ (например, 25.02):")
    await state.set_state(AppStates.select_date)


@router.callback_query(AppAction.filter(F.step == "select_date"))
async def process_select_date(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                              db: DatabaseManager):
    await state.update_data(date_target=callback_data.val)
    data = await state.get_data()

    if data.get('is_editing_date'):
        await state.update_data(is_editing_date=False)
        if await validate_time_on_date_change(callback, state, db, callback_data.val):
            return await show_review_card(callback, state)
        return

    history = await db.get_object_history(callback.from_user.id)
    text = build_app_card(data) + "<b>Шаг 2: Объект</b>\nВведите адрес объекта текстом или выберите из истории:"
    await callback.message.edit_text(text, reply_markup=kb.get_object_history_kb(history), parse_mode="HTML")
    await state.set_state(AppStates.wait_for_object)


@router.message(AppStates.select_date)
async def process_manual_date_input(message: types.Message, state: FSMContext, db: DatabaseManager):
    date_text = message.text.strip()
    if not re.match(r"^\d{2}\.\d{2}$", date_text):
        return await message.answer("❌ Неверный формат! Введите ДД.ММ (например, 10.03):")

    await state.update_data(date_target=date_text)
    data = await state.get_data()

    if data.get('is_editing_date'):
        await state.update_data(is_editing_date=False)
        if await validate_time_on_date_change(message, state, db, date_text):
            return await show_review_card(message, state)
        return

    history = await db.get_object_history(message.from_user.id)
    text = build_app_card(data) + "<b>Шаг 2: Объект</b>\nВведите адрес объекта текстом или выберите из истории:"
    await message.answer(text, reply_markup=kb.get_object_history_kb(history), parse_mode="HTML")
    await state.set_state(AppStates.wait_for_object)


@router.callback_query(AppAction.filter(F.step == "select_obj"))
async def set_object_history(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                             db: DatabaseManager):
    await state.update_data(object_address=callback_data.val)
    data = await state.get_data()

    if data.get('is_editing_simple'):
        await state.update_data(is_editing_simple=False)
        return await show_review_card(callback, state)

    teams = await db.get_all_teams()
    text = build_app_card(data) + "<b>Шаг 3: Бригада</b>\nВыберите бригаду:"
    await callback.message.edit_text(text, reply_markup=kb.get_teams_for_app_kb(teams), parse_mode="HTML")


@router.message(AppStates.wait_for_object)
async def set_object_manual(message: types.Message, state: FSMContext, db: DatabaseManager):
    await state.update_data(object_address=message.text)
    data = await state.get_data()

    if data.get('is_editing_simple'):
        await state.update_data(is_editing_simple=False)
        return await show_review_card(message, state)

    teams = await db.get_all_teams()
    text = build_app_card(data) + "<b>Шаг 3: Бригада</b>\nВыберите бригаду:"
    await message.answer(text, reply_markup=kb.get_teams_for_app_kb(teams), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "select_team"))
async def process_select_team(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                              db: DatabaseManager):
    team_id = int(callback_data.val)
    team_data, members, _ = await db.get_team_full_data(team_id)

    await state.update_data(team_id=team_id, team_name=team_data['name'], sel_m=[], sel_m_names=[])
    data = await state.get_data()

    text = build_app_card(data) + "<b>Шаг 4: Состав</b>\nОтметьте сотрудников, которые выйдут на смену:"
    await callback.message.edit_text(text, reply_markup=kb.get_staff_selection_kb(team_id, members, []),
                                     parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "toggle_staff"))
async def process_toggle_staff(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                               db: DatabaseManager):
    data = await state.get_data()
    m_id = int(callback_data.val)
    team_id = data['team_id']
    _, members, _ = await db.get_team_full_data(team_id)

    sel = data.get('sel_m', [])
    sel_names = data.get('sel_m_names', [])
    m_name = next((m['fio'] for m in members if m['id'] == m_id), "Неизвестно")

    if m_id in sel:
        sel.remove(m_id)
        if m_name in sel_names: sel_names.remove(m_name)
    else:
        sel.append(m_id)
        sel_names.append(m_name)

    await state.update_data(sel_m=sel, sel_m_names=sel_names)
    data = await state.get_data()
    text = build_app_card(data) + "<b>Шаг 4: Состав</b>\nОтметьте сотрудников, которые выйдут на смену:"
    await callback.message.edit_reply_markup(reply_markup=kb.get_staff_selection_kb(team_id, members, sel))


@router.callback_query(AppAction.filter(F.step == "confirm_staff"))
async def confirm_staff(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    if not data.get('sel_m'):
        return await callback.answer("⚠️ Выберите хотя бы одного сотрудника!", show_alert=True)

    if data.get('is_editing_team'):
        await state.update_data(is_editing_team=False)
        return await show_review_card(callback, state)

    cats = await db.get_equipment_categories()
    text = build_app_card(data) + "<b>Шаг 5: Техника</b>\nВыберите категорию техники:"
    await callback.message.edit_text(text, reply_markup=kb.get_categories_kb(cats), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "back_to_cats"))
async def back_to_categories(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    cats = await db.get_equipment_categories()
    text = build_app_card(data) + "<b>Шаг 5: Техника</b>\nВыберите категорию техники:"
    await callback.message.edit_text(text, reply_markup=kb.get_categories_kb(cats), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "select_cat"))
async def process_select_cat(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                             db: DatabaseManager):
    cat_name = callback_data.val
    data = await state.get_data()
    items = await db.get_equipment_by_category(cat_name)
    text = build_app_card(data) + f"<b>Шаг 6: Выбор машины ({cat_name})</b>\nКакую машину берём?"
    await callback.message.edit_text(text, reply_markup=kb.get_equipment_kb(items), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "select_equip"))
async def process_select_equip(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                               db: DatabaseManager):
    equip_id = int(callback_data.val)
    equip = await db.get_equipment(equip_id)
    await state.update_data(equipment_id=equip_id, equip_name=equip['name'])

    data = await state.get_data()
    busy_intervals = await db.get_equipment_busy_intervals(equip_id, data['date_target'])
    available = get_available_start_hours(busy_intervals)

    text = build_app_card(data) + "<b>Шаг 7: Время начала</b>\nВыберите час начала (только свободные часы):"
    await callback.message.edit_text(text, reply_markup=kb.get_hours_kb("start", available), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "reselect_time_start"))
async def process_reselect_time(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    busy_intervals = await db.get_equipment_busy_intervals(data['equipment_id'], data['date_target'])
    available = get_available_start_hours(busy_intervals)
    text = build_app_card(data) + "<b>Шаг 7: Время начала</b>\nВыберите час начала (только свободные часы):"
    await callback.message.edit_text(text, reply_markup=kb.get_hours_kb("start", available), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "time_start"))
async def process_time_start(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext,
                             db: DatabaseManager):
    start_h = int(callback_data.val)
    await state.update_data(time_start=start_h)

    data = await state.get_data()
    busy_intervals = await db.get_equipment_busy_intervals(data['equipment_id'], data['date_target'])
    available = get_available_end_hours(start_h, busy_intervals)

    text = build_app_card(data) + "<b>Шаг 8: Время окончания</b>\nВыберите время завершения (минимум 3 часа):"
    await callback.message.edit_text(text, reply_markup=kb.get_hours_kb("end", available), parse_mode="HTML")


@router.callback_query(AppAction.filter(F.step == "time_end"))
async def process_time_end(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext):
    await state.update_data(time_end=int(callback_data.val))
    data = await state.get_data()

    if data.get('is_editing_equip'):
        await state.update_data(is_editing_equip=False)
        return await show_review_card(callback, state)

    text = build_app_card(data) + "<b>Шаг 9: Комментарий</b>\nВведите пояснение к заявке (или напишите 'Нет'):"
    await callback.message.edit_text(text, parse_mode="HTML")
    await state.set_state(AppStates.wait_for_comment)


@router.message(AppStates.wait_for_comment)
async def finish_app(message: types.Message, state: FSMContext):
    await state.update_data(comment=message.text)
    data = await state.get_data()
    if data.get('is_editing_simple'):
        await state.update_data(is_editing_simple=False)
    await show_review_card(message, state)


# --- РЕДАКТИРОВАНИЕ ПЕРЕД ОТПРАВКОЙ (WYSIWYG) ---

@router.callback_query(F.data == "rev_cancel_edit")
async def cancel_edit(callback: types.CallbackQuery, state: FSMContext):
    await state.update_data(is_editing_date=False, is_editing_simple=False)
    await show_review_card(callback, state)


@router.callback_query(F.data == "rev_edit_date")
async def rev_edit_date(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Введите новую дату (ДД.ММ):", reply_markup=kb.get_cancel_review_kb())
    await state.update_data(is_editing_date=True)
    await state.set_state(AppStates.select_date)


@router.callback_query(F.data == "rev_edit_obj")
async def rev_edit_obj(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    history = await db.get_object_history(callback.from_user.id)
    await callback.message.edit_text("Выберите объект или введите новый:", reply_markup=kb.get_cancel_review_kb())
    await state.update_data(is_editing_simple=True)
    await state.set_state(AppStates.wait_for_object)


@router.callback_query(F.data == "rev_edit_team")
async def rev_edit_team(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    teams = await db.get_all_teams()
    await state.update_data(is_editing_team=True)
    await callback.message.edit_text("Выберите новую бригаду:", reply_markup=kb.get_teams_for_app_kb(teams))


@router.callback_query(F.data == "rev_edit_equip")
async def rev_edit_equip(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    cats = await db.get_equipment_categories()
    await state.update_data(is_editing_equip=True)
    await callback.message.edit_text("Выберите категорию техники:", reply_markup=kb.get_categories_kb(cats))


@router.callback_query(F.data == "rev_edit_comment")
async def rev_edit_comment(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Введите новый комментарий:", reply_markup=kb.get_cancel_review_kb())
    await state.update_data(is_editing_simple=True)
    await state.set_state(AppStates.wait_for_comment)


@router.callback_query(F.data == "rev_confirm")
async def confirm_application_final(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()

    # --- ИСПРАВЛЕНИЕ ОШИБКИ ЗДЕСЬ ---
    # Передаем список участников в нужный ключ для базы данных
    data['selected_member_ids'] = data.get('sel_m', [])
    # --------------------------------

    # Финальная проверка
    required_keys = ['date_target', 'object_address', 'team_id', 'sel_m', 'equipment_id', 'time_start', 'time_end',
                     'comment']
    if not all(k in data for k in required_keys):
        return await callback.answer("⚠️ Ошибка: не все поля заполнены! Проверьте заявку.", show_alert=True)

    app_id = await db.save_application(data, callback.from_user.id)
    final_text = build_app_card(data) + f"\n✅ <b>ЗАЯВКА №{app_id} УСПЕШНО ОТПРАВЛЕНА!</b>\nОжидайте решения модератора."
    await callback.message.edit_text(final_text, parse_mode="HTML")
    await state.clear()
    await send_new_app_to_moderators(callback.bot, app_id, db)


@router.callback_query(F.data == "ignore")
async def ignore_callback(callback: types.CallbackQuery):
    await callback.answer("Это время недоступно для бронирования!", show_alert=True)


@router.callback_query(F.data.startswith("edit_rejected_"))
async def edit_rejected_app(callback: types.CallbackQuery, state: FSMContext, db: DatabaseManager):
    app_id = int(callback.data.split("_")[2])
    app_data = await db.get_application_details(app_id)

    if not app_data:
        return await callback.answer("Ошибка: заявка не найдена в базе.", show_alert=True)

    details = app_data['details']
    staff = app_data['staff']

    # Загружаем старые данные в FSM, как если бы прораб ввел их сам
    await state.update_data(
        edit_app_id=app_id,  # Флаг, что это перезапись старой заявки
        date_target=details['date_target'],
        object_address=details['object_address'],
        team_id=details['team_id'],
        team_name=details['team_name'],
        equipment_id=details['equipment_id'],
        equip_name=details['equip_name'],
        time_start=details['time_start'],
        time_end=details['time_end'],
        comment=details['comment'],
        sel_m=[s['member_id'] for s in staff],
        sel_m_names=[s['fio'] for s in staff],
    )

    await callback.message.delete()  # Удаляем сообщение с отказом
    # Вызываем твою готовую функцию проверки (WYSIWYG)
    await show_review_card(callback.message, state)