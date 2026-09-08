"""Stable brigade sections and finalization rules for SMR reports."""

from __future__ import annotations

import json
from datetime import datetime


ALLOWED_STATUSES = {"draft", "submitted", "not_worked", "confirmed"}


def csv_ids(value) -> list[int]:
    result: list[int] = []
    for part in str(value or "").split(","):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            result.append(int(part))
    return result


async def ensure_smr_team_sections(db, app_ids: list[int], *, commit: bool = False) -> list[dict]:
    """Create immutable roster snapshots once for every application brigade."""
    normalized = sorted({int(value) for value in app_ids if int(value) > 0})
    if not normalized:
        return []
    marks = ",".join("?" for _ in normalized)
    async with db.conn.execute(
        f"SELECT id,team_id,selected_members FROM applications WHERE id IN ({marks})",
        tuple(normalized),
    ) as cursor:
        applications = [dict(row) for row in await cursor.fetchall()]

    for app in applications:
        selected = set(csv_ids(app.get("selected_members")))
        for team_id in csv_ids(app.get("team_id")):
            async with db.conn.execute(
                "SELECT id,fio,position FROM team_members WHERE team_id=? "
                "ORDER BY is_foreman DESC,fio",
                (team_id,),
            ) as cursor:
                members = [dict(row) for row in await cursor.fetchall()]
            if selected:
                members = [member for member in members if int(member["id"]) in selected]
            roster = [
                {
                    "member_id": int(member["id"]),
                    "fio": member.get("fio") or "",
                    "position": member.get("position") or "",
                }
                for member in members
            ]
            await db.conn.execute(
                """
                INSERT OR IGNORE INTO smr_team_sections
                    (app_id,team_id,status,roster_json)
                VALUES (?,?, 'draft', ?)
                """,
                (int(app["id"]), team_id, json.dumps(roster, ensure_ascii=False)),
            )
    if commit:
        await db.conn.commit()
    async with db.conn.execute(
        f"SELECT * FROM smr_team_sections WHERE app_id IN ({marks}) ORDER BY app_id,team_id",
        tuple(normalized),
    ) as cursor:
        return [dict(row) for row in await cursor.fetchall()]


async def get_smr_team_sections(db, app_ids: list[int]) -> list[dict]:
    return await ensure_smr_team_sections(db, app_ids)


async def sync_application_roster(db, app_id: int, team_ids, selected_members) -> None:
    """Apply an explicit application roster edit in the caller's transaction.

    Directory changes alone never refresh snapshots. Saved hours are retained,
    including rows for deselected people (the hours API exposes them as ad-hoc).
    Completed reports must be edited through the dedicated SMR editor.
    """
    from fastapi import HTTPException
    from smr_roster import aliases_for, roster

    async with db.conn.execute(
        'SELECT team_id,selected_members,smr_status,kp_status FROM applications WHERE id=?',
        (app_id,),
    ) as cursor:
        app = dict(await cursor.fetchone())
    teams, selected = set(csv_ids(team_ids)), set(csv_ids(selected_members))
    if teams == set(csv_ids(app['team_id'])) and selected == set(csv_ids(app['selected_members'])):
        return
    if app.get('smr_status') == 'approved' or app.get('kp_status') == 'approved':
        raise HTTPException(409, 'СМР уже завершён. Измените участников в редакторе готового отчёта.')

    sections = await ensure_smr_team_sections(db, [app_id])
    if any(s.get('status') == 'confirmed' for s in sections):
        raise HTTPException(409, 'Состав подтверждённого СМР изменяется в редакторе готового отчёта.')
    aliases = {int(a['old_member_id']): int(a['member_id']) for a in await aliases_for(db, [app_id])}
    selected = {aliases.get(mid, mid) for mid in selected}
    snapshots = {int(s['team_id']): roster(s) for s in sections}
    rosters = {}
    for tid in sorted(teams):
        # Keep names and brigade attribution of retained historical people.
        members = {int(m['member_id']): m for m in snapshots.get(tid, [])
                   if not selected or int(m['member_id']) in selected}
        async with db.conn.execute(
            'SELECT id,fio,position FROM team_members WHERE team_id=? ORDER BY id', (tid,),
        ) as cursor:
            for row in await cursor.fetchall():
                mid = int(row['id'])
                if (not selected or mid in selected) and not any(
                    int(m['member_id']) == mid for sid, entries in snapshots.items()
                    if sid in teams and sid != tid for m in entries
                ):
                    members.setdefault(mid, {'member_id': mid, 'fio': row['fio'], 'position': row['position']})
        rosters[tid] = list(members.values())
    covered = {int(m['member_id']) for members in rosters.values() for m in members}
    if selected - covered:
        ids = ', '.join(str(mid) for mid in sorted(selected - covered))
        raise HTTPException(409, f'Не удалось определить бригаду выбранных сотрудников (ID: {ids}). Обновите состав заявки.')
    # Retire only the requirement; never remove historical sections or facts.
    marks = ','.join('?' for _ in teams)
    await db.conn.execute(
        'UPDATE smr_team_sections SET is_required=0 WHERE app_id=?'
        + (f' AND team_id NOT IN ({marks})' if teams else ''),
        (app_id, *sorted(teams)),
    )
    for tid, members in rosters.items():
        await db.conn.execute(
            """INSERT INTO smr_team_sections(app_id,team_id,roster_json,is_required)
               VALUES(?,?,?,?) ON CONFLICT(app_id,team_id) DO UPDATE SET
               roster_json=excluded.roster_json, is_required=excluded.is_required,
               status=CASE WHEN smr_team_sections.roster_json!=excluded.roster_json
                   OR smr_team_sections.is_required!=excluded.is_required THEN 'draft' ELSE smr_team_sections.status END,
               not_worked_reason=CASE WHEN smr_team_sections.roster_json!=excluded.roster_json
                   THEN '' ELSE smr_team_sections.not_worked_reason END,
               updated_at=CURRENT_TIMESTAMP""",
            (app_id, tid, json.dumps(members, ensure_ascii=False), int(bool(members) or not selected)),
        )


