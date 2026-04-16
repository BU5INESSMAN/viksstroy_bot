import asyncio
import logging
import os
import shutil
import aiohttp
import random
import time
from datetime import datetime, timedelta
from aiogram import Bot, Dispatcher, types, F
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.db_manager import DatabaseManager

current_dir = os.path.dirname(os.path.abspath(__file__))
web_dir = os.path.join(current_dir, "web")
sys.path.append(web_dir)

from database_deps import db, TZ_BARNAUL
from services.notifications import notify_users, notify_fio_match
from services.bot_commands import format_commands_message, warn_missing_commands
load_dotenv()

API_URL = os.getenv("API_URL", "http://api:8000")

os.makedirs("data", exist_ok=True)
_log_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s")
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_log_formatter)
_file_handler = logging.FileHandler(os.path.join("data", "server.log"), encoding="utf-8")
_file_handler.setFormatter(_log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[_console_handler, _file_handler])
logger = logging.getLogger(__name__)

dp = Dispatcher()
db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

WEB_APP_URL = "https://miniapp.viks22.ru"

# Stage 3 — commands actually registered in this bot. Pruned after audit
# (see web/services/bot_commands.py for the intended map). Commands in the
# intended map but absent here are silently omitted from the /start and
# fallback-handler output; a warning is logged at startup.
TG_AVAILABLE_COMMANDS = {"/start", "/order", "/schedule"}


async def _resolve_user_role_tg(tg_id: int) -> str:
    real_id = await resolve_id(tg_id)
    user = await db.get_user(real_id)
    if not user:
        return "driver"
    return dict(user).get("role") or "driver"


class Socks5Session(AiohttpSession):
    def __init__(self, proxy_url: str):
        super().__init__()
        self.proxy_url = proxy_url

    async def create_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            from aiohttp_socks import ProxyConnector
            connector = ProxyConnector.from_url(self.proxy_url)
            self._session = aiohttp.ClientSession(connector=connector)
        return self._session


class RegState(StatesGroup):
    waiting_for_password = State()
    waiting_for_fio = State()


def get_webapp_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📱 Открыть платформу", web_app=WebAppInfo(url=f"{WEB_APP_URL}/tma"))]]
    )


async def resolve_id(raw_id: int):
    async with db.conn.execute("SELECT primary_id FROM account_links WHERE secondary_id = ?", (raw_id,)) as cur:
        row = await cur.fetchone()
        if row: return row[0]
    return raw_id


@dp.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject, state: FSMContext):
    # ОБРАБОТКА ДИПЛИНКОВ TELEGRAM
    args = command.args
    if args:
        if args.startswith("invite_"):
            code = args.split('_')[1]
            url = f"{WEB_APP_URL}/invite/{code}"
            kb = InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text="Вступить в бригаду", web_app=WebAppInfo(url=url))]])
            return await message.answer(
                "Вам пришло приглашение в бригаду. Нажмите на кнопку ниже, чтобы выбрать свой профиль:",
                reply_markup=kb)
        elif args.startswith("equip_"):
            code = args.split('_')[1]
            url = f"{WEB_APP_URL}/equip-invite/{code}"
            kb = InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text="Привязать технику", web_app=WebAppInfo(url=url))]])
            return await message.answer(
                "Привязка техники. Нажмите на кнопку ниже, чтобы закрепить технику за вашим аккаунтом:",
                reply_markup=kb)

    raw_id = message.from_user.id
    tg_id = await resolve_id(raw_id)
    user = await db.get_user(tg_id)

    if user:
        if dict(user).get('is_blacklisted'):
            await message.answer("❌ Ваш аккаунт заблокирован. Обратитесь к руководству.")
            return
        await state.clear()
        await message.answer(
            f"С возвращением, <b>{dict(user)['fio']}</b>!\n\nИспользуйте кнопку ниже для запуска платформы:",
            reply_markup=get_webapp_keyboard(), parse_mode="html")
        # Stage 3: append role-aware command list
        role = await _resolve_user_role_tg(raw_id)
        await message.answer(format_commands_message(role, TG_AVAILABLE_COMMANDS))
    else:
        await state.set_state(RegState.waiting_for_password)
        await message.answer(
            "🔐 <b>Добро пожаловать в ВиКС!</b>\n\nЯ не нашел вас в базе данных.\nПожалуйста, введите ваш <b>системный пароль</b> или <b>6-значный код привязки</b> (если аккаунт уже есть в MAX):",
            parse_mode="html")


@dp.message(Command("web"))
async def cmd_web(message: types.Message):
    raw_id = message.from_user.id
    tg_id = await resolve_id(raw_id)
    user = await db.get_user(tg_id)
    if not user:
        return await message.answer("❌ Сначала зарегистрируйтесь (команда /start).")

    code = str(random.randint(100000, 999999))
    expires = time.time() + 900  # 15 min
    await db.conn.execute("INSERT INTO link_codes (code, user_id, expires) VALUES (?, ?, ?)", (code, tg_id, expires))
    await db.conn.commit()
    fio = dict(user).get('fio', '') if user else ''
    await db.add_log(tg_id, fio, "Запросил код авторизации", target_type='system')
    await message.answer(
        f"Ваш код для привязки аккаунта: <code>{code}</code>\nДействителен 15 минут. Введите его в другом мессенджере или в профиле платформы.",
        parse_mode="html")


