import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import asyncio
import logging

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse, FileResponse
from database_deps import db
from auth_deps import get_current_user, require_role
from urllib.parse import quote
from services.notifications import notify_users
from application_numbers import get_application_number
from smr_calculations import (
    MAX_HOURS_PER_ROW,
    SmrNumberError,
    decimal_value,
    money_value,
)
from smr_audit import (
    build_smr_catalog_reconciliation,
    capture_smr_financial_snapshot,
    record_smr_change,
)

router = APIRouter(tags=["KP"])

_require_office = require_role("superadmin", "boss", "moderator", "hr")
_require_superadmin = require_role("superadmin")


async def _audit_smr_change(
    app_id: int,
    current_user: dict,
    event_type: str,
    before_snapshot: dict,
    *,
    metadata: dict | None = None,
    force: bool = False,
) -> None:
    """Append an immutable financial audit entry without inviting retries.

    The business write may already have committed in legacy repository
    methods. If the audit write fails, alert monitoring and keep the original
    request successful so a user retry cannot duplicate an addendum.
    """
    try:
        await record_smr_change(
            db,
            app_id,
            event_type=event_type,
            actor_user_id=current_user.get("tg_id"),
            actor_role=current_user.get("role", ""),
            actor_name=current_user.get("fio", ""),
            source="api",
            before_snapshot=before_snapshot,
            metadata=metadata or {},
            force=force,
        )
    except Exception as exc:
        logging.exception("Не удалось записать финансовый аудит СМР №%s", app_id)
        try:
            from system_monitoring import notify_system_incident
            asyncio.create_task(notify_system_incident(
                db,
                event_key="smr_audit_failed",
                title="Не записан финансовый аудит СМР",
                component="kp",
                details=f"СМР №{app_id}: {exc}",
            ))
        except Exception:
            pass


@router.get("/api/kp/dashboard")
async def get_kp_dashboard(current_user=Depends(get_current_user)):
    real_tg_id = current_user["tg_id"]
    role = current_user.get('role', 'worker')
    teams = []
    if role in ['worker', 'foreman']:
        async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (real_tg_id,)) as cur:
            teams = [r[0] for r in await cur.fetchall() if r[0]]
    return await db.get_kp_dashboard_apps(real_tg_id, role, teams)


