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

import json
import sys
import os
import asyncio
import logging
from datetime import datetime
from typing import Optional

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, HTTPException, Form, Query
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


@router.get("/api/drivers/availability")
async def api_drivers_availability(
    date: str = Query(..., description="YYYY-MM-DD"),
    current_user=Depends(get_current_user),
):
    """Returns every driver with their busy slots on ``date``.

    A driver is busy when any equipment they're assigned to (via
    ``application_drivers``) is booked in a time slot on that date.
    Slot times come from ``applications.equipment_data`` JSON (per-
    equipment slots inside an application) — mirroring how
    ``/api/equipment/availability`` resolves them.

    Result shape mirrors equipment_availability:
        [
          {"user_id": 123, "fio": "...", "last_name", "first_name",
           "middle_name",
           "busy_slots": [
             {"application_id": 42, "equipment_id": 7,
              "equipment_name": "...", "time_start": "08:00",
              "time_end": "14:00", "object_address": "...",
              "foreman_name": "...", "app_status": "approved"},
             ...
           ]}, ...
        ]

    Drivers with no busy slots get ``busy_slots: []``. The list always
    includes every driver in the system so the FE can render unassigned
    rows alongside busy ones.
    """
    # Validate date — keep it cheap, just YYYY-MM-DD shape.
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="`date` must be in YYYY-MM-DD format",
        )

    # 1. All drivers (every row keyed by user_id, busy_slots starts []).
    async with db.conn.execute(
        "SELECT user_id, fio, last_name, first_name, middle_name "
        "FROM users WHERE role = 'driver' "
        "AND COALESCE(is_blacklisted, 0) = 0 "
        "ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE"
    ) as cur:
        cols = [c[0] for c in cur.description]
        drivers = [dict(zip(cols, r)) for r in await cur.fetchall()]
    by_uid: dict[int, dict] = {int(d["user_id"]): {**d, "busy_slots": []} for d in drivers}

    # 2. All (driver, equipment) pairs for the given date. Join applications
    # for status/object metadata, equipment for the name. We deliberately
    # match the equipment_availability status filter ('rejected','cancelled')
    # — anything else still occupies the slot from a driver's POV.
    async with db.conn.execute(
        """SELECT ad.driver_user_id,
                  ad.equipment_id,
                  e.name           AS equipment_name,
                  a.id             AS application_id,
                  a.status         AS app_status,
                  a.object_address AS object_address,
                  a.foreman_name   AS foreman_name,
                  a.time_start     AS app_time_start,
                  a.time_end       AS app_time_end,
                  a.equipment_data AS equipment_data
             FROM application_drivers ad
             JOIN applications a ON a.id = ad.application_id
             LEFT JOIN equipment e ON e.id = ad.equipment_id
            WHERE a.date_target = ?
              AND a.status NOT IN ('rejected', 'cancelled', 'archived')""",
        (date,),
    ) as cur:
        cols = [c[0] for c in cur.description]
        pairs = [dict(zip(cols, r)) for r in await cur.fetchall()]

    for pair in pairs:
        drv_id = int(pair["driver_user_id"])
        if drv_id not in by_uid:
            # Driver might have been soft-deleted (role cleared) since the
            # assignment was made — surface them anyway so the FE can show
            # the historical booking. Use a stub row.
            by_uid[drv_id] = {
                "user_id": drv_id, "fio": f"#{drv_id}",
                "last_name": "", "first_name": "", "middle_name": "",
                "busy_slots": [],
            }

        # Resolve THIS equipment's per-row time slot inside equipment_data,
        # falling back to the application-level time_start/time_end.
        ts, te = _resolve_slot_for_equipment(
            pair.get("equipment_data"),
            int(pair["equipment_id"]),
            pair.get("app_time_start"),
            pair.get("app_time_end"),
        )
        by_uid[drv_id]["busy_slots"].append({
            "application_id": pair["application_id"],
            "equipment_id": pair["equipment_id"],
            "equipment_name": pair.get("equipment_name") or f"#{pair['equipment_id']}",
            "time_start": ts,
            "time_end": te,
            "object_address": pair.get("object_address") or "",
            "foreman_name": pair.get("foreman_name") or "",
            "app_status": pair.get("app_status") or "",
        })

    # Sort each driver's busy_slots by start time for stable display.
    for d in by_uid.values():
        d["busy_slots"].sort(key=lambda s: s.get("time_start") or "")

    # Order the response by ФИО (matches initial drivers query) — the
    # late-added stub rows (drivers no longer with role='driver') fall
    # at the end.
    primary_ids = {int(d["user_id"]) for d in drivers}
    primary_out = [by_uid[int(d["user_id"])] for d in drivers]
    tail_out = [v for k, v in by_uid.items() if k not in primary_ids]
    return primary_out + tail_out


def _resolve_slot_for_equipment(
    equipment_data_json, equipment_id: int,
    app_start, app_end,
) -> tuple[str, str]:
    """Pull the time slot for a specific equipment out of
    ``applications.equipment_data`` JSON.

    The JSON shape per equipment_availability:
        [{"id": <eq_id>, "time_start": "08"|"08:00", "time_end": "17"|...}]

    If the JSON is missing or the equipment_id isn't found, fall back to
    the application-level ``time_start`` / ``time_end`` integers. We
    always return ``HH:MM`` strings so the FE doesn't have to second-
    guess the shape.
    """
    def _norm(t) -> str:
        if t is None:
            return ""
        s = str(t).strip()
        if not s:
            return ""
        if ":" in s:
            return s
        # Bare hours like "8" or "17" → "08:00" / "17:00".
        try:
            return f"{int(s):02d}:00"
        except ValueError:
            return s

    if equipment_data_json:
        try:
            arr = json.loads(equipment_data_json)
            if isinstance(arr, list):
                for entry in arr:
                    if not isinstance(entry, dict):
                        continue
                    if int(entry.get("id", -1)) == int(equipment_id):
                        ts = _norm(entry.get("time_start"))
                        te = _norm(entry.get("time_end"))
                        if ts and te:
                            return ts, te
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return _norm(app_start), _norm(app_end)


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
