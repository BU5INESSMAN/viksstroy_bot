"""Employee identity audit and safe normalization helpers."""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any


def normalize_fio(value: object) -> str:
    return re.sub(r"[^а-яёa-z0-9]+", " ", str(value or "").casefold()).strip()


def duplicate_key(value: object) -> str:
    parts = normalize_fio(value).split()
    return " ".join(parts[:2]) if len(parts) >= 2 else (parts[0] if parts else "")


async def _table_exists(db, name: str) -> bool:
    async with db.conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ) as cursor:
        return await cursor.fetchone() is not None


async def identity_map(db, member_ids: set[int]) -> dict[int, dict[str, Any]]:
    """Return canonical identities for current and historical member ids."""
    if not member_ids or not await _table_exists(db, "employee_identity_members"):
        return {}
    marks = ",".join("?" for _ in member_ids)
    async with db.conn.execute(
        f"""
        SELECT eim.member_id,eim.identity_id,eim.source_fio,eim.source_position,
               ei.canonical_fio,ei.position,ei.linked_user_id,ei.status
        FROM employee_identity_members eim
        JOIN employee_identities ei ON ei.id=eim.identity_id
        WHERE eim.member_id IN ({marks})
        """,
        tuple(sorted(member_ids)),
    ) as cursor:
        return {int(row[0]): dict(row) for row in await cursor.fetchall()}


async def employee_audit(db) -> dict[str, Any]:
    if db.conn is None:
        await db.init_db()
    if not await _table_exists(db, "employee_identities"):
        return {
            "metrics": {},
            "duplicates": [],
            "unresolved": [],
            "incomplete_current": [],
            "identities": [],
        }

    async with db.conn.execute(
        """
        SELECT ei.id,ei.canonical_fio,ei.position,ei.linked_user_id,ei.status,
               ei.notes,ei.merged_into_identity_id,
               COUNT(DISTINCT eim.member_id) AS member_count,
               GROUP_CONCAT(DISTINCT eim.member_id) AS member_ids,
               SUM(CASE WHEN tm.id IS NOT NULL THEN 1 ELSE 0 END) AS current_cards,
               COALESCE(SUM((SELECT COUNT(*) FROM application_hours ah
                            WHERE ah.user_id=eim.member_id)),0) AS hour_rows,
               MIN(eim.source) AS source
        FROM employee_identities ei
        LEFT JOIN employee_identity_members eim ON eim.identity_id=ei.id
        LEFT JOIN team_members tm ON tm.id=eim.member_id
        WHERE ei.status!='merged'
        GROUP BY ei.id
        ORDER BY ei.canonical_fio COLLATE NOCASE,ei.id
        """
    ) as cursor:
        identities = [dict(row) for row in await cursor.fetchall()]
    for identity in identities:
        identity["member_ids"] = [
            int(value)
            for value in str(identity.get("member_ids") or "").split(",")
            if value.strip().isdigit()
        ]

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for identity in identities:
        key = duplicate_key(identity.get("canonical_fio"))
        if key and not str(identity.get("canonical_fio") or "").startswith("Сотрудник #"):
            groups[key].append(identity)
    duplicates = [
        {
            "key": key,
            "reason": "Совпадают фамилия и имя",
            "identities": values,
        }
        for key, values in sorted(groups.items())
        if len(values) > 1
    ]

    unresolved = [identity for identity in identities if identity.get("status") == "unresolved"]
    async with db.conn.execute(
        """
        SELECT tm.id,tm.team_id,tm.fio,tm.position,tm.tg_user_id,
               t.name AS team_name
        FROM team_members tm
        LEFT JOIN teams t ON t.id=tm.team_id
        WHERE TRIM(COALESCE(tm.fio,''))=''
           OR (LENGTH(TRIM(tm.fio))-LENGTH(REPLACE(TRIM(tm.fio),' ',''))+1)<3
        ORDER BY tm.fio COLLATE NOCASE,tm.id
        """
    ) as cursor:
        incomplete_current = [dict(row) for row in await cursor.fetchall()]

    async with db.conn.execute("SELECT COUNT(*) FROM team_members") as cursor:
        current_cards = int((await cursor.fetchone())[0] or 0)
    async with db.conn.execute(
        "SELECT COUNT(*) FROM application_hours ah "
        "LEFT JOIN team_members tm ON tm.id=ah.user_id WHERE tm.id IS NULL"
    ) as cursor:
        orphan_hours = int((await cursor.fetchone())[0] or 0)
    async with db.conn.execute(
        "SELECT COUNT(DISTINCT eim.member_id) FROM employee_identity_members eim "
        "LEFT JOIN team_members tm ON tm.id=eim.member_id WHERE tm.id IS NULL"
    ) as cursor:
        historical_cards = int((await cursor.fetchone())[0] or 0)

    return {
        "metrics": {
            "current_cards": current_cards,
            "identities": len(identities),
            "historical_cards": historical_cards,
            "orphan_hour_rows": orphan_hours,
            "unresolved": len(unresolved),
            "duplicate_groups": len(duplicates),
            "incomplete_current": len(incomplete_current),
        },
        "duplicates": duplicates,
        "unresolved": unresolved,
        "incomplete_current": incomplete_current,
        "identities": identities,
    }


