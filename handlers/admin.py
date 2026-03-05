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
async def admin_panel_main(message: types.Message, role: str = None):
    # Добавлено "= None" для защиты от неавторизованных нажатий
    if role not in ["moderator", "boss", "superadmin"]: return
    await message.answer(
        "🛠 <b>Панель управления | ВИКС Расписание</b>\n\n"
        "<i>Выберите раздел для управления справочниками:</i>",
        reply_markup=kb.get_admin_main_kb(), parse_mode="HTML"
    )


@router.callback_query(F.data == "admin_main")
async def admin_main_return(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text(
        "🛠 <b>Панель управления | ВИКС Расписание</b>\n\n"
        "<i>Выберите раздел для управления справочниками:</i>",
        reply_markup=kb.get_admin_main_kb(), parse_mode="HTML"
    )


@router.callback_query(F.data == "admin_stats")
async def show_statistics(callback: types.CallbackQuery, db: DatabaseManager):
    stats = await db.get_general_statistics()

    text = "📊 <b>ОБЩАЯ СТАТИСТИКА (СЕГОДНЯ):</b>\n━━━━━━━━━━━━━━━\n"
    text += f"📝 Всего заявок: <b>{stats.get('today_total', 0)}</b>\n"
    text += f"✅ Одобрено: <b>{stats.get('today_approved', 0)}</b>\n"
    text += f"❌ Отклонено: <b>{stats.get('today_rejected', 0)}</b>\n"
    text += f"⏳ Ожидают публикации: <b>{stats.get('waiting_publish', 0)}</b>\n━━━━━━━━━━━━━━━\n\n"

    text += "🏆 <b>ТОП-3 ТЕХНИКИ:</b>\n"
    for item in stats.get('top_equip', []):
        text += f"  ├ {item['name']} — {item['cnt']} выездов\n"

    text += "\n🏆 <b>ТОП-3 ПРОРАБОВ:</b>\n"
    for item in stats.get('top_foremen', []):
        text += f"  ├ {item['fio']} — {item['cnt']} заявок\n"

    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Назад", callback_data="admin_main")
    await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="HTML")


@router.callback_query(F.data == "admin_equip_list")
async def admin_equip_list(callback: types.CallbackQuery, db: DatabaseManager):
    items = await db.get_all_equipment_admin()
    builder = InlineKeyboardBuilder()
    for item in items:
        status = "🟢" if item['is_active'] else "🔴"
        builder.button(text=f"{status} {item['name']} ({item['category']})", callback_data=f"eq_edit_{item['id']}")

    builder.button(text="➕ Добавить одну единицу", callback_data="eq_add_single")
    builder.button(text="🔙 Назад", callback_data="admin_main")
    builder.adjust(1)

    await callback.message.edit_text("🚜 <b>Управление техникой</b>\nВыберите машину из списка:",
                                     reply_markup=builder.as_markup(), parse_mode="HTML")


