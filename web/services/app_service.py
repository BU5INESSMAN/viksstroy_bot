import json
import logging

from database_deps import db
from utils import resolve_id

logger = logging.getLogger(__name__)


async def ensure_app_columns():
    try:
        await db.conn.execute("ALTER TABLE applications ADD COLUMN is_team_freed INTEGER DEFAULT 0")
    except:
        pass
    try:
        await db.conn.execute("ALTER TABLE applications ADD COLUMN freed_team_ids TEXT DEFAULT ''")
    except:
        pass
    await db.conn.commit()


def _split_legacy_object_address(merged: str):
    """v2.4.2 FIX 4: legacy `applications.object_address` was stored as
    'Name (Address)'. Split into (name, address) so the frontend can
    render two lines even for old rows whose object was deleted or was
    never linked via object_id. Returns (name, address) tuple.
    """
    if not merged:
        return '', ''
    s = merged.strip()
    # Prefer the last '(...)' suffix — object names can contain commas
    # or other punctuation but should not themselves end in a parenthetical.
    if s.endswith(')') and ' (' in s:
        lparen = s.rfind(' (')
        name = s[:lparen].strip()
        address = s[lparen + 2:-1].strip()
        if name and address:
            return name, address
    return s, ''


async def enrich_app_with_object_fields(app_dict):
    """Populate `object_name` and `object_address` on an application dict
    from the linked `objects` row (via `a.object_id`).

    Overrides the legacy merged `object_address` column with the clean
    split (`objects.name`, `objects.address`). For rows without a linked
    object, falls back to parsing the legacy 'Name (Address)' string.
    The frontend `ObjectDisplay` uses the two fields separately.
    """
    obj_id = app_dict.get('object_id')
    legacy = app_dict.get('object_address', '') or ''
    if obj_id:
        try:
            async with db.conn.execute(
                "SELECT name, address FROM objects WHERE id = ?", (obj_id,)
            ) as cur:
                row = await cur.fetchone()
            if row:
                name, address = row[0] or '', row[1] or ''
                if name:
                    app_dict['object_name'] = name
                    app_dict['object_address'] = address
                    return
        except Exception:
            pass
    # Fallback: no object_id or missing row — split the legacy merged
    # string so the frontend can still render name/address on two lines.
    name, address = _split_legacy_object_address(legacy)
    app_dict['object_name'] = name
    app_dict['object_address'] = address


async def enrich_app_with_members_data(app_dict):
    selected_m = app_dict.get('selected_members')
    members_list = []
    if selected_m:
        m_ids = [int(x) for x in selected_m.split(',') if x.strip().isdigit()]
        if m_ids:
            pl = ','.join(['?'] * len(m_ids))
            query = f"""
                SELECT tm.id, tm.fio, tm.tg_user_id, tm.position, tm.team_id, t.name
                FROM team_members tm
                LEFT JOIN teams t ON tm.team_id = t.id
                WHERE tm.id IN ({pl})
            """
            async with db.conn.execute(query, m_ids) as cur:
                for r in await cur.fetchall():
                    members_list.append({
                        "id": r[0],
                        "fio": r[1],
                        "tg_user_id": r[2],
                        "position": r[3],
                        "team_id": r[4],
                        "team_name": r[5] or f"Бригада {r[4]}"
                    })
    app_dict['members_data'] = members_list


