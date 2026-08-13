"""Canonical read model for a logical, possibly merged, SMR report."""

from smr_calculations import calculate_smr_totals


def _csv_ints(value) -> set[int]:
    result: set[int] = set()
    for part in str(value or '').split(','):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            result.add(int(part))
    return result


async def _load_application_contexts(db, app_ids: list[int]) -> list[dict]:
    """Load object/roster/plan ownership for every application in an SMR.

    Older unit-test schemas intentionally contain only ``id`` and
    ``smr_group_id``. In that compatibility case the read model still works,
    it simply cannot enrich rows with object ownership.
    """
    if not app_ids:
        return []
    marks = ','.join('?' * len(app_ids))
    try:
        async with db.conn.execute(f"""
            SELECT a.id, a.public_number, a.date_target, a.object_id,
                   a.object_address, a.team_id, a.selected_members,
                   COALESCE(NULLIF(o.name, ''), NULLIF(a.object_address, ''),
                            'Объект ' || a.id) object_name,
                   COALESCE(NULLIF(o.address, ''), NULLIF(a.object_address, ''), '') object_address_clean
            FROM applications a
            LEFT JOIN objects o ON o.id=a.object_id
            WHERE a.id IN ({marks})
            ORDER BY a.id
        """, tuple(app_ids)) as cur:
            contexts = [dict(row) for row in await cur.fetchall()]
    except Exception:
        return []

    try:
        async with db.conn.execute(f"""
            SELECT a.id application_id, okp.kp_id
            FROM applications a
            JOIN object_kp_plan okp ON okp.object_id=a.object_id
            WHERE a.id IN ({marks})
        """, tuple(app_ids)) as cur:
            plan_rows = await cur.fetchall()
    except Exception:
        plan_rows = []

    plans: dict[int, set[int]] = {int(app_id): set() for app_id in app_ids}
    for row in plan_rows:
        plans.setdefault(int(row[0]), set()).add(int(row[1]))
    for context in contexts:
        app_id = int(context['id'])
        context['team_ids'] = _csv_ints(context.get('team_id'))
        context['selected_member_ids'] = _csv_ints(context.get('selected_members'))
        context['kp_ids'] = plans.get(app_id, set())
        context['application_label'] = context.get('public_number') or f'№{app_id}'
    return contexts


def _attach_row_context(rows: list[dict], contexts: list[dict], row_kind: str) -> None:
    """Attach the most precise known object(s) to report rows.

    Main merged rows historically live on the primary application, so their
    storage ``application_id`` is not ownership. Plan works are attributed by
    the object's KP plan; people by each application's selected roster. When
    several applications match, all are listed instead of inventing a split.
    """
    if not contexts:
        return
    by_id = {int(context['id']): context for context in contexts}
    primary_id = min(by_id)

    for row in rows:
        matches: list[dict] = []
        kp_id = int(row.get('kp_id') or 0)
        team_id = int(row.get('team_id') or 0)
        member_id = int(row.get('member_id') or 0)

        if row_kind in ('plan', 'extra') and kp_id:
            matches = [context for context in contexts if kp_id in context['kp_ids']]

        if not matches and row_kind in ('hours', 'extra') and team_id:
            team_matches = [context for context in contexts if team_id in context['team_ids']]
            if row_kind == 'hours' and member_id:
                matches = [
                    context for context in team_matches
                    if not context['selected_member_ids']
                    or member_id in context['selected_member_ids']
                ]
            else:
                matches = team_matches

        # A row stored on a non-primary application predates consolidation
        # and carries useful ownership. A primary row remains ambiguous.
        stored_id = int(row.get('application_id') or 0)
        if not matches and stored_id in by_id and stored_id != primary_id:
            matches = [by_id[stored_id]]
        if not matches:
            matches = contexts

        unique: list[dict] = []
        seen: set[int] = set()
        for context in matches:
            context_id = int(context['id'])
            if context_id not in seen:
                unique.append(context)
                seen.add(context_id)
        row['source_application_ids'] = [int(context['id']) for context in unique]
        row['application_label'] = ' / '.join(str(context['application_label']) for context in unique)
        row['object_name'] = ' / '.join(str(context['object_name']) for context in unique)
        row['object_address'] = ' / '.join(
            str(context.get('object_address_clean') or '') for context in unique
            if context.get('object_address_clean')
        )


