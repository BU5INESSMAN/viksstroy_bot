import os
import re
from aiogram import Router, F, types
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from keyboards.reply import get_main_menu_kb
from utils.states import AuthStates
from database.db_manager import DatabaseManager

router = Router()


@router.message(CommandStart())
async def cmd_start(message: types.Message, state: FSMContext, db: DatabaseManager, role: str = None):
    await state.clear()
    if role:
        await message.answer(
            f"С возвращением!\nВаш статус: <b>{role}</b>",
            reply_markup=get_main_menu_kb(role),
            parse_mode="HTML"
        )
        return

    # Если юзер новый - начинаем регистрацию
    await message.answer("👋 Добро пожаловать в систему ВикСтрой!\nПожалуйста, введите пароль доступа:")
    await state.set_state(AuthStates.wait_for_password)


@router.message(AuthStates.wait_for_password)
async def process_password(message: types.Message, state: FSMContext, db: DatabaseManager):
    password = message.text.strip()
    user_id = message.from_user.id

    # Проверка пароля на основе переменных окружения
    if password == os.getenv("FOREMAN_PASS", "1234"):
        await state.update_data(chosen_role="foreman")
    elif password == os.getenv("MODERATOR_PASS", "4321"):
        await state.update_data(chosen_role="moderator")
    elif str(user_id) in os.getenv("SUPER_ADMIN_IDS", "").split(","):
        # Если это админ зашел в первый раз
        await state.update_data(chosen_role="admin")
    else:
        await db.increment_failed_attempts(user_id)
        user_data = await db.get_user(user_id)
        if user_data and user_data['failed_attempts'] >= 5:
            await db.toggle_user_status(user_id, 1)
            await message.answer("❌ Вы заблокированы за превышение попыток ввода пароля.")
            await state.clear()
            return

        await message.answer("❌ Неверный пароль. Попробуйте еще раз.")
        return

    await message.answer("✅ Пароль принят.\nПожалуйста, введите ваши Фамилию и Имя:")
    await state.set_state(AuthStates.wait_for_fio)


@router.message(AuthStates.wait_for_fio)
async def process_fio(message: types.Message, state: FSMContext, db: DatabaseManager):
    fio = message.text.strip()

    # Проверка ФИО: только русские буквы, минимум 2 слова
    if not re.match(r"^[А-ЯЁа-яё\s-]+$", fio, re.IGNORECASE) or len(fio.split()) < 2:
        await message.answer("❌ Введите корректные Фамилию и Имя (используйте только русские буквы):")
        return

    data = await state.get_data()
    role = data.get("chosen_role", "foreman")

    await db.add_user(message.from_user.id, fio, role)
    await message.answer(
        "🎉 Регистрация успешно завершена!\nИспользуйте меню ниже для работы:",
        reply_markup=get_main_menu_kb(role)
    )
    await state.clear()