async def get_active_objects_list(tg_id: int = 0):
    """Get active objects sorted by user's last used."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute(
            "SELECT id, name, address, default_team_ids, default_equip_ids FROM objects WHERE is_archived = 0 ORDER BY name") as cur:
        rows = await cur.fetchall()
        objects = [{"id": r[0], "name": r[1], "address": r[2], "default_team_ids": r[3], "default_equip_ids": r[4]} for r in rows]

    if tg_id:
        real_id = await resolve_id(tg_id)
        try:
            async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
                row = await cur.fetchone()
                if row and row[0]:
                    last_ids = json.loads(row[0])
                    def sort_key(obj):
                        try:
                            return last_ids.index(obj['id'])
                        except ValueError:
                            return len(last_ids) + obj['id']
                    objects.sort(key=sort_key)
        except:
            pass

    return objects


async def create_application(tg_id, team_id, date_target, object_address, comment,
                             selected_members, equipment_data, object_id):
    """Create a new application. Returns (app_id, fio) or raises."""
    from fastapi import HTTPException
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    fio = dict(user).get('fio', 'Web-Пользователь') if user else "Web-Пользователь"

    occupied = await db.check_resource_availability(date_target, object_id, team_id, equipment_data)
    if occupied:
        raise HTTPException(409, "Ошибка создания наряда:\n" + "\n".join(occupied))

    cursor = await db.conn.execute(
        "INSERT INTO applications (foreman_id, foreman_name, team_id, object_id, date_target, object_address, time_start, time_end, comment, status, selected_members, equipment_data, is_team_freed, freed_team_ids) VALUES (?, ?, ?, ?, ?, ?, '08', '17', ?, 'waiting', ?, ?, 0, '')",
        (real_tg_id, fio, team_id, object_id, date_target, object_address, comment, selected_members, equipment_data))
    new_app_id = cursor.lastrowid
    await db.conn.commit()
    await db.add_log(real_tg_id, fio, f"Создал заявку на {object_address} ({date_target})", target_type='application', target_id=new_app_id)
    return new_app_id, real_tg_id, fio


async def update_application(app_id, tg_id, team_id, date_target, object_address,
                             comment, selected_members, equipment_data, object_id):
    """Update an existing waiting application. Returns (real_tg_id, fio) or raises."""
    from fastapi import HTTPException
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(403)
    async with db.conn.execute("SELECT status FROM applications WHERE id = ?", (app_id,)) as cur:
        row = await cur.fetchone()
        if not row or row[0] != 'waiting': raise HTTPException(400, "Заявка уже в работе или проверена")

    occupied = await db.check_resource_availability(date_target, object_id, team_id, equipment_data, exclude_app_id=app_id)
    if occupied:
        raise HTTPException(409, "Ошибка обновления наряда:\n" + "\n".join(occupied))

    try:
        await db.conn.execute(
            "UPDATE applications SET team_id=?, date_target=?, object_address=?, object_id=?, comment=?, selected_members=?, equipment_data=? WHERE id = ?",
            (team_id, date_target, object_address, object_id, comment, selected_members, equipment_data, app_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()

    fio = dict(user).get('fio', 'Пользователь')
    await db.add_log(real_tg_id, fio, f"Обновил заявку на {object_address} ({date_target})", target_type='application', target_id=app_id)
    return real_tg_id, fio


async def delete_application(app_id, tg_id):
    """Delete an application with cascade resource release. Returns (real_tg_id, fio, app_dict) or raises."""
    from fastapi import HTTPException
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(403, "Нет прав для удаления заявки")

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()

    if not app_row:
        raise HTTPException(404, "Заявка не найдена")

    try:
        app_dict = dict(zip([c[0] for c in cur.description], app_row))
        if app_dict.get('status') in ['approved', 'published', 'in_progress']:
            if app_dict.get('equipment_data'):
                try:
                    eq_list = json.loads(app_dict['equipment_data'])
                    for e in eq_list:
                        await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (e['id'],))
                except:
                    pass

        await db.conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        await db.conn.commit()

        fio = dict(user).get('fio', 'Админ')
        await db.add_log(real_tg_id, fio,
                         f"Удалил заявку №{app_id} (Объект: {app_dict.get('object_address')})",
                         target_type='application', target_id=app_id)
        return real_tg_id, fio, app_dict
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка удаления: {e}")


async def update_last_used_objects(user_id: int, object_id: int):
    """Update user's last used objects list."""
    from fastapi import HTTPException
    real_id = await resolve_id(user_id)
    user = await db.get_user(real_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    last_used = '[]'
    try:
        async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                last_used = row[0]
    except:
        pass

    try:
        ids = json.loads(last_used)
    except:
        ids = []

    if object_id in ids:
        ids.remove(object_id)
    ids.insert(0, object_id)
    ids = ids[:10]

    await db.conn.execute("UPDATE users SET last_used_objects = ? WHERE user_id = ?", (json.dumps(ids), real_id))
    await db.conn.commit()


async def get_last_used_objects(user_id: int):
    """Get user's last used objects list."""
    real_id = await resolve_id(user_id)
    try:
        async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                return json.loads(row[0])
    except:
        pass
    return []
