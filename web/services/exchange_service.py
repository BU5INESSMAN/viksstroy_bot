import json
import logging

from database_deps import db
from utils import resolve_id
from services.notifications import notify_users

logger = logging.getLogger(__name__)


# ── helpers ──────────────────────────────────────────────────────────

async def _get_equip_name(equip_id: int) -> str:
    async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (equip_id,)) as cur:
        row = await cur.fetchone()
        return row[0] if row else f"Техника #{equip_id}"


async def _get_equip(equip_id: int):
    async with db.conn.execute("SELECT * FROM equipment WHERE id = ?", (equip_id,)) as cur:
        row = await cur.fetchone()
        if row:
            return dict(zip([c[0] for c in cur.description], row))
        return None


async def _get_user_fio(user_id: int) -> str:
    user = await db.get_user(user_id)
    return dict(user).get('fio', f'Пользователь {user_id}') if user else f'Пользователь {user_id}'


async def _send_exchange_notification_with_buttons(donor_id: int, text: str, exchange_id: int):
    """Send notification with accept/reject inline buttons to donor via notify_users (TG + MAX)."""
    from maxapi.types import ButtonsPayload, CallbackButton

    tg_markup = {"inline_keyboard": [
        [{"text": "✅ Отдать", "callback_data": f"exchange_accept_{exchange_id}"}],
        [{"text": "❌ Отказать", "callback_data": f"exchange_reject_{exchange_id}"}]
    ]}

    max_buttons = [
        [CallbackButton(text="✅ Отдать", payload=f"exchange_accept_{exchange_id}")],
        [CallbackButton(text="❌ Отказать", payload=f"exchange_reject_{exchange_id}")]
    ]
    max_payload = ButtonsPayload(buttons=max_buttons).pack()

    await notify_users(
        [], text, "dashboard",
        extra_tg_ids=[donor_id],
        tg_reply_markup=tg_markup,
        max_attachments=[max_payload],
        category="exchange",
    )
    logger.info(f"Exchange notification with buttons sent to donor {donor_id} (exchange #{exchange_id})")


async def _notify_moderators_exchange(text: str):
    """Notify moderators about exchange events, respecting notify_exchange flag."""
    if db.conn is None:
        await db.init_db()
    try:
        async with db.conn.execute(
            "SELECT user_id FROM users WHERE role IN ('moderator', 'boss', 'superadmin') AND is_blacklisted = 0"
        ) as cur:
            mod_rows = await cur.fetchall()

        mod_ids = []
        for row in mod_rows:
            uid = row[0]
            # Check notify_exchange flag
            try:
                async with db.conn.execute("SELECT notify_exchange FROM users WHERE user_id = ?", (uid,)) as c2:
                    flag_row = await c2.fetchone()
                    if flag_row and flag_row[0] == 0:
                        continue
            except Exception:
                pass  # Column might not exist yet
            mod_ids.append(uid)

        if mod_ids:
            await notify_users([], text, "review", extra_tg_ids=mod_ids, category=None)
    except Exception as e:
        logger.error(f"Error notifying moderators about exchange: {e}")


# ── core logic ───────────────────────────────────────────────────────