@dp.message(Command("schedule"))
async def cmd_schedule(message: types.Message, command: CommandObject):
    raw_id = message.from_user.id
    tg_id = await resolve_id(raw_id)
    user = await db.get_user(tg_id)
    if not user:
        return await message.answer("❌ Сначала зарегистрируйтесь (команда /start).")

    user_role = dict(user).get('role', '')
    if user_role not in ['moderator', 'boss', 'superadmin']:
        return await message.answer("❌ Эта команда доступна только модераторам и руководству.")

    # Определяем дату: аргумент "today" или по умолчанию "tomorrow"
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("Asia/Barnaul")
    args = command.args
    if args and args.strip().lower() in ['today', 'сегодня']:
        target_date = datetime.now(tz).strftime("%Y-%m-%d")
        label = "сегодня"
    else:
        target_date = (datetime.now(tz) + timedelta(days=1)).strftime("%Y-%m-%d")
        label = "завтра"

    fio = dict(user).get('fio', '') if user else ''
    await db.add_log(tg_id, fio, f"Запросил расстановку через бота на {target_date}", target_type='system')
    await message.answer(f"⏳ Генерирую расстановку на {label} ({target_date})...")

    try:
        # Импортируем генератор через API-вызов
        async with aiohttp.ClientSession() as session:
            fd = aiohttp.FormData()
            fd.add_field('tg_id', str(tg_id))
            fd.add_field('target_date', target_date)
            async with session.post(f"{API_URL}/api/applications/publish_schedule", data=fd) as resp:
                if resp.status == 200:
                    await message.answer(f"✅ Расстановка на {target_date} опубликована в групповой чат!")
                else:
                    error = await resp.json()
                    await message.answer(f"❌ Ошибка: {error.get('detail', 'Неизвестная ошибка')}")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {str(e)}")


@dp.message(Command("join"))
async def cmd_join(message: types.Message, command: CommandObject):
    raw_id = message.from_user.id
    tg_id = await resolve_id(raw_id)

    code = command.args.strip() if command.args else ""
    if not code:
        return await message.answer("❌ Укажите код приглашения. Пример: /join 123456")

    # 1. Проверяем, код от бригады?
    async with db.conn.execute("SELECT id, name FROM teams WHERE invite_code = ? OR join_password = ?",
                               (code, code)) as cur:
        t_row = await cur.fetchone()

    if t_row:
        team_id, team_name = t_row
        unclaimed = await db.get_unclaimed_workers(team_id)

        if not unclaimed:
            return await message.answer(
                f"В бригаде «{team_name}» нет свободных мест или все участники уже привязали аккаунты.")

        buttons = []
        for w in unclaimed:
            buttons.append([InlineKeyboardButton(
                text=f"👤 {w['fio']} ({w['position']})",
                callback_data=f"team_ask|{w['id']}|{code}")])
        kb = InlineKeyboardMarkup(inline_keyboard=buttons)
        return await message.answer(
            f"👷‍♂️ Бригада: {team_name}\n\nВыберите ваш профиль из списка ниже:",
            reply_markup=kb)

    # 2. Проверяем, код от техники?
    async with db.conn.execute("SELECT id, name FROM equipment WHERE invite_code = ?", (code,)) as cur:
        e_row = await cur.fetchone()

    if e_row:
        equip_id, equip_name = e_row
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Да, это я", callback_data=f"equip_yes|{equip_id}|{code}")],
            [InlineKeyboardButton(text="❌ Отмена", callback_data="join_cancel")]
        ])
        return await message.answer(
            f"🚜 Привязка техники\nМашина: {equip_name}\n\nПодтверждаете привязку вашего аккаунта?",
            reply_markup=kb)

    await message.answer("❌ Неверный код приглашения. Проверьте правильность ввода.")


@dp.callback_query(F.data.startswith("team_ask|"))
async def handle_team_ask(callback: types.CallbackQuery):
    parts = callback.data.split("|")
    if len(parts) != 3:
        return await callback.answer("Ошибка данных", show_alert=True)
    _, worker_id, code = parts

    async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
        w_row = await cur.fetchone()
    if not w_row:
        return await callback.answer("❌ Профиль не найден.", show_alert=True)

    fio = w_row[0]
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Да, привязать", callback_data=f"team_yes|{worker_id}|{code}")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="join_cancel")]
    ])
    await callback.message.edit_text(f"Привязать ваш мессенджер к профилю:\n👤 {fio}?", reply_markup=kb)
    await callback.answer()


@dp.callback_query(F.data.startswith("team_yes|"))
async def handle_team_yes(callback: types.CallbackQuery):
    parts = callback.data.split("|")
    if len(parts) != 3:
        return await callback.answer("Ошибка данных", show_alert=True)
    _, worker_id, code = parts

    raw_id = callback.from_user.id
    tg_id = await resolve_id(raw_id)

    async with db.conn.execute("SELECT name FROM teams WHERE invite_code = ? OR join_password = ?",
                               (code, code)) as cur:
        t_row = await cur.fetchone()
    async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
        w_row = await cur.fetchone()

    if not t_row or not w_row:
        return await callback.answer("❌ Данные не найдены.", show_alert=True)

    team_name, fio = t_row[0], w_row[0]

    await db.conn.execute("UPDATE team_members SET tg_user_id = ? WHERE id = ?", (tg_id, worker_id))

    user = await db.get_user(tg_id)
    if not user:
        await db.add_user(tg_id, fio, "worker")
    elif dict(user).get('role') not in ('foreman', 'moderator', 'boss', 'superadmin'):
        await db.update_user_role(tg_id, "worker")

    await db.conn.commit()

    await callback.message.edit_text(
        f"✅ Успешно!\nВы привязаны как {fio} в бригаде «{team_name}».", reply_markup=None)
    await callback.answer()

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_team_link_notification():
        try:
            await notify_users(["report_group", "boss", "superadmin"],
                               f"🔗 Привязка аккаунта (Бригада) TG\n👤 Рабочий: {fio}\n🏗 Добавлен в бригаду: «{team_name}»\n🕒 Время: {now}",
                               "teams")
        except Exception as e:
            logger.error(f"TG team link notification error: {e}")

    asyncio.create_task(_send_team_link_notification())


