"""Separate deleted users from bans and add ban audit metadata."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def _columns(conn, table: str) -> set[str]:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        return {row[1] for row in await cur.fetchall()}


async def run(conn) -> None:
    columns = await _columns(conn, "users")
    additions = {
        "is_deleted": "INTEGER DEFAULT 0",
        "ban_reason": "TEXT DEFAULT ''",
        "banned_at": "TEXT",
        "banned_by": "INTEGER",
        "banned_by_fio": "TEXT DEFAULT ''",
    }
    for name, definition in additions.items():
        if name not in columns:
            await conn.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")

    # The old driver deletion path reused is_blacklisted. Convert only rows
    # backed by an explicit deletion audit entry, never a genuine manual ban.
    converted = await conn.execute(
        "UPDATE users SET is_deleted=1, is_blacklisted=0, ban_reason='', "
        "banned_at=NULL, banned_by=NULL, banned_by_fio='' "
        "WHERE role='driver' AND COALESCE(is_active,0)=0 "
        "AND COALESCE(is_blacklisted,0)=1 "
        "AND EXISTS ("
        " SELECT 1 FROM logs l WHERE l.target_type='driver' "
        " AND (l.target_id=users.user_id OR l.action='Удалил водителя: ' || users.fio)"
        ")"
    )
    logger.info("converted %s deleted drivers from false bans", converted.rowcount or 0)

    await conn.execute(
        "INSERT OR IGNORE INTO settings(key, value) VALUES('role_password_employee', '')"
    )
