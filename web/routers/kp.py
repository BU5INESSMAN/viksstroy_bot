import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse, FileResponse
from database_deps import db
from auth_deps import get_current_user, require_role
from urllib.parse import quote

router = APIRouter(tags=["KP"])

_require_office = require_role("superadmin", "boss", "moderator")
_require_superadmin = require_role("superadmin")


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
            # Sum volumes per kp_id across the group so the wizard shows
            # one row per catalog item with the combined plan volume.
            key = int(it.get('kp_id') or it.get('id') or 0)
            if key in seen_keys:
                existing = next((x for x in items if int(x.get('kp_id') or x.get('id') or 0) == key), None)
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
    if role not in ('moderator', 'boss', 'superadmin'):
        for item in items:
            item.pop('salary', None)
            item.pop('price', None)
            item.pop('saved_salary', None)
            item.pop('saved_price', None)
    return items


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
        "SELECT id FROM applications WHERE id = ?", (app_id,)
    ) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Заявка не найдена")

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
                'status': m.get('status') or 'available',
                'status_from': m.get('status_from') or '',
                'status_until': m.get('status_until') or '',
                'tg_user_id': m.get('tg_user_id'),
                'hours': float(saved_row.get('hours') or 0),
                'filled_by_fio': saved_row.get('filled_by_fio') or '',
                'filled_by_role': saved_row.get('filled_by_role') or '',
                'filled_at': saved_row.get('filled_at') or '',
            })
        result.append({
            'team_id': team['id'],
            'team_name': team['name'],
            'team_icon': team.get('icon') or '',
            'members': members_out,
        })
    return result


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

    role = current_user.get('role', 'worker')
    tg_id = current_user['tg_id']

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

    await db.save_app_hours(app_id, items, tg_id)
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

    # Brigadier scope: filter hours to their own teams
    user_team_ids = set(await db.get_user_team_ids(tg_id)) if role in ('brigadier', 'worker') else None

    # 1. Hours
    hours_items = data.get('hours') or []
    if user_team_ids is not None:
        hours_items = [h for h in hours_items if int(h.get('team_id') or 0) in user_team_ids]
    if hours_items:
        await db.save_app_hours(app_id, hours_items, tg_id)

    # 2. Plan works (only foreman+ finalises; brigadier may fill if they
    # are the only author, otherwise foreman overwrites on review)
    works = data.get('works') or []
    if works:
        await db.submit_kp_report(app_id, works, role, filled_by_user_id=tg_id)

    # 3. Extra works — reuse the existing /extra_works/submit logic via a
    # direct insert (same rules as that endpoint).
    extras = data.get('extra_works') or []
    if extras:
        await _save_extra_works_inline(app_id, extras, tg_id, role)

    # 4. Group + status — cascade to every app in the merge group so a
    # single wizard pass marks them all pending/approved together.
    group_id = dict(app_row).get('smr_group_id') or _uuid.uuid4().hex[:12]
    group_ids = await _expand_merge_group(app_id)
    if app_id not in group_ids:
        group_ids.append(app_id)

    if role in ('foreman', 'moderator', 'boss', 'superadmin'):
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
        f"smr_filled_by_role = ?, kp_status = ? WHERE id IN ({placeholders})",
        (group_id, smr_status, smr_role, new_kp_status, *group_ids),
    )
    await db.conn.commit()

    fio = current_user.get('fio', '')
    await db.add_log(
        tg_id, fio,
        f"СМР отправлен ({smr_role}) по заявке №{app_id}",
        target_type='smr', target_id=app_id,
    )

    # Notify the foreman when a brigadier submits
    if smr_status == 'pending_review':
        foreman_id = app_row['foreman_id']
        if foreman_id and foreman_id != tg_id:
            try:
                from services.notifications import notify_users
                asyncio.create_task(notify_users(
                    [foreman_id],
                    f"🔧 Бригадир {fio or ''} заполнил СМР по заявке №{app_id}. Требуется проверка.",
                    'smr', category='reports',
                ))
            except Exception:
                pass

    return {"status": "ok", "smr_status": smr_status, "smr_group_id": group_id}


async def _save_extra_works_inline(app_id: int, items: list, tg_id: int, role: str):
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

    await db.conn.execute(
        "DELETE FROM application_extra_works WHERE application_id = ?", (app_id,)
    )
    now = _dt.now().isoformat(timespec='seconds')
    for it in items:
        try:
            volume = float(it.get('volume') or 0)
        except (TypeError, ValueError):
            volume = 0.0
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
            custom_name = it.get('custom_name') or ''
            unit = it.get('unit') or ''
            try:
                salary = float(it.get('salary') or 0)
                price = float(it.get('price') or 0)
            except (TypeError, ValueError):
                salary = 0.0
                price = 0.0

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
               (application_id, extra_work_id, custom_name, unit, volume,
                salary, price, filled_by_user_id, filled_at, team_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (app_id, extra_work_id, custom_name, unit, volume, salary, price, tg_id, now, team_id),
        )
    await db.conn.commit()


