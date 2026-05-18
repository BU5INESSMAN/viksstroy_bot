"""Drivers REST API.

Drivers are users (role='driver') maintained from the Resources page.
Moderator+ can create/edit/delete drivers and regenerate invite codes.
Any authenticated user can read driver lists and the per-equipment
selector payload.

Endpoints:
  GET    /api/drivers                            list
  GET    /api/drivers/{user_id}                  detail
  POST   /api/drivers                            create (office)
  PATCH  /api/drivers/{user_id}                  update (office)
  DELETE /api/drivers/{user_id}                  delete (office)
  POST   /api/drivers/{user_id}/regenerate-invite (office)
  GET    /api/drivers/for-equipment/{equip_id}   list for assignment picker
  GET    /api/drivers/invite/{code}              public invite landing info
  POST   /api/drivers/invite/redeem              redeem invite (auth required)
"""
from __future__ import annotations

import sys
import os
import asyncio
import logging
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Body, Depends, Form, HTTPException
from pydantic import BaseModel
from typing import Optional

from database_deps import db, TZ_BARNAUL
from auth_deps import get_current_user, require_office
from utils import generate_invite_code, normalize_invite_code
from services.notifications import notify_users

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Drivers"])


class DriverIn(BaseModel):
    last_name: str
    first_name: str
    middle_name: Optional[str] = ""
    category_names: list[str] = []
    default_equipment_id: Optional[int] = None


class DriverPatch(BaseModel):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    category_names: Optional[list[str]] = None
    default_equipment_id: Optional[int] = None  # null is meaningful → cleared


# ---- CRUD --------------------------------------------------------------


@router.get("/api/drivers")
async def api_list_drivers(current_user=Depends(get_current_user)):
    return await db.list_drivers()


@router.get("/api/drivers/for-equipment/{equipment_id}")
async def api_drivers_for_equipment(equipment_id: int, current_user=Depends(get_current_user)):
    return await db.get_drivers_for_equipment(equipment_id)


@router.get("/api/drivers/{user_id}")
async def api_get_driver(user_id: int, current_user=Depends(get_current_user)):
    d = await db.get_driver(user_id)
    if not d:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    return d


@router.post("/api/drivers")
async def api_create_driver(payload: DriverIn, current_user=Depends(require_office)):
    if not payload.last_name.strip() or not payload.first_name.strip():
        raise HTTPException(status_code=400, detail="Фамилия и имя обязательны")
    if not payload.category_names:
        raise HTTPException(status_code=400, detail="Укажите хотя бы одну категорию техники")

    invite_code = generate_invite_code(12)
    new_id = await db.create_driver(
        last_name=payload.last_name.strip(),
        first_name=payload.first_name.strip(),
        middle_name=(payload.middle_name or "").strip(),
        category_names=payload.category_names,
        default_equipment_id=payload.default_equipment_id,
        invite_code=invite_code,
    )

    fio = " ".join(p for p in (payload.last_name, payload.first_name, payload.middle_name or "") if p).strip()
    await db.add_log(
        current_user["tg_id"],
        current_user.get("fio", ""),
        f"Добавил водителя: {fio}",
        target_type="driver",
        target_id=new_id,
    )
    d = await db.get_driver(new_id)
    return d


