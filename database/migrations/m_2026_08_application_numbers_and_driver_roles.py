"""Stable public application numbers and role repair for deleted drivers."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


async def _columns(conn, table: str) -> set[str]:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        return {row[1] for row in await cur.fetchall()}


def _date_key(created_at: str | None, date_target: str | None) -> str:
    raw = (created_at or date_target or "").strip()[:10]
    try:
        return datetime.strptime(raw, "%Y-%m-%d").strftime("%y%m%d")
    except ValueError:
        return "000000"


async def run(conn) -> None:
    if "public_number" not in await _columns(conn, "applications"):
        await conn.execute("ALTER TABLE applications ADD COLUMN public_number TEXT")

    counters: dict[str, int] = defaultdict(int)
    async with conn.execute(
        "SELECT id, created_at, date_target, public_number "
        "FROM applications ORDER BY id"
    ) as cur:
        rows = await cur.fetchall()
    for app_id, created_at, date_target, public_number in rows:
        key = _date_key(created_at, date_target)
        counters[key] += 1
        if not (public_number or "").strip():
            await conn.execute(
                "UPDATE applications SET public_number=? WHERE id=?",
                (f"З-{key}-{counters[key]:02d}", app_id),
            )

    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_public_number "
        "ON applications(public_number) WHERE public_number IS NOT NULL"
    )

    # Older soft-delete logic cleared the role of historical synthetic
    # drivers. Keep their true role for audit/user screens and blacklist them
    # so they do not reappear in the active driver picker.
    repaired = await conn.execute(
        "UPDATE users SET role='driver', is_blacklisted=1 "
        "WHERE (role IS NULL OR TRIM(role)='') "
        "AND user_id < 0 AND invite_code IS NOT NULL"
    )
    logger.info("repaired %s deleted synthetic driver roles", repaired.rowcount or 0)
