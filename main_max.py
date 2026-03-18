import asyncio
import logging
import os
import sys
import aiohttp
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

# В maxapi нет встроенной машины состояний, поэтому используем простой словарь
MAX_USER_STATES = {}
WEB_APP_URL = "https://miniapp.viks22.ru/max"


async def clear_webhook():
    """Удаляет старые вебхуки, чтобы бот мог работать через Long Polling"""
    logger.info("Очистка старых подписок MAX...")
    headers = {"Authorization": MAX_TOKEN}
    async with aiohttp.ClientSession() as session:
        try:
            # Пытаемся удалить любые подписки
            url = "https://platform-api.max.ru/subscriptions"
            async with session.delete(url, headers=headers) as resp:
                pass
        except Exception:
            pass


@dp.message_created(F.message.body.text)
async def message_handler(event: MessageCreated):
    text = event.message.body.text.strip()

    # Получаем уникальный ID пользователя в MAX
    max_id = event.message.sender.user_id

    # Для совместимости с текущей БД используем отрицательный ID
    pseudo_tg_id = -int(max_id)

    first_name = event.message.sender.first_name or "Пользователь"
    last_name = getattr(event.message.sender, 'last_name', '') or ""

    # Ищем пользователя в БД по отрицательному ID
    user = await db.get_user(pseudo_tg_id)

    # 1. ОБРАБОТКА КОМАНДЫ /start
    if text == "/start":
        if user:
            if dict(user).get('is_blacklisted'):
                await event.message.answer("Ваш аккаунт заблокирован.")
                return
            await event.message.answer(
                f"С возвращением, {dict(user)['fio']}!\n\n📱 Открыть платформу можно по ссылке:\n{WEB_APP_URL}"
            )
        else:
            # Начинаем регистрацию
            MAX_USER_STATES[max_id] = {
                "state": "waiting_for_password",
                "first_name": first_name,
                "last_name": last_name
            }
            await event.message.answer(
                "🔐 Добро пожаловать в ВИКС Расписание!\n\nПожалуйста, введите ваш системный пароль:")
        return

    # 2. ОБРАБОТКА ДИАЛОГА РЕГИСТРАЦИИ
    state_data = MAX_USER_STATES.get(max_id)

    # Если состояний нет (обычное сообщение вне регистрации)
    if not state_data:
        if user:
            await event.message.answer(f"Все функции доступны в мини-приложении 👇\n{WEB_APP_URL}")
        else:
            await event.message.answer("Для работы с ботом введите команду /start")
        return

    # --- Шаг 1: Проверка пароля ---
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

    # --- Шаг 2: Получение ФИО и завершение ---
    if state_data["state"] == "waiting_for_fio":
        role = state_data["role"]
        fio = text

        # Сохраняем в БД
        await db.add_user(pseudo_tg_id, fio, role)
        await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался через MAX (Роль: {role})")

        # Очищаем состояние
        del MAX_USER_STATES[max_id]

        await event.message.answer(
            f"🎉 Регистрация успешна!\n\n📱 Открыть платформу можно по ссылке:\n{WEB_APP_URL}"
        )

        # Отправляем уведомление администраторам в основную группу (через Telegram)
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

    # Очищаем старые вебхуки перед запуском
    await clear_webhook()

    logger.info(">>> Бот MAX успешно запущен (Long Polling) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")