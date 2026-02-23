# viksstroy_bot/handlers/auth.py
import os
from aiogram import Router, F, types
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from utils.states import AuthStates
from database.db_manager import DatabaseManager
from keyboards.reply import get_main_menu_kb  # Импортируем созданное меню

router = Router()


@router.message(CommandStart())
async def cmd_start(message: types.Message, state: FSMContext, db: DatabaseManager, role: str = None):
    """Точка входа: проверка DeepLink или отображение меню для авторизованных"""
    await state.clear()

    # 1. Если Middleware уже определил роль (вы уже в базе или в SUPER_ADMIN_IDS)
    if role:
        role_names = {
            "admin": "Администратор",
            "moderator": "Модератор",
            "foreman": "Прораб"
        }
        await message.answer(
            f"С возвращением, <b>{message.from_user.full_name}</b>!\n"
            f"Ваш статус: <b>{role_names.get(role, role)}</b>",
            reply_markup=get_main_menu_kb(role),  # ВЫДАЕМ МЕНЮ
            parse_mode="HTML"
        )
        return

    # 2. Проверка на DeepLink (регистрация сотрудника по ссылке)
    args = message.text.split()
    if len(args) > 1:
        invite_code = args[1]
        invite_data = await db.check_invite_code(invite_code)

        if invite_data:
            await db.activate_by_invite(message.from_user.id, invite_code)
            # После активации по ссылке роль обычно 'foreman' или 'worker'
            # Предположим, по умолчанию даем права прораба для доступа к меню
            current_role = "foreman"
            await message.answer(
                f"✅ Авторизация успешна!\n"
                f"Вы зарегистрированы как: <b>{invite_data['fio']}</b>",
                reply_markup=get_main_menu_kb(current_role),  # ВЫДАЕМ МЕНЮ
                parse_mode="HTML"
            )
            return
        else:
            await message.answer("❌ Ссылка недействительна или уже была использована.")

    # 3. Если пользователь новый и без ссылки — запрашиваем пароль
    await message.answer(
        "Добро пожаловать в систему <b>ВикСтрой</b>!\n"
        "Для доступа введите пароль:",
        parse_mode="HTML"
    )
    await state.set_state(AuthStates.wait_for_password)


@router.message(AuthStates.wait_for_password)
async def process_password(message: types.Message, state: FSMContext, db: DatabaseManager):
    """Проверка пароля и начисление штрафных баллов"""
    password = message.text.strip()

    mod_pass = os.getenv("MODERATOR_PASSWORD")
    for_pass = os.getenv("FOREMAN_PASSWORD")

    chosen_role = None
    if password == mod_pass:
        chosen_role = "moderator"
    elif password == for_pass:
        chosen_role = "foreman"

    if chosen_role:
        await state.update_data(chosen_role=chosen_role)
        await message.answer("✅ Пароль принят! Теперь введите ваше ФИО для регистрации:")
        await state.set_state(AuthStates.wait_for_fio)
    else:
        # Логика блокировки при 3 ошибках
        await db.increment_failed_attempts(message.from_user.id)
        user_info = await db.get_user(message.from_user.id)
        attempts = user_info['failed_attempts'] if user_info else 1

        if attempts >= 3:
            await message.answer("❌ <b>Доступ заблокирован.</b>\nВы ввели неверный пароль 3 раза.", parse_mode="HTML")
            await state.clear()
        else:
            await message.answer(f"⚠️ Неверный пароль! Осталось попыток: {3 - attempts}")


@router.message(AuthStates.wait_for_fio)
async def process_fio(message: types.Message, state: FSMContext, db: DatabaseManager):
    """Завершение регистрации и выдача меню"""
    fio = message.text.strip()
    if len(fio.split()) < 2:
        await message.answer("Пожалуйста, введите имя и фамилию:")
        return

    data = await state.get_data()
    role = data.get("chosen_role")

    # Сохраняем в базу
    await db.register_by_password(message.from_user.id, fio, role)
    await state.clear()

    await message.answer(
        f"🎉 Регистрация завершена!\n"
        f"<b>{fio}</b>, добро пожаловать в систему.",
        reply_markup=get_main_menu_kb(role),  # ВЫДАЕМ МЕНЮ
        parse_mode="HTML"
    )