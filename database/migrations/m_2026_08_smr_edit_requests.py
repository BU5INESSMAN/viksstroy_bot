"""Persist idempotent SMR edit responses across workers/restarts."""

async def run(conn):
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS smr_edit_requests (
            actor_id INTEGER NOT NULL,
            operation_id TEXT NOT NULL,
            application_id INTEGER NOT NULL,
            request_hash TEXT NOT NULL,
            response_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(actor_id, operation_id)
        )
    """)
