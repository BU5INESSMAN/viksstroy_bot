"""Reviewed, hash-locked roster-only recovery. Never writes hours or works."""
import argparse
import asyncio
from collections import defaultdict
from datetime import datetime
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database.db_manager import DatabaseManager
from smr_audit import payload_hash, capture_smr_financial_snapshot, record_smr_change

PEOPLE = [(91, 103, 106), (92, 105, 107), (93, 104, 108)]
PERSONNEL = {1016:'З-310726-19', 1046:'З-040826-13', 1098:'З-070826-25', 1115:'З-100826-16', 1131:'З-110826-14'}


def rows(conn, query, args=()):
    return [dict(r) for r in conn.execute(query, args)]


def fingerprint(conn, aid):
    result = {'app': rows(conn, 'SELECT * FROM applications WHERE id=?', (aid,))}
    for table, field in [('application_hours','app_id'), ('application_kp','application_id'),
                         ('application_extra_works','application_id'), ('smr_team_sections','app_id'),
                         ('smr_member_aliases','app_id')]:
        result[table] = rows(conn, f'SELECT * FROM {table} WHERE {field}=?', (aid,))
    return payload_hash(result)


def plan(conn, backups):
    conn.row_factory = sqlite3.Row
    identities = {}
    for path in backups:
        with sqlite3.connect(f'file:{Path(path).as_posix()}?mode=ro', uri=True) as old:
            old.row_factory = sqlite3.Row
            identities.update({r['id']: dict(r) for r in old.execute('SELECT id,team_id,fio,position FROM team_members')})
    identities.update({r['id']:dict(r) for r in conn.execute('SELECT id,team_id,fio,position FROM team_members')})
    for group in PEOPLE:
        for mid in group:
            if mid not in identities:
                raise RuntimeError(f'Historical identity {mid} not found in verified backups')
    changes = []
    for app in rows(conn, """SELECT * FROM applications WHERE foreman_id=-58718846
            AND date_target>='2026-08-01' AND status NOT IN ('cancelled','rejected')
            AND smr_accounted_at IS NULL ORDER BY id"""):
        aid = app['id']
        selected = {int(i) for i in str(app['selected_members'] or '').split(',') if i.isdigit()}
        if not selected.intersection({91,92,93,103,104,105}):
            continue
        hours = rows(conn, 'SELECT * FROM application_hours WHERE app_id=?', (aid,))
        assigned, aliases = {}, []
        for mid in selected:
            if mid not in identities:
                raise RuntimeError(f'Unknown person {mid} in {aid}; no guessing')
            assigned[mid] = identities[mid]['team_id']
        for group in PEOPLE:
            original = selected.intersection(group)
            saved = {(h['user_id'],h['team_id']) for h in hours if h['user_id'] in group}
            if not original and not saved:
                continue
            if len(saved) > 1 or (not saved and len(original) != 1):
                raise RuntimeError(f'Ambiguous identity in {aid}: {group}')
            canonical, team = next(iter(saved)) if saved else (next(iter(original)), identities[next(iter(original))]['team_id'])
            for mid in group:
                assigned.pop(mid, None)
                if mid != canonical:
                    aliases.append({'old_member_id':mid,'member_id':canonical,'team_id':team})
            assigned[canonical] = team
        for h in hours:
            if h['user_id'] not in identities:
                raise RuntimeError(f'Unknown saved person {h["user_id"]} in {aid}')
            assigned[h['user_id']] = h['team_id']
        by_team = defaultdict(list)
        for mid, team in sorted(assigned.items()):
            person = identities[mid]
            by_team[team].append({'member_id':mid,'fio':person['fio'],'position':person['position'] or ''})
        sections = []
        for tid in sorted({int(i) for i in str(app['team_id']).split(',') if i.isdigit()} | set(by_team)):
            required = bool(by_team[tid])
            if not required and (conn.execute('SELECT 1 FROM application_extra_works WHERE application_id=? AND team_id=?',(aid,tid)).fetchone()
                                 or conn.execute('SELECT 1 FROM application_kp WHERE application_id=? AND team_id=?',(aid,tid)).fetchone()):
                raise RuntimeError(f'Cannot hide empty section {aid}/{tid}: work belongs to it')
            sections.append({'team_id':tid, 'roster':by_team[tid], 'is_required':int(required)})
        existing = {s['team_id']:s for s in rows(conn,'SELECT * FROM smr_team_sections WHERE app_id=?',(aid,))}
        old_aliases = rows(conn,'SELECT old_member_id,member_id,team_id FROM smr_member_aliases WHERE app_id=? ORDER BY old_member_id',(aid,))
        aliases.sort(key=lambda r:r['old_member_id'])
        if all(t['team_id'] in existing and json.loads(existing[t['team_id']]['roster_json'])==t['roster']
               and existing[t['team_id']]['is_required']==t['is_required'] for t in sections) and old_aliases==aliases:
            continue
        changes.append({'id':aid,'number':app['public_number'],'kind':'roman','sections':sections,'aliases':aliases,'fingerprint':fingerprint(conn,aid)})
    for aid, number in PERSONNEL.items():
        app = conn.execute('SELECT * FROM applications WHERE id=?',(aid,)).fetchone()
        if not app or app['public_number'] != number:
            raise RuntimeError('Personnel target mismatch')
        if conn.execute('SELECT 1 FROM application_hours WHERE app_id=? AND (team_id=18 OR user_id IN(71,72))',(aid,)).fetchone():
            raise RuntimeError(f'Personnel gained factual hours in {aid}; stop for review')
        for table in ('application_kp','application_extra_works'):
            if conn.execute(f'SELECT 1 FROM {table} WHERE application_id=? AND team_id=18',(aid,)).fetchone():
                raise RuntimeError(f'Personnel gained factual work in {aid}; stop for review')
        section = conn.execute('SELECT * FROM smr_team_sections WHERE app_id=? AND team_id=18',(aid,)).fetchone()
        if not section:
            raise RuntimeError(f'Personnel section missing {aid}')
        if section['status']=='not_worked':
            continue
        changes.append({'id':aid,'number':number,'kind':'personnel_not_worked','fingerprint':fingerprint(conn,aid)})
    return changes


