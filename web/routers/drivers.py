"""Drivers REST API (v2.6).

Endpoints:
  GET    /api/drivers                                list (optional ?category=)
  GET    /api/drivers/by-equipment/{equipment_id}   for assignment picker
  GET    /api/drivers/{user_id}                      detail
  POST   /api/drivers                                create  (office+)
  PATCH  /api/drivers/{user_id}                      update  (office+)
  DELETE /api/drivers/{user_id}                      soft-delete (office+)
  POST   /api/drivers/{user_id}/regenerate-invite    new code (office+)
  GET    /api/drivers/invite/{code}                  public landing info
  POST   /api/drivers/invite/redeem                  synthetic→real swap

All writes are audit-logged with target_type='driver'.
"""
from __future__ import annotations

import sys
import os
import asyncio
import logging
from datetime import datetime
from typing import Optional

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, HTTPException, Form
from pydantic import BaseModel

from database_deps import db, TZ_BARNAUL
from auth_deps import get_current_user, require_office
from utils import normalize_invite_code
from services.notifications import notify_users
from services import driver_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Drivers"])


class DriverIn(BaseModel):
    last_name: str
    first_name: str
    middle_name: Optional[str] = ""
    categories: list[str] = []
    default_equipment_id: Optional[int] = None


class DriverPatch(BaseModel):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    categories: Optional[list[str]] = None
    default_equipment_id: Optional[int] = None


# ─────────── reads ───────────


