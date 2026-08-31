"""Historical SMR participants, independent of today's resource directory."""
import json


async def has_table(db, name):
    async with db.conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)) as cur:
        return await cur.fetchone() is not None


async def sections_for(db, app_ids):
    if not app_ids or not await has_table(db, 'smr_team_sections'):
        return []
    marks = ','.join('?' for _ in app_ids)
    async with db.conn.execute(f'SELECT * FROM smr_team_sections WHERE app_id IN ({marks})', tuple(app_ids)) as cur:
        return [dict(r) for r in await cur.fetchall()]


def roster(section):
    try:
        value = json.loads(section.get('roster_json') or '[]')
        return value if isinstance(value, list) else []
    except (ValueError, TypeError):
        return []


async def aliases_for(db, app_ids):
    if not app_ids or not await has_table(db, 'smr_member_aliases'):
        return []
    marks = ','.join('?' for _ in app_ids)
    async with db.conn.execute(f'SELECT * FROM smr_member_aliases WHERE app_id IN ({marks})', tuple(app_ids)) as cur:
        return [dict(r) for r in await cur.fetchall()]


async def enrich_historical_hours(db, rows, app_ids):
    names = {(int(s['app_id']), int(s['team_id']), int(m['member_id'])): m
             for s in await sections_for(db, app_ids) for m in roster(s)}
    for row in rows:
        key = (int(row.get('application_id') or row.get('app_id') or 0),
               int(row['team_id']), int(row['member_id']))
        person = names.get(key)
        if person:
            row['fio'] = person.get('fio') or row.get('fio')
            row['specialty'] = person.get('position') or row.get('specialty')
    return rows


async def normalize_hours(db, app_ids, rows):
    """Explicit, application-scoped aliases only. Never sum duplicate drafts."""
    aliases = {(int(a['app_id']), int(a['old_member_id'])): a for a in await aliases_for(db, app_ids)}
    result, seen = [], {}
    for original in rows:
        row = dict(original)
        source = int(row.get('source_application_id') or min(app_ids))
        if source not in app_ids:
            raise ValueError('Сотрудник относится к другой заявке')
        member = int(row.get('user_id') or 0)
        alias = aliases.get((source, member))
        if alias:
            row.update(source_application_id=source, user_id=alias['member_id'], team_id=alias['team_id'])
        key = (source, int(row.get('team_id') or 0), int(row.get('user_id') or 0))
        if key in seen:
            prior = seen[key]
            if any(float(prior.get(f) or 0) != float(row.get(f) or 0) for f in ('hours', 'participant_salary')):
                raise ValueError('В черновике разные часы или ЗП одного сотрудника. Проверьте его строку после переноса.')
            continue
        seen[key] = row
        result.append(row)
    return result


async def preserve_member_history(db, member_id):
    """Snapshot affected rosters BEFORE deleting a resource; caller commits."""
    if not await has_table(db, 'smr_team_sections'):
        return
    async with db.conn.execute('SELECT * FROM team_members WHERE id=?', (member_id,)) as cur:
        value = await cur.fetchone()
    if not value:
        return
    person = dict(value)
    async with db.conn.execute("""SELECT id,selected_members FROM applications
        WHERE instr(',' || COALESCE(selected_members,'') || ',', ',' || ? || ',') > 0
           OR id IN (SELECT app_id FROM application_hours WHERE user_id=?)""", (str(member_id), member_id)) as cur:
        apps = [dict(r) for r in await cur.fetchall()]
    for app in apps:
        aid, tid = int(app['id']), int(person['team_id'])
        section = next((s for s in await sections_for(db, [aid]) if int(s['team_id']) == tid), {})
        frozen = roster(section)
        if not frozen:
            selected = {int(i) for i in str(app['selected_members'] or '').split(',') if i.isdigit()}
            async with db.conn.execute('SELECT id,fio,position FROM team_members WHERE team_id=?', (tid,)) as cur:
                frozen = [{'member_id': r['id'], 'fio': r['fio'], 'position': r['position']}
                          for r in await cur.fetchall() if not selected or int(r['id']) in selected]
        if not any(int(m['member_id']) == member_id for m in frozen):
            frozen.append({'member_id': member_id, 'fio': person.get('fio'), 'position': person.get('position')})
        await db.conn.execute("""INSERT INTO smr_team_sections(app_id,team_id,roster_json)
            VALUES(?,?,?) ON CONFLICT(app_id,team_id) DO UPDATE SET roster_json=excluded.roster_json""",
            (aid, tid, json.dumps(frozen, ensure_ascii=False)))
