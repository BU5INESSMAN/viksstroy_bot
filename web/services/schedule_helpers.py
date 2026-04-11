import os
import aiohttp

from maxapi.types import ButtonsPayload, CallbackButton

from datetime import datetime, timedelta
from database_deps import db, TZ_BARNAUL
from utils import get_all_linked_ids
from services.image_service import strip_html
from services.max_api import get_max_dm_chat_id, send_max_text


async def get_smr_debtors():
    """Должники СМР: прорабы, у которых наряд 'in_progress' с date_target <= сегодня."""
    if db.conn is None: await db.init_db()
    today_str = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d")

    async with db.conn.execute(
        "SELECT DISTINCT foreman_id, foreman_name, object_address, date_target FROM applications "
        "WHERE status = 'in_progress' AND date_target <= ? AND foreman_id IS NOT NULL "
        "ORDER BY date_target ASC",
        (today_str,)
    ) as cur:
        rows = await cur.fetchall()

    return [{"foreman_id": r[0], "foreman_name": r[1] or "Неизвестный",
             "object_address": r[2] or "—", "date_target": r[3]} for r in rows]


async def get_waiting_apps_for_date(target_date: str):
    """Получить непроверенные (waiting) заявки на дату для предупреждения."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute(
        "SELECT object_address, foreman_name FROM applications WHERE status = 'waiting' AND date_target = ?",
        (target_date,)
    ) as cur:
        return [{"object_address": r[0] or "—", "foreman_name": r[1] or "—"} for r in await cur.fetchall()]


async def get_schedule_dates():
    """Получить список дат, на которые есть хотя бы одна заявка (не archived, не cancelled/rejected)."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute(
        "SELECT DISTINCT date_target FROM applications "
        "WHERE status IN ('pending', 'waiting', 'approved', 'published', 'in_progress') "
        "AND (is_archived = 0 OR is_archived IS NULL) "
        "ORDER BY date_target ASC"
    ) as cur:
        return [r[0] for r in await cur.fetchall()]


async def send_smart_schedule_prompt():
    """Отправить модераторам запрос на публикацию расстановки с inline-кнопками (TG + MAX)."""
    if db.conn is None: await db.init_db()

    debtors = await get_smr_debtors()
    tomorrow_str = (datetime.now(TZ_BARNAUL) + timedelta(days=1)).strftime("%Y-%m-%d")

    async with db.conn.execute(
        "SELECT COUNT(*) FROM applications WHERE status = 'approved' AND date_target = ?",
        (tomorrow_str,)
    ) as cur:
        approved_count = (await cur.fetchone())[0]

    async with db.conn.execute(
        "SELECT COUNT(*) FROM applications WHERE status = 'waiting' AND date_target = ?",
        (tomorrow_str,)
    ) as cur:
        waiting_count = (await cur.fetchone())[0]

    debtors_text = ", ".join(list({d['foreman_name'] for d in debtors})) if debtors else "Нет"

    warning = f"\n⚠️ Непроверенных заявок: {waiting_count}" if waiting_count > 0 else ""

    text = (
        f"📅 <b>Подготовка нарядов на завтра</b>\n"
        f"⚠️ <b>Должники по СМР:</b> {debtors_text}\n"
        f"📋 Одобренных заявок на завтра: {approved_count}"
        f"{warning}\n"
        f"❓ Отправить расстановку по одобренным?"
    )

    # Устанавливаем таймер авто-публикации через 10 минут
    publish_at = datetime.now(TZ_BARNAUL) + timedelta(minutes=10)
    await db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('smart_publish_at', ?)",
        (publish_at.strftime("%Y-%m-%d %H:%M:%S"),))
    await db.conn.commit()

    bot_token = os.getenv("BOT_TOKEN")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")

    # Получаем модераторов+
    async with db.conn.execute(
        "SELECT user_id, notify_tg, notify_max FROM users "
        "WHERE role IN ('moderator', 'boss', 'superadmin') AND is_blacklisted = 0"
    ) as cur:
        mod_users = await cur.fetchall()

    tg_markup = {"inline_keyboard": [
        [{"text": "✅ Опубликовать", "callback_data": "smart_publish_now"}],
        [{"text": "⏳ Отложить на 10 мин", "callback_data": "smart_publish_delay"}]
    ]}

    max_plain_text = strip_html(text)

    for user_row in mod_users:
        uid, notify_tg, notify_max = user_row
        linked_ids = await get_all_linked_ids(uid)

        for lid in linked_ids:
            if lid > 0 and notify_tg and bot_token:
                try:
                    async with aiohttp.ClientSession() as session:
                        await session.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": lid, "text": text,
                                  "parse_mode": "HTML", "reply_markup": tg_markup}
                        )
                except:
                    pass
            elif lid < 0 and notify_max and max_bot_token:
                max_buttons = [
                    [CallbackButton(text="✅ Опубликовать", payload="smart_publish_now")],
                    [CallbackButton(text="⏳ Отложить на 10 мин", payload="smart_publish_delay")]
                ]
                max_payload = ButtonsPayload(buttons=max_buttons).pack()
                dm_chat_id = await get_max_dm_chat_id(str(abs(lid)))
                await send_max_text(max_bot_token, dm_chat_id, max_plain_text,
                                    attachments=[max_payload])
