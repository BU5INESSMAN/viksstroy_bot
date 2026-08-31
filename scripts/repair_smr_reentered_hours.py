"""Repair ONLY audit-proven re-entry of hidden addendum hours.

Default is a read-only plan. --apply requires a plan SHA256, rejects changes
since review, skips accounted/archived reports, backs up SQLite consistently,
and writes append-only before/after audit in the same transaction.
Original addenda and work prices/volumes are NEVER changed by this script.
"""
import argparse
import asyncio
from collections import defaultdict
from datetime import datetime
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from smr_audit import payload_hash, capture_smr_financial_snapshot, record_smr_change
from database.db_manager import DatabaseManager


def repair_plan(conn):
    conn.row_factory = sqlite3.Row
    candidates = {}
    for audit in conn.execute("SELECT id,application_id,before_snapshot_json,after_snapshot_json,created_at FROM smr_financial_audit WHERE event_type='smr_ready_edited' ORDER BY id"):
        before = json.loads(audit['before_snapshot_json'] or '{}')
        after = json.loads(audit['after_snapshot_json'] or '{}')
        mains = {(r['application_id'], r['team_id'], r['member_id']) for r in before.get('hours',[]) if not r['is_additional']}
        extras = defaultdict(list)
        for r in before.get('hours',[]):
            if r['is_additional']:
                extras[(r['application_id'],r['team_id'],r['member_id'])].append(r)
        for r in after.get('hours',[]):
            key = (r['application_id'],r['team_id'],r['member_id'])
            if r['is_additional'] or key in mains or key not in extras or not r['hours']:
                continue
            # Exact re-entry of one of the old additional values, not a guess
            # based on coincident totals or same-name people.
            if not any(e['hours']==r['hours'] for e in extras[key]):
                continue
            candidates[key] = {'audit_id':audit['id'], 'audit_at':audit['created_at'], 'hours':r['hours'], 'additional_ids':[e['row_id'] for e in extras[key]]}
    result=[]; skipped=[]
    for (aid,team,member), evidence in sorted(candidates.items()):
        app=conn.execute('SELECT id,public_number,smr_accounted_at,kp_archived,smr_group_id FROM applications WHERE id=?',(aid,)).fetchone()
        group=[aid] if not app['smr_group_id'] else [r[0] for r in conn.execute('SELECT id FROM applications WHERE smr_group_id=?',(app['smr_group_id'],))]
        marks=','.join('?' for _ in group)
        if conn.execute(f'SELECT 1 FROM applications WHERE id IN ({marks}) AND (smr_accounted_at IS NOT NULL OR kp_archived=1)',group).fetchone():
            skipped.append({'application_id':aid,'reason':'accounted_or_archived'});continue
        row=conn.execute('SELECT * FROM application_hours WHERE app_id=? AND team_id=? AND user_id=? AND COALESCE(is_additional,0)=0',(aid,team,member)).fetchone()
        if not row or row['hours']!=evidence['hours'] or float(row['participant_salary'] or 0)!=0:
            continue
        valid=True
        for rid in evidence['additional_ids']:
            old=conn.execute('SELECT id FROM application_hours WHERE id=? AND app_id=? AND team_id=? AND user_id=? AND is_additional=1',(rid,aid,team,member)).fetchone()
            if not old: valid=False
        if not valid: continue
        result.append({'application_id':aid,'number':app['public_number'],'row':dict(row),'evidence':evidence})
    return {'rows':result,'skipped':skipped}


async def apply_plan(path, expected_hash):
    # The only mutating path: lock writers, compare the reviewed plan, backup,
    # delete exact verified rows, audit and commit everything atomically.
    db=DatabaseManager(str(path))
    async with db.isolated_connection():
        await db.conn.execute('BEGIN IMMEDIATE')
        reader=sqlite3.connect(f'file:{path.as_posix()}?mode=ro',uri=True)
        try:
            plan=repair_plan(reader)
            if payload_hash(plan)!=expected_hash:
                raise RuntimeError('Repair plan changed; review again before applying')
            backup=path.parent/'backups'/f'pre-smr-reentry-repair-{datetime.now():%Y%m%d-%H%M%S}.db'
            backup.parent.mkdir(exist_ok=True)
            with sqlite3.connect(backup) as target:
                reader.backup(target)
        finally: reader.close()
        apps=sorted({r['application_id'] for r in plan['rows']})
        before={aid:await capture_smr_financial_snapshot(db,aid) for aid in apps}
        for entry in plan['rows']:
            row=entry['row']
            cur=await db.conn.execute('DELETE FROM application_hours WHERE id=? AND app_id=? AND team_id=? AND user_id=? AND hours=? AND COALESCE(is_additional,0)=0 AND COALESCE(participant_salary,0)=0',
                                      (row['id'],row['app_id'],row['team_id'],row['user_id'],row['hours']))
            if cur.rowcount!=1: raise RuntimeError('Row changed during repair')
        after={}
        for aid in apps:
            after[aid]=await capture_smr_financial_snapshot(db,aid)
            await record_smr_change(db,aid,event_type='smr_duplicate_hours_repaired',source='maintenance',
                                    reason='Исправление подтверждённого повторного ввода скрытых часов дополнения; разрешено владельцем',
                                    before_snapshot=before[aid],after_snapshot=after[aid],metadata={'plan_hash':expected_hash,'removed_rows':[r for r in plan['rows'] if r['application_id']==aid]},commit=False)
        await db.conn.commit()
        return {'backup':str(backup),'removed_rows':len(plan['rows']),'applications':{aid:{'before':before[aid]['totals'],'after':after[aid]['totals']} for aid in apps}}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--database',default='data/viksstroy.db');parser.add_argument('--apply',metavar='PLAN_SHA256')
    args=parser.parse_args();path=Path(args.database).resolve()
    if args.apply: print(json.dumps(asyncio.run(apply_plan(path,args.apply)),ensure_ascii=False,indent=2))
    else:
        with sqlite3.connect(f'file:{path.as_posix()}?mode=ro',uri=True) as conn: plan=repair_plan(conn)
        totals=defaultdict(lambda:{'number':'','rows':0,'hours_to_remove':0})
        for row in plan['rows']:
            target=totals[row['application_id']];target['number']=row['number'];target['rows']+=1;target['hours_to_remove']+=row['row']['hours']
        print(json.dumps({'plan_hash':payload_hash(plan),'applications':dict(totals),'skipped':plan['skipped']},ensure_ascii=False,indent=2))
