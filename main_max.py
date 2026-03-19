import asyncio
import logging
import os
import sys
import aiohttp
import json
from dotenv import load_dotenv

from maxapi import Bot, Dispatcher, F
from maxapi.types import MessageCreated

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.db_manager import DatabaseManager

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger(__name__)

# Токен берем из переменной окружения
MAX_TOKEN = os.getenv("MAX_BOT_TOKEN", "").strip()

if not MAX_TOKEN:
    logger.error("КРИТИЧЕСКАЯ ОШИБКА: MAX_BOT_TOKEN не найден в .env")
    sys.exit(1)

bot = Bot(MAX_TOKEN)
dp = Dispatcher()

db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

WEB_APP_URL = "https://miniapp.viks22.ru/max"


def get_webapp_keyboard():
    # Стандартная кнопка для запуска мини-приложения в платформе
    return [
        [{"type": "link", "text": "📱 Открыть платформу", "url": WEB_APP_URL}]
    ]


async def clear_webhook():
    """Удаляет старые вебхуки, чтобы бот мог работать через Long Polling"""
    logger.info("Очистка старых подписок MAX...")
    headers = {"Authorization": MAX_TOKEN}
    async with aiohttp.ClientSession() as session:
        try:
            url = "https://platform-api.max.ru/subscriptions"
            async with session.delete(url, headers=headers) as resp:
                pass
        except Exception:
            pass


@dp.message_created(F.message.body.text)
async def message_handler(event: MessageCreated):
    # Логика регистрации полностью перенесена в React (MAXAuth.jsx)
    text = "Добро пожаловать в ВИКС Расписание!\n\nИспользуйте системную кнопку «Открыть» или нажмите на кнопку ниже, чтобы запустить платформу."

    # Отправляем сообщение с прикрепленной кнопкой через aiohttp для надежности
    url = "https://platform-api.max.ru/messages"
    headers = {
        "Authorization": MAX_TOKEN,
        "Content-Type": "application/json"
    }
    payload = {
        "chat_id": str(event.message.recipient.chat_id),
        "text": text,
        "format": "html",
        "inlineKeyboardMarkup": json.dumps(get_webapp_keyboard())
    }

    async with aiohttp.ClientSession() as session:
        try:
            await session.post(url, headers=headers, json=payload)
        except Exception as e:
            logger.error(f"Ошибка отправки сообщения: {e}")


async def main():
    await db.init_db()
    await clear_webhook()

    logger.info(">>> Бот MAX успешно запущен (Long Polling) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")