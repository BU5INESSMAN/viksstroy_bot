import asyncio
import logging
import os
import shutil
import aiohttp
from datetime import datetime
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database.db_manager import DatabaseManager

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger(__name__)

bot = Bot(token=os.getenv("BOT_TOKEN"))
dp = Dispatcher()
db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

WEB_APP_URL = "https://app.viks22.ru/tma"


class RegState(StatesGroup):
    waiting_for_password = State()
    waiting_for_fio = State()


def get_webapp_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="📱 Открыть платформу", web_app=WebAppInfo(url=WEB_APP_URL))]])


@dp.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject, state: FSMContext):
    tg_id = message.from_user.id
    args = command.args

    if args and args.startswith("team_"):
        invite_code = args.replace("team_", "")
        invite_url = f"https://app.viks22.ru/invite/{invite_code}"
        kb = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="🔗 Привязать аккаунт", web_app=WebAppInfo(url=invite_url))]])
        await message.answer("👋 <b>Приглашение в бригаду!</b>\n\nНажмите кнопку ниже.", reply_markup=kb,
                             parse_mode="HTML")
        return

    if args and args.startswith("equip_"):
        invite_code = args.replace("equip_", "")
        invite_url = f"https://app.viks22.ru/equip-invite/{invite_code}"
        kb = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="🔗 Стать водителем", web_app=WebAppInfo(url=invite_url))]])
        await message.answer("👋 <b>Привязка техники!</b>\n\nНажмите кнопку ниже.", reply_markup=kb, parse_mode="HTML")
        return

    user = await db.get_user(tg_id)
    if user:
        if dict(user).get('is_blacklisted'):
            await message.answer("❌ Ваш аккаунт заблокирован.")
            return
        await message.answer(f"С возвращением, <b>{dict(user).get('fio')}</b>!\n\nНажмите кнопку ниже для запуска:",
                             reply_markup=get_webapp_keyboard(), parse_mode="HTML")
        return

    await state.set_state(RegState.waiting_for_password)
    await message.answer("🔐 <b>Добро пожаловать!</b>\n\nПожалуйста, введите ваш системный пароль:", parse_mode="HTML")


@dp.message(RegState.waiting_for_password)
async def process_password(message: types.Message, state: FSMContext):
    pwd = message.text.strip()
    role = None
    if pwd == os.getenv("SUPERADMIN_PASS"):
        role = "superadmin"
    elif pwd == os.getenv("BOSS_PASS"):
        role = "boss"
    elif pwd == os.getenv("MODERATOR_PASS"):
        role = "moderator"
    elif pwd == os.getenv("FOREMAN_PASS"):
        role = "foreman"

    if not role:
        await message.answer("❌ Неверный пароль. Попробуйте еще раз:")
        return

    await state.update_data(role=role)
    await state.set_state(RegState.waiting_for_fio)
    await message.answer("✅ Пароль принят!\n\nТеперь введите ваше <b>ФИО</b> (Например: Иванов Иван):",
                         parse_mode="HTML")


@dp.message(RegState.waiting_for_fio)
async def process_fio(message: types.Message, state: FSMContext):
    fio = message.text.strip()
    data = await state.get_data()
    role = data.get("role")
    tg_id = message.from_user.id

    await db.add_user(tg_id, fio, role)
    await db.add_log(tg_id, fio, f"Зарегистрировался через бота (Роль: {role})")

    await state.clear()
    await message.answer(f"🎉 <b>Регистрация успешна!</b>\n\nНажмите на кнопку ниже, чтобы открыть платформу.",
                         reply_markup=get_webapp_keyboard(), parse_mode="HTML")


@dp.message()
async def handle_all_messages(message: types.Message):
    user = await db.get_user(message.from_user.id)
    if user and not dict(user).get('is_blacklisted'):
        await message.answer("⚠️ Все функции в мини-приложении 👇", reply_markup=get_webapp_keyboard())
    elif not user:
        await message.answer("Нажмите /start для регистрации.")


# --- АВТОМАТИЗАЦИЯ ЧЕРЕЗ API БЭКЕНДА ---
async def call_api(endpoint):
    try:
        async with aiohttp.ClientSession() as session:
            # docker-compose сеть: обращаемся к api напрямую
            await session.post(f"http://api:8000{endpoint}")
    except Exception as e:
        logger.error(f"Cron Error {endpoint}: {e}")


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

    # ЧАСОВОЙ ПОЯС БАРНАУЛ
    scheduler = AsyncIOScheduler(timezone='Asia/Barnaul')

    # 07:00 Перевод одобренных в работу + пост в группу
    scheduler.add_job(start_day_jobs, 'cron', hour=7, minute=0, id='start_day')
    # 23:00 Завершение заявок
    scheduler.add_job(end_day_jobs, 'cron', hour=23, minute=0, id='end_day')
    # Проверка техники (каждый час в :30 минут)
    scheduler.add_job(check_equip_timeouts, 'cron', minute=30, id='check_equip')

    scheduler.add_job(backup_database, 'cron', hour=3, minute=0, id='backup_database')

    scheduler.start()
    logger.info(">>> Бот ВИКС Расписание успешно запущен (Asia/Barnaul) <<<")

    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())