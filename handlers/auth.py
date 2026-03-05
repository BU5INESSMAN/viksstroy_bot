import os
import re
from aiogram import Router, F, types
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from keyboards.reply import get_main_menu_kb
from utils.states import AuthStates
from database.db_manager import DatabaseManager
from utils.notifications import notify_bosses

router = Router()

ROLE_NAMES = {
    "superadmin": "👑 Супер-Админ",
    "boss": "👔 БОСС",
    "moderator": "🛡 Модератор",
    "foreman": "👷‍♂️ Прораб"
}


@router.message(CommandStart())
async def cmd_start(message: types.Message, state: FSMContext, db: DatabaseManager, role: str = None):
    args = message.text.split()

    if len(args) > 1 and args[1].startswith("reg_"):
        invite_code = args[1].replace("reg_", "")
        member = await db.get_member_by_invite(invite_code)

        if member:
            if member['tg_user_id']:
                return await message.answer("❌ <b>Ошибка:</b> Этот код уже был использован.")

            await db.register_member_tg(member['id'], message.from_user.id)

            team = await db.get_team(member['team_id'])
            team_name = team['name'] if team else "Неизвестная бригада"
            await notify_bosses(
                message.bot, db,
                f"👤 <b>Новая регистрация рабочего:</b>\n"
                f"├ ФИО: <code>{member['fio']}</code>\n"
                f"├ Бригада: <b>{team_name}</b>\n"
                f"└ Должность: <i>{member['position']}</i>"
            )

            await message.answer(
                f"🎉 <b>Добро пожаловать, {member['fio']}!</b>\n\n"
                f"✅ Вы успешно зарегистрированы в бригаде.\n"
                f"🛠 <b>Ваша должность:</b> <code>{member['position']}</code>\n\n"
                f"<i>Теперь вы будете получать уведомления о новых сменах прямо сюда.</i>",
                parse_mode="HTML"
            )
            return
        else:
            return await message.answer("❌ <b>Ошибка:</b> Неверный или просроченный код приглашения.")

    await state.clear()

    if role:
        display_role = ROLE_NAMES.get(role, f"👤 {role}")
        await message.answer(
            f"👋 <b>С возвращением в ВИКС Расписание!</b>\n\n"
            f"Ваш текущий статус: <b>{display_role}</b>\n\n"
            f"<i>👇 Используйте меню ниже для навигации.</i>",
            reply_markup=get_main_menu_kb(role),
            parse_mode="HTML"
        )
        return

    await message.answer(
        "👋 <b>Добро пожаловать в ВИКС Расписание!</b>\n\n"
        "🔐 <i>Пожалуйста, введите пароль доступа:</i>"
    )
    await state.set_state(AuthStates.wait_for_password)


@router.message(AuthStates.wait_for_password)
async def process_password(message: types.Message, state: FSMContext, db: DatabaseManager):
    password = message.text.strip()
    user_id = message.from_user.id

    if password == os.getenv("FOREMAN_PASS", "1234"):
        await state.update_data(chosen_role="foreman")
    elif password == os.getenv("MODERATOR_PASS", "4321"):
        await state.update_data(chosen_role="moderator")
    elif password == os.getenv("BOSS_PASS", "boss123"):
        await state.update_data(chosen_role="boss")
    elif password == os.getenv("SUPERADMIN_PASS", "super123"):
        await state.update_data(chosen_role="superadmin")
    elif str(user_id) in os.getenv("SUPER_ADMIN_IDS", "").split(","):
        await state.update_data(chosen_role="superadmin")
    else:
        await db.increment_failed_attempts(user_id)
        user_data = await db.get_user(user_id)
        if user_data and user_data['failed_attempts'] >= 5:
            await db.toggle_user_status(user_id, 1)
            await message.answer("❌ <b>Вы заблокированы</b> за превышение лимита попыток ввода пароля.")
            await state.clear()
            return
        return await message.answer("❌ <b>Неверный пароль.</b> Попробуйте еще раз.")

    await message.answer("✅ <b>Пароль принят.</b>\nПожалуйста, введите ваши Фамилию и Имя:")
    await state.set_state(AuthStates.wait_for_fio)


@router.message(AuthStates.wait_for_fio)
async def process_fio(message: types.Message, state: FSMContext, db: DatabaseManager):
    fio = message.text.strip()

    if not re.match(r"^[А-ЯЁа-яё\s-]+$", fio, re.IGNORECASE) or len(fio.split()) < 2:
        return await message.answer(
            "❌ <b>Ошибка:</b> Введите корректные Фамилию и Имя (используйте только русские буквы):")

    data = await state.get_data()
    role = data.get("chosen_role", "foreman")
    display_role = ROLE_NAMES.get(role, role)

    await db.add_user(message.from_user.id, fio, role)

    await notify_bosses(
        message.bot, db,
        f"🔐 <b>Авторизация по паролю:</b>\n"
        f"Пользователь <b>{fio}</b> вошел в систему на роль {display_role}."
    )

    await message.answer(
        f"🎉 <b>Регистрация успешно завершена!</b>\n\n"
        f"<i>Используйте кнопки внизу экрана для начала работы:</i>",
        reply_markup=get_main_menu_kb(role)
    )
    await state.clear()