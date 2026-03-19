import asyncio
import logging
import os
import sys
import aiohttp
import urllib.parse
from dotenv import load_dotenv

from maxapi import Bot, Dispatcher, F
from maxapi.types import MessageCreated

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.db_manager import DatabaseManager

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger(__name__)

MAX_TOKEN = os.getenv("MAX_BOT_TOKEN", "").strip()

if not MAX_TOKEN:
    logger.error("КРИТИЧЕСКАЯ ОШИБКА: MAX_BOT_TOKEN не найден в .env")
    sys.exit(1)

bot = Bot(MAX_TOKEN)
dp = Dispatcher()

db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

WEB_APP_URL = "https://miniapp.viks22.ru/max"


async def clear_webhook():
    """Очистка старых подписок, чтобы работал Long Polling"""
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
    max_id = event.message.sender.user_id
    first_name = event.message.sender.first_name or "Пользователь"
    last_name = getattr(event.message.sender, 'last_name', '') or ""

    # Бот генерирует ссылку с параметрами, чтобы WebApp сразу узнал юзера
    params = urllib.parse.urlencode({
        'user_id': max_id,
        'first_name': first_name,
        'last_name': last_name
    })
    auth_link = f"{WEB_APP_URL}?{params}"

    text = event.message.body.text.strip()
    if text == "/start":
        await event.message.answer(
            f"Добро пожаловать!\n\n📱 Открыть платформу можно по ссылке:\n{auth_link}"
        )
    else:
        await event.message.answer(
            f"Все функции доступны на платформе 👇\n{auth_link}"
        )


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