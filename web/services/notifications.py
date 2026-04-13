import os
import secrets
import aiohttp

from maxapi.types import ButtonsPayload, LinkButton, CallbackButton

from database_deps import db
from utils import get_all_linked_ids, resolve_id
from services.image_service import strip_html
from services.max_api import get_max_group_id, send_max_text, get_max_dm_chat_id
from services.tg_session import get_tg_session

from datetime import datetime, timedelta
from database_deps import TZ_BARNAUL

BASE_URL = os.getenv("WEB_APP_URL", "https://miniapp.viks22.ru")

# url_path → frontend route mapping
_URL_PATH_MAP = {
    "review": "/review",
    "my-apps": "/dashboard",
    "dashboard": "/dashboard",
    "kp": "/kp",
    "teams": "/resources",
    "equipment": "/resources",
    "objects": "/objects",
    "system": "/system",
}


async def _generate_auth_url(user_id: int, url_path: str = "dashboard") -> str:
    """Generate a short-lived auth URL with embedded session token."""
    redirect = _URL_PATH_MAP.get(url_path, f"/{url_path}")
    resolved_user_id = await resolve_id(user_id)
    token = secrets.token_urlsafe(16)
    try:
        await db.conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))",
            (token, resolved_user_id)
        )
        await db.conn.commit()
    except Exception:
        return f"{BASE_URL}{redirect}"
    return f"{BASE_URL}/auth?token={token}&redirect={redirect}"


# Маппинг категорий уведомлений на колонки в БД
NOTIFY_CATEGORY_COLUMNS = {
    "new_users": "notify_new_users",
    "orders": "notify_orders",
    "reports": "notify_reports",
    "errors": "notify_errors",
}


async def notify_group_chat(text: str, url_path: str = "dashboard", target_platform: str = "all"):
    """Отправляет уведомление только в групповой чат (TG + MAX)"""
    if db.conn is None: await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")
    max_group_id = await get_max_group_id()

    redirect = _URL_PATH_MAP.get(url_path, f"/{url_path}")
    markup = {"inline_keyboard": [
        [{"text": "📱 Открыть платформу", "web_app": {"url": f"{BASE_URL}/{url_path}"}}]]}

    if target_platform in ["all", "tg"] and bot_token and group_id:
        try:
            async with await get_tg_session() as session:
                await session.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": str(group_id), "text": text, "parse_mode": "HTML", "reply_markup": markup}
                )
            try:
                await db.add_log(0, 'Система', f"📨 TG групповое: {strip_html(text)[:100]}", target_type='notification')
            except Exception:
                pass
        except:
            pass

    if target_platform in ["all", "max"] and max_bot_token and max_group_id:
        max_plain_text = strip_html(text)
        max_buttons = [[LinkButton(text="📱 Открыть платформу", url=f"{BASE_URL}{redirect}")]]
        max_payload = ButtonsPayload(buttons=max_buttons).pack()
        await send_max_text(max_bot_token, max_group_id, max_plain_text, attachments=[max_payload])
        try:
            await db.add_log(0, 'Система', f"📨 MAX групповое: {max_plain_text[:100]}", target_type='notification')
        except Exception:
            pass