@router.post("/api/kp/apps/{app_id}/smr/review")
async def review_smr(app_id: int, request: Request, current_user=Depends(get_current_user)):
    """Foreman reviews a brigadier's SMR submission.
    Body: {action: 'approve' | 'edit', hours?, works?, extra_works?}"""
    if current_user.get('role') not in ('foreman', 'moderator', 'boss', 'superadmin'):
        raise HTTPException(403, "Только прораб может проверять СМР")

    data = await request.json()
    action = data.get('action', 'approve')
    tg_id = current_user['tg_id']
    role = current_user.get('role')

    if action == 'edit':
        if data.get('hours'):
            await db.save_app_hours(app_id, data['hours'], tg_id)
        if data.get('works'):
            await db.submit_kp_report(app_id, data['works'], role, filled_by_user_id=tg_id)
        if data.get('extra_works'):
            await _save_extra_works_inline(app_id, data['extra_works'], tg_id, role)

    await db.conn.execute(
        "UPDATE applications SET smr_status = 'approved', kp_status = 'approved' WHERE id = ?",
        (app_id,),
    )
    await db.conn.commit()

    fio = current_user.get('fio', '')
    await db.add_log(
        tg_id, fio,
        f"{'Одобрил с правками' if action == 'edit' else 'Одобрил'} СМР по заявке №{app_id}",
        target_type='smr', target_id=app_id,
    )
    return {"status": "ok"}


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
        if role in ('moderator', 'boss', 'superadmin'):
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
    if role not in ('moderator', 'boss', 'superadmin'):
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
        SELECT a.id, a.foreman_id, a.foreman_name, a.team_id, a.date_target,
               a.object_id, a.object_address,
               a.status, a.kp_status,
               a.smr_status, a.smr_group_id, a.smr_filled_by_role,
               a.created_at,
               o.name AS object_name, o.address AS object_clean_address
        FROM applications a
        LEFT JOIN objects o ON o.id = a.object_id
        WHERE a.status IN ('approved', 'published', 'in_progress', 'completed')
          AND (a.kp_archived = 0 OR a.kp_archived IS NULL)
        ORDER BY a.date_target DESC, a.id DESC
    """
    async with db.conn.execute(base_query) as cur:
        rows = [dict(r) for r in await cur.fetchall()]

    # Filter by role scope
    def _is_accessible(app: dict) -> bool:
        if role in ('moderator', 'boss', 'superadmin'):
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

    return {
        'to_fill': collapsed,
        'pending': pending,
        'completed': completed,
    }


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

    blob, filename = await generate_smr_excel_bytes(db, report_app_id)
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

    real_tg_id = current_user["tg_id"]
    user_role = current_user.get('role', 'worker')

    # Access check: workers/drivers need brigadier status to fill KP
    if user_role in ['worker', 'driver', 'guest']:
        async with db.conn.execute("SELECT 1 FROM team_members WHERE tg_user_id = ? AND is_foreman = 1 LIMIT 1",
                                   (real_tg_id,)) as cur:
            if not await cur.fetchone():
                raise HTTPException(403, "Нет прав для заполнения КП")

    await db.submit_kp_report(app_id, data.get('items', []), user_role)

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
    # If foreman edited volumes before approving, save them first
    items = data.get('items')
    if items and data.get('action') == 'approve':
        await db.update_kp_volumes_only(app_id, items)
    action = data.get('action')
    await db.review_kp_report(app_id, action)

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
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/update_volumes")
async def update_kp_volumes(app_id: int, request: Request, current_user=Depends(get_current_user)):
    data = await request.json()
    await db.update_kp_volumes_only(app_id, data.get('items', []))
    return {"status": "ok"}


@router.post("/api/kp/export")
async def export_kp_mass(request: Request, current_user=Depends(_require_office)):
    data = await request.json()
    excel_io = await db.generate_mass_excel(data.get('app_ids', []))
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
        SELECT a.id, a.date_target, a.object_address, o.name as obj_name,
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
    """Отдает последний загруженный файл прайса. Office only."""
    path = db.get_latest_catalog_path()
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Справочник еще не загружен на сервер")

    filename = os.path.basename(path)
    return FileResponse(path, filename=filename)


@router.post("/api/kp/catalog/upload")
async def upload_kp_catalog(file: UploadFile = File(...), current_user=Depends(_require_superadmin)):
    """Replace the global KP catalog from uploaded Excel.
    SECURITY (C-10 fix): superadmin only — pricing data is business-critical.
    """
    if not file.filename.lower().endswith(('.xlsx', '.csv')):
        raise HTTPException(400, "Допустимы только файлы .xlsx или .csv")

    content = await file.read()
    # Validate size (max 10MB for Excel)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Файл слишком большой (максимум 10MB)")

    new_path = await db.save_catalog_file(content)

    success = await db.import_kp_from_excel(new_path)
    if not success:
        raise HTTPException(500, "Ошибка при разборе файла. Проверьте структуру колонок.")

    await db.add_log(current_user["tg_id"], current_user.get("fio", "Система"),
                     f"Загрузил справочник КП: {os.path.basename(new_path)}", target_type='system')
    return {"status": "ok", "file": os.path.basename(new_path)}
