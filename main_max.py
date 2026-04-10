import asyncio
import logging
import os
import sys
import random
import time
import re
from datetime import datetime, timedelta
import aiohttp
from dotenv import load_dotenv

from maxapi import Bot, Dispatcher, F
from maxapi.types import (
    MessageCreated,
    MessageCallback,
    ButtonsPayload,
    LinkButton,
    CallbackButton
)

current_dir = os.path.dirname(os.path.abspath(__file__))
web_dir = os.path.join(current_dir, "web")
sys.path.append(web_dir)

from database_deps import db, TZ_BARNAUL
from utils import notify_users

load_dotenv()

os.makedirs("data", exist_ok=True)
_log_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s")
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_log_formatter)
_file_handler = logging.FileHandler(os.path.join("data", "server.log"), encoding="utf-8")
_file_handler.setFormatter(_log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[_console_handler, _file_handler])
logger = logging.getLogger(__name__)

MAX_TOKEN = os.getenv("MAX_BOT_TOKEN", "").strip()

if not MAX_TOKEN:
    logger.error("КРИТИЧЕСКАЯ ОШИБКА: MAX_BOT_TOKEN не найден в .env")
    sys.exit(1)

bot = Bot(MAX_TOKEN)
dp = Dispatcher()

WEB_APP_URL = "https://miniapp.viks22.ru/"
USER_STATES = {}


async def resolve_id(raw_id: int):
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT primary_id FROM account_links WHERE secondary_id = ?", (raw_id,)) as cur:
        row = await cur.fetchone()
        if row: return row[0]
    return raw_id


async def send_max_msg(event, text: str, target_url: str = None, attachments: list = None):
    try:
        # Универсальная отправка для MessageCreated и MessageCallback
        if hasattr(event, "message") and hasattr(event.message, "answer"):
            answer_method = event.message.answer
        elif hasattr(event, "answer"):
            answer_method = event.answer
        else:
            return logger.error("Не найден метод answer у event")

        if target_url:
            buttons = [[LinkButton(text="📱 Открыть платформу", url=target_url)]]
            payload = ButtonsPayload(buttons=buttons).pack()
            await answer_method(text, attachments=[payload])
        elif attachments:
            # Если передали кастомные кнопки (Inline клавиатуру)
            await answer_method(text, attachments=attachments)
        else:
            await answer_method(text)
    except Exception as e:
        logger.warning(f"Ошибка ответа MAX: {e}")


async def extract_and_save_ids(event):
    """Универсальный и надежный извлекатель ID пользователя и чата."""
    user_id = None
    chat_id = None

    # 1. Извлекаем User ID (Того, кто совершил действие)
    if hasattr(event, "from_user") and getattr(event.from_user, "user_id", None):
        user_id = event.from_user.user_id
    elif hasattr(event, "callback") and hasattr(event.callback, "user") and getattr(event.callback.user, "user_id",
                                                                                    None):
        user_id = event.callback.user.user_id
    elif hasattr(event, "message") and hasattr(event.message, "sender") and getattr(event.message.sender, "user_id",
                                                                                    None):
        user_id = event.message.sender.user_id

    # 2. Извлекаем Chat ID (Диалог)
    if hasattr(event, "message") and hasattr(event.message, "chat"):
        chat_id = getattr(event.message.chat, "chat_id", None) or getattr(event.message.chat, "id", None)
    elif hasattr(event, "chat"):
        chat_id = getattr(event.chat, "chat_id", None) or getattr(event.chat, "id", None)

    # 3. Если Pydantic не справился, парсим сырую строку объекта
    event_str = str(event)

    if not user_id:
        m = re.search(r"user_id[=: ]*['\"]?(\d+)", event_str)
        if m: user_id = m.group(1)

    if not chat_id:
        m = re.search(r"chat_id[=: ]*['\"]?([-\w]+)", event_str)
        if m: chat_id = m.group(1)

    user_str = str(user_id).strip() if user_id else None
    chat_str = str(chat_id).strip() if chat_id else None

    if not user_str:
        return None, None, None

    # 4. ОБНОВЛЕНИЕ БАЗЫ ДАННЫХ
    is_group = chat_str and (chat_str.startswith("-") or "@chat" in chat_str)
    if chat_str and chat_str != "None" and not is_group:
        if db.conn is None: await db.init_db()
        try:
            # Очищаем старые кривые записи и записываем верный chat_id
            await db.conn.execute("DELETE FROM settings WHERE key = ?", (f'max_dm_{user_str}',))
            await db.conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (f'max_dm_{user_str}', chat_str))
            await db.conn.commit()
        except Exception as e:
            logger.error(f"❌ Ошибка БД при сохранении ЛС MAX: {e}")

    pseudo_tg_id = -int(user_str)
    real_tg_id = await resolve_id(pseudo_tg_id)

    return user_str, chat_str, real_tg_id


