"""
Migration: 2026_05_drivers_refactor
====================================

Decouples drivers from equipment.

PRIOR MODEL (investigated 2026-05-18)
-------------------------------------
- `equipment.driver_fio TEXT DEFAULT 'Не указан'` — free-form FIO string.
- `equipment.tg_id INTEGER` — set when a person redeems the equipment's
  invite code (POST /api/equipment/invite/join). Becomes the implicit
  equipment owner / sole driver.
- `equipment.invite_code TEXT` — per-equipment redemption code.
- `users.role = 'driver'` — created/upgraded inside the join endpoint.
- 1:1 binding: one equipment unit → one driver user via tg_id.

NEW MODEL
---------
- Drivers are users (role='driver') with their OWN invite_code on
  the users table.
- Driver ↔ equipment-category is many-to-many via `driver_categories`.
- Each driver may have ONE optional `default_equipment_id` (highlighted
  in the assignment picker as "по умолчанию").
- Per-equipment "who-used-this-driver-last" popularity tracker via
  `equipment_driver_usage`.
- Application↔driver assignments live in `application_drivers`
  (added in commit 3 — schema here is forward-compatible).

SAFETY
------
- Wrapped in a transaction. ROLLBACK on any error; raise so startup aborts.
- Idempotent. The `_migrations` marker prevents re-runs.
- For unlinked drivers (no tg_id or max_id yet) we mint a synthetic
  negative `user_id` so the existing positive-ID space (real platform IDs)
  is untouched. When the driver later redeems their invite, the auth flow
  rewrites the user_id to the real platform id (handled in commit 2).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

MIGRATION_NAME = "2026_05_drivers_refactor"


async def _is_applied(conn) -> bool:
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )"""
    )
    async with conn.execute(
        "SELECT 1 FROM _migrations WHERE name = ?", (MIGRATION_NAME,)
    ) as cur:
        return (await cur.fetchone()) is not None


async def _column_exists(conn, table: str, column: str) -> bool:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        rows = await cur.fetchall()
    return any(r[1] == column for r in rows)


async def _next_synthetic_user_id(conn) -> int:
    async with conn.execute("SELECT MIN(user_id) FROM users") as cur:
        row = await cur.fetchone()
    current_min = row[0] if row and row[0] is not None else 0
    return min(current_min, 0) - 1


def _parse_fio(fio: str) -> tuple[str, str, str]:
    parts = (fio or "").strip().split()
    return (
        parts[0] if len(parts) > 0 else "",
        parts[1] if len(parts) > 1 else "",
        parts[2] if len(parts) > 2 else "",
    )


def _format_fio(last: str, first: str, middle: str) -> str:
    return " ".join(p for p in (last.strip(), first.strip(), middle.strip()) if p)


async def run(conn) -> None:
    """Entry point — call from init_db AFTER all legacy upgrade methods."""
    if await _is_applied(conn):
        logger.debug("Migration %s already applied, skipping", MIGRATION_NAME)
        return

    logger.info("Running migration: %s", MIGRATION_NAME)

    try:
        await _schema(conn)
        created, attached = await _backfill_drivers(conn)
        await _clear_equipment_fio(conn)
        await conn.execute(
            "INSERT OR IGNORE INTO _migrations (name, applied_at) VALUES (?, datetime('now'))",
            (MIGRATION_NAME,),
        )
        await conn.commit()
        logger.info(
            "Migrated drivers: %d existing users attached, %d new driver users created",
            attached, created,
        )
        logger.info("Marked migration complete: %s", MIGRATION_NAME)
    except Exception as e:
        await conn.rollback()
        logger.error("Migration %s FAILED — rolled back: %s", MIGRATION_NAME, e)
        raise


async def _schema(conn) -> None:
    """Schema additions. Safe to re-run via IF NOT EXISTS / column check."""
    if not await _column_exists(conn, "users", "default_equipment_id"):
        await conn.execute(
            "ALTER TABLE users ADD COLUMN default_equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL"
        )
        logger.info("  + users.default_equipment_id column added")

    if not await _column_exists(conn, "users", "invite_code"):
        await conn.execute("ALTER TABLE users ADD COLUMN invite_code TEXT")
        logger.info("  + users.invite_code column added")

    await conn.execute(
        """CREATE TABLE IF NOT EXISTS driver_categories (
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            PRIMARY KEY (user_id, category),
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (category) REFERENCES equipment_category_settings(category) ON DELETE CASCADE
        )"""
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_driver_cat_cat ON driver_categories(category)"
    )
    logger.info("  + driver_categories table ready")

    await conn.execute(
        """CREATE TABLE IF NOT EXISTS equipment_driver_usage (
            equipment_id INTEGER NOT NULL,
            driver_user_id INTEGER NOT NULL,
            last_used_at TEXT NOT NULL,
            usage_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (equipment_id, driver_user_id),
            FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
            FOREIGN KEY (driver_user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )"""
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_edu_equipment ON equipment_driver_usage(equipment_id, last_used_at DESC, usage_count DESC)"
    )
    logger.info("  + equipment_driver_usage table ready")

    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code) WHERE invite_code IS NOT NULL"
    )

    # equipment_category_settings is auto-populated elsewhere by category name;
    # ensure any category referenced by equipment exists in the settings table
    # so the driver_categories FK can resolve during backfill.
    await conn.execute(
        """INSERT OR IGNORE INTO equipment_category_settings (category, icon)
           SELECT DISTINCT category, NULL FROM equipment
           WHERE category IS NOT NULL AND TRIM(category) != ''"""
    )


