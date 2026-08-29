"""Create stable per-brigade progress for the SMR completion workflow."""

from __future__ import annotations

import json


def _ids(value) -> list[int]:
    result: list[int] = []
    for part in str(value or "").split(","):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            result.append(int(part))
    return result


async def run(conn) -> None:
    await conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS smr_team_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft', 'submitted', 'not_worked', 'confirmed')),
            roster_json TEXT NOT NULL DEFAULT '[]',
            not_worked_reason TEXT DEFAULT '',
            updated_by INTEGER,
            updated_by_role TEXT DEFAULT '',
            submitted_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(app_id, team_id),
            FOREIGN KEY (app_id) REFERENCES applications(id),
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );
        CREATE INDEX IF NOT EXISTS idx_smr_team_sections_app
            ON smr_team_sections(app_id, team_id, status);
        """
    )

    # Seed only historical reports that already reached the ready state. They
    # were completed under the legacy rules, so keep them confirmed rather
    # than making old accounting periods depend on today's brigade roster.
    async with conn.execute(
        """
        SELECT id, team_id, selected_members
        FROM applications
        WHERE smr_status='approved'
           OR (COALESCE(TRIM(smr_status),'')='' AND kp_status='approved')
        """
    ) as cursor:
        applications = [dict(row) for row in await cursor.fetchall()]

    for app in applications:
        selected = set(_ids(app.get("selected_members")))
        for team_id in _ids(app.get("team_id")):
            async with conn.execute(
                "SELECT id,fio,position FROM team_members WHERE team_id=? ORDER BY is_foreman DESC,fio",
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
            async with conn.execute(
                "SELECT 1 FROM application_hours WHERE app_id=? AND team_id=? "
                "AND COALESCE(is_additional,0)=0 LIMIT 1",
                (int(app["id"]), team_id),
            ) as cursor:
                has_hours = await cursor.fetchone() is not None
            status = "confirmed" if has_hours else "draft"
            await conn.execute(
                """
                INSERT OR IGNORE INTO smr_team_sections
                    (app_id,team_id,status,roster_json,updated_by_role,submitted_at)
                VALUES (?,?,?,?,?,CASE WHEN ?='confirmed' THEN datetime('now','localtime') END)
                """,
                (
                    int(app["id"]),
                    team_id,
                    status,
                    json.dumps(roster, ensure_ascii=False),
                    "legacy",
                    status,
                ),
            )
