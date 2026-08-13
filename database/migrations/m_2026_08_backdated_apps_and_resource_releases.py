"""Report-only backdated applications and exact resource release moments."""

from __future__ import annotations


async def _columns(conn, table: str) -> set[str]:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        return {str(row[1]) for row in await cur.fetchall()}


async def run(conn) -> None:
    columns = await _columns(conn, "applications")
    if "is_backdated" not in columns:
        await conn.execute(
            "ALTER TABLE applications ADD COLUMN is_backdated INTEGER NOT NULL DEFAULT 0"
        )
    if "backdated_created_at" not in columns:
        await conn.execute(
            "ALTER TABLE applications ADD COLUMN backdated_created_at TEXT DEFAULT NULL"
        )
    await conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS application_resource_releases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            resource_type TEXT NOT NULL CHECK(resource_type IN ('team', 'equipment')),
            resource_id INTEGER NOT NULL,
            released_at TEXT NOT NULL,
            released_by INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(application_id, resource_type, resource_id),
            FOREIGN KEY (application_id) REFERENCES applications(id)
        );
        CREATE INDEX IF NOT EXISTS idx_resource_releases_app
            ON application_resource_releases(application_id, resource_type, resource_id);
        """
    )
