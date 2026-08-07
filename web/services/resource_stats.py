"""Canonical resource statistics built from stored application allocations.

The UI previously counted whole applications. That made a partially selected
brigade look like a full brigade and treated a two-hour machine shift like a
full day. These helpers count the actual selected people and equipment hours.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import date, timedelta


ACTIVE_STATUSES = {"waiting", "approved", "published", "in_progress", "completed"}


def _cutoff(period: str) -> str | None:
    days = {"week": 7, "month": 30}.get(period)
    return (date.today() - timedelta(days=days - 1)).isoformat() if days else None


def _csv_ids(raw) -> set[int]:
    result: set[int] = set()
    for part in str(raw or "").split(","):
        try:
            value = int(part.strip())
        except (TypeError, ValueError):
            continue
        if value:
            result.add(value)
    return result


def _equipment_rows(raw) -> list[dict]:
    try:
        rows = json.loads(raw) if isinstance(raw, str) else (raw or [])
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def _clock_minutes(value) -> int | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parts = raw.split(":", 1)
        hours = int(parts[0])
        minutes = int(parts[1]) if len(parts) > 1 else 0
    except (TypeError, ValueError):
        return None
    if hours == 24 and minutes == 0:
        return 1440
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        return None
    return hours * 60 + minutes


def equipment_duration_hours(row: dict) -> float:
    start = _clock_minutes(row.get("time_start"))
    end = _clock_minutes(row.get("time_end"))
    if start is None or end is None or end <= start:
        return 0.0
    return round((end - start) / 60, 2)


async def _applications(db, *, cutoff: str | None = None, object_id: int | None = None) -> list[dict]:
    sql = (
        "SELECT a.id,a.public_number,a.date_target,a.status,a.foreman_name,"
        "a.team_id,a.selected_members,a.equipment_data,a.object_id,"
        "COALESCE(NULLIF(o.name,''),NULLIF(a.object_address,''),'Без объекта') AS object_name "
        "FROM applications a LEFT JOIN objects o ON o.id=a.object_id "
        "WHERE (a.is_archived=0 OR a.is_archived IS NULL)"
    )
    params: list = []
    if cutoff:
        sql += " AND a.date_target>=?"
        params.append(cutoff)
    if object_id is not None:
        sql += " AND a.object_id=?"
        params.append(int(object_id))
    sql += " ORDER BY a.date_target DESC,a.id DESC"
    async with db.conn.execute(sql, params) as cur:
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, row)) for row in await cur.fetchall()]
    return [row for row in rows if row.get("status") in ACTIVE_STATUSES]


async def team_stats(db, team_id: int, period: str = "month") -> dict:
    async with db.conn.execute(
        "SELECT id FROM team_members WHERE team_id=?", (int(team_id),)
    ) as cur:
        member_ids = {int(row[0]) for row in await cur.fetchall()}

    apps = await _applications(db, cutoff=_cutoff(period))
    app_hours: dict[int, float] = {}
    async with db.conn.execute(
        "SELECT app_id,COALESCE(SUM(hours),0) FROM application_hours WHERE team_id=? GROUP BY app_id",
        (int(team_id),),
    ) as cur:
        app_hours = {int(row[0]): float(row[1] or 0) for row in await cur.fetchall()}

    assignments: list[dict] = []
    for app in apps:
        if int(team_id) not in _csv_ids(app.get("team_id")):
            continue
        selected = _csv_ids(app.get("selected_members"))
        participants = (selected & member_ids) if selected else set(member_ids)
        # For a multi-brigade request, a listed brigade with no selected
        # member did not actually participate and must not inflate totals.
        if selected and member_ids and not participants:
            continue
        assignments.append({
            **app,
            "participant_count": len(participants),
            "is_partial": bool(member_ids and len(participants) < len(member_ids)),
            "labor_hours": round(app_hours.get(int(app["id"]), 0.0), 2),
        })

    objects = sorted({row["object_name"] for row in assignments if row.get("object_name")})
    foremen = Counter(row.get("foreman_name") for row in assignments if row.get("foreman_name"))
    return {
        "total": len(assignments),
        "completed": sum(row.get("status") == "completed" for row in assignments),
        "work_days": len({row.get("date_target") for row in assignments if row.get("date_target")}),
        "objects": objects,
        "partial_assignments": sum(row["is_partial"] for row in assignments),
        "people_assignments": sum(row["participant_count"] for row in assignments),
        "labor_hours": round(sum(row["labor_hours"] for row in assignments), 2),
        "top_foremen": foremen.most_common(5),
        "last_app": assignments[0] if assignments else None,
    }


async def equipment_stats(db, equipment_id: int, period: str = "month") -> dict:
    apps = await _applications(db, cutoff=_cutoff(period))
    assignments: list[dict] = []
    for app in apps:
        entry = next((row for row in _equipment_rows(app.get("equipment_data"))
                      if int(row.get("id") or 0) == int(equipment_id)), None)
        if not entry:
            continue
        assignments.append({**app, "hours": equipment_duration_hours(entry)})

    total_hours = round(sum(row["hours"] for row in assignments), 2)
    period_days = {"week": 7, "month": 30}.get(period)
    utilization = round(total_hours / (period_days * 9) * 100) if period_days else None
    objects = sorted({row["object_name"] for row in assignments if row.get("object_name")})
    foremen = Counter(row.get("foreman_name") for row in assignments if row.get("foreman_name"))
    return {
        "total": len(assignments),
        "completed": sum(row.get("status") == "completed" for row in assignments),
        "work_days": len({row.get("date_target") for row in assignments if row.get("date_target")}),
        "work_hours": total_hours,
        "objects": objects,
        "utilization": utilization,
        "top_foremen": foremen.most_common(5),
        "last_app": assignments[0] if assignments else None,
    }


async def object_resource_stats(db, object_id: int) -> dict:
    apps = await _applications(db, object_id=object_id)
    team_assignments = 0
    partial_teams = 0
    people_assignments = 0
    equipment_assignments = 0
    equipment_hours = 0.0

    async with db.conn.execute("SELECT id,team_id FROM team_members") as cur:
        members_by_team: dict[int, set[int]] = {}
        for member_id, team_id in await cur.fetchall():
            members_by_team.setdefault(int(team_id), set()).add(int(member_id))

    for app in apps:
        selected = _csv_ids(app.get("selected_members"))
        for team_id in _csv_ids(app.get("team_id")):
            team_members = members_by_team.get(team_id, set())
            participants = (selected & team_members) if selected else set(team_members)
            if selected and team_members and not participants:
                continue
            team_assignments += 1
            people_assignments += len(participants)
            partial_teams += int(bool(team_members and len(participants) < len(team_members)))
        for entry in _equipment_rows(app.get("equipment_data")):
            equipment_assignments += 1
            equipment_hours += equipment_duration_hours(entry)

    async with db.conn.execute(
        "SELECT COALESCE(SUM(ah.hours),0) FROM application_hours ah "
        "JOIN applications a ON a.id=ah.app_id WHERE a.object_id=? "
        "AND (a.is_archived=0 OR a.is_archived IS NULL) "
        "AND a.status IN ('waiting','approved','published','in_progress','completed')",
        (int(object_id),),
    ) as cur:
        labor_row = await cur.fetchone()
    return {
        "applications": len(apps),
        "work_days": len({row.get("date_target") for row in apps if row.get("date_target")}),
        "team_assignments": team_assignments,
        "partial_teams": partial_teams,
        "people_assignments": people_assignments,
        "labor_hours": round(float(labor_row[0] or 0) if labor_row else 0, 2),
        "equipment_assignments": equipment_assignments,
        "equipment_hours": round(equipment_hours, 2),
    }
