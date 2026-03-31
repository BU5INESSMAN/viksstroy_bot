import asyncio
import logging
import os
import sys
import random
import time
import re
from datetime import datetime
from dotenv import load_dotenv

from maxapi import Bot, Dispatcher, F
from maxapi.types import (
    MessageCreated,
    MessageCallback,
    ButtonsPayload,
    LinkButton,
    CallbackButton
)

# Подключаем папку web, чтобы Python увидел database_deps и другие модули бэкенда
current_dir = os.path.dirname(os.path.abspath(__file__))
web_dir = os.path.join(current_dir, "web")
sys.path.append(web_dir)

from database_deps import db, TZ_BARNAUL
from utils import notify_users

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
USER_STATES = {}


async def resolve_id(raw_id: int):
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT primary_id FROM account_links WHERE secondary_id = ?", (raw_id,)) as cur:
        row = await cur.fetchone()
        if row: return row[0]
    return raw_id


async def send_max_msg(event: MessageCreated, text: str, target_url: str = None):
    try:
        if target_url:
            buttons = [[LinkButton(text="📱 Открыть платформу", url=target_url)]]
            payload = ButtonsPayload(buttons=buttons).pack()
            await event.message.answer(text, attachments=[payload])
        else:
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

    # --- 2. ПУЛЕНЕПРОБИВАЕМЫЙ ПОИСК CHAT_ID ---
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
        match = re.search(r"chat_id[=: ]*['\"]?([-\w]+)", str(event))
        if match: chat_id = match.group(1)

    chat_str = str(chat_id).strip() if chat_id else "None"
    is_group = chat_str.startswith("-") or "@chat" in chat_str

    if not is_group and chat_str != "None":
        try:
            await db.conn.execute("DELETE FROM settings WHERE key = ?", (f'max_dm_{max_id_str}',))
            await db.conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (f'max_dm_{max_id_str}', chat_str))
            await db.conn.commit()
        except Exception as e:
            logger.error(f"❌ Ошибка БД при сохранении ЛС MAX: {e}")

    pseudo_tg_id = -int(max_id)
    real_tg_id = await resolve_id(pseudo_tg_id)
    user = await db.get_user(real_tg_id)

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
            await send_max_msg(event, f"Ваш код для привязки: {code}\nДействителен 15 минут. Введите его на платформе.")
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

            # Генерируем Callback-кнопки с участниками
            buttons = []
            for w in unclaimed:
                buttons.append(
                    [CallbackButton(text=f"👤 {w['fio']} ({w['position']})", payload=f"team_ask|{w['id']}|{code}")])

            payload = ButtonsPayload(buttons=buttons).pack()
            return await event.message.answer(f"👷‍♂️ Бригада: {team_name}\n\nВыберите ваш профиль из списка ниже:",
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
            return await event.message.answer(
                f"🚜 Привязка техники\nМашина: {equip_name}\n\nПодтверждаете привязку вашего аккаунта?",
                attachments=[payload])

        return await send_max_msg(event, "❌ Неверный код приглашения. Проверьте правильность ввода.")

    if text.startswith("/start"):
        if user:
            if dict(user).get('is_blacklisted'):
                await send_max_msg(event, "❌ Ваш аккаунт заблокирован.")
            else:
                USER_STATES.pop(max_id_str, None)
                msg = f"С возвращением, {dict(user)['fio']}!\n\nНажмите на кнопку ниже для запуска:"
                await send_max_msg(event, msg, target_url=WEB_APP_URL)
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
                await send_max_msg(event, f"✅ Аккаунты успешно связаны!", target_url=WEB_APP_URL)
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


# =====================================================================
# НОВЫЙ ОБРАБОТЧИК КЛИКОВ ПО КНОПКАМ СОГЛАСНО ДОКУМЕНТАЦИИ MAXAPI
# =====================================================================
@dp.message_callback()
async def message_callback(callback: MessageCallback):
    if db.conn is None: await db.init_db()

    # Пытаемся достать payload (в разных версиях API он может лежать в разных полях)
    payload = getattr(callback, "payload", None) or getattr(callback, "callback_data", None) or getattr(callback,
                                                                                                        "text", None)
    if not payload: return

    # Пытаемся достать ID пользователя (надежный парсинг)
    max_id = None
    try:
        max_id = callback.from_user.user_id if hasattr(callback, "from_user") else None
    except:
        pass
    if not max_id:
        try:
            max_id = callback.message.sender.user_id if hasattr(callback.message, "sender") else None
        except:
            pass
    if not max_id:
        try:
            max_id = callback.user_id
        except:
            pass

    if not max_id: return

    pseudo_tg_id = -int(max_id)
    real_tg_id = await resolve_id(pseudo_tg_id)

    # ---------------- ОТМЕНА ----------------
    if payload == "join_cancel":
        return await callback.message.answer("🛑 Действие отменено.")

    # ---------------- ВЫБОР РАБОЧЕГО (БРИГАДА) ----------------
    if payload.startswith("team_ask|"):
        parts = payload.split("|")
        if len(parts) != 3: return
        _, worker_id, code = parts

        async with db.conn.execute("SELECT fio FROM team_members WHERE id = ?", (worker_id,)) as cur:
            w_row = await cur.fetchone()
        if not w_row: return await callback.message.answer("❌ Профиль не найден.")

        fio = w_row[0]
        buttons = [
            [CallbackButton(text="✅ Да, привязать", payload=f"team_yes|{worker_id}|{code}")],
            [CallbackButton(text="❌ Отмена", payload="join_cancel")]
        ]
        btn_payload = ButtonsPayload(buttons=buttons).pack()
        return await callback.message.answer(f"Привязать ваш мессенджер к профилю:\n👤 {fio}?",
                                             attachments=[btn_payload])

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

        if not t_row or not w_row: return await callback.message.answer("❌ Ошибка: данные не найдены.")

        team_name, fio = t_row[0], w_row[0]

        await db.conn.execute("UPDATE team_members SET tg_user_id = ? WHERE id = ?", (real_tg_id, worker_id))

        user = await db.get_user(real_tg_id)
        if not user:
            await db.add_user(real_tg_id, fio, "worker")
        elif user['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
            await db.update_user_role(real_tg_id, "worker")

        await db.conn.commit()

        await callback.message.answer(f"✅ Успешно!\nВы привязаны как {fio} в бригаде «{team_name}».")

        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        await notify_users(["report_group", "boss", "superadmin"],
                           f"🔗 <b>Привязка аккаунта (Бригада) MAX</b>\n👤 Рабочий: {fio}\n🏗 Добавлен в бригаду: «{team_name}»\n🕒 Время: {now}",
                           "teams")

    # ---------------- ПОДТВЕРЖДЕНИЕ ПРИВЯЗКИ (ТЕХНИКА) ----------------
    if payload.startswith("equip_yes|"):
        parts = payload.split("|")
        if len(parts) != 3: return
        _, equip_id, code = parts

        async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (equip_id,)) as cur:
            e_row = await cur.fetchone()
        if not e_row: return await callback.message.answer("❌ Техника не найдена.")

        equip_name = e_row[0]

        await db.conn.execute("UPDATE equipment SET tg_id = ? WHERE id = ?", (real_tg_id, equip_id))

        user = await db.get_user(real_tg_id)
        fio = dict(user).get('fio', f"Пользователь {real_tg_id}") if user else f"Пользователь {real_tg_id}"

        if not user:
            await db.add_user(real_tg_id, fio, "driver")
        elif dict(user)['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
            await db.update_user_role(real_tg_id, "driver")

        await db.conn.commit()

        await callback.message.answer(f"✅ Успешно!\nВы привязаны как водитель для: {equip_name}.")

        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        await notify_users(["report_group", "boss", "superadmin"],
                           f"🔗 <b>Привязка аккаунта (Техника) MAX</b>\n👤 Водитель: {fio}\n🚜 Привязан к технике: «{equip_name}»\n🕒 Время: {now}",
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
    logger.info(">>> Бот MAX успешно запущен (Добавлена обработка кнопок) <<<")
    await dp.start_polling(bot)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот MAX остановлен.")