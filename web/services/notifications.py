import os
import json
import logging
import secrets
import asyncio
import aiohttp

from maxapi.types import ButtonsPayload, LinkButton, CallbackButton

from database_deps import db
from utils import get_all_linked_ids, resolve_id
from services.image_service import strip_html
from services.max_api import get_max_group_id, send_max_text, get_max_dm_chat_id
from services.tg_session import get_tg_session
from services.push_templates import build_push_payload
from utils_fio import get_user_settings


# Maps channel name → settings key used by Settings page toggles
CHANNEL_KEY = {
    'telegram': 'notify_telegram',
    'max': 'notify_max',
    'pwa': 'notify_pwa',
}

# Maps notification type → settings key for per-type filtering
TYPE_KEY = {
    'app_new': 'notify_new_apps',
    'smr_debt': 'notify_smr_debtors',
    'object_request': 'notify_object_requests',
    'exchange_request': 'notify_exchanges',
}


def should_send(user: dict, channel: str, notification_type: str | None = None) -> bool:
    """Check Settings-page toggles before dispatching a notification to a user.

    Layered on TOP of legacy notify_tg / notify_max columns (both must pass).
    """
    if not user:
        return True
    settings = get_user_settings(user.get('settings') if isinstance(user, dict) else '{}')
    ck = CHANNEL_KEY.get(channel)
    if ck and not settings.get(ck, True):
        return False
    tk = TYPE_KEY.get(notification_type)
    if tk and not settings.get(tk, True):
        return False
    return True

from datetime import datetime, timedelta
from database_deps import TZ_BARNAUL

