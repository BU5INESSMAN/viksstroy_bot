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
from services.notifications import notify_users, notify_fio_match

load_dotenv()

API_URL = os.getenv("API_URL", "http://api:8000")

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
            fio = dict(user).get('fio', '') if user else ''
            await db.add_log(real_tg_id, fio, "Запросил код авторизации (MAX)", target_type='system')
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

    if text.startswith("/order") or text.lower() in ('заявка', '/заявка'):
        if not user:
            return await send_max_msg(event, "❌ Вы не зарегистрированы. Используйте /start")
        role = dict(user).get('role', 'worker')
        if role not in ('foreman', 'moderator', 'boss', 'superadmin'):
            return await send_max_msg(event, "❌ Создание заявок доступно только прорабам и руководству.")
        USER_STATES[max_id_str] = {"state": "order_select_date"}
        await _ord_show_dates(event)
        return

    # Order wizard: equipment time text input
    if current_state == "order_select_equip_time":
        t_start, t_end = _parse_time_range(text)
        if t_start is None:
            return await send_max_msg(event, "❌ Неверный формат. Примеры: 8-17, 08:00-17:00, 8 17")
        equip_id = state_data.get('_pending_eq_id')
        eq = next((e for e in state_data.get('_equip', []) if e['id'] == equip_id), {})
        eq_name = eq.get('name', '?')
        plate = eq.get('license_plate', '')
        driver = eq.get('driver_fio', '')
        display = eq_name
        if plate:
            display += f" [{plate}]"
        if driver and driver != 'Не указан':
            display += f" ({driver})"
        selected = [s for s in state_data.get('selected_equip', []) if s['id'] != equip_id]
        selected.append({'id': equip_id, 'name': display, 'time_start': t_start, 'time_end': t_end})
        state_data["selected_equip"] = selected
        state_data["_pending_eq_id"] = None
        state_data["state"] = "order_select_equip"
        USER_STATES[max_id_str] = state_data
        await _ord_show_equip(event, state_data, state_data.get('equip_page', 0))
        return

    # Order wizard: comment text input
    if current_state == "order_enter_comment":
        state_data["comment"] = text
        state_data["state"] = "order_confirm"
        USER_STATES[max_id_str] = state_data
        await _ord_show_confirm(event, state_data)
        return

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
        fio = dict(user).get('fio', '') if user else ''
        await db.add_log(real_tg_id, fio, f"Запросил расстановку через бота MAX на {target_date}", target_type='system')
        await send_max_msg(event, f"⏳ Генерирую расстановку на {label} ({target_date})...")
        try:
            async with aiohttp.ClientSession() as session:
                fd = aiohttp.FormData()
                fd.add_field('tg_id', str(real_tg_id))
                fd.add_field('target_date', target_date)
                async with session.post(f"{API_URL}/api/applications/publish_schedule", data=fd) as resp:
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
            msg = "🔐 Добро пожаловать в ВиКС!\n\nЯ не нашел вас в базе данных.\nПожалуйста, введите ваш системный пароль или 6-значный код привязки (если аккаунт уже есть в Telegram).\nЕсли вы рабочий или водитель, используйте команду /join [код]"
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
            await db.add_log(pseudo_tg_id, fio, f"Зарегистрировался в боте MAX (Роль: {role})", target_type='user', target_id=pseudo_tg_id)
            USER_STATES.pop(max_id_str, None)
            msg = f"🎉 Регистрация успешно завершена!\n\n👤 ФИО: {fio}\n💼 Роль: {role}\n\nТеперь вы можете открыть рабочую платформу 👇"
            await send_max_msg(event, msg, target_url=WEB_APP_URL)

            # Уведомление о новой регистрации + проверка совпадения ФИО
            async def _send_new_user_notification():
                try:
                    await notify_users(["report_group", "superadmin"],
                                       f"👤 Новая регистрация (MAX)\n📝 ФИО: {fio}\n💼 Роль: {role}\n🆔 ID: {pseudo_tg_id}",
                                       "system")
                except Exception as e:
                    logger.error(f"New user notification error: {e}")

            asyncio.create_task(_send_new_user_notification())

            async def _check_fio_and_notify():
                try:
                    if not fio or fio.startswith("Пользователь"):
                        return
                    platform_filter = "user_id > 0" if pseudo_tg_id < 0 else "user_id < 0"
                    async with db.conn.execute(
                        f"SELECT user_id, fio FROM users "
                        f"WHERE {platform_filter} AND linked_user_id IS NULL "
                        f"AND user_id != ? AND LOWER(TRIM(fio)) = LOWER(TRIM(?))",
                        (pseudo_tg_id, fio)
                    ) as cur:
                        matches = await cur.fetchall()
                    for match in matches:
                        await notify_fio_match(pseudo_tg_id, fio, match[0], match[1])
                except Exception as e:
                    logger.error(f"FIO match check error: {e}")

            asyncio.create_task(_check_fio_and_notify())
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

    # ---------------- SMART SCHEDULING: ОПУБЛИКОВАТЬ ----------------
    if payload == "smart_publish_now":
        user = await db.get_user(real_tg_id)
        if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
            return await send_max_msg(event, "❌ Нет прав для выполнения этого действия.")
        try:
            tomorrow = (datetime.now(TZ_BARNAUL) + timedelta(days=1)).strftime("%Y-%m-%d")
            async with aiohttp.ClientSession() as session:
                fd = aiohttp.FormData()
                fd.add_field('tg_id', str(real_tg_id))
                fd.add_field('date', tomorrow)
                async with session.post(
                    f"{API_URL}/api/system/send_schedule_group", data=fd
                ) as resp:
                    result = await resp.json()
                    count = result.get('notified', 0)
            await send_max_msg(event,
                               f"✅ Расстановка на завтра отправлена в группу!\n📋 Уведомлено нарядов: {count}")
        except Exception as e:
            await send_max_msg(event, f"❌ Ошибка: {e}")
        return

    # ---------------- SMART SCHEDULING: ОТЛОЖИТЬ ----------------
    if payload == "smart_publish_delay":
        user = await db.get_user(real_tg_id)
        if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
            return await send_max_msg(event, "❌ Нет прав для выполнения этого действия.")
        try:
            async with aiohttp.ClientSession() as session:
                fd = aiohttp.FormData()
                fd.add_field('tg_id', str(real_tg_id))
                async with session.post(
                    f"{API_URL}/api/system/delay_publish", data=fd
                ) as resp:
                    pass
            buttons = [
                [CallbackButton(text="✅ Опубликовать сейчас", payload="smart_publish_now")],
                [CallbackButton(text="⏳ Отложить ещё на 10 мин", payload="smart_publish_delay")]
            ]
            btn_payload = ButtonsPayload(buttons=buttons).pack()
            await send_max_msg(event,
                               "⏳ Отложено на 10 минут. Авто-публикация через 10 мин.",
                               attachments=[btn_payload])
        except Exception as e:
            await send_max_msg(event, f"❌ Ошибка: {e}")
        return

    # ---------------- ОБМЕН ТЕХНИКОЙ: ACCEPT / REJECT ----------------
    if payload.startswith("exchange_accept_") or payload.startswith("exchange_reject_"):
        parts = payload.split("_")
        if len(parts) >= 3:
            action = parts[1]  # "accept" or "reject"
            ex_id = parts[2]
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{API_URL}/api/exchange/{ex_id}/respond",
                        json={"tg_id": str(real_tg_id), "action": action}
                    ) as resp:
                        result = await resp.json()

                if result.get("success"):
                    msg = "✅ Вы согласились на обмен" if action == "accept" else "❌ Вы отказались от обмена"
                    await send_max_msg(event, msg)
                else:
                    await send_max_msg(event, result.get("error", "Ошибка"))
            except Exception as e:
                await send_max_msg(event, f"❌ Ошибка: {e}")
        return

    # ---------------- ORDER WIZARD ----------------
    if payload.startswith("ord_"):
        return await handle_order_callback(event, payload, max_id_str, real_tg_id)

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

        async def _send_team_link_notification():
            try:
                await notify_users(["report_group", "boss", "superadmin"],
                                   f"🔗 Привязка аккаунта (Бригада) MAX\n👤 Рабочий: {fio}\n🏗 Добавлен в бригаду: «{team_name}»\n🕒 Время: {now}",
                                   "teams")
            except Exception as e:
                logger.error(f"MAX team link notification error: {e}")

        asyncio.create_task(_send_team_link_notification())

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

        async def _send_equip_link_notification():
            try:
                await notify_users(["report_group", "boss", "superadmin"],
                                   f"🔗 Привязка аккаунта (Техника) MAX\n👤 Водитель: {fio}\n🚜 Привязан к технике: «{equip_name}»\n🕒 Время: {now}",
                                   "equipment")
            except Exception as e:
                logger.error(f"MAX equip link notification error: {e}")

        asyncio.create_task(_send_equip_link_notification())


