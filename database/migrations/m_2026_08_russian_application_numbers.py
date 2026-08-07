"""Convert stable application numbers from YYMMDD to Russian DDMMYY order."""

from __future__ import annotations

import re
from datetime import datetime


OLD_NUMBER = re.compile(r"^З-(\d{6})-(\d{2,})$")


async def run(conn) -> None:
    async with conn.execute("PRAGMA table_info(applications)") as cur:
        columns = {row[1] for row in await cur.fetchall()}
    if "public_number" not in columns:
        return

    async with conn.execute(
        "SELECT id, public_number FROM applications WHERE public_number IS NOT NULL"
    ) as cur:
        rows = await cur.fetchall()

    converted: list[tuple[int, str]] = []
    for app_id, public_number in rows:
        match = OLD_NUMBER.match(str(public_number or "").strip())
        if not match:
            continue
        try:
            parsed = datetime.strptime(match.group(1), "%y%m%d")
        except ValueError:
            continue
        converted.append((int(app_id), f"З-{parsed.strftime('%d%m%y')}-{match.group(2)}"))

    # The unique index is active in production. Move through a temporary
    # namespace so even an ambiguous date cannot collide mid-conversion.
    for app_id, _new_number in converted:
        await conn.execute(
            "UPDATE applications SET public_number=? WHERE id=?",
            (f"TMP-RU-{app_id}", app_id),
        )
    for app_id, new_number in converted:
        await conn.execute(
            "UPDATE applications SET public_number=? WHERE id=?",
            (new_number, app_id),
        )
