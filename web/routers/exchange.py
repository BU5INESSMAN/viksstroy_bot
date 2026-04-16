# === ONE-TIME CLEANUP: Remove spam duplicate pending exchanges ===
# Run manually:
#   sqlite3 data/viksstroy.db "UPDATE equipment_exchanges SET status='cancelled' WHERE status='pending' AND id NOT IN (SELECT MIN(id) FROM equipment_exchanges WHERE status='pending' GROUP BY requester_id, requested_equip_id)"
# =================================================================

import sys
import os
import asyncio
import logging

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Request, Depends
from auth_deps import get_current_user
from services.exchange_service import (
    create_exchange, send_create_notifications,
    respond_to_exchange, send_respond_notifications,
    cancel_exchange_request, send_cancel_notifications,
    check_equip_exchange_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exchange", tags=["exchange"])


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
async def respond_exchange(exchange_id: int, request: Request, current_user=Depends(get_current_user)):
    data = await request.json()
    tg_id = current_user["tg_id"]
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
