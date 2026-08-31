import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock

import aiosqlite
import pytest
from fastapi import HTTPException
from database.db_manager import DatabaseManager
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'web'))
from web.services.smr_editor import editor_state, save_report_changes
from web.services.smr_completeness import get_smr_completeness
from web.routers import kp

USER = {'tg_id': 100, 'role': 'foreman', 'fio': 'Прораб'}


async def make_db(path):
    db = DatabaseManager(str(path))
    db.conn = await aiosqlite.connect(path)
    db.conn.row_factory = aiosqlite.Row
    await db.conn.execute('PRAGMA journal_mode=WAL')
    await db.conn.executescript(Path('database/schema.sql').read_text(encoding='utf-8'))
    for table, columns in {
        'applications': {'smr_status': 'TEXT', 'kp_status': 'TEXT', 'smr_group_id': 'TEXT', 'kp_archived': 'INTEGER DEFAULT 0'},
        'teams': {'icon': 'TEXT'},
        'team_members': {'tg_user_id': 'INTEGER', 'status': 'TEXT', 'status_from': 'TEXT', 'status_until': 'TEXT', 'status_reason': 'TEXT'},
        'application_extra_works': {'team_id':'INTEGER','is_additional':'INTEGER DEFAULT 0','kp_id':'INTEGER','unit':'TEXT','filled_by_user_id':'INTEGER','filled_at':'TEXT'},
        'application_kp': {'team_id':'INTEGER','is_additional':'INTEGER DEFAULT 0','unit':'TEXT','filled_by_user_id':'INTEGER','filled_at':'TEXT'},
    }.items():
        async with db.conn.execute(f'pragma table_info({table})') as c:
            existing = {r['name'] for r in await c.fetchall()}
        for name, kind in columns.items():
            if name not in existing:
                await db.conn.execute(f'ALTER TABLE {table} ADD COLUMN {name} {kind}')
    await db.conn.executescript("""
        INSERT INTO users(user_id,fio,role) VALUES(100,'Прораб','foreman');
        INSERT INTO teams(id,name) VALUES(1,'Ford'),(2,'Газель');
        INSERT INTO team_members(id,team_id,fio) VALUES(11,1,'Один'),(22,2,'Два');
        INSERT INTO objects(id,name,address) VALUES(1,'Объект','Адрес');
        INSERT INTO applications(id,foreman_id,object_id,team_id,selected_members,smr_status,kp_status,smr_accounted_at)
            VALUES(1,100,1,'1,2','11,22','approved','approved','2026-08-20');
        INSERT INTO application_hours(id,app_id,team_id,user_id,hours,is_additional,filled_at)
            VALUES(1,1,1,11,9,0,'2026-08-20'),(2,1,2,22,9,1,'2026-08-20');
        INSERT INTO kp_catalog(id,name,unit,salary,price) VALUES(1,'Работа','м',333,999);
        INSERT INTO application_extra_works(id,application_id,team_id,kp_id,volume,unit,salary,price,is_additional)
            VALUES(1,1,2,1,5,'м',10,20,1);
    """)
    await db.conn.commit()
    return db


async def payload(db, changes=None, **extra):
    state = await editor_state(db, 1, USER)
    return {'editor_revision': state['editor_revision'], 'operation_id': 'request-1234', 'changes': changes or {}, **extra}


def test_editor_sees_addendum_and_noop_preserves_identity_rates_accounting(tmp_path):
    async def scenario():
        db = await make_db(tmp_path/'db.sqlite')
        try:
            async with db.isolated_connection():
                state = await editor_state(db, 1, USER)
                assert state['report']['totals']['hours'] == 18
                assert len(state['report']['extra_works']) == 1
                data = await payload(db, {'hours': [{'id': 2, 'hours': 9}]})
                assert (await save_report_changes(db, 1, data, USER))['changed_rows'] == 0
            async with db.conn.execute('SELECT id,hours,is_additional FROM application_hours ORDER BY id') as c:
                assert [tuple(r) for r in await c.fetchall()] == [(1,9,0),(2,9,1)]
            async with db.conn.execute('SELECT smr_accounted_at FROM applications') as c:
                assert (await c.fetchone())[0] == '2026-08-20'
        finally: await db.conn.close()
    asyncio.run(scenario())


def test_edit_additional_row_preserves_rates_and_retry_exactly_once(tmp_path):
    async def scenario():
        db = await make_db(tmp_path/'db.sqlite')
        try:
            async with db.isolated_connection():
                data = await payload(db, {'hours':[{'id':2,'hours':0}], 'extra_works':[{'id':1,'volume':7}]})
                result = await save_report_changes(db,1,data,USER)
                assert result['changed_rows']==2
                assert await save_report_changes(db,1,data,USER)==result
            async with db.conn.execute('SELECT volume,salary,price,is_additional FROM application_extra_works') as c:
                assert tuple(await c.fetchone()) == (7,10,20,1)
            async with db.conn.execute('SELECT COUNT(*) FROM smr_financial_audit') as c:
                assert (await c.fetchone())[0]==1
            assert (await get_smr_completeness(db,[1]))[1]['is_complete']
        finally: await db.conn.close()
    asyncio.run(scenario())


@pytest.mark.parametrize('value', ['',None,-1,25,'NaN',True])
def test_invalid_hours_are_atomic(tmp_path,value):
    async def scenario():
        db=await make_db(tmp_path/'db.sqlite')
        try:
            async with db.isolated_connection():
                data=await payload(db,{'hours':[{'id':1,'hours':4},{'id':2,'hours':value}]})
                with pytest.raises((HTTPException,ValueError)):
                    await save_report_changes(db,1,data,USER)
                async with db.conn.execute('SELECT SUM(hours) FROM application_hours') as c:
                    assert (await c.fetchone())[0]==18
        finally: await db.conn.close()
    asyncio.run(scenario())


