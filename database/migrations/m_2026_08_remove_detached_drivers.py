"""Remove legacy driver assignments whose equipment is no longer in the request."""

from __future__ import annotations

import json


async def run(conn) -> None:
    async with conn.execute("SELECT id, equipment_data FROM applications") as cur:
        applications = await cur.fetchall()

    for application_id, equipment_data in applications:
        try:
            entries = json.loads(equipment_data or "[]")
            attached_ids = {
                int(entry["id"])
                for entry in entries
                if isinstance(entry, dict) and entry.get("id") is not None
            }
        except (TypeError, ValueError, json.JSONDecodeError):
            # Keep data untouched when the source request cannot be parsed.
            continue

        async with conn.execute(
            "SELECT equipment_id FROM application_drivers WHERE application_id = ?",
            (application_id,),
        ) as cur:
            assigned_ids = [int(row[0]) for row in await cur.fetchall()]

        detached_ids = [equipment_id for equipment_id in assigned_ids if equipment_id not in attached_ids]
        if detached_ids:
            await conn.executemany(
                "DELETE FROM application_drivers WHERE application_id = ? AND equipment_id = ?",
                [(application_id, equipment_id) for equipment_id in detached_ids],
            )
