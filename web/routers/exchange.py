# === ONE-TIME CLEANUP: Remove spam duplicate pending exchanges ===
# Run manually:
#   sqlite3 data/viksstroy.db "UPDATE equipment_exchanges SET status='cancelled' WHERE status='pending' AND id NOT IN (SELECT MIN(id) FROM equipment_exchanges WHERE status='pending' GROUP BY requester_id, requested_equip_id)"
# =================================================================

import sys
import os
import asyncio
import logging
import secrets

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Request, Depends, HTTPException
from auth_deps import get_current_user, get_current_user_optional
from database_deps import db
from utils import resolve_id
from services.exchange_service import (
    create_exchange, send_create_notifications,
    respond_to_exchange, send_respond_notifications,
    cancel_exchange_request, send_cancel_notifications,
    check_equip_exchange_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exchange", tags=["exchange"])


def _valid_bot_token(token: str) -> bool:
    """Allow callbacks only from one of our bot containers."""
    if not token:
        return False
    expected_tokens = (
        os.getenv("BOT_TOKEN", "").strip(),
        os.getenv("MAX_BOT_TOKEN", "").strip(),
    )
    return any(
        expected and secrets.compare_digest(token, expected)
        for expected in expected_tokens
    )


async def _get_exchange_actor(request: Request, data: dict, current_user):
    """Use the web session, or a signed internal request from Telegram/MAX."""
    if current_user:
        return current_user

    if not _valid_bot_token(request.headers.get("X-Viks-Bot-Token", "")):
        raise HTTPException(status_code=401, detail="Не авторизован")

    try:
        raw_user_id = int(data.get("tg_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Не указан пользователь")

    user_id = await resolve_id(raw_user_id)
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    actor = dict(user)
    if actor.get("is_blacklisted"):
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    actor["tg_id"] = actor["user_id"]
    return actor


@router.post("/request")
async def create_exchange_request(request: Request, current_user=Depends(get_current_user)):
    data = await request.json()
    requester_tg_id = current_user["tg_id"]
    requester_app_id = data.get("requester_app_id")
    requested_equip_id = data.get("requested_equip_id")
    offered_equip_id = data.get("offered_equip_id")

    logger.info(f"Exchange request: requester={requester_tg_id}, app={requester_app_id}, "
                f"wants={requested_equip_id}, offers={offered_equip_id}")

    if not all([requester_app_id, requested_equip_id, offered_equip_id]):
        return {"error": "Не все поля заполнены."}

    result = await create_exchange(requester_tg_id, requester_app_id, requested_equip_id, offered_equip_id)

    if "error" in result:
        return result

    notify_data = result.pop("_notify")
    asyncio.create_task(send_create_notifications(result["exchange_id"], notify_data))
    return result


@router.post("/{exchange_id}/respond")
async def respond_exchange(
    exchange_id: int,
    request: Request,
    current_user=Depends(get_current_user_optional),
):
    data = await request.json()
    actor = await _get_exchange_actor(request, data, current_user)
    tg_id = actor["tg_id"]
    action = data.get("action")

    logger.info(f"Exchange {exchange_id} response: {action} by user {tg_id}")

    if action not in ("accept", "reject"):
        return {"error": "Неверное действие."}

    # Ownership check is enforced inside respond_to_exchange():
    # it verifies ex['donor_id'] == real_tg_id
    result = await respond_to_exchange(exchange_id, tg_id, action)

    if "error" in result:
        return result

    notify_data = result.pop("_notify")
    asyncio.create_task(send_respond_notifications(notify_data))
    return result


@router.post("/{exchange_id}/cancel")
async def cancel_exchange(exchange_id: int, request: Request, current_user=Depends(get_current_user)):
    data = await request.json()
    tg_id = current_user["tg_id"]

    logger.info(f"Exchange {exchange_id} cancel by user {tg_id}")

    # Ownership check is enforced inside cancel_exchange_request():
    # it verifies ex['requester_id'] == real_tg_id
    result = await cancel_exchange_request(exchange_id, tg_id)

    if "error" in result:
        return result

    notify_data = result.pop("_notify")
    asyncio.create_task(send_cancel_notifications(notify_data))
    return {"success": True}


@router.get("/check_equip/{equip_id}")
async def check_equip_for_exchange(equip_id: int, date: str = "", current_user=Depends(get_current_user)):
    if not date:
        return {"error": "Дата не указана."}

    return await check_equip_exchange_status(equip_id, date)
