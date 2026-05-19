"""Migration runner.

Each migration module exposes ``async def run(conn)``. The runner is
idempotent: it skips migrations already recorded in ``_migrations``.

Architectural contract:
    schema.sql is authoritative for FRESH installs. Migrations exist only
    to upgrade EXISTING production databases to match schema.sql. On a
    fresh DB every migration's ALTER/CREATE branches detect the target
    state is already present and short-circuit to a no-op.

Never reference a column added by a migration anywhere in schema.sql's
INDEX / VIEW / TRIGGER definitions — ``CREATE TABLE IF NOT EXISTS`` is a
no-op on existing tables, so the column won't be added by executescript
and the index would fail with ``no such column``.
"""

from __future__ import annotations

import importlib
import logging

logger = logging.getLogger(__name__)

# Order matters: later migrations may depend on schema introduced by earlier ones.
MIGRATIONS_ORDER = [
    "m_2026_05_drivers_refactor",
    # FIO backfill MUST run AFTER drivers_refactor (which is what produced
    # the synthetic 'Пользователь {id}' rows in the first place) and
    # BEFORE any structural change that severs equipment.driver_fio.
    "m_2026_05_fio_backfill",
]


async def run_all(conn) -> None:
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS _migrations ("
        " name TEXT PRIMARY KEY,"
        " applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
        ")"
    )
    await conn.commit()

    for name in MIGRATIONS_ORDER:
        async with conn.execute(
            "SELECT 1 FROM _migrations WHERE name = ?", (name,)
        ) as cur:
            already = await cur.fetchone()
        if already:
            logger.debug("migration %s already applied, skipping", name)
            continue

        logger.info("applying migration: %s", name)
        module = importlib.import_module(f"database.migrations.{name}")
        try:
            await module.run(conn)
            await conn.execute(
                "INSERT INTO _migrations (name) VALUES (?)", (name,)
            )
            await conn.commit()
            logger.info("migration applied: %s", name)
        except Exception:
            await conn.rollback()
            logger.exception("migration %s FAILED — rolled back", name)
            raise
