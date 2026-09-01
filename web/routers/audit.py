"""Collection, review and export API for product diagnostics."""
from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
import io
import json
import os
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth_deps import get_current_user_optional, require_role
from database_deps import db
from services.product_audit import build_insights, normalize_event, session_hash

router = APIRouter(prefix="/api/audit", tags=["Product audit"])
_require_superadmin = require_role("superadmin")
_rate: dict[str, tuple[float, int]] = {}


class EventBatch(BaseModel):
    events: list[dict] = Field(default_factory=list, max_length=50)


def _rate_limit(request: Request) -> None:
    key = (request.client.host if request.client else "unknown")[:80]
    now = time.monotonic(); start, count = _rate.get(key, (now, 0))
    if now - start >= 60: start, count = now, 0
    count += 1; _rate[key] = (start, count)
    if count > 120:
        raise HTTPException(429, "Слишком много диагностических событий")
    if len(_rate) > 2000:
        for old_key, (old_start, _) in list(_rate.items()):
            if now - old_start > 120: _rate.pop(old_key, None)


@router.post("/events/batch", status_code=202)
async def collect_events(payload: EventBatch, request: Request,
                         current_user=Depends(get_current_user_optional)):
    _rate_limit(request)
    if not payload.events:
        return {"accepted": 0}
    token_hash = session_hash(request.cookies.get("session_token"))
    version = os.getenv("APP_VERSION", "dev")
    normalized = [normalize_event(item, user=current_user, session=token_hash, app_version=version)
                  for item in payload.events]
    async with db.isolated_connection():
        await db.append_product_audit_events(normalized)
    return {"accepted": len(normalized)}


def _where(days, category, outcome, user_id, search):
    threshold = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    clauses = ["occurred_at >= ?"]
    args: list = [threshold]
    if category: clauses.append("category=?"); args.append(category)
    if outcome: clauses.append("outcome=?"); args.append(outcome)
    if user_id is not None: clauses.append("user_id=?"); args.append(user_id)
    if search:
        clauses.append("(event_name LIKE ? OR page LIKE ? OR route LIKE ? OR element LIKE ? OR error_message LIKE ? OR user_fio LIKE ?)")
        term = f"%{search[:100]}%"; args.extend([term] * 6)
    return " AND ".join(clauses), args


async def _load_rows(days=7, category="", outcome="", user_id=None, search="", limit=5000, offset=0):
    where, args = _where(days, category, outcome, user_id, search)
    async with db.conn.execute(
        f"SELECT * FROM product_audit_events WHERE {where} ORDER BY occurred_at DESC,id DESC LIMIT ? OFFSET ?",
        (*args, limit, offset),
    ) as cursor:
        return [dict(row) for row in await cursor.fetchall()]


def _public_row(row):
    item = dict(row)
    for key in ("metadata_json", "client_json"):
        try: item[key.removesuffix("_json")] = json.loads(item.pop(key) or "{}")
        except Exception: item[key.removesuffix("_json")] = {}
    return item


@router.get("/events")
async def list_events(days: int = Query(7, ge=1, le=90), category: str = "", outcome: str = "",
                      user_id: int | None = None, search: str = "", limit: int = Query(100, ge=1, le=500),
                      offset: int = Query(0, ge=0), current_user=Depends(_require_superadmin)):
    rows = await _load_rows(days, category, outcome, user_id, search, limit, offset)
    where, args = _where(days, category, outcome, user_id, search)
    async with db.conn.execute(f"SELECT COUNT(*) FROM product_audit_events WHERE {where}", args) as cur:
        total = int((await cur.fetchone())[0])
    return {"total": total, "events": [_public_row(row) for row in rows]}


@router.get("/summary")
async def summary(days: int = Query(7, ge=1, le=90), current_user=Depends(_require_superadmin)):
    rows = await _load_rows(days, limit=20000)
    where, args = _where(days, "", "", None, "")
    async with db.conn.execute(f"SELECT COUNT(*) FROM product_audit_events WHERE {where}", args) as cur:
        total = int((await cur.fetchone())[0])
    users = len({row["user_id"] for row in rows if row.get("user_id") is not None})
    errors = sum(row.get("outcome") == "error" for row in rows)
    rejected = sum(row.get("outcome") == "rejected" for row in rows)
    durations = sorted(int(row["duration_ms"]) for row in rows if row.get("duration_ms") is not None)
    p95 = durations[max(0, int(len(durations) * .95) - 1)] if durations else 0

    def top(field, count=10, predicate=lambda _row: True):
        from collections import Counter
        counter = Counter(str(row.get(field) or "—") for row in rows if predicate(row))
        return [{"name": name, "count": value} for name, value in counter.most_common(count)]

    daily = {}
    for row in rows:
        day = str(row.get("occurred_at") or "")[:10]
        point = daily.setdefault(day, {"date": day, "events": 0, "errors": 0, "rejected": 0})
        point["events"] += 1
        point["errors"] += row.get("outcome") == "error"
        point["rejected"] += row.get("outcome") == "rejected"
    return {
        "period_days": days, "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {"events": total, "users": users, "errors": errors, "rejected": rejected,
                   "error_rate": round(errors * 100 / total, 2) if total else 0, "p95_ms": p95},
        "top_pages": top("page", predicate=lambda r: r.get("event_name") == "page_view" and bool(r.get("page"))),
        "top_actions": top("element", predicate=lambda r: r.get("event_name") == "click" and bool(r.get("element"))),
        "top_errors": top("error_message", predicate=lambda r: r.get("outcome") == "error"),
        "by_role": top("user_role"), "by_category": top("category"),
        "daily": [daily[key] for key in sorted(daily)],
        "insights": build_insights(rows),
        "truncated": total > len(rows),
    }


@router.get("/export.csv")
async def export_csv(days: int = Query(7, ge=1, le=90), current_user=Depends(_require_superadmin)):
    rows = await _load_rows(days, limit=50000)
    output = io.StringIO(); output.write("\ufeff")
    fields = ["id","occurred_at","source","category","event_name","outcome","severity","user_id","user_fio",
              "user_role","page","route","method","status_code","duration_ms","element","target_type","target_id",
              "error_type","error_message","app_version","request_id","metadata_json","client_json"]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore"); writer.writeheader(); writer.writerows(rows)
    name = f"viks-audit-{datetime.now():%Y%m%d}-{days}d.csv"
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})
