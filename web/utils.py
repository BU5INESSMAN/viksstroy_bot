import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database_deps import db


async def resolve_id(raw_id: int):
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT primary_id FROM account_links WHERE secondary_id = ?", (raw_id,)) as cur:
        row = await cur.fetchone()
        if row: return row[0]
    return raw_id


# --- УМНЫЙ РАСШИРИТЕЛЬ ID ---
async def get_all_linked_ids(base_id: int):
    if db.conn is None: await db.init_db()
    ids = {base_id}

    async with db.conn.execute("SELECT secondary_id FROM account_links WHERE primary_id = ?", (base_id,)) as cur:
        for row in await cur.fetchall():
            if row and row[0]: ids.add(row[0])

    async with db.conn.execute("SELECT primary_id FROM account_links WHERE secondary_id = ?", (base_id,)) as cur:
        row = await cur.fetchone()
        if row and row[0]:
            primary = row[0]
            ids.add(primary)
            async with db.conn.execute("SELECT secondary_id FROM account_links WHERE primary_id = ?",
                                       (primary,)) as cur2:
                for r2 in await cur2.fetchall():
                    if r2 and r2[0]: ids.add(r2[0])
    return ids


async def fetch_teams_dict():
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT id, name FROM teams") as cur:
        return {r[0]: r[1] for r in await cur.fetchall()}


async def verify_moderator_plus(tg_id: int):
    """Verify user is moderator, boss, or superadmin. Returns (real_id, user_dict)."""
    from fastapi import HTTPException
    real_id = await resolve_id(tg_id)
    user = await db.get_user(real_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(403, "Нет прав")
    return real_id, dict(user)


def enrich_app_with_team_name(app_dict, teams_dict):
    t_val = str(app_dict.get('team_id', '0'))
    if t_val and t_val != '0':
        t_ids = [int(x) for x in t_val.split(',') if x.strip().isdigit()]
        app_dict['team_name'] = ", ".join(
            [teams_dict.get(tid, "Неизвестная бригада") for tid in t_ids]) if t_ids else "Без бригады"
    else:
        app_dict['team_name'] = "Без бригады"
    return app_dict
