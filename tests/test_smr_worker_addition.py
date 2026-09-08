import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from test_smr_editor import make_db
from services import app_service
from services.smr_sections import ensure_smr_team_sections, sync_application_roster
from services.smr_completeness import get_smr_completeness, describe_smr_missing
from web.routers import kp


async def open_report(db):
    await db.conn.execute("UPDATE applications SET status='waiting',smr_status='in_progress',kp_status=NULL")
    await ensure_smr_team_sections(db, [1])
    await db.conn.execute("INSERT INTO team_members(id,team_id,fio) VALUES(33,1,'Новый')")
    await db.conn.commit()


def test_application_edit_requires_new_worker_and_preserves_existing_zero(tmp_path):
    async def run():
        db = await make_db(tmp_path / 'add.db')
        try:
            await open_report(db)
            await db.conn.execute('UPDATE application_hours SET hours=0 WHERE user_id=11')
            # Exercise the actual application-update transaction, not just SQL.
            with patch.object(app_service, 'db', db), \
                 patch.object(app_service, 'resolve_id', AsyncMock(return_value=100)), \
                 patch.object(db, 'check_resource_availability', AsyncMock(return_value=[])), \
                 patch.object(app_service, '_build_application_changes', AsyncMock(return_value=[])), \
                 patch.object(db, 'add_log', AsyncMock()):
                await app_service.update_application(1,100,'1,2','2026-09-05','Адрес','',
                                                     '11,22,33','[]',1,driver_assignments=None)
            teams = await db.get_teams_for_app(1)
            assert {m['id'] for t in teams for m in t['members']} == {11,22,33}
            state = (await get_smr_completeness(db,[1]))[1]
            assert state['missing_members'] == 1
            assert state['missing_details'][0]['member_ids'] == [33]
            assert 'Новый' in await describe_smr_missing(db, state)
            await db.save_app_hours(1,[{'team_id':1,'user_id':33,'hours':0}],100)
            assert (await get_smr_completeness(db,[1]))[1]['is_complete']
            async with db.conn.execute('SELECT hours FROM application_hours WHERE user_id=11') as cur:
                assert (await cur.fetchone())[0] == 0
        finally:
            await db.conn.close()
    asyncio.run(run())


@pytest.mark.parametrize('unresolved', [False, True])
def test_empty_brigade_does_not_invent_employee_but_unknown_roster_stays_blocked(tmp_path, unresolved):
    async def run():
        db = await make_db(tmp_path / 'empty.db')
        try:
            await db.conn.execute('UPDATE applications SET selected_members=?', ('11,99' if unresolved else '11',))
            await ensure_smr_team_sections(db,[1])
            # An unrelated worker with explicit 0 cannot replace unknown ID 99.
            await db.conn.execute('UPDATE application_hours SET hours=0 WHERE user_id=22')
            state = (await get_smr_completeness(db,[1]))[1]
            assert state['is_complete'] is not unresolved
            if unresolved:
                assert state['missing_details'][0]['reason'] == 'unknown_roster'
                text = await describe_smr_missing(db,state)
                assert 'Газель' in text and 'восстановить состав' in text
                assert 'не введены часы' not in text
        finally:
            await db.conn.close()
    asyncio.run(run())


def test_explicit_removal_preserves_facts_and_unaffected_not_worked_status(tmp_path):
    async def run():
        db = await make_db(tmp_path / 'remove.db')
        try:
            await open_report(db)
            await db.conn.execute("UPDATE smr_team_sections SET status='not_worked',not_worked_reason='Причина' WHERE team_id=1")
            await sync_application_roster(db,1,'1,2','11')
            await db.conn.execute("UPDATE applications SET selected_members='11'")
            teams = await db.get_teams_for_app(1)
            assert len(teams) == 1
            async with db.conn.execute('SELECT COUNT(*) FROM application_hours') as cur:
                assert (await cur.fetchone())[0] == 2
            async with db.conn.execute('SELECT status,not_worked_reason FROM smr_team_sections WHERE team_id=1') as cur:
                assert tuple(await cur.fetchone()) == ('not_worked', 'Причина')
        finally:
            await db.conn.close()
    asyncio.run(run())


def test_finished_report_and_directory_changes_do_not_refresh_history(tmp_path):
    async def run():
        db = await make_db(tmp_path / 'history.db')
        try:
            before = await ensure_smr_team_sections(db,[1])
            await db.conn.execute("INSERT INTO team_members(id,team_id,fio) VALUES(33,1,'Новый')")
            await db.conn.execute("UPDATE team_members SET team_id=2,fio='Изменено' WHERE id=11")
            assert [s['roster_json'] for s in await ensure_smr_team_sections(db,[1])] == [s['roster_json'] for s in before]
            with pytest.raises(HTTPException, match='409'):
                await sync_application_roster(db,1,'1,2','11,22,33')
            assert [s['roster_json'] for s in await ensure_smr_team_sections(db,[1])] == [s['roster_json'] for s in before]
        finally:
            await db.conn.close()
    asyncio.run(run())


def test_roster_edit_retains_deleted_identity_and_requires_every_frozen_member(tmp_path):
    async def run():
        db = await make_db(tmp_path / 'deleted.db')
        try:
            await open_report(db)
            await db.conn.execute('DELETE FROM team_members WHERE id=11')
            await sync_application_roster(db,1,'1,2','11,22,33')
            await db.conn.execute("UPDATE applications SET selected_members='11,22,33'")
            teams = await db.get_teams_for_app(1)
            assert next(m for t in teams for m in t['members'] if m['id']==11)['fio'] == 'Один'
            await db.conn.execute("UPDATE applications SET selected_members='' ")
            assert not (await get_smr_completeness(db,[1]))[1]['is_complete']
        finally:
            await db.conn.close()
    asyncio.run(run())


@pytest.mark.parametrize('unresolved', [False, True])
def test_finalization_endpoint_saves_zero_and_explains_unresolved_roster(tmp_path, unresolved):
    async def run():
        db = await make_db(tmp_path / 'submit.db')
        try:
            await db.conn.execute('ALTER TABLE applications ADD COLUMN smr_filled_by_role TEXT')
            await db.conn.execute("UPDATE applications SET selected_members=?,smr_status='in_progress',kp_status=NULL",
                                  ('11,99' if unresolved else '11',))
            await db.conn.commit()
            request = SimpleNamespace(json=AsyncMock(return_value={
                'finalize': True,
                'hours': [{'source_application_id':1,'team_id':1,'user_id':11,'hours':8},
                          {'source_application_id':1,'team_id':2,'user_id':22,'hours':0}],
            }))
            with patch.object(kp,'db',db):
                if unresolved:
                    with pytest.raises(HTTPException) as exc:
                        await kp.submit_smr_report(1,request,current_user={'tg_id':100,'role':'foreman'})
                    assert exc.value.status_code == 400
                    assert 'Газель' in exc.value.detail and 'восстановить состав' in exc.value.detail
                else:
                    result = await kp.submit_smr_report(1,request,current_user={'tg_id':100,'role':'foreman'})
                    assert result['finalized'] and result['smr_status'] == 'approved'
            async with db.conn.execute('SELECT hours FROM application_hours WHERE user_id=22 AND is_additional=0') as cur:
                assert (await cur.fetchone())[0] == 0
            async with db.conn.execute('SELECT hours FROM application_hours WHERE user_id=22 AND is_additional=1') as cur:
                assert (await cur.fetchone())[0] == 9
        finally:
            await db.conn.close()
    asyncio.run(run())
