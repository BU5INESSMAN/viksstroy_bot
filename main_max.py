import asyncio
import logging
import os
import sys
import random
import time
import re
from dotenv import load_dotenv

from maxapi import Bot, Dispatcher, F
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


@dp.message_created(F.message.body.text)
async def message_handler(event: MessageCreated):
    if db.conn is None: await db.init_db()

    text = event.message.body.text.strip()

    # --- 1. ПУЛЕНЕПРОБИВАЕМЫЙ ПОИСК USER_ID ---
    max_id = None
    try:
        max_id = event.message.sender.user_id
    except:
        pass

    if not max_id:
        try:
            max_id = event.user_id
        except:
            pass

    if not max_id: return
    max_id_str = str(max_id).strip()

    # --- 2. ПУЛЕНЕПРОБИВАЕМЫЙ ПОИСК CHAT_ID (ДИАЛОГА) ---
    chat_id = None
    try:
        chat_id = event.message.chat.id
    except:
        pass

    if not chat_id:
        try:
            chat_id = event.message.chat.chatId
        except:
            pass

    if not chat_id:
        try:
            chat_id = event.chat_id
        except:
            pass

    if not chat_id:
        # Если API спрятало ID, парсим его напрямую из строки события!
        match = re.search(r"chat_id[=: ]*['\"]?([-\w]+)", str(event))
        if match: chat_id = match.group(1)

    chat_str = str(chat_id).strip() if chat_id else "None"
    is_group = chat_str.startswith("-") or "@chat" in chat_str

    # --- 3. ЗАПИСЬ ID ЧАТА В БАЗУ ДАННЫХ (ТО, ЧТО ТЫ ПРОСИЛ) ---
    if not is_group and chat_str != "None":
        try:
            await db.conn.execute("DELETE FROM settings WHERE key = ?", (f'max_dm_{max_id_str}',))
            await db.conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (f'max_dm_{max_id_str}', chat_str))
            await db.conn.commit()
            logger.info(
                f"💾 БАЗА ДАННЫХ: ID диалога ЛС успешно сохранен! (Пользователь {max_id_str} -> Диалог {chat_str})")
        except Exception as e:
            logger.error(f"❌ Ошибка БД при сохранении ЛС MAX: {e}")

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

    # --- ЛОГИКА ДЛЯ ЛИЧНЫХ СООБЩЕНИЙ ---

    if text.startswith("/web"):
        if not user:
            return await send_max_msg(event, "❌ Сначала зарегистрируйтесь (используйте /start или /join).")
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
        target_url = None
        role_to_set = "worker"

        async with db.conn.execute("SELECT invite_code FROM teams WHERE join_password = ?", (code,)) as cur:
            t_row = await cur.fetchone()
        if t_row:
            target_url = f"{WEB_APP_URL}invite/{t_row[0]}"
            role_to_set = "worker"
        else:
            async with db.conn.execute("SELECT invite_code FROM equipment WHERE invite_code = ?", (code,)) as cur:
                e_row = await cur.fetchone()
            if e_row:
                target_url = f"{WEB_APP_URL}equip-invite/{e_row[0]}"
                role_to_set = "driver"

        if not target_url:
            return await send_max_msg(event, "❌ Неверный код приглашения. Проверьте правильность ввода.")

        # Мгновенная регистрация по коду
        if not user:
            sender = getattr(event.message, "sender", None)
            first_name = getattr(sender, "first_name", getattr(sender, "firstName", ""))
            last_name = getattr(sender, "last_name", getattr(sender, "lastName", ""))
            fio = f"{first_name} {last_name}".strip()

            if not fio:
                fio = getattr(sender, "nick", getattr(sender, "firstName", f"Сотрудник {max_id_str}"))

            try:
                await db.add_user(pseudo_tg_id, fio, role_to_set)
                await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался по коду (Роль: {role_to_set}, Платформа: MAX)")
                msg = f"🎉 Регистрация успешно завершена!\n\n👤 Ваше имя: {fio}\n💼 Роль: {role_to_set}\n\nТеперь перейдите по ссылке для выбора бригады/техники:\n\n📱 {target_url}"
                return await send_max_msg(event, msg)
            except Exception as e:
                logger.error(f"Ошибка БД при регистрации через /join: {e}")
                return await send_max_msg(event,
                                          "❌ Произошла ошибка при сохранении данных. Пожалуйста, попробуйте еще раз.")
        else:
            return await send_max_msg(event, f"Для вступления/привязки перейдите по ссылке:\n\n📱 {target_url}")

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
            msg = "🔐 Добро пожаловать в ВИКС Расписание!\n\nЕсли вы администратор или прораб, введите системный пароль.\nЕсли вы рабочий или водитель, используйте команду /join [код]"
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
            await send_max_msg(event, "❌ Неверный ввод. Попробуйте снова (или используйте /join [код]):")
        return

    if current_state == "waiting_for_fio":
        fio = text
        role = state_data.get("role", "worker")
        try:
            await db.add_user(pseudo_tg_id, fio, role)
            await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался в боте MAX (Роль: {role})")
            USER_STATES.pop(max_id_str, None)
            msg = f"🎉 Регистрация успешно завершена!\n\n👤 ФИО: {fio}\n💼 Роль: {role}\n\nТеперь вы можете открыть рабочую платформу 👇\n\n{APP_LINK}"
            await send_max_msg(event, msg)
        except Exception as e:
            logger.error(f"Ошибка БД при регистрации ФИО: {e}")
            await send_max_msg(event, "❌ Произошла ошибка при сохранении данных.")
        return

    if user:
        await send_max_msg(event, f"Все функции доступны внутри платформы 👇\n\n{APP_LINK}")
    else:
        await send_max_msg(event, "Для начала работы введите команду /start или /join [код]")


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
    logger.info(">>> Бот MAX успешно запущен (Жесткое извлечение ID диалогов) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")