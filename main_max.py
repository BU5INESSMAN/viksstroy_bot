import asyncio
import logging
import os
import sys
import random
import time
from dotenv import load_dotenv

from maxapi import Bot, Dispatcher
from maxapi.types import MessageCreated

# Подключаем папку web, чтобы Python увидел database_deps и другие модули бэкенда
current_dir = os.path.dirname(os.path.abspath(__file__))
web_dir = os.path.join(current_dir, "web")
sys.path.append(web_dir)

from database_deps import db

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger(__name__)

MAX_TOKEN = os.getenv("MAX_BOT_TOKEN", "").strip()

if not MAX_TOKEN:
    logger.error("КРИТИЧЕСКАЯ ОШИБКА: MAX_BOT_TOKEN не найден в .env")
    sys.exit(1)

bot = Bot(MAX_TOKEN)
dp = Dispatcher()

WEB_APP_URL = "https://miniapp.viks22.ru/"
APP_LINK = f"📱 Платформа: {WEB_APP_URL}"

USER_STATES = {}


async def resolve_id(raw_id: int):
    # ГАРАНТИЯ ПОДКЛЮЧЕНИЯ
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT primary_id FROM account_links WHERE secondary_id = ?", (raw_id,)) as cur:
        row = await cur.fetchone()
        if row: return row[0]
    return raw_id


async def send_max_msg(event: MessageCreated, text: str):
    """Используем встроенный надежный метод для ответа"""
    try:
        await event.message.answer(text)
    except Exception as e:
        logger.warning(f"Ошибка ответа MAX: {e}")