@dp.callback_query(F.data.startswith("equip_yes|"))
async def handle_equip_yes(callback: types.CallbackQuery):
    parts = callback.data.split("|")
    if len(parts) != 3:
        return await callback.answer("Ошибка данных", show_alert=True)
    _, equip_id, code = parts

    raw_id = callback.from_user.id
    tg_id = await resolve_id(raw_id)

    async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (equip_id,)) as cur:
        e_row = await cur.fetchone()
    if not e_row:
        return await callback.answer("❌ Техника не найдена.", show_alert=True)

    equip_name = e_row[0]

    await db.conn.execute("UPDATE equipment SET tg_id = ? WHERE id = ?", (tg_id, equip_id))

    user = await db.get_user(tg_id)
    fio = dict(user).get('fio', f"Пользователь {tg_id}") if user else f"Пользователь {tg_id}"

    if not user:
        await db.add_user(tg_id, fio, "driver")
    elif dict(user).get('role') not in ('foreman', 'moderator', 'boss', 'superadmin'):
        await db.update_user_role(tg_id, "driver")

    await db.conn.commit()

    await callback.message.edit_text(
        f"✅ Успешно!\nВы привязаны как водитель для: {equip_name}.", reply_markup=None)
    await callback.answer()

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_equip_link_notification():
        try:
            await notify_users(["report_group", "boss", "superadmin"],
                               f"🔗 Привязка аккаунта (Техника) TG\n👤 Водитель: {fio}\n🚜 Привязан к технике: «{equip_name}»\n🕒 Время: {now}",
                               "equipment")
        except Exception as e:
            logger.error(f"TG equip link notification error: {e}")

    asyncio.create_task(_send_equip_link_notification())


@dp.callback_query(F.data == "join_cancel")
async def handle_join_cancel(callback: types.CallbackQuery):
    await callback.message.edit_text("🛑 Действие отменено.", reply_markup=None)
    await callback.answer()


@dp.message(RegState.waiting_for_password)
async def process_password(message: types.Message, state: FSMContext):
    text = message.text.strip()
    raw_id = message.from_user.id

    if len(text) == 6 and text.isdigit():
        async with db.conn.execute("SELECT user_id, expires FROM link_codes WHERE code = ?", (text,)) as cur:
            row = await cur.fetchone()
        if row and time.time() < row[1]:
            primary_id = row[0]
            await db.conn.execute("INSERT OR REPLACE INTO account_links (primary_id, secondary_id) VALUES (?, ?)",
                                  (primary_id, raw_id))
            await db.conn.execute("DELETE FROM link_codes WHERE code = ?", (text,))
            await db.conn.commit()
            await state.clear()
            return await message.answer("✅ Аккаунты успешно связаны! Нажмите /start для обновления.")
        else:
            return await message.answer(
                "❌ Код недействителен или устарел. Введите правильный пароль или новый код привязки:")

    role = None
    if text == os.getenv("FOREMAN_PASS"):
        role = "foreman"
    elif text == os.getenv("MODERATOR_PASS"):
        role = "moderator"
    elif text == os.getenv("BOSS_PASS"):
        role = "boss"
    elif text == os.getenv("SUPERADMIN_PASS"):
        role = "superadmin"

    if role:
        await state.update_data(role=role)
        await state.set_state(RegState.waiting_for_fio)
        await message.answer("✅ Пароль принят.\n\nПожалуйста, введите ваше <b>ФИО</b> (Например: Иванов Иван):",
                             parse_mode="html")
    else:
        await message.answer("❌ Неверный пароль. Попробуйте снова:")


@dp.message(RegState.waiting_for_fio)
async def process_fio(message: types.Message, state: FSMContext):
    fio = message.text.strip()
    data = await state.get_data()
    role = data.get("role", "worker")
    raw_id = message.from_user.id

    await db.add_user(raw_id, fio, role)
    await db.add_log(raw_id, fio, f"Зарегистрировался в боте (Роль: {role})", target_type='user', target_id=raw_id)
    await state.clear()

    await message.answer(
        f"🎉 <b>Регистрация успешно завершена!</b>\n\n👤 ФИО: {fio}\n💼 Роль: {role}\n\nТеперь вы можете открыть рабочую платформу 👇",
        reply_markup=get_webapp_keyboard(), parse_mode="html")

    # Уведомление о новой регистрации + проверка совпадения ФИО
    async def _send_new_user_notification():
        try:
            await notify_users(["report_group", "superadmin"],
                               f"👤 Новая регистрация (TG)\n📝 ФИО: {fio}\n💼 Роль: {role}\n🆔 ID: {raw_id}",
                               "system")
        except Exception as e:
            logger.error(f"New user notification error: {e}")

    asyncio.create_task(_send_new_user_notification())

    async def _check_fio_and_notify():
        try:
            if not fio or fio.startswith("Пользователь"):
                return
            platform_filter = "user_id < 0" if raw_id > 0 else "user_id > 0"
            async with db.conn.execute(
                f"SELECT user_id, fio FROM users "
                f"WHERE {platform_filter} AND linked_user_id IS NULL "
                f"AND user_id != ? AND LOWER(TRIM(fio)) = LOWER(TRIM(?))",
                (raw_id, fio)
            ) as cur:
                matches = await cur.fetchall()
            for match in matches:
                await notify_fio_match(raw_id, fio, match[0], match[1])
        except Exception as e:
            logger.error(f"FIO match check error: {e}")

    asyncio.create_task(_check_fio_and_notify())


