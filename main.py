import asyncio
import logging
import os
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

# Импорт наших компонентов
from database.db_manager import DatabaseManager
from handlers import auth, foreman, moderator, admin
from middlewares.auth_middleware import AuthMiddleware
from utils.scheduler import setup_scheduler


async def main():
    # 1. Загрузка настроек из .env
    load_dotenv()

    # Конфигурация логирования
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    )
    logger = logging.getLogger(__name__)

    # 2. База данных
    # Создаем папку data, если её нет, и инициализируем БД по схеме schema.sql
    db_path = os.getenv("DB_PATH", "data/viksstroy.db")
    db = DatabaseManager(db_path)
    await db.init_db()

    # 3. Настройка бота
    bot_token = os.getenv("BOT_TOKEN")
    if not bot_token:
        logger.error("Критическая ошибка: BOT_TOKEN не найден в .env!")
        return

    # Настраиваем бота с поддержкой HTML по умолчанию
    bot = Bot(
        token=bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )

    # 4. Диспетчер и FSM (состояния храним в памяти)
    storage = MemoryStorage()
    dp = Dispatcher(storage=storage)

    # 5. Dependency Injection
    # Пробрасываем объект БД в каждый хендлер как аргумент 'db'
    dp["db"] = db

    # 6. Регистрация Middleware
    # Middleware проверяет юзера ДО того, как он попадет в хендлеры
    dp.update.outer_middleware(AuthMiddleware(db))

    # 7. Подключение роутеров
    # Порядок регистрации важен для корректной фильтрации команд
    dp.include_router(auth.router)  # Вход, пароли, регистрация
    dp.include_router(admin.router)  # Функции суперадмина (/admin)
    dp.include_router(moderator.router)  # Одобрение/отказ заявок
    dp.include_router(foreman.router)  # Бригады и создание заявок

    # 8. Запуск планировщика задач (Шаг 6)
    # Формирует отчет в 13:00 и отправляет в группу
    scheduler = setup_scheduler(bot, db)

    # 9. Запуск бота
    logger.info(">>> Система ВикСтрой успешно запущена <<<")

    try:
        # Стартуем планировщик
        scheduler.start()
        # Запускаем бесконечный цикл опроса серверов Telegram
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Произошла ошибка в работе бота: {e}")
    finally:
        # Гарантируем закрытие всех соединений при выходе
        await bot.session.close()
        await db.close()
        logger.info("Сессия бота завершена.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Бот принудительно остановлен.")