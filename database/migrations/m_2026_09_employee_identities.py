"""Canonical employee registry across current and deleted brigade cards."""

from __future__ import annotations

import json
import re


def _clean_fio(value: object, member_id: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return text or f"Сотрудник #{member_id}"


def _normal(value: str) -> str:
    return re.sub(r"[^а-яёa-z0-9]+", " ", value.casefold()).strip()


async def _table_exists(conn, name: str) -> bool:
    async with conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ) as cursor:
        return await cursor.fetchone() is not None


async def _create_identity(
    conn,
    fio: str,
    *,
    position: str = "",
    linked_user_id: int | None = None,
    status: str = "active",
) -> int:
    cursor = await conn.execute(
        """
        INSERT INTO employee_identities(
            canonical_fio, normalized_fio, position, linked_user_id, status
        ) VALUES(?,?,?,?,?)
        """,
        (fio, _normal(fio), position or "", linked_user_id, status),
    )
    return int(cursor.lastrowid)


async def run(conn) -> None:
    await conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS employee_identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canonical_fio TEXT NOT NULL,
            normalized_fio TEXT NOT NULL DEFAULT '',
            position TEXT NOT NULL DEFAULT '',
            linked_user_id INTEGER,
            status TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','unresolved','merged','archived')),
            merged_into_identity_id INTEGER,
            notes TEXT NOT NULL DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (linked_user_id) REFERENCES users(user_id),
            FOREIGN KEY (merged_into_identity_id) REFERENCES employee_identities(id)
        );
        CREATE INDEX IF NOT EXISTS idx_employee_identities_name
            ON employee_identities(normalized_fio, status);
        CREATE INDEX IF NOT EXISTS idx_employee_identities_link
            ON employee_identities(linked_user_id, status);

        CREATE TABLE IF NOT EXISTS employee_identity_members (
            member_id INTEGER PRIMARY KEY,
            identity_id INTEGER NOT NULL,
            source_fio TEXT NOT NULL DEFAULT '',
            source_position TEXT NOT NULL DEFAULT '',
            source_team_id INTEGER,
            source TEXT NOT NULL DEFAULT 'current',
            mapped_by INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (identity_id) REFERENCES employee_identities(id)
        );
        CREATE INDEX IF NOT EXISTS idx_employee_identity_members_identity
            ON employee_identity_members(identity_id, member_id);
        """
    )

    if not await _table_exists(conn, "team_members"):
        return

    async with conn.execute("PRAGMA table_info(team_members)") as cursor:
        team_columns = {row[1] for row in await cursor.fetchall()}
    link_expr = "tg_user_id" if "tg_user_id" in team_columns else "NULL"
    async with conn.execute(
        f"SELECT id,team_id,fio,position,{link_expr} AS linked_user_id "
        "FROM team_members ORDER BY id"
    ) as cursor:
        current_members = [dict(row) for row in await cursor.fetchall()]

    linked_identities: dict[int, int] = {}
    for member in current_members:
        member_id = int(member["id"])
        async with conn.execute(
            "SELECT identity_id FROM employee_identity_members WHERE member_id=?",
            (member_id,),
        ) as cursor:
            if await cursor.fetchone():
                continue
        fio = _clean_fio(member.get("fio"), member_id)
        linked = member.get("linked_user_id")
        linked = int(linked) if linked is not None else None
        identity_id = linked_identities.get(linked) if linked is not None else None
        if identity_id is None and linked is not None:
            async with conn.execute(
                "SELECT id FROM employee_identities "
                "WHERE linked_user_id=? AND status!='merged' ORDER BY id LIMIT 1",
                (linked,),
            ) as cursor:
                row = await cursor.fetchone()
            if row:
                identity_id = int(row[0])
        if identity_id is None:
            identity_id = await _create_identity(
                conn,
                fio,
                position=str(member.get("position") or ""),
                linked_user_id=linked,
            )
        else:
            async with conn.execute(
                "SELECT canonical_fio,position FROM employee_identities WHERE id=?",
                (identity_id,),
            ) as cursor:
                existing = await cursor.fetchone()
            if existing and len(fio) > len(str(existing[0] or "")):
                await conn.execute(
                    "UPDATE employee_identities SET canonical_fio=?,normalized_fio=?,"
                    "position=CASE WHEN position='' THEN ? ELSE position END,"
                    "updated_at=datetime('now','localtime') WHERE id=?",
                    (fio, _normal(fio), str(member.get("position") or ""), identity_id),
                )
        if linked is not None:
            linked_identities[linked] = identity_id
        await conn.execute(
            """
            INSERT OR IGNORE INTO employee_identity_members(
                member_id,identity_id,source_fio,source_position,source_team_id,source
            ) VALUES(?,?,?,?,?,'current')
            """,
            (
                member_id,
                identity_id,
                fio,
                str(member.get("position") or ""),
                member.get("team_id"),
            ),
        )

    # Historical roster snapshots retain names after a resource card is deleted.
    if await _table_exists(conn, "smr_team_sections"):
        async with conn.execute(
            "SELECT team_id,roster_json FROM smr_team_sections ORDER BY id"
        ) as cursor:
            sections = await cursor.fetchall()
        for section in sections:
            try:
                roster = json.loads(section[1] or "[]")
            except (TypeError, ValueError):
                continue
            if not isinstance(roster, list):
                continue
            for item in roster:
                try:
                    member_id = int(item.get("member_id") or 0)
                except (TypeError, ValueError, AttributeError):
                    continue
                if member_id <= 0:
                    continue
                async with conn.execute(
                    "SELECT 1 FROM employee_identity_members WHERE member_id=?",
                    (member_id,),
                ) as cursor:
                    if await cursor.fetchone():
                        continue
                fio = _clean_fio(item.get("fio"), member_id)
                position = str(item.get("position") or "")
                identity_id = await _create_identity(
                    conn,
                    fio,
                    position=position,
                    status="unresolved" if fio.startswith("Сотрудник #") else "active",
                )
                await conn.execute(
                    """
                    INSERT INTO employee_identity_members(
                        member_id,identity_id,source_fio,source_position,source_team_id,source
                    ) VALUES(?,?,?,?,?,'smr_snapshot')
                    """,
                    (member_id, identity_id, fio, position, section[0]),
                )

    # Every hours row must remain reportable even when neither a live card nor
    # a historical roster exists. The admin audit resolves these placeholders.
    if await _table_exists(conn, "application_hours"):
        async with conn.execute(
            """
            SELECT DISTINCT ah.user_id,ah.team_id
            FROM application_hours ah
            LEFT JOIN employee_identity_members eim ON eim.member_id=ah.user_id
            WHERE eim.member_id IS NULL
            ORDER BY ah.user_id
            """
        ) as cursor:
            orphans = await cursor.fetchall()
        for member_id, team_id in orphans:
            member_id = int(member_id)
            fio = f"Сотрудник #{member_id}"
            identity_id = await _create_identity(conn, fio, status="unresolved")
            await conn.execute(
                """
                INSERT INTO employee_identity_members(
                    member_id,identity_id,source_fio,source_team_id,source
                ) VALUES(?,?,?,?,'orphan_hours')
                """,
                (member_id, identity_id, fio, team_id),
            )
