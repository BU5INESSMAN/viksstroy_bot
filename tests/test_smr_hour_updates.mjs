import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateTeamHours, clearParticipantSalary } from '../frontend/src/features/kp/hourUpdates.js';
import { mergeDraftWorkerTeams } from '../frontend/src/features/kp/smrDraft.js';

const row = (user, hours, source=1) => ({ source_application_id:source, team_id:5, user_id:user, hours });
for (const status of ['sick', 'vacation']) {
    test(`reopened step preserves saved zero and salary for ${status}`, () => {
        const absent = { ...row(11,0), participant_salary:125 };
        const rows = [row(10,8), absent, row(12,0), row(10,4,2)];
        const team = { source_application_id:1, team_id:5,
            members:[{user_id:10,status:'available'}, {user_id:11,status}] };
        const changed = updateTeamHours(rows,team,'9',new Set(),1);
        assert.deepEqual(changed.find(r=>r.user_id===11),absent);
        assert.deepEqual(changed.find(r=>r.user_id===12),row(12,0));
        assert.deepEqual(changed.find(r=>r.source_application_id===2),row(10,4,2));
        assert.equal(changed.find(r=>r.user_id===10 && r.source_application_id===1).hours,9);
        const cleared = updateTeamHours(changed,team,'',new Set(),1);
        assert.deepEqual(cleared.find(r=>r.user_id===11),absent);
        assert.equal(rows[0].hours,8);
    });
}
test('common zero fills new available worker and retains individual override', () => {
    const team={team_id:5,members:[{user_id:10},{user_id:11}]};
    const result=updateTeamHours([row(10,6)],team,'0',new Set(['1:5:10']),1);
    assert.equal(result.find(r=>r.user_id===10).hours,6);
    assert.equal(result.find(r=>r.user_id===11).hours,0);
});
test('clearing salary retains explicitly saved zero', () => {
    assert.deepEqual(clearParticipantSalary({...row(11,0),participant_salary:100}), {...row(11,0),participant_salary:0});
    assert.equal(clearParticipantSalary(undefined),null);
});
test('invalid common input cannot delete existing rows', () => {
    const rows=[row(10,0)];
    assert.equal(updateTeamHours(rows,{team_id:5,members:[{user_id:10}]},'NaN',new Set(),1),rows);
});
test('added worker survives step remount and draft reload without duplication', () => {
    const server=[{source_application_id:1,team_id:5,members:[{user_id:10}]}];
    const drafts=JSON.parse(JSON.stringify([
        {source_application_id:1,team_id:5,members:[{user_id:11,is_ad_hoc:true,fio:'Новый'}]},
        {source_application_id:1,team_id:7,is_virtual:true,members:[{user_id:12,is_ad_hoc:true}]},
    ]));
    const teams=mergeDraftWorkerTeams(server,drafts,1);
    assert.equal(teams.length,2);
    assert.deepEqual(teams[0].members.map(m=>m.user_id),[10,11]);
    assert.deepEqual(mergeDraftWorkerTeams(teams,drafts,1),teams);
    assert.equal(server[0].members.length,1);
    assert.equal(mergeDraftWorkerTeams([{...server[0],smr_section_status:'not_worked'}],drafts,1)[0].members.length,1);
});