@dp.message_created(F.message.body.text)
async def message_handler(event: MessageCreated):
    max_id_str, chat_str, real_tg_id = await extract_and_save_ids(event)
    if not max_id_str: return
    pseudo_tg_id = -int(max_id_str)

    if db.conn is None: await db.init_db()
    user = await db.get_user(real_tg_id)

    text = event.message.body.text.strip()
    is_group = chat_str and (chat_str.startswith("-") or "@chat" in chat_str)

    state_data = USER_STATES.get(max_id_str, {})
    current_state = state_data.get("state")

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

    if text.startswith("/web"):
        if not user:
            return await send_max_msg(event, "❌ Сначала зарегистрируйтесь (используйте /start или /join).")
        code = str(random.randint(100000, 999999))
        expires = time.time() + 900
        try:
            await db.conn.execute("INSERT INTO link_codes (code, user_id, expires) VALUES (?, ?, ?)",
                                  (code, real_tg_id, expires))
            await db.conn.commit()
            await send_max_msg(event, f"Ваш код для привязки аккаунта: {code}\nДействителен 15 минут. Введите его в другом мессенджере или в профиле платформы.")
        except Exception:
            await send_max_msg(event, "Ошибка генерации кода.")
        return

    if text.startswith("/join"):
        parts = text.split()
        if len(parts) < 2:
            return await send_max_msg(event, "❌ Укажите код приглашения. Пример: /join 123456")

        code = parts[1].strip()

        # 1. Проверяем, код от бригады?
        async with db.conn.execute("SELECT id, name FROM teams WHERE invite_code = ? OR join_password = ?",
                                   (code, code)) as cur:
            t_row = await cur.fetchone()

        if t_row:
            team_id, team_name = t_row
            unclaimed = await db.get_unclaimed_workers(team_id)

            if not unclaimed:
                return await send_max_msg(event,
                                          f"В бригаде «{team_name}» нет свободных мест или все участники уже привязали аккаунты.")

            buttons = []
            for w in unclaimed:
                buttons.append(
                    [CallbackButton(text=f"👤 {w['fio']} ({w['position']})", payload=f"team_ask|{w['id']}|{code}")])

            payload = ButtonsPayload(buttons=buttons).pack()
            return await send_max_msg(event, f"👷‍♂️ Бригада: {team_name}\n\nВыберите ваш профиль из списка ниже:",
                                      attachments=[payload])

        # 2. Проверяем, код от техники?
        async with db.conn.execute("SELECT id, name FROM equipment WHERE invite_code = ?", (code,)) as cur:
            e_row = await cur.fetchone()

        if e_row:
            equip_id, equip_name = e_row
            buttons = [
                [CallbackButton(text="✅ Да, это я", payload=f"equip_yes|{equip_id}|{code}")],
                [CallbackButton(text="❌ Отмена", payload="join_cancel")]
            ]
            payload = ButtonsPayload(buttons=buttons).pack()
            return await send_max_msg(event,
                                      f"🚜 Привязка техники\nМашина: {equip_name}\n\nПодтверждаете привязку вашего аккаунта?",
                                      attachments=[payload])

        return await send_max_msg(event, "❌ Неверный код приглашения. Проверьте правильность ввода.")

    if text.startswith("/schedule"):
        if not user:
            return await send_max_msg(event, "❌ Сначала зарегистрируйтесь (используйте /start или /join).")
        user_role = dict(user).get('role', '')
        if user_role not in ['moderator', 'boss', 'superadmin']:
            return await send_max_msg(event, "❌ Эта команда доступна только модераторам и руководству.")
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Asia/Barnaul")
        args = text.split(maxsplit=1)[1].strip().lower() if len(text.split()) > 1 else ""
        if args in ['today', 'сегодня']:
            target_date = datetime.now(tz).strftime("%Y-%m-%d")
            label = "сегодня"
        else:
            target_date = (datetime.now(tz) + timedelta(days=1)).strftime("%Y-%m-%d")
            label = "завтра"
        await send_max_msg(event, f"⏳ Генерирую расстановку на {label} ({target_date})...")
        try:
            async with aiohttp.ClientSession() as session:
                fd = aiohttp.FormData()
                fd.add_field('tg_id', str(real_tg_id))
                fd.add_field('target_date', target_date)
                async with session.post("http://127.0.0.1:8000/api/applications/publish_schedule", data=fd) as resp:
                    if resp.status == 200:
                        await send_max_msg(event, f"✅ Расстановка на {target_date} опубликована в групповой чат!")
                    else:
                        error = await resp.json()
                        await send_max_msg(event, f"❌ Ошибка: {error.get('detail', 'Неизвестная ошибка')}")
        except Exception as e:
            await send_max_msg(event, f"❌ Ошибка: {str(e)}")
        return

    if text.startswith("/start"):
        if user:
            if dict(user).get('is_blacklisted'):
                await send_max_msg(event, "❌ Ваш аккаунт заблокирован. Обратитесь к руководству.")
            else:
                USER_STATES.pop(max_id_str, None)
                msg = f"С возвращением, {dict(user)['fio']}!\n\nИспользуйте кнопку ниже для запуска платформы:"
                await send_max_msg(event, msg, target_url=WEB_APP_URL)
        else:
            USER_STATES[max_id_str] = {"state": "waiting_for_password"}
            msg = "🔐 Добро пожаловать в ВИКС Расписание!\n\nЯ не нашел вас в базе данных.\nПожалуйста, введите ваш системный пароль или 6-значный код привязки (если аккаунт уже есть в Telegram).\nЕсли вы рабочий или водитель, используйте команду /join [код]"
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
                await send_max_msg(event, "✅ Аккаунты успешно связаны! Нажмите /start для обновления.")
                return
            else:
                await send_max_msg(event, "❌ Код недействителен или устарел. Введите правильный пароль или новый код привязки:")
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
            await send_max_msg(event, "❌ Неверный пароль. Попробуйте снова (или используйте /join [код]):")
        return

    if current_state == "waiting_for_fio":
        fio = text
        role = state_data.get("role", "worker")
        try:
            await db.add_user(pseudo_tg_id, fio, role)
            await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался в боте MAX (Роль: {role})")
            USER_STATES.pop(max_id_str, None)
            msg = f"🎉 Регистрация успешно завершена!\n\n👤 ФИО: {fio}\n💼 Роль: {role}\n\nТеперь вы можете открыть рабочую платформу 👇"
            await send_max_msg(event, msg, target_url=WEB_APP_URL)
        except Exception as e:
            logger.error(f"Ошибка БД при регистрации ФИО: {e}")
            await send_max_msg(event, "❌ Произошла ошибка при сохранении данных.")
        return

    if user:
        await send_max_msg(event, f"Все функции доступны внутри платформы 👇", target_url=WEB_APP_URL)
    else:
        await send_max_msg(event, "Для начала работы введите команду /start или /join [код]")


