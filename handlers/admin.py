# viksstroy_bot/handlers/admin.py
from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database.db_manager import DatabaseManager
from keyboards import inline_factory as kb

router = Router()


class AdminStates(StatesGroup):
    wait_for_bulk_equip = State()
    wait_for_eq_name = State()
    wait_for_eq_cat = State()
    wait_for_eq_driver = State()


@router.message(Command("admin"))
@router.message(F.text == "🛠 Панель управления")
async def admin_panel_main(message: types.Message, role: str):
    if role != "admin": return
    await message.answer("🛠 <b>Панель администратора</b>\nВыберите раздел для управления:",
                         reply_markup=kb.get_admin_main_kb(), parse_mode="HTML")


@router.callback_query(F.data == "admin_main")
async def admin_main_return(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text("🛠 <b>Панель администратора</b>\nВыберите раздел для управления:",
                                     reply_markup=kb.get_admin_main_kb(), parse_mode="HTML")


# --- СТАТИСТИКА ЗАЯВОК ---
@router.callback_query(F.data == "admin_stats")
async def show_statistics(callback: types.CallbackQuery, db: DatabaseManager):
    stats = await db.get_general_statistics()

    top_eq_text = "\n".join([f"  🚜 {r['name']} — {r['cnt']} раз" for r in stats['top_equip']]) or "  Нет данных"
    top_f_text = "\n".join([f"  👷‍♂️ {r['fio']} — {r['cnt']} заявок" for r in stats['top_foremen']]) or "  Нет данных"

    text = (
        f"📊 <b>СТАТИСТИКА СИСТЕМЫ</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"<b>За сегодня:</b>\n"
        f"📥 Всего подано: <b>{stats['today_total']}</b>\n"
        f"✅ Одобрено: <b>{stats['today_approved']}</b>\n"
        f"❌ Отклонено: <b>{stats['today_rejected']}</b>\n"
        f"⏳ Ожидают публикации: <b>{stats['waiting_publish']}</b>\n\n"
        f"<b>Топ-3 техники (за всё время):</b>\n{top_eq_text}\n\n"
        f"<b>Топ-3 прорабов:</b>\n{top_f_text}"
    )

    builder = InlineKeyboardBuilder()
    builder.button(text="🔄 Обновить", callback_data="admin_stats")
    builder.button(text="🔙 Назад", callback_data="admin_main")
    builder.adjust(1)

    await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="HTML")


# --- МАССОВОЕ ДОБАВЛЕНИЕ (Оставлено как было) ---
@router.callback_query(F.data == "admin_bulk_equip")
async def admin_bulk_equip_start(callback: types.CallbackQuery, state: FSMContext):
    text = (
        "🚜 <b>Массовое добавление техники</b>\n\n"
        "Отправьте мне список техники одним сообщением.\n"
        "<b>Формат (каждая машина с новой строки):</b>\n"
        "<code>Категория | Название | ФИО водителя</code>\n\n"
        "<i>Пример:</i>\n"
        "Экскаваторы | JCB 4CX | Иванов И.И.\n"
        "Напишите /cancel для отмены."
    )
    await callback.message.edit_text(text, parse_mode="HTML")
    await state.set_state(AdminStates.wait_for_bulk_equip)


@router.message(AdminStates.wait_for_bulk_equip)
async def process_bulk_equip(message: types.Message, state: FSMContext, db: DatabaseManager):
    if message.text.lower() == '/cancel':
        await state.clear()
        return await message.answer("Отменено.", reply_markup=kb.get_admin_main_kb())

    lines = message.text.strip().split('\n')
    added = 0
    errors = []

    for i, line in enumerate(lines, 1):
        if not line.strip(): continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 2:
            category, name = parts[0], parts[1]
            driver = parts[2] if len(parts) > 2 else "Не указан"
            await db.add_equipment(name, category, driver)
            added += 1
        else:
            errors.append(f"Строка {i}: неверный формат ({line})")

    text = f"✅ <b>Успешно добавлено {added} единиц техники.</b>"
    if errors: text += "\n\n⚠️ <b>Ошибки при распознавании:</b>\n" + "\n".join(errors)
    await message.answer(text, parse_mode="HTML", reply_markup=kb.get_admin_main_kb())
    await state.clear()


# --- УПРАВЛЕНИЕ И РЕДАКТИРОВАНИЕ КОНКРЕТНОЙ ТЕХНИКИ ---
@router.callback_query(F.data == "admin_equip_list")
async def admin_equip_list(callback: types.CallbackQuery, db: DatabaseManager):
    items = await db.get_all_equipment_admin()
    builder = InlineKeyboardBuilder()
    for item in items:
        status = "🟢" if item['is_active'] else "🔴"
        builder.button(text=f"{status} {item['name']}", callback_data=f"admin_equip_edit_{item['id']}")
    builder.button(text="🔙 Назад", callback_data="admin_main")
    builder.adjust(1)
    await callback.message.edit_text("<b>Список техники:</b>\n<i>Нажмите на позицию для редактирования</i>",
                                     reply_markup=builder.as_markup(), parse_mode="HTML")