@dp.callback_query(F.data.startswith("smart_publish"))
async def handle_smart_publish_callback(callback: types.CallbackQuery):
    """Обработка inline-кнопок публикации расстановки на завтра."""
    raw_id = callback.from_user.id
    tg_id = await resolve_id(raw_id)
    user = await db.get_user(tg_id)

    if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
        return await callback.answer("❌ Нет прав", show_alert=True)

    if callback.data == "smart_publish_now":
        try:
            tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            async with aiohttp.ClientSession() as session:
                fd = aiohttp.FormData()
                fd.add_field('tg_id', str(tg_id))
                fd.add_field('date', tomorrow)
                async with session.post(
                    f"{API_URL}/api/system/send_schedule_group", data=fd
                ) as resp:
                    result = await resp.json()
                    count = result.get('notified', 0)
            await callback.message.edit_text(
                f"✅ <b>Расстановка на завтра отправлена в группу!</b>\n📋 Уведомлено нарядов: {count}",
                parse_mode="HTML")
            await callback.answer("✅ Отправлено!")
        except Exception as e:
            logger.error(f"Ошибка публикации через кнопку: {e}")
            await callback.answer(f"❌ Ошибка публикации", show_alert=True)

    elif callback.data == "smart_publish_delay":
        try:
            async with aiohttp.ClientSession() as session:
                fd = aiohttp.FormData()
                fd.add_field('tg_id', str(tg_id))
                async with session.post(
                    f"{API_URL}/api/system/delay_publish", data=fd
                ) as resp:
                    pass
            original_text = callback.message.text or ""
            await callback.message.edit_text(
                f"📅 <b>Подготовка нарядов на завтра</b>\n"
                f"{original_text.split(chr(10), 1)[-1] if chr(10) in original_text else ''}\n\n"
                f"⏳ <i>Отложено на 10 минут. Авто-публикация через 10 мин.</i>",
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="✅ Опубликовать сейчас",
                                          callback_data="smart_publish_now")],
                    [InlineKeyboardButton(text="⏳ Отложить ещё на 10 мин",
                                          callback_data="smart_publish_delay")]
                ])
            )
            await callback.answer("⏳ Отложено на 10 минут")
        except Exception as e:
            logger.error(f"Ошибка отложения публикации: {e}")
            await callback.answer("❌ Ошибка", show_alert=True)


@dp.callback_query(F.data.startswith("exchange_"))
async def handle_exchange_callback(callback: types.CallbackQuery):
    """Обработка inline-кнопок обмена техникой."""
    parts = callback.data.split("_")
    if len(parts) < 3:
        return await callback.answer("Ошибка данных", show_alert=True)
    action = parts[1]  # "accept" or "reject"
    exchange_id = parts[2]

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/api/exchange/{exchange_id}/respond",
                json={"tg_id": str(callback.from_user.id), "action": action}
            ) as resp:
                result = await resp.json()

        if result.get("success"):
            await callback.message.edit_text(
                f"{'✅ Вы согласились на обмен' if action == 'accept' else '❌ Вы отказались от обмена'}",
                reply_markup=None
            )
        else:
            await callback.answer(result.get("error", "Ошибка"), show_alert=True)
    except Exception as e:
        logger.error(f"Exchange callback error: {e}")
        await callback.answer("❌ Ошибка обработки", show_alert=True)


# ═══════════════════════════════════════════════════════════════════════
# /order — Inline order creation wizard
# ═══════════════════════════════════════════════════════════════════════

class OrderState(StatesGroup):
    select_date = State()
    select_object = State()
    select_teams = State()
    select_equipment = State()
    select_equip_time = State()
    enter_comment = State()
    confirm = State()


ORD_PAGE_SIZE = 10
WEEKDAY_NAMES = {0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'}


def parse_time_range(text):
    """Parse time range from user text. Returns (start_hh, end_hh) as zero-padded strings or (None, None)."""
    import re as _re
    text = text.strip().replace(",", ".").replace(";", "-")
    patterns = [
        (r"(\d{1,2})[:\.](\d{2})\s*[-–—]\s*(\d{1,2})[:\.](\d{2})", True),   # 08:00-17:00 or 08.00-17.00
        (r"(\d{1,2})\s*[-–—]\s*(\d{1,2})", False),                            # 8-17
        (r"(\d{1,2})\s+(\d{1,2})", False),                                     # 8 17
    ]
    for pattern, has_minutes in patterns:
        m = _re.match(pattern, text)
        if m:
            g = m.groups()
            start_h = int(g[0])
            end_h = int(g[2]) if has_minutes else int(g[1])
            if 0 <= start_h <= 23 and 0 <= end_h <= 23 and start_h < end_h:
                return f"{start_h:02d}", f"{end_h:02d}"
    return None, None


@dp.message(Command("order"))
async def cmd_order(message: types.Message, state: FSMContext):
    raw_id = message.from_user.id
    tg_id = await resolve_id(raw_id)
    user = await db.get_user(tg_id)

    if not user:
        return await message.answer("❌ Вы не зарегистрированы. Используйте /start")

    role = dict(user).get('role', 'worker')
    if role not in ('foreman', 'moderator', 'boss', 'superadmin'):
        return await message.answer("❌ Создание заявок доступно только прорабам и руководству.")

    await state.clear()

    from zoneinfo import ZoneInfo
    tz = ZoneInfo("Asia/Barnaul")
    now = datetime.now(tz)
    dates = []
    for i in range(4):
        d = now + timedelta(days=i)
        wd = WEEKDAY_NAMES[d.weekday()]
        if i == 0:
            label = f"Сегодня — {d.strftime('%d.%m')} ({wd})"
        elif i == 1:
            label = f"Завтра — {d.strftime('%d.%m')} ({wd})"
        else:
            label = f"{d.strftime('%d.%m')} ({wd})"
        dates.append((d.strftime("%Y-%m-%d"), label))

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=f"ord_date|{ds}")]
        for ds, label in dates
    ] + [[InlineKeyboardButton(text="❌ Отмена", callback_data="ord_cancel")]])

    await message.answer(
        "📋 <b>Создание заявки</b>\n\nВыберите дату выезда:",
        reply_markup=kb, parse_mode="HTML")
    await state.set_state(OrderState.select_date)


# ── Date → Object ──

@dp.callback_query(F.data.startswith("ord_date|"))
async def order_date(callback: types.CallbackQuery, state: FSMContext):
    date_str = callback.data.split("|")[1]
    await state.update_data(date_target=date_str)

    objects = await db.get_objects()
    if not objects:
        await callback.message.edit_text("❌ Нет активных объектов. Создайте объект в платформе.")
        await state.clear()
        return await callback.answer()

    await state.update_data(_objects=objects)
    await _show_objects(callback.message, objects, 0)
    await state.set_state(OrderState.select_object)
    await callback.answer()


