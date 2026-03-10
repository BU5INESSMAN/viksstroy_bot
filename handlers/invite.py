# handlers/invite.py
from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database.db_manager import DatabaseManager

router = Router()


class JoinTeamStates(StatesGroup):
    wait_for_worker_selection = State()
    wait_for_password = State()


@router.message(Command("start"), F.text.contains("team_"))
async def cmd_start_invite(message: types.Message, state: FSMContext, db: DatabaseManager):
    # Извлекаем код из команды (формат: /start team_КОД)
    args = message.text.split()
    if len(args) < 2 or not args[1].startswith("team_"):
        return

    invite_code = args[1].split("_")[1]
    team = await db.get_team_by_invite(invite_code)

    if not team:
        return await message.answer("❌ Эта ссылка-приглашение недействительна или устарела.")

    unclaimed = await db.get_unclaimed_workers(team['id'])
    if not unclaimed:
        return await message.answer(f"✅ В бригаде <b>«{team['name']}»</b> уже нет свободных мест для привязки.",
                                    parse_mode="HTML")

    # Сохраняем данные во временную память (FSM)
    await state.update_data(team_id=team['id'], invite_code=invite_code)

    builder = InlineKeyboardBuilder()
    for w in unclaimed:
        builder.button(text=f"{w['fio']} ({w['position']})", callback_data=f"join_worker_{w['id']}")
    builder.adjust(1)

    await message.answer(
        f"👋 Добро пожаловать!\nВас пригласили в бригаду <b>«{team['name']}»</b>.\n\n"
        "👇 <b>Пожалуйста, выберите свое имя из списка ниже:</b>",
        reply_markup=builder.as_markup(), parse_mode="HTML"
    )
    await state.set_state(JoinTeamStates.wait_for_worker_selection)


@router.callback_query(JoinTeamStates.wait_for_worker_selection, F.data.startswith("join_worker_"))
async def process_worker_selection(callback: types.CallbackQuery, state: FSMContext):
    worker_id = int(callback.data.split("_")[2])
    await state.update_data(selected_worker_id=worker_id)

    await callback.message.edit_text(
        "🔒 <b>Введите 6-значный пароль бригады</b>\n<i>(Его должен сообщить вам прораб):</i>", parse_mode="HTML")
    await state.set_state(JoinTeamStates.wait_for_password)


@router.message(JoinTeamStates.wait_for_password)
async def process_team_password(message: types.Message, state: FSMContext, db: DatabaseManager):
    data = await state.get_data()
    team = await db.get_team_by_invite(data['invite_code'])

    if message.text.strip() != team['join_password']:
        return await message.answer("❌ Неверный пароль! Попробуйте еще раз.")

    worker_id = data['selected_worker_id']
    tg_id = message.from_user.id

    # Привязываем слот к юзеру ТГ
    await db.claim_worker_slot(worker_id=worker_id, tg_id=tg_id, is_web_only=False)

    # Если юзера нет в главной таблице users, добавляем его как рабочего
    user = await db.get_user(tg_id)
    if not user:
        fio = message.from_user.full_name or f"Пользователь {tg_id}"
        await db.add_user(tg_id, fio, "worker")
    elif user['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
        # Если он был обычным юзером, даем ему права worker
        await db.update_user_role(tg_id, "worker")

    await state.clear()
    await message.answer(
        f"✅ <b>Поздравляем!</b>\n"
        f"Вы успешно привязали свой аккаунт к бригаде <b>«{team['name']}»</b>.\n\n"
        f"Теперь вы будете получать уведомления о новых нарядах сюда.",
        parse_mode="HTML"
    )