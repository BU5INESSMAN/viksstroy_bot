const sourceId = (row, fallback) => Number(row.source_application_id || fallback);
const memberKey = (source, team, member) => `${Number(source)}:${Number(team)}:${Number(member)}`;

// Only rows targeted by the common input may be replaced. In particular,
// reopening the step loses the local override set, but must not lose a saved
// zero (or salary) of an absent employee, or a row outside the visible roster.
export function updateTeamHours(rows, team, value, overrides, appId) {
    const source = sourceId(team, appId);
    const numeric = value === '' ? null : Number(value);
    if (numeric !== null && !Number.isFinite(numeric)) return rows;
    const members = (team.members || []).filter(m =>
        (m.status || 'available') === 'available'
        && !overrides.has(memberKey(source, team.team_id, m.user_id)));
    const targets = new Set(members.map(m => Number(m.user_id)));
    const isTarget = row => sourceId(row, appId) === source
        && Number(row.team_id) === Number(team.team_id) && targets.has(Number(row.user_id));
    const result = rows.flatMap(row => {
        if (!isTarget(row)) return [row];
        return numeric === null && Number(row.participant_salary || 0) > 0
            ? [{ ...row, hours: 0 }] : [];
    });
    if (numeric === null) return result;
    for (const member of members) {
        const existing = rows.find(row => isTarget(row) && Number(row.user_id) === Number(member.user_id));
        result.push({ ...existing, source_application_id: source, team_id: team.team_id,
            user_id: member.user_id, hours: numeric, participant_salary: existing?.participant_salary ?? 0 });
    }
    return result;
}

export function clearParticipantSalary(row) {
    // A zero-hours row is explicit input, just like a positive-hours row.
    return row ? { ...row, participant_salary: 0 } : null;
}
