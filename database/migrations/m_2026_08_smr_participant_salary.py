"""Store foreman-entered salary separately for every SMR participant."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def run(conn) -> None:
    async with conn.execute("PRAGMA table_info(application_hours)") as cur:
        columns = {row[1] for row in await cur.fetchall()}
    if "participant_salary" not in columns:
        logger.info("adding application_hours.participant_salary")
        await conn.execute(
            "ALTER TABLE application_hours "
            "ADD COLUMN participant_salary REAL DEFAULT 0"
        )
    logger.info("SMR participant salary migration complete")
