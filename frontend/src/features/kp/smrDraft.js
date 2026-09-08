// Match only explicit application-scoped identity aliases supplied by the API.
export function resolveDraftHour(row, teams, appId) {
    const source = Number(row.source_application_id || appId);
    const alias = teams.flatMap(t => t.member_aliases || []).find(a =>
        Number(a.app_id) === source && Number(a.old_member_id) === Number(row.user_id));
    return alias ? { ...row, source_application_id: source, team_id: Number(alias.team_id), user_id: Number(alias.member_id) } : row;
}

export function reconcileDraftHours(rows, teams, appId) {
    const result = new Map();
    for (const original of rows) {
        const row = resolveDraftHour(original, teams, appId);
        const key = `${Number(row.source_application_id || appId)}:${row.team_id}:${row.user_id}`;
        const prior = result.get(key);
        if (!prior) { result.set(key, row); continue; }
        if (Number(prior.hours) === Number(row.hours)
            && Number(prior.participant_salary || 0) === Number(row.participant_salary || 0)
            && !prior._draft_conflict && !row._draft_conflict) continue;
        result.set(key, { ...row, hours: '', participant_salary: '',
            _draft_conflict: [...(prior._draft_conflict || [prior]), ...(row._draft_conflict || [row])] });
    }
    return [...result.values()];
}

// Unsaved ad-hoc participants belong to the wizard draft, not to a mounted
// step. Retain them when returning from Works/Review or restoring the draft.
export function mergeDraftWorkerTeams(teams, draftTeams, appId) {
    const result = teams.map(t => ({ ...t, members: [...(t.members || [])] }));
    for (const draft of draftTeams) {
        const source = Number(draft.source_application_id || appId);
        const existing = result.find(t => Number(t.source_application_id || appId) === source
            && Number(t.team_id) === Number(draft.team_id));
        if (existing?.smr_section_status === 'not_worked') continue;
        const members = (draft.members || []).filter(m => m.is_ad_hoc);
        if (existing) {
            for (const member of members) {
                if (!existing.members.some(m => Number(m.user_id) === Number(member.user_id))) {
                    existing.members.push(member);
                }
            }
        } else if (members.length) {
            result.push({ ...draft, source_application_id: source, members: [...members] });
        }
    }
    return result;
}