async def apply(path, backups, expected):
    db = DatabaseManager(str(path))
    async with db.isolated_connection():
        await db.conn.execute('BEGIN IMMEDIATE')
        with sqlite3.connect(f'file:{path.as_posix()}?mode=ro',uri=True) as reader:
            changes = plan(reader, backups)
            if payload_hash(changes) != expected:
                raise RuntimeError('Reviewed data changed; regenerate plan')
            target = path.parent/'backups'/f'pre-smr-roster-repair-{datetime.now():%Y%m%d-%H%M%S}.db'
            target.parent.mkdir(exist_ok=True)
            with sqlite3.connect(target) as backup:
                reader.backup(backup)
        summary = []
        for entry in changes:
            aid = entry['id']
            before = await capture_smr_financial_snapshot(db, aid)
            if entry['kind']=='personnel_not_worked':
                await db.conn.execute("""UPDATE smr_team_sections SET status='not_worked',
                    not_worked_reason='По подтверждению владельца: Агейкин и Тепляков не работали',
                    updated_by_role='maintenance',updated_at=CURRENT_TIMESTAMP WHERE app_id=? AND team_id=18""",(aid,))
            else:
                for section in entry['sections']:
                    await db.conn.execute("""INSERT INTO smr_team_sections(app_id,team_id,roster_json,is_required,updated_by_role)
                        VALUES(?,?,?,?,'maintenance') ON CONFLICT(app_id,team_id) DO UPDATE SET
                        roster_json=excluded.roster_json,is_required=excluded.is_required,
                        updated_by_role='maintenance',updated_at=CURRENT_TIMESTAMP""",
                        (aid,section['team_id'],json.dumps(section['roster'],ensure_ascii=False),section['is_required']))
                for alias in entry['aliases']:
                    await db.conn.execute("""INSERT INTO smr_member_aliases(app_id,old_member_id,member_id,team_id,reason)
                        VALUES(?,?,?,?,'Проверенная история удаления и повторного создания 25/30 августа')
                        ON CONFLICT(app_id,old_member_id) DO UPDATE SET member_id=excluded.member_id,team_id=excluded.team_id""",
                        (aid,alias['old_member_id'],alias['member_id'],alias['team_id']))
            after = await capture_smr_financial_snapshot(db, aid)
            if before['totals'] != after['totals']:
                raise RuntimeError(f'Financial totals changed in {aid}')
            await record_smr_change(db,aid,event_type='smr_roster_repaired',source='maintenance',
                reason='Восстановление состава; Персонал не работал — подтверждено владельцем',
                before_snapshot=before,after_snapshot=after,metadata={'plan_hash':expected,'change':entry},force=True,commit=False)
            summary.append({'id':aid,'number':entry['number'],'kind':entry['kind'],'totals_unchanged':True})
        await db.conn.commit()
        return {'backup':str(target),'changes':summary}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--database',default='data/viksstroy.db')
    parser.add_argument('--backup',action='append',required=True)
    parser.add_argument('--apply')
    args=parser.parse_args();path=Path(args.database).resolve()
    if args.apply:
        result=asyncio.run(apply(path,args.backup,args.apply))
    else:
        with sqlite3.connect(f'file:{path.as_posix()}?mode=ro',uri=True) as conn:
            changes=plan(conn,args.backup)
        result={'plan_hash':payload_hash(changes),'changes':changes}
    print(json.dumps(result,ensure_ascii=False,indent=2))
