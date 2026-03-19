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

WEB_APP_URL = "https://miniapp.viks22.ru/max"
# Формируем готовую гиперссылку для вставки в текст
APP_LINK = f"<a href='{WEB_APP_URL}'>📱 Открыть платформу</a>"

# In-memory хранилище состояний (FSM) для процесса регистрации
USER_STATES = {}


async def send_max_msg(event: MessageCreated, text: str):
    """Функция отправки сообщений (используем aiohttp как основной, нативный как запасной)."""
    # 1. Отправка через API MAX (aiohttp) — самый надежный вариант с поддержкой HTML
    try:
        chat_id = None
        if hasattr(event.message, "chat") and hasattr(event.message.chat, "id"):
            chat_id = event.message.chat.id
        elif hasattr(event, "chat_id"):
            chat_id = event.chat_id

        if chat_id:
            payload = {
                "chat_id": str(chat_id),
                "text": text,
                "format": "html"  # MAX поддерживает HTML теги, включая <a>
            }

            url = "https://platform-api.max.ru/messages"
            headers = {
                "Authorization": MAX_TOKEN,
                "Content-Type": "application/json"
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as resp:
                    if resp.status == 200:
                        return  # Успешно отправлено
    except Exception as e:
        logger.warning(f"aiohttp send failed: {e}. Пытаемся использовать нативный метод.")

    # 2. Если aiohttp не сработал, используем нативный метод библиотеки (только текст)
    try:
        # Убрали reply_markup и parse_mode, чтобы избежать ошибок библиотеки
        await event.message.answer(text)
    except Exception as e:
        logger.error(f"Критическая ошибка отправки: {e}")


@dp.message_created(F.message.body.text)
async def message_handler(event: MessageCreated):
    text = event.message.body.text.strip()
    max_id = event.message.sender.user_id

    # Для совместимости с БД используем отрицательные ID
    pseudo_tg_id = -int(max_id)
    user = await db.get_user(pseudo_tg_id)

    # Получаем текущее состояние пользователя
    state_data = USER_STATES.get(max_id, {})
    current_state = state_data.get("state")

    # ОБРАБОТКА КОМАНДЫ /START
    if text.startswith("/start"):
        if user:
            if dict(user).get('is_blacklisted'):
                await send_max_msg(event, "❌ Ваш аккаунт заблокирован. Обратитесь к руководству.")
            else:
                USER_STATES.pop(max_id, None)
                msg = f"С возвращением, <b>{dict(user)['fio']}</b>!\n\nНажмите на ссылку ниже для запуска:\n\n{APP_LINK}"
                await send_max_msg(event, msg)
        else:
            # Начинаем процесс регистрации
            USER_STATES[max_id] = {"state": "waiting_for_password"}
            msg = "🔐 <b>Добро пожаловать в ВИКС Расписание!</b>\n\nЯ не нашел вас в базе данных.\nПожалуйста, введите ваш системный пароль для регистрации:"
            await send_max_msg(event, msg)
        return

    # FSM: ОЖИДАНИЕ ПАРОЛЯ
    if current_state == "waiting_for_password":
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
            USER_STATES[max_id]["role"] = role
            USER_STATES[max_id]["state"] = "waiting_for_fio"
            await send_max_msg(event,
                               "✅ Пароль принят.\n\nПожалуйста, введите ваше <b>ФИО</b> (Например: Иванов Иван):")
        else:
            await send_max_msg(event, "❌ Неверный пароль. Попробуйте снова:")
        return

    # FSM: ОЖИДАНИЕ ФИО
    if current_state == "waiting_for_fio":
        fio = text
        role = state_data.get("role", "worker")

        # Записываем пользователя в БД
        await db.add_user(pseudo_tg_id, fio, role)
        await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался в боте MAX (Роль: {role})")

        # Очищаем состояние
        USER_STATES.pop(max_id, None)

        msg = f"🎉 <b>Регистрация успешно завершена!</b>\n\n👤 ФИО: {fio}\n💼 Роль: {role}\n\nТеперь вы можете открыть рабочую платформу 👇\n\n{APP_LINK}"
        await send_max_msg(event, msg)
        return

    # ДЕФОЛТНЫЙ ОТВЕТ НА ЛЮБЫЕ ДРУГИЕ СООБЩЕНИЯ
    if user:
        await send_max_msg(event, f"Все функции доступны внутри мини-приложения 👇\n\n{APP_LINK}")
    else:
        await send_max_msg(event, "Для начала работы или регистрации введите команду /start")


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


async def main():
    await db.init_db()
    await clear_webhook()

    logger.info(">>> Бот MAX успешно запущен (Без кнопок, с HTML ссылками) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")