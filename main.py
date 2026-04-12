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
        else:
            await state.clear()
            await message.answer(
                f"С возвращением, <b>{dict(user)['fio']}</b>!\n\nИспользуйте кнопку ниже для запуска платформы:",
                reply_markup=get_webapp_keyboard(), parse_mode="html")
    else:
        await state.set_state(RegState.waiting_for_password)
        await message.answer(
            "🔐 <b>Добро пожаловать в ВИКС Расписание!</b>\n\nЯ не нашел вас в базе данных.\nПожалуйста, введите ваш <b>системный пароль</b> или <b>6-значный код привязки</b> (если аккаунт уже есть в MAX):",
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


async def main():
    await db.init_db()
    logger.info("База данных готова.")

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

    logger.info(">>> Бот ВИКС Расписание успешно запущен (Deep Links) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")