@dp.message_callback()
async def message_callback(event: MessageCallback):
    # 1. Извлекаем payload
    payload = None
    if hasattr(event, "callback") and hasattr(event.callback, "payload"):
        payload = event.callback.payload
    elif hasattr(event, "payload"):
        payload = event.payload

    if not payload and hasattr(event, "model_dump"):
        d = event.model_dump()
        payload = d.get("payload") or d.get("callback_data") or (d.get("callback", {})).get("payload")

    if not payload: return

    # 2. Извлекаем и сохраняем ID пользователя и чата, исправляя ошибку БД
    max_id_str, chat_str, real_tg_id = await extract_and_save_ids(event)
    if not max_id_str: return

    if db.conn is None: await db.init_db()

    # ---------------- ОТМЕНА ----------------
    if payload == "join_cancel":
        return await send_max_msg(event, "🛑 Действие отменено.")

    # ---------------- ВЫБОР РАБОЧЕГО (БРИГАДА) ----------------
    if payload.startswith("team_ask|"):
        parts = payload.split("|")
        if len(parts) != 3: return
        _, worker_id, code = parts

        async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
            w_row = await cur.fetchone()
        if not w_row: return await send_max_msg(event, "❌ Профиль не найден.")

        fio = w_row[0]
        buttons = [
            [CallbackButton(text="✅ Да, привязать", payload=f"team_yes|{worker_id}|{code}")],
            [CallbackButton(text="❌ Отмена", payload="join_cancel")]
        ]
        btn_payload = ButtonsPayload(buttons=buttons).pack()

        answer_method = getattr(event.message, "answer", None) if hasattr(event, "message") else getattr(event,
                                                                                                         "answer", None)
        if answer_method:
            return await answer_method(f"Привязать ваш мессенджер к профилю:\n👤 {fio}?", attachments=[btn_payload])
        return

    # ---------------- ПОДТВЕРЖДЕНИЕ ПРИВЯЗКИ (БРИГАДА) ----------------
    if payload.startswith("team_yes|"):
        parts = payload.split("|")
        if len(parts) != 3: return
        _, worker_id, code = parts

        async with db.conn.execute("SELECT name FROM teams WHERE invite_code = ? OR join_password = ?",
                                   (code, code)) as cur:
            t_row = await cur.fetchone()
        async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
            w_row = await cur.fetchone()

        if not t_row or not w_row: return await send_max_msg(event, "❌ Ошибка: данные не найдены.")

        team_name, fio = t_row[0], w_row[0]

        await db.conn.execute("UPDATE team_members SET tg_user_id = ? WHERE id = ?", (real_tg_id, worker_id))

        user = await db.get_user(real_tg_id)
        if not user:
            await db.add_user(real_tg_id, fio, "worker")
        elif user['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
            await db.update_user_role(real_tg_id, "worker")

        await db.conn.commit()

        await send_max_msg(event, f"✅ Успешно!\nВы привязаны как {fio} в бригаде «{team_name}».")

        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        await notify_users(["report_group", "boss", "superadmin"],
                           f"🔗 Привязка аккаунта (Бригада) MAX\n👤 Рабочий: {fio}\n🏗 Добавлен в бригаду: «{team_name}»\n🕒 Время: {now}",
                           "teams")

    # ---------------- ПОДТВЕРЖДЕНИЕ ПРИВЯЗКИ (ТЕХНИКА) ----------------
    if payload.startswith("equip_yes|"):
        parts = payload.split("|")
        if len(parts) != 3: return
        _, equip_id, code = parts

        async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (equip_id,)) as cur:
            e_row = await cur.fetchone()
        if not e_row: return await send_max_msg(event, "❌ Техника не найдена.")

        equip_name = e_row[0]

        await db.conn.execute("UPDATE equipment SET tg_id = ? WHERE id = ?", (real_tg_id, equip_id))

        user = await db.get_user(real_tg_id)
        fio = dict(user).get('fio', f"Пользователь {real_tg_id}") if user else f"Пользователь {real_tg_id}"

        if not user:
            await db.add_user(real_tg_id, fio, "driver")
        elif dict(user)['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
            await db.update_user_role(real_tg_id, "driver")

        await db.conn.commit()

        await send_max_msg(event, f"✅ Успешно!\nВы привязаны как водитель для: {equip_name}.")

        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        await notify_users(["report_group", "boss", "superadmin"],
                           f"🔗 Привязка аккаунта (Техника) MAX\n👤 Водитель: {fio}\n🚜 Привязан к технике: «{equip_name}»\n🕒 Время: {now}",
                           "equipment")


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
    logger.info(">>> Бот MAX успешно запущен (Исправлен баг с Chat ID) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")