"""Snapshots and human-readable diffs for the SMR financial audit trail.

The module deliberately contains no HTTP concerns. A router should capture a
snapshot before a write, perform the write, then call ``record_smr_change``.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from smr_data import get_smr_read_model


MONEY_STEP = Decimal("0.01")
QUANTITY_STEP = Decimal("0.001")


def canonical_json(value: Any) -> str:
    """Serialize audit data deterministically for storage and hashing."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _number(value: Any, step: Decimal) -> float:
    try:
        number = Decimal(str(value if value not in (None, "") else 0))
    except Exception:
        number = Decimal("0")
    if not number.is_finite():
        number = Decimal("0")
    return float(number.quantize(step, rounding=ROUND_HALF_UP))


def _work_snapshot(row: dict) -> dict:
    volume = _number(row.get("volume"), QUANTITY_STEP)
    salary = _number(row.get("current_salary"), MONEY_STEP)
    price = _number(row.get("current_price"), MONEY_STEP)
    return {
        "row_id": row.get("id"),
        "application_id": row.get("application_id"),
        "kp_id": row.get("kp_id"),
        "category": row.get("category") or "",
        "name": row.get("name") or "",
        "unit": row.get("unit") or "",
        "team_id": row.get("team_id"),
        "team_name": row.get("team_name") or "",
        "is_additional": bool(row.get("is_additional")),
        "volume": volume,
        "salary_rate": salary,
        "price_rate": price,
        "salary_total": _number(Decimal(str(volume)) * Decimal(str(salary)), MONEY_STEP),
        "price_total": _number(Decimal(str(volume)) * Decimal(str(price)), MONEY_STEP),
    }


def _extra_snapshot(row: dict) -> dict:
    volume = _number(row.get("volume"), QUANTITY_STEP)
    salary = _number(row.get("salary"), MONEY_STEP)
    price = _number(row.get("price"), MONEY_STEP)
    return {
        "row_id": row.get("id"),
        "application_id": row.get("application_id"),
        "kp_id": row.get("kp_id"),
        "extra_work_id": row.get("extra_work_id"),
        "name": row.get("name") or row.get("custom_name") or "",
        "unit": row.get("unit") or "",
        "team_id": row.get("team_id"),
        "team_name": row.get("team_name") or "",
        "is_additional": bool(row.get("is_additional")),
        "volume": volume,
        "salary_rate": salary,
        "price_rate": price,
        "salary_total": _number(Decimal(str(volume)) * Decimal(str(salary)), MONEY_STEP),
        "price_total": _number(Decimal(str(volume)) * Decimal(str(price)), MONEY_STEP),
    }


def _hours_snapshot(row: dict) -> dict:
    return {
        "row_id": row.get("id"),
        "application_id": row.get("application_id"),
        "team_id": row.get("team_id"),
        "team_name": row.get("team_name") or "",
        "member_id": row.get("member_id"),
        "fio": row.get("fio") or "",
        "specialty": row.get("specialty") or "",
        "is_additional": bool(row.get("is_additional")),
        "hours": _number(row.get("hours"), QUANTITY_STEP),
    }


async def capture_smr_financial_snapshot(db, app_id: int) -> dict:
    """Return a stable, self-contained financial snapshot of one logical SMR."""
    model = await get_smr_read_model(db, int(app_id))
    if not model:
        return {}

    works = [_work_snapshot(row) for row in model.get("plan_works", [])]
    extras = [_extra_snapshot(row) for row in model.get("extra_works", [])]
    hours = [_hours_snapshot(row) for row in model.get("hours", [])]
    key = lambda row: (
        int(row.get("application_id") or 0),
        int(bool(row.get("is_additional"))),
        int(row.get("team_id") or 0),
        str(row.get("name") or row.get("fio") or ""),
        int(row.get("row_id") or 0),
    )
    totals = model.get("totals") or {}
    return {
        "schema_version": 1,
        "application_ids": [int(value) for value in model.get("application_ids", [])],
        "primary_application_id": int(model.get("primary_application_id") or app_id),
        "works": sorted(works, key=key),
        "extra_works": sorted(extras, key=key),
        "hours": sorted(hours, key=key),
        "totals": {
            "hours": _number(totals.get("hours"), QUANTITY_STEP),
            "salary": _number(totals.get("salary"), MONEY_STEP),
            "price": _number(totals.get("price"), MONEY_STEP),
        },
    }


