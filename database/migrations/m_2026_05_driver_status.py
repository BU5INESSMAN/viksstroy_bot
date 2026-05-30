"""v2.8 — driver status mechanism.

Drivers are ``users`` rows with ``role='driver'`` and have no
``team_members`` row, so the brigade-member status (which lives on
``team_members.status``) never reaches them. This migration mirrors that
status shape onto ``users`` so drivers get the same Акт/Бол/Отп mechanism:

    users.member_status TEXT DEFAULT 'available'
    users.status_from   TEXT
    users.status_until  TEXT

Idempotent: re-running detects each column already exists (PRAGMA guard)
and only backfills driver rows still NULL/'' on member_status.

Architectural contract (see database/migrations/__init__.py): schema.sql is
authoritative for FRESH installs and already declares these columns; this
migration only upgrades EXISTING production databases.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def _columns(conn, table: str) -> set:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        return {row[1] for row in await cur.fetchall()}


async def run(conn) -> None:
    cols = await _columns(conn, "users")

    if "member_status" not in cols:
        logger.info("adding users.member_status")
        await conn.execute(
            "ALTER TABLE users ADD COLUMN member_status TEXT DEFAULT 'available'"
        )
    if "status_from" not in cols:
        logger.info("adding users.status_from")
        await conn.execute("ALTER TABLE users ADD COLUMN status_from TEXT")
    if "status_until" not in cols:
        logger.info("adding users.status_until")
        await conn.execute("ALTER TABLE users ADD COLUMN status_until TEXT")

    # Backfill: ADD COLUMN with a DEFAULT leaves EXISTING rows NULL in SQLite,
    # so set existing drivers explicitly to 'available' (idempotent — only
    # touches rows that are still NULL/'').
    await conn.execute(
        "UPDATE users SET member_status = 'available' "
        "WHERE role = 'driver' AND (member_status IS NULL OR member_status = '')"
    )
    logger.info("driver_status migration complete")
