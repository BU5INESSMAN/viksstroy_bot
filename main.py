import asyncio
import logging
import os
import traceback
from aiogram import Bot, Dispatcher, types
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

from database.db_manager import DatabaseManager
from handlers import auth, foreman, moderator, admin
from middlewares.auth_middleware import AuthMiddleware
from utils.scheduler import setup_scheduler
from utils.notifications import notify_management

async def main():
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
    logger = logging.getLogger(__name__)

    db_path = os.getenv("DB_PATH", "data/viksstroy.db")
    db = DatabaseManager(db_path)
    await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    if not bot_token:
        return logger.error("Критическая ошибка: BOT_TOKEN не найден в .env!")

    bot = Bot(token=bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    storage = MemoryStorage()
    dp = Dispatcher(storage=storage)

    # DI Инъекции
    dp["db"] = db
    dp["bot"] = bot  # Пробрасываем самого бота для глобального перехватчика

    dp.update.outer_middleware(AuthMiddleware(db))

    dp.include_router(auth.router)
    dp.include_router(admin.router)
    dp.include_router(moderator.router)
    dp.include_router(foreman.router)

    # ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК ОШИБОК (Отправляет логи Суперадминам)
    @dp.errors()
    async def global_error_handler(event: types.ErrorEvent, bot: Bot):
        tb = "".join(traceback.format_exception(type(event.exception), event.exception, event.exception.__traceback__))
        err_msg = f"🚨 <b>СИСТЕМНАЯ ОШИБКА БОТА:</b>\n<pre>{tb[-3500:]}</pre>"
        await notify_management(bot, err_msg, level="superadmin")
        logger.error(f"Глобальная ошибка: {event.exception}")

    scheduler = setup_scheduler(bot, db)
    logger.info(">>> Система ВикСтрой успешно запущена <<<")

    try:
        scheduler.start()
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Ошибка в работе бота: {e}")
    finally:
        await bot.session.close()
        await db.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Бот принудительно остановлен.")