async def _show_objects(message, objects, page):
    start = page * ORD_PAGE_SIZE
    page_items = objects[start:start + ORD_PAGE_SIZE]
    total_pages = (len(objects) + ORD_PAGE_SIZE - 1) // ORD_PAGE_SIZE

    buttons = []
    for obj in page_items:
        name = obj.get('name', '?')
        label = f"📍 {name}" if len(name) <= 28 else f"📍 {name[:25]}..."
        buttons.append([InlineKeyboardButton(text=label, callback_data=f"ord_obj|{obj['id']}")])

    nav = []
    if page > 0:
        nav.append(InlineKeyboardButton(text="◀ Назад", callback_data=f"ord_objp|{page - 1}"))
    if start + ORD_PAGE_SIZE < len(objects):
        nav.append(InlineKeyboardButton(text="Вперёд ▶", callback_data=f"ord_objp|{page + 1}"))
    if nav:
        buttons.append(nav)
    buttons.append([InlineKeyboardButton(text="❌ Отмена", callback_data="ord_cancel")])

    text = f"📍 Выберите объект ({page + 1}/{total_pages}):" if total_pages > 1 else "📍 Выберите объект:"
    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    try:
        await message.edit_text(text, reply_markup=kb)
    except:
        await message.answer(text, reply_markup=kb)


@dp.callback_query(F.data.startswith("ord_objp|"))
async def order_obj_page(callback: types.CallbackQuery, state: FSMContext):
    page = int(callback.data.split("|")[1])
    data = await state.get_data()
    await _show_objects(callback.message, data.get('_objects', []), page)
    await callback.answer()


# ── Object → Teams ──

@dp.callback_query(F.data.startswith("ord_obj|"))
async def order_object(callback: types.CallbackQuery, state: FSMContext):
    obj_id = int(callback.data.split("|")[1])
    data = await state.get_data()
    obj = next((o for o in data.get('_objects', []) if o['id'] == obj_id), None)
    if not obj:
        return await callback.answer("Объект не найден", show_alert=True)

    obj_display = f"{obj.get('name', '?')} ({obj.get('address', '')})"
    await state.update_data(object_id=obj_id, object_address=obj_display, selected_teams=[])

    # Get all teams and check which are busy on the selected date
    date_target = data.get('date_target', '')
    raw_teams = await db.get_all_teams()
    teams = [dict(t) for t in raw_teams]

    # Check busy teams by querying active apps on the same date
    busy_team_ids = set()
    try:
        async with db.conn.execute(
            "SELECT team_id FROM applications WHERE date_target = ? AND status NOT IN ('rejected', 'cancelled') AND is_team_freed = 0 AND team_id IS NOT NULL AND team_id != '0'",
            (date_target,)
        ) as cur:
            for row in await cur.fetchall():
                if row[0]:
                    for tid in str(row[0]).split(','):
                        tid = tid.strip()
                        if tid and tid != '0':
                            busy_team_ids.add(int(tid))
    except Exception:
        pass

    free_teams = [t for t in teams if t['id'] not in busy_team_ids]

    if not free_teams:
        # Skip to equipment
        await state.update_data(_teams=[], selected_teams=[])
        await _show_equip_step(callback.message, state)
        await state.set_state(OrderState.select_equipment)
        return await callback.answer()

    await state.update_data(_teams=free_teams)
    await _show_teams(callback.message, free_teams, [], 0)
    await state.set_state(OrderState.select_teams)
    await callback.answer()


async def _show_teams(message, teams, selected_ids, page):
    start = page * ORD_PAGE_SIZE
    page_items = teams[start:start + ORD_PAGE_SIZE]

    buttons = []
    for t in page_items:
        prefix = "✅ " if t['id'] in selected_ids else ""
        buttons.append([InlineKeyboardButton(
            text=f"{prefix}👷 {t.get('name', '?')}",
            callback_data=f"ord_tm|{t['id']}"
        )])

    nav = []
    if page > 0:
        nav.append(InlineKeyboardButton(text="◀ Назад", callback_data=f"ord_tmp|{page - 1}"))
    if start + ORD_PAGE_SIZE < len(teams):
        nav.append(InlineKeyboardButton(text="Вперёд ▶", callback_data=f"ord_tmp|{page + 1}"))
    if nav:
        buttons.append(nav)

    buttons.append([
        InlineKeyboardButton(text="⏭ Пропустить", callback_data="ord_tm_skip"),
        InlineKeyboardButton(text="✅ Готово", callback_data="ord_tm_done"),
    ])
    buttons.append([InlineKeyboardButton(text="❌ Отмена", callback_data="ord_cancel")])

    sel = f"\nВыбрано: {len(selected_ids)}" if selected_ids else ""
    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    try:
        await message.edit_text(f"👷 Выберите бригады (можно несколько):{sel}", reply_markup=kb)
    except:
        pass


@dp.callback_query(F.data.startswith("ord_tm|"))
async def order_toggle_team(callback: types.CallbackQuery, state: FSMContext):
    team_id = int(callback.data.split("|")[1])
    data = await state.get_data()
    selected = list(data.get('selected_teams', []))
    if team_id in selected:
        selected.remove(team_id)
    else:
        selected.append(team_id)
    await state.update_data(selected_teams=selected)
    await _show_teams(callback.message, data.get('_teams', []), selected, 0)
    await callback.answer()


@dp.callback_query(F.data.startswith("ord_tmp|"))
async def order_team_page(callback: types.CallbackQuery, state: FSMContext):
    page = int(callback.data.split("|")[1])
    data = await state.get_data()
    await _show_teams(callback.message, data.get('_teams', []), data.get('selected_teams', []), page)
    await callback.answer()


@dp.callback_query(F.data.in_({"ord_tm_done", "ord_tm_skip"}))
async def order_teams_done(callback: types.CallbackQuery, state: FSMContext):
    await _show_equip_step(callback.message, state)
    await state.set_state(OrderState.select_equipment)
    await callback.answer()


# ── Teams → Equipment ──