@router.patch("/api/drivers/{user_id}")
async def api_update_driver(user_id: int, payload: DriverPatch, current_user=Depends(require_office)):
    existing = await db.get_driver(user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Водитель не найден")

    # Pydantic v1/v2 compat: try model_dump then dict()
    try:
        body = payload.model_dump(exclude_unset=True)
    except AttributeError:
        body = payload.dict(exclude_unset=True)

    kwargs: dict = {}
    for k in ("last_name", "first_name", "middle_name", "category_names"):
        if k in body:
            kwargs[k] = body[k]
    if "default_equipment_id" in body:
        kwargs["default_equipment_id"] = body["default_equipment_id"]

    await db.update_driver(user_id, **kwargs)
    await db.add_log(
        current_user["tg_id"],
        current_user.get("fio", ""),
        f"Изменил водителя: {existing.get('fio', user_id)}",
        target_type="driver",
        target_id=user_id,
    )
    return await db.get_driver(user_id)


@router.delete("/api/drivers/{user_id}")
async def api_delete_driver(user_id: int, current_user=Depends(require_office)):
    existing = await db.get_driver(user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    await db.delete_driver(user_id)
    await db.add_log(
        current_user["tg_id"],
        current_user.get("fio", ""),
        f"Удалил водителя: {existing.get('fio', user_id)}",
        target_type="driver",
        target_id=user_id,
    )
    return {"status": "ok"}


@router.post("/api/drivers/{user_id}/regenerate-invite")
async def api_regenerate_invite(user_id: int, current_user=Depends(require_office)):
    code = await db.regenerate_driver_invite(user_id)
    if not code:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    await db.add_log(
        current_user["tg_id"],
        current_user.get("fio", ""),
        f"Перегенерировал код водителя #{user_id}",
        target_type="driver",
        target_id=user_id,
    )
    return {
        "invite_code": code,
        "invite_link": f"https://miniapp.viks22.ru/driver-invite/{code}",
        "tg_bot_link": f"https://t.me/viksstroy_bot?start=driver_{code}",
    }


# ---- Invite redemption -------------------------------------------------


@router.get("/api/drivers/invite/{invite_code}")
async def api_get_driver_invite_info(invite_code: str):
    """Public landing: returns FIO + categories for the invite page so the
    user can confirm before binding their session."""
    code = normalize_invite_code(invite_code)
    target = await db.find_user_by_invite_code(code)
    if not target or target.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Ссылка недействительна")
    d = await db.get_driver(target["user_id"])
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


@router.post("/api/drivers/invite/redeem")
async def api_redeem_driver_invite(
    invite_code: str = Form(...), current_user=Depends(get_current_user)
):
    """Bind the current session's user to a driver invite.

    Resolution order (mirrors prompt Section A):
      1. users.invite_code   → driver self-join (synthetic ID swap if needed)
      2. team_members.invite_code → handled by /api/invite/join (legacy)
      3. equipment.invite_code    → handled by legacy endpoint, deprecated
    Only handles case 1 here.
    """
    code = normalize_invite_code(invite_code)
    target = await db.find_user_by_invite_code(code)
    if not target or target.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Ссылка недействительна")

    real_user_id = int(current_user["user_id"])
    synthetic_id = int(target["user_id"])

    # If the invite-row already has a positive (real) id, the driver is just
    # re-authenticating — nothing to swap.
    if synthetic_id == real_user_id:
        return {"status": "ok", "user_id": real_user_id, "already_linked": True}

    if synthetic_id >= 0 and synthetic_id != real_user_id:
        raise HTTPException(
            status_code=409,
            detail="Этот код уже использован другим пользователем",
        )

    # Real-user role gate: existing foreman/moderator/boss/superadmin should
    # NOT be downgraded to driver — let them keep their role but bind the
    # driver profile by ID swap anyway. The redeem helper preserves higher
    # roles via COALESCE patterns.
    swapped = await db.redeem_synthetic_driver(synthetic_id, real_user_id)
    if not swapped:
        raise HTTPException(status_code=500, detail="Не удалось привязать профиль водителя")

    fio = target.get("fio") or current_user.get("fio", "")
    await db.add_log(
        real_user_id,
        fio,
        f"Привязал профиль водителя по коду приглашения",
        target_type="driver",
        target_id=real_user_id,
    )

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _notify():
        try:
            await notify_users(
                ["report_group", "boss", "superadmin"],
                f"🔗 <b>Привязка водителя</b>\n👤 {fio}\n🕒 {now}",
                "equipment", category="new_users",
            )
        except Exception as e:
            logger.error(f"Driver redeem notification failed: {e}")

    asyncio.create_task(_notify())
    return {"status": "ok", "user_id": real_user_id}
