import os
import re
from aiogram import Router, F, types
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from keyboards.reply import get_main_menu_kb
from utils.states import AuthStates
from database.db_manager import DatabaseManager
from utils.notifications import notify_management

router = Router()


@router.message(CommandStart())
async def cmd_start(message: types.Message, state: FSMContext, db: DatabaseManager, role: str = None):
    args = message.text.split()

    if len(args) > 1 and args[1].startswith("reg_"):
        invite_code = args[1].replace("reg_", "")
        member = await db.get_member_by_invite(invite_code)

        if member:
            if member['tg_user_id']:
                return await message.answer("❌ Этот код уже был использован.")

            await db.register_member_tg(member['id'], message.from_user.id)

            # Логируем вход по инвайту
            team = await db.get_team(member['team_id'])
            await notify_management(message.bot,
                                    f"🔗 <b>Вход по ссылке:</b>\nФИО: {member['fio']}\nДолжность: {member['position']}\nБригада: {team['name']}")

            await message.answer(
                f"🎉 Добро пожаловать, <b>{member['fio']}</b>!\nВы успешно зарегистрированы в бригаде как <b>{member['position']}</b>.",
                parse_mode="HTML")
            return
        else:
            return await message.answer("❌ Неверный или просроченный код приглашения.")

    await state.clear()
    if role:
        return await message.answer(f"С возвращением!\nВаш статус: <b>{role}</b>", reply_markup=get_main_menu_kb(role),
                                    parse_mode="HTML")

    await message.answer("👋 Добро пожаловать в систему ВикСтрой!\nПожалуйста, введите пароль доступа:")
    await state.set_state(AuthStates.wait_for_password)


@router.message(AuthStates.wait_for_password)
async def process_password(message: types.Message, state: FSMContext, db: DatabaseManager):
    password = message.text.strip()
    user_id = message.from_user.id

    if password == os.getenv("FOREMAN_PASS", "1234"):
        await state.update_data(chosen_role="foreman")
    elif password == os.getenv("MODERATOR_PASS", "4321"):
        await state.update_data(chosen_role="moderator")
    elif str(user_id) in os.getenv("SUPERADMIN_IDS", "").split(","):
        await state.update_data(chosen_role="superadmin")
    elif str(user_id) in os.getenv("BOSS_IDS", "").split(","):
        await state.update_data(chosen_role="boss")
    elif str(user_id) in os.getenv("ADMIN_IDS", "").split(","):
        await state.update_data(chosen_role="admin")
    else:
        await db.increment_failed_attempts(user_id)
        user_data = await db.get_user(user_id)
        if user_data and user_data['failed_attempts'] >= 5:
            await db.toggle_user_status(user_id, 1)
            await message.answer("❌ Вы заблокированы за превышение попыток ввода пароля.")
            await state.clear()
            return
        return await message.answer("❌ Неверный пароль. Попробуйте еще раз.")

    await message.answer("✅ Пароль принят.\nПожалуйста, введите ваши Фамилию и Имя:")
    await state.set_state(AuthStates.wait_for_fio)


@router.message(AuthStates.wait_for_fio)
async def process_fio(message: types.Message, state: FSMContext, db: DatabaseManager):
    fio = message.text.strip()

    if not re.match(r"^[А-ЯЁа-яё\s-]+$", fio, re.IGNORECASE) or len(fio.split()) < 2:
        return await message.answer("❌ Введите корректные Фамилию и Имя (используйте только русские буквы):")

    data = await state.get_data()
    role = data.get("chosen_role", "foreman")

    await db.add_user(message.from_user.id, fio, role)

    # Логируем регистрацию
    await notify_management(message.bot, f"👤 <b>Новая регистрация:</b>\nФИО: {fio}\nРоль: {role}")

    await message.answer("🎉 Регистрация успешно завершена!\nИспользуйте меню ниже для работы:",
                         reply_markup=get_main_menu_kb(role))
    await state.clear()