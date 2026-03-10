import asyncio
import logging
import os
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

from database.db_manager import DatabaseManager
from handlers import auth, foreman, moderator, admin
from middlewares.auth_middleware import AuthMiddleware
from utils.scheduler import setup_scheduler
from utils.notifications import notify_bosses

from handlers import invite


async def main():
    load_dotenv()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    )
    logger = logging.getLogger(__name__)

    db_path = os.getenv("DB_PATH", "data/viksstroy.db")
    db = DatabaseManager(db_path)
    await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    if not bot_token:
        logger.error("Критическая ошибка: BOT_TOKEN не найден в .env!")
        return

    bot = Bot(
        token=bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )

    storage = MemoryStorage()
    dp = Dispatcher(storage=storage)

    dp["db"] = db
    dp.update.outer_middleware(AuthMiddleware(db))

    dp.include_router(auth.router)
    dp.include_router(admin.router)
    dp.include_router(moderator.router)
    dp.include_router(foreman.router)
    dp.include_router(invite.router)

    scheduler = setup_scheduler(bot, db)

    logger.info(">>> ВИКС Расписание успешно запущено <<<")

    await notify_bosses(bot, db, "🚀 <b>ВИКС Расписание успешно запущено и готово к работе!</b>", level='info')

    try:
        scheduler.start()
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Произошла ошибка в работе бота: {e}")
    finally:
        await bot.session.close()
        await db.close()
        logger.info("Сессия бота завершена.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Бот принудительно остановлен.")