async def _expand_merge_group(app_id: int) -> list[int]:
    """Return the list of application ids that share an SMR merge group
    with ``app_id`` (inclusive). When the app is not merged this is just
    ``[app_id]``. Order: primary (lowest id) first, then ascending.

    A merge group is identified by a shared non-null ``smr_group_id``
    on applications still in the "to_fill" stage (smr_status empty /
    kp_status in none/rejected). Apps that have already advanced are
    never pulled back into the group — we match only on the group id,
    not on status, so the wizard can keep a consistent picture even if
    one app in the group was approved separately.
    """
    if db.conn is None:
        await db.init_db()
    async with db.conn.execute(
        "SELECT smr_group_id FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return [app_id]
    gid = row[0]
    if not gid:
        return [app_id]
    async with db.conn.execute(
        "SELECT id FROM applications WHERE smr_group_id = ? ORDER BY id ASC",
        (gid,),
    ) as cur:
        ids = [r[0] for r in await cur.fetchall()]
    return ids or [app_id]


async def _reset_smr_accounted(app_id: int) -> None:
    """Reset bookkeeping whenever an approved SMR report is changed.

    A merged SMR is one logical report, so touching its primary or any
    secondary application invalidates the marker for the whole group.
    The caller owns the transaction and commits after its data write.
    """
    group_ids = await _expand_merge_group(app_id)
    placeholders = ",".join("?" * len(group_ids))
    await db.conn.execute(
        f"UPDATE applications "
        f"SET smr_accounted_by = NULL, smr_accounted_at = NULL "
        f"WHERE id IN ({placeholders})",
        tuple(group_ids),
    )


async def _require_smr_report_manager(
    app_id: int,
    current_user: dict,
    *,
    completed_only: bool = False,
) -> list[int]:
    """Authorize destructive/edit access to one logical SMR report."""
    role = current_user.get('role', 'worker')
    if role not in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'):
        raise HTTPException(403, "Редактировать отчёт может только прораб или сотрудник офиса")

    group_ids = await _expand_merge_group(app_id)
    marks = ','.join('?' * len(group_ids))
    async with db.conn.execute(
        f"SELECT id, foreman_id, smr_status, kp_status FROM applications "
        f"WHERE id IN ({marks})",
        tuple(group_ids),
    ) as cur:
        rows = [dict(row) for row in await cur.fetchall()]
    if not rows:
        raise HTTPException(404, "Заявка не найдена")
    if role == 'foreman' and not any(
        int(row.get('foreman_id') or 0) == int(current_user.get('tg_id') or 0)
        for row in rows
    ):
        raise HTTPException(403, "Можно редактировать только отчёты своих заявок")
    if completed_only and not any(
        row.get('smr_status') == 'approved' or row.get('kp_status') == 'approved'
        for row in rows
    ):
        raise HTTPException(400, "Отчёт ещё не находится в разделе «Готовые»")
    return group_ids


# ──────────────────────────────────────────────────────────────────────
# v2.7 — ad-hoc worker helpers (Commit 2)
# ──────────────────────────────────────────────────────────────────────

async def _roster_member_keys(group_ids: list[int]) -> set[tuple[int, int]]:
    """Set of (team_id, member_id) that form the SMR's declared roster
    across the merge group. A saved hours row outside this set is an
    AD-HOC worker — someone who wasn't in the application but worked."""
    keys: set[tuple[int, int]] = set()
    for aid in group_ids:
        for t in await db.get_teams_for_app(aid):
            tid = int(t.get('id') or 0)
            for m in t.get('members') or []:
                keys.add((tid, int(m['id'])))
    return keys


async def _current_smr_member_ids(app_id: int) -> set[int]:
    """Every team_members.id already represented in the SMR — declared
    roster plus any saved ad-hoc workers — so the picker can exclude them."""
    group_ids = await _expand_merge_group(app_id)
    ids: set[int] = {mid for _tid, mid in await _roster_member_keys(group_ids)}
    for aid in group_ids:
        # include_additional=True: a member added via доп.отчёт is already in
        # the SMR and must stay excluded from the "add worker" picker.
        for r in await db.get_app_hours(aid, include_additional=True):
            ids.add(int(r['member_id']))
    return ids


async def _guard_adhoc_hours(app_id: int, hours_items: list, role: str) -> list:
    """Enforce that only foreman/office may add ad-hoc workers.

    Any hours row whose (team_id, user_id=member_id) is not part of the
    declared roster is an ad-hoc add. Foreman/office: validated (the member
    must really belong to the team) and kept. Brigadier/worker: hard 403 —
    they cannot add anyone beyond the application roster. Roster rows pass
    through untouched, so the normal path has zero behaviour change.
    """
    group_ids = await _expand_merge_group(app_id)
    roster = await _roster_member_keys(group_ids)
    out = []
    for it in hours_items:
        try:
            tid = int(it.get('team_id'))
            mid = int(it.get('user_id'))
        except (TypeError, ValueError):
            continue
        if (tid, mid) in roster:
            out.append(it)
            continue
        # Out-of-roster → ad-hoc.
        if role in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'):
            if not await db.member_belongs_to_team(mid, tid):
                raise HTTPException(400, "Некорректный сотрудник для бригады")
            out.append(it)
        else:
            raise HTTPException(
                403, "Только прораб может добавлять дополнительных сотрудников"
            )
    return out


@router.get("/api/kp/apps/{app_id}/items")
async def get_app_kp_items(app_id: int, current_user=Depends(get_current_user)):
    # Merge-aware: aggregate plan items across every app in the same
    # SMR merge group so the wizard sees the unified picture.
    group_ids = await _expand_merge_group(app_id)
    items: list[dict] = []
    seen_keys: set = set()
    for aid in group_ids:
        batch = await db.get_app_kp_items(aid)
        for it in batch:
            # v2.9: key by (kp_id, team_id) so per-brigade rows ("По бригадам",
            # team_id NOT NULL) are returned SEPARATELY and never summed across
            # brigades. For common-mode rows (team_id NULL) the key degrades to
            # one-per-kp_id, preserving the original merge-summing behavior.
            kp_key = int(it.get('kp_id') or it.get('id') or 0)
            team_key = it.get('team_id')
            key = (kp_key, team_key)
            if key in seen_keys:
                existing = next(
                    (x for x in items
                     if int(x.get('kp_id') or x.get('id') or 0) == kp_key
                     and x.get('team_id') == team_key),
                    None,
                )
                if existing is not None:
                    try:
                        existing['volume'] = float(existing.get('volume') or 0) + float(it.get('volume') or 0)
                    except (TypeError, ValueError):
                        pass
                    continue
            seen_keys.add(key)
            items.append(it)
    role = current_user.get('role', 'worker')
    # Strip financial data for non-office roles (privacy)
    if role not in ('moderator', 'boss', 'superadmin', 'hr'):
        for item in items:
            item.pop('salary', None)
            item.pop('price', None)
            item.pop('saved_salary', None)
            item.pop('saved_price', None)
    return items


@router.get("/api/kp/apps/{app_id}/smr/summary")
async def get_smr_summary(app_id: int, current_user=Depends(get_current_user)):
    """Authoritative merged SMR details and totals for the UI and exports."""
    from smr_data import get_smr_read_model

    result = await get_smr_read_model(db, app_id)
    if not result:
        raise HTTPException(404, "Заявка не найдена")
    role = current_user.get('role', 'worker')
    is_office = role in ('moderator', 'boss', 'superadmin', 'hr')
    can_view_participant_salary = is_office or role == 'foreman'
    if not is_office:
        if can_view_participant_salary:
            totals = result.get('totals') or {}
            result['totals'] = {
                'hours': totals.get('hours', 0),
                'participant_salary': totals.get('participant_salary', 0),
            }
        else:
            result.pop('totals', None)
        for row in result.get('plan_works', []):
            row.pop('current_salary', None)
            row.pop('current_price', None)
        for row in result.get('extra_works', []):
            row.pop('salary', None)
            row.pop('price', None)
    if not can_view_participant_salary:
        for row in result.get('hours', []):
            row.pop('participant_salary', None)
    return result


# ==========================================
# SMR WIZARD STEP 1 — HOURS
# ==========================================

@router.get("/api/kp/apps/{app_id}/hours")
async def get_app_hours(app_id: int, current_user=Depends(get_current_user)):
    """Hours for an application grouped by team.
    Pre-fills with any previously saved hours. Brigadier sees all teams on
    the application; restriction on WRITE is enforced on POST.

    Merge-aware: when the app is part of an SMR merge group the response
    is the union of teams from every app in the group (deduped by
    team_id). Previously-saved hours are aggregated per (team, member).
    """
    if db.conn is None:
        await db.init_db()
    async with db.conn.execute(
        "SELECT id, date_target FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        app_row = await cur.fetchone()
        if not app_row:
            raise HTTPException(404, "Заявка не найдена")
        report_date = app_row[1] or ''

    def effective_status(member: dict) -> str:
        status = member.get('status') or member.get('member_status') or 'available'
        date_from = member.get('status_from') or ''
        date_until = member.get('status_until') or ''
        if status in ('vacation', 'sick') and report_date:
            if date_from and report_date < date_from:
                return 'available'
            if date_until and report_date > date_until:
                return 'available'
        return status

    group_ids = await _expand_merge_group(app_id)

    # Aggregate saved hours across all apps in the group. Later values
    # win the metadata race (filled_by_fio etc.) — sum the hours.
    by_key: dict[tuple, dict] = {}
    for aid in group_ids:
        for r in await db.get_app_hours(aid):
            key = (int(r['team_id']), int(r['member_id']))
            existing = by_key.get(key)
            if existing is None:
                by_key[key] = dict(r)
            else:
                try:
                    existing['hours'] = float(existing.get('hours') or 0) + float(r.get('hours') or 0)
                    existing['participant_salary'] = (
                        float(existing.get('participant_salary') or 0)
                        + float(r.get('participant_salary') or 0)
                    )
                except (TypeError, ValueError):
                    pass
                # Prefer latest filled_at metadata
                if (r.get('filled_at') or '') > (existing.get('filled_at') or ''):
                    existing['filled_by_fio'] = r.get('filled_by_fio') or existing.get('filled_by_fio') or ''
                    existing['filled_by_role'] = r.get('filled_by_role') or existing.get('filled_by_role') or ''
                    existing['filled_at'] = r.get('filled_at') or existing.get('filled_at') or ''

    # Union of teams across the group — dedupe by team_id.
    seen_teams: set[int] = set()
    teams: list[dict] = []
    for aid in group_ids:
        for t in await db.get_teams_for_app(aid):
            tid = int(t.get('id') or 0)
            if tid in seen_teams:
                continue
            seen_teams.add(tid)
            teams.append(t)

    result = []
    for team in teams:
        members_out = []
        for m in team['members']:
            key = (int(team['id']), int(m['id']))
            saved_row = by_key.get(key, {})
            members_out.append({
                'user_id': m['id'],          # team_members.id — used as "user_id" on write
                'member_id': m['id'],         # explicit alias for clarity on the frontend
                'fio': m.get('fio', ''),
                'specialty': m.get('position', ''),
                'is_foreman': bool(m.get('is_foreman', 0)),
                'is_ad_hoc': False,
                'status': effective_status(m),
                'status_from': m.get('status_from') or '',
                'status_until': m.get('status_until') or '',
                'tg_user_id': m.get('tg_user_id'),
                'hours': float(saved_row.get('hours') or 0),
                'participant_salary': float(saved_row.get('participant_salary') or 0),
                'filled_by_fio': saved_row.get('filled_by_fio') or '',
                'filled_by_role': saved_row.get('filled_by_role') or '',
                'filled_at': saved_row.get('filled_at') or '',
            })
        result.append({
            'team_id': team['id'],
            'team_name': team['name'],
            'team_icon': team.get('icon') or '',
            'is_virtual': False,
            'members': members_out,
        })

    # v2.7 — surface previously-saved AD-HOC workers. These are
    # application_hours rows whose (team_id, member_id) is NOT part of the
    # application's declared roster (team_id list + selected_members). They
    # are reconstructed here so re-opening the wizard shows them; they are
    # NEVER written into applications.team_id/selected_members, so an ad-hoc
    # worker gains no visibility into the SMR (spec decision 2c).
    covered = {(int(t['team_id']), int(m['member_id'])) for t in result for m in t['members']}
    result_by_team = {int(t['team_id']): t for t in result}
    for (tid, mid), row in by_key.items():
        if (tid, mid) in covered:
            continue
        member_entry = {
            'user_id': mid,
            'member_id': mid,
            'fio': row.get('fio', ''),
            'specialty': row.get('specialty', ''),
            'is_foreman': False,
            'is_ad_hoc': True,
            'status': effective_status(row),
            'status_from': row.get('status_from') or '',
            'status_until': row.get('status_until') or '',
            'tg_user_id': row.get('tg_user_id'),
            'hours': float(row.get('hours') or 0),
            'participant_salary': float(row.get('participant_salary') or 0),
            'filled_by_fio': row.get('filled_by_fio') or '',
            'filled_by_role': row.get('filled_by_role') or '',
            'filled_at': row.get('filled_at') or '',
        }
        existing_team = result_by_team.get(tid)
        if existing_team is not None:
            # Ad-hoc worker attached to a brigade already on the application.
            existing_team['members'].append(member_entry)
        else:
            # Brigade not on the application → virtual brigade with one worker.
            virt = {
                'team_id': tid,
                'team_name': row.get('team_name') or f'Бригада {tid}',
                'team_icon': row.get('team_icon') or '',
                'is_virtual': True,
                'members': [member_entry],
            }
            result.append(virt)
            result_by_team[tid] = virt

    # v2.7 — brigadier/worker scope: only their own brigade(s) are returned.
    # Other brigades on the application are not sent over the wire, so the
    # picker physically cannot show them (foreman/office scope unchanged).
    role = current_user.get('role', 'worker')
    if role in ('brigadier', 'worker'):
        my_team_ids = set(await db.get_user_team_ids(current_user['tg_id']))
        result = [t for t in result if int(t['team_id']) in my_team_ids]

    if role not in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'):
        for team in result:
            for member in team.get('members') or []:
                member.pop('participant_salary', None)

    return result


@router.get("/api/kp/apps/{app_id}/available_workers")
async def get_available_workers(app_id: int, current_user=Depends(get_current_user)):
    """v2.7 — candidate workers for the foreman's "add ad-hoc worker" picker.

    Foreman / office only. Lists brigade members (excluding drivers,
    superadmins, and anyone already in the SMR), each carrying their
    brigade so the frontend can append them under the right team — or, if
    that brigade isn't on the application, create a virtual brigade entry.
    """
    role = current_user.get('role', 'worker')
    if role not in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'):
        raise HTTPException(403, "Только прораб может добавлять дополнительных сотрудников")
    if db.conn is None:
        await db.init_db()
    async with db.conn.execute(
        "SELECT id FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Заявка не найдена")
    exclude = await _current_smr_member_ids(app_id)
    return await db.get_adhoc_candidate_members(exclude)


@router.post("/api/kp/apps/{app_id}/hours")
async def save_app_hours_endpoint(app_id: int, request: Request, current_user=Depends(get_current_user)):
    """Upsert hours for an application.
    Body: {"items": [{"team_id": int, "user_id": int (team_members.id), "hours": number}, ...]}
    Brigadier scope: may only save hours for teams where they are a member.
    """
    data = await request.json()
    items = data.get('items') or []

    if db.conn is None:
        await db.init_db()
    async with db.conn.execute(
        "SELECT id FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Заявка не найдена")
    before_snapshot = await capture_smr_financial_snapshot(db, app_id)

    role = current_user.get('role', 'worker')
    tg_id = current_user['tg_id']

    # v2.7 — only foreman/office may add ad-hoc workers (raises 403 for a
    # brigadier who tries). Roster rows pass through unchanged.
    items = await _guard_adhoc_hours(app_id, items, role)

    if role in ('worker', 'driver', 'brigadier'):
        user_team_ids = set(await db.get_user_team_ids(tg_id))
        if not user_team_ids:
            raise HTTPException(403, "Вы не состоите ни в одной бригаде")
        filtered = []
        for it in items:
            try:
                tid = int(it.get('team_id'))
            except (TypeError, ValueError):
                continue
            if tid in user_team_ids:
                filtered.append(it)
        items = filtered

    await db.save_app_hours(
        app_id,
        items,
        tg_id,
        allow_participant_salary=role in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'),
    )
    await _reset_smr_accounted(app_id)
    await db.conn.commit()
    await _audit_smr_change(app_id, current_user, "hours_updated", before_snapshot)
    return {"status": "ok", "saved": len(items)}


# ==========================================
# SMR WIZARD — UNIFIED SUBMIT + REVIEW + GROUPED LIST
# ==========================================

@router.post("/api/kp/apps/{app_id}/smr/submit")
async def submit_smr_report(app_id: int, request: Request, current_user=Depends(get_current_user)):
    """Unified SMR submit.
    Body: {
      hours: [{team_id, user_id (member_id), hours}, ...],
      works: [{kp_id, volume}, ...],
      extra_works: [{kp_id, volume}, ...]
    }
    Role logic:
      foreman+ → smr_status = 'approved'  (straight to Готовые)
      brigadier → smr_status = 'pending_review'
    """
    import asyncio
    import uuid as _uuid
    from datetime import datetime as _dt

    data = await request.json()
    tg_id = current_user['tg_id']
    role = current_user.get('role', 'worker')

    if db.conn is None:
        await db.init_db()

    async with db.conn.execute(
        "SELECT id, foreman_id, smr_group_id, team_id FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        app_row = await cur.fetchone()
    if not app_row:
        raise HTTPException(404, "Заявка не найдена")
    before_snapshot = await capture_smr_financial_snapshot(db, app_id)

    group_ids = await _expand_merge_group(app_id)
    if app_id not in group_ids:
        group_ids.append(app_id)
    group_ids = sorted(set(group_ids))
    write_app_id = group_ids[0]

    # Brigadier scope: filter hours to their own teams (v2.7 hard block —
    # an unattached brigadier cannot submit SMR at all).
    user_team_ids = None
    if role in ('brigadier', 'worker'):
        user_team_ids = set(await db.get_user_team_ids(tg_id))
        if not user_team_ids:
            raise HTTPException(403, "Вы не привязаны ни к одной бригаде. Обратитесь к администратору.")

    # 1. Hours
    hours_items = data.get('hours') or []
    # v2.7 — only foreman/office may add ad-hoc workers. Run BEFORE the
    # brigadier team-filter so a brigadier hitting the backend directly
    # with an out-of-roster worker gets a 403 rather than a silent drop.
    hours_items = await _guard_adhoc_hours(app_id, hours_items, role)
    if user_team_ids is not None:
        hours_items = [h for h in hours_items if int(h.get('team_id') or 0) in user_team_ids]
    if hours_items:
        hours_scope = _compute_write_scope(role, user_team_ids, hours_items)
        await _clear_group_main_rows('application_hours', 'app_id', group_ids, hours_scope)
        await db.save_app_hours(
            write_app_id,
            hours_items,
            tg_id,
            allow_participant_salary=role in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'),
        )

    # 2. Plan works — D4 team scope + D2/D3 scoped, non-destructive write.
    # Use key-presence (not truthiness) so an explicit empty list clears the
    # caller's owned buckets (D7); the wizard always sends all three keys.
    if 'works' in data:
        works = data.get('works') or []
        if user_team_ids is not None:
            # brigadier/worker: only their own teams (mirror of the hours
            # filter above). A row with no/0 team_id (common) is dropped.
            works = [w for w in works if int(w.get('team_id') or 0) in user_team_ids]
        scope = _compute_write_scope(role, user_team_ids, works)
        await _clear_group_main_rows('application_kp', 'application_id', group_ids, scope)
        await db.submit_kp_report(write_app_id, works, role, filled_by_user_id=tg_id, team_scope=scope)

    # 3. Extra works — same D4 scope + scoped, non-destructive delete.
    if 'extra_works' in data:
        extras = data.get('extra_works') or []
        if user_team_ids is not None:
            extras = [e for e in extras if int(e.get('team_id') or 0) in user_team_ids]
        scope = _compute_write_scope(role, user_team_ids, extras)
        await _clear_group_main_rows('application_extra_works', 'application_id', group_ids, scope)
        await _save_extra_works_inline(write_app_id, extras, tg_id, role, team_scope=scope)

    # 4. Group + status — cascade to every app in the merge group so a
    # single wizard pass marks them all pending/approved together.
    group_id = dict(app_row).get('smr_group_id') or _uuid.uuid4().hex[:12]
    if role in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'):
        smr_status = 'approved'
        smr_role = 'foreman'
        new_kp_status = 'approved'
    else:
        smr_status = 'pending_review'
        smr_role = 'brigadier'
        new_kp_status = 'submitted'

    placeholders = ",".join("?" * len(group_ids))
    await db.conn.execute(
        f"UPDATE applications SET smr_group_id = ?, smr_status = ?, "
        f"smr_filled_by_role = ?, kp_status = ?, "
        f"smr_accounted_by = NULL, smr_accounted_at = NULL "
        f"WHERE id IN ({placeholders})",
        (group_id, smr_status, smr_role, new_kp_status, *group_ids),
    )
    await db.conn.commit()

    await _audit_smr_change(
        app_id,
        current_user,
        "smr_submitted",
        before_snapshot,
        metadata={"result_status": smr_status},
    )

    fio = current_user.get('fio', '')
    app_number = await get_application_number(db, app_id)
    await db.add_log(
        tg_id, fio,
        f"СМР отправлен ({smr_role}) по заявке {app_number}",
        target_type='smr', target_id=app_id,
    )

    # Notify the foreman when a brigadier submits
    if smr_status == 'pending_review':
        foreman_id = app_row['foreman_id']
        if foreman_id and foreman_id != tg_id:
            try:
                from services.notifications import notify_users
                asyncio.create_task(notify_users(
                    [],
                    f"🔧 Бригадир {fio or ''} заполнил СМР по заявке {app_number}. Требуется проверка.",
                    'kp', extra_tg_ids=[foreman_id], category='reports',
                    event_key='smr_submitted',
                ))
            except Exception:
                pass

    return {"status": "ok", "smr_status": smr_status, "smr_group_id": group_id}


def _team_scope_where(team_scope):
    """NULL-aware SQL fragment + params for a (concrete_team_ids,
    include_common) authoritative write scope, to be ANDed after
    ``application_id = ?``. An empty scope returns ('0', []) so the DELETE
    matches nothing (never a bare ``IN ()``)."""
    concrete, include_common = team_scope
    parts, params = [], []
    ids = sorted({int(t) for t in (concrete or set())})
    if ids:
        parts.append(f"team_id IN ({','.join('?' * len(ids))})")
        params.extend(ids)
    if include_common:
        parts.append("team_id IS NULL")
    if not parts:
        return "0", []
    return "(" + " OR ".join(parts) + ")", params


def _compute_write_scope(role, user_team_ids, items):
    """Authoritative team buckets a submit may delete+replace (D2/D3/D4).

    Returns (concrete_team_ids: set[int], include_common: bool):
      - brigadier/worker: exactly their own teams, never the common (NULL)
        bucket. Independent of the payload, so clearing a section still
        deletes their owned rows (D7).
      - foreman/office: the concrete teams present in the payload PLUS the
        common (NULL) bucket. Non-destructive — brigades absent from the
        payload survive. This is the prerequisite for the additional-report
        feature: an additional report writes into its own scope and must not
        wipe the main report.

    D12 (deferred, NOT done here): the writers still restamp
    filled_by_user_id / filled_at on every re-inserted row. Brigadier/worker
    now only touch their own buckets, but a foreman re-inserting a
    brigadier's bucket on review still restamps it. Preserving per-row
    authorship is a follow-up commit.
    """
    if role in ('brigadier', 'worker'):
        return {int(t) for t in (user_team_ids or set())}, False
    concrete = set()
    for it in (items or []):
        try:
            tid = int(it.get('team_id') or 0)
        except (TypeError, ValueError):
            tid = 0
        if tid:
            concrete.add(tid)
    return concrete, True


async def _clear_group_main_rows(table: str, app_column: str, group_ids: list[int], team_scope) -> None:
    """Clear an authoritative main-report scope across a merge group.

    Replacements are written to the primary application. Clearing all group
    members first prevents old secondary rows from being added a second time
    on the next merged read.
    """
    if not group_ids:
        return
    allowed = {
        ('application_hours', 'app_id'),
        ('application_kp', 'application_id'),
        ('application_extra_works', 'application_id'),
    }
    if (table, app_column) not in allowed:
        raise ValueError('Unsupported SMR table')
    app_marks = ','.join('?' * len(group_ids))
    team_clause, team_params = _team_scope_where(team_scope)
    await db.conn.execute(
        f"DELETE FROM {table} WHERE {app_column} IN ({app_marks}) "
        f"AND COALESCE(is_additional, 0) = 0 AND {team_clause}",
        (*group_ids, *team_params),
    )


async def _save_extra_works_inline(app_id: int, items: list, tg_id: int, role: str, team_scope=None):
    """Minimal inline port of /api/kp/apps/{id}/extra_works/submit logic
    so the wizard's unified submit can batch everything in one call."""
    from datetime import datetime as _dt
    import json as _json

    # Batch-load kp_catalog entries for the referenced ids
    kp_ids = []
    for it in items:
        try:
            kid = int(it.get('kp_id') or 0)
            if kid > 0:
                kp_ids.append(kid)
        except (TypeError, ValueError):
            pass
    catalog = {}
    if kp_ids:
        pl = ",".join("?" * len(kp_ids))
        async with db.conn.execute(
            f"SELECT id, name, unit, salary, price FROM kp_catalog WHERE id IN ({pl})", kp_ids
        ) as cur:
            for r in await cur.fetchall():
                catalog[int(r[0])] = {
                    'name': r[1] or '',
                    'unit': (r[2] or '').strip(),
                    'salary': float(r[3]) if r[3] is not None else 0.0,
                    'price': float(r[4]) if r[4] is not None else 0.0,
                }

    legacy_ids = []
    for it in items:
        try:
            legacy_id = int(it.get('extra_work_id') or 0)
            if legacy_id > 0:
                legacy_ids.append(legacy_id)
        except (TypeError, ValueError):
            pass
    legacy_catalog = {}
    if legacy_ids:
        pl = ",".join("?" * len(legacy_ids))
        async with db.conn.execute(
            f"SELECT id, name, unit, salary, price FROM extra_works_catalog WHERE id IN ({pl})",
            legacy_ids,
        ) as cur:
            for r in await cur.fetchall():
                legacy_catalog[int(r[0])] = {
                    'name': r[1] or '',
                    'unit': (r[2] or '').strip(),
                    'salary': float(r[3]) if r[3] is not None else 0.0,
                    'price': float(r[4]) if r[4] is not None else 0.0,
                }

    unknown_kp_ids = sorted(set(kp_ids) - set(catalog))
    unknown_legacy_ids = sorted(set(legacy_ids) - set(legacy_catalog))
    if unknown_kp_ids or unknown_legacy_ids:
        raise SmrNumberError(
            "Дополнительная работа отсутствует в текущем справочнике"
        )
    for it in items:
        if not int(it.get('kp_id') or 0) and not int(it.get('extra_work_id') or 0):
            if role not in ('moderator', 'boss', 'superadmin', 'hr'):
                raise SmrNumberError("Произвольную доп. работу должен добавить сотрудник офиса")
            if not (it.get('custom_name') or '').strip():
                raise SmrNumberError("Укажите название произвольной доп. работы")
            money_value(it.get('salary'), field='Расценка ЗП')
            money_value(it.get('price'), field='Цена')

    # v2.10 (D2): scope the DELETE to the caller's authoritative team buckets
    # (NULL-aware) instead of wiping every brigade's extras. team_scope=None
    # falls back to the legacy blanket delete for any old caller.
    # v2.10 доп.отчёт: AND is_additional = 0 so a MAIN re-submit NEVER deletes
    # addendum extras (is_additional=1).
    if team_scope is None:
        await db.conn.execute(
            "DELETE FROM application_extra_works WHERE application_id = ? AND is_additional = 0",
            (app_id,),
        )
    else:
        _clause, _sparams = _team_scope_where(team_scope)
        await db.conn.execute(
            f"DELETE FROM application_extra_works WHERE application_id = ? AND is_additional = 0 AND {_clause}",
            (app_id, *_sparams),
        )
    now = _dt.now().isoformat(timespec='seconds')
    for it in items:
        volume = float(decimal_value(it.get('volume'), field='Объём доп. работы'))
        if volume <= 0:
            continue
        kp_id = None
        try:
            kp_id = int(it.get('kp_id') or 0) or None
        except (TypeError, ValueError):
            kp_id = None

        if kp_id and kp_id in catalog:
            meta = catalog[kp_id]
            custom_name, unit = meta['name'], meta['unit']
            salary, price = meta['salary'], meta['price']
            extra_work_id = 0
        else:
            extra_work_id = int(it.get('extra_work_id') or 0)
            legacy_meta = legacy_catalog.get(extra_work_id)
            if legacy_meta:
                custom_name = legacy_meta['name']
                unit = legacy_meta['unit']
                salary = legacy_meta['salary']
                price = legacy_meta['price']
            else:
                custom_name = (it.get('custom_name') or '').strip()
                unit = (it.get('unit') or '').strip()
                # A truly custom row has no trusted catalog source. Only
                # finance-capable roles may define its snapshots.
                if role in ('moderator', 'boss', 'superadmin', 'hr'):
                    salary = float(money_value(it.get('salary'), field='Расценка ЗП'))
                    price = float(money_value(it.get('price'), field='Цена'))
                else:
                    salary = price = 0.0

        # v2.4.3: optional per-team tag for per-brigade mode
        try:
            team_id_raw = it.get('team_id')
            team_id = int(team_id_raw) if team_id_raw else None
            if team_id == 0:
                team_id = None
        except (TypeError, ValueError):
            team_id = None
        await db.conn.execute(
            """INSERT INTO application_extra_works
               (application_id, extra_work_id, kp_id, custom_name, unit, volume,
                salary, price, filled_by_user_id, filled_at, team_id, is_additional)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
            (app_id, extra_work_id, kp_id, custom_name, unit, volume, salary, price, tg_id, now, team_id),
        )
    await db.conn.commit()


# ──────────────────────────────────────────────────────────────────────
# v2.10 — ADDITIONAL REPORT (доп.отчёт): pure-INSERT addenda, no delete.
# Each save appends is_additional=1 rows that accumulate across calls and
# never touch the main report or earlier addenda.
# ──────────────────────────────────────────────────────────────────────

async def _insert_additional_kp(app_id: int, items: list, tg_id: int, now: str) -> int:
    """Append plan-work addendum rows (is_additional=1). No DELETE, no status
    change. Unit/salary/price looked up from kp_catalog server-side."""
    kp_ids = [int(i['kp_id']) for i in items if int(i.get('kp_id') or 0) > 0]
    lookup: dict[int, dict] = {}
    if kp_ids:
        pl = ",".join("?" * len(kp_ids))
        async with db.conn.execute(
            f"SELECT id, unit, salary, price FROM kp_catalog WHERE id IN ({pl})", kp_ids
        ) as cur:
            for r in await cur.fetchall():
                lookup[int(r[0])] = {
                    'unit': (r[1] or '').strip(),
                    'salary': float(r[2]) if r[2] is not None else 0.0,
                    'price': float(r[3]) if r[3] is not None else 0.0,
                }
    unknown_kp_ids = sorted(set(kp_ids) - set(lookup))
    if unknown_kp_ids:
        raise SmrNumberError("Работа отсутствует в текущем справочнике")
    n = 0
    for item in items:
        try:
            volume = float(decimal_value(item.get('volume'), field='Объём работы'))
        except (TypeError, ValueError):
            raise
        if volume <= 0:
            continue
        kp_id = int(item.get('kp_id') or 0)
        if not kp_id:
            continue
        meta = lookup.get(kp_id, {'unit': '', 'salary': 0.0, 'price': 0.0})
        try:
            team_id_raw = item.get('team_id')
            team_id = int(team_id_raw) if team_id_raw else None
            if team_id == 0:
                team_id = None
        except (TypeError, ValueError):
            team_id = None
        await db.conn.execute(
            """INSERT INTO application_kp
               (application_id, kp_id, volume, unit, current_salary, current_price,
                filled_by_user_id, filled_at, team_id, is_additional)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (app_id, kp_id, volume, meta['unit'], meta['salary'], meta['price'], tg_id, now, team_id),
        )
        n += 1
    return n


async def _insert_additional_extras(app_id: int, items: list, tg_id: int, role: str, now: str) -> int:
    """Append extra-work addendum rows (is_additional=1). No DELETE."""
    kp_ids = []
    for it in items:
        try:
            kid = int(it.get('kp_id') or 0)
            if kid > 0:
                kp_ids.append(kid)
        except (TypeError, ValueError):
            pass
    catalog: dict = {}
    if kp_ids:
        pl = ",".join("?" * len(kp_ids))
        async with db.conn.execute(
            f"SELECT id, name, unit, salary, price FROM kp_catalog WHERE id IN ({pl})", kp_ids
        ) as cur:
            for r in await cur.fetchall():
                catalog[int(r[0])] = {
                    'name': r[1] or '',
                    'unit': (r[2] or '').strip(),
                    'salary': float(r[3]) if r[3] is not None else 0.0,
                    'price': float(r[4]) if r[4] is not None else 0.0,
                }
    legacy_ids = []
    for it in items:
        try:
            legacy_id = int(it.get('extra_work_id') or 0)
            if legacy_id > 0:
                legacy_ids.append(legacy_id)
        except (TypeError, ValueError):
            pass
    legacy_catalog = {}
    if legacy_ids:
        pl = ",".join("?" * len(legacy_ids))
        async with db.conn.execute(
            f"SELECT id,name,unit,salary,price FROM extra_works_catalog WHERE id IN ({pl})",
            legacy_ids,
        ) as cur:
            for r in await cur.fetchall():
                legacy_catalog[int(r[0])] = {
                    'name': r[1] or '', 'unit': (r[2] or '').strip(),
                    'salary': float(r[3] or 0), 'price': float(r[4] or 0),
                }
    if set(kp_ids) - set(catalog) or set(legacy_ids) - set(legacy_catalog):
        raise SmrNumberError("Дополнительная работа отсутствует в текущем справочнике")
    n = 0
    for it in items:
        try:
            volume = float(decimal_value(it.get('volume'), field='Объём доп. работы'))
        except (TypeError, ValueError):
            raise
        if volume <= 0:
            continue
        try:
            kp_id = int(it.get('kp_id') or 0) or None
        except (TypeError, ValueError):
            kp_id = None
        if kp_id and kp_id in catalog:
            meta = catalog[kp_id]
            custom_name, unit = meta['name'], meta['unit']
            salary, price = meta['salary'], meta['price']
            extra_work_id = 0
        else:
            extra_work_id = int(it.get('extra_work_id') or 0)
            legacy_meta = legacy_catalog.get(extra_work_id)
            if legacy_meta:
                custom_name, unit = legacy_meta['name'], legacy_meta['unit']
                salary, price = legacy_meta['salary'], legacy_meta['price']
            elif role in ('moderator', 'boss', 'superadmin', 'hr'):
                custom_name = (it.get('custom_name') or '').strip()
                unit = (it.get('unit') or '').strip()
                if not custom_name:
                    raise SmrNumberError("Укажите название произвольной доп. работы")
                salary = float(money_value(it.get('salary'), field='Расценка ЗП'))
                price = float(money_value(it.get('price'), field='Цена'))
            else:
                raise SmrNumberError("Произвольную доп. работу должен добавить сотрудник офиса")
        try:
            team_id_raw = it.get('team_id')
            team_id = int(team_id_raw) if team_id_raw else None
            if team_id == 0:
                team_id = None
        except (TypeError, ValueError):
            team_id = None
        await db.conn.execute(
            """INSERT INTO application_extra_works
               (application_id, extra_work_id, kp_id, custom_name, unit, volume,
                salary, price, filled_by_user_id, filled_at, team_id, is_additional)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (app_id, extra_work_id, kp_id, custom_name, unit, volume, salary, price, tg_id, now, team_id),
        )
        n += 1
    return n


async def _insert_additional_hours(
    app_id: int, items: list, tg_id: int, now: str, *, allow_participant_salary: bool = False
) -> int:
    """Append hours addendum rows (is_additional=1). PLAIN INSERT (no upsert):
    the partial unique index permits duplicate (app,team,user) when
    is_additional=1, so extra hours for an existing member accumulate."""
    n = 0
    for it in items:
        try:
            team_id = int(it['team_id'])
            member_id = int(it['user_id'])
            hours = float(decimal_value(
                it.get('hours'), field='Часы', maximum=MAX_HOURS_PER_ROW
            ))
        except (KeyError, TypeError, ValueError) as exc:
            from smr_calculations import SmrNumberError
            raise SmrNumberError('Часы: передано некорректное значение') from exc
        participant_salary = float(money_value(
            it.get('participant_salary'), field='ЗП участника'
        )) if allow_participant_salary else 0.0
        if hours <= 0 and participant_salary <= 0:
            continue
        await db.conn.execute(
            """INSERT INTO application_hours
               (app_id, team_id, user_id, hours, participant_salary,
                filled_by_user_id, filled_at, is_additional)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
            (app_id, team_id, member_id, hours, participant_salary, tg_id, now),
        )
        n += 1
    return n


@router.post("/api/kp/apps/{app_id}/smr/additional")
async def submit_additional_report(app_id: int, request: Request, current_user=Depends(get_current_user)):
    """Доп.отчёт — add forgotten works/extras/hours to an EXISTING report.

    Body: {hours?, works?, extra_works?} (same shape as /smr/submit). Every
    row is a PURE INSERT with is_additional=1 — NO delete of any kind — so
    multiple addenda accumulate and the main report is never touched.
    Roles: foreman + brigadier (own brigade only) + office.
    """
    from datetime import datetime as _dt

    role = current_user.get('role', 'worker')
    if role not in ('brigadier', 'foreman', 'moderator', 'boss', 'superadmin', 'hr'):
        raise HTTPException(403, "Нет прав для создания доп. отчёта")

    data = await request.json()
    tg_id = current_user['tg_id']

    if db.conn is None:
        await db.init_db()
    async with db.conn.execute(
        "SELECT id FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Заявка не найдена")
    before_snapshot = await capture_smr_financial_snapshot(db, app_id)

    # Brigadier/worker: own teams only (INPUT filter; there is NO scoped
    # delete on this path — addenda are pure inserts).
    user_team_ids = None
    if role in ('brigadier', 'worker'):
        user_team_ids = set(await db.get_user_team_ids(tg_id))
        if not user_team_ids:
            raise HTTPException(403, "Вы не привязаны ни к одной бригаде. Обратитесь к администратору.")

    now = _dt.now().isoformat(timespec='seconds')
    n_works = n_extras = n_hours = 0
    group_ids = await _expand_merge_group(app_id)
    write_app_id = group_ids[0] if group_ids else app_id

    works = data.get('works') or []
    if user_team_ids is not None:
        works = [w for w in works if int(w.get('team_id') or 0) in user_team_ids]
    if works:
        n_works = await _insert_additional_kp(write_app_id, works, tg_id, now)

    extras = data.get('extra_works') or []
    if user_team_ids is not None:
        extras = [e for e in extras if int(e.get('team_id') or 0) in user_team_ids]
    if extras:
        n_extras = await _insert_additional_extras(write_app_id, extras, tg_id, role, now)

    hours_items = data.get('hours') or []
    # Same ad-hoc guard as the main submit: a brigadier cannot inject a
    # worker outside the roster; a foreman's ad-hoc member is validated.
    hours_items = await _guard_adhoc_hours(app_id, hours_items, role)
    if user_team_ids is not None:
        hours_items = [h for h in hours_items if int(h.get('team_id') or 0) in user_team_ids]
    if hours_items:
        n_hours = await _insert_additional_hours(
            write_app_id,
            hours_items,
            tg_id,
            now,
            allow_participant_salary=role in ('foreman', 'moderator', 'boss', 'superadmin', 'hr'),
        )

    # Any non-empty addendum means the external office program may be stale.
    if n_works or n_extras or n_hours:
        await _reset_smr_accounted(app_id)
    await db.conn.commit()
    await _audit_smr_change(
        app_id,
        current_user,
        "smr_addendum_created",
        before_snapshot,
        metadata={"works": n_works, "extra_works": n_extras, "hours": n_hours},
    )

    fio = current_user.get('fio', '')
    app_number = await get_application_number(db, app_id)
    await db.add_log(
        tg_id, fio,
        f"Доп. отчёт СМР по заявке {app_number} "
        f"(работ: {n_works}, доп: {n_extras}, часов: {n_hours})",
        target_type='smr', target_id=app_id,
    )
    if n_works or n_extras or n_hours:
        marks = ','.join('?' * len(group_ids))
        async with db.conn.execute(
            f"SELECT DISTINCT foreman_id FROM applications WHERE id IN ({marks})",
            tuple(group_ids),
        ) as cur:
            foreman_ids = [int(r[0]) for r in await cur.fetchall() if r[0] and int(r[0]) != int(tg_id)]
        asyncio.create_task(notify_users(
            ["moderator", "boss", "superadmin", "hr"],
            f"➕ <b>Добавлен доп. отчёт СМР по заявке {app_number}</b>\n👤 {fio or 'Пользователь'}\n"
            f"Работ: {n_works} · Доп. работ: {n_extras} · Записей часов: {n_hours}",
            "kp", extra_tg_ids=foreman_ids, category="reports", event_key="smr_addendum",
        ))
    return {"status": "ok", "works": n_works, "extra_works": n_extras, "hours": n_hours}


@router.post("/api/kp/apps/{app_id}/smr/review")
async def review_smr(app_id: int, request: Request, current_user=Depends(get_current_user)):
    """Foreman reviews a brigadier's SMR submission.
    Body: {action: 'approve' | 'edit', hours?, works?, extra_works?}"""
    data = await request.json()
    action = data.get('action', 'approve')
    ready_edit = bool(data.get('ready_edit', False))
    tg_id = current_user['tg_id']
    role = current_user.get('role')
    group_ids = await _require_smr_report_manager(
        app_id, current_user, completed_only=ready_edit
    )
    write_app_id = group_ids[0] if group_ids else app_id
    before_snapshot = (
        await capture_smr_financial_snapshot(db, app_id)
        if action == 'edit' else {}
    )

    if action == 'edit' and ready_edit:
        # A ready-report edit is an authoritative replacement of the MAIN
        # report. Additional reports stay intact and can still be cleared by
        # the dedicated full-clear action. Keep replacement atomic so invalid
        # input cannot leave a half-erased report.
        await db.conn.execute("SAVEPOINT edit_completed_smr")
        try:
            marks = ','.join('?' * len(group_ids))
            for table, column in (
                ('application_hours', 'app_id'),
                ('application_kp', 'application_id'),
                ('application_extra_works', 'application_id'),
            ):
                await db.conn.execute(
                    f"DELETE FROM {table} WHERE {column} IN ({marks}) "
                    f"AND COALESCE(is_additional, 0) = 0",
                    tuple(group_ids),
                )

            hours = await _guard_adhoc_hours(app_id, data.get('hours') or [], role)
            if hours:
                await db.save_app_hours(
                    write_app_id,
                    hours,
                    tg_id,
                    allow_participant_salary=True,
                    commit=False,
                )
            works = data.get('works') or []
            await db.submit_kp_report(
                write_app_id,
                works,
                role,
                filled_by_user_id=tg_id,
                team_scope=_compute_write_scope(role, None, works),
                commit=False,
            )
            extras = data.get('extra_works') or []
            await _save_extra_works_inline(
                write_app_id,
                extras,
                tg_id,
                role,
                team_scope=_compute_write_scope(role, None, extras),
            )
            await _reset_smr_accounted(app_id)
            marks = ','.join('?' * len(group_ids))
            await db.conn.execute(
                f"UPDATE applications SET smr_status = 'approved', kp_status = 'approved' "
                f"WHERE id IN ({marks})",
                tuple(group_ids),
            )
            await db.conn.execute("RELEASE SAVEPOINT edit_completed_smr")
            await db.conn.commit()
        except Exception:
            await db.conn.execute("ROLLBACK TO SAVEPOINT edit_completed_smr")
            await db.conn.execute("RELEASE SAVEPOINT edit_completed_smr")
            await db.conn.rollback()
            raise
    elif action == 'edit':
        # Reviewer is foreman+ (role-gated above), so the write scope is the
        # payload's concrete teams plus the common bucket — non-destructive
        # toward brigades not present in this review payload.
        hours = await _guard_adhoc_hours(app_id, data.get('hours') or [], role)
        if hours:
            hours_scope = _compute_write_scope(role, None, hours)
            await _clear_group_main_rows('application_hours', 'app_id', group_ids, hours_scope)
            await db.save_app_hours(
                write_app_id,
                hours,
                tg_id,
                allow_participant_salary=True,
            )
        if 'works' in data:
            works = data.get('works') or []
            scope = _compute_write_scope(role, None, works)
            await _clear_group_main_rows('application_kp', 'application_id', group_ids, scope)
            await db.submit_kp_report(write_app_id, works, role, filled_by_user_id=tg_id, team_scope=scope)
        if 'extra_works' in data:
            extras = data.get('extra_works') or []
            scope = _compute_write_scope(role, None, extras)
            await _clear_group_main_rows('application_extra_works', 'application_id', group_ids, scope)
            await _save_extra_works_inline(write_app_id, extras, tg_id, role, team_scope=scope)
        await _reset_smr_accounted(app_id)

    if not (action == 'edit' and ready_edit):
        marks = ','.join('?' * len(group_ids))
        await db.conn.execute(
            f"UPDATE applications SET smr_status = 'approved', kp_status = 'approved' WHERE id IN ({marks})",
            tuple(group_ids),
        )
        await db.conn.commit()
    if action == 'edit':
        await _audit_smr_change(
            app_id,
            current_user,
            "smr_ready_edited" if ready_edit else "smr_review_edited",
            before_snapshot,
        )

    fio = current_user.get('fio', '')
    await db.add_log(
        tg_id, fio,
        f"{'Отредактировал готовый' if ready_edit else ('Одобрил с правками' if action == 'edit' else 'Одобрил')} СМР по заявке №{app_id}",
        target_type='smr', target_id=app_id,
    )
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/smr/clear")
async def clear_completed_smr_report(
    app_id: int,
    current_user=Depends(get_current_user),
):
    """Delete all report rows and return the logical application to «К заполнению».

    The application itself, its merge group and append-only financial history
    remain intact. Main and additional report rows are both removed.
    """
    if db.conn is None:
        await db.init_db()
    group_ids = await _require_smr_report_manager(
        app_id, current_user, completed_only=True
    )
    before_snapshot = await capture_smr_financial_snapshot(db, app_id)
    marks = ','.join('?' * len(group_ids))
    deleted = {'hours': 0, 'works': 0, 'extra_works': 0}

    await db.conn.execute("SAVEPOINT clear_completed_smr")
    try:
        for table, column, key in (
            ('application_hours', 'app_id', 'hours'),
            ('application_kp', 'application_id', 'works'),
            ('application_extra_works', 'application_id', 'extra_works'),
        ):
            cursor = await db.conn.execute(
                f"DELETE FROM {table} WHERE {column} IN ({marks})",
                tuple(group_ids),
            )
            deleted[key] = max(int(cursor.rowcount or 0), 0)
        await db.conn.execute(
            f"UPDATE applications SET smr_status = NULL, kp_status = NULL, "
            f"smr_filled_by_role = NULL, smr_accounted_by = NULL, "
            f"smr_accounted_at = NULL WHERE id IN ({marks})",
            tuple(group_ids),
        )
        await db.conn.execute("RELEASE SAVEPOINT clear_completed_smr")
        await db.conn.commit()
    except Exception:
        await db.conn.execute("ROLLBACK TO SAVEPOINT clear_completed_smr")
        await db.conn.execute("RELEASE SAVEPOINT clear_completed_smr")
        await db.conn.rollback()
        raise

    await _audit_smr_change(
        app_id,
        current_user,
        "smr_report_cleared",
        before_snapshot,
        metadata={"application_ids": group_ids, "deleted": deleted},
        force=True,
    )
    fio = current_user.get('fio', '')
    app_number = await get_application_number(db, app_id)
    await db.add_log(
        current_user['tg_id'],
        fio,
        f"Полностью очистил готовый СМР по заявке {app_number}",
        target_type='smr',
        target_id=app_id,
        details=json.dumps({"application_ids": group_ids, "deleted": deleted}, ensure_ascii=False),
    )
    return {
        "status": "ok",
        "application_ids": group_ids,
        "deleted": deleted,
        "moved_to": "to_fill",
    }


@router.post("/api/kp/smr/merge")
async def merge_smr_apps(request: Request, current_user=Depends(get_current_user)):
    """Combine multiple applications into a single SMR merge group.

    Body: ``{"app_ids": [1, 2, 3]}`` — 2+ app ids, all accessible to the
    caller, all currently in the "to_fill" stage (no smr_status, no
    approved kp_status). Apps already belonging to a group are merged
    into the new group (their old group id is overwritten). Returns
    the assigned ``smr_group_id``.
    """
    import uuid as _uuid

    data = await request.json()
    raw_ids = data.get('app_ids') or []
    try:
        app_ids = sorted({int(x) for x in raw_ids if int(x) > 0})
    except (TypeError, ValueError):
        raise HTTPException(400, "app_ids должен быть списком чисел")
    if len(app_ids) < 2:
        raise HTTPException(400, "Для объединения выберите минимум 2 заявки")

    tg_id = current_user['tg_id']
    role = current_user.get('role', 'worker')

    if db.conn is None:
        await db.init_db()

    placeholders = ",".join("?" * len(app_ids))
    async with db.conn.execute(
        f"SELECT id, foreman_id, team_id, kp_status, smr_status, smr_group_id "
        f"FROM applications WHERE id IN ({placeholders})",
        app_ids,
    ) as cur:
        rows = [dict(r) for r in await cur.fetchall()]

    if len(rows) != len(app_ids):
        raise HTTPException(404, "Одна или несколько заявок не найдены")

    # Access + state checks: every app must be writable by the caller
    # and still in the to_fill stage.
    user_team_ids = set(await db.get_user_team_ids(tg_id))
    for r in rows:
        smr = (r.get('smr_status') or '').strip()
        kp = (r.get('kp_status') or '').strip()
        if smr in ('pending_review', 'approved') or kp == 'approved':
            raise HTTPException(400, f"Заявка №{r['id']} уже заполнена и не может быть объединена")
        if role in ('moderator', 'boss', 'superadmin', 'hr'):
            continue
        if role == 'foreman':
            if int(r.get('foreman_id') or 0) != int(tg_id):
                raise HTTPException(403, f"Нет доступа к заявке №{r['id']}")
            continue
        # brigadier / worker — must be a team member of at least one
        # brigade on the app.
        app_teams = set()
        for part in str(r.get('team_id') or '').split(','):
            part = part.strip()
            if part.isdigit():
                app_teams.add(int(part))
        if not (app_teams & user_team_ids):
            raise HTTPException(403, f"Нет доступа к заявке №{r['id']}")

    group_id = _uuid.uuid4().hex[:12]
    await db.conn.execute(
        f"UPDATE applications SET smr_group_id = ? WHERE id IN ({placeholders})",
        (group_id, *app_ids),
    )
    await db.conn.commit()

    try:
        await db.add_log(
            tg_id, current_user.get('fio', ''),
            f"Объединил СМР заявки: {', '.join(f'№{a}' for a in app_ids)}",
            target_type='smr', target_id=app_ids[0],
        )
    except Exception:
        pass

    return {"status": "ok", "smr_group_id": group_id, "app_ids": app_ids}


@router.post("/api/kp/smr/unmerge")
async def unmerge_smr_app(request: Request, current_user=Depends(get_current_user)):
    """Remove a single application from its SMR merge group.

    Body: ``{"app_id": N}``. If the remaining group has ≤ 1 app its
    ``smr_group_id`` is also cleared, since a one-app group is the same
    as no group.
    """
    data = await request.json()
    try:
        app_id = int(data.get('app_id') or 0)
    except (TypeError, ValueError):
        app_id = 0
    if app_id <= 0:
        raise HTTPException(400, "app_id обязателен")

    if db.conn is None:
        await db.init_db()

    async with db.conn.execute(
        "SELECT id, foreman_id, team_id, smr_status, kp_status, smr_group_id "
        "FROM applications WHERE id = ?",
        (app_id,),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Заявка не найдена")
    r = dict(row)

    gid = r.get('smr_group_id')
    if not gid:
        return {"status": "ok", "noop": True}

    # Access + state check (same as merge).
    tg_id = current_user['tg_id']
    role = current_user.get('role', 'worker')
    smr = (r.get('smr_status') or '').strip()
    kp = (r.get('kp_status') or '').strip()
    if smr in ('pending_review', 'approved') or kp == 'approved':
        raise HTTPException(400, "Заявка уже заполнена — нельзя отменить объединение")
    if role not in ('moderator', 'boss', 'superadmin', 'hr'):
        if role == 'foreman':
            if int(r.get('foreman_id') or 0) != int(tg_id):
                raise HTTPException(403, "Нет доступа к этой заявке")
        else:
            user_team_ids = set(await db.get_user_team_ids(tg_id))
            app_teams = set()
            for part in str(r.get('team_id') or '').split(','):
                part = part.strip()
                if part.isdigit():
                    app_teams.add(int(part))
            if not (app_teams & user_team_ids):
                raise HTTPException(403, "Нет доступа к этой заявке")

    # Detach this app from the group.
    await db.conn.execute(
        "UPDATE applications SET smr_group_id = NULL WHERE id = ?", (app_id,)
    )
    # If only one app is left in the group, drop the group id from it too.
    async with db.conn.execute(
        "SELECT id FROM applications WHERE smr_group_id = ?", (gid,)
    ) as cur:
        remaining = [rr[0] for rr in await cur.fetchall()]
    if len(remaining) == 1:
        await db.conn.execute(
            "UPDATE applications SET smr_group_id = NULL WHERE id = ?", (remaining[0],)
        )
    await db.conn.commit()

    try:
        await db.add_log(
            tg_id, current_user.get('fio', ''),
            f"Отменил объединение СМР заявки №{app_id}",
            target_type='smr', target_id=app_id,
        )
    except Exception:
        pass

    return {"status": "ok"}


async def _attach_smr_search_text(apps: list[dict]) -> None:
    """Build a batched full-text index for the SMR list.

    The index is intentionally returned as data rather than exposing a broad
    SQL search endpoint: role scoping is applied first, and the client can
    search instantly without making one request per keystroke.
    """
    if not apps:
        return
    app_ids = [int(app["id"]) for app in apps]
    marks = ",".join("?" for _ in app_ids)
    index: dict[int, list[str]] = {app_id: [] for app_id in app_ids}

    async def _append_rows(sql: str) -> set[int]:
        seen: set[int] = set()
        async with db.conn.execute(sql, app_ids) as cur:
            for row in await cur.fetchall():
                app_id = int(row[0])
                seen.add(app_id)
                index.setdefault(app_id, []).append(" ".join(str(value or "") for value in row[1:]))
        return seen

    hours_apps = await _append_rows(
        f"""SELECT ah.app_id,tm.fio,tm.position,t.name,ah.hours
               FROM application_hours ah
               LEFT JOIN team_members tm ON tm.id=ah.user_id
               LEFT JOIN teams t ON t.id=ah.team_id
              WHERE ah.app_id IN ({marks}) AND COALESCE(ah.hours,0)>0"""
    )
    await _append_rows(
        f"""SELECT ak.application_id,kc.category,kc.name,ak.unit,ak.volume
               FROM application_kp ak LEFT JOIN kp_catalog kc ON kc.id=ak.kp_id
              WHERE ak.application_id IN ({marks}) AND COALESCE(ak.volume,0)>0"""
    )
    await _append_rows(
        f"""SELECT aew.application_id,kc.category,
                   COALESCE(NULLIF(aew.custom_name,''),kc.name,ewc.name),
                   aew.unit,aew.volume
               FROM application_extra_works aew
               LEFT JOIN kp_catalog kc ON kc.id=aew.kp_id
               LEFT JOIN extra_works_catalog ewc ON ewc.id=aew.extra_work_id
              WHERE aew.application_id IN ({marks}) AND COALESCE(aew.volume,0)>0"""
    )

    team_ids: set[int] = set()
    for app in apps:
        for part in str(app.get("team_id") or "").split(","):
            if part.strip().isdigit() and int(part) != 0:
                team_ids.add(int(part))
    members_by_team: dict[int, list[dict]] = {}
    if team_ids:
        team_marks = ",".join("?" for _ in team_ids)
        async with db.conn.execute(
            f"SELECT tm.id,tm.team_id,tm.fio,tm.position,t.name "
            f"FROM team_members tm JOIN teams t ON t.id=tm.team_id "
            f"WHERE tm.team_id IN ({team_marks})",
            sorted(team_ids),
        ) as cur:
            for member in await cur.fetchall():
                members_by_team.setdefault(int(member[1]), []).append({
                    "id": int(member[0]), "fio": member[2],
                    "position": member[3], "team_name": member[4],
                })

    for app in apps:
        app_id = int(app["id"])
        parts = [
            app.get("public_number"), app_id, app.get("foreman_name"),
            app.get("date_target"), app.get("object_name"),
            app.get("object_address"), app.get("object_clean_address"),
            app.get("comment"), app.get("equipment_data"),
            app.get("smr_accounted_by_fio"),
        ]
        # Before hours are filled, index the requested participants. Once the
        # report contains hours, the exact participants were already added
        # above and we avoid false matches from non-participating team members.
        if app_id not in hours_apps:
            selected = {
                int(part) for part in str(app.get("selected_members") or "").split(",")
                if part.strip().isdigit()
            }
            for team_id in {
                int(part) for part in str(app.get("team_id") or "").split(",")
                if part.strip().isdigit() and int(part) != 0
            }:
                for member in members_by_team.get(team_id, []):
                    if not selected or member["id"] in selected:
                        parts.extend((member["team_name"], member["fio"], member["position"]))
        index[app_id].append(" ".join(str(value or "") for value in parts))
        app["search_text"] = " ".join(index[app_id])


@router.get("/api/kp/smr/list")
async def get_smr_list(current_user=Depends(get_current_user)):
    """Applications grouped into SMR-wizard tabs: к заполнению / на проверку / готовые."""
    tg_id = current_user['tg_id']
    role = current_user.get('role', 'worker')

    if db.conn is None:
        await db.init_db()

    # Brigadier / worker: only apps they're part of (team membership).
    # Foreman: their own applications. Office+: everything.
    user_team_ids = set(await db.get_user_team_ids(tg_id))

    base_query = """
        SELECT a.id, a.public_number, a.foreman_id, a.foreman_name, a.team_id, a.date_target,
               a.object_id, a.object_address, a.selected_members,
               a.equipment_data, a.comment,
               a.status, a.kp_status,
               a.smr_status, a.smr_group_id, a.smr_filled_by_role,
               a.smr_accounted_by, a.smr_accounted_at,
               a.created_at,
               o.name AS object_name, o.address AS object_clean_address,
               accountant.fio AS smr_accounted_by_fio
        FROM applications a
        LEFT JOIN objects o ON o.id = a.object_id
        LEFT JOIN users accountant ON accountant.user_id = a.smr_accounted_by
        WHERE a.status IN ('approved', 'published', 'in_progress', 'completed')
          AND (a.kp_archived = 0 OR a.kp_archived IS NULL)
        ORDER BY a.date_target DESC, a.id DESC
    """
    async with db.conn.execute(base_query) as cur:
        rows = [dict(r) for r in await cur.fetchall()]

    # Filter by role scope
    def _is_accessible(app: dict) -> bool:
        if role in ('moderator', 'boss', 'superadmin', 'hr'):
            return True
        if role == 'foreman':
            return int(app.get('foreman_id') or 0) == int(tg_id)
        # Worker / driver / brigadier → need to be a team member
        app_teams = set()
        for part in str(app.get('team_id') or '').split(','):
            part = part.strip()
            if part.isdigit():
                app_teams.add(int(part))
        return bool(app_teams & user_team_ids)

    apps = [a for a in rows if _is_accessible(a)]

    # v2.9.3: drop no-labor (equipment-only) apps from ALL SMR buckets. SMR
    # labor is driven entirely by team_id — no brigades implies no members,
    # so there is nothing to report. A brigade exists iff team_id has a
    # comma-part that is a non-zero integer ('0'/''/NULL = no brigades).
    def _has_brigade(app: dict) -> bool:
        for part in str(app.get('team_id') or '').split(','):
            part = part.strip()
            if part.isdigit() and int(part) != 0:
                return True
        return False
    apps = [a for a in apps if _has_brigade(a)]
    await _attach_smr_search_text(apps)

    to_fill: list[dict] = []
    pending: list[dict] = []
    completed: list[dict] = []

    for app in apps:
        smr = app.get('smr_status') or ''
        kp = app.get('kp_status') or ''
        # Fall through: treat the legacy `kp_status` values as the source
        # of truth when `smr_status` hasn't been set yet by a wizard submit.
        if smr == 'approved' or kp == 'approved':
            completed.append(app)
        elif smr == 'pending_review' or kp == 'submitted':
            pending.append(app)
        else:
            to_fill.append(app)

    # Brigadiers don't see the "на проверку" queue — only the foreman does.
    if role in ('worker', 'driver', 'brigadier'):
        pending = []

    # ── Collapse merged groups in the "to_fill" tab ──
    # Apps sharing a non-null smr_group_id are shown as a single primary
    # card (lowest id) with `merged_with` pointing at the other group
    # members. The secondary apps are hidden from the tab so the list is
    # not duplicated. Apps with no group id are unaffected.
    groups: dict[str, list[dict]] = {}
    ungrouped: list[dict] = []
    for app in to_fill:
        gid = (app.get('smr_group_id') or '').strip()
        if gid:
            groups.setdefault(gid, []).append(app)
        else:
            ungrouped.append(app)

    collapsed: list[dict] = []
    for gid, members in groups.items():
        if len(members) == 1:
            # A one-member group is effectively not merged — show it plainly.
            collapsed.append(members[0])
            continue
        members.sort(key=lambda x: int(x.get('id') or 0))
        primary = dict(members[0])
        primary['search_text'] = ' '.join(str(m.get('search_text') or '') for m in members)
        primary['merged_with'] = [
            {
                'id': m['id'],
                'date_target': m.get('date_target'),
                'object_id': m.get('object_id'),
                'object_name': m.get('object_name'),
                'object_address': m.get('object_address') or m.get('object_clean_address'),
            }
            for m in members[1:]
        ]
        collapsed.append(primary)

    collapsed.extend(ungrouped)
    collapsed.sort(
        key=lambda x: (x.get('date_target') or '', int(x.get('id') or 0)),
        reverse=True,
    )

    def _collapse_completed_group(bucket: list[dict]) -> list[dict]:
        """One card per logical report in every SMR tab, not only to-fill."""
        by_group: dict[str, list[dict]] = {}
        plain: list[dict] = []
        for item in bucket:
            gid = (item.get('smr_group_id') or '').strip()
            (by_group.setdefault(gid, []).append(item) if gid else plain.append(item))
        result = list(plain)
        for members in by_group.values():
            members.sort(key=lambda x: int(x.get('id') or 0))
            primary = dict(members[0])
            primary['search_text'] = ' '.join(str(m.get('search_text') or '') for m in members)
            if len(members) > 1:
                primary['merged_with'] = [
                    {'id': m['id'], 'date_target': m.get('date_target'),
                     'object_id': m.get('object_id'), 'object_name': m.get('object_name'),
                     'object_address': m.get('object_address') or m.get('object_clean_address')}
                    for m in members[1:]
                ]
                # Accounting is a group-level state. It is true only when all
                # applications have the marker (migration-safe behaviour).
                if not all(m.get('smr_accounted_at') for m in members):
                    primary['smr_accounted_at'] = None
                    primary['smr_accounted_by'] = None
                    primary['smr_accounted_by_fio'] = None
            result.append(primary)
        result.sort(key=lambda x: (x.get('date_target') or '', int(x.get('id') or 0)), reverse=True)
        return result

    return {
        'to_fill': collapsed,
        'pending': _collapse_completed_group(pending),
        'completed': _collapse_completed_group(completed),
    }


@router.get("/api/kp/apps/{app_id}/smr/reconciliation")
async def get_smr_reconciliation(app_id: int, current_user=Depends(_require_office)):
    """Compare saved SMR rates against the currently active price list."""
    result = await build_smr_catalog_reconciliation(db, app_id)
    if not result:
        raise HTTPException(404, "Данные СМР не найдены")
    async with db.conn.execute(
        "SELECT date_target, COALESCE(o.name, a.object_address, '') AS object_name "
        "FROM applications a LEFT JOIN objects o ON o.id=a.object_id WHERE a.id=?",
        (result.get("primary_application_id") or app_id,),
    ) as cur:
        row = await cur.fetchone()
    result["date_target"] = row[0] if row else ""
    result["object_name"] = row[1] if row else ""
    return result


@router.get("/api/kp/apps/{app_id}/smr/audit")
async def get_smr_financial_history(
    app_id: int, limit: int = 100, before_id: int | None = None,
    current_user=Depends(_require_office),
):
    return {
        "items": await db.list_smr_financial_history(
            app_id, limit=limit, before_id=before_id
        )
    }


@router.get("/api/kp/catalog/versions")
async def get_kp_catalog_versions(limit: int = 50, current_user=Depends(_require_office)):
    return {"items": await db.list_kp_catalog_versions(limit=limit)}


@router.get("/api/kp/catalog/versions/{version_id}")
async def get_kp_catalog_version(version_id: int, current_user=Depends(_require_office)):
    version = await db.get_kp_catalog_version(version_id, include_items=True)
    if not version:
        raise HTTPException(404, "Версия справочника не найдена")
    return version


@router.post("/api/kp/smr/accounted")
async def set_smr_accounted(request: Request, current_user=Depends(_require_office)):
    """Mark one or many completed SMR applications as accounted/unaccounted."""
    data = await request.json()
    raw_ids = data.get("app_ids") or []
    accounted = bool(data.get("accounted", True))
    try:
        app_ids = sorted({int(value) for value in raw_ids if int(value) > 0})
    except (TypeError, ValueError):
        raise HTTPException(400, "app_ids должен быть списком чисел")
    if not app_ids:
        raise HTTPException(400, "Не выбраны заявки")
    if len(app_ids) > 500:
        raise HTTPException(400, "За один раз можно обработать не более 500 заявок")

    if db.conn is None:
        await db.init_db()
    expanded_ids: set[int] = set()
    for selected_id in app_ids:
        expanded_ids.update(await _expand_merge_group(selected_id))
    app_ids = sorted(expanded_ids or set(app_ids))
    placeholders = ",".join("?" * len(app_ids))
    async with db.conn.execute(
        f"SELECT MIN(id) FROM applications WHERE id IN ({placeholders}) "
        "GROUP BY CASE WHEN smr_group_id IS NULL OR smr_group_id='' "
        "THEN 'app:' || id ELSE 'group:' || smr_group_id END",
        tuple(app_ids),
    ) as cur:
        checkpoint_ids = [int(row[0]) for row in await cur.fetchall()]
    checkpoint_snapshots = {
        checkpoint_id: await capture_smr_financial_snapshot(db, checkpoint_id)
        for checkpoint_id in checkpoint_ids
    }
    async with db.conn.execute(
        f"SELECT id, smr_status, kp_status FROM applications "
        f"WHERE id IN ({placeholders})",
        tuple(app_ids),
    ) as cur:
        rows = [dict(row) for row in await cur.fetchall()]
    if len(rows) != len(app_ids):
        raise HTTPException(404, "Одна или несколько заявок не найдены")
    not_completed = [
        int(row["id"]) for row in rows
        if row.get("smr_status") != "approved" and row.get("kp_status") != "approved"
    ]
    if not_completed:
        raise HTTPException(
            400,
            "Отметку можно ставить только готовым СМР: "
            + ", ".join(f"№{app_id}" for app_id in not_completed),
        )

    if accounted:
        await db.conn.execute(
            f"UPDATE applications SET smr_accounted_by = ?, "
            f"smr_accounted_at = datetime('now', 'localtime') "
            f"WHERE id IN ({placeholders})",
            (current_user["tg_id"], *app_ids),
        )
        action = "Учёл"
    else:
        await db.conn.execute(
            f"UPDATE applications SET smr_accounted_by = NULL, "
            f"smr_accounted_at = NULL WHERE id IN ({placeholders})",
            tuple(app_ids),
        )
        action = "Снял отметку «Учтено» с"
    await db.conn.commit()

    for checkpoint_id, snapshot in checkpoint_snapshots.items():
        await _audit_smr_change(
            checkpoint_id,
            current_user,
            "smr_accounted" if accounted else "smr_unaccounted",
            snapshot,
            metadata={"accounted": accounted, "application_ids": app_ids},
            force=True,
        )

    fio = current_user.get("fio", "")
    await db.add_log(
        current_user["tg_id"],
        fio,
        f"{action} СМР: " + ", ".join(f"№{app_id}" for app_id in app_ids),
        target_type="smr",
        details=json.dumps({"app_ids": app_ids, "accounted": accounted}, ensure_ascii=False),
    )
    async with db.conn.execute(
        f"SELECT DISTINCT foreman_id FROM applications WHERE id IN ({placeholders})",
        tuple(app_ids),
    ) as cur:
        recipients = [int(r[0]) for r in await cur.fetchall() if r[0] and int(r[0]) != int(current_user['tg_id'])]
    if recipients:
        verb = "учтено" if accounted else "возвращено из учтённых"
        asyncio.create_task(notify_users(
            [], f"🧾 <b>СМР {verb}</b>\n" + ", ".join(f"№{value}" for value in app_ids),
            "kp", extra_tg_ids=recipients, category="reports", event_key="smr_accounted",
        ))
    return {"status": "ok", "updated": len(app_ids), "accounted": accounted}


@router.get("/api/kp/apps/{app_id}/smr/download")
async def download_smr_report(app_id: int, current_user=Depends(get_current_user)):
    """Download the SMR report as an .xlsx — hours + works + extras, no pricing.
    Access: any authenticated user who can see the application on the
    KP page (same scope as /api/kp/smr/list).

    Merge-aware: the wizard saves all data onto the merge-group's primary
    app. When someone downloads the report for a secondary app we
    transparently redirect to the primary so the file isn't empty.
    """
    from services.smr_report import generate_smr_excel_bytes

    if db.conn is None:
        await db.init_db()
    async with db.conn.execute(
        "SELECT id FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Заявка не найдена")

    # Resolve to primary app if this app is part of a merge group.
    group_ids = await _expand_merge_group(app_id)
    report_app_id = group_ids[0] if group_ids else app_id

    role = current_user.get('role', 'worker')
    include_financial = role in ('moderator', 'boss', 'superadmin', 'hr')
    include_participant_salary = include_financial or role == 'foreman'
    blob, filename = await generate_smr_excel_bytes(
        db,
        report_app_id,
        include_financial=include_financial,
        include_participant_salary=include_participant_salary,
    )
    headers = {
        "Content-Disposition": (
            f"attachment; filename*=UTF-8''{quote(filename)}"
        ),
    }
    import io
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.post("/api/kp/apps/{app_id}/submit")
async def submit_app_kp(app_id: int, request: Request, current_user=Depends(get_current_user)):
    data = await request.json()
    before_snapshot = await capture_smr_financial_snapshot(db, app_id)

    real_tg_id = current_user["tg_id"]
    user_role = current_user.get('role', 'worker')

    # Access check: workers/drivers need brigadier status to fill KP
    if user_role in ['worker', 'driver', 'guest']:
        async with db.conn.execute("SELECT 1 FROM team_members WHERE tg_user_id = ? AND is_foreman = 1 LIMIT 1",
                                   (real_tg_id,)) as cur:
            if not await cur.fetchone():
                raise HTTPException(403, "Нет прав для заполнения КП")

    await db.submit_kp_report(app_id, data.get('items', []), user_role)
    await _reset_smr_accounted(app_id)
    await db.conn.commit()
    await _audit_smr_change(app_id, current_user, "legacy_smr_submitted", before_snapshot)

    fio = current_user.get('fio', '')
    _obj = ''
    try:
        async with db.conn.execute("SELECT object_address FROM applications WHERE id = ?", (app_id,)) as c:
            r = await c.fetchone()
            if r: _obj = r[0]
    except Exception: pass
    await db.add_log(real_tg_id, fio, f"Отправил отчёт СМР ({_obj})" if _obj else f"Отправил отчёт СМР по заявке №{app_id}", target_type='smr', target_id=app_id)
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/review")
async def review_app_kp(app_id: int, request: Request, current_user=Depends(_require_office)):
    data = await request.json()
    before_snapshot = await capture_smr_financial_snapshot(db, app_id)
    # If foreman edited volumes before approving, save them first
    items = data.get('items')
    if items and data.get('action') == 'approve':
        await db.update_kp_volumes_only(app_id, items)
        await _reset_smr_accounted(app_id)
    action = data.get('action')
    await db.review_kp_report(app_id, action)
    if items and action == 'approve':
        await _audit_smr_change(app_id, current_user, "legacy_smr_review_edited", before_snapshot)

    real_tg_id = current_user["tg_id"]
    fio = current_user.get('fio', '')
    action_label = "Одобрил" if action == 'approve' else "Отклонил"
    _obj = ''
    try:
        async with db.conn.execute("SELECT object_address FROM applications WHERE id = ?", (app_id,)) as c:
            r = await c.fetchone()
            if r: _obj = r[0]
    except Exception: pass
    await db.add_log(real_tg_id, fio, f"{action_label} СМР ({_obj})" if _obj else f"{action_label} СМР по заявке №{app_id}", target_type='smr', target_id=app_id)

    group_ids = await _expand_merge_group(app_id)
    marks = ",".join("?" * len(group_ids))
    async with db.conn.execute(
        f"SELECT DISTINCT foreman_id FROM applications WHERE id IN ({marks})",
        tuple(group_ids),
    ) as cur:
        recipients = [
            int(row[0]) for row in await cur.fetchall()
            if row[0] and int(row[0]) != int(real_tg_id)
        ]
    if action in ("approve", "reject"):
        approved = action == "approve"
        title = "✅ СМР одобрено" if approved else "↩️ СМР возвращено"
        app_number = await get_application_number(db, app_id)
        asyncio.create_task(notify_users(
            [],
            f"{title}: {app_number}\n👤 Проверил: {fio or 'Пользователь'}",
            "kp",
            extra_tg_ids=recipients,
            category="reports",
            event_key="smr_approved" if approved else "smr_rejected",
        ))
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/update_volumes")
async def update_kp_volumes(app_id: int, request: Request, current_user=Depends(get_current_user)):
    data = await request.json()
    before_snapshot = await capture_smr_financial_snapshot(db, app_id)
    await db.update_kp_volumes_only(app_id, data.get('items', []))
    await _reset_smr_accounted(app_id)
    await db.conn.commit()
    await _audit_smr_change(app_id, current_user, "volumes_updated", before_snapshot)
    return {"status": "ok"}


@router.post("/api/kp/export")
async def export_kp_mass(request: Request, current_user=Depends(_require_office)):
    data = await request.json()
    raw_ids = data.get("app_ids") or []
    if not isinstance(raw_ids, list):
        raise HTTPException(400, "app_ids должен быть списком чисел")
    try:
        app_ids = sorted({int(value) for value in raw_ids if int(value) > 0})
    except (TypeError, ValueError):
        raise HTTPException(400, "app_ids должен быть списком чисел")
    if not app_ids:
        raise HTTPException(400, "Выберите хотя бы одну заявку")
    if len(app_ids) > 500:
        raise HTTPException(400, "За один раз можно выгрузить не более 500 заявок")
    excel_io = await db.generate_mass_excel(app_ids)
    if not excel_io: raise HTTPException(404, "Данные не найдены")
    return StreamingResponse(excel_io, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={
                                 'Content-Disposition': f'attachment; filename*=UTF-8\'\'{quote("экспорт_выполненные_работы.xlsx")}'})


# ==========================================
# АРХИВ СМР
# ==========================================


@router.post("/api/kp/apps/{app_id}/archive")
async def archive_kp(app_id: int, current_user=Depends(_require_office)):
    """Архивировать СМР заявки (только для модератор+)."""
    await db.conn.execute("UPDATE applications SET kp_archived = 1 WHERE id = ?", (app_id,))
    await db.conn.commit()
    _obj = ''
    try:
        async with db.conn.execute("SELECT object_address FROM applications WHERE id = ?", (app_id,)) as c:
            r = await c.fetchone()
            if r: _obj = r[0]
    except Exception: pass
    await db.add_log(current_user["tg_id"], current_user.get('fio'), f"Архивировал СМР ({_obj})" if _obj else f"Архивировал СМР заявки №{app_id}", target_type='smr', target_id=app_id)
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/restore")
async def restore_kp(app_id: int, current_user=Depends(_require_office)):
    """Восстановить СМР заявки из архива (только для модератор+)."""
    await db.conn.execute("UPDATE applications SET kp_archived = 0 WHERE id = ?", (app_id,))
    await db.conn.commit()
    _obj = ''
    try:
        async with db.conn.execute("SELECT object_address FROM applications WHERE id = ?", (app_id,)) as c:
            r = await c.fetchone()
            if r: _obj = r[0]
    except Exception: pass
    await db.add_log(current_user["tg_id"], current_user.get('fio'), f"Восстановил СМР ({_obj})" if _obj else f"Восстановил СМР заявки №{app_id}", target_type='smr', target_id=app_id)
    return {"status": "ok"}


@router.get("/api/kp/archived")
async def get_archived_kp(current_user=Depends(_require_office)):
    """Список архивированных СМР (только для модератор+)."""
    async with db.conn.execute("""
        SELECT a.id, a.public_number, a.date_target, a.object_address, o.name as obj_name,
               u.fio as foreman_name, a.kp_status
        FROM applications a
        LEFT JOIN objects o ON a.object_id = o.id
        LEFT JOIN users u ON a.foreman_id = u.user_id
        WHERE a.kp_archived = 1
        ORDER BY a.date_target DESC
    """) as cur:
        return [dict(row) for row in await cur.fetchall()]


# ==========================================
# ФАЙЛ СПРАВОЧНИКА (КАТАЛОГ)
# ==========================================

@router.get("/api/kp/catalog/download")
async def download_kp_catalog(current_user=Depends(_require_office)):
    """Возвращает последний загруженный файл прайса. Office+ (moderator/boss/superadmin).

    v2.6 (C-10 follow-up): every export is audit-logged with structured
    JSON meta in ``logs.details``  — {filename, size_bytes, role,
    action} — so the loosened threshold has traceability.
    """
    path = db.get_latest_catalog_path()
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Справочник еще не загружен на сервер")

    filename = os.path.basename(path)
    # Capture size_bytes BEFORE returning FileResponse so the audit row
    # carries it. os.path.getsize is best-effort — if it raises for any
    # reason (race, FS error) we still log the intent to serve.
    try:
        size_bytes = os.path.getsize(path)
    except OSError:
        size_bytes = None

    try:
        await db.add_log(
            current_user["tg_id"], current_user.get("fio", "Система"),
            f"Экспортировал справочник КП: {filename}",
            target_type="kp_catalog", target_id=0,
            details=json.dumps({
                "action": "kp_catalog_download",
                "role": current_user.get("role", ""),
                "filename": filename,
                "size_bytes": size_bytes,
            }, ensure_ascii=False),
        )
    except Exception:
        pass
    return FileResponse(path, filename=filename)


@router.post("/api/kp/catalog/upload")
async def upload_kp_catalog(file: UploadFile = File(...), current_user=Depends(_require_office)):
    """Replace the global KP catalog from uploaded Excel.

    v2.6 (C-10 follow-up, 2026-05-18): access threshold loosened from
    require_superadmin to require_office (moderator/boss/superadmin).
    Compensating control: every import is audit-logged with structured
    JSON meta in ``logs.details`` — {filename, size_bytes, rows_count,
    role, action} — under target_type='kp_catalog'. The audit row is
    written only on the success path; a failed import (parser error)
    raises before reaching add_log.
    """
    if not file.filename.lower().endswith(('.xlsx', '.csv')):
        raise HTTPException(400, "Допустимы только файлы .xlsx или .csv")

    content = await file.read()
    size_bytes = len(content)
    if size_bytes > 10 * 1024 * 1024:
        raise HTTPException(413, "Файл слишком большой (максимум 10MB)")

    new_path = await db.save_catalog_file(content)

    success = await db.import_kp_from_excel(new_path)
    if not success:
        report = getattr(db, "last_kp_import_report", {}) or {}
        errors = report.get("errors") or ["Проверьте структуру колонок"]
        try:
            os.remove(new_path)
        except OSError:
            pass
        raise HTTPException(422, "Справочник не загружен: " + "; ".join(errors[:5]))

    catalog_version = await db.create_kp_catalog_version(
        source_file=new_path,
        source_content=content,
        imported_by_user_id=current_user["tg_id"],
        imported_by_name=current_user.get("fio", "Система"),
        notes="Загрузка через настройки СМР",
    )

    rows_count = 0
    try:
        async with db.conn.execute("SELECT COUNT(*) FROM kp_catalog") as cur:
            row = await cur.fetchone()
            rows_count = int(row[0]) if row else 0
    except Exception:
        pass

    file_name = os.path.basename(new_path)
    await db.add_log(
        current_user["tg_id"], current_user.get("fio", "Система"),
        f"Загрузил справочник КП: {file_name} ({rows_count} строк)",
        target_type="kp_catalog", target_id=0,
        details=json.dumps({
            "action": "kp_catalog_upload",
            "role": current_user.get("role", ""),
            "filename": file_name,
            "size_bytes": size_bytes,
            "rows_count": rows_count,
            "catalog_version_id": catalog_version.get("id"),
            "catalog_version": catalog_version.get("version_number"),
        }, ensure_ascii=False),
    )
    return {
        "status": "ok", "file": file_name, "rows": rows_count,
        "import": getattr(db, "last_kp_import_report", {}),
        "catalog_version": catalog_version,
    }
