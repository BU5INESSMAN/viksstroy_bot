"""Invert default-driver ownership: ``users.default_equipment_id`` →
``equipment.default_driver_user_id``.

Rationale
---------
Until v2.6 the *driver* "owned" the relation: each driver picked a
default equipment unit on their profile card. v2.6 inverts that so the
*office* (moderator+) assigns a default driver per equipment unit. The
business reason is simpler accountability — when equipment A breaks
down, the office can see who its default driver is without having to
scan every driver's profile.

What this migration does
------------------------
1. Adds ``equipment.default_driver_user_id INTEGER REFERENCES users(user_id)``
   if missing (PRAGMA-guarded for idempotency).
2. For every user with ``users.default_equipment_id IS NOT NULL`` and
   ``role='driver'``, writes that pairing onto the equipment row's new
   ``default_driver_user_id`` column.
3. Collision policy: **earliest by ``users.rowid``** wins. SQLite's
   ``rowid`` mirrors insertion order, which is the closest cheap proxy
   for "registered first." Iterating users in ASC rowid order and
   skipping any equipment that already has a default assigned gives a
   deterministic, repeatable outcome with no second-write surprises.
   Every collision is logged at INFO with the equipment id, the winning
   driver, and the skipped driver so the operator can audit them.

Idempotency
-----------
- The ADD COLUMN is guarded by PRAGMA table_info.
- The UPDATE loop only fires for equipment rows whose
  ``default_driver_user_id`` is still NULL. On a second run every row
  is already populated (or was never populated because the source
  ``users.default_equipment_id`` was NULL too), so the UPDATE loop is a
  silent zero-write no-op.

NOT dropped
-----------
``users.default_equipment_id`` stays in the schema for one release for
rollback safety. The drop is scheduled for v2.6.1. Code reads of the
column are being migrated to the inverse query in the same commit (see
``driver_service.py`` / ``schedule_generator.py`` changes).
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def _column_exists(conn, table: str, column: str) -> bool:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        rows = await cur.fetchall()
    return any(row[1] == column for row in rows)


async def run(conn) -> None:
    # 1. Schema change — add the column on the equipment side. DEFAULT NULL
    # is the only SQLite-safe constant default on ALTER TABLE ADD COLUMN
    # against a populated table; the REFERENCES clause is informational
    # (SQLite doesn't enforce FKs unless PRAGMA foreign_keys=ON is set,
    # which app code does not toggle for migrations).
    if not await _column_exists(conn, "equipment", "default_driver_user_id"):
        await conn.execute(
            "ALTER TABLE equipment ADD COLUMN default_driver_user_id "
            "INTEGER REFERENCES users(user_id) DEFAULT NULL"
        )
        logger.info("  + equipment.default_driver_user_id column added")

    # 2. Backfill the inverse relation. Earliest-by-rowid wins on
    # collisions; we enforce that just by iterating users in ASC rowid
    # order and skipping equipment rows whose default is already set.
    #
    # We restrict to role='driver' because the old free-form
    # default_equipment_id could in principle have been set on
    # non-driver rows; only drivers should appear as a default.
    async with conn.execute(
        """SELECT u.user_id, u.default_equipment_id, u.rowid
             FROM users u
            WHERE u.default_equipment_id IS NOT NULL
              AND u.role = 'driver'
            ORDER BY u.rowid ASC"""
    ) as cur:
        rows = await cur.fetchall()

    assigned = 0
    collisions = 0       # equipment already has a DIFFERENT driver assigned
    already_set = 0      # equipment already has THIS driver assigned (idempotent re-run)
    orphaned = 0         # source row points at an equipment id that no longer exists

    for user_id, equip_id, _rowid in rows:
        async with conn.execute(
            "SELECT id, default_driver_user_id FROM equipment WHERE id = ?",
            (equip_id,),
        ) as c:
            eq = await c.fetchone()
        if eq is None:
            orphaned += 1
            logger.info(
                "default_driver migration: user_id=%s points at "
                "equipment_id=%s which no longer exists — skipping",
                user_id, equip_id,
            )
            continue
        existing_driver = eq[1]
        if existing_driver is not None:
            if existing_driver == user_id:
                # Re-run: this equipment already points at this very driver.
                # Not a collision — the migration is just confirming itself.
                already_set += 1
                continue
            collisions += 1
            logger.info(
                "default_driver collision: equipment_id=%s already has "
                "driver user_id=%s (earlier rowid); user_id=%s silently "
                "loses default",
                equip_id, existing_driver, user_id,
            )
            continue
        await conn.execute(
            "UPDATE equipment SET default_driver_user_id = ? WHERE id = ?",
            (user_id, equip_id),
        )
        assigned += 1

    logger.info(
        "default_driver migration complete: assigned=%d, collisions=%d, "
        "already_set=%d (idempotent re-run), orphaned=%d "
        "(out of %d source rows)",
        assigned, collisions, already_set, orphaned, len(rows),
    )