# ═══════════════════════════════════════════════════════════════════════
# /order wizard — helpers & callback routing (MAX)
# ═══════════════════════════════════════════════════════════════════════

import json as _json
from zoneinfo import ZoneInfo

_ORD_PAGE = 10
_WD = {0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'}


def _parse_time_range(text):
    """Parse time range from user text. Returns (start_hh, end_hh) as zero-padded strings or (None, None)."""
    text = text.strip().replace(",", ".").replace(";", "-")
    patterns = [
        (r"(\d{1,2})[:\.](\d{2})\s*[-–—]\s*(\d{1,2})[:\.](\d{2})", True),
        (r"(\d{1,2})\s*[-–—]\s*(\d{1,2})", False),
        (r"(\d{1,2})\s+(\d{1,2})", False),
    ]
    for pattern, has_minutes in patterns:
        m = re.match(pattern, text)
        if m:
            g = m.groups()
            start_h = int(g[0])
            end_h = int(g[2]) if has_minutes else int(g[1])
            if 0 <= start_h <= 23 and 0 <= end_h <= 23 and start_h < end_h:
                return f"{start_h:02d}", f"{end_h:02d}"
    return None, None


def _ord_btns(rows):
    """Build ButtonsPayload attachment from list of (text, payload) row tuples."""
    return ButtonsPayload(buttons=[
        [CallbackButton(text=t, payload=p) for t, p in row] for row in rows
    ]).pack()


async def _ord_show_dates(event):
    tz = ZoneInfo("Asia/Barnaul")
    now = datetime.now(tz)
    rows = []
    for i in range(4):
        d = now + timedelta(days=i)
        wd = _WD[d.weekday()]
        if i == 0:
            label = f"Сегодня — {d.strftime('%d.%m')} ({wd})"
        elif i == 1:
            label = f"Завтра — {d.strftime('%d.%m')} ({wd})"
        else:
            label = f"{d.strftime('%d.%m')} ({wd})"
        rows.append([(label, f"ord_date|{d.strftime('%Y-%m-%d')}")])
    rows.append([("❌ Отмена", "ord_cancel")])
    await send_max_msg(event, "📋 Создание заявки\n\nВыберите дату выезда:", attachments=[_ord_btns(rows)])


async def _ord_show_objects(event, state, page):
    objects = state.get('_objects', [])
    start = page * _ORD_PAGE
    items = objects[start:start + _ORD_PAGE]
    total = (len(objects) + _ORD_PAGE - 1) // _ORD_PAGE
    rows = []
    for o in items:
        name = o.get('name', '?')
        label = f"📍 {name}" if len(name) <= 28 else f"📍 {name[:25]}..."
        rows.append([(label, f"ord_obj|{o['id']}")])
    nav = []
    if page > 0:
        nav.append(("◀ Назад", f"ord_objp|{page - 1}"))
    if start + _ORD_PAGE < len(objects):
        nav.append(("Вперёд ▶", f"ord_objp|{page + 1}"))
    if nav:
        rows.append(nav)
    rows.append([("❌ Отмена", "ord_cancel")])
    header = f"📍 Выберите объект ({page + 1}/{total}):" if total > 1 else "📍 Выберите объект:"
    await send_max_msg(event, header, attachments=[_ord_btns(rows)])


async def _ord_load_free_teams(date_target):
    raw = await db.get_all_teams()
    teams = [dict(t) for t in raw]
    busy = set()
    try:
        async with db.conn.execute(
            "SELECT team_id FROM applications WHERE date_target = ? AND status NOT IN ('rejected', 'cancelled') AND is_team_freed = 0 AND team_id IS NOT NULL AND team_id != '0'",
            (date_target,)
        ) as cur:
            for row in await cur.fetchall():
                if row[0]:
                    for tid in str(row[0]).split(','):
                        tid = tid.strip()
                        if tid and tid != '0':
                            busy.add(int(tid))
    except Exception:
        pass
    return [t for t in teams if t['id'] not in busy]


async def _ord_show_teams(event, state, page):
    teams = state.get('_teams', [])
    selected = state.get('selected_teams', [])
    start = page * _ORD_PAGE
    items = teams[start:start + _ORD_PAGE]
    rows = []
    for t in items:
        prefix = "✅ " if t['id'] in selected else ""
        rows.append([(f"{prefix}👷 {t.get('name', '?')}", f"ord_tm|{t['id']}")])
    nav = []
    if page > 0:
        nav.append(("◀ Назад", f"ord_tmp|{page - 1}"))
    if start + _ORD_PAGE < len(teams):
        nav.append(("Вперёд ▶", f"ord_tmp|{page + 1}"))
    if nav:
        rows.append(nav)
    rows.append([("⏭ Пропустить", "ord_tm_skip"), ("✅ Готово", "ord_tm_done")])
    rows.append([("❌ Отмена", "ord_cancel")])
    sel = f"\nВыбрано: {len(selected)}" if selected else ""
    await send_max_msg(event, f"👷 Выберите бригады (можно несколько):{sel}", attachments=[_ord_btns(rows)])


async def _ord_load_free_equip(date_target):
    raw = await db.get_all_equipment_admin()
    all_eq = [dict(e) for e in raw]
    available = [e for e in all_eq if e.get('is_active', 1) == 1 and e.get('status') != 'repair']
    booked = set()
    try:
        async with db.conn.execute(
            "SELECT equipment_data FROM applications WHERE date_target = ? AND status NOT IN ('rejected', 'cancelled')",
            (date_target,)
        ) as cur:
            for row in await cur.fetchall():
                if row[0]:
                    try:
                        for eq in _json.loads(row[0]):
                            if not eq.get('is_freed'):
                                booked.add(eq['id'])
                    except Exception:
                        pass
    except Exception:
        pass
    return [e for e in available if e['id'] not in booked]


async def _ord_show_equip(event, state, page):
    equip = state.get('_equip', [])
    selected = state.get('selected_equip', [])
    start = page * _ORD_PAGE
    items = equip[start:start + _ORD_PAGE]
    rows = []
    for eq in items:
        is_sel = any(s['id'] == eq['id'] for s in selected)
        prefix = "✅ " if is_sel else ""
        short = eq.get('name', '?').split(' ')[0]
        label = f"{prefix}🚛 {short}"
        plate = eq.get('license_plate', '')
        if plate:
            label += f" [{plate}]"
        driver = eq.get('driver_fio', '')
        if driver and driver != 'Не указан':
            label += f" • {driver}"
        if len(label) > 45:
            label = label[:42] + "..."
        rows.append([(label, f"ord_eq|{eq['id']}")])
    nav = []
    if page > 0:
        nav.append(("◀ Назад", f"ord_eqp|{page - 1}"))
    if start + _ORD_PAGE < len(equip):
        nav.append(("Вперёд ▶", f"ord_eqp|{page + 1}"))
    if nav:
        rows.append(nav)
    rows.append([("⏭ Пропустить", "ord_eq_skip"), ("✅ Готово", "ord_eq_done")])
    rows.append([("❌ Отмена", "ord_cancel")])
    sel = f"\nВыбрано: {len(selected)}" if selected else ""
    await send_max_msg(event, f"🚛 Выберите технику:{sel}", attachments=[_ord_btns(rows)])


async def _ord_show_time(event, eq):
    short = eq.get('name', '?').split(' ')[0]
    plate = eq.get('license_plate', '')
    label = f"{short} [{plate}]" if plate else short
    rows = [
        [("◀ Назад к технике", "ord_eq_back")],
    ]
    await send_max_msg(event,
        f"⏰ Введите время для {label}:\n\n"
        f"Формат: начало-конец\n"
        f"Примеры: 8-17, 08:00-17:00, 8 17",
        attachments=[_ord_btns(rows)])


async def _ord_show_comment(event):
    rows = [
        [("⏭ Без комментария", "ord_nocomment")],
        [("❌ Отмена", "ord_cancel")],
    ]
    await send_max_msg(event, "💬 Введите комментарий к заявке или нажмите «Без комментария»:", attachments=[_ord_btns(rows)])


async def _ord_show_confirm(event, state):
    teams = state.get('_teams', [])
    sel_teams = state.get('selected_teams', [])
    sel_equip = state.get('selected_equip', [])
    team_names = [t.get('name', '?') for t in teams if t['id'] in sel_teams]
    equip_lines = [f"{e['name'].split(' ')[0]} ({e['time_start']}:00–{e['time_end']}:00)" for e in sel_equip]
    summary = (
        f"📋 Подтверждение заявки\n\n"
        f"📅 Дата: {state.get('date_target', '?')}\n"
        f"📍 Объект: {state.get('object_address', '?')}\n"
        f"👷 Бригады: {', '.join(team_names) if team_names else 'не выбраны'}\n"
        f"🚛 Техника: {', '.join(equip_lines) if equip_lines else 'не выбрана'}\n"
        f"💬 Комментарий: {state.get('comment') or '—'}"
    )
    rows = [
        [("✅ Создать заявку", "ord_submit")],
        [("✏️ Изменить", "ord_edit")],
        [("❌ Отмена", "ord_cancel")],
    ]
    await send_max_msg(event, summary, attachments=[_ord_btns(rows)])


async def _ord_show_edit_menu(event):
    rows = [
        [("📅 Дату", "ord_e_date"), ("📍 Объект", "ord_e_obj")],
        [("👷 Бригады", "ord_e_team"), ("🚛 Технику", "ord_e_equip")],
        [("💬 Комментарий", "ord_e_comm")],
        [("◀ Назад", "ord_e_back")],
    ]
    await send_max_msg(event, "✏️ Что изменить?", attachments=[_ord_btns(rows)])


async def handle_order_callback(event, payload, max_id_str, real_tg_id):
    """Route all ord_* callback payloads for the order wizard."""
    if db.conn is None:
        await db.init_db()

    state = USER_STATES.get(max_id_str, {})

    # ── Cancel ──
    if payload == "ord_cancel":
        USER_STATES.pop(max_id_str, None)
        return await send_max_msg(event, "❌ Создание заявки отменено.")

    # ── Date selected ──
    if payload.startswith("ord_date|"):
        date_str = payload.split("|")[1]
        objects = await db.get_objects()
        if not objects:
            USER_STATES.pop(max_id_str, None)
            return await send_max_msg(event, "❌ Нет активных объектов. Создайте объект в платформе.")
        state.update({"state": "order_select_object", "date_target": date_str, "_objects": objects, "obj_page": 0})
        USER_STATES[max_id_str] = state
        return await _ord_show_objects(event, state, 0)

    # ── Object pagination ──
    if payload.startswith("ord_objp|"):
        page = int(payload.split("|")[1])
        state["obj_page"] = page
        USER_STATES[max_id_str] = state
        return await _ord_show_objects(event, state, page)

    # ── Object selected ──
    if payload.startswith("ord_obj|"):
        obj_id = int(payload.split("|")[1])
        obj = next((o for o in state.get('_objects', []) if o['id'] == obj_id), None)
        if not obj:
            return await send_max_msg(event, "❌ Объект не найден.")
        state["object_id"] = obj_id
        state["object_address"] = f"{obj.get('name', '?')} ({obj.get('address', '')})"
        state["selected_teams"] = []
        free_teams = await _ord_load_free_teams(state.get('date_target', ''))
        state["_teams"] = free_teams
        state["team_page"] = 0
        if not free_teams:
            state["state"] = "order_select_equip"
            free_equip = await _ord_load_free_equip(state.get('date_target', ''))
            state["_equip"] = free_equip
            state["selected_equip"] = []
            state["equip_page"] = 0
            USER_STATES[max_id_str] = state
            if not free_equip:
                state["state"] = "order_enter_comment"
                USER_STATES[max_id_str] = state
                return await _ord_show_comment(event)
            return await _ord_show_equip(event, state, 0)
        state["state"] = "order_select_teams"
        USER_STATES[max_id_str] = state
        return await _ord_show_teams(event, state, 0)

    # ── Team toggle ──
    if payload.startswith("ord_tm|"):
        team_id = int(payload.split("|")[1])
        selected = list(state.get('selected_teams', []))
        if team_id in selected:
            selected.remove(team_id)
        else:
            selected.append(team_id)
        state["selected_teams"] = selected
        USER_STATES[max_id_str] = state
        return await _ord_show_teams(event, state, state.get('team_page', 0))

    # ── Team pagination ──
    if payload.startswith("ord_tmp|"):
        page = int(payload.split("|")[1])
        state["team_page"] = page
        USER_STATES[max_id_str] = state
        return await _ord_show_teams(event, state, page)

    # ── Teams done / skip ──
    if payload in ("ord_tm_done", "ord_tm_skip"):
        free_equip = await _ord_load_free_equip(state.get('date_target', ''))
        state["_equip"] = free_equip
        state["selected_equip"] = state.get("selected_equip", [])
        state["equip_page"] = 0
        if not free_equip:
            state["state"] = "order_enter_comment"
            USER_STATES[max_id_str] = state
            return await _ord_show_comment(event)
        state["state"] = "order_select_equip"
        USER_STATES[max_id_str] = state
        return await _ord_show_equip(event, state, 0)

    # ── Equipment select (toggle or time pick) ──
    if payload.startswith("ord_eq|"):
        equip_id = int(payload.split("|")[1])
        selected = list(state.get('selected_equip', []))
        # If already selected — remove (toggle off)
        if any(s['id'] == equip_id for s in selected):
            state["selected_equip"] = [s for s in selected if s['id'] != equip_id]
            USER_STATES[max_id_str] = state
            return await _ord_show_equip(event, state, state.get('equip_page', 0))
        # Show time picker
        eq = next((e for e in state.get('_equip', []) if e['id'] == equip_id), {})
        state["_pending_eq_id"] = equip_id
        state["state"] = "order_select_equip_time"
        USER_STATES[max_id_str] = state
        return await _ord_show_time(event, eq)

    # ── Equipment back from time picker ──
    if payload == "ord_eq_back":
        state["state"] = "order_select_equip"
        state["_pending_eq_id"] = None
        USER_STATES[max_id_str] = state
        return await _ord_show_equip(event, state, state.get('equip_page', 0))

    # ── Equipment pagination ──
    if payload.startswith("ord_eqp|"):
        page = int(payload.split("|")[1])
        state["equip_page"] = page
        USER_STATES[max_id_str] = state
        return await _ord_show_equip(event, state, page)

    # ── Equipment done / skip ──
    if payload in ("ord_eq_done", "ord_eq_skip"):
        state["state"] = "order_enter_comment"
        USER_STATES[max_id_str] = state
        return await _ord_show_comment(event)

    # ── No comment ──
    if payload == "ord_nocomment":
        state["comment"] = ""
        state["state"] = "order_confirm"
        USER_STATES[max_id_str] = state
        return await _ord_show_confirm(event, state)

    # ── Edit menu ──
    if payload == "ord_edit":
        return await _ord_show_edit_menu(event)

    if payload == "ord_e_date":
        state["state"] = "order_select_date"
        USER_STATES[max_id_str] = state
        return await _ord_show_dates(event)

    if payload == "ord_e_obj":
        state["state"] = "order_select_object"
        USER_STATES[max_id_str] = state
        return await _ord_show_objects(event, state, 0)

    if payload == "ord_e_team":
        teams = state.get('_teams', [])
        if not teams:
            return await send_max_msg(event, "Нет свободных бригад на эту дату.")
        state["state"] = "order_select_teams"
        USER_STATES[max_id_str] = state
        return await _ord_show_teams(event, state, 0)

    if payload == "ord_e_equip":
        equip = state.get('_equip', [])
        if not equip:
            return await send_max_msg(event, "Нет свободной техники на эту дату.")
        state["state"] = "order_select_equip"
        USER_STATES[max_id_str] = state
        return await _ord_show_equip(event, state, 0)

    if payload == "ord_e_comm":
        state["state"] = "order_enter_comment"
        USER_STATES[max_id_str] = state
        return await _ord_show_comment(event)

    if payload == "ord_e_back":
        state["state"] = "order_confirm"
        USER_STATES[max_id_str] = state
        return await _ord_show_confirm(event, state)

    # ── Submit ──
    if payload == "ord_submit":
        equip_payload = [{'id': e['id'], 'name': e['name'], 'time_start': e['time_start'], 'time_end': e['time_end']} for e in state.get('selected_equip', [])]
        # Auto-select all members from chosen teams
        selected_teams = state.get('selected_teams', [])
        member_ids = []
        for tid in selected_teams:
            try:
                members = await db.get_team_members(tid)
                for m in members:
                    mid = dict(m).get('id')
                    if mid:
                        member_ids.append(mid)
            except Exception:
                pass
        form = aiohttp.FormData()
        form.add_field('tg_id', str(real_tg_id))
        form.add_field('date_target', state.get('date_target', ''))
        form.add_field('object_address', state.get('object_address', ''))
        form.add_field('object_id', str(state.get('object_id', 0)))
        form.add_field('team_id', ','.join(str(t) for t in selected_teams) or '0')
        form.add_field('selected_members', ','.join(str(m) for m in member_ids))
        form.add_field('equipment_data', _json.dumps(equip_payload, ensure_ascii=False) if equip_payload else '')
        form.add_field('comment', state.get('comment', ''))
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{API_URL}/api/applications/create", data=form) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        app_id = result.get('id', '?')
                        await send_max_msg(event,
                            f"✅ Заявка #{app_id} создана!\n\n"
                            f"📅 {state.get('date_target')}\n"
                            f"📍 {state.get('object_address')}\n\n"
                            f"Заявка отправлена на модерацию.")
                    elif resp.status == 409:
                        error = await resp.json()
                        detail = error.get('detail', 'Бригада или техника уже заняты.')
                        await send_max_msg(event, f"⚠️ Конфликт ресурсов:\n{detail}\n\nНажмите /order чтобы попробовать снова.")
                    else:
                        await send_max_msg(event, f"❌ Ошибка создания заявки (код {resp.status}). Попробуйте /order")
        except Exception as e:
            logger.error(f"MAX order submit error: {e}")
            await send_max_msg(event, "❌ Ошибка связи с сервером. Попробуйте /order")
        USER_STATES.pop(max_id_str, None)
        return


# ═══════════════════════════════════════════════════════════════════════


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