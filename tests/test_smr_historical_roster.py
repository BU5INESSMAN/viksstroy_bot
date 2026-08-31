import asyncio
import json
from unittest.mock import patch

import pytest
from test_smr_editor import make_db
from smr_roster import preserve_member_history, normalize_hours
from smr_data import get_smr_read_model
from web.routers import kp
from web.services.smr_completeness import get_smr_completeness


def test_deleted_member_keeps_historical_roster_name_and_zero_hours(tmp_path):
    async def run():
        db = await make_db(tmp_path/'history.db')
        try:
            await preserve_member_history(db, 11)
            await db.conn.execute('UPDATE application_hours SET hours=0 WHERE user_id=11')
            await db.conn.execute('DELETE FROM team_members WHERE id=11')
            await db.conn.commit()
            teams = await db.get_teams_for_app(1)
            assert teams[0]['members'][0]['id'] == 11
            assert teams[0]['members'][0]['fio'] == 'Один'
            data = await get_smr_read_model(db, 1)
            assert next(r for r in data['hours'] if r['member_id']==11)['fio']=='Один'
            assert (await get_smr_completeness(db, [1]))[1]['is_complete']
            with patch.object(kp, 'db', db):
                assert len(await kp._guard_adhoc_hours(1,[{'team_id':1,'user_id':11,'hours':0}], 'foreman'))==1
        finally:
            await db.conn.close()
    asyncio.run(run())


def test_resolved_roster_accepts_hours_and_hides_only_explicit_empty_section(tmp_path):
    async def run():
        db=await make_db(tmp_path/'resolved.db')
        try:
            await db.conn.execute("UPDATE applications SET selected_members='11,99'")
            await db.conn.execute("INSERT INTO smr_team_sections(app_id,team_id,roster_json) VALUES(1,1,?)", (json.dumps([{'member_id':11,'fio':'Один'},{'member_id':22,'fio':'Два'}]),))
            await db.conn.execute("INSERT INTO smr_team_sections(app_id,team_id,roster_json,is_required) VALUES(1,2,'[]',0)")
            await db.conn.execute('UPDATE application_hours SET team_id=1 WHERE user_id=22')
            await db.conn.commit()
            teams=await db.get_teams_for_app(1)
            assert len(teams)==1 and len(teams[0]['members'])==2
            assert (await get_smr_completeness(db,[1]))[1]['is_complete']
            await db.conn.execute('UPDATE smr_team_sections SET is_required=1 WHERE team_id=2')
            assert not (await get_smr_completeness(db,[1]))[1]['is_complete']
        finally: await db.conn.close()
    asyncio.run(run())


def test_aliases_are_application_scoped_and_never_sum_different_hours(tmp_path):
    async def run():
        db=await make_db(tmp_path/'aliases.db')
        try:
            await db.conn.execute('INSERT INTO smr_member_aliases(app_id,old_member_id,member_id,team_id) VALUES(1,99,22,2)')
            a={'source_application_id':1,'team_id':1,'user_id':99,'hours':9}
            b={'source_application_id':1,'team_id':2,'user_id':22,'hours':9}
            rows=await normalize_hours(db,[1],[a,b])
            assert len(rows)==1 and rows[0]['hours']==9 and rows[0]['user_id']==22
            assert await normalize_hours(db,[2],[{**a,'source_application_id':2}])==[{**a,'source_application_id':2}]
            with pytest.raises(ValueError,match='разные часы'):
                await normalize_hours(db,[1],[a,{**b,'hours':8}])
            with pytest.raises(ValueError,match='другой заявке'):
                await normalize_hours(db,[1],[{**a,'source_application_id':2}])
        finally: await db.conn.close()
    asyncio.run(run())
