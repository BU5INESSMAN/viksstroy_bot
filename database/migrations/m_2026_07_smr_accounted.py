"""Add persistent office bookkeeping fields to completed SMR reports."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def _columns(conn, table: str) -> set[str]:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        return {row[1] for row in await cur.fetchall()}


async def run(conn) -> None:
    cols = await _columns(conn, "applications")
    if "smr_accounted_by" not in cols:
        logger.info("adding applications.smr_accounted_by")
        await conn.execute(
            "ALTER TABLE applications ADD COLUMN smr_accounted_by INTEGER DEFAULT NULL"
        )
    if "smr_accounted_at" not in cols:
        logger.info("adding applications.smr_accounted_at")
        await conn.execute(
            "ALTER TABLE applications ADD COLUMN smr_accounted_at TEXT DEFAULT NULL"
        )
    logger.info("smr_accounted migration complete")
