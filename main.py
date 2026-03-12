import asyncio
import logging
import os
import shutil
from datetime import datetime
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
import sys

# Добавляем корневую директорию в PYTHONPATH для корректного импорта БД
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database.db_manager import DatabaseManager

load_dotenv()

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Инициализация
bot = Bot(token=os.getenv("BOT_TOKEN"))
dp = Dispatcher()
db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

# Ссылка на страницу авторизации внутри Telegram Mini App
WEB_APP_URL = "https://islandvpn.sbs/tma"


# Состояния для регистрации
class RegState(StatesGroup):
    waiting_for_password = State()
    waiting_for_fio = State()


def get_webapp_keyboard():
    """Клавиатура с кнопкой Web App"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📱 Открыть платформу", web_app=WebAppInfo(url=WEB_APP_URL))]
    ])


@dp.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject, state: FSMContext):
    tg_id = message.from_user.id
    args = command.args

    # 1. ОБРАБОТКА ИНВАЙТОВ (переход по ссылке от прораба)
    if args and args.startswith("team_"):
        invite_code = args.replace("team_", "")
        invite_url = f"https://islandvpn.sbs/invite/{invite_code}"
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🔗 Выбрать себя в списке", web_app=WebAppInfo(url=invite_url))]
        ])
        await message.answer(
            "👋 <b>Добро пожаловать!</b>\n\n"
            "Вы получили приглашение присоединиться к бригаде.\n"
            "Нажмите кнопку ниже, чтобы привязать свой аккаунт.",
            reply_markup=kb,
            parse_mode="HTML"
        )
        return

    # 2. ПРОВЕРКА СУЩЕСТВУЮЩЕГО ПОЛЬЗОВАТЕЛЯ
    user = await db.get_user(tg_id)
    if user:
        if user.get('is_blacklisted'):
            await message.answer("❌ Ваш аккаунт заблокирован решением руководства.")
            return
        await message.answer(
            f"С возвращением, <b>{user['fio']}</b>!\n\n"
            "Вся работа с заявками и бригадами теперь ведется в Web-платформе.\n"
            "Нажмите кнопку ниже для запуска:",
            reply_markup=get_webapp_keyboard(),
            parse_mode="HTML"
        )
        return

    # 3. ЕСЛИ НОВЫЙ - ЗАПУСКАЕМ РЕГИСТРАЦИЮ
    await state.set_state(RegState.waiting_for_password)
    await message.answer(
        "🔐 <b>Добро пожаловать в систему ВИКС Расписание!</b>\n\n"
        "Пожалуйста, введите ваш системный пароль для авторизации:",
        parse_mode="HTML"
    )


@dp.message(RegState.waiting_for_password)
async def process_password(message: types.Message, state: FSMContext):
    pwd = message.text.strip()
    role = None

    # Проверка пароля из .env
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

    # Сохраняем в БД
    await db.add_user(tg_id, fio, role)
    await db.add_log(tg_id, fio, f"Зарегистрировался через бота (Роль: {role})")

    await state.clear()
    await message.answer(
        f"🎉 <b>Регистрация успешно завершена!</b>\n\n"
        f"Ваша должность: <code>{role}</code>\n"
        f"Ваше ФИО: <b>{fio}</b>\n\n"
        f"Нажмите на кнопку ниже, чтобы открыть платформу.",
        reply_markup=get_webapp_keyboard(),
        parse_mode="HTML"
    )


@dp.message()
async def handle_all_messages(message: types.Message):
    """Отлавливает любой другой текст и перенаправляет в Web App"""
    user = await db.get_user(message.from_user.id)
    if user and not user.get('is_blacklisted'):
        await message.answer(
            "⚠️ Все функции перенесены в мини-приложение.\n"
            "Для работы с системой нажмите кнопку ниже 👇",
            reply_markup=get_webapp_keyboard()
        )
    elif not user:
        await message.answer("Пожалуйста, нажмите /start для регистрации.")


# --- ФОНОВЫЕ ЗАДАЧИ (УВЕДОМЛЕНИЯ И БЭКАПЫ) ---
async def send_daily_report():
    try:
        stats = await db.get_general_statistics()
        bosses = [x.strip() for x in os.getenv("BOSS_IDS", "").split(",") if x.strip()]
        super_admins = [x.strip() for x in os.getenv("SUPER_ADMIN_IDS", "").split(",") if x.strip()]
        receivers = set(bosses + super_admins)

        text = (
            f"📊 <b>Ежедневный отчет ВИКС Расписание</b>\n\n"
            f"🔹 Создано заявок сегодня: <b>{stats.get('today_total', 0)}</b>\n"
            f"✅ Одобрено: <b>{stats.get('today_approved', 0)}</b>\n"
            f"❌ Отклонено: <b>{stats.get('today_rejected', 0)}</b>\n"
            f"⏳ Ожидают публикации: <b>{stats.get('waiting_publish', 0)}</b>\n"
        )
        for tg_id in receivers:
            try:
                await bot.send_message(chat_id=tg_id, text=text, parse_mode="HTML")
            except Exception as e:
                logger.error(f"Не удалось отправить отчет {tg_id}: {e}")
    except Exception as e:
        logger.error(f"Ошибка ежедневного отчета: {e}")


async def backup_database():
    try:
        backup_dir = "data/backups"
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copy2(db_path, f"{backup_dir}/viksstroy_backup_{timestamp}.db")
        logger.info("Бэкап базы данных успешно создан.")
    except Exception as e:
        logger.error(f"Ошибка бэкапа: {e}")


async def main():
    await db.init_db()
    logger.info("База данных успешно инициализирована.")

    # Запуск планировщика задач (Отчеты каждый день в 20:00, Бэкапы в 3:00 ночи)
    scheduler = AsyncIOScheduler(timezone='Europe/Moscow')
    scheduler.add_job(send_daily_report, 'cron', hour=20, minute=0, id='send_daily_report')
    scheduler.add_job(backup_database, 'cron', hour=3, minute=0, id='backup_database')
    scheduler.start()

    logger.info(">>> ВИКС Расписание успешно запущено <<<")

    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())