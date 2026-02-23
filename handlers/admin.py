from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db_manager import DatabaseManager
from aiogram.utils.keyboard import InlineKeyboardBuilder

from keyboards.inline_factory import get_admin_main_kb

router = Router()


class AdminStates(StatesGroup):
    wait_for_equip_name = State()
    wait_for_equip_cat = State()
    wait_for_equip_driver = State()


# --- МЕНЮ СУПЕРАДМИНА ---

@router.message(Command("admin"))
async def admin_panel(message: types.Message, role: str):
    if role != "admin":
        return  # Обычные пользователи даже не узнают о команде

    builder = InlineKeyboardBuilder()
    builder.button(text="🚜 Добавить технику", callback_data="admin_add_equip")
    builder.button(text="🔓 Разблокировать юзера", callback_data="admin_unban_list")
    builder.button(text="📊 Список всех юзеров", callback_data="admin_users_list")
    builder.adjust(1)

    await message.answer("🛠 <b>Панель администратора</b>", reply_markup=builder.as_markup())


# --- УПРАВЛЕНИЕ ТЕХНИКОЙ ---

@router.callback_query(F.data == "admin_add_equip")
async def add_equip_start(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.answer("Введите название техники (например: Экскаватор JCB 4CX):")
    await state.set_state(AdminStates.wait_for_equip_name)


@router.message(AdminStates.wait_for_equip_name)
async def add_equip_name(message: types.Message, state: FSMContext):
    await state.update_data(e_name=message.text.strip())
    await message.answer("Введите категорию (например: Экскаваторы, Краны, Самосвалы):")
    await state.set_state(AdminStates.wait_for_equip_cat)


@router.message(AdminStates.wait_for_equip_cat)
async def add_equip_cat(message: types.Message, state: FSMContext):
    await state.update_data(e_cat=message.text.strip())
    await message.answer("Введите ФИО водителя этой техники:")
    await state.set_state(AdminStates.wait_for_equip_driver)


@router.message(AdminStates.wait_for_equip_driver)
async def add_equip_finish(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    driver = message.text.strip()

    async with db as conn:
        await conn.execute(
            "INSERT INTO equipment (name, category, driver_fio) VALUES (?, ?, ?)",
            (data['e_name'], data['e_cat'], driver)
        )
        await conn.commit()

    await state.clear()
    await message.answer(f"✅ Техника <b>{data['e_name']}</b> успешно добавлена в справочник.")


# --- УПРАВЛЕНИЕ БАНАМИ ---

@router.callback_query(F.data == "admin_unban_list")
async def unban_list(callback: types.CallbackQuery, db: DatabaseManager):
    async with db as conn:
        async with conn.execute("SELECT user_id, fio FROM users WHERE is_blacklisted = 1") as cursor:
            banned = await cursor.fetchall()

    if not banned:
        await callback.answer("Заблокированных пользователей нет", show_alert=True)
        return

    builder = InlineKeyboardBuilder()
    for user in banned:
        builder.button(text=f"🔓 {user['fio']}", callback_data=f"unban_{user['user_id']}")
    builder.adjust(1)

    await callback.message.edit_text("Выберите пользователя для разблокировки:", reply_markup=builder.as_markup())


@router.callback_query(F.data.startswith("unban_"))
async def unban_user(callback: types.CallbackQuery, db: DatabaseManager):
    user_id = int(callback.data.split("_")[1])
    async with db as conn:
        await conn.execute(
            "UPDATE users SET is_blacklisted = 0, failed_attempts = 0 WHERE user_id = ?",
            (user_id,)
        )
        await conn.commit()

    await callback.answer("Пользователь разблокирован")
    await callback.message.delete()


# 1. Отображение списка всех пользователей
@router.callback_query(F.data == "admin_users_list")
async def show_all_users(callback: types.CallbackQuery, db: DatabaseManager):
    users = await db.get_all_users()
    if not users:
        await callback.answer("Пользователей пока нет.")
        return

    text = "👥 <b>Список всех пользователей:</b>\n\n"
    builder = InlineKeyboardBuilder()

    for u in users:
        status_icon = "🔴" if u['is_blacklisted'] else "🟢"
        role_map = {"admin": "Адм", "moderator": "Мод", "foreman": "Прораб"}

        # Текст для списка
        text += f"{status_icon} {u['fio']} ({role_map.get(u['role'], 'Х')})\n"

        # Кнопка для управления конкретным юзером
        builder.button(
            text=f"Упр. {u['fio'].split()[0]}",
            callback_data=f"adm_manage_{u['user_id']}"
        )

    builder.adjust(2)
    await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="HTML")


# 2. Меню управления конкретным пользователем
@router.callback_query(F.data.startswith("adm_manage_"))
async def manage_user_card(callback: types.CallbackQuery, db: DatabaseManager):
    user_id = int(callback.data.split("_")[2])

    # Получаем актуальную информацию о юзере
    async with db as conn:
        async with conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cursor:
            user = await cursor.fetchone()

    if not user:
        await callback.answer("Пользователь не найден.")
        return

    status = "🚫 ЗАБЛОКИРОВАН" if user['is_blacklisted'] else "✅ АКТИВЕН"
    text = (
        f"👤 <b>Карточка пользователя</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"ID: <code>{user['user_id']}</code>\n"
        f"ФИО: {user['fio']}\n"
        f"Роль: {user['role']}\n"
        f"Статус: {status}\n"
        f"━━━━━━━━━━━━━━━"
    )

    builder = InlineKeyboardBuilder()
    if user['is_blacklisted']:
        builder.button(text="🔓 Разблокировать", callback_data=f"adm_set_status_{user_id}_0")
    else:
        builder.button(text="🔒 Заблокировать", callback_data=f"adm_set_status_{user_id}_1")

    builder.button(text="⬅️ Назад к списку", callback_data="admin_users_list")
    builder.adjust(1)

    await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="HTML")


