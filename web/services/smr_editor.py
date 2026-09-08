"""Row-preserving, versioned editing of the WHOLE factual SMR report.

Rows keep their identity, historical rates and main/addendum provenance.
No delete-and-reinsert, no implicit re-pricing, no additive re-submission.
Call writes on DatabaseManager.isolated_connection(), never a shared handle.
"""
import json
from datetime import datetime

from fastapi import HTTPException
from smr_data import get_smr_read_model, logical_smr_app_ids
from smr_audit import payload_hash, capture_smr_financial_snapshot, record_smr_change
from smr_calculations import decimal_value, money_value, MAX_HOURS_PER_ROW
from services.smr_completeness import get_smr_completeness, describe_smr_missing


async def editor_state(db, app_id, user):
    ids = await logical_smr_app_ids(db, app_id)
    if not ids:
        raise HTTPException(404, 'Заявка не найдена')
    marks = ','.join('?' for _ in ids)
    async with db.conn.execute(
        f'SELECT id,foreman_id,team_id,selected_members,smr_status,kp_status,'
        f'smr_accounted_at,smr_group_id,object_id,date_target FROM applications WHERE id IN ({marks}) ORDER BY id', ids
    ) as cur:
        apps = [dict(r) for r in await cur.fetchall()]
    role = user.get('role')
    if role not in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'):
        raise HTTPException(403, 'Редактирование доступно прорабу и офису')
    if role == 'foreman' and any(int(a['foreman_id'] or 0) != int(user['tg_id']) for a in apps):
        raise HTTPException(403, 'Можно редактировать только свои отчёты')
    if not all(a['smr_status'] == 'approved' or a['kp_status'] == 'approved' for a in apps):
        raise HTTPException(409, 'Статус отчёта изменился. Откройте его заново.')
    raw = {'applications': apps}
    for key, table, column in (
        ('hours', 'application_hours', 'app_id'),
        ('plan_works', 'application_kp', 'application_id'),
        ('extra_works', 'application_extra_works', 'application_id'),
        ('sections', 'smr_team_sections', 'app_id'),
    ):
        async with db.conn.execute(f'SELECT * FROM {table} WHERE {column} IN ({marks}) ORDER BY id', ids) as cur:
            raw[key] = [dict(r) for r in await cur.fetchall()]
    report = await get_smr_read_model(db, app_id, include_zero_hours=True)
    sections = []
    for a in apps:
        for team in await db.get_teams_for_app(a['id']):
            stored = next((s for s in raw['sections'] if s['app_id'] == a['id'] and s['team_id'] == team['id']), {})
            roster = json.loads(stored.get('roster_json') or '[]')
            if not roster:
                roster = [{'member_id': m['id'], 'fio': m.get('fio'), 'position': m.get('position')} for m in team['members']]
            sections.append({'application_id': a['id'], 'team_id': team['id'], 'team_name': team['name'],
                             'status': stored.get('status'), 'roster': roster})
    names = {(s['application_id'], s['team_id'], int(m['member_id'])): m.get('fio') for s in sections for m in s['roster']}
    for row in report['hours']:
        if not row.get('fio'):
            row['fio'] = names.get((row['application_id'], row['team_id'], row['member_id'])) or f"Сотрудник #{row['member_id']}"
    if role == 'foreman':
        for row in report['plan_works']:
            row.pop('current_salary', None); row.pop('current_price', None)
        for row in report['extra_works']:
            row.pop('salary', None); row.pop('price', None)
        report['totals'].pop('salary', None); report['totals'].pop('price', None)
    return {'editor_revision': payload_hash(raw), 'report': report, 'sections': sections}


def required_number(value, field, *, hours=False):
    if value is None or value == '' or isinstance(value, bool):
        raise HTTPException(400, f'{field}: укажите значение; 0 допустим')
    return float(decimal_value(value, field=field, maximum=MAX_HOURS_PER_ROW if hours else None))