async def notify_users(target_roles: list, text: str, url_path: str = "dashboard", extra_tg_ids: list = None,
                       target_platform: str = "all", category: str = None,
                       tg_reply_markup: dict = None, max_attachments: list = None):
    """Универсальная рассылка уведомлений в личные DM (Telegram и MAX) с учетом настроек пользователя.
    category: 'new_users' | 'orders' | 'reports' | 'errors' | None (None = всегда отправлять)
    """
    if db.conn is None: await db.init_db()

    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")

    raw_user_ids = set()

    roles_to_fetch = [r for r in target_roles if r != "report_group"]
    if roles_to_fetch:
        pl = ','.join(['?'] * len(roles_to_fetch))
        try:
            async with db.conn.execute(f"SELECT user_id FROM users WHERE role IN ({pl}) AND is_blacklisted = 0",
                                       roles_to_fetch) as cur:
                for row in await cur.fetchall():
                    if row and row[0]: raw_user_ids.add(int(row[0]))
        except:
            pass

    if extra_tg_ids:
        for tid in extra_tg_ids:
            if tid: raw_user_ids.add(int(tid))

    # --- ПРОВЕРЯЕМ НАСТРОЙКИ УВЕДОМЛЕНИЙ (Тумблеры) ---
    final_tg_ids = set()
    final_max_ids = set()

    cat_col = NOTIFY_CATEGORY_COLUMNS.get(category) if category else None

    user_prefs = {}
    if raw_user_ids:
        pl_ids = ','.join(['?'] * len(raw_user_ids))
        try:
            cat_select = f", {cat_col}" if cat_col else ""
            async with db.conn.execute(f"SELECT user_id, notify_tg, notify_max{cat_select} FROM users WHERE user_id IN ({pl_ids})",
                                       list(raw_user_ids)) as cur:
                for row in await cur.fetchall():
                    cat_enabled = row[3] != 0 if cat_col else True
                    user_prefs[row[0]] = {"tg": row[1] != 0, "max": row[2] != 0, "cat": cat_enabled}
        except:
            pass

    for uid in raw_user_ids:
        prefs = user_prefs.get(uid, {"tg": True, "max": True, "cat": True})
        if not prefs["cat"]:
            continue  # Пользователь отключил эту категорию — пропускаем
        linked_ids = await get_all_linked_ids(uid)

        for lid in linked_ids:
            if lid > 0 and prefs["tg"]:
                final_tg_ids.add(lid)
            elif lid < 0 and prefs["max"]:
                final_max_ids.add(abs(lid))

    markup = tg_reply_markup or {"inline_keyboard": [
        [{"text": "📱 Открыть платформу", "web_app": {"url": f"{BASE_URL}/{url_path}"}}]]}

    max_plain_text = strip_html(text)
    short_text = strip_html(text)[:100]

    # Batch-lookup FIO for logging
    _fio_cache = {}
    all_log_ids = set(final_tg_ids) | {-int(m) for m in final_max_ids}
    if all_log_ids:
        try:
            for _lid in all_log_ids:
                u = await db.get_user(_lid)
                if u:
                    _fio_cache[_lid] = dict(u).get('fio', f'#{_lid}')
        except Exception:
            pass

    # Групповой чат — только если явно указан "report_group"
    if "report_group" in target_roles:
        if group_id and target_platform in ["all", "tg"] and bot_token:
            try:
                async with await get_tg_session() as session:
                    await session.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={"chat_id": str(group_id), "text": text, "parse_mode": "HTML", "reply_markup": markup}
                    )
            except:
                pass

    # Личные сообщения — MAX DM (с персональными auth-токенами)
    if target_platform in ["all", "max"] and max_bot_token:
        for mid in final_max_ids:
            dm_chat_id = await get_max_dm_chat_id(str(mid))
            if max_attachments is not None:
                att = max_attachments
            else:
                auth_url = await _generate_auth_url(-int(mid), url_path)
                max_btn = [[LinkButton(text="📱 Открыть платформу", url=auth_url)]]
                att = [ButtonsPayload(buttons=max_btn).pack()]
            await send_max_text(max_bot_token, dm_chat_id, max_plain_text, attachments=att)
            try:
                fio = _fio_cache.get(-int(mid), f'MAX#{mid}')
                await db.add_log(0, 'Система', f"📨 MAX → {fio}: {short_text}", target_type='notification', target_id=int(mid))
            except Exception:
                pass

    if target_platform in ["all", "tg"] and bot_token:
        try:
            async with await get_tg_session() as session:
                for tid in final_tg_ids:
                    try:
                        await session.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": tid, "text": text, "parse_mode": "HTML", "reply_markup": markup}
                        )
                        try:
                            fio = _fio_cache.get(tid, f'TG#{tid}')
                            await db.add_log(0, 'Система', f"📨 TG → {fio}: {short_text}", target_type='notification', target_id=tid)
                        except Exception:
                            pass
                    except:
                        pass
        except:
            pass


