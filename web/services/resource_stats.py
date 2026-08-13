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


def _released_minutes(released_at, date_target) -> int | None:
    raw = str(released_at or "").strip()
    if not raw or not date_target or raw[:10] != str(date_target)[:10]:
        return None
    try:
        time_part = raw.split("T", 1)[1] if "T" in raw else raw.split(" ", 1)[1]
    except IndexError:
        return None
    return _clock_minutes(time_part[:5])


def equipment_assignment_hours(row: dict, release_at=None, date_target=None) -> float:
    start = _clock_minutes(row.get("time_start"))
    planned_end = _clock_minutes(row.get("time_end"))
    actual_end = _released_minutes(release_at, date_target)
    # A manual release is the factual end of the assignment. It may happen
    # before or after the planned end and therefore deliberately takes
    # precedence over the schedule.
    end = actual_end if actual_end is not None else planned_end
    if start is None or end is None or end <= start:
        return 0.0
    return round((end - start) / 60, 2)


async def _release_map(db, app_ids: list[int]) -> dict[tuple[int, str, int], str]:
    if not app_ids:
        return {}
    marks = ",".join("?" for _ in app_ids)
    try:
        async with db.conn.execute(
            f"SELECT application_id,resource_type,resource_id,released_at "
            f"FROM application_resource_releases WHERE application_id IN ({marks})",
            app_ids,
        ) as cur:
            return {
                (int(row[0]), str(row[1]), int(row[2])): str(row[3] or "")
                for row in await cur.fetchall()
            }
    except Exception:
        return {}


