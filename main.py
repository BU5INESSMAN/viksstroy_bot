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

from database_deps import db
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger(__name__)

TG_PROXY_URL = os.getenv("TG_PROXY_URL")
if TG_PROXY_URL:
    if TG_PROXY_URL.startswith("socks5://"):
        from aiohttp_socks import ProxyConnector
        session = AiohttpSession(connector=ProxyConnector.from_url(TG_PROXY_URL))
    elif TG_PROXY_URL.startswith("http://") or TG_PROXY_URL.startswith("https://"):
        session = AiohttpSession(proxy=TG_PROXY_URL)
    else:
        logger.warning(f"Неизвестный тип прокси: {TG_PROXY_URL}, запуск без прокси")
        session = None
else:
    session = None

if session:
    bot = Bot(token=os.getenv("BOT_TOKEN"), session=session)
    logger.info(f"Bot initialized WITH PROXY: {TG_PROXY_URL}")
else:
    bot = Bot(token=os.getenv("BOT_TOKEN"))
    logger.info("Bot initialized WITHOUT PROXY (direct connection)")
dp = Dispatcher()
db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

WEB_APP_URL = "https://miniapp.viks22.ru"


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

    await message.answer(f"⏳ Генерирую расстановку на {label} ({target_date})...")

    try:
        # Импортируем генератор через API-вызов
        async with aiohttp.ClientSession() as session:
            fd = aiohttp.FormData()
            fd.add_field('tg_id', str(tg_id))
            fd.add_field('target_date', target_date)
            async with session.post("http://127.0.0.1:8000/api/applications/publish_schedule", data=fd) as resp:
                if resp.status == 200:
                    await message.answer(f"✅ Расстановка на {target_date} опубликована в групповой чат!")
                else:
                    error = await resp.json()
                    await message.answer(f"❌ Ошибка: {error.get('detail', 'Неизвестная ошибка')}")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {str(e)}")


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
    await db.add_log(raw_id, fio, f"Зарегистрировался в боте (Роль: {role})")
    await state.clear()

    await message.answer(
        f"🎉 <b>Регистрация успешно завершена!</b>\n\n👤 ФИО: {fio}\n💼 Роль: {role}\n\nТеперь вы можете открыть рабочую платформу 👇",
        reply_markup=get_webapp_keyboard(), parse_mode="html")


async def call_api(endpoint):
    url = f"http://127.0.0.1:8000{endpoint}"
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