async def create_exchange(requester_tg_id, requester_app_id, requested_equip_id, offered_equip_id):
    """Validate and create an equipment exchange request. Returns dict with success/error."""
    if db.conn is None:
        await db.init_db()

    # Check if exchange is enabled globally
    async with db.conn.execute("SELECT value FROM settings WHERE key = 'exchange_enabled'") as cur:
        row = await cur.fetchone()
        if row and row[0] == '0':
            return {"error": "Обмен техники отключён администратором."}

    real_tg_id = await resolve_id(int(requester_tg_id))
    user = await db.get_user(real_tg_id)
    if not user:
        return {"error": "Пользователь не найден."}
    user_dict = dict(user)
    if user_dict.get('role') not in ('foreman', 'moderator', 'boss', 'superadmin'):
        return {"error": "Недостаточно прав."}

    # Get requester's app to find date
    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (requester_app_id,)) as cur:
        req_app_row = await cur.fetchone()
    if not req_app_row:
        return {"error": "Заявка не найдена."}
    req_app = dict(zip([c[0] for c in cur.description], req_app_row))

    target_date = req_app['date_target']

    # Find the donor app: an app on the same date that contains requested_equip_id
    async with db.conn.execute(
        "SELECT * FROM applications WHERE date_target = ? AND status NOT IN ('rejected', 'cancelled') AND id != ?",
        (target_date, requester_app_id)
    ) as cur:
        candidate_apps = await cur.fetchall()
        columns = [c[0] for c in cur.description]

    donor_app = None
    for row in candidate_apps:
        app_dict = dict(zip(columns, row))
        eq_data = app_dict.get('equipment_data', '')
        if eq_data:
            try:
                eq_list = json.loads(eq_data)
                if any(e['id'] == requested_equip_id for e in eq_list):
                    donor_app = app_dict
                    break
            except (json.JSONDecodeError, TypeError):
                pass

    if not donor_app:
        return {"error": "Заявка с этой техникой не найдена."}

    donor_id = donor_app.get('foreman_id')
    donor_app_id = donor_app['id']

    # Validate donor app status
    if donor_app.get('status') in ('approved', 'in_progress', 'published', 'completed'):
        return {"error": "Заявка уже одобрена модератором. Обмен невозможен."}

    # Prevent duplicate pending exchanges from same requester for same equipment
    async with db.conn.execute(
        "SELECT id FROM equipment_exchanges WHERE requester_id = ? AND requested_equip_id = ? AND status = 'pending'",
        (real_tg_id, requested_equip_id)
    ) as cur:
        existing = await cur.fetchone()
    if existing:
        return {"error": "Вы уже отправили запрос на эту технику. Дождитесь ответа."}

    # Check pending exchanges
    if await db.is_equip_in_pending_exchange(requested_equip_id):
        return {"error": "Эта техника уже участвует в обмене. Попробуйте позже."}
    if await db.is_equip_in_pending_exchange(offered_equip_id):
        return {"error": "Предлагаемая техника уже участвует в обмене. Попробуйте позже."}

    # Validate offered equip belongs to requester's app or is free
    offered_equip = await _get_equip(offered_equip_id)
    requested_equip = await _get_equip(requested_equip_id)
    if not offered_equip or not requested_equip:
        return {"error": "Техника не найдена."}

    # Same category check
    if offered_equip.get('category') != requested_equip.get('category'):
        return {"error": "Техника должна быть одной категории."}

    # Check offered equip is in requester's app or free
    offered_in_app = False
    req_eq_data = req_app.get('equipment_data', '')
    if req_eq_data:
        try:
            req_eq_list = json.loads(req_eq_data)
            offered_in_app = any(e['id'] == offered_equip_id for e in req_eq_list)
        except (json.JSONDecodeError, TypeError):
            pass
    if not offered_in_app and offered_equip.get('status') != 'free':
        return {"error": "Предлагаемая техника недоступна."}

    # Create exchange
    exchange_id = await db.create_exchange(
        real_tg_id, requester_app_id, donor_id, donor_app_id, requested_equip_id, offered_equip_id
    )

    requester_name = user_dict.get('fio', 'Прораб')
    requested_equip_name = await _get_equip_name(requested_equip_id)
    offered_equip_name = await _get_equip_name(offered_equip_id)
    object_address = req_app.get('object_address', '')

    await db.add_log(real_tg_id, requester_name,
                     f"Запросил обмен техники: {requested_equip_name} ↔ {offered_equip_name}",
                     target_type='exchange', target_id=exchange_id)

    return {
        "success": True,
        "exchange_id": exchange_id,
        "_notify": {
            "donor_id": donor_id,
            "requester_name": requester_name,
            "requested_equip_name": requested_equip_name,
            "offered_equip_name": offered_equip_name,
            "object_address": object_address,
        }
    }


async def send_create_notifications(exchange_id: int, notify_data: dict):
    """Background notification task after exchange creation."""
    try:
        donor_text = (
            f"🔄 Прораб {notify_data['requester_name']} предлагает обмен техники:\n\n"
            f"Он хочет: <b>{notify_data['requested_equip_name']}</b>\n"
            f"Взамен предлагает: <b>{notify_data['offered_equip_name']}</b>\n\n"
            f"Объект: {notify_data['object_address']}"
        )
        await _send_exchange_notification_with_buttons(notify_data['donor_id'], donor_text, exchange_id)

        donor_name = await _get_user_fio(notify_data['donor_id'])
        mod_text = (
            f"🔄 Запрос обмена: {notify_data['requester_name']} → {donor_name}\n"
            f"Техника: {notify_data['requested_equip_name']} ↔ {notify_data['offered_equip_name']}"
        )
        await _notify_moderators_exchange(mod_text)
    except Exception as e:
        logger.error(f"Exchange notification error: {e}")


