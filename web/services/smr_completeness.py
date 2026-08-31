"""Completeness checks for the complete factual SMR report.

An hours row is a completion marker even when its value is zero: zero is a
valid, explicitly entered value. An additional-report row also completes
the participant: it is part of the same factual report, not missing input.
"""

from __future__ import annotations

from services.smr_sections import roster_member_ids


def _csv_ids(value) -> set[int]:
    result: set[int] = set()
    for part in str(value or "").split(","):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            result.add(int(part))
    return result


async def get_smr_completeness(db, app_ids: list[int], *, trust_confirmed: bool = True) -> dict[int, dict]:
    """Return a logical-report completeness result for every application.

    Every source application/object and every assigned brigade must have its
    hours section saved (main or additional). For modern applications, every explicitly
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
        f"WHERE app_id IN ({marks})",
        tuple(normalized),
    ) as cur:
        saved_rows = {
            (int(row[0]), int(row[1]), int(row[2]))
            for row in await cur.fetchall()
        }
    # Legacy merges stored all rows on the primary application. A unique
    # selected-person match owns that row, just as in the canonical read model.
    attributed = set()
    for stored_app, team_id, member_id in saved_rows:
        owners = [int(a['id']) for a in applications
                  if team_id in _csv_ids(a.get('team_id'))
                  and member_id in _csv_ids(a.get('selected_members'))]
        attributed.add((owners[0] if len(owners) == 1 else stored_app, team_id, member_id))
    saved_rows = attributed

    # New reports use a frozen roster and explicit brigade state. Tests and
    # pre-migration databases may not have the table yet, so keep the legacy
    # calculation as a safe fallback until the migration runs.
    async with db.conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='smr_team_sections'"
    ) as cur:
        has_sections_table = await cur.fetchone() is not None
    section_map: dict[tuple[int, int], dict] = {}
    if has_sections_table:
        async with db.conn.execute(
            f"SELECT * FROM smr_team_sections WHERE app_id IN ({marks})",
            tuple(normalized),
        ) as cur:
            section_map = {
                (int(row["app_id"]), int(row["team_id"])): dict(row)
                for row in await cur.fetchall()
            }

    raw: dict[int, dict] = {}
    for app in applications:
        app_id = int(app["id"])
        app_team_ids = _csv_ids(app.get("team_id"))
        selected_ids = _csv_ids(app.get("selected_members"))
        missing_sections = 0
        missing_members = 0
        not_worked_sections = 0
        submitted_sections = 0
        confirmed_sections = 0
        for team_id in app_team_ids:
            section = section_map.get((app_id, team_id), {})
            if not section.get('is_required', 1):
                continue
            section_status = section.get("status") or "draft"
            if section_status == "not_worked":
                not_worked_sections += 1
                continue
            if section_status == "confirmed" and trust_confirmed:
                # Historical ready reports were confirmed under the rules
                # active at the time. Their completeness must not change when
                # today's brigade roster changes.
                confirmed_sections += 1
                continue
            if section_status == "submitted":
                submitted_sections += 1
            expected = roster_member_ids(section)
            if not expected:
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
            "not_worked_sections": not_worked_sections,
            "submitted_sections": submitted_sections,
            "confirmed_sections": confirmed_sections,
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
        not_worked_sections = sum(raw[app_id]["not_worked_sections"] for app_id in member_ids)
        submitted_sections = sum(raw[app_id]["submitted_sections"] for app_id in member_ids)
        confirmed_sections = sum(raw[app_id]["confirmed_sections"] for app_id in member_ids)
        group_result = {
            "is_complete": missing_sections == 0,
            "missing_sections": missing_sections,
            "missing_members": missing_members,
            "not_worked_sections": not_worked_sections,
            "submitted_sections": submitted_sections,
            "confirmed_sections": confirmed_sections,
        }
        for app_id in member_ids:
            result[app_id] = dict(group_result)
    return result