async def logical_smr_app_ids(db, app_id: int) -> list[int]:
    async with db.conn.execute("SELECT smr_group_id FROM applications WHERE id = ?", (int(app_id),)) as cur:
        row = await cur.fetchone()
    if not row:
        return []
    if not row[0]:
        return [int(app_id)]
    async with db.conn.execute("SELECT id FROM applications WHERE smr_group_id = ? ORDER BY id", (row[0],)) as cur:
        return [int(r[0]) for r in await cur.fetchall()]


async def get_smr_read_model(db, app_id: int) -> dict:
    app_ids = await logical_smr_app_ids(db, app_id)
    if not app_ids:
        return {}
    marks = ",".join("?" * len(app_ids))
    async with db.conn.execute(f"""
        SELECT akp.id, akp.application_id, akp.kp_id, akp.volume,
               COALESCE(NULLIF(akp.unit, ''), kc.unit, '') unit,
               COALESCE(akp.current_salary, 0) current_salary,
               COALESCE(akp.current_price, 0) current_price,
               akp.team_id, t.name team_name, COALESCE(akp.is_additional, 0) is_additional,
               akp.filled_at, u.fio filled_by_fio, u.role filled_by_role, kc.category, kc.name
        FROM application_kp akp JOIN kp_catalog kc ON kc.id=akp.kp_id
        LEFT JOIN teams t ON t.id=akp.team_id LEFT JOIN users u ON u.user_id=akp.filled_by_user_id
        WHERE akp.application_id IN ({marks}) AND akp.volume>0
        ORDER BY akp.application_id, akp.is_additional, kc.category, kc.name, akp.id
    """, tuple(app_ids)) as cur:
        plan = [dict(r) for r in await cur.fetchall()]
    async with db.conn.execute(f"""
        SELECT e.id, e.application_id, e.kp_id, e.extra_work_id, e.custom_name,
               COALESCE(NULLIF(e.custom_name,''), kc.name, ec.name, '') name,
               COALESCE(NULLIF(e.unit,''), kc.unit, ec.unit, '') unit,
               e.volume, COALESCE(e.salary,0) salary, COALESCE(e.price,0) price,
               e.team_id, t.name team_name, COALESCE(e.is_additional,0) is_additional,
               e.filled_at, u.fio filled_by_fio, u.role filled_by_role
        FROM application_extra_works e LEFT JOIN kp_catalog kc ON kc.id=e.kp_id
        LEFT JOIN extra_works_catalog ec ON ec.id=e.extra_work_id
        LEFT JOIN teams t ON t.id=e.team_id LEFT JOIN users u ON u.user_id=e.filled_by_user_id
        WHERE e.application_id IN ({marks}) AND e.volume>0
        ORDER BY e.application_id, e.is_additional, e.id
    """, tuple(app_ids)) as cur:
        extras = [dict(r) for r in await cur.fetchall()]
    async with db.conn.execute(f"""
        SELECT ah.id, ah.app_id application_id, ah.team_id, t.name team_name,
               ah.user_id member_id, tm.fio, tm.position specialty, ah.hours,
               COALESCE(ah.participant_salary,0) participant_salary,
               COALESCE(ah.is_additional,0) is_additional, ah.filled_at,
               u.fio filled_by_fio, u.role filled_by_role
        FROM application_hours ah LEFT JOIN team_members tm ON tm.id=ah.user_id
        LEFT JOIN teams t ON t.id=ah.team_id LEFT JOIN users u ON u.user_id=ah.filled_by_user_id
        WHERE ah.app_id IN ({marks})
          AND (ah.hours>0 OR COALESCE(ah.participant_salary,0)>0)
        ORDER BY ah.app_id, ah.is_additional, t.name, tm.fio, ah.id
    """, tuple(app_ids)) as cur:
        hours = [dict(r) for r in await cur.fetchall()]
    contexts = await _load_application_contexts(db, app_ids)
    _attach_row_context(plan, contexts, 'plan')
    _attach_row_context(extras, contexts, 'extra')
    _attach_row_context(hours, contexts, 'hours')
    public_contexts = []
    for context in contexts:
        public_contexts.append({
            key: value for key, value in context.items()
            if key not in (
                'team_id', 'selected_members',
                'team_ids', 'selected_member_ids', 'kp_ids',
            )
        })
    return {"application_ids": app_ids, "primary_application_id": app_ids[0],
            "applications": public_contexts,
            "plan_works": plan, "extra_works": extras, "hours": hours,
            "totals": calculate_smr_totals(plan, extras, hours)}
