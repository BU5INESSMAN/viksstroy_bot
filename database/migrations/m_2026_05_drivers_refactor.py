"""Driver-equipment decoupling migration (2026-05-18).

Upgrades existing production DBs to the new model:
  * users.invite_code            — personal invite codes for drivers/foremen
  * users.default_equipment_id   — drivers' default equipment unit
  * driver_categories            — driver ↔ category (m-to-m)
  * equipment_driver_usage       — popularity tracker per (eq, driver)
  * application_drivers          — per-app driver assignment per eq
  * Plus a one-shot FIO backfill: for every equipment.driver_fio that is
    not "Не указан", find or create a `users` row with role='driver'
    and link to category + default equipment.

Fresh installs (schema.sql already provides everything) execute this
migration as a no-op: column / table existence checks short-circuit each
step, and the FIO scan finds nothing because new DBs have no equipment
rows yet.

ALL ALTER TABLE statements are gated by PRAGMA table_info() checks since
SQLite does not support ``ALTER TABLE ... ADD COLUMN IF NOT EXISTS``.
"""

from __future__ import annotations

import logging
import secrets
import string

logger = logging.getLogger(__name__)

# Crockford base32 minus 0/O/1/I/L for invite codes.
_ALPHABET = string.digits + "ABCDEFGHJKMNPQRSTVWXYZ"


def _gen_invite_code(length: int = 12) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


async def _column_exists(conn, table: str, column: str) -> bool:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        rows = await cur.fetchall()
    return any(row[1] == column for row in rows)


async def _unique_invite_code(conn) -> str:
    # 20 attempts is more than enough — alphabet^12 ≈ 5.3e17 combinations.
    for _ in range(20):
        code = _gen_invite_code(12)
        async with conn.execute(
            "SELECT 1 FROM users WHERE invite_code = ?", (code,)
        ) as cur:
            if not await cur.fetchone():
                return code
    raise RuntimeError("could not generate unique invite_code after 20 tries")


async def _next_synthetic_user_id(conn) -> int:
    """Return a fresh negative user_id for an unredeemed driver.
    Real platform IDs (TG / pseudo-MAX) are always positive, so the
    negative space is reserved for synthetic placeholders."""
    async with conn.execute("SELECT MIN(user_id) FROM users") as cur:
        row = await cur.fetchone()
    current_min = row[0] if row and row[0] is not None else 0
    return min(current_min, 0) - 1


