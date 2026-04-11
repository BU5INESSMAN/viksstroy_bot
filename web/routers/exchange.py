# === ONE-TIME CLEANUP: Remove spam duplicate pending exchanges ===
# Run manually:
#   sqlite3 data/viksstroy.db "UPDATE equipment_exchanges SET status='cancelled' WHERE status='pending' AND id NOT IN (SELECT MIN(id) FROM equipment_exchanges WHERE status='pending' GROUP BY requester_id, requested_equip_id)"
# =================================================================

import sys
import os
import json
import asyncio
import logging

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Request, HTTPException
from database_deps import db, TZ_BARNAUL
from utils import resolve_id, notify_users, get_all_linked_ids, strip_html, \
    send_max_text, get_max_dm_chat_id

import aiohttp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exchange", tags=["exchange"])


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
    """Send notification with accept/reject inline buttons to donor (TG + MAX)."""
    bot_token = os.getenv("BOT_TOKEN")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")

    linked_ids = await get_all_linked_ids(donor_id)

    tg_markup = {"inline_keyboard": [
        [{"text": "\u2705 \u041e\u0442\u0434\u0430\u0442\u044c", "callback_data": f"exchange_accept_{exchange_id}"}],
        [{"text": "\u274c \u041e\u0442\u043a\u0430\u0437\u0430\u0442\u044c", "callback_data": f"exchange_reject_{exchange_id}"}]
    ]}

    plain_text = strip_html(text)

    for lid in linked_ids:
        if lid > 0 and bot_token:
            try:
                async with aiohttp.ClientSession() as session:
                    await session.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={"chat_id": lid, "text": text, "parse_mode": "HTML", "reply_markup": tg_markup}
                    )
            except Exception as e:
                logger.error(f"TG exchange notification error: {e}")
        elif lid < 0 and max_bot_token:
            from maxapi.types import ButtonsPayload, CallbackButton
            max_buttons = [
                [CallbackButton(text="\u2705 \u041e\u0442\u0434\u0430\u0442\u044c", payload=f"exchange_accept_{exchange_id}")],
                [CallbackButton(text="\u274c \u041e\u0442\u043a\u0430\u0437\u0430\u0442\u044c", payload=f"exchange_reject_{exchange_id}")]
            ]
            max_payload = ButtonsPayload(buttons=max_buttons).pack()
            dm_chat_id = await get_max_dm_chat_id(str(abs(lid)))
            await send_max_text(max_bot_token, dm_chat_id, plain_text, attachments=[max_payload])


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


