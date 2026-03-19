import asyncio
import logging
import os
import sys
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
    # Нативный SDK MAXAPI позволяет передавать стандартный словарь для клавиатуры.
    # Библиотека сама конвертирует его в нужный JSON при отправке.
    return {
        "inline_keyboard": [
            [{"text": "📱 Открыть платформу", "web_app": {"url": WEB_APP_URL}}]
        ]
    }


@dp.message_created(F.message.body.text)
async def message_handler(event: MessageCreated):
    text = event.message.body.text.strip()

    # Идентификатор пользователя в MAX
    max_id = event.message.sender.user_id

    # Для совместимости с БД используем отрицательные ID
    pseudo_tg_id = -int(max_id)
    user = await db.get_user(pseudo_tg_id)

    # Формируем текст ответа
    if text.startswith("/start"):
        if user:
            if dict(user).get('is_blacklisted'):
                msg = "❌ Ваш аккаунт заблокирован. Обратитесь к руководству."
            else:
                msg = f"С возвращением, <b>{dict(user)['fio']}</b>!\n\nИспользуйте системную кнопку «Открыть платформу» или нажмите на кнопку ниже для запуска системы:"
        else:
            msg = "🔐 <b>Добро пожаловать в ВИКС Расписание!</b>\n\nЯ не нашел вас в базе данных.\nНажмите на кнопку ниже, чтобы открыть платформу и пройти быструю регистрацию по паролю."
    else:
        if user:
            msg = "Все функции доступны внутри мини-приложения 👇"
        else:
            msg = "Для работы с ботом введите команду /start или нажмите кнопку «Открыть платформу» для регистрации"

    # Отправка сообщения нативными средствами библиотеки maxapi (как в simple_max_bot.py)
    try:
        # Метод event.reply автоматически берет нужный chat_id из события,
        # что исключает ошибку отправки сообщения ботом самому себе.
        await event.reply(
            text=msg,
            parse_mode="html",
            reply_markup=get_webapp_keyboard()
        )
    except AttributeError:
        # Запасной вариант маршрутизации на случай специфичной версии библиотеки maxapi
        try:
            chat_id = event.message.chat_id
            await bot.send_message(
                chat_id=chat_id,
                text=msg,
                parse_mode="html",
                reply_markup=get_webapp_keyboard()
            )
        except Exception as e:
            logger.error(f"Ошибка отправки через bot.send_message: {e}")
    except Exception as e:
        logger.error(f"Ошибка отправки сообщения: {e}")


async def main():
    await db.init_db()

    logger.info(">>> Бот MAX успешно запущен (Long Polling) <<<")

    # start_polling библиотеки maxapi обычно сам очищает зависшие вебхуки
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")