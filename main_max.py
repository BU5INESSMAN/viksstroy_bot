import asyncio
import logging
import os
import sys
import aiohttp
import time
import random
import string
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

MAX_USER_STATES = {}
WEB_APP_URL = "https://miniapp.viks22.ru/max"


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


async def generate_auth_link(max_id: int) -> str:
    """Генерирует одноразовую ссылку для автоматического входа в MAX WebApp"""
    token = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
    expires = time.time() + 300  # Токен живет 5 минут
    await db.conn.execute("INSERT INTO web_codes (code, max_id, expires) VALUES (?, ?, ?)", (token, max_id, expires))
    await db.conn.commit()
    return f"{WEB_APP_URL}?auth_token={token}"


@dp.message_created(F.message.body.text)
async def message_handler(event: MessageCreated):
    text = event.message.body.text.strip()
    max_id = event.message.sender.user_id

    # Для совместимости с текущей БД используем отрицательный ID
    pseudo_tg_id = -int(max_id)

    first_name = event.message.sender.first_name or "Пользователь"
    last_name = getattr(event.message.sender, 'last_name', '') or ""

    user = await db.get_user(pseudo_tg_id)

    if text == "/start":
        if user:
            if dict(user).get('is_blacklisted'):
                await event.message.answer("Ваш аккаунт заблокирован.")
                return

            # Генерируем магическую ссылку для авто-входа
            auth_link = await generate_auth_link(max_id)
            await event.message.answer(
                f"С возвращением, {dict(user)['fio']}!\n\n📱 Открыть платформу можно по ссылке:\n{auth_link}"
            )
        else:
            MAX_USER_STATES[max_id] = {
                "state": "waiting_for_password",
                "first_name": first_name,
                "last_name": last_name
            }
            await event.message.answer(
                "🔐 Добро пожаловать в ВИКС Расписание!\n\nПожалуйста, введите ваш системный пароль:")
        return

    state_data = MAX_USER_STATES.get(max_id)

    if not state_data:
        if user:
            auth_link = await generate_auth_link(max_id)
            await event.message.answer(f"Все функции доступны в мини-приложении 👇\n{auth_link}")
        else:
            await event.message.answer("Для работы с ботом введите команду /start")
        return

    if state_data["state"] == "waiting_for_password":
        role = None
        if text == os.getenv("SUPERADMIN_PASS"):
            role = "superadmin"
        elif text == os.getenv("BOSS_PASS"):
            role = "boss"
        elif text == os.getenv("MODERATOR_PASS"):
            role = "moderator"
        elif text == os.getenv("FOREMAN_PASS"):
            role = "foreman"

        if not role:
            await event.message.answer("❌ Неверный пароль. Попробуйте еще раз:")
            return

        MAX_USER_STATES[max_id]["role"] = role
        MAX_USER_STATES[max_id]["state"] = "waiting_for_fio"
        await event.message.answer("✅ Пароль принят!\n\nТеперь введите ваше ФИО (Например: Иванов Иван):")
        return

    if state_data["state"] == "waiting_for_fio":
        role = state_data["role"]
        fio = text

        await db.add_user(pseudo_tg_id, fio, role)
        await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался через MAX (Роль: {role})")

        del MAX_USER_STATES[max_id]

        auth_link = await generate_auth_link(max_id)
        await event.message.answer(
            f"🎉 Регистрация успешна!\n\n📱 Открыть платформу можно по ссылке:\n{auth_link}"
        )

        bot_token = os.getenv("BOT_TOKEN")
        group_id = os.getenv("GROUP_CHAT_ID")
        if bot_token and group_id:
            try:
                async with aiohttp.ClientSession() as session:
                    await session.post(f"https://api.telegram.org/bot{bot_token}/sendMessage",
                                       json={"chat_id": group_id,
                                             "text": f"🆕 Новая регистрация (MAX):\n👤 {fio} ({role})"})
            except:
                pass
        return


async def main():
    await db.init_db()
    await clear_webhook()

    try:
        await db.conn.execute("CREATE TABLE IF NOT EXISTS web_codes (code TEXT, max_id INTEGER, expires REAL)")
        await db.conn.commit()
    except:
        pass

    logger.info(">>> Бот MAX успешно запущен (Long Polling) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")