async def set_smr_team_section_status(
    db,
    app_id: int,
    team_id: int,
    status: str,
    *,
    actor_id: int,
    actor_role: str,
    reason: str = "",
    commit: bool = True,
) -> dict:
    if status not in ALLOWED_STATUSES:
        raise ValueError("unknown SMR team status")
    await ensure_smr_team_sections(db, [app_id])
    now = datetime.now().isoformat(timespec="seconds")
    await db.conn.execute(
        """
        UPDATE smr_team_sections
        SET status=?, not_worked_reason=?, updated_by=?, updated_by_role=?,
            submitted_at=CASE WHEN ? IN ('submitted','confirmed') THEN ? ELSE submitted_at END,
            updated_at=?
        WHERE app_id=? AND team_id=?
        """,
        (
            status,
            reason.strip() if status == "not_worked" else "",
            actor_id,
            actor_role,
            status,
            now,
            now,
            int(app_id),
            int(team_id),
        ),
    )
    async with db.conn.execute(
        "SELECT * FROM smr_team_sections WHERE app_id=? AND team_id=?",
        (int(app_id), int(team_id)),
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise LookupError("SMR team section not found")
    if commit:
        await db.conn.commit()
    return dict(row)


async def mark_payload_sections_submitted(
    db,
    group_ids: list[int],
    items: list[dict],
    *,
    actor_id: int,
    actor_role: str,
) -> None:
    """Mark every application/team carrying saved factual data as submitted."""
    group = {int(value) for value in group_ids}
    touched: set[tuple[int, int]] = set()
    for item in items:
        try:
            app_id = int(item.get("source_application_id") or min(group))
            team_id = int(item.get("team_id") or 0)
        except (TypeError, ValueError):
            continue
        if app_id in group and team_id > 0:
            touched.add((app_id, team_id))
    for app_id, team_id in sorted(touched):
        # Ad-hoc employees keep the id of their home brigade in hours rows,
        # even when that brigade is not assigned to this application. Such a
        # payload bucket has no required section and must not turn an otherwise
        # valid submit into a server error. Assigned brigades already have a
        # frozen section created by ensure_smr_team_sections.
        await ensure_smr_team_sections(db, [app_id])
        async with db.conn.execute(
            "SELECT 1 FROM smr_team_sections WHERE app_id=? AND team_id=?",
            (app_id, team_id),
        ) as cursor:
            if not await cursor.fetchone():
                continue
        await set_smr_team_section_status(
            db,
            app_id,
            team_id,
            "submitted",
            actor_id=actor_id,
            actor_role=actor_role,
            commit=False,
        )


def roster_member_ids(row: dict) -> set[int]:
    try:
        roster = json.loads(row.get("roster_json") or "[]")
    except (TypeError, ValueError, json.JSONDecodeError):
        roster = []
    result: set[int] = set()
    for member in roster if isinstance(roster, list) else []:
        try:
            result.add(int(member.get("member_id")))
        except (AttributeError, TypeError, ValueError):
            continue
    return {value for value in result if value > 0}