@router.get("/api/drivers")
async def api_list_drivers(
    category: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    return await driver_service.list_drivers(db, category=category)


@router.get("/api/drivers/by-equipment/{equipment_id}")
async def api_drivers_for_equipment(
    equipment_id: int, current_user=Depends(get_current_user),
):
    return await driver_service.list_drivers_for_equipment(db, equipment_id)


@router.get("/api/drivers/invite/{invite_code}")
async def api_driver_invite_info(invite_code: str):
    """Public landing for /driver-invite/{code}."""
    code = normalize_invite_code(invite_code)
    target = await driver_service.find_user_by_invite_code(db, code)
    if not target or target.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Ссылка недействительна")
    d = await driver_service.get_driver(db, target["user_id"])
    if not d:
        raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return {
        "fio": d.get("fio"),
        "last_name": d.get("last_name"),
        "first_name": d.get("first_name"),
        "middle_name": d.get("middle_name"),
        "categories": d.get("categories", []),
        "default_equipment_name": d.get("default_equipment_name"),
        "pending_redeem": int(d["user_id"]) < 0,
    }


@router.get("/api/drivers/{user_id}")
async def api_get_driver(user_id: int, current_user=Depends(get_current_user)):
    d = await driver_service.get_driver(db, user_id)
    if not d:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    return d


# ─────────── writes ───────────


@router.post("/api/drivers")
async def api_create_driver(
    payload: DriverIn, current_user=Depends(require_office),
):
    if not payload.last_name.strip() or not payload.first_name.strip():
        raise HTTPException(status_code=400, detail="Фамилия и имя обязательны")
    if not payload.categories:
        raise HTTPException(
            status_code=400, detail="Укажите хотя бы одну категорию",
        )
    try:
        driver = await driver_service.create_driver(
            db,
            last_name=payload.last_name,
            first_name=payload.first_name,
            middle_name=payload.middle_name or "",
            categories=payload.categories,
            default_equipment_id=payload.default_equipment_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.add_log(
        current_user["tg_id"], current_user.get("fio", ""),
        f"Добавил водителя: {driver.get('fio')}",
        target_type="driver", target_id=driver["user_id"],
    )
    return driver


@router.patch("/api/drivers/{user_id}")
async def api_update_driver(
    user_id: int, payload: DriverPatch, current_user=Depends(require_office),
):
    # v2.6: `default_equipment_id` is still accepted in the PATCH body
    # for legacy clients (the field hasn't been dropped from the schema
    # for one release for rollback safety). New writes from the v2.6 UI
    # do NOT include it — defaults are set on the equipment side via
    # PATCH /api/equipment/{id}/default-driver. Existing requests that
    # still send default_equipment_id continue to succeed and write the
    # legacy column; nothing reads from it post-v2.6 except the drift
    # check in db_manager.py.
    #
    # No standalone /api/drivers/{id}/default-equipment endpoint ever
    # existed, so there is nothing here that needs a 410-Gone stub.
    existing = await driver_service.get_driver(db, user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Водитель не найден")

    try:
        body = payload.model_dump(exclude_unset=True)
    except AttributeError:
        body = payload.dict(exclude_unset=True)

    kwargs: dict = {}
    for k in ("last_name", "first_name", "middle_name", "categories"):
        if k in body:
            kwargs[k] = body[k]
    if "default_equipment_id" in body:
        kwargs["default_equipment_id"] = body["default_equipment_id"]

    updated = await driver_service.update_driver(db, user_id, **kwargs)
    await db.add_log(
        current_user["tg_id"], current_user.get("fio", ""),
        f"Изменил водителя: {existing.get('fio')}",
        target_type="driver", target_id=user_id,
    )
    return updated


@router.delete("/api/drivers/{user_id}")
async def api_delete_driver(
    user_id: int, current_user=Depends(require_office),
):
    existing = await driver_service.get_driver(db, user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    await driver_service.delete_driver(db, user_id)
    await db.add_log(
        current_user["tg_id"], current_user.get("fio", ""),
        f"Удалил водителя: {existing.get('fio')}",
        target_type="driver", target_id=user_id,
    )
    return {"status": "ok"}


@router.post("/api/drivers/{user_id}/regenerate-invite")
async def api_regenerate_invite(
    user_id: int, current_user=Depends(require_office),
):
    code = await driver_service.regenerate_invite(db, user_id)
    if not code:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    await db.add_log(
        current_user["tg_id"], current_user.get("fio", ""),
        f"Перегенерировал код водителя #{user_id}",
        target_type="driver", target_id=user_id,
    )
    return {
        "invite_code": code,
        "invite_link": f"https://miniapp.viks22.ru/driver-invite/{code}",
        "tg_bot_link": f"https://t.me/viksstroy_bot?start=driver_{code}",
    }


@router.post("/api/drivers/invite/redeem")
async def api_redeem_driver_invite(
    invite_code: str = Form(...), current_user=Depends(get_current_user),
):
    """Bind the current session's user to a driver invite code.

    Handles BOTH:
      - synthetic-row case (user_id < 0): atomic swap via redeem_synthetic_driver.
      - real-row case (user_id matches current session): no-op success.
    """
    code = normalize_invite_code(invite_code)
    target = await driver_service.find_user_by_invite_code(db, code)
    if not target or target.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Ссылка недействительна")

    real_user_id = int(current_user["user_id"])
    synth_id = int(target["user_id"])

    if synth_id == real_user_id:
        return {"status": "ok", "user_id": real_user_id, "already_linked": True}
    if synth_id >= 0 and synth_id != real_user_id:
        raise HTTPException(
            status_code=409,
            detail="Этот код уже использован другим пользователем",
        )

    swapped = await driver_service.redeem_synthetic_driver(
        db, synth_id, real_user_id,
    )

    fio = target.get("fio") or current_user.get("fio", "")
    await db.add_log(
        real_user_id, fio,
        "Привязал профиль водителя по коду приглашения",
        target_type="driver", target_id=real_user_id,
    )

    async def _notify():
        try:
            now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
            await notify_users(
                ["report_group", "boss", "superadmin"],
                f"🔗 <b>Привязка водителя</b>\n👤 {fio}\n🕒 {now}",
                "equipment", category="new_users",
            )
        except Exception as e:
            logger.error(f"driver redeem notification: {e}")

    asyncio.create_task(_notify())
    return {"status": "ok", "user_id": real_user_id, "swapped_assignments": swapped}