@pytest.mark.parametrize('mode',['stale','foreign_row','duplicate_row','duplicate_person','foreign_user'])
def test_rejects_stale_or_unsafe_edits(tmp_path,mode):
    async def scenario():
        db=await make_db(tmp_path/'db.sqlite')
        try:
            async with db.isolated_connection():
                data=await payload(db,{'hours':[{'id':2,'hours':8}]})
                user=USER
                if mode=='stale':
                    await db.conn.execute('UPDATE application_hours SET hours=7 WHERE id=1'); await db.conn.commit()
                elif mode=='foreign_row': data['changes']['hours'][0]['id']=999
                elif mode=='duplicate_row': data['changes']['hours']*=2
                elif mode=='duplicate_person': data['new_hours']=[{'application_id':1,'team_id':2,'member_id':22,'hours':9}]
                else: user={**USER,'tg_id':999}
                with pytest.raises(HTTPException): await save_report_changes(db,1,data,user)
                async with db.conn.execute('SELECT hours FROM application_hours WHERE id=2') as c:
                    assert (await c.fetchone())[0]==9
        finally: await db.conn.close()
    asyncio.run(scenario())


def test_audit_failure_rolls_back_business_write(tmp_path):
    async def scenario():
        db=await make_db(tmp_path/'db.sqlite')
        try:
            async with db.isolated_connection():
                data=await payload(db,{'hours':[{'id':2,'hours':8}]})
                with patch('web.services.smr_editor.record_smr_change',AsyncMock(side_effect=RuntimeError('audit failed'))):
                    with pytest.raises(RuntimeError): await save_report_changes(db,1,data,USER)
                async with db.conn.execute('SELECT SUM(hours) FROM application_hours') as c:
                    assert (await c.fetchone())[0]==18
        finally: await db.conn.close()
    asyncio.run(scenario())


def test_concurrent_commit_cannot_destroy_savepoint_or_leak_to_background(tmp_path):
    async def scenario():
        db=await make_db(tmp_path/'db.sqlite'); shared=db.conn
        try:
            async with db.isolated_connection():
                assert db.conn is not shared
                await db.conn.execute('SAVEPOINT edit_completed_smr')
                await db.conn.execute('UPDATE application_hours SET hours=1 WHERE id=1')
                async def other_request():
                    assert db.conn is shared
                    await db.conn.commit()
                await asyncio.create_task(other_request())
                await db.conn.execute('ROLLBACK TO SAVEPOINT edit_completed_smr')
                await db.conn.execute('RELEASE SAVEPOINT edit_completed_smr')
            assert db.conn is shared
            async with db.conn.execute('SELECT SUM(hours) FROM application_hours') as c:
                assert (await c.fetchone())[0]==18
        finally: await db.conn.close()
    asyncio.run(scenario())


def test_old_ready_editor_is_rejected_before_writing(tmp_path):
    async def scenario():
        db=await make_db(tmp_path/'db.sqlite')
        try:
            request=AsyncMock();request.json.return_value={'action':'edit','ready_edit':True,'hours':[]}
            with patch.object(kp,'db',db), pytest.raises(HTTPException) as error:
                await kp.review_smr(1,request,USER)
            assert error.value.status_code==409
            async with db.conn.execute('SELECT SUM(hours) FROM application_hours') as c:
                assert (await c.fetchone())[0]==18
        finally: await db.conn.close()
    asyncio.run(scenario())


def test_addendum_retry_does_not_insert_twice(tmp_path):
    async def scenario():
        db=await make_db(tmp_path/'db.sqlite')
        try:
            request=AsyncMock(); request.json.return_value={'operation_id':'addition-12345','hours':[{'team_id':2,'user_id':22,'hours':1}]}
            with patch.object(kp,'db',db), patch.object(kp,'_audit_smr_change',AsyncMock()), patch.object(db,'add_log',AsyncMock()), patch.object(kp,'notify_users',AsyncMock()), patch.object(kp,'get_application_number',AsyncMock(return_value='З-01')):
                first=await kp.submit_additional_report(1,request,USER)
                second=await kp.submit_additional_report(1,request,USER)
                assert first==second
            async with db.conn.execute('SELECT SUM(hours),COUNT(*) FROM application_hours') as cur:
                assert tuple(await cur.fetchone())==(19,3)
        finally: await db.conn.close()
    asyncio.run(scenario())


def test_missing_member_and_new_work_use_explicit_zero_and_catalog_price(tmp_path):
    async def scenario():
        db=await make_db(tmp_path/'db.sqlite')
        try:
            await db.conn.execute('DELETE FROM application_hours WHERE id=2'); await db.conn.commit()
            async with db.isolated_connection():
                data=await payload(db,new_hours=[{'application_id':1,'team_id':2,'member_id':22,'hours':0}],new_works=[{'application_id':1,'team_id':2,'kp_id':1,'volume':2}])
                assert (await save_report_changes(db,1,data,USER))['changed_rows']==2
            async with db.conn.execute('SELECT price,volume FROM application_extra_works ORDER BY id') as cur:
                assert [tuple(r) for r in await cur.fetchall()]==[(20,5),(999,2)]
            assert (await get_smr_completeness(db,[1]))[1]['is_complete']
        finally: await db.conn.close()
    asyncio.run(scenario())
