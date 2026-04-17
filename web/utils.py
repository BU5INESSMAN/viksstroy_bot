import sys
import os
import secrets as _secrets

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database_deps import db


# ── Strong invite code generation (H-11) ────────────────────
# Crockford Base32 minus ambiguous chars (0/O/1/I/L removed)
_INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"  # 30 symbols


def generate_invite_code(length: int = 12) -> str:
    """Generate a strong, human-typable invite code.

    12 chars x 30 symbols = 30^12 ~ 5.3e17 combinations.
    At 1000 req/s brute-force would take ~17 million years.
    """
    return "".join(_secrets.choice(_INVITE_ALPHABET) for _ in range(length))


def normalize_invite_code(raw: str) -> str:
    """Normalize user-entered code: uppercase + strip separators."""
    if not raw:
        return ""
    return raw.upper().strip().replace(" ", "").replace("-", "").replace("_", "")


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


async def fetch_teams_icon_map():
    """v2.4.2 FIX 2: {team_id: icon_key} for enriching apps with team_icon."""
    if db.conn is None: await db.init_db()
    try:
        async with db.conn.execute("SELECT id, icon FROM teams") as cur:
            return {r[0]: (r[1] or '') for r in await cur.fetchall()}
    except Exception:
        return {}


async def fetch_category_icon_map():
    """v2.4.2 FIX 2: {category_name: icon_key} for enriching equipment lists."""
    if db.conn is None: await db.init_db()
    try:
        async with db.conn.execute("SELECT category, icon FROM equipment_category_settings") as cur:
            return {r[0]: (r[1] or '') for r in await cur.fetchall()}
    except Exception:
        return {}


def enrich_app_with_icons(app_dict, teams_icon_map, category_icon_map, equip_category_map):
    """Adds team_icon + category_icon on each equipment entry. Idempotent."""
    import json as _json

    # team_icon: first team id in possibly-comma list
    t_val = str(app_dict.get('team_id') or '').strip()
    team_icon = ''
    if t_val and t_val != '0':
        for part in t_val.split(','):
            part = part.strip()
            if part.isdigit():
                team_icon = teams_icon_map.get(int(part), '') or ''
                if team_icon:
                    break
    app_dict['team_icon'] = team_icon

    # category_icon on each equipment item
    raw = app_dict.get('equipment_data')
    if raw:
        try:
            eq_list = _json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            eq_list = []
        if isinstance(eq_list, list):
            changed = False
            for eq in eq_list:
                if not isinstance(eq, dict):
                    continue
                cat = eq.get('category') or equip_category_map.get(eq.get('id')) or ''
                if cat and not eq.get('category'):
                    eq['category'] = cat
                eq['category_icon'] = category_icon_map.get(cat, '') or ''
                changed = True
            if changed:
                app_dict['equipment_data'] = _json.dumps(eq_list, ensure_ascii=False)
    return app_dict


async def fetch_equipment_category_map():
    """{equipment_id: category} — for apps whose equipment_data lacks category."""
    if db.conn is None: await db.init_db()
    try:
        async with db.conn.execute("SELECT id, category FROM equipment") as cur:
            return {r[0]: (r[1] or '') for r in await cur.fetchall()}
    except Exception:
        return {}


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