async def save_report_changes(db, app_id, data, user):
    operation = str(data.get('operation_id') or '')
    if not 8 <= len(operation) <= 100:
        raise HTTPException(400, 'Не указан идентификатор сохранения')
    actor = int(user['tg_id'])
    request_hash = payload_hash({'app_id': app_id, 'data': data})
    await db.conn.execute('BEGIN IMMEDIATE')
    try:
        async with db.conn.execute('SELECT request_hash,response_json FROM smr_edit_requests WHERE actor_id=? AND operation_id=?', (actor, operation)) as cur:
            prior = await cur.fetchone()
        if prior:
            if prior['request_hash'] != request_hash:
                raise HTTPException(409, 'Идентификатор сохранения уже использован для других данных')
            await db.conn.rollback()
            return json.loads(prior['response_json'])
        state = await editor_state(db, app_id, user)
        if data.get('editor_revision') != state['editor_revision']:
            raise HTTPException(409, 'Отчёт уже изменён. Ваши изменения не записаны: откройте свежую версию и проверьте данные.')
        report = state['report']; ids = report['application_ids']
        before = await capture_smr_financial_snapshot(db, app_id)
        now = datetime.now().isoformat(timespec='seconds')
        count = 0
        seen = set()
        for key, table, field in (('hours', 'application_hours', 'hours'), ('plan_works', 'application_kp', 'volume'), ('extra_works', 'application_extra_works', 'volume')):
            existing = {int(r['id']): r for r in report[key]}
            for patch in data.get('changes', {}).get(key, []):
                rid = int(patch.get('id') or 0)
                if rid not in existing or (key, rid) in seen:
                    raise HTTPException(400, 'Неизвестная или повторная строка отчёта')
                seen.add((key, rid)); old = existing[rid]
                value = required_number(patch.get(field), 'Часы' if key == 'hours' else 'Объём', hours=key == 'hours')
                salary = float(money_value(patch.get('participant_salary', old.get('participant_salary', 0)), field='ЗП участника'))
                if value == float(old.get(field) or 0) and (key != 'hours' or salary == float(old.get('participant_salary') or 0)):
                    continue
                salary_sql = ',participant_salary=?' if key == 'hours' else ''
                values = [value] + ([salary] if key == 'hours' else [])
                await db.conn.execute(f'UPDATE {table} SET {field}=?{salary_sql},filled_by_user_id=?,filled_at=? WHERE id=?', (*values, actor, now, rid))
                count += 1
        roster_keys = {(s['application_id'], s['team_id'], int(m['member_id'])) for s in state['sections'] for m in s['roster']}
        for item in data.get('new_hours', []):
            source, team, member = int(item.get('application_id') or 0), int(item.get('team_id') or 0), int(item.get('member_id') or 0)
            if source not in ids or ((source, team, member) not in roster_keys and not await db.member_belongs_to_team(member, team)):
                raise HTTPException(400, 'Некорректный сотрудник или объект')
            async with db.conn.execute('SELECT 1 FROM application_hours WHERE app_id=? AND team_id=? AND user_id=?', (source, team, member)) as cur:
                if await cur.fetchone() or any((h.get('source_application_id') or h['application_id'],h['team_id'],h['member_id']) == (source,team,member) for h in report['hours']):
                    raise HTTPException(409, 'Часы сотрудника уже есть в отчёте. Измените существующую строку.')
            await db.conn.execute('INSERT INTO application_hours(app_id,team_id,user_id,hours,participant_salary,filled_by_user_id,filled_at,is_additional) VALUES(?,?,?,?,?,?,?,0)',
                                  (source, team, member, required_number(item.get('hours'), 'Часы', hours=True), float(money_value(item.get('participant_salary'), field='ЗП участника')), actor, now))
            count += 1
        allowed_sections = {(int(s['application_id']), int(s['team_id'])) for s in state['sections']}
        allowed_sections |= {(int(h['application_id']), int(h['team_id'])) for h in report['hours']}
        for item in data.get('new_works', []):
            source, team, kp_id = int(item.get('application_id') or 0), int(item.get('team_id') or 0), int(item.get('kp_id') or 0)
            if (source, team) not in allowed_sections:
                raise HTTPException(400, 'Выберите бригаду и объект этой заявки')
            volume = required_number(item.get('volume'), 'Объём')
            if volume <= 0:
                raise HTTPException(400, 'Для новой работы укажите объём больше 0')
            async with db.conn.execute('SELECT name,unit,salary,price FROM kp_catalog WHERE id=?', (kp_id,)) as cur:
                catalog = await cur.fetchone()
            if not catalog:
                raise HTTPException(400, 'Работа отсутствует в справочнике')
            await db.conn.execute('INSERT INTO application_extra_works(application_id,team_id,kp_id,extra_work_id,custom_name,unit,volume,salary,price,filled_by_user_id,filled_at,is_additional) VALUES(?,?,?,0,?,?,?,?,?,?,?,0)',
                                  (source, team, kp_id, catalog['name'], catalog['unit'], volume, catalog['salary'], catalog['price'], actor, now))
            count += 1
        if count:
            completeness = await get_smr_completeness(db, ids, trust_confirmed=False)
            if not completeness[min(ids)]['is_complete']:
                raise HTTPException(400, 'Данные не изменены. ' + await describe_smr_missing(db, completeness[min(ids)]))
            marks = ','.join('?' for _ in ids)
            await db.conn.execute(f'UPDATE applications SET smr_accounted_at=NULL,smr_accounted_by=NULL WHERE id IN ({marks})', ids)
            await record_smr_change(db, app_id, event_type='smr_ready_edited', actor_user_id=actor,
                                    actor_role=user.get('role',''), actor_name=user.get('fio',''), source='api',
                                    before_snapshot=before, metadata={'editor': 'row-preserving-v1', 'operation_id': operation}, force=True, commit=False)
        result = {'status': 'ok', 'changed_rows': count}
        await db.conn.execute('INSERT INTO smr_edit_requests(actor_id,operation_id,application_id,request_hash,response_json) VALUES(?,?,?,?,?)',
                              (actor, operation, app_id, request_hash, json.dumps(result)))
        await db.conn.commit()
        return result
    except BaseException:
        await db.conn.rollback()
        raise