async def _show_equip_step(message, state):
    data = await state.get_data()
    date_target = data.get('date_target', '')

    # Get all active equipment
    raw_equip = await db.get_all_equipment_admin()
    all_equip = [dict(e) for e in raw_equip]

    # Filter: only active, not in repair
    available = [e for e in all_equip if e.get('is_active', 1) == 1 and e.get('status') != 'repair']

    # Find which equipment IDs are fully booked on date_target (08–17)
    booked_ids = set()
    try:
        import json as _json
        async with db.conn.execute(
            "SELECT equipment_data FROM applications WHERE date_target = ? AND status NOT IN ('rejected', 'cancelled')",
            (date_target,)
        ) as cur:
            for row in await cur.fetchall():
                if row[0]:
                    try:
                        for eq in _json.loads(row[0]):
                            if not eq.get('is_freed'):
                                booked_ids.add(eq['id'])
                    except Exception:
                        pass
    except Exception:
        pass

    free_equip = [e for e in available if e['id'] not in booked_ids]

    await state.update_data(_equip=free_equip, selected_equip=[], _equip_page=0)

    if not free_equip:
        # No equipment — go to comment
        await _show_comment_step(message, state)
        await state.set_state(OrderState.enter_comment)
        return

    await _show_equip(message, free_equip, [], 0)


async def _show_equip(message, equip_list, selected, page):
    start = page * ORD_PAGE_SIZE
    page_items = equip_list[start:start + ORD_PAGE_SIZE]

    buttons = []
    for eq in page_items:
        is_sel = any(s['id'] == eq['id'] for s in selected)
        prefix = "✅ " if is_sel else ""
        name = eq.get('name', '?')
        plate = eq.get('license_plate', '')
        short = name.split(' ')[0]
        label = f"{prefix}🚛 {short}"
        if plate:
            label += f" [{plate}]"
        driver = eq.get('driver_fio', '')
        if driver and driver != 'Не указан':
            label += f" • {driver}"
        if len(label) > 45:
            label = label[:42] + "..."
        buttons.append([InlineKeyboardButton(text=label, callback_data=f"ord_eq|{eq['id']}")])

    nav = []
    if page > 0:
        nav.append(InlineKeyboardButton(text="◀ Назад", callback_data=f"ord_eqp|{page - 1}"))
    if start + ORD_PAGE_SIZE < len(equip_list):
        nav.append(InlineKeyboardButton(text="Вперёд ▶", callback_data=f"ord_eqp|{page + 1}"))
    if nav:
        buttons.append(nav)

    buttons.append([
        InlineKeyboardButton(text="⏭ Пропустить", callback_data="ord_eq_skip"),
        InlineKeyboardButton(text="✅ Готово", callback_data="ord_eq_done"),
    ])
    buttons.append([InlineKeyboardButton(text="❌ Отмена", callback_data="ord_cancel")])

    sel_text = f"\nВыбрано: {len(selected)}" if selected else ""
    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    try:
        await message.edit_text(f"🚛 Выберите технику:{sel_text}", reply_markup=kb)
    except:
        pass


@dp.callback_query(F.data.startswith("ord_eq|"))
async def order_select_equip(callback: types.CallbackQuery, state: FSMContext):
    equip_id = int(callback.data.split("|")[1])
    data = await state.get_data()
    selected = list(data.get('selected_equip', []))

    # If already selected — toggle off (remove)
    existing = next((s for s in selected if s['id'] == equip_id), None)
    if existing:
        selected = [s for s in selected if s['id'] != equip_id]
        await state.update_data(selected_equip=selected)
        await _show_equip(callback.message, data.get('_equip', []), selected, data.get('_equip_page', 0))
        return await callback.answer(f"❌ Техника убрана")

    # Not selected — ask for time as text input
    eq = next((e for e in data.get('_equip', []) if e['id'] == equip_id), {})
    eq_name = eq.get('name', '?').split(' ')[0]
    plate = eq.get('license_plate', '')
    label = f"{eq_name} [{plate}]" if plate else eq_name

    await state.update_data(_pending_eq_id=equip_id)
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="◀ Назад к технике", callback_data="ord_eq_back")],
    ])
    await callback.message.edit_text(
        f"⏰ Введите время для <b>{label}</b>:\n\n"
        f"Формат: начало-конец\n"
        f"Примеры: <code>8-17</code>, <code>08:00-17:00</code>, <code>8 17</code>",
        reply_markup=kb, parse_mode="HTML")
    await state.set_state(OrderState.select_equip_time)
    await callback.answer()


@dp.message(OrderState.select_equip_time)
async def order_equip_time_text(message: types.Message, state: FSMContext):
    t_start, t_end = parse_time_range(message.text)
    if t_start is None:
        return await message.answer("❌ Неверный формат. Примеры: 8-17, 08:00-17:00, 8 17")

    data = await state.get_data()
    equip_id = data.get('_pending_eq_id')
    equip_list = data.get('_equip', [])
    selected = list(data.get('selected_equip', []))

    eq = next((e for e in equip_list if e['id'] == equip_id), {})
    eq_name = eq.get('name', '?')
    plate = eq.get('license_plate', '')
    driver = eq.get('driver_fio', '')
    display_name = eq_name
    if plate:
        display_name += f" [{plate}]"
    if driver and driver != 'Не указан':
        display_name += f" ({driver})"

    selected = [s for s in selected if s['id'] != equip_id]
    selected.append({
        'id': equip_id,
        'name': display_name,
        'time_start': t_start,
        'time_end': t_end,
    })

    await state.update_data(selected_equip=selected, _pending_eq_id=None)
    page = data.get('_equip_page', 0)
    await _show_equip(message, equip_list, selected, page)
    await state.set_state(OrderState.select_equipment)