logger = logging.getLogger("NOTIFICATIONS")

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
    "exchange": "notify_exchange",
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
                       tg_reply_markup: dict = None, max_attachments: list = None,
                       push_type: str = None, push_body: str = None):
    """Универсальная рассылка уведомлений в личные DM (Telegram и MAX) с учетом настроек пользователя.
    category: 'new_users' | 'orders' | 'reports' | 'errors' | None (None = всегда отправлять)
    push_type: typed push notification key (e.g. 'app_approved'); forwarded to build_push_payload.
    push_body: single-line push body (no emojis, ' • ' separators); falls back to stripped text.
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
    user_settings_by_id: dict[int, dict] = {}
    if raw_user_ids:
        pl_ids = ','.join(['?'] * len(raw_user_ids))
        try:
            cat_select = f", {cat_col}" if cat_col else ""
            async with db.conn.execute(f"SELECT user_id, notify_tg, notify_max{cat_select}, settings FROM users WHERE user_id IN ({pl_ids})",
                                       list(raw_user_ids)) as cur:
                for row in await cur.fetchall():
                    cat_enabled = row[3] != 0 if cat_col else True
                    settings_json = row[-1]  # last column
                    user_prefs[row[0]] = {"tg": row[1] != 0, "max": row[2] != 0, "cat": cat_enabled}
                    user_settings_by_id[row[0]] = get_user_settings(settings_json)
        except Exception:
            pass

    for uid in raw_user_ids:
        prefs = user_prefs.get(uid, {"tg": True, "max": True, "cat": True})
        if not prefs["cat"]:
            continue  # Пользователь отключил эту категорию — пропускаем
        # New settings-page toggles layered on top (Stage 2)
        user_settings = user_settings_by_id.get(uid, get_user_settings('{}'))
        type_key = TYPE_KEY.get(push_type)
        if type_key and not user_settings.get(type_key, True):
            logger.debug(f"notify: user {uid} opted out of type {push_type}")
            continue
        linked_ids = await get_all_linked_ids(uid)

        tg_allowed = prefs["tg"] and user_settings.get("notify_telegram", True)
        max_allowed = prefs["max"] and user_settings.get("notify_max", True)

        for lid in linked_ids:
            if lid > 0 and tg_allowed:
                final_tg_ids.add(lid)
            elif lid < 0 and max_allowed:
                final_max_ids.add(abs(lid))

    # ── Save to notification center (one entry per user, before platform split) ──
    redirect = _URL_PATH_MAP.get(url_path, f"/{url_path}")
    _notif_plain = strip_html(text)
    _notif_title = _notif_plain[:100]
    _notif_body = _notif_plain[:500]
    _notif_type = category or 'info'
    for uid in raw_user_ids:
        prefs = user_prefs.get(uid, {"cat": True})
        if not prefs["cat"]:
            continue
        try:
            await db.conn.execute(
                "INSERT INTO user_notifications (user_id, type, title, body, link_url) VALUES (?, ?, ?, ?, ?)",
                (uid, _notif_type, _notif_title, _notif_body, redirect)
            )
        except Exception:
            pass
    try:
        await db.conn.commit()
    except Exception:
        pass

    markup = tg_reply_markup or {"inline_keyboard": [
        [{"text": "📱 Открыть платформу", "web_app": {"url": f"{BASE_URL}/{url_path}"}}]]}

    max_plain_text = _notif_plain
    short_text = _notif_title

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

    # v2.4.1 FIX 2: collect per-recipient lines into one grouped log entry
    # rather than writing a row per channel.
    _event_lines: list[str] = []

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
            ok = True
            try:
                await send_max_text(max_bot_token, dm_chat_id, max_plain_text, attachments=att)
            except Exception:
                ok = False
            fio = _fio_cache.get(-int(mid), f'MAX#{mid}')
            _event_lines.append(f"MAX → {fio}" + ("" if ok else " · ОШИБКА"))

    if target_platform in ["all", "tg"] and bot_token:
        try:
            async with await get_tg_session() as session:
                for tid in final_tg_ids:
                    ok = True
                    try:
                        await session.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": tid, "text": text, "parse_mode": "HTML", "reply_markup": markup}
                        )
                    except Exception:
                        ok = False
                    fio = _fio_cache.get(tid, f'TG#{tid}')
                    _event_lines.append(f"TG → {fio}" + ("" if ok else " · ОШИБКА"))
        except Exception:
            pass

    # ── Web Push (fire-and-forget, never blocks TG/MAX flow) ──
    try:
        push_user_ids = list(raw_user_ids)
        if push_user_ids:
            final_push_body = push_body or _notif_body
            # For the grouped log, mark every enrolled user — actual delivery
            # success per endpoint is handled inside _send_web_push_safe.
            for uid in push_user_ids:
                fio = _fio_cache.get(uid, f"#{uid}")
                _event_lines.append(f"Push → {fio}")
            asyncio.create_task(_send_web_push_safe(
                push_user_ids, _notif_title, final_push_body, redirect,
                push_type=push_type,
            ))
    except Exception:
        pass

    # v2.4.1 FIX 2: single grouped log entry for the whole dispatch
    if _event_lines:
        unique_lines = sorted(set(_event_lines))
        try:
            recipients_count = len(set(final_tg_ids) | set(final_max_ids) | set(push_user_ids if 'push_user_ids' in dir() else []))
        except Exception:
            recipients_count = len(unique_lines)
        summary = f"📨 Уведомление ({recipients_count} получ.): {short_text}"
        try:
            await db.add_log(
                0, 'Система', summary,
                target_type='notification',
                details="\n".join(unique_lines),
            )
        except Exception:
            pass


def validate_vapid_keys() -> None:
    """Startup diagnostic: try to parse the VAPID private key and log the
    result. No-op if keys are unset. Called from api_main on lifespan
    startup so ops gets a clear signal before the first push fires."""
    priv = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    if not priv:
        logger.warning("VAPID_PRIVATE_KEY is unset — PWA push disabled")
        return
    try:
        import py_vapid
        vapid = py_vapid.Vapid.from_raw(priv.encode() if isinstance(priv, str) else priv)
        pub_len = len(vapid.public_key.public_bytes_raw()) if hasattr(vapid.public_key, 'public_bytes_raw') else -1
        logger.info(f"VAPID keys validated OK (public key bytes={pub_len})")
    except Exception as e:
        logger.error(
            f"VAPID keys INVALID: {e}. "
            f"Regenerate with: vapid --gen  (output: public_key / private_key as base64url)."
        )


async def _send_web_push_safe(user_ids: list, title: str, body: str, url: str = "/dashboard",
                              push_type: str = None):
    """Send typed web push to all subscriptions for given user_ids. Fire-and-forget."""
    vapid_private = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    vapid_public = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    if not vapid_private or not vapid_public:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return

    # BadJwtToken on iOS is almost always a claims problem — the `sub`
    # MUST start with "mailto:" (some push servers 403 on plain emails).
    raw_sub = os.getenv("VAPID_CLAIM_EMAIL", "admin@viks22.ru").strip()
    if not raw_sub.startswith("mailto:") and not raw_sub.startswith("https:"):
        raw_sub = "mailto:" + raw_sub
    # v2.4.7: `aud` must be the origin of the push-resource endpoint
    # (e.g. https://fcm.googleapis.com for Chrome, https://updates.push.services.mozilla.com
    # for Firefox). It is computed per-subscription in the loop below.
    base_claims = {"sub": raw_sub}

    if not user_ids:
        return

    try:
        placeholders = ",".join("?" * len(user_ids))
        async with db.conn.execute(
            f"SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN ({placeholders})",
            tuple(user_ids),
        ) as cur:
            subscriptions = await cur.fetchall()
    except Exception as e:
        logger.warning(f"PUSH — DB query error: {e}")
        return

    if not subscriptions:
        return

    # Filter by notify_pwa + per-type toggle from user settings (Stage 2)
    pwa_opted_out: set[int] = set()
    try:
        placeholders = ",".join("?" * len(user_ids))
        async with db.conn.execute(
            f"SELECT user_id, settings FROM users WHERE user_id IN ({placeholders})",
            tuple(user_ids),
        ) as cur:
            for row in await cur.fetchall():
                s = get_user_settings(row[1])
                if not s.get("notify_pwa", True):
                    pwa_opted_out.add(int(row[0]))
                    continue
                type_key = TYPE_KEY.get(push_type)
                if type_key and not s.get(type_key, True):
                    pwa_opted_out.add(int(row[0]))
    except Exception:
        pass

    payload = json.dumps(build_push_payload(
        push_type or "",
        body[:200],
        url,
    ))

    from urllib.parse import urlparse

    expired_ids = []
    for sub in subscriptions:
        sub_id, sub_uid, endpoint, p256dh, auth_key = sub[0], sub[1], sub[2], sub[3], sub[4]
        if int(sub_uid) in pwa_opted_out:
            logger.debug(f"PUSH — user {sub_uid} opted out of PWA/{push_type}")
            continue
        sub_info = {"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}}

        # v2.4.7: set `aud` to the push-service origin for this specific
        # subscription. Chrome → https://fcm.googleapis.com,
        # Firefox → https://updates.push.services.mozilla.com,
        # Apple   → https://web.push.apple.com, etc.
        try:
            parsed = urlparse(endpoint or "")
            aud = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
        except Exception:
            aud = ""
        vapid_claims = dict(base_claims)
        if aud:
            vapid_claims["aud"] = aud

        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=vapid_private,
                vapid_claims=vapid_claims,
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                expired_ids.append(sub_id)
                logger.info(f"PUSH — Subscription expired for user {sub_uid}, removing")
            elif e.response and e.response.status_code == 403:
                # 403 from a push service: either the `aud` claim doesn't
                # match the endpoint origin, the `sub` is malformed, or
                # the VAPID key is wrong.
                body_text = ""
                try:
                    body_text = e.response.text
                except Exception:
                    pass
                logger.error(
                    f"PUSH VAPID 403 for user {sub_uid}: "
                    f"sub={vapid_claims.get('sub')!r}, "
                    f"aud={vapid_claims.get('aud')!r}, "
                    f"key_len={len(vapid_private)}, "
                    f"key_prefix={vapid_private[:10]!r}, "
                    f"endpoint_host={endpoint.split('/')[2] if '/' in endpoint else '?'}, "
                    f"body={body_text[:200]}"
                )
            else:
                logger.warning(f"PUSH — Failed for user {sub_uid}: {e}")
        except Exception as e:
            logger.warning(f"PUSH — Error: {e}")

    if expired_ids:
        try:
            placeholders = ",".join("?" * len(expired_ids))
            await db.conn.execute(f"DELETE FROM push_subscriptions WHERE id IN ({placeholders})", tuple(expired_ids))
            await db.conn.commit()
        except Exception:
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