async def send_schedule_notifications(target_date: str):
    """Отправить уведомления по ОДОБРЕННЫМ заявкам на указанную дату. НЕ меняет статусы."""
    if db.conn is None: await db.init_db()

    async with db.conn.execute(
        "SELECT * FROM applications WHERE status = 'approved' AND date_target = ?",
        (target_date,)
    ) as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]

    count = 0
    for app in apps:
        # Собираем ID всех участников
        all_involved = []
        if app.get('foreman_id'):
            all_involved.append(app['foreman_id'])

        selected = app.get('selected_members', '')
        if selected:
            selected_list = [int(x.strip()) for x in selected.split(',') if x.strip().isdigit()]
            if selected_list:
                pl = ','.join(['?'] * len(selected_list))
                async with db.conn.execute(
                    f"SELECT tg_user_id FROM team_members WHERE id IN ({pl})", selected_list
                ) as c:
                    for r in await c.fetchall():
                        if r[0]: all_involved.append(r[0])

        eq_data_str = app.get('equipment_data', '')
        if eq_data_str:
            try:
                import json
                for eq in json.loads(eq_data_str):
                    async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?", (eq['id'],)) as c:
                        eq_row = await c.fetchone()
                        if eq_row and eq_row[0]: all_involved.append(eq_row[0])
            except:
                pass

        all_involved = list(set(all_involved))
        if all_involved:
            msg = (f"📢 <b>Наряд на {target_date}:</b>\n"
                   f"Вы назначены на объект <b>{app.get('object_address', '—')}</b>\n"
                   f"📅 Дата: {target_date}")
            await notify_users([], msg, "my-apps", extra_tg_ids=all_involved, category="orders")
            count += 1

    return count


ROLE_LABELS = {
    'superadmin': 'Суперадмин',
    'boss': 'Руководитель',
    'moderator': 'Модератор',
    'foreman': 'Прораб',
    'worker': 'Рабочий',
    'viewer': 'Наблюдатель',
}


async def notify_role_conflict(primary_id: int, secondary_id: int, primary_role: str, secondary_role: str):
    """Уведомляет модераторов+ о конфликте ролей при слиянии аккаунтов."""
    if db.conn is None: await db.init_db()

    # Получаем ФИО основного аккаунта
    user = await db.get_user(primary_id)
    fio = dict(user).get('fio', 'Неизвестный') if user else 'Неизвестный'

    tg_role_label = ROLE_LABELS.get(primary_role if primary_id > 0 else secondary_role, primary_role)
    max_role_label = ROLE_LABELS.get(secondary_role if primary_id > 0 else primary_role, secondary_role)

    text = (
        f"⚠️ <b>Конфликт ролей при связывании аккаунтов</b>\n\n"
        f"Пользователь: {fio}\n"
        f"TG роль: {tg_role_label}\n"
        f"MAX роль: {max_role_label}\n\n"
        f"Выберите роль:"
    )

    # Определяем роли для кнопок
    roles_for_buttons = []
    for r in [primary_role, secondary_role]:
        if r not in roles_for_buttons:
            roles_for_buttons.append(r)

    tg_buttons = [[{"text": ROLE_LABELS.get(r, r), "callback_data": f"set_role:{primary_id}:{r}"}] for r in roles_for_buttons]
    tg_markup = {"inline_keyboard": tg_buttons}

    max_buttons = [[CallbackButton(text=ROLE_LABELS.get(r, r), payload=f"set_role:{primary_id}:{r}")] for r in roles_for_buttons]
    max_payload = ButtonsPayload(buttons=max_buttons).pack()

    await notify_users(
        ["superadmin", "boss", "moderator"],
        text,
        url_path="system",
        tg_reply_markup=tg_markup,
        max_attachments=[max_payload],
        category=None,
    )


async def notify_fio_match(new_user_id: int, new_fio: str, existing_user_id: int, existing_fio: str):
    """Уведомляет модераторов+ о возможном совпадении аккаунтов на разных платформах."""
    platform_new = "TG" if new_user_id > 0 else "MAX"
    platform_existing = "TG" if existing_user_id > 0 else "MAX"

    text = (
        f"🔗 <b>Возможное совпадение аккаунтов</b>\n\n"
        f"{new_fio} ({platform_new}) похож на {existing_fio} ({platform_existing})\n\n"
        f"Свяжите аккаунты вручную в разделе Система → Пользователи, "
        f"или пользователь может сделать это сам в Профиле."
    )

    await notify_users(
        ["superadmin", "boss", "moderator"],
        text,
        url_path="system",
        category=None,
    )