@router.post("/request")
async def create_exchange_request(request: Request):
    data = await request.json()
    requester_tg_id = data.get("requester_tg_id")
    requester_app_id = data.get("requester_app_id")
    requested_equip_id = data.get("requested_equip_id")
    offered_equip_id = data.get("offered_equip_id")

    logger.info(f"Exchange request: requester={requester_tg_id}, app={requester_app_id}, "
                f"wants={requested_equip_id}, offers={offered_equip_id}")

    if not all([requester_tg_id, requester_app_id, requested_equip_id, offered_equip_id]):
        return {"error": "\u041d\u0435 \u0432\u0441\u0435 \u043f\u043e\u043b\u044f \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u044b."}

    if db.conn is None:
        await db.init_db()

    real_tg_id = await resolve_id(int(requester_tg_id))
    user = await db.get_user(real_tg_id)
    if not user:
        return {"error": "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d."}
    user_dict = dict(user)
    if user_dict.get('role') not in ('foreman', 'moderator', 'boss', 'superadmin'):
        return {"error": "\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043f\u0440\u0430\u0432."}

    # Get requester's app to find date
    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (requester_app_id,)) as cur:
        req_app_row = await cur.fetchone()
    if not req_app_row:
        return {"error": "\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430."}
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
        return {"error": "\u0417\u0430\u044f\u0432\u043a\u0430 \u0441 \u044d\u0442\u043e\u0439 \u0442\u0435\u0445\u043d\u0438\u043a\u043e\u0439 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430."}

    donor_id = donor_app.get('foreman_id')
    donor_app_id = donor_app['id']

    # Validate donor app status
    if donor_app.get('status') in ('approved', 'in_progress', 'published', 'completed'):
        return {"error": "\u0417\u0430\u044f\u0432\u043a\u0430 \u0443\u0436\u0435 \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0430 \u043c\u043e\u0434\u0435\u0440\u0430\u0442\u043e\u0440\u043e\u043c. \u041e\u0431\u043c\u0435\u043d \u043d\u0435\u0432\u043e\u0437\u043c\u043e\u0436\u0435\u043d."}

    # Prevent duplicate pending exchanges from same requester for same equipment
    async with db.conn.execute(
        "SELECT id FROM equipment_exchanges WHERE requester_id = ? AND requested_equip_id = ? AND status = 'pending'",
        (real_tg_id, requested_equip_id)
    ) as cur:
        existing = await cur.fetchone()
    if existing:
        return {"error": "\u0412\u044b \u0443\u0436\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u0437\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 \u044d\u0442\u0443 \u0442\u0435\u0445\u043d\u0438\u043a\u0443. \u0414\u043e\u0436\u0434\u0438\u0442\u0435\u0441\u044c \u043e\u0442\u0432\u0435\u0442\u0430."}

    # Check pending exchanges
    if await db.is_equip_in_pending_exchange(requested_equip_id):
        return {"error": "\u042d\u0442\u0430 \u0442\u0435\u0445\u043d\u0438\u043a\u0430 \u0443\u0436\u0435 \u0443\u0447\u0430\u0441\u0442\u0432\u0443\u0435\u0442 \u0432 \u043e\u0431\u043c\u0435\u043d\u0435. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043f\u043e\u0437\u0436\u0435."}
    if await db.is_equip_in_pending_exchange(offered_equip_id):
        return {"error": "\u041f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u043c\u0430\u044f \u0442\u0435\u0445\u043d\u0438\u043a\u0430 \u0443\u0436\u0435 \u0443\u0447\u0430\u0441\u0442\u0432\u0443\u0435\u0442 \u0432 \u043e\u0431\u043c\u0435\u043d\u0435. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043f\u043e\u0437\u0436\u0435."}

    # Validate offered equip belongs to requester's app or is free
    offered_equip = await _get_equip(offered_equip_id)
    requested_equip = await _get_equip(requested_equip_id)
    if not offered_equip or not requested_equip:
        return {"error": "\u0422\u0435\u0445\u043d\u0438\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430."}

    # Same category check
    if offered_equip.get('category') != requested_equip.get('category'):
        return {"error": "\u0422\u0435\u0445\u043d\u0438\u043a\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u043e\u0434\u043d\u043e\u0439 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438."}

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
        return {"error": "\u041f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u043c\u0430\u044f \u0442\u0435\u0445\u043d\u0438\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430."}

    # Create exchange
    exchange_id = await db.create_exchange(
        real_tg_id, requester_app_id, donor_id, donor_app_id, requested_equip_id, offered_equip_id
    )

    requester_name = user_dict.get('fio', 'Прораб')
    requested_equip_name = await _get_equip_name(requested_equip_id)
    offered_equip_name = await _get_equip_name(offered_equip_id)
    object_address = req_app.get('object_address', '')

    # Background: notify donor with inline buttons
    async def _bg_notify():
        try:
            donor_text = (
                f"\U0001f504 \u041f\u0440\u043e\u0440\u0430\u0431 {requester_name} \u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442 \u043e\u0431\u043c\u0435\u043d \u0442\u0435\u0445\u043d\u0438\u043a\u0438:\n\n"
                f"\u041e\u043d \u0445\u043e\u0447\u0435\u0442: <b>{requested_equip_name}</b>\n"
                f"\u0412\u0437\u0430\u043c\u0435\u043d \u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442: <b>{offered_equip_name}</b>\n\n"
                f"\u041e\u0431\u044a\u0435\u043a\u0442: {object_address}"
            )
            await _send_exchange_notification_with_buttons(donor_id, donor_text, exchange_id)

            donor_name = await _get_user_fio(donor_id)
            mod_text = (
                f"\U0001f504 \u0417\u0430\u043f\u0440\u043e\u0441 \u043e\u0431\u043c\u0435\u043d\u0430: {requester_name} \u2192 {donor_name}\n"
                f"\u0422\u0435\u0445\u043d\u0438\u043a\u0430: {requested_equip_name} \u2194 {offered_equip_name}"
            )
            await _notify_moderators_exchange(mod_text)
        except Exception as e:
            logger.error(f"Exchange notification error: {e}")

    asyncio.create_task(_bg_notify())

    return {"success": True, "exchange_id": exchange_id}