async def _applications(db, *, cutoff: str | None = None, object_id: int | None = None) -> list[dict]:
    sql = (
        "SELECT a.id,a.public_number,a.date_target,a.status,a.foreman_name,"
        "a.time_start,a.time_end,"
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


async def team_stats(
    db, team_id: int, period: str = "month", *,
    _apps: list[dict] | None = None,
    _app_hours: dict[int, float] | None = None,
) -> dict:
    async with db.conn.execute(
        "SELECT id FROM team_members WHERE team_id=?", (int(team_id),)
    ) as cur:
        member_ids = {int(row[0]) for row in await cur.fetchall()}

    apps = _apps if _apps is not None else await _applications(db, cutoff=_cutoff(period))
    app_hours: dict[int, float] = _app_hours or {}
    if _app_hours is None:
        async with db.conn.execute(
            "SELECT app_id,COALESCE(SUM(hours),0) FROM application_hours WHERE team_id=? GROUP BY app_id",
            (int(team_id),),
        ) as cur:
            app_hours = {int(row[0]): float(row[1] or 0) for row in await cur.fetchall()}

    assignments: list[dict] = []
    releases = await _release_map(db, [int(app["id"]) for app in apps])
    for app in apps:
        if int(team_id) not in _csv_ids(app.get("team_id")):
            continue
        selected = _csv_ids(app.get("selected_members"))
        participants = (selected & member_ids) if selected else set(member_ids)
        # For a multi-brigade request, a listed brigade with no selected
        # member did not actually participate and must not inflate totals.
        if selected and member_ids and not participants:
            continue
        release_at = releases.get((int(app["id"]), "team", int(team_id)))
        assignment_hours = equipment_assignment_hours(
            {"time_start": app.get("time_start"), "time_end": app.get("time_end")},
            release_at,
            app.get("date_target"),
        )
        assignments.append({
            **app,
            "participant_count": len(participants),
            "is_partial": bool(member_ids and len(participants) < len(member_ids)),
            "labor_hours": round(app_hours.get(int(app["id"]), 0.0), 2),
            "work_hours": assignment_hours,
            "released_at": release_at,
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
        "work_hours": round(sum(row["work_hours"] for row in assignments), 2),
        "top_foremen": foremen.most_common(5),
        "last_app": assignments[0] if assignments else None,
    }


async def equipment_stats(
    db, equipment_id: int, period: str = "month", *,
    _apps: list[dict] | None = None,
) -> dict:
    apps = _apps if _apps is not None else await _applications(db, cutoff=_cutoff(period))
    assignments: list[dict] = []
    releases = await _release_map(db, [int(app["id"]) for app in apps])
    for app in apps:
        entry = next((row for row in _equipment_rows(app.get("equipment_data"))
                      if int(row.get("id") or 0) == int(equipment_id)), None)
        if not entry:
            continue
        release_at = releases.get((int(app["id"]), "equipment", int(equipment_id)))
        assignments.append({
            **app,
            "hours": equipment_assignment_hours(entry, release_at, app.get("date_target")),
            "released_at": release_at,
        })

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


async def teams_overview(
    db, period: str = "month", team_ids: set[int] | None = None,
) -> dict:
    """Aggregate every visible brigade and its real member participation."""
    params: list[int] = []
    where = ""
    if team_ids is not None:
        if not team_ids:
            return {"kind": "teams", "metrics": [], "rows": []}
        marks = ",".join("?" for _ in team_ids)
        where = f"WHERE t.id IN ({marks})"
        params = sorted(team_ids)
    async with db.conn.execute(
        f"""SELECT t.id,t.name,
                   COUNT(tm.id) AS member_count,
                   SUM(CASE WHEN EXISTS(
                     SELECT 1 FROM users max_user
                      WHERE max_user.user_id<0
                        AND COALESCE(max_user.is_active,0)=1
                        AND (
                          max_user.user_id=tm.tg_user_id
                          OR EXISTS(
                            SELECT 1 FROM account_links al
                             WHERE (al.primary_id=tm.tg_user_id AND al.secondary_id=max_user.user_id)
                                OR (al.secondary_id=tm.tg_user_id AND al.primary_id=max_user.user_id)
                          )
                        )
                   ) THEN 1 ELSE 0 END) AS linked_count,
                   SUM(CASE WHEN tm.is_foreman=1 THEN 1 ELSE 0 END) AS brigadier_count
              FROM teams t LEFT JOIN team_members tm ON tm.team_id=t.id
              {where}
             GROUP BY t.id,t.name ORDER BY t.name""",
        params,
    ) as cur:
        base_rows = [dict(row) for row in await cur.fetchall()]

    visible_team_ids = [int(row["id"]) for row in base_rows]
    members_by_team: dict[int, list[dict]] = {}
    member_hours: dict[int, float] = {}
    if visible_team_ids:
        team_marks = ",".join("?" for _ in visible_team_ids)
        async with db.conn.execute(
            f"SELECT tm.id,tm.team_id,tm.fio,tm.position,tm.tg_user_id,tm.status,tm.status_from,tm.status_until, "
            f"CASE WHEN EXISTS(SELECT 1 FROM users max_user "
            f"WHERE max_user.user_id<0 AND COALESCE(max_user.is_active,0)=1 AND ("
            f"max_user.user_id=tm.tg_user_id OR EXISTS(SELECT 1 FROM account_links al "
            f"WHERE (al.primary_id=tm.tg_user_id AND al.secondary_id=max_user.user_id) "
            f"OR (al.secondary_id=tm.tg_user_id AND al.primary_id=max_user.user_id)))) "
            f"THEN 1 ELSE 0 END "
            f"FROM team_members tm WHERE tm.team_id IN ({team_marks}) "
            f"ORDER BY team_id,is_foreman DESC,fio",
            visible_team_ids,
        ) as cur:
            for member in await cur.fetchall():
                members_by_team.setdefault(int(member[1]), []).append({
                    "id": int(member[0]), "fio": member[2] or "Сотрудник",
                    "position": member[3] or "", "max_linked": bool(member[8]),
                    "status": member[5] or "available", "status_from": member[6],
                    "status_until": member[7],
                })
        hours_sql = (
            f"SELECT ah.user_id,COALESCE(SUM(ah.hours),0) "
            f"FROM application_hours ah JOIN applications a ON a.id=ah.app_id "
            f"WHERE ah.team_id IN ({team_marks}) "
            f"AND a.status IN ('waiting','approved','published','in_progress','completed')"
        )
        hours_params: list = list(visible_team_ids)
        cutoff = _cutoff(period)
        if cutoff:
            hours_sql += " AND a.date_target>=?"
            hours_params.append(cutoff)
        hours_sql += " GROUP BY ah.user_id"
        async with db.conn.execute(hours_sql, hours_params) as cur:
            member_hours = {int(row[0]): round(float(row[1] or 0), 2) for row in await cur.fetchall()}

    rows = []
    all_apps = await _applications(db, cutoff=_cutoff(period))
    hours_by_team_app: dict[tuple[int, int], float] = {}
    async with db.conn.execute(
        "SELECT team_id,app_id,COALESCE(SUM(hours),0) "
        "FROM application_hours GROUP BY team_id,app_id"
    ) as cur:
        hours_by_team_app = {
            (int(row[0]), int(row[1])): float(row[2] or 0)
            for row in await cur.fetchall()
        }
    for team in base_rows:
        team_id = int(team["id"])
        stats = await team_stats(
            db, team_id, period,
            _apps=all_apps,
            _app_hours={
                app_id: hours
                for (hours_team_id, app_id), hours in hours_by_team_app.items()
                if hours_team_id == team_id
            },
        )
        members = members_by_team.get(int(team["id"]), [])
        for member in members:
            member["labor_hours"] = member_hours.get(member["id"], 0)
        rows.append({
            **team,
            "members": members,
            "assignments": stats["total"],
            "work_days": stats["work_days"],
            "partial_assignments": stats["partial_assignments"],
            "people_assignments": stats["people_assignments"],
            "labor_hours": stats["labor_hours"],
            "work_hours": stats["work_hours"],
            "objects_count": len(stats["objects"]),
        })
    return {
        "kind": "teams",
        "metrics": [
            {"label": "Бригад", "value": len(rows)},
            {"label": "Участников", "value": sum(int(r.get("member_count") or 0) for r in rows)},
            {"label": "Привязано к MAX", "value": sum(int(r.get("linked_count") or 0) for r in rows)},
            {"label": "Часов по СМР", "value": round(sum(float(r.get("labor_hours") or 0) for r in rows), 2)},
            {"label": "Часов на объектах", "value": round(sum(float(r.get("work_hours") or 0) for r in rows), 2)},
        ],
        "rows": rows,
    }


async def equipment_overview(db, period: str = "month") -> dict:
    """Aggregate the whole fleet using the same shift-based calculations."""
    async with db.conn.execute(
        "SELECT id,name,category,status,license_plate,default_driver_user_id "
        "FROM equipment WHERE COALESCE(is_active,1)=1 ORDER BY category,name"
    ) as cur:
        base_rows = [dict(row) for row in await cur.fetchall()]
    rows = []
    all_apps = await _applications(db, cutoff=_cutoff(period))
    for equipment in base_rows:
        stats = await equipment_stats(db, int(equipment["id"]), period, _apps=all_apps)
        rows.append({
            **equipment,
            "assignments": stats["total"],
            "work_days": stats["work_days"],
            "work_hours": stats["work_hours"],
            "objects_count": len(stats["objects"]),
            "utilization": stats["utilization"],
        })
    return {
        "kind": "equipment",
        "metrics": [
            {"label": "Единиц техники", "value": len(rows)},
            {"label": "Свободно", "value": sum(r.get("status") == "free" for r in rows)},
            {"label": "В ремонте", "value": sum(r.get("status") == "repair" for r in rows)},
            {"label": "Моточасов", "value": round(sum(float(r.get("work_hours") or 0) for r in rows), 2)},
        ],
        "rows": rows,
    }


async def drivers_overview(db, period: str = "month") -> dict:
    """MAX binding and assignment statistics for every active driver."""
    cutoff = _cutoff(period)
    async with db.conn.execute(
        """SELECT u.user_id,u.fio,u.member_status,u.status_from,u.status_until,
                  CASE
                    WHEN u.user_id < 0 AND COALESCE(u.is_active,0)=1 THEN 1
                    WHEN EXISTS(
                      SELECT 1 FROM account_links al
                      JOIN users max_user ON max_user.user_id = CASE
                        WHEN al.primary_id=u.user_id THEN al.secondary_id
                        ELSE al.primary_id END
                       WHERE (al.primary_id=u.user_id OR al.secondary_id=u.user_id)
                         AND max_user.user_id<0
                         AND COALESCE(max_user.is_active,0)=1
                    ) THEN 1 ELSE 0
                  END AS max_linked
             FROM users u
            WHERE u.role='driver' AND COALESCE(u.is_blacklisted,0)=0
              AND COALESCE(u.is_deleted,0)=0
            ORDER BY u.fio"""
    ) as cur:
        drivers = [dict(row) for row in await cur.fetchall()]

    sql = (
        "SELECT ad.driver_user_id,COUNT(*) AS assignments,"
        "COUNT(DISTINCT a.date_target) AS work_days,"
        "COUNT(DISTINCT ad.equipment_id) AS equipment_count,"
        "COUNT(DISTINCT COALESCE(a.object_id,a.object_address)) AS objects_count "
        "FROM application_drivers ad JOIN applications a ON a.id=ad.application_id "
        "WHERE a.status IN ('waiting','approved','published','in_progress','completed')"
    )
    query_params: list[str] = []
    if cutoff:
        sql += " AND a.date_target>=?"
        query_params.append(cutoff)
    sql += " GROUP BY ad.driver_user_id"
    async with db.conn.execute(sql, query_params) as cur:
        assignment_map = {int(row[0]): dict(row) for row in await cur.fetchall()}

    today = date.today().isoformat()
    for driver in drivers:
        assignment = assignment_map.get(int(driver["user_id"]), {})
        driver.update({
            "assignments": int(assignment.get("assignments") or 0),
            "work_days": int(assignment.get("work_days") or 0),
            "equipment_count": int(assignment.get("equipment_count") or 0),
            "objects_count": int(assignment.get("objects_count") or 0),
        })
        configured = driver.get("member_status") or "available"
        active_now = configured
        if configured in ("vacation", "sick"):
            if driver.get("status_from") and today < driver["status_from"]:
                active_now = "available"
            if driver.get("status_until") and today > driver["status_until"]:
                active_now = "available"
        driver["effective_status"] = active_now

    return {
        "kind": "drivers",
        "metrics": [
            {"label": "Водителей", "value": len(drivers)},
            {"label": "MAX привязан", "value": sum(bool(r.get("max_linked")) for r in drivers)},
            {"label": "Без MAX", "value": sum(not bool(r.get("max_linked")) for r in drivers)},
            {"label": "Назначений", "value": sum(int(r.get("assignments") or 0) for r in drivers)},
        ],
        "rows": drivers,
    }


async def object_resource_stats(db, object_id: int) -> dict:
    apps = await _applications(db, object_id=object_id)
    releases = await _release_map(db, [int(app["id"]) for app in apps])
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
            equipment_id = int(entry.get("id") or 0)
            equipment_hours += equipment_assignment_hours(
                entry,
                releases.get((int(app["id"]), "equipment", equipment_id)),
                app.get("date_target"),
            )

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