async def respond_to_exchange(exchange_id: int, tg_id, action: str):
    """Process accept/reject response to an exchange. Returns dict with success/error."""
    if db.conn is None:
        await db.init_db()

    real_tg_id = await resolve_id(int(tg_id))
    ex = await db.get_exchange(exchange_id)
    if not ex:
        return {"error": "Обмен не найден."}
    if ex['status'] != 'pending':
        return {"error": "Обмен уже завершён."}
    if ex['donor_id'] != real_tg_id:
        return {"error": "Только владелец техники может ответить."}

    requested_equip_name = await _get_equip_name(ex['requested_equip_id'])
    offered_equip_name = await _get_equip_name(ex['offered_equip_id'])
    requester_name = await _get_user_fio(ex['requester_id'])
    donor_name = await _get_user_fio(ex['donor_id'])

    if action == "reject":
        await db.resolve_exchange(exchange_id, 'rejected')
        await db.add_log(real_tg_id, donor_name,
                         f"Отклонил обмен техники №{exchange_id}",
                         target_type='exchange', target_id=exchange_id)
        return {
            "success": True,
            "status": "rejected",
            "_notify": {
                "type": "reject",
                "requester_id": ex['requester_id'],
                "donor_name": donor_name,
                "requester_name": requester_name,
                "requested_equip_name": requested_equip_name,
            }
        }

    # action == "accept" — execute swap
    try:
        # Get both apps
        async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (ex['donor_app_id'],)) as cur:
            donor_app_row = await cur.fetchone()
            donor_cols = [c[0] for c in cur.description]
        async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (ex['requester_app_id'],)) as cur:
            req_app_row = await cur.fetchone()
            req_cols = [c[0] for c in cur.description]

        if not donor_app_row or not req_app_row:
            return {"error": "Заявка не найдена."}

        donor_app = dict(zip(donor_cols, donor_app_row))
        req_app = dict(zip(req_cols, req_app_row))

        # Swap in donor app: replace requested_equip_id with offered_equip_id
        donor_eq_data = json.loads(donor_app.get('equipment_data', '[]') or '[]')
        for i, e in enumerate(donor_eq_data):
            if e['id'] == ex['requested_equip_id']:
                offered_equip = await _get_equip(ex['offered_equip_id'])
                display_name = offered_equip['name']
                if offered_equip.get('driver'):
                    display_name = f"{offered_equip['name']} ({offered_equip['driver']})"
                donor_eq_data[i] = {**e, 'id': ex['offered_equip_id'], 'name': display_name}
                break

        # Swap in requester app: replace offered_equip_id with requested_equip_id
        req_eq_data = json.loads(req_app.get('equipment_data', '[]') or '[]')
        found_in_req = False
        for i, e in enumerate(req_eq_data):
            if e['id'] == ex['offered_equip_id']:
                requested_equip = await _get_equip(ex['requested_equip_id'])
                display_name = requested_equip['name']
                if requested_equip.get('driver'):
                    display_name = f"{requested_equip['name']} ({requested_equip['driver']})"
                req_eq_data[i] = {**e, 'id': ex['requested_equip_id'], 'name': display_name}
                found_in_req = True
                break
        if not found_in_req:
            # Offered equip was free (not in requester's app), just add the requested one
            requested_equip = await _get_equip(ex['requested_equip_id'])
            display_name = requested_equip['name']
            if requested_equip.get('driver'):
                display_name = f"{requested_equip['name']} ({requested_equip['driver']})"
            req_eq_data.append({'id': ex['requested_equip_id'], 'name': display_name, 'time_start': '08', 'time_end': '17'})

        await db.conn.execute(
            "UPDATE applications SET equipment_data = ? WHERE id = ?",
            (json.dumps(donor_eq_data, ensure_ascii=False), ex['donor_app_id']))
        await db.conn.execute(
            "UPDATE applications SET equipment_data = ? WHERE id = ?",
            (json.dumps(req_eq_data, ensure_ascii=False), ex['requester_app_id']))

        await db.resolve_exchange(exchange_id, 'accepted')
        await db.add_log(real_tg_id, donor_name,
                         f"Принял обмен техники №{exchange_id}: {requested_equip_name} ↔ {offered_equip_name}",
                         target_type='exchange', target_id=exchange_id)

    except Exception as e:
        logger.error(f"Exchange swap error: {e}")
        return {"error": f"Ошибка обмена: {e}"}

    return {
        "success": True,
        "status": "accepted",
        "_notify": {
            "type": "accept",
            "requester_id": ex['requester_id'],
            "donor_id": ex['donor_id'],
            "requester_name": requester_name,
            "donor_name": donor_name,
            "requested_equip_name": requested_equip_name,
            "offered_equip_name": offered_equip_name,
        }
    }