# Убрали фильтры. Ловим АБСОЛЮТНО всё.
@dp.message_created()
async def message_handler(event: MessageCreated):
    if db.conn is None: await db.init_db()

    # --- 1. ПУЛЕНЕПРОБИВАЕМОЕ ИЗВЛЕЧЕНИЕ ID ---
    # Ищем chat_id
    chat_id = getattr(event, 'chat_id', None)
    if not chat_id and hasattr(event, 'message') and hasattr(event.message, 'chat'):
        chat_id = getattr(event.message.chat, 'id', getattr(event.message.chat, 'chatId', None))

    # Ищем user_id (sender)
    max_id = getattr(event, 'user_id', None)
    if not max_id and hasattr(event, 'message') and hasattr(event.message, 'sender'):
        max_id = getattr(event.message.sender, 'user_id', getattr(event.message.sender, 'userId', None))

    if not max_id or not chat_id:
        # Если это системное событие без ID, просто игнорируем
        return

    chat_str = str(chat_id).strip()
    max_id_str = str(max_id).strip()

    # --- 2. ПУЛЕНЕПРОБИВАЕМОЕ ИЗВЛЕЧЕНИЕ ТЕКСТА ---
    text = ""
    if hasattr(event, "message") and event.message:
        if hasattr(event.message, "body") and event.message.body and hasattr(event.message.body, "text"):
            text = event.message.body.text or ""
        elif hasattr(event.message, "text"):
            text = event.message.text or ""

    text = text.strip()

    # --- 3. СОХРАНЕНИЕ ID ДИАЛОГА ДЛЯ ЛС ---
    is_group = chat_str.startswith("-") or "@chat" in chat_str

    if not is_group and chat_str and chat_str != "None":
        try:
            await db.conn.execute("DELETE FROM settings WHERE key = ?", (f'max_dm_{max_id_str}',))
            await db.conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (f'max_dm_{max_id_str}', chat_str))
            await db.conn.commit()
            logger.info(f"💾 СОХРАНЕН ID ДИАЛОГА ЛС: max_dm_{max_id_str} = {chat_str}")
        except Exception as e:
            logger.error(f"Ошибка сохранения chat_id для ЛС MAX: {e}")

    # Если текста нет (например, прислали стикер), дальше не идем
    if not text:
        return

    pseudo_tg_id = -int(max_id)
    real_tg_id = await resolve_id(pseudo_tg_id)
    user = await db.get_user(real_tg_id)

    state_data = USER_STATES.get(max_id_str, {})
    current_state = state_data.get("state")

    # --- ЛОГИКА ДЛЯ ГРУППОВЫХ ЧАТОВ ---
    if is_group:
        if text.startswith("/setchat"):
            if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']:
                return await send_max_msg(event, "❌ У вас нет прав для привязки системной группы.")

            try:
                await db.conn.execute("DELETE FROM settings WHERE key = 'max_group_chat_id'")
                await db.conn.execute("INSERT INTO settings (key, value) VALUES ('max_group_chat_id', ?)", (chat_str,))
                await db.conn.commit()
                await send_max_msg(event,
                                   f"✅ Группа успешно привязана! (ID: {chat_str})\nТеперь все наряды и системные уведомления для MAX будут автоматически приходить сюда.")
            except Exception as e:
                await send_max_msg(event, f"❌ Ошибка при сохранении группы в базу данных: {e}")
        return

    # --- ЛОГИКА ДЛЯ ЛИЧНЫХ СООБЩЕНИЙ (ЛС) ---

    if text.startswith("/web"):
        if not user:
            return await send_max_msg(event, "❌ Сначала зарегистрируйтесь (команда /start).")
        code = str(random.randint(100000, 999999))
        expires = time.time() + 900
        try:
            await db.conn.execute("INSERT INTO link_codes (code, user_id, expires) VALUES (?, ?, ?)",
                                  (code, real_tg_id, expires))
            await db.conn.commit()
            await send_max_msg(event,
                               f"Ваш код для привязки: {code}\nДействителен 15 минут. Введите его в Telegram или в профиле платформы.")
        except Exception:
            await send_max_msg(event, "Ошибка генерации кода.")
        return

    if text.startswith("/join"):
        parts = text.split()
        if len(parts) < 2:
            return await send_max_msg(event, "❌ Укажите код приглашения. Пример: /join 123456")

        code = parts[1].strip()

        async with db.conn.execute("SELECT invite_code FROM teams WHERE join_password = ?", (code,)) as cur:
            t_row = await cur.fetchone()
        if t_row:
            url = f"https://miniapp.viks22.ru/invite/{t_row[0]}"
            return await send_max_msg(event,
                                      f"Для выбора профиля и вступления в бригаду перейдите по ссылке:\n\n📱 {url}")

        async with db.conn.execute("SELECT invite_code FROM equipment WHERE invite_code = ?", (code,)) as cur:
            e_row = await cur.fetchone()
        if e_row:
            url = f"https://miniapp.viks22.ru/equip-invite/{e_row[0]}"
            return await send_max_msg(event, f"Для подтверждения привязки техники перейдите по ссылке:\n\n📱 {url}")

        return await send_max_msg(event, "❌ Неверный код приглашения. Проверьте правильность ввода.")

    if text.startswith("/start"):
        if user:
            if dict(user).get('is_blacklisted'):
                await send_max_msg(event, "❌ Ваш аккаунт заблокирован.")
            else:
                USER_STATES.pop(max_id_str, None)
                msg = f"С возвращением, {dict(user)['fio']}!\n\nНажмите на ссылку ниже для запуска:\n\n{APP_LINK}"
                await send_max_msg(event, msg)
        else:
            USER_STATES[max_id_str] = {"state": "waiting_for_password"}
            msg = "🔐 Добро пожаловать в ВИКС Расписание!\n\nЯ не нашел вас в базе данных.\nПожалуйста, введите ваш системный пароль или 6-значный код привязки (если аккаунт уже есть в Telegram):"
            await send_max_msg(event, msg)
        return

    if current_state == "waiting_for_password":
        if len(text) == 6 and text.isdigit():
            async with db.conn.execute("SELECT user_id, expires FROM link_codes WHERE code = ?", (text,)) as cur:
                row = await cur.fetchone()
            if row and time.time() < row[1]:
                primary_id = row[0]
                await db.conn.execute("INSERT OR REPLACE INTO account_links (primary_id, secondary_id) VALUES (?, ?)",
                                      (primary_id, pseudo_tg_id))
                await db.conn.execute("DELETE FROM link_codes WHERE code = ?", (text,))
                await db.conn.commit()
                USER_STATES.pop(max_id_str, None)
                await send_max_msg(event, f"✅ Аккаунты успешно связаны!\n\n{APP_LINK}")
                return
            else:
                await send_max_msg(event, "❌ Код недействителен или устарел. Введите пароль или новый код:")
                return

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
            USER_STATES[max_id_str]["role"] = role
            USER_STATES[max_id_str]["state"] = "waiting_for_fio"
            await send_max_msg(event, "✅ Пароль принят.\n\nПожалуйста, введите ваше ФИО (Например: Иванов Иван):")
        else:
            await send_max_msg(event, "❌ Неверный ввод. Попробуйте снова:")
        return

    if current_state == "waiting_for_fio":
        fio = text
        role = state_data.get("role", "worker")
        await db.add_user(pseudo_tg_id, fio, role)
        await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался в боте MAX (Роль: {role})")
        USER_STATES.pop(max_id_str, None)
        msg = f"🎉 Регистрация успешно завершена!\n\n👤 ФИО: {fio}\n💼 Роль: {role}\n\nТеперь вы можете открыть рабочую платформу 👇\n\n{APP_LINK}"
        await send_max_msg(event, msg)
        return

    if user:
        await send_max_msg(event, f"Все функции доступны внутри мини-приложения 👇\n\n{APP_LINK}")
    else:
        await send_max_msg(event, "Для начала работы или регистрации введите команду /start")


async def clear_webhook():
    try:
        import aiohttp
        headers = {"Authorization": MAX_TOKEN}
        async with aiohttp.ClientSession() as session:
            await session.delete("https://platform-api.max.ru/subscriptions", headers=headers)
    except Exception:
        pass


async def main():
    await db.init_db()
    await clear_webhook()
    logger.info(">>> Бот MAX успешно запущен (Кэширование ЛС диалогов) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")