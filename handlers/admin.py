from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database.db_manager import DatabaseManager
from keyboards import inline_factory as kb
from utils.callbacks import AppAction

router = Router()


class EquipAddStates(StatesGroup):
    wait_for_name = State()
    wait_for_category = State()
    wait_for_driver = State()


@router.message(Command("admin"))
@router.message(F.text == "🛠 Панель управления")
async def admin_panel_main(message: types.Message, role: str):
    if role != "admin":
        return
    await message.answer(
        "🛠 <b>Панель администратора</b>\nВыберите раздел для управления:",
        reply_markup=kb.get_admin_main_kb(),
        parse_mode="HTML"
    )


# --- Управление техникой (Главное меню) ---
@router.callback_query(F.data == "admin_equip_list")
async def admin_equip_list(callback: types.CallbackQuery, db: DatabaseManager):
    items = await db.get_all_equipment_admin()
    builder = InlineKeyboardBuilder()
    for item in items:
        status = "✅" if item['is_active'] else "❌"
        builder.button(text=f"{status} {item['name']}", callback_data=f"admin_equip_edit_{item['id']}")

    builder.button(text="➕ Добавить технику", callback_data="admin_equip_add")
    builder.button(text="🔙 Назад", callback_data="admin_main")
    builder.adjust(1)

    await callback.message.edit_text(
        "<b>Справочник техники</b>\nЗдесь можно добавить или отключить машины:",
        reply_markup=builder.as_markup(), parse_mode="HTML"
    )


# --- Добавление техники (Пошагово) ---
@router.callback_query(F.data == "admin_equip_add")
async def add_equip_start(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("🚜 <b>Шаг 1:</b> Введите название новой техники (например: Экскаватор JCB):",
                                     parse_mode="HTML")
    await state.set_state(EquipAddStates.wait_for_name)


@router.message(EquipAddStates.wait_for_name)
async def add_equip_step2(message: types.Message, state: FSMContext, db: DatabaseManager):
    await state.update_data(e_name=message.text.strip())

    existing_cats = await db.get_equipment_categories()
    if not existing_cats:
        existing_cats = ["Экскаваторы", "Грузовые", "Погрузчики"]

    await message.answer(
        "📁 <b>Шаг 2:</b> Выберите категорию техники или введите новую вручную:",
        reply_markup=kb.get_admin_categories_kb(existing_cats),
        parse_mode="HTML"
    )
    await state.set_state(EquipAddStates.wait_for_category)


@router.callback_query(AppAction.filter(F.step == "admin_set_cat"))
async def admin_set_category_btn(callback: types.CallbackQuery, callback_data: AppAction, state: FSMContext):
    await state.update_data(e_cat=callback_data.val)
    await callback.message.edit_text(
        "👤 <b>Шаг 3:</b> Введите ФИО водителя этой техники.\n(Если закрепленного водителя нет, напишите 'Нет')",
        parse_mode="HTML"
    )
    await state.set_state(EquipAddStates.wait_for_driver)


@router.message(EquipAddStates.wait_for_category)
async def add_equip_category_text(message: types.Message, state: FSMContext):
    await state.update_data(e_cat=message.text.strip())
    await message.answer(
        "👤 <b>Шаг 3:</b> Введите ФИО водителя этой техники.\n(Если закрепленного водителя нет, напишите 'Нет')",
        parse_mode="HTML"
    )
    await state.set_state(EquipAddStates.wait_for_driver)


@router.message(EquipAddStates.wait_for_driver)
async def add_equip_final(message: types.Message, state: FSMContext, db: DatabaseManager):
    driver = message.text.strip()

    if driver.lower() != 'нет' and len(driver.split()) < 2:
        await message.answer("❌ Пожалуйста, введите Фамилию и Имя водителя (или напишите 'Нет'):")
        return

    data = await state.get_data()
    await db.add_equipment(
        name=data['e_name'],
        category=data['e_cat'],
        driver_fio=driver
    )
    await state.clear()
    await message.answer(f"✅ Техника <b>{data['e_name']}</b> успешно добавлена в базу!", parse_mode="HTML")


# --- Управление пользователями ---
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


@router.callback_query(F.data == "admin_main")
async def admin_main_return(callback: types.CallbackQuery):
    await callback.message.edit_text(
        "🛠 <b>Панель администратора</b>\nВыберите раздел для управления:",
        reply_markup=kb.get_admin_main_kb(),
        parse_mode="HTML"
    )


# --- Заглушки для детального редактирования (чтобы не падали кнопки) ---
@router.callback_query(F.data.startswith("admin_equip_edit_"))
async def admin_equip_edit(callback: types.CallbackQuery):
    await callback.answer("Редактирование техники в разработке", show_alert=True)


@router.callback_query(F.data.startswith("admin_user_edit_"))
async def admin_user_edit(callback: types.CallbackQuery):
    await callback.answer("Редактирование пользователя в разработке", show_alert=True)