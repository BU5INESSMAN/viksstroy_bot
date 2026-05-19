"""Driver-specific service layer (v2.6).

Drivers are users with ``role='driver'`` and their own ``users.invite_code``.
Categories ↔ drivers is many-to-many via ``driver_categories``. Each driver
may have one ``default_equipment_id``. Per-application assignments live in
``application_drivers``. Per-pair popularity in ``equipment_driver_usage``.

This module is consumed by ``web/routers/drivers.py`` and by publish /
edit flows that need to record usage or send notifications.
"""

from __future__ import annotations

import logging
import secrets
import string
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

_ALPHABET = string.digits + "ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32
_PLACEHOLDER_FIOS = {"", "не указан", "—", "-", "none", "null"}


def _gen_code(length: int = 12) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def _format_fio(last: str, first: str, middle: str) -> str:
    return " ".join(p for p in (last.strip(), first.strip(), middle.strip()) if p)


async def _unique_invite_code(db) -> str:
    for _ in range(20):
        code = _gen_code(12)
        async with db.conn.execute(
            "SELECT 1 FROM users WHERE invite_code = ?", (code,)
        ) as cur:
            if not await cur.fetchone():
                return code
    raise RuntimeError("could not allocate unique invite_code after 20 tries")


async def _driver_categories(db, user_id: int) -> list[dict]:
    async with db.conn.execute(
        """SELECT dc.category, ecs.icon
           FROM driver_categories dc
           LEFT JOIN equipment_category_settings ecs ON ecs.category = dc.category
           WHERE dc.user_id = ?""",
        (user_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [{"name": r[0], "icon": r[1]} for r in rows]


async def _enrich_driver(db, row: dict) -> dict:
    uid = int(row["user_id"])
    row["tg_id"] = uid if uid > 0 else None
    row["is_synthetic"] = uid < 0
    row["categories"] = await _driver_categories(db, uid)
    # MAX-link lookup via account_links (TG↔MAX pairing).
    async with db.conn.execute(
        "SELECT secondary_id FROM account_links WHERE primary_id = ?", (uid,)
    ) as cur:
        link = await cur.fetchone()
    if link and link[0] is not None and link[0] != uid:
        row["max_id"] = link[0]
    row["linked"] = uid > 0 or row.get("max_id") is not None
    return row


# ───────────────────────── reads ─────────────────────────


async def list_drivers(db, category: Optional[str] = None) -> list[dict]:
    # v2.6: default ownership flipped to equipment.default_driver_user_id.
    # We still expose a `default_equipment_name` field on the driver dict
    # for any FE consumer not yet migrated, but the data source is now
    # the equipment side. A driver can be the default for zero or more
    # equipment units — we pick the first by equipment.id for stable
    # display (Resources DriverCard's "По умолчанию" is being removed in
    # commit 6, so multi-default disambiguation isn't user-visible).
    sql = """
        SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
               u.invite_code, u.default_equipment_id, u.is_active,
               (SELECT e.name FROM equipment e
                 WHERE e.default_driver_user_id = u.user_id
                 ORDER BY e.id LIMIT 1) AS default_equipment_name,
               (SELECT e.category FROM equipment e
                 WHERE e.default_driver_user_id = u.user_id
                 ORDER BY e.id LIMIT 1) AS default_equipment_category
        FROM users u
        WHERE u.role = 'driver' AND u.is_blacklisted = 0
    """
    params: list = []
    if category:
        sql += (
            " AND u.user_id IN (SELECT user_id FROM driver_categories"
            " WHERE category = ?)"
        )
        params.append(category)
    sql += " ORDER BY u.last_name, u.first_name"

    async with db.conn.execute(sql, params) as cur:
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in await cur.fetchall()]
    return [await _enrich_driver(db, r) for r in rows]


async def get_driver(db, user_id: int) -> Optional[dict]:
    # v2.6: default now lives on equipment.default_driver_user_id — see
    # list_drivers above for the same inverted-lookup rationale.
    async with db.conn.execute(
        """SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
                  u.invite_code, u.default_equipment_id, u.is_active,
                  (SELECT e.name FROM equipment e
                    WHERE e.default_driver_user_id = u.user_id
                    ORDER BY e.id LIMIT 1) AS default_equipment_name,
                  (SELECT e.category FROM equipment e
                    WHERE e.default_driver_user_id = u.user_id
                    ORDER BY e.id LIMIT 1) AS default_equipment_category
           FROM users u
           WHERE u.user_id = ? AND u.role = 'driver'""",
        (user_id,),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            return None
        cols = [c[0] for c in cur.description]
        d = dict(zip(cols, row))
    return await _enrich_driver(db, d)


async def list_drivers_for_equipment(db, equipment_id: int) -> dict:
    """Returns drivers split into 'primary' (same-category, server-sorted)
    and 'other_grouped' (other categories), plus equipment metadata.

    Primary sort order, applied by SQL:
      1. default driver first (equipment.default_driver_user_id == user_id)
      2. most-recently-used pair (equipment_driver_usage.last_used_at DESC)
      3. most-frequently-used pair (usage_count DESC)
      4. alphabetical (last_name ASC, first_name ASC)

    v2.6: ``is_default`` switched from
    ``users.default_equipment_id == equipment_id`` to the inverse
    ``equipment.default_driver_user_id == user_id``. Result shape is
    unchanged; only the SQL data source moved.
    """
    async with db.conn.execute(
        "SELECT id, name, category, default_driver_user_id FROM equipment "
        "WHERE id = ?",
        (equipment_id,),
    ) as cur:
        eq_row = await cur.fetchone()
    if not eq_row:
        return {"equipment": None, "primary": [], "other_grouped": []}
    eq_id, eq_name, eq_category, default_driver_id = (
        eq_row[0], eq_row[1], (eq_row[2] or ""), eq_row[3]
    )

    async with db.conn.execute(
        "SELECT icon FROM equipment_category_settings WHERE category = ?",
        (eq_category,),
    ) as cur:
        cat_icon_row = await cur.fetchone()
    cat_icon = cat_icon_row[0] if cat_icon_row else None

    primary_sql = """
        SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
               u.default_equipment_id,
               COALESCE(edu.usage_count, 0) AS usage_count,
               edu.last_used_at,
               (u.user_id = ?) AS is_default
        FROM users u
        JOIN driver_categories dc ON dc.user_id = u.user_id
        LEFT JOIN equipment_driver_usage edu
               ON edu.driver_user_id = u.user_id AND edu.equipment_id = ?
        WHERE u.role = 'driver' AND u.is_blacklisted = 0
          AND dc.category = ?
        ORDER BY (u.user_id = ?) DESC,
                 edu.last_used_at DESC,
                 edu.usage_count DESC,
                 u.last_name, u.first_name
    """
    async with db.conn.execute(
        primary_sql, (default_driver_id, eq_id, eq_category, default_driver_id)
    ) as cur:
        cols = [c[0] for c in cur.description]
        primary = [dict(zip(cols, r)) for r in await cur.fetchall()]
    for d in primary:
        d["is_default"] = bool(d.get("is_default"))

    primary_ids = {d["user_id"] for d in primary}
    if primary_ids:
        excl_pl = ",".join(["?"] * len(primary_ids))
        excl_sql = f" AND u.user_id NOT IN ({excl_pl})"
        excl_params = list(primary_ids)
    else:
        excl_sql = ""
        excl_params = []

    others_sql = f"""
        SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
               dc.category,
               ecs.icon AS category_icon,
               COALESCE(SUM(edu.usage_count), 0) AS usage_count_total,
               MAX(edu.last_used_at) AS last_used_at
        FROM users u
        JOIN driver_categories dc ON dc.user_id = u.user_id
        LEFT JOIN equipment_category_settings ecs ON ecs.category = dc.category
        LEFT JOIN equipment_driver_usage edu ON edu.driver_user_id = u.user_id
        WHERE u.role = 'driver' AND u.is_blacklisted = 0
          AND dc.category != ?
          {excl_sql}
        GROUP BY u.user_id, dc.category
        ORDER BY dc.category, usage_count_total DESC, u.last_name, u.first_name
    """
    async with db.conn.execute(
        others_sql, [eq_category] + excl_params
    ) as cur:
        cols = [c[0] for c in cur.description]
        others = [dict(zip(cols, r)) for r in await cur.fetchall()]

    grouped: dict[str, dict] = {}
    for r in others:
        cat = r["category"]
        grouped.setdefault(cat, {
            "category": cat,
            "category_icon": r.get("category_icon"),
            "drivers": [],
        })
        grouped[cat]["drivers"].append({
            "user_id": r["user_id"],
            "fio": r["fio"],
            "last_name": r["last_name"],
            "first_name": r["first_name"],
            "middle_name": r["middle_name"],
            # v2.6: is_default now comes from equipment.default_driver_user_id
            # (this equipment's default), not users.default_equipment_id.
            "is_default": r["user_id"] == default_driver_id,
            "usage_count": r.get("usage_count_total", 0),
            "last_used_at": r.get("last_used_at"),
        })

    return {
        "equipment": {
            "id": eq_id, "name": eq_name,
            "category": eq_category, "category_icon": cat_icon,
        },
        "primary": primary,
        "other_grouped": list(grouped.values()),
    }


# ───────────────────────── writes ─────────────────────────


async def _next_negative_user_id(db) -> int:
    async with db.conn.execute("SELECT MIN(user_id) FROM users") as cur:
        row = await cur.fetchone()
    cur_min = row[0] if row and row[0] is not None else 0
    return min(cur_min, 0) - 1


async def create_driver(
    db, *,
    last_name: str, first_name: str, middle_name: str = "",
    categories: list[str], default_equipment_id: Optional[int] = None,
) -> dict:
    if not last_name.strip() or not first_name.strip():
        raise ValueError("last_name and first_name are required")
    if not categories:
        raise ValueError("at least one category is required")

    new_id = await _next_negative_user_id(db)
    invite = await _unique_invite_code(db)
    full_fio = _format_fio(last_name, first_name, middle_name or "")
    await db.conn.execute(
        """INSERT INTO users
           (user_id, fio, last_name, first_name, middle_name,
            role, is_active, invite_code, default_equipment_id, created_at)
           VALUES (?, ?, ?, ?, ?, 'driver', 0, ?, ?, datetime('now'))""",
        (new_id, full_fio, last_name.strip(), first_name.strip(),
         (middle_name or "").strip(), invite, default_equipment_id),
    )
    for cat in categories:
        await db.conn.execute(
            "INSERT OR IGNORE INTO driver_categories (user_id, category) "
            "VALUES (?, ?)",
            (new_id, cat),
        )
    await db.conn.commit()
    return await get_driver(db, new_id)


async def create_synthetic_driver(
    db, *, fio: str, category: str,
) -> dict:
    """Foreman-side creation of a placeholder when assigning an unknown
    driver mid-flight. Splits FIO best-effort, generates invite_code so
    the placeholder can later redeem into a real user."""
    parts = fio.strip().split()
    last = parts[0] if len(parts) > 0 else ""
    first = parts[1] if len(parts) > 1 else ""
    middle = " ".join(parts[2:]) if len(parts) > 2 else ""
    return await create_driver(
        db, last_name=last or fio.strip(), first_name=first or " ",
        middle_name=middle, categories=[category],
    )


async def update_driver(
    db, user_id: int, *,
    last_name: Optional[str] = None,
    first_name: Optional[str] = None,
    middle_name: Optional[str] = None,
    categories: Optional[list[str]] = None,
    default_equipment_id=...,  # sentinel — keep as-is when not passed
) -> Optional[dict]:
    async with db.conn.execute(
        "SELECT last_name, first_name, middle_name FROM users WHERE user_id = ?",
        (user_id,),
    ) as cur:
        cur_row = await cur.fetchone()
    if not cur_row:
        return None
    cl, cf, cm = cur_row[0] or "", cur_row[1] or "", cur_row[2] or ""
    nl = last_name if last_name is not None else cl
    nf = first_name if first_name is not None else cf
    nm = middle_name if middle_name is not None else cm
    new_fio = _format_fio(nl, nf, nm)

    sets = ["last_name=?", "first_name=?", "middle_name=?", "fio=?"]
    vals: list = [nl, nf, nm, new_fio]
    if default_equipment_id is not ...:
        sets.append("default_equipment_id=?")
        vals.append(default_equipment_id)
    vals.append(user_id)
    await db.conn.execute(
        f"UPDATE users SET {', '.join(sets)} WHERE user_id=?", vals,
    )

    if categories is not None:
        await db.conn.execute(
            "DELETE FROM driver_categories WHERE user_id=?", (user_id,),
        )
        for cat in categories:
            await db.conn.execute(
                "INSERT OR IGNORE INTO driver_categories (user_id, category) "
                "VALUES (?, ?)",
                (user_id, cat),
            )

    await db.conn.commit()
    return await get_driver(db, user_id)


async def delete_driver(db, user_id: int) -> None:
    """Soft-delete per spec: clear role and links but keep the row so
    historical references (application_drivers) stay resolvable for audits.

    v2.6: also detach this user from any ``equipment.default_driver_user_id``
    that points at them, otherwise the equipment card would still show
    them as default after they've lost the driver role.
    """
    await db.conn.execute(
        "DELETE FROM driver_categories WHERE user_id=?", (user_id,),
    )
    await db.conn.execute(
        "UPDATE users SET role=NULL, default_equipment_id=NULL "
        "WHERE user_id=? AND role='driver'",
        (user_id,),
    )
    await db.conn.execute(
        "UPDATE equipment SET default_driver_user_id=NULL "
        "WHERE default_driver_user_id=?",
        (user_id,),
    )
    await db.conn.commit()


async def regenerate_invite(db, user_id: int) -> Optional[str]:
    async with db.conn.execute(
        "SELECT 1 FROM users WHERE user_id=? AND role='driver'", (user_id,),
    ) as cur:
        if not await cur.fetchone():
            return None
    code = await _unique_invite_code(db)
    await db.conn.execute(
        "UPDATE users SET invite_code=? WHERE user_id=?", (code, user_id),
    )
    await db.conn.commit()
    return code


# ─────────────── application_drivers / popularity ───────────────


async def assign_driver_to_application(
    db, app_id: int, equipment_id: int, driver_user_id: int,
) -> None:
    """UPSERT into application_drivers (one row per (app, equipment))."""
    await db.conn.execute(
        """INSERT INTO application_drivers
           (application_id, equipment_id, driver_user_id)
           VALUES (?, ?, ?)
           ON CONFLICT(application_id, equipment_id) DO UPDATE
           SET driver_user_id = excluded.driver_user_id""",
        (app_id, equipment_id, driver_user_id),
    )
    await db.conn.commit()


async def remove_driver_from_application(
    db, app_id: int, equipment_id: int,
) -> None:
    await db.conn.execute(
        "DELETE FROM application_drivers "
        "WHERE application_id=? AND equipment_id=?",
        (app_id, equipment_id),
    )
    await db.conn.commit()


async def get_application_drivers(db, app_id: int) -> list[dict]:
    # v2.6: ``is_default`` now compares ``equipment.default_driver_user_id``
    # to the assigned driver — the equipment side owns the relation.
    sql = """
        SELECT ad.equipment_id,
               e.name AS equipment_name,
               e.default_driver_user_id,
               ad.driver_user_id,
               COALESCE(u.fio, '') AS driver_fio,
               u.last_name, u.first_name, u.middle_name
        FROM application_drivers ad
        LEFT JOIN equipment e ON e.id = ad.equipment_id
        LEFT JOIN users u ON u.user_id = ad.driver_user_id
        WHERE ad.application_id = ?
    """
    async with db.conn.execute(sql, (app_id,)) as cur:
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in await cur.fetchall()]
    for r in rows:
        r["is_synthetic"] = int(r.get("driver_user_id", 0)) < 0
        r["is_default"] = (
            r.get("default_driver_user_id") is not None
            and r.get("default_driver_user_id") == r.get("driver_user_id")
        )
    return rows


async def increment_usage(
    db, equipment_id: int, driver_user_id: int,
) -> None:
    now = datetime.utcnow().isoformat(timespec="seconds")
    await db.conn.execute(
        """INSERT INTO equipment_driver_usage
           (equipment_id, driver_user_id, last_used_at, usage_count)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(equipment_id, driver_user_id) DO UPDATE
           SET usage_count = usage_count + 1,
               last_used_at = excluded.last_used_at""",
        (equipment_id, driver_user_id, now),
    )
    await db.conn.commit()


# ─────────────── synthetic ID redemption ───────────────


async def find_user_by_invite_code(db, invite_code: str) -> Optional[dict]:
    async with db.conn.execute(
        "SELECT user_id, fio, role FROM users WHERE invite_code = ?",
        (invite_code,),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return {"user_id": row[0], "fio": row[1], "role": row[2]}


async def redeem_synthetic_driver(
    db, synthetic_user_id: int, real_user_id: int,
) -> int:
    """Atomic swap of a synthetic-id driver row (user_id < 0) to a real
    platform id. Cascades application_drivers and equipment_driver_usage.
    Returns the number of application_drivers rows updated.

    Caller invokes this from the auth-redeem path when an invite_code
    matches a users row with user_id < 0.
    """
    if synthetic_user_id >= 0:
        return 0
    if synthetic_user_id == real_user_id:
        return 0

    async with db.conn.execute(
        "SELECT * FROM users WHERE user_id = ? AND role = 'driver'",
        (synthetic_user_id,),
    ) as cur:
        srow = await cur.fetchone()
        if not srow:
            return 0
        cols = [c[0] for c in cur.description]
        synth = dict(zip(cols, srow))

    async with db.conn.execute(
        "SELECT user_id, role FROM users WHERE user_id = ?", (real_user_id,)
    ) as cur:
        existing = await cur.fetchone()

    try:
        if existing:
            # Promote / merge into the existing real user, COALESCEing
            # synth values only where the real row has nothing yet so
            # higher roles (foreman/moderator) are preserved.
            await db.conn.execute(
                """UPDATE users
                   SET role = CASE WHEN role IN ('foreman','moderator','boss','superadmin')
                                   THEN role ELSE 'driver' END,
                       is_active = 1,
                       invite_code = COALESCE(invite_code, ?),
                       default_equipment_id = COALESCE(default_equipment_id, ?),
                       fio = COALESCE(NULLIF(fio, ''), ?),
                       last_name = COALESCE(NULLIF(last_name, ''), ?),
                       first_name = COALESCE(NULLIF(first_name, ''), ?),
                       middle_name = COALESCE(NULLIF(middle_name, ''), ?)
                   WHERE user_id = ?""",
                (
                    synth.get("invite_code"),
                    synth.get("default_equipment_id"),
                    synth.get("fio"),
                    synth.get("last_name"),
                    synth.get("first_name"),
                    synth.get("middle_name"),
                    real_user_id,
                ),
            )
        else:
            await db.conn.execute(
                """INSERT INTO users
                   (user_id, fio, last_name, first_name, middle_name,
                    role, is_active, invite_code, default_equipment_id, created_at)
                   VALUES (?, ?, ?, ?, ?, 'driver', 1, ?, ?, datetime('now'))""",
                (
                    real_user_id,
                    synth.get("fio"),
                    synth.get("last_name"),
                    synth.get("first_name"),
                    synth.get("middle_name"),
                    synth.get("invite_code"),
                    synth.get("default_equipment_id"),
                ),
            )

        # Cascade driver_categories.
        await db.conn.execute(
            """INSERT OR IGNORE INTO driver_categories (user_id, category)
               SELECT ?, category FROM driver_categories WHERE user_id = ?""",
            (real_user_id, synthetic_user_id),
        )
        await db.conn.execute(
            "DELETE FROM driver_categories WHERE user_id = ?",
            (synthetic_user_id,),
        )

        # Cascade equipment_driver_usage (merge counters).
        await db.conn.execute(
            """INSERT INTO equipment_driver_usage
               (equipment_id, driver_user_id, last_used_at, usage_count)
               SELECT equipment_id, ?, last_used_at, usage_count
               FROM equipment_driver_usage WHERE driver_user_id = ?
               ON CONFLICT(equipment_id, driver_user_id) DO UPDATE
               SET usage_count = equipment_driver_usage.usage_count + excluded.usage_count,
                   last_used_at = CASE
                       WHEN excluded.last_used_at > equipment_driver_usage.last_used_at
                       THEN excluded.last_used_at
                       ELSE equipment_driver_usage.last_used_at
                   END""",
            (real_user_id, synthetic_user_id),
        )
        await db.conn.execute(
            "DELETE FROM equipment_driver_usage WHERE driver_user_id = ?",
            (synthetic_user_id,),
        )

        # Cascade application_drivers — count rows for the return value.
        async with db.conn.execute(
            "SELECT COUNT(*) FROM application_drivers WHERE driver_user_id = ?",
            (synthetic_user_id,),
        ) as cur:
            rowcount = (await cur.fetchone())[0]
        await db.conn.execute(
            "UPDATE application_drivers SET driver_user_id = ? "
            "WHERE driver_user_id = ?",
            (real_user_id, synthetic_user_id),
        )

        # Drop the synthetic row.
        await db.conn.execute(
            "DELETE FROM users WHERE user_id = ?", (synthetic_user_id,),
        )

        await db.conn.commit()
        return int(rowcount or 0)
    except Exception:
        await db.conn.rollback()
        raise
