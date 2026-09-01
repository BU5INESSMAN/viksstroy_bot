"""Superadmin employee identity audit and normalization endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_deps import require_role
from database_deps import db
from services.employee_identity import employee_audit, merge_identities, update_identity


router = APIRouter(tags=["Employee audit"])
_require_superadmin = require_role("superadmin")


class IdentityPatch(BaseModel):
    canonical_fio: str = Field(min_length=3, max_length=200)
    position: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=1000)


class IdentityMergeRequest(BaseModel):
    target_identity_id: int
    source_identity_ids: list[int]
    confirmation: str


@router.get("/api/admin/employee-audit")
async def get_employee_audit(current_user=Depends(_require_superadmin)):
    return await employee_audit(db)


@router.patch("/api/admin/employee-identities/{identity_id}")
async def patch_employee_identity(
    identity_id: int,
    body: IdentityPatch,
    current_user=Depends(_require_superadmin),
):
    try:
        await update_identity(
            db,
            identity_id,
            canonical_fio=body.canonical_fio,
            position=body.position,
            notes=body.notes,
            actor_id=int(current_user["tg_id"]),
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await db.add_log(
        current_user["tg_id"],
        current_user.get("fio", "Суперадмин"),
        f"Нормализовал карточку сотрудника: {body.canonical_fio}",
        target_type="employee_identity",
        target_id=identity_id,
        details=json.dumps(
            {"action": "employee_identity_updated", "position": body.position},
            ensure_ascii=False,
        ),
    )
    return {"status": "ok"}


@router.post("/api/admin/employee-identities/merge")
async def merge_employee_identities(
    body: IdentityMergeRequest,
    current_user=Depends(_require_superadmin),
):
    if body.confirmation.strip().upper() != "ОБЪЕДИНИТЬ":
        raise HTTPException(400, "Подтвердите объединение словом ОБЪЕДИНИТЬ")
    try:
        result = await merge_identities(
            db,
            target_identity_id=body.target_identity_id,
            source_identity_ids=body.source_identity_ids,
            actor_id=int(current_user["tg_id"]),
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await db.add_log(
        current_user["tg_id"],
        current_user.get("fio", "Суперадмин"),
        "Объединил дубли карточек сотрудников",
        target_type="employee_identity",
        target_id=body.target_identity_id,
        details=json.dumps(
            {"action": "employee_identities_merged", **result},
            ensure_ascii=False,
        ),
    )
    return {"status": "ok", **result}