async def run(conn) -> None:
    # 1. ALTERs for users — idempotent.
    if not await _column_exists(conn, "users", "invite_code"):
        await conn.execute("ALTER TABLE users ADD COLUMN invite_code TEXT")
        logger.info("  + users.invite_code column added")
    if not await _column_exists(conn, "users", "default_equipment_id"):
        await conn.execute(
            "ALTER TABLE users ADD COLUMN default_equipment_id INTEGER"
        )
        logger.info("  + users.default_equipment_id column added")

    # The unique index lives here (not in schema.sql) because on existing
    # production DBs the CREATE TABLE IF NOT EXISTS users is a no-op, so
    # CREATE INDEX in schema.sql would fail with "no such column".
    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code "
        "ON users(invite_code) WHERE invite_code IS NOT NULL"
    )

    # 2. Junction tables — idempotent. (schema.sql also creates them, but
    #    repeating here keeps the migration self-sufficient on older DBs
    #    where the schema.sql at the time of init didn't include them.)
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS driver_categories (
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            PRIMARY KEY (user_id, category)
        )"""
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_driver_categories_category "
        "ON driver_categories(category)"
    )
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS equipment_driver_usage (
            equipment_id INTEGER NOT NULL,
            driver_user_id INTEGER NOT NULL,
            last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
            usage_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (equipment_id, driver_user_id)
        )"""
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_edu_eq_lastused "
        "ON equipment_driver_usage(equipment_id, last_used_at DESC)"
    )
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS application_drivers (
            application_id INTEGER NOT NULL,
            equipment_id INTEGER NOT NULL,
            driver_user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (application_id, equipment_id)
        )"""
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_app_drivers_driver "
        "ON application_drivers(driver_user_id)"
    )

    # Pre-seed equipment_category_settings so driver_categories' FK to it
    # resolves for every distinct category currently used by equipment.
    await conn.execute(
        "INSERT OR IGNORE INTO equipment_category_settings (category, icon) "
        "SELECT DISTINCT category, NULL FROM equipment "
        "WHERE category IS NOT NULL AND TRIM(category) != ''"
    )

    # 3. FIO backfill — port equipment.driver_fio into the users table.
    # SQLite LOWER() is ASCII-only, so we filter "Не указан" variants in
    # Python instead of SQL.
    _PLACEHOLDER_FIOS = {"", "не указан", "—", "-", "none", "null"}
    async with conn.execute(
        "SELECT id, driver_fio, category, tg_id FROM equipment "
        "WHERE driver_fio IS NOT NULL AND TRIM(driver_fio) != ''"
    ) as cur:
        raw_rows = await cur.fetchall()
    rows = [
        r for r in raw_rows
        if (r[1] or "").strip().lower() not in _PLACEHOLDER_FIOS
    ]

    processed = 0
    created = 0
    attached_existing = 0

    for eq_id, driver_fio, category, eq_tg_id in rows:
        fio_str = (driver_fio or "").strip()
        if not fio_str:
            continue

        user_id = None

        # Path A: equipment was redeemed by a real platform user (legacy
        # equipment.tg_id is the user_id). Prefer that direct linkage.
        if eq_tg_id:
            async with conn.execute(
                "SELECT user_id, role FROM users WHERE user_id = ?",
                (eq_tg_id,),
            ) as c2:
                u = await c2.fetchone()
            if u:
                user_id = u[0]
                role = (u[1] or "").lower()
                if role not in (
                    "driver", "foreman", "moderator", "boss", "superadmin"
                ):
                    await conn.execute(
                        "UPDATE users SET role = 'driver' WHERE user_id = ?",
                        (user_id,),
                    )
                attached_existing += 1

        # Path B: textual match against existing users by FIO.
        if user_id is None:
            async with conn.execute(
                """SELECT user_id FROM users
                   WHERE role = 'driver'
                     AND TRIM(LOWER(
                         COALESCE(last_name,'')   || ' ' ||
                         COALESCE(first_name,'')  || ' ' ||
                         COALESCE(middle_name,'')
                     )) = TRIM(LOWER(?))
                   LIMIT 1""",
                (fio_str,),
            ) as c3:
                m = await c3.fetchone()
            if m:
                user_id = m[0]
                attached_existing += 1

        # Path C: create a synthetic-id user for an unredeemed driver.
        if user_id is None:
            parts = fio_str.split()
            last = parts[0] if len(parts) > 0 else ""
            first = parts[1] if len(parts) > 1 else ""
            middle = " ".join(parts[2:]) if len(parts) > 2 else ""
            invite = await _unique_invite_code(conn)
            new_id = await _next_synthetic_user_id(conn)
            await conn.execute(
                """INSERT INTO users
                       (user_id, fio, last_name, first_name, middle_name,
                        role, is_active, invite_code, created_at)
                       VALUES (?, ?, ?, ?, ?, 'driver', 0, ?, datetime('now'))""",
                (new_id, fio_str, last, first, middle, invite),
            )
            user_id = new_id
            created += 1

        # Ensure the user has an invite_code regardless of path.
        async with conn.execute(
            "SELECT invite_code FROM users WHERE user_id = ?", (user_id,)
        ) as c4:
            r = await c4.fetchone()
        if r and not r[0]:
            await conn.execute(
                "UPDATE users SET invite_code = ? WHERE user_id = ?",
                (await _unique_invite_code(conn), user_id),
            )

        # Category linkage.
        if category and str(category).strip():
            await conn.execute(
                "INSERT OR IGNORE INTO driver_categories (user_id, category) "
                "VALUES (?, ?)",
                (user_id, category),
            )

        # Set default equipment if currently NULL.
        await conn.execute(
            "UPDATE users SET default_equipment_id = ? "
            "WHERE user_id = ? AND default_equipment_id IS NULL",
            (eq_id, user_id),
        )
        processed += 1

    logger.info(
        "FIO backfill: %d equipment rows processed, %d new driver users created, "
        "%d existing users attached",
        processed, created, attached_existing,
    )