async def update_identity(
    db,
    identity_id: int,
    *,
    canonical_fio: str,
    position: str = "",
    notes: str = "",
    actor_id: int | None = None,
) -> None:
    canonical_fio = re.sub(r"\s+", " ", canonical_fio.strip())
    if len(canonical_fio) < 3:
        raise ValueError("Укажите ФИО сотрудника")
    async with db.conn.execute(
        "SELECT id FROM employee_identities WHERE id=? AND status!='merged'",
        (identity_id,),
    ) as cursor:
        if not await cursor.fetchone():
            raise LookupError("Карточка личности не найдена")
    await db.conn.execute(
        """
        UPDATE employee_identities
        SET canonical_fio=?,normalized_fio=?,position=?,notes=?,
            status='active',created_by=COALESCE(created_by,?),
            updated_at=datetime('now','localtime')
        WHERE id=?
        """,
        (canonical_fio, normalize_fio(canonical_fio), position.strip(), notes.strip(), actor_id, identity_id),
    )
    await db.conn.execute(
        """
        UPDATE employee_identity_members
        SET source_fio=CASE WHEN source_fio='' OR source_fio LIKE 'Сотрудник #%'
                            THEN ? ELSE source_fio END,
            source_position=CASE WHEN source_position='' THEN ? ELSE source_position END,
            mapped_by=?,updated_at=datetime('now','localtime')
        WHERE identity_id=?
        """,
        (canonical_fio, position.strip(), actor_id, identity_id),
    )
    await db.conn.commit()


async def merge_identities(
    db,
    *,
    target_identity_id: int,
    source_identity_ids: list[int],
    actor_id: int,
) -> dict[str, Any]:
    sources = sorted({int(value) for value in source_identity_ids if int(value) > 0})
    sources = [value for value in sources if value != target_identity_id]
    if not sources:
        raise ValueError("Не выбраны дубли для объединения")
    all_ids = [target_identity_id, *sources]
    marks = ",".join("?" for _ in all_ids)
    async with db.conn.execute(
        f"SELECT id,canonical_fio,linked_user_id,status FROM employee_identities "
        f"WHERE id IN ({marks})",
        tuple(all_ids),
    ) as cursor:
        rows = [dict(row) for row in await cursor.fetchall()]
    if len(rows) != len(all_ids) or any(row.get("status") == "merged" for row in rows):
        raise LookupError("Одна из карточек не найдена или уже объединена")
    linked = {int(row["linked_user_id"]) for row in rows if row.get("linked_user_id") is not None}
    if len(linked) > 1:
        raise ValueError("Нельзя объединить сотрудников с разными привязанными аккаунтами MAX")

    await db.conn.execute("SAVEPOINT employee_identity_merge")
    try:
        source_marks = ",".join("?" for _ in sources)
        await db.conn.execute(
            f"UPDATE employee_identity_members SET identity_id=?,mapped_by=?,"
            f"updated_at=datetime('now','localtime') WHERE identity_id IN ({source_marks})",
            (target_identity_id, actor_id, *sources),
        )
        await db.conn.execute(
            f"UPDATE employee_identities SET status='merged',merged_into_identity_id=?,"
            f"updated_at=datetime('now','localtime') WHERE id IN ({source_marks})",
            (target_identity_id, *sources),
        )
        await db.conn.execute(
            "UPDATE employee_identities SET linked_user_id=COALESCE(linked_user_id,?),"
            "updated_at=datetime('now','localtime') WHERE id=?",
            (next(iter(linked), None), target_identity_id),
        )
        await db.conn.execute("RELEASE SAVEPOINT employee_identity_merge")
        await db.conn.commit()
    except Exception:
        await db.conn.execute("ROLLBACK TO SAVEPOINT employee_identity_merge")
        await db.conn.execute("RELEASE SAVEPOINT employee_identity_merge")
        raise
    return {"target_identity_id": target_identity_id, "merged_identity_ids": sources}