async def _find_matching_driver(
    conn, last: str, first: str, middle: str
) -> Optional[int]:
    """Find an existing user with role='driver' matching the parsed FIO.
    Case-insensitive last+first; middle as tiebreaker if provided."""
    if not last or not first:
        return None

    params = [last.lower().strip(), first.lower().strip()]
    sql = """SELECT user_id, middle_name FROM users
             WHERE role = 'driver'
               AND LOWER(TRIM(last_name)) = ?
               AND LOWER(TRIM(first_name)) = ?"""

    async with conn.execute(sql, params) as cur:
        rows = await cur.fetchall()

    if not rows:
        return None
    if len(rows) == 1:
        return rows[0][0]

    if middle:
        m_low = middle.lower().strip()
        for uid, mn in rows:
            if (mn or "").lower().strip() == m_low:
                return uid
    return rows[0][0]


async def _backfill_drivers(conn) -> tuple[int, int]:
    """Walk equipment and propagate driver bindings into the new model.
    Returns (created_count, attached_count)."""
    from web.utils import generate_invite_code

    async with conn.execute(
        """SELECT id, name, category, driver_fio, tg_id
           FROM equipment
           ORDER BY id"""
    ) as cur:
        equipment_rows = await cur.fetchall()

    created = 0
    attached = 0
    now = datetime.utcnow().isoformat(timespec="seconds")

    for eq_id, eq_name, eq_category, driver_fio, eq_tg_id in equipment_rows:
        eq_category = (eq_category or "").strip()
        driver_user_id: Optional[int] = None

        # Path A: equipment was already redeemed by a real platform user.
        if eq_tg_id:
            async with conn.execute(
                "SELECT user_id, role FROM users WHERE user_id = ?", (eq_tg_id,)
            ) as c2:
                u_row = await c2.fetchone()
            if u_row:
                driver_user_id = u_row[0]
                role = (u_row[1] or "").lower()
                if role not in ("driver", "foreman", "moderator", "boss", "superadmin"):
                    await conn.execute(
                        "UPDATE users SET role = 'driver' WHERE user_id = ?",
                        (driver_user_id,),
                    )
                attached += 1

        # Path B: only a textual FIO is set.
        if driver_user_id is None:
            fio_str = (driver_fio or "").strip()
            if fio_str and fio_str.lower() not in ("не указан", "—", "-", "none", "null"):
                last, first, middle = _parse_fio(fio_str)
                matched = await _find_matching_driver(conn, last, first, middle)
                if matched is not None:
                    driver_user_id = matched
                    attached += 1
                    logger.info(
                        "  ~ attached existing driver user=%d to equipment #%d (%s)",
                        driver_user_id, eq_id, eq_name,
                    )
                else:
                    driver_user_id = await _next_synthetic_user_id(conn)
                    full_fio = _format_fio(last, first, middle)
                    invite = generate_invite_code(12)
                    await conn.execute(
                        """INSERT INTO users
                           (user_id, fio, last_name, first_name, middle_name,
                            role, is_active, invite_code, created_at)
                           VALUES (?, ?, ?, ?, ?, 'driver', 0, ?, datetime('now'))""",
                        (driver_user_id, full_fio, last, first, middle, invite),
                    )
                    created += 1
                    logger.info(
                        "  + created driver user_id=%d (%s) for equipment #%d (%s)",
                        driver_user_id, full_fio, eq_id, eq_name,
                    )

        if driver_user_id is None:
            continue  # equipment had no FIO and no linked user — nothing to migrate

        # Set default_equipment_id only if not already set
        async with conn.execute(
            "SELECT default_equipment_id, invite_code FROM users WHERE user_id = ?",
            (driver_user_id,),
        ) as c3:
            ud = await c3.fetchone()
        if ud is not None:
            if ud[0] is None:
                await conn.execute(
                    "UPDATE users SET default_equipment_id = ? WHERE user_id = ?",
                    (eq_id, driver_user_id),
                )
            if not ud[1]:
                await conn.execute(
                    "UPDATE users SET invite_code = ? WHERE user_id = ?",
                    (generate_invite_code(12), driver_user_id),
                )

        # Bind category. equipment_category_settings was pre-seeded in _schema.
        if eq_category:
            await conn.execute(
                "INSERT OR IGNORE INTO driver_categories (user_id, category) VALUES (?, ?)",
                (driver_user_id, eq_category),
            )

    return created, attached


async def _clear_equipment_fio(conn) -> None:
    """Untie equipment from drivers — wipe driver_fio textual field.
    Leaves equipment.tg_id and equipment.invite_code in place for now;
    those are handled by commit 2 (auth flow refactor)."""
    await conn.execute(
        "UPDATE equipment SET driver_fio = 'Не указан' "
        "WHERE driver_fio IS NOT NULL AND driver_fio != 'Не указан'"
    )
    logger.info("  · cleared equipment.driver_fio for all rows")