@router.post("/{exchange_id}/respond")
async def respond_exchange(exchange_id: int, request: Request):
    data = await request.json()
    tg_id = data.get("tg_id")
    action = data.get("action")

    logger.info(f"Exchange {exchange_id} response: {action} by user {tg_id}")

    if action not in ("accept", "reject"):
        return {"error": "\u041d\u0435\u0432\u0435\u0440\u043d\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435."}

    if db.conn is None:
        await db.init_db()

    real_tg_id = await resolve_id(int(tg_id))
    ex = await db.get_exchange(exchange_id)
    if not ex:
        return {"error": "\u041e\u0431\u043c\u0435\u043d \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d."}
    if ex['status'] != 'pending':
        return {"error": "\u041e\u0431\u043c\u0435\u043d \u0443\u0436\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d."}
    if ex['donor_id'] != real_tg_id:
        return {"error": "\u0422\u043e\u043b\u044c\u043a\u043e \u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u0442\u0435\u0445\u043d\u0438\u043a\u0438 \u043c\u043e\u0436\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0438\u0442\u044c."}

    requested_equip_name = await _get_equip_name(ex['requested_equip_id'])
    offered_equip_name = await _get_equip_name(ex['offered_equip_id'])
    requester_name = await _get_user_fio(ex['requester_id'])
    donor_name = await _get_user_fio(ex['donor_id'])

    if action == "reject":
        await db.resolve_exchange(exchange_id, 'rejected')

        async def _bg():
            try:
                await notify_users([], f"\u274c \u041e\u0431\u043c\u0435\u043d \u043e\u0442\u043a\u043b\u043e\u043d\u0451\u043d. {donor_name} \u043e\u0442\u043a\u0430\u0437\u0430\u043b\u0441\u044f \u043e\u0431\u043c\u0435\u043d\u044f\u0442\u044c {requested_equip_name}.",
                                   "dashboard", extra_tg_ids=[ex['requester_id']])
                await _notify_moderators_exchange(f"\u274c \u041e\u0431\u043c\u0435\u043d \u043e\u0442\u043a\u043b\u043e\u043d\u0451\u043d: {requester_name} \u2194 {donor_name}")
            except Exception as e:
                logger.error(f"Exchange reject notification error: {e}")
        asyncio.create_task(_bg())
        return {"success": True, "status": "rejected"}

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
            return {"error": "\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430."}

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

    except Exception as e:
        logger.error(f"Exchange swap error: {e}")
        return {"error": f"\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0431\u043c\u0435\u043d\u0430: {e}"}

    async def _bg():
        try:
            await notify_users([], f"\u2705 \u041e\u0431\u043c\u0435\u043d \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d! \u0412\u044b \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 {requested_equip_name}.",
                               "dashboard", extra_tg_ids=[ex['requester_id']])
            await notify_users([], f"\u2705 \u041e\u0431\u043c\u0435\u043d \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d! \u0412\u044b \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 {offered_equip_name}.",
                               "dashboard", extra_tg_ids=[ex['donor_id']])
            await _notify_moderators_exchange(
                f"\u2705 \u041e\u0431\u043c\u0435\u043d \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d: {requester_name} \u043f\u043e\u043b\u0443\u0447\u0438\u043b {requested_equip_name}, "
                f"{donor_name} \u043f\u043e\u043b\u0443\u0447\u0438\u043b {offered_equip_name}")
        except Exception as e:
            logger.error(f"Exchange accept notification error: {e}")
    asyncio.create_task(_bg())

    return {"success": True, "status": "accepted"}


@router.post("/{exchange_id}/cancel")
async def cancel_exchange(exchange_id: int, request: Request):
    data = await request.json()
    tg_id = data.get("tg_id")

    logger.info(f"Exchange {exchange_id} cancel by user {tg_id}")

    if db.conn is None:
        await db.init_db()

    real_tg_id = await resolve_id(int(tg_id))
    ex = await db.get_exchange(exchange_id)
    if not ex:
        return {"error": "\u041e\u0431\u043c\u0435\u043d \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d."}
    if ex['status'] != 'pending':
        return {"error": "\u041e\u0431\u043c\u0435\u043d \u0443\u0436\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d."}
    if ex['requester_id'] != real_tg_id:
        return {"error": "\u0422\u043e\u043b\u044c\u043a\u043e \u0438\u043d\u0438\u0446\u0438\u0430\u0442\u043e\u0440 \u043c\u043e\u0436\u0435\u0442 \u043e\u0442\u043c\u0435\u043d\u0438\u0442\u044c."}

    await db.resolve_exchange(exchange_id, 'cancelled')

    requester_name = await _get_user_fio(ex['requester_id'])
    requested_equip_name = await _get_equip_name(ex['requested_equip_id'])

    async def _bg():
        try:
            await notify_users([], f"\u21a9\ufe0f \u041e\u0431\u043c\u0435\u043d \u043e\u0442\u043c\u0435\u043d\u0451\u043d. {requester_name} \u043e\u0442\u043c\u0435\u043d\u0438\u043b \u0437\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 {requested_equip_name}.",
                               "dashboard", extra_tg_ids=[ex['donor_id']])
        except Exception as e:
            logger.error(f"Exchange cancel notification error: {e}")
    asyncio.create_task(_bg())

    return {"success": True}


@router.get("/check_equip/{equip_id}")
async def check_equip_for_exchange(equip_id: int, date: str = ""):
    if db.conn is None:
        await db.init_db()

    if not date:
        return {"error": "\u0414\u0430\u0442\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430."}

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