@dp.callback_query(F.data == "ord_eq_back")
async def order_equip_back(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    await _show_equip(callback.message, data.get('_equip', []), data.get('selected_equip', []), data.get('_equip_page', 0))
    await state.set_state(OrderState.select_equipment)
    await callback.answer()


@dp.callback_query(F.data.startswith("ord_eqp|"))
async def order_equip_page(callback: types.CallbackQuery, state: FSMContext):
    page = int(callback.data.split("|")[1])
    data = await state.get_data()
    await state.update_data(_equip_page=page)
    await _show_equip(callback.message, data.get('_equip', []), data.get('selected_equip', []), page)
    await callback.answer()


@dp.callback_query(F.data.in_({"ord_eq_done", "ord_eq_skip"}))
async def order_equip_done(callback: types.CallbackQuery, state: FSMContext):
    await _show_comment_step(callback.message, state)
    await state.set_state(OrderState.enter_comment)
    await callback.answer()


# ── Equipment → Comment ──

async def _show_comment_step(message, state):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⏭ Без комментария", callback_data="ord_nocomment")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="ord_cancel")],
    ])
    try:
        await message.edit_text("💬 Введите комментарий к заявке или нажмите «Без комментария»:", reply_markup=kb)
    except:
        await message.answer("💬 Введите комментарий к заявке или нажмите «Без комментария»:", reply_markup=kb)


@dp.callback_query(F.data == "ord_nocomment")
async def order_no_comment(callback: types.CallbackQuery, state: FSMContext):
    await state.update_data(comment="")
    await _show_confirm(callback.message, state)
    await state.set_state(OrderState.confirm)
    await callback.answer()


@dp.message(OrderState.enter_comment)
async def order_comment_text(message: types.Message, state: FSMContext):
    await state.update_data(comment=message.text.strip())
    await _show_confirm(message, state)
    await state.set_state(OrderState.confirm)


# ── Confirmation ──

async def _show_confirm(message, state):
    data = await state.get_data()
    teams = data.get('_teams', [])
    sel_team_ids = data.get('selected_teams', [])
    sel_equip = data.get('selected_equip', [])

    team_names = [t.get('name', '?') for t in teams if t['id'] in sel_team_ids]
    equip_lines = []
    for e in sel_equip:
        short = e['name'].split(' ')[0]
        equip_lines.append(f"{short} ({e['time_start']}:00–{e['time_end']}:00)")

    summary = (
        f"📋 <b>Подтверждение заявки</b>\n\n"
        f"📅 Дата: <b>{data.get('date_target', '?')}</b>\n"
        f"📍 Объект: <b>{data.get('object_address', '?')}</b>\n"
        f"👷 Бригады: {', '.join(team_names) if team_names else 'не выбраны'}\n"
        f"🚛 Техника: {', '.join(equip_lines) if equip_lines else 'не выбрана'}\n"
        f"💬 Комментарий: {data.get('comment') or '—'}"
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Создать заявку", callback_data="ord_submit")],
        [InlineKeyboardButton(text="✏️ Изменить", callback_data="ord_edit")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="ord_cancel")],
    ])
    try:
        await message.edit_text(summary, reply_markup=kb, parse_mode="HTML")
    except:
        await message.answer(summary, reply_markup=kb, parse_mode="HTML")


@dp.callback_query(F.data == "ord_edit")
async def order_edit_menu(callback: types.CallbackQuery, state: FSMContext):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📅 Дату", callback_data="ord_e_date"),
         InlineKeyboardButton(text="📍 Объект", callback_data="ord_e_obj")],
        [InlineKeyboardButton(text="👷 Бригады", callback_data="ord_e_team"),
         InlineKeyboardButton(text="🚛 Технику", callback_data="ord_e_equip")],
        [InlineKeyboardButton(text="💬 Комментарий", callback_data="ord_e_comm")],
        [InlineKeyboardButton(text="◀ Назад", callback_data="ord_e_back")],
    ])
    await callback.message.edit_text("✏️ Что изменить?", reply_markup=kb)
    await callback.answer()


@dp.callback_query(F.data == "ord_e_date")
async def edit_date(callback: types.CallbackQuery, state: FSMContext):
    # Re-show date selection
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("Asia/Barnaul")
    now = datetime.now(tz)
    dates = []
    for i in range(4):
        d = now + timedelta(days=i)
        wd = WEEKDAY_NAMES[d.weekday()]
        label = {0: f"Сегодня — {d.strftime('%d.%m')} ({wd})", 1: f"Завтра — {d.strftime('%d.%m')} ({wd})"}.get(i, f"{d.strftime('%d.%m')} ({wd})")
        dates.append((d.strftime("%Y-%m-%d"), label))
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=f"ord_date|{ds}")] for ds, label in dates
    ] + [[InlineKeyboardButton(text="◀ Назад", callback_data="ord_e_back")]])
    await callback.message.edit_text("📅 Выберите новую дату:", reply_markup=kb)
    await state.set_state(OrderState.select_date)
    await callback.answer()


