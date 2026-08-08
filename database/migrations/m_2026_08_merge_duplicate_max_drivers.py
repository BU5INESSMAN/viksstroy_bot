"""Merge unambiguous placeholder drivers into already active MAX accounts.

Older code treated every negative user_id as a placeholder even though MAX
accounts use the same signed-id space. That allowed an active MAX driver and
an inactive office card with the same full name to coexist. Only one-to-one
exact FIO matches are repaired; ambiguous names are deliberately left for
manual confirmation.
"""

from __future__ import annotations

import logging


logger = logging.getLogger(__name__)


async def run(conn) -> None:
    async with conn.execute(
        "SELECT user_id,fio,is_active FROM users "
        "WHERE role='driver' AND user_id<0 AND COALESCE(is_deleted,0)=0 "
        "AND TRIM(COALESCE(fio,''))!=''"
    ) as cur:
        rows = await cur.fetchall()

    groups: dict[str, dict[str, list[int]]] = {}
    for user_id, fio, is_active in rows:
        key = " ".join(str(fio).casefold().split())
        bucket = groups.setdefault(key, {"active": [], "placeholder": []})
        bucket["active" if is_active else "placeholder"].append(int(user_id))

    merged = 0
    for bucket in groups.values():
        if len(bucket["active"]) != 1 or len(bucket["placeholder"]) != 1:
            continue
        real_id = bucket["active"][0]
        synthetic_id = bucket["placeholder"][0]

        await conn.execute(
            "INSERT OR IGNORE INTO driver_categories(user_id,category) "
            "SELECT ?,category FROM driver_categories WHERE user_id=?",
            (real_id, synthetic_id),
        )
        await conn.execute(
            "DELETE FROM driver_categories WHERE user_id=?", (synthetic_id,)
        )

        async with conn.execute(
            "SELECT equipment_id,last_used_at,usage_count "
            "FROM equipment_driver_usage WHERE driver_user_id=?",
            (synthetic_id,),
        ) as cur:
            usage_rows = await cur.fetchall()
        for equipment_id, last_used_at, usage_count in usage_rows:
            await conn.execute(
                """INSERT INTO equipment_driver_usage
                   (equipment_id,driver_user_id,last_used_at,usage_count)
                   VALUES(?,?,?,?)
                   ON CONFLICT(equipment_id,driver_user_id) DO UPDATE SET
                     usage_count=equipment_driver_usage.usage_count+excluded.usage_count,
                     last_used_at=CASE
                       WHEN excluded.last_used_at>equipment_driver_usage.last_used_at
                       THEN excluded.last_used_at ELSE equipment_driver_usage.last_used_at END""",
                (equipment_id, real_id, last_used_at, usage_count),
            )
        await conn.execute(
            "DELETE FROM equipment_driver_usage WHERE driver_user_id=?",
            (synthetic_id,),
        )
        await conn.execute(
            "UPDATE application_drivers SET driver_user_id=? WHERE driver_user_id=?",
            (real_id, synthetic_id),
        )
        await conn.execute(
            "UPDATE equipment SET default_driver_user_id=? WHERE default_driver_user_id=?",
            (real_id, synthetic_id),
        )
        await conn.execute("DELETE FROM users WHERE user_id=?", (synthetic_id,))
        merged += 1

    logger.info("merged %s duplicate MAX driver placeholder(s)", merged)