async def send_respond_notifications(notify_data: dict):
    """Background notification task after exchange response."""
    try:
        if notify_data['type'] == 'reject':
            await notify_users(
                [], f"❌ Обмен отклонён. {notify_data['donor_name']} отказался обменять {notify_data['requested_equip_name']}.",
                "dashboard", extra_tg_ids=[notify_data['requester_id']], category="exchange")
            await _notify_moderators_exchange(
                f"❌ Обмен отклонён: {notify_data['requester_name']} ↔ {notify_data['donor_name']}")
        elif notify_data['type'] == 'accept':
            await notify_users(
                [], f"✅ Обмен завершён! Вы получили {notify_data['requested_equip_name']}.",
                "dashboard", extra_tg_ids=[notify_data['requester_id']], category="exchange")
            await notify_users(
                [], f"✅ Обмен завершён! Вы получили {notify_data['offered_equip_name']}.",
                "dashboard", extra_tg_ids=[notify_data['donor_id']], category="exchange")
            await _notify_moderators_exchange(
                f"✅ Обмен завершён: {notify_data['requester_name']} получил {notify_data['requested_equip_name']}, "
                f"{notify_data['donor_name']} получил {notify_data['offered_equip_name']}")
    except Exception as e:
        logger.error(f"Exchange respond notification error: {e}")


async def cancel_exchange_request(exchange_id: int, tg_id):
    """Cancel a pending exchange request. Returns dict with success/error."""
    if db.conn is None:
        await db.init_db()

    real_tg_id = await resolve_id(int(tg_id))
    ex = await db.get_exchange(exchange_id)
    if not ex:
        return {"error": "Обмен не найден."}
    if ex['status'] != 'pending':
        return {"error": "Обмен уже завершён."}
    if ex['requester_id'] != real_tg_id:
        return {"error": "Только инициатор может отменить."}

    await db.resolve_exchange(exchange_id, 'cancelled')

    requester_name = await _get_user_fio(ex['requester_id'])
    requested_equip_name = await _get_equip_name(ex['requested_equip_id'])

    await db.add_log(real_tg_id, requester_name,
                     f"Отменил обмен техники №{exchange_id}",
                     target_type='exchange', target_id=exchange_id)

    return {
        "success": True,
        "_notify": {
            "donor_id": ex['donor_id'],
            "requester_name": requester_name,
            "requested_equip_name": requested_equip_name,
        }
    }


async def send_cancel_notifications(notify_data: dict):
    """Background notification task after exchange cancellation."""
    try:
        await notify_users(
            [], f"↩️ Обмен отменён. {notify_data['requester_name']} отменил запрос на {notify_data['requested_equip_name']}.",
            "dashboard", extra_tg_ids=[notify_data['donor_id']], category="exchange")
    except Exception as e:
        logger.error(f"Exchange cancel notification error: {e}")


async def check_equip_exchange_status(equip_id: int, date: str):
    """Check if equipment is available for exchange on a given date. Returns dict."""
    if db.conn is None:
        await db.init_db()

    # Find which app holds this equip on this date
    async with db.conn.execute(
        "SELECT * FROM applications WHERE date_target = ? AND status NOT IN ('rejected', 'cancelled')",
        (date,)
    ) as cur:
        apps = await cur.fetchall()
        columns = [c[0] for c in cur.description]

    holder_app = None
    for row in apps:
        app_dict = dict(zip(columns, row))
        eq_data = app_dict.get('equipment_data', '')
        if eq_data:
            try:
                eq_list = json.loads(eq_data)
                if any(e['id'] == equip_id for e in eq_list):
                    holder_app = app_dict
                    break
            except (json.JSONDecodeError, TypeError):
                pass

    if not holder_app:
        return {"is_available": True, "can_exchange": False}

    holder_name = await _get_user_fio(holder_app.get('foreman_id', 0))
    holder_status = holder_app.get('status', '')
    is_in_pending = await db.is_equip_in_pending_exchange(equip_id)

    can_exchange = holder_status in ('pending', 'waiting') and not is_in_pending

    return {
        "is_available": False,
        "holder_app_id": holder_app['id'],
        "holder_name": holder_name,
        "holder_object": holder_app.get('object_address', ''),
        "holder_app_status": holder_status,
        "can_exchange": can_exchange,
        "is_in_pending_exchange": is_in_pending
    }
