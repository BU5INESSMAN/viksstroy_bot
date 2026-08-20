"""Completeness checks for main SMR reports.

An hours row is a completion marker even when its value is zero: zero is a
valid, explicitly entered value. Additional-report rows never complete the
main report.
"""

from __future__ import annotations


def _csv_ids(value) -> set[int]:
    result: set[int] = set()
    for part in str(value or "").split(","):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            result.add(int(part))
    return result


async def get_smr_completeness(db, app_ids: list[int]) -> dict[int, dict]:
    """Return a logical-report completeness result for every application.

    Every source application/object and every assigned brigade must have its
    main hours section saved. For modern applications, every explicitly
    selected participant must have a row; for legacy applications without a
    saved roster, at least one row per brigade is required.
    """
    normalized_ids: set[int] = set()
    for value in app_ids:
        try:
            app_id = int(value)
        except (TypeError, ValueError):
            continue
        if app_id > 0:
            normalized_ids.add(app_id)
    normalized = sorted(normalized_ids)
    if not normalized:
        return {}
    marks = ",".join("?" for _ in normalized)
    async with db.conn.execute(
        f"SELECT id,smr_group_id,team_id,selected_members FROM applications "
        f"WHERE id IN ({marks})",
        tuple(normalized),
    ) as cur:
        applications = [dict(row) for row in await cur.fetchall()]

    team_ids = {
        team_id
        for app in applications
        for team_id in _csv_ids(app.get("team_id"))
    }
    member_team: dict[int, int] = {}
    if team_ids:
        team_marks = ",".join("?" for _ in team_ids)
        async with db.conn.execute(
            f"SELECT id,team_id FROM team_members WHERE team_id IN ({team_marks})",
            tuple(sorted(team_ids)),
        ) as cur:
            member_team = {int(row[0]): int(row[1]) for row in await cur.fetchall()}

    async with db.conn.execute(
        f"SELECT app_id,team_id,user_id FROM application_hours "
        f"WHERE app_id IN ({marks}) AND COALESCE(is_additional,0)=0",
        tuple(normalized),
    ) as cur:
        saved_rows = {
            (int(row[0]), int(row[1]), int(row[2]))
            for row in await cur.fetchall()
        }

    raw: dict[int, dict] = {}
    for app in applications:
        app_id = int(app["id"])
        app_team_ids = _csv_ids(app.get("team_id"))
        selected_ids = _csv_ids(app.get("selected_members"))
        missing_sections = 0
        missing_members = 0
        for team_id in app_team_ids:
            expected = {
                member_id for member_id in selected_ids
                if member_team.get(member_id) == team_id
            }
            saved = {
                member_id for saved_app, saved_team, member_id in saved_rows
                if saved_app == app_id and saved_team == team_id
            }
            if selected_ids:
                missing = expected - saved
                if not expected or missing:
                    missing_sections += 1
                    missing_members += max(1, len(missing))
            elif not saved:
                # Compatibility for old applications where the original
                # participant roster was never persisted.
                missing_sections += 1
                missing_members += 1
        if not app_team_ids:
            missing_sections = 1
            missing_members = 1
        raw[app_id] = {
            "is_complete": missing_sections == 0,
            "missing_sections": missing_sections,
            "missing_members": missing_members,
        }

    logical_groups: dict[str, list[int]] = {}
    for app in applications:
        app_id = int(app["id"])
        group_id = str(app.get("smr_group_id") or "").strip()
        logical_groups.setdefault(group_id or f"app:{app_id}", []).append(app_id)

    result: dict[int, dict] = {}
    for member_ids in logical_groups.values():
        missing_sections = sum(raw[app_id]["missing_sections"] for app_id in member_ids)
        missing_members = sum(raw[app_id]["missing_members"] for app_id in member_ids)
        group_result = {
            "is_complete": missing_sections == 0,
            "missing_sections": missing_sections,
            "missing_members": missing_members,
        }
        for app_id in member_ids:
            result[app_id] = dict(group_result)
    return result