@router.callback_query(F.data.startswith("admin_equip_edit_"))
async def admin_equip_edit_menu(callback: types.CallbackQuery, db: DatabaseManager, state: FSMContext):
    await state.clear()
    equip_id = int(callback.data.split("_")[3])
    equip = await db.get_equipment(equip_id)
    if not equip: return await callback.answer("Техника не найдена!")

    text = (
        f"🚜 <b>УПРАВЛЕНИЕ МАШИНОЙ</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"<b>Название:</b> {equip['name']}\n"
        f"<b>Категория:</b> {equip['category']}\n"
        f"<b>Водитель:</b> {equip['driver_fio']}\n"
        f"<b>Статус:</b> {'🟢 Активна' if equip['is_active'] else '🔴 Отключена'}\n"
    )
    await callback.message.edit_text(text, reply_markup=kb.get_equip_edit_kb(equip_id, equip['is_active']),
                                     parse_mode="HTML")


# Изменение названия
@router.callback_query(F.data.startswith("eq_edit_name_"))
async def eq_edit_name(callback: types.CallbackQuery, state: FSMContext):
    eq_id = int(callback.data.split("_")[3])
    await state.update_data(edit_eq_id=eq_id)
    await callback.message.edit_text("Введите новое название для техники:", reply_markup=kb.get_cancel_admin_kb(eq_id))
    await state.set_state(AdminStates.wait_for_eq_name)


@router.message(AdminStates.wait_for_eq_name)
async def eq_save_name(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    await db.update_equipment(data['edit_eq_id'], name=message.text.strip())
    await message.answer("✅ Название обновлено!", reply_markup=kb.get_admin_main_kb())
    await state.clear()


# Изменение категории
@router.callback_query(F.data.startswith("eq_edit_cat_"))
async def eq_edit_cat(callback: types.CallbackQuery, state: FSMContext):
    eq_id = int(callback.data.split("_")[3])
    await state.update_data(edit_eq_id=eq_id)
    await callback.message.edit_text("Введите новую категорию:", reply_markup=kb.get_cancel_admin_kb(eq_id))
    await state.set_state(AdminStates.wait_for_eq_cat)


@router.message(AdminStates.wait_for_eq_cat)
async def eq_save_cat(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    await db.update_equipment(data['edit_eq_id'], category=message.text.strip())
    await message.answer("✅ Категория обновлена!", reply_markup=kb.get_admin_main_kb())
    await state.clear()


# Изменение водителя
@router.callback_query(F.data.startswith("eq_edit_driver_"))
async def eq_edit_driver(callback: types.CallbackQuery, state: FSMContext):
    eq_id = int(callback.data.split("_")[3])
    await state.update_data(edit_eq_id=eq_id)
    await callback.message.edit_text("Введите ФИО нового водителя:", reply_markup=kb.get_cancel_admin_kb(eq_id))
    await state.set_state(AdminStates.wait_for_eq_driver)


@router.message(AdminStates.wait_for_eq_driver)
async def eq_save_driver(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    await db.update_equipment(data['edit_eq_id'], driver_fio=message.text.strip())
    await message.answer("✅ Водитель обновлен!", reply_markup=kb.get_admin_main_kb())
    await state.clear()


# Вкл/Выкл статус и Удаление
@router.callback_query(F.data.startswith("eq_toggle_"))
async def eq_toggle(callback: types.CallbackQuery, db: DatabaseManager):
    eq_id = int(callback.data.split("_")[2])
    equip = await db.get_equipment(eq_id)
    new_status = 0 if equip['is_active'] else 1
    await db.toggle_equipment_status(eq_id, new_status)
    await admin_equip_edit_menu(callback, db, FSMContext(storage=callback.bot.storage,
                                                         key=callback.message.chat.id))  # перезагрузка меню


@router.callback_query(F.data.startswith("eq_delete_"))
async def eq_delete(callback: types.CallbackQuery, db: DatabaseManager):
    eq_id = int(callback.data.split("_")[2])
    await db.delete_equipment(eq_id)
    await callback.answer("Техника безвозвратно удалена!", show_alert=True)
    await admin_equip_list(callback, db)


# --- Управление пользователями (Заглушка) ---
@router.callback_query(F.data == "admin_users_list")
async def admin_users_list(callback: types.CallbackQuery, db: DatabaseManager):
    users = await db.get_all_users()
    builder = InlineKeyboardBuilder()
    for u in users:
        status = "🔴" if u['is_blacklisted'] else ("🟢" if u['is_active'] else "🟡")
        builder.button(text=f"{status} {u['fio']} ({u['role']})", callback_data=f"admin_user_edit_{u['user_id']}")
    builder.button(text="🔙 Назад", callback_data="admin_main")
    builder.adjust(1)
    await callback.message.edit_text("<b>Пользователи системы:</b>", reply_markup=builder.as_markup(),
                                     parse_mode="HTML")


@router.callback_query(F.data.startswith("admin_user_edit_"))
async def admin_user_edit(callback: types.CallbackQuery):
    await callback.answer("Управление пользователем в разработке", show_alert=True)