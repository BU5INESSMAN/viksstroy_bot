"""Explicit per-application identity recovery; never infer by matching names."""

async def run(conn):
    async with conn.execute('PRAGMA table_info(smr_team_sections)') as cur:
        columns = {r[1] for r in await cur.fetchall()}
    if 'is_required' not in columns:
        await conn.execute('ALTER TABLE smr_team_sections ADD COLUMN is_required INTEGER NOT NULL DEFAULT 1')
    await conn.execute('''CREATE TABLE IF NOT EXISTS smr_member_aliases (
        app_id INTEGER NOT NULL, old_member_id INTEGER NOT NULL,
        member_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '', PRIMARY KEY(app_id,old_member_id)
    )''')
