"""Canonical read model for a logical, possibly merged, SMR report."""

from smr_calculations import calculate_smr_totals


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
               COALESCE(ah.is_additional,0) is_additional, ah.filled_at,
               u.fio filled_by_fio, u.role filled_by_role
        FROM application_hours ah LEFT JOIN team_members tm ON tm.id=ah.user_id
        LEFT JOIN teams t ON t.id=ah.team_id LEFT JOIN users u ON u.user_id=ah.filled_by_user_id
        WHERE ah.app_id IN ({marks}) AND ah.hours>0
        ORDER BY ah.app_id, ah.is_additional, t.name, tm.fio, ah.id
    """, tuple(app_ids)) as cur:
        hours = [dict(r) for r in await cur.fetchall()]
    return {"application_ids": app_ids, "primary_application_id": app_ids[0],
            "plan_works": plan, "extra_works": extras, "hours": hours,
            "totals": calculate_smr_totals(plan, extras, hours)}