def diff_smr_snapshots(before: dict | None, after: dict | None) -> list[dict]:
    """Return deterministic field-level changes between two snapshots."""
    changes: list[dict] = []

    def walk(old: Any, new: Any, path: str) -> None:
        if isinstance(old, dict) and isinstance(new, dict):
            for key in sorted(set(old) | set(new)):
                walk(old.get(key), new.get(key), f"{path}.{key}" if path else key)
            return
        if isinstance(old, list) and isinstance(new, list):
            # Audit snapshot rows have stable row ids. Index fallback also
            # preserves additions/removals before a database id exists.
            def list_key(item: Any, index: int) -> str:
                if isinstance(item, dict) and item.get("row_id") is not None:
                    return f"id:{item['row_id']}"
                return f"index:{index}"

            old_map = {list_key(item, i): item for i, item in enumerate(old)}
            new_map = {list_key(item, i): item for i, item in enumerate(new)}
            for key in sorted(set(old_map) | set(new_map)):
                walk(old_map.get(key), new_map.get(key), f"{path}[{key}]")
            return
        if old != new:
            changes.append({"path": path, "before": old, "after": new})

    walk(before or {}, after or {}, "")
    return changes


async def record_smr_change(
    db,
    app_id: int,
    *,
    event_type: str,
    actor_user_id: int | None = None,
    actor_role: str = "",
    actor_name: str = "",
    source: str = "",
    reason: str = "",
    before_snapshot: dict | None = None,
    after_snapshot: dict | None = None,
    metadata: dict | None = None,
    force: bool = False,
) -> dict | None:
    """Capture the final state and append an audit row when data changed."""
    before = before_snapshot or {}
    after = after_snapshot
    if after is None:
        after = await capture_smr_financial_snapshot(db, app_id)
    changes = diff_smr_snapshots(before, after)
    if not changes and not force:
        return None
    return await db.append_smr_financial_audit(
        application_id=int(app_id),
        primary_application_id=int(after.get("primary_application_id") or app_id),
        application_ids=after.get("application_ids") or [int(app_id)],
        event_type=event_type,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        actor_name=actor_name,
        source=source,
        reason=reason,
        before_snapshot=before,
        after_snapshot=after,
        diff=changes,
        metadata=metadata or {},
    )


async def build_smr_catalog_reconciliation(db, app_id: int) -> dict:
    """Compare stored SMR rates with the currently active price list.

    This is the backend model for a reconciliation screen. Custom additional
    work has no KP source and is reported separately instead of being treated
    as an error.
    """
    snapshot = await capture_smr_financial_snapshot(db, app_id)
    if not snapshot:
        return {}
    kp_ids = sorted(
        {
            int(row["kp_id"])
            for section in ("works", "extra_works")
            for row in snapshot.get(section, [])
            if row.get("kp_id")
        }
    )
    catalog: dict[int, dict] = {}
    if kp_ids:
        marks = ",".join("?" * len(kp_ids))
        async with db.conn.execute(
            f"SELECT id, name, unit, salary, price FROM kp_catalog WHERE id IN ({marks})",
            tuple(kp_ids),
        ) as cur:
            catalog = {int(row[0]): dict(row) for row in await cur.fetchall()}

    discrepancies = []
    custom_rows = []
    missing_catalog_rows = []
    for section in ("works", "extra_works"):
        for row in snapshot.get(section, []):
            kp_id = row.get("kp_id")
            if not kp_id:
                if section == "extra_works":
                    custom_rows.append({"section": section, **row})
                continue
            expected = catalog.get(int(kp_id))
            if not expected:
                missing_catalog_rows.append({"section": section, **row})
                continue
            catalog_salary = _number(expected.get("salary"), MONEY_STEP)
            catalog_price = _number(expected.get("price"), MONEY_STEP)
            salary_delta = _number(
                Decimal(str(row.get("salary_rate") or 0)) - Decimal(str(catalog_salary)), MONEY_STEP
            )
            price_delta = _number(
                Decimal(str(row.get("price_rate") or 0)) - Decimal(str(catalog_price)), MONEY_STEP
            )
            if salary_delta or price_delta:
                volume = Decimal(str(row.get("volume") or 0))
                discrepancies.append(
                    {
                        "section": section,
                        "row_id": row.get("row_id"),
                        "kp_id": int(kp_id),
                        "name": row.get("name") or expected.get("name") or "",
                        "volume": row.get("volume"),
                        "stored_salary_rate": row.get("salary_rate"),
                        "catalog_salary_rate": catalog_salary,
                        "salary_rate_delta": salary_delta,
                        "salary_total_delta": _number(volume * Decimal(str(salary_delta)), MONEY_STEP),
                        "stored_price_rate": row.get("price_rate"),
                        "catalog_price_rate": catalog_price,
                        "price_rate_delta": price_delta,
                        "price_total_delta": _number(volume * Decimal(str(price_delta)), MONEY_STEP),
                    }
                )

    return {
        "application_ids": snapshot["application_ids"],
        "primary_application_id": snapshot["primary_application_id"],
        "totals": snapshot["totals"],
        "has_discrepancies": bool(discrepancies or missing_catalog_rows),
        "discrepancies": discrepancies,
        "missing_catalog_rows": missing_catalog_rows,
        "custom_rows": custom_rows,
    }