@dp.callback_query(F.data == "ord_e_obj")
async def edit_object(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    objects = data.get('_objects', [])
    if not objects:
        objects = await db.get_objects()
        await state.update_data(_objects=objects)
    await _show_objects(callback.message, objects, 0)
    await state.set_state(OrderState.select_object)
    await callback.answer()


@dp.callback_query(F.data == "ord_e_team")
async def edit_teams(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    teams = data.get('_teams', [])
    selected = data.get('selected_teams', [])
    if teams:
        await _show_teams(callback.message, teams, selected, 0)
        await state.set_state(OrderState.select_teams)
    else:
        await callback.answer("Нет свободных бригад на эту дату", show_alert=True)
        return
    await callback.answer()


@dp.callback_query(F.data == "ord_e_equip")
async def edit_equip(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    equip = data.get('_equip', [])
    selected = data.get('selected_equip', [])
    if equip:
        await _show_equip(callback.message, equip, selected, 0)
        await state.set_state(OrderState.select_equipment)
    else:
        await callback.answer("Нет свободной техники на эту дату", show_alert=True)
        return
    await callback.answer()


@dp.callback_query(F.data == "ord_e_comm")
async def edit_comment(callback: types.CallbackQuery, state: FSMContext):
    await _show_comment_step(callback.message, state)
    await state.set_state(OrderState.enter_comment)
    await callback.answer()


@dp.callback_query(F.data == "ord_e_back")
async def edit_back(callback: types.CallbackQuery, state: FSMContext):
    await _show_confirm(callback.message, state)
    await state.set_state(OrderState.confirm)
    await callback.answer()


# ── Submit ──

@dp.callback_query(F.data == "ord_submit")
async def order_submit(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    raw_id = callback.from_user.id

    import json as _json

    equip_payload = []
    for eq in data.get('selected_equip', []):
        equip_payload.append({
            'id': eq['id'],
            'name': eq['name'],
            'time_start': eq['time_start'],
            'time_end': eq['time_end'],
        })

    # Auto-select all members from chosen teams
    selected_teams = data.get('selected_teams', [])
    member_ids = []
    for tid in selected_teams:
        try:
            members = await db.get_team_members(tid)
            for m in members:
                mid = dict(m).get('id')
                if mid:
                    member_ids.append(mid)
        except Exception:
            pass

    form = aiohttp.FormData()
    form.add_field('tg_id', str(raw_id))
    form.add_field('date_target', data.get('date_target', ''))
    form.add_field('object_address', data.get('object_address', ''))
    form.add_field('object_id', str(data.get('object_id', 0)))
    form.add_field('team_id', ','.join(str(t) for t in selected_teams) or '0')
    form.add_field('selected_members', ','.join(str(m) for m in member_ids))
    form.add_field('equipment_data', _json.dumps(equip_payload, ensure_ascii=False) if equip_payload else '')
    form.add_field('comment', data.get('comment', ''))

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{API_URL}/api/applications/create", data=form) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    app_id = result.get('id', '?')
                    await callback.message.edit_text(
                        f"✅ <b>Заявка #{app_id} создана!</b>\n\n"
                        f"📅 {data.get('date_target')}\n"
                        f"📍 {data.get('object_address')}\n\n"
                        f"Заявка отправлена на модерацию.",
                        parse_mode="HTML")
                elif resp.status == 409:
                    error = await resp.json()
                    detail = error.get('detail', 'Бригада или техника уже заняты.')
                    await callback.message.edit_text(
                        f"⚠️ <b>Конфликт ресурсов:</b>\n{detail}\n\nНажмите /order чтобы попробовать снова.",
                        parse_mode="HTML")
                else:
                    await callback.message.edit_text(f"❌ Ошибка создания заявки (код {resp.status}). Попробуйте /order")
    except Exception as e:
        logger.error(f"Order submit error: {e}")
        await callback.message.edit_text(f"❌ Ошибка связи с сервером. Попробуйте /order")

    await state.clear()
    await callback.answer()


# ── Cancel ──

@dp.callback_query(F.data == "ord_cancel")
async def order_cancel(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text("❌ Создание заявки отменено.", reply_markup=None)
    await callback.answer()


# ═══════════════════════════════════════════════════════════════════════


async def call_api(endpoint):
    url = f"{API_URL}{endpoint}"
    async with aiohttp.ClientSession() as session:
        try:
            await session.post(url)
        except:
            pass


async def start_day_jobs():
    logger.info("Запуск утренних заявок (07:00 Барнаул)")
    await call_api("/api/cron/start_day")


async def end_day_jobs():
    logger.info("Завершение заявок (23:00 Барнаул)")
    await call_api("/api/cron/end_day")


async def check_equip_timeouts():
    logger.info("Проверка просроченной техники")
    await call_api("/api/cron/check_timeouts")


async def backup_database():
    try:
        backup_dir = "data/backups"
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copy2(db_path, f"{backup_dir}/viksstroy_backup_{timestamp}.db")
        logger.info("Бэкап БД создан.")
    except Exception as e:
        logger.error(f"Ошибка бэкапа: {e}")


# ─────────────────────────────────────────────────────────────
# Stage 3: catch-all fallback. MUST stay the LAST @dp.message
# registration so aiogram falls through to it only when no other
# handler (command, FSM state) matched first. Respects active FSM
# state to avoid hijacking multi-step wizards.
# ─────────────────────────────────────────────────────────────
@dp.message()
async def _fallback_commands_list(message: types.Message, state: FSMContext):
    if await state.get_state() is not None:
        return
    try:
        role = await _resolve_user_role_tg(message.from_user.id)
    except Exception:
        role = "driver"
    await message.answer(format_commands_message(role, TG_AVAILABLE_COMMANDS))


async def main():
    await db.init_db()
    logger.info("База данных готова.")
    warn_missing_commands(logger, "TG", TG_AVAILABLE_COMMANDS)

    TG_PROXY_URL = os.getenv("TG_PROXY_URL")
    session = None
    if TG_PROXY_URL:
        if TG_PROXY_URL.startswith("socks5://"):
            session = Socks5Session(proxy_url=TG_PROXY_URL)
        elif TG_PROXY_URL.startswith("http://") or TG_PROXY_URL.startswith("https://"):
            session = AiohttpSession(proxy=TG_PROXY_URL)
        else:
            logger.warning(f"Неизвестный тип прокси: {TG_PROXY_URL}, запуск без прокси")

    if session:
        bot = Bot(token=os.getenv("BOT_TOKEN"), session=session)
        logger.info(f"Bot initialized WITH PROXY: {TG_PROXY_URL}")
    else:
        bot = Bot(token=os.getenv("BOT_TOKEN"))
        logger.info("Bot initialized WITHOUT PROXY (direct connection)")

    scheduler = AsyncIOScheduler(timezone='Asia/Barnaul')
    scheduler.add_job(start_day_jobs, 'cron', hour=7, minute=0, id='start_day')
    scheduler.add_job(end_day_jobs, 'cron', hour=23, minute=0, id='end_day')
    scheduler.add_job(check_equip_timeouts, 'cron', hour='8-22', minute='0,30', id='check_equip_timeouts')
    scheduler.add_job(backup_database, 'cron', hour=3, minute=0, id='backup_database')
    scheduler.start()

    logger.info(">>> Бот ВиКС успешно запущен <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")