@router.callback_query(F.data == "eq_add_single")
async def eq_add_start(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Введите название техники (например: <i>Экскаватор JCB</i>):", parse_mode="HTML")
    await state.set_state(AdminStates.wait_for_eq_name)


@router.message(AdminStates.wait_for_eq_name)
async def eq_add_name(message: types.Message, state: FSMContext):
    await state.update_data(eq_name=message.text.strip())
    await message.answer("Введите категорию (например: <i>Спецтехника, Самосвалы</i>):", parse_mode="HTML")
    await state.set_state(AdminStates.wait_for_eq_cat)


@router.message(AdminStates.wait_for_eq_cat)
async def eq_add_cat(message: types.Message, state: FSMContext):
    await state.update_data(eq_cat=message.text.strip())
    await message.answer("Введите ФИО водителя (или напишите 'Нет'):", parse_mode="HTML")
    await state.set_state(AdminStates.wait_for_eq_driver)


@router.message(AdminStates.wait_for_eq_driver)
async def eq_add_driver(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    driver = message.text.strip()
    await db.add_equipment(data['eq_name'], data['eq_cat'], driver)
    await state.clear()
    await message.answer("✅ <b>Техника успешно добавлена!</b>", reply_markup=kb.get_admin_main_kb(), parse_mode="HTML")


@router.callback_query(F.data == "admin_bulk_equip")
async def admin_bulk_equip_start(callback: types.CallbackQuery, state: FSMContext):
    text = (
        "📥 <b>Массовое добавление техники</b>\n\n"
        "Отправьте мне список машин в следующем формате (каждая с новой строки):\n\n"
        "<code>Категория | Название | ФИО водителя</code>\n\n"
        "<i>Пример:</i>\n"
        "Самосвалы | КАМАЗ 65115 | Иванов И.И.\n"
        "Спецтехника | Кран Ивановец | Петров П.П.\n\n"
        "Для отмены отправьте команду /cancel"
    )
    await callback.message.edit_text(text, parse_mode="HTML")
    await state.set_state(AdminStates.wait_for_bulk_equip)


@router.message(AdminStates.wait_for_bulk_equip)
async def process_bulk_equip(message: types.Message, state: FSMContext, db: DatabaseManager):
    if message.text.lower() == '/cancel':
        await state.clear()
        return await message.answer("Действие отменено.", reply_markup=kb.get_admin_main_kb())

    lines = message.text.strip().split('\n')
    to_insert = []
    errors = []

    for i, line in enumerate(lines, 1):
        if not line.strip(): continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 2:
            category, name = parts[0], parts[1]
            driver = parts[2] if len(parts) > 2 else "Не указан"
            to_insert.append((name, category, driver, 1))
        else:
            errors.append(f"Строка {i}: неверный формат ({line})")

    if to_insert:
        await db.add_equipment_bulk(to_insert)

    text = f"✅ <b>Успешно добавлено {len(to_insert)} единиц техники.</b>"
    if errors: text += "\n\n⚠️ <b>Ошибки при распознавании:</b>\n" + "\n".join(errors)
    await message.answer(text, parse_mode="HTML", reply_markup=kb.get_admin_main_kb())
    await state.clear()


@router.callback_query(F.data.startswith("eq_edit_"))
async def admin_equip_edit_menu(callback: types.CallbackQuery, db: DatabaseManager, state: FSMContext = None):
    parts = callback.data.split("_")
    if len(parts) == 3 and parts[2].isdigit():
        eq_id = int(parts[2])
    else:
        return

    item = await db.get_equipment(eq_id)
    if not item: return await callback.answer("Техника не найдена", show_alert=True)

    status = "🟢 Активна" if item['is_active'] else "🔴 Отключена"
    text = (
        f"🚜 <b>Машина:</b> {item['name']}\n"
        f"📂 <b>Категория:</b> {item['category']}\n"
        f"👨‍✈️ <b>Водитель:</b> {item['driver_fio']}\n"
        f"⚙️ <b>Статус:</b> {status}\n\n"
        f"<i>Выберите, что хотите изменить:</i>"
    )
    await callback.message.edit_text(text, reply_markup=kb.get_equip_edit_kb(eq_id, item['is_active']),
                                     parse_mode="HTML")


@router.callback_query(F.data.startswith("eq_toggle_"))
async def eq_toggle_status(callback: types.CallbackQuery, db: DatabaseManager):
    eq_id = int(callback.data.split("_")[2])
    item = await db.get_equipment(eq_id)
    new_status = 0 if item['is_active'] else 1
    await db.toggle_equipment_status(eq_id, new_status)
    await admin_equip_edit_menu(callback, db, FSMContext(storage=callback.bot.storage, key=callback.message.chat.id))


@router.callback_query(F.data.startswith("eq_delete_"))
async def eq_delete(callback: types.CallbackQuery, db: DatabaseManager):
    eq_id = int(callback.data.split("_")[2])
    await db.delete_equipment(eq_id)
    await callback.answer("Техника безвозвратно удалена!", show_alert=True)
    await admin_equip_list(callback, db)


@router.callback_query(F.data == "admin_users_list")
async def admin_users_list(callback: types.CallbackQuery, db: DatabaseManager):
    users = await db.get_all_users()
    builder = InlineKeyboardBuilder()
    for u in users:
        status = "🔴" if u['is_blacklisted'] else ("🟢" if u['is_active'] else "🟡")
        builder.button(text=f"{status} {u['fio']} ({u['role']})", callback_data=f"admin_user_edit_{u['user_id']}")
    builder.button(text="🔙 Назад", callback_data="admin_main")
    builder.adjust(1)
    await callback.message.edit_text(
        "👥 <b>Управление пользователями</b>\n\n🟢 - Активен\n🟡 - Не завершил регистрацию\n🔴 - Заблокирован",
        reply_markup=builder.as_markup(), parse_mode="HTML")


@router.callback_query(F.data.startswith("admin_user_edit_"))
async def admin_user_edit(callback: types.CallbackQuery, db: DatabaseManager):
    user_id = int(callback.data.split("_")[3])
    user = await db.get_user(user_id)
    if not user: return await callback.answer("Пользователь не найден", show_alert=True)

    text = (
        f"👤 <b>ФИО:</b> {user['fio']}\n"
        f"🛠 <b>Роль:</b> {user['role']}\n"
        f"ID: <code>{user['user_id']}</code>\n\n"
        f"<i>Выберите действие:</i>"
    )

    builder = InlineKeyboardBuilder()
    builder.button(text="👑 Сделать Суперадмином", callback_data=f"admin_role_{user_id}_superadmin")
    builder.button(text="👔 Сделать Боссом", callback_data=f"admin_role_{user_id}_boss")
    builder.button(text="🛡 Сделать Модератором", callback_data=f"admin_role_{user_id}_moderator")
    builder.button(text="👷‍♂️ Сделать Прорабом", callback_data=f"admin_role_{user_id}_foreman")

    if user['is_blacklisted']:
        builder.button(text="🟢 Разблокировать", callback_data=f"admin_ban_{user_id}_0")
    else:
        builder.button(text="🔴 Заблокировать", callback_data=f"admin_ban_{user_id}_1")

    builder.button(text="🔙 Назад", callback_data="admin_users_list")
    builder.adjust(1)
    await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="HTML")


@router.callback_query(F.data.startswith("admin_role_"))
async def admin_change_role(callback: types.CallbackQuery, db: DatabaseManager):
    parts = callback.data.split("_")
    user_id = int(parts[2])
    new_role = parts[3]
    await db.update_user_role(user_id, new_role)
    await callback.answer(f"Роль изменена на {new_role}!", show_alert=True)
    await admin_user_edit(callback, db)


@router.callback_query(F.data.startswith("admin_ban_"))
async def admin_change_ban(callback: types.CallbackQuery, db: DatabaseManager):
    parts = callback.data.split("_")
    user_id = int(parts[2])
    ban_status = int(parts[3])
    await db.toggle_user_status(user_id, ban_status)
    action = "заблокирован" if ban_status else "разблокирован"
    await callback.answer(f"Пользователь {action}!", show_alert=True)
    await admin_user_edit(callback, db)