# 3. Применение блокировки/разблокировки
@router.callback_query(F.data.startswith("adm_set_status_"))
async def apply_user_status(callback: types.CallbackQuery, db: DatabaseManager):
    _, _, _, user_id, new_status = callback.data.split("_")

    await db.toggle_user_status(int(user_id), int(new_status))
    await callback.answer("Статус изменен")

    # Возвращаемся в карточку пользователя для обновления вида
    callback.data = f"adm_manage_{user_id}"
    await manage_user_card(callback, db)


@router.callback_query(F.data == "admin_equip_list")
async def admin_equip_main(callback: types.CallbackQuery, db: DatabaseManager):
    """Просмотр категорий техники для админа"""
    cats = await db.get_equipment_categories()
    builder = InlineKeyboardBuilder()

    for cat in cats:
        builder.button(text=f"📁 {cat}", callback_data=f"adm_cat_{cat}")

    builder.button(text="➕ Добавить новую технику", callback_data="adm_add_equip_start")
    builder.button(text="⬅️ Назад", callback_data="admin_main")
    builder.adjust(1)

    await callback.message.edit_text("🚜 <b>Управление техникой</b>\nВыберите категорию или добавьте новую:",
                                     parse_mode="HTML", reply_markup=builder.as_markup())


# Состояния для добавления техники
class EquipAddStates(StatesGroup):
    wait_for_name = State()
    wait_for_category = State()
    wait_for_driver = State()


@router.callback_query(F.data == "adm_add_equip_start")
async def add_equip_step1(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.answer("Введите название техники (например, Экскаватор JCB):")
    await state.set_state(EquipAddStates.wait_for_name)
    await callback.answer()


# Состояния для добавления техники
class EquipAddStates(StatesGroup):
    wait_for_name = State()
    wait_for_category = State()
    wait_for_driver = State()


# --- 1. Начало процесса ---
@router.callback_query(F.data == "adm_add_equip_start")
async def add_equip_step1(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.answer("🚜 <b>Шаг 1:</b> Введите название техники\n(например: <i>Экскаватор JCB 3CX</i>)",
                                  parse_mode="HTML")
    await state.set_state(EquipAddStates.wait_for_name)
    await callback.answer()


# --- 2. Получение названия ---
@router.message(EquipAddStates.wait_for_name)
async def add_equip_step2(message: types.Message, state: FSMContext):
    await state.update_data(e_name=message.text.strip())
    await message.answer(
        "📁 <b>Шаг 2:</b> Введите категорию техники\n(например: <i>Экскаваторы</i> или <i>Самосвалы</i>)",
        parse_mode="HTML")
    await state.set_state(EquipAddStates.wait_for_category)


# --- 3. Получение категории ---
@router.message(EquipAddStates.wait_for_category)
async def add_equip_step3(message: types.Message, state: FSMContext):
    await state.update_data(e_cat=message.text.strip())
    await message.answer("👤 <b>Шаг 3:</b> Введите ФИО водителя\n(если водителя нет, напишите 'Нет')", parse_mode="HTML")
    await state.set_state(EquipAddStates.wait_for_driver)


# --- 4. Финал и сохранение ---
@router.message(EquipAddStates.wait_for_driver)
async def add_equip_final(message: types.Message, state: FSMContext, db: DatabaseManager):
    driver = message.text.strip()
    data = await state.get_data()

    # Сохраняем в базу
    await db.add_equipment(
        name=data['e_name'],
        category=data['e_cat'],
        driver_fio=driver
    )

    await state.clear()
    await message.answer(
        f"✅ <b>Техника добавлена!</b>\n\n"
        f"🚜 Название: {data['e_name']}\n"
        f"📁 Категория: {data['e_cat']}\n"
        f"👤 Водитель: {driver}",
        parse_mode="HTML"
    )

    # Возвращаем админ-меню
    await message.answer("Выберите следующее действие:", reply_markup=get_admin_main_kb())


# Возврат в главное меню админа (для кнопок "Назад")
@router.callback_query(F.data == "admin_main")
async def back_to_admin_main(callback: types.CallbackQuery):
    await callback.message.edit_text("🛠 <b>Панель управления администратора</b>",
                                     reply_markup=get_admin_main_kb(),
                                     parse_mode="HTML")