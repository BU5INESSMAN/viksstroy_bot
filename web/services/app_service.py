import json
import logging

from database_deps import db
from utils import resolve_id

logger = logging.getLogger(__name__)


async def ensure_app_columns():
    try:
        await db.conn.execute("ALTER TABLE applications ADD COLUMN is_team_freed INTEGER DEFAULT 0")
    except:
        pass
    try:
        await db.conn.execute("ALTER TABLE applications ADD COLUMN freed_team_ids TEXT DEFAULT ''")
    except:
        pass
    await db.conn.commit()


def _split_legacy_object_address(merged: str):
    """v2.4.2 FIX 4: legacy `applications.object_address` was stored as
    'Name (Address)'. Split into (name, address) so the frontend can
    render two lines even for old rows whose object was deleted or was
    never linked via object_id. Returns (name, address) tuple.
    """
    if not merged:
        return '', ''
    s = merged.strip()
    # Prefer the last '(...)' suffix — object names can contain commas
    # or other punctuation but should not themselves end in a parenthetical.
    if s.endswith(')') and ' (' in s:
        lparen = s.rfind(' (')
        name = s[:lparen].strip()
        address = s[lparen + 2:-1].strip()
        if name and address:
            return name, address
    return s, ''


async def enrich_app_with_object_fields(app_dict):
    """Populate `object_name` and `object_address` on an application dict
    from the linked `objects` row (via `a.object_id`).

    Overrides the legacy merged `object_address` column with the clean
    split (`objects.name`, `objects.address`). For rows without a linked
    object, falls back to parsing the legacy 'Name (Address)' string.
    The frontend `ObjectDisplay` uses the two fields separately.
    """
    obj_id = app_dict.get('object_id')
    legacy = app_dict.get('object_address', '') or ''
    if obj_id:
        try:
            async with db.conn.execute(
                "SELECT name, address FROM objects WHERE id = ?", (obj_id,)
            ) as cur:
                row = await cur.fetchone()
            if row:
                name, address = row[0] or '', row[1] or ''
                if name:
                    app_dict['object_name'] = name
                    app_dict['object_address'] = address
                    return
        except Exception:
            pass
    # Fallback: no object_id or missing row — split the legacy merged
    # string so the frontend can still render name/address on two lines.
    name, address = _split_legacy_object_address(legacy)
    app_dict['object_name'] = name
    app_dict['object_address'] = address


async def enrich_app_with_drivers(app_dict):
    """v2.6: populate `driver_assignments` on the application dict from
    the application_drivers junction. Each row includes equipment_name,
    driver_fio, is_synthetic, is_default."""
    from services import driver_service
    try:
        app_dict["driver_assignments"] = await driver_service.get_application_drivers(
            db, int(app_dict.get("id")),
        )
    except Exception:
        app_dict["driver_assignments"] = []


async def enrich_app_with_members_data(app_dict):
    selected_m = app_dict.get('selected_members')
    members_list = []
    if selected_m:
        m_ids = [int(x) for x in selected_m.split(',') if x.strip().isdigit()]
        if m_ids:
            pl = ','.join(['?'] * len(m_ids))
            query = f"""
                SELECT tm.id, tm.fio, tm.tg_user_id, tm.position, tm.team_id, t.name
                FROM team_members tm
                LEFT JOIN teams t ON tm.team_id = t.id
                WHERE tm.id IN ({pl})
            """
            async with db.conn.execute(query, m_ids) as cur:
                for r in await cur.fetchall():
                    members_list.append({
                        "id": r[0],
                        "fio": r[1],
                        "tg_user_id": r[2],
                        "position": r[3],
                        "team_id": r[4],
                        "team_name": r[5] or f"Бригада {r[4]}"
                    })
    app_dict['members_data'] = members_list

    # v2.4.3: flag teams as partial when fewer than all-their-members are
    # selected in THIS application. Kanban / ViewApp render "(част.)".
    teams_partial: dict[int, bool] = {}
    team_field = app_dict.get('team_id')
    team_ids = []
    if team_field and str(team_field) != '0':
        for part in str(team_field).split(','):
            part = part.strip()
            if part.isdigit():
                team_ids.append(int(part))
    if team_ids:
        try:
            pl = ','.join(['?'] * len(team_ids))
            async with db.conn.execute(
                f"SELECT team_id, COUNT(*) FROM team_members WHERE team_id IN ({pl}) GROUP BY team_id",
                team_ids,
            ) as _tc:
                totals = {int(r[0]): int(r[1]) for r in await _tc.fetchall()}
        except Exception:
            totals = {}
        selected_by_team: dict[int, int] = {}
        for m in members_list:
            tid = m.get('team_id')
            if tid is not None:
                selected_by_team[int(tid)] = selected_by_team.get(int(tid), 0) + 1
        for tid in team_ids:
            total = totals.get(tid, 0)
            used = selected_by_team.get(tid, 0)
            # Partial = team is referenced but some members are not used here
            teams_partial[tid] = total > 0 and 0 < used < total
    app_dict['teams_partial'] = teams_partial


async def get_active_objects_list(tg_id: int = 0):
    """Get active objects sorted by user's last used."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute(
            "SELECT id, name, address, default_team_ids, default_equip_ids FROM objects WHERE is_archived = 0 ORDER BY name") as cur:
        rows = await cur.fetchall()
        objects = [{"id": r[0], "name": r[1], "address": r[2], "default_team_ids": r[3], "default_equip_ids": r[4]} for r in rows]

    if tg_id:
        real_id = await resolve_id(tg_id)
        try:
            async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
                row = await cur.fetchone()
                if row and row[0]:
                    last_ids = json.loads(row[0])
                    def sort_key(obj):
                        try:
                            return last_ids.index(obj['id'])
                        except ValueError:
                            return len(last_ids) + obj['id']
                    objects.sort(key=sort_key)
        except:
            pass

    return objects


def _parse_driver_assignments(payload: str) -> list[tuple[int, int]]:
    """Parse driver_assignments JSON payload (sent by Create/Edit modals).
    Accepts a list of ``{equipment_id, driver_user_id}`` dicts; entries
    with falsy driver_user_id are dropped. driver_user_id may be negative
    (synthetic). Equipment de-duplication is handled by the caller via
    UPSERT.
    """
    if not payload:
        return []
    try:
        raw = json.loads(payload)
    except Exception:
        return []
    out: list[tuple[int, int]] = []
    if not isinstance(raw, list):
        return out
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        eq = entry.get("equipment_id")
        drv = entry.get("driver_user_id")
        if not eq or not drv:
            continue
        try:
            out.append((int(eq), int(drv)))
        except (TypeError, ValueError):
            continue
    return out


def _norm_slot(t) -> str:
    """Normalize a slot time (int hour or 'HH' or 'HH:MM') to 'HH:MM'."""
    if t is None:
        return ""
    s = str(t).strip()
    if not s:
        return ""
    if ":" in s:
        return s
    try:
        return f"{int(s):02d}:00"
    except ValueError:
        return s


def _slot_for_equipment_in_payload(
    equipment_data_json: str, equipment_id: int,
) -> tuple[str, str]:
    """Pull (time_start, time_end) for ``equipment_id`` out of the
    equipment_data JSON the caller is submitting. Returns ('','') if the
    equipment isn't in the payload.
    """
    if not equipment_data_json:
        return "", ""
    try:
        arr = json.loads(equipment_data_json)
    except Exception:
        return "", ""
    if not isinstance(arr, list):
        return "", ""
    for entry in arr:
        if not isinstance(entry, dict):
            continue
        try:
            if int(entry.get("id", -1)) == int(equipment_id):
                return _norm_slot(entry.get("time_start")), _norm_slot(entry.get("time_end"))
        except (TypeError, ValueError):
            continue
    return "", ""


async def _check_driver_overlap(
    date_target: str,
    assignments: list[tuple[int, int]],
    equipment_data_json: str,
    exclude_app_id: int | None = None,
    current_user: dict | None = None,
    force_assign: bool = False,
    application_id: int | None = None,
) -> None:
    """Raise HTTPException(400) if any (equipment_id, driver_user_id)
    assignment in the new payload would collide with an existing
    application_drivers row on the SAME date but on a DIFFERENT
    equipment_id and an OVERLAPPING time slot.

    A driver is allowed to swap onto/off the same equipment_id (same
    machine, different driver covers a slot is fine). Two different
    machines, same date, overlapping hours — NOT fine: a single human
    can't be in two places at once.

    v2.6.1: when ``current_user`` is moderator+ and ``force_assign``
    is True, the hard-block becomes a logged warning + audit row. The
    foreman path is unchanged. ``force_assign`` is the explicit gesture
    by the office editor; merely being moderator is not enough.

    Mirrors the equipment_availability slot-source: per-row time slots
    live in the OTHER application's equipment_data JSON; the new app's
    per-equipment slots come from the caller's own equipment_data JSON.
    Falls back to the application-level time_start/time_end ints when
    the JSON is missing or unparseable.
    """
    from fastapi import HTTPException

    if not assignments:
        return

    is_office = bool(
        current_user
        and current_user.get("role") in ("moderator", "boss", "superadmin")
    )

    # Pre-compute the new payload's per-equipment slots, normalised.
    new_slots: dict[int, tuple[str, str]] = {}
    for eq_id, _drv_id in assignments:
        ts, te = _slot_for_equipment_in_payload(equipment_data_json, eq_id)
        if not (ts and te):
            # Shouldn't happen — the equipment is in the assignment list
            # but not in equipment_data. Default to full day so any
            # existing booking on that date triggers the check.
            ts, te = "00:00", "24:00"
        new_slots[eq_id] = (ts, te)

    # One query per driver — driver-count is small (one per equipment
    # in the new payload, usually <10) and the index on
    # application_drivers covers it.
    for eq_id, drv_id in assignments:
        params: list = [drv_id, date_target]
        sql = (
            "SELECT a.id, ad.equipment_id, e.name, "
            "       a.time_start, a.time_end, a.equipment_data "
            "FROM application_drivers ad "
            "JOIN applications a ON a.id = ad.application_id "
            "LEFT JOIN equipment e ON e.id = ad.equipment_id "
            "WHERE ad.driver_user_id = ? "
            "  AND a.date_target = ? "
            "  AND a.status NOT IN ('rejected','cancelled','archived') "
            "  AND ad.equipment_id != ? "
        )
        params.append(eq_id)
        if exclude_app_id is not None:
            sql += "  AND a.id != ? "
            params.append(exclude_app_id)

        async with db.conn.execute(sql, params) as cur:
            cols = [c[0] for c in cur.description]
            existing = [dict(zip(cols, r)) for r in await cur.fetchall()]

        ns, ne = new_slots[eq_id]
        for ex in existing:
            ex_ts, ex_te = _slot_for_equipment_in_payload(
                ex.get("equipment_data") or "", int(ex["equipment_id"]),
            )
            if not (ex_ts and ex_te):
                ex_ts = _norm_slot(ex.get("time_start"))
                ex_te = _norm_slot(ex.get("time_end"))
            if not (ex_ts and ex_te):
                continue
            # Half-open overlap: [a,b) intersects [c,d) iff a<d and c<b.
            if ns < ex_te and ex_ts < ne:
                # Resolve the driver's ФИО for a friendlier message.
                async with db.conn.execute(
                    "SELECT fio FROM users WHERE user_id = ?", (drv_id,),
                ) as c2:
                    r = await c2.fetchone()
                drv_fio = (r[0] if r and r[0] else f"#{drv_id}")
                other_eq_name = ex.get("name") or f"#{ex['equipment_id']}"

                # v2.6.1: office override path. Moderator+ may force-assign
                # despite the conflict; the original raise becomes a warning
                # + audit row so the override is recoverable from logs.
                if is_office and force_assign:
                    logger.warning(
                        "driver_overlap_override: user=%s role=%s "
                        "force-assigned driver=%s to app=%s "
                        "despite conflict with app=%s on equipment=%s",
                        current_user.get("tg_id") or current_user.get("user_id"),
                        current_user.get("role"),
                        drv_id, application_id,
                        ex["id"], ex["equipment_id"],
                    )
                    try:
                        await db.add_log(
                            current_user.get("tg_id")
                                or current_user.get("user_id") or 0,
                            current_user.get("fio", ""),
                            (
                                f"driver_overlap_override: водитель {drv_fio} "
                                f"назначен на технику {other_eq_name} "
                                f"в {ex_ts}–{ex_te} (конфликт с заявкой "
                                f"№{ex['id']})"
                            ),
                            target_type="application",
                            target_id=application_id,
                            details=json.dumps({
                                "action": "driver_overlap_override",
                                "driver_user_id": drv_id,
                                "driver_fio": drv_fio,
                                "conflicting_application_id": ex["id"],
                                "conflicting_equipment_id": ex["equipment_id"],
                                "conflicting_equipment_name": other_eq_name,
                                "requested_equipment_id": eq_id,
                                "requested_time_start": ns,
                                "requested_time_end": ne,
                                "force_assigned_by_role": current_user.get("role"),
                            }, ensure_ascii=False),
                        )
                    except Exception as audit_err:
                        logger.error("override audit log failed: %s", audit_err)
                    # Move on to the next existing row — do NOT raise.
                    continue

                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "driver_overlap",
                        "message": (
                            f"Водитель {drv_fio} уже занят на технике "
                            f"«{other_eq_name}» в {ex_ts}–{ex_te}"
                        ),
                        "conflicting_application_id": ex["id"],
                        "conflicting_equipment_id": ex["equipment_id"],
                        "conflicting_equipment_name": other_eq_name,
                        "driver_user_id": drv_id,
                        "driver_fio": drv_fio,
                        "requested_equipment_id": eq_id,
                        "requested_time_start": ns,
                        "requested_time_end": ne,
                    },
                )


async def _apply_driver_assignments(app_id: int, assignments: list[tuple[int, int]]):
    """Replace all driver_assignments for the app in a single transaction.
    Returns (added, removed) tuples for diff-aware notifications."""
    async with db.conn.execute(
        "SELECT equipment_id, driver_user_id FROM application_drivers "
        "WHERE application_id = ?",
        (app_id,),
    ) as cur:
        prev = {(int(r[0]), int(r[1])) for r in await cur.fetchall()}

    new = set(assignments)

    try:
        await db.conn.execute(
            "DELETE FROM application_drivers WHERE application_id = ?",
            (app_id,),
        )
        seen: set[int] = set()
        for eq_id, drv_id in assignments:
            if eq_id in seen:
                continue
            seen.add(eq_id)
            await db.conn.execute(
                "INSERT INTO application_drivers "
                "(application_id, equipment_id, driver_user_id) VALUES (?, ?, ?)",
                (app_id, eq_id, drv_id),
            )
        await db.conn.commit()
    except Exception:
        await db.conn.rollback()
        raise

    return list(new - prev), list(prev - new)


async def create_application(tg_id, team_id, date_target, object_address, comment,
                             selected_members, equipment_data, object_id,
                             driver_assignments: str = "",
                             current_user: dict | None = None,
                             force_assign: bool = False):
    """Create a new application. Returns (app_id, real_tg_id, fio) or raises.

    v2.6.1: ``current_user`` + ``force_assign`` are forwarded to the
    driver-overlap check so moderator+ can override conflicts on the
    review screen. CreateAppModal callers (foreman path) never set
    force_assign, so behavior there is unchanged.
    """
    from fastapi import HTTPException
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    fio = dict(user).get('fio', 'Web-Пользователь') if user else "Web-Пользователь"

    occupied = await db.check_resource_availability(
        date_target, object_id, team_id, equipment_data,
        selected_members=selected_members,
    )
    if occupied:
        raise HTTPException(409, "Ошибка создания наряда:\n" + "\n".join(occupied))

    # v2.6 commit 3: defense-in-depth driver-overlap check. The FE
    # DriverPickerModal already hard-blocks at picker time using the
    # availability endpoint; this server-side check guards against
    # stale-cache races and direct API callers (curl / scripts).
    assignments = _parse_driver_assignments(driver_assignments)
    if assignments:
        await _check_driver_overlap(
            date_target, assignments, equipment_data,
            exclude_app_id=None,  # creating new app — no self to exclude
            current_user=current_user,
            force_assign=force_assign,
        )

    cursor = await db.conn.execute(
        "INSERT INTO applications (foreman_id, foreman_name, team_id, object_id, date_target, object_address, time_start, time_end, comment, status, selected_members, equipment_data, is_team_freed, freed_team_ids) VALUES (?, ?, ?, ?, ?, ?, '08', '17', ?, 'waiting', ?, ?, 0, '')",
        (real_tg_id, fio, team_id, object_id, date_target, object_address, comment, selected_members, equipment_data))
    new_app_id = cursor.lastrowid
    await db.conn.commit()

    if assignments:
        await _apply_driver_assignments(new_app_id, assignments)

    await db.add_log(real_tg_id, fio, f"Создал заявку на {object_address} ({date_target})", target_type='application', target_id=new_app_id)
    return new_app_id, real_tg_id, fio


async def update_application(app_id, tg_id, team_id, date_target, object_address,
                             comment, selected_members, equipment_data, object_id,
                             driver_assignments: str = "",
                             current_user: dict | None = None,
                             force_assign: bool = False):
    """Update an existing waiting application. Returns
    (real_tg_id, fio, driver_diff) where driver_diff is
    {"added": [(eq, drv), ...], "removed": [...], "changed_fields": [...],
     "foreman_user_id": int} for the caller to fire
    notify_driver_assignment + notify_foreman_of_moderator_edit on changes.

    v2.6.1: ``current_user`` is recorded so the router can decide whether
    to fire the moderator-edit summary notification. ``force_assign``
    forwards to the driver-overlap check (office-only override).
    """
    from fastapi import HTTPException
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(403)

    # v2.6.1: snapshot the previous state BEFORE the update so we can
    # diff the editable fields and emit a summary notification when a
    # moderator edits someone else's application.
    async with db.conn.execute(
        "SELECT status, foreman_id, team_id, date_target, object_id, "
        "       object_address, comment, selected_members, equipment_data "
        "FROM applications WHERE id = ?",
        (app_id,),
    ) as cur:
        prev_row = await cur.fetchone()
    if not prev_row or prev_row[0] != 'waiting':
        raise HTTPException(400, "Заявка уже в работе или проверена")
    (_prev_status, prev_foreman_id, prev_team_id, prev_date, prev_object_id,
     prev_object_address, prev_comment, prev_members, prev_equipment_data) = prev_row

    occupied = await db.check_resource_availability(
        date_target, object_id, team_id, equipment_data,
        exclude_app_id=app_id,
        selected_members=selected_members,
    )
    if occupied:
        raise HTTPException(409, "Ошибка обновления наряда:\n" + "\n".join(occupied))

    # v2.6 commit 3: defense-in-depth driver-overlap check (UPDATE path).
    # We exclude self (`exclude_app_id=app_id`) so re-saving an unchanged
    # application doesn't trip over its own existing slot.
    parsed_for_check = (
        _parse_driver_assignments(driver_assignments)
        if driver_assignments is not None else []
    )
    if parsed_for_check:
        await _check_driver_overlap(
            date_target, parsed_for_check, equipment_data,
            exclude_app_id=app_id,
            current_user=current_user,
            force_assign=force_assign,
            application_id=app_id,
        )

    try:
        await db.conn.execute(
            "UPDATE applications SET team_id=?, date_target=?, object_address=?, object_id=?, comment=?, selected_members=?, equipment_data=? WHERE id = ?",
            (team_id, date_target, object_address, object_id, comment, selected_members, equipment_data, app_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()

    diff = {"added": [], "removed": [], "changed_fields": [], "foreman_user_id": prev_foreman_id}
    if driver_assignments is not None:
        added, removed = await _apply_driver_assignments(app_id, parsed_for_check)
        diff["added"] = added
        diff["removed"] = removed

    # v2.6.1: compute the list of changed top-level fields for the
    # moderator-edit summary notification. Field names only — no
    # before/after values, no PII (the foreman re-opens the application
    # to see what specifically changed).
    changed: list[str] = []
    if str(prev_date or "") != str(date_target or ""):
        changed.append("date_target")
    if int(prev_object_id or 0) != int(object_id or 0):
        changed.append("object_id")
    if (prev_object_address or "") != (object_address or ""):
        # Object address changes only count if object_id didn't already
        # — otherwise we'd double-count the same edit.
        if "object_id" not in changed:
            changed.append("object_address")
    if (prev_comment or "") != (comment or ""):
        changed.append("comment")
    if str(prev_team_id or "") != str(team_id or ""):
        changed.append("team_id")
    if (prev_members or "") != (selected_members or ""):
        changed.append("selected_members")
    if (prev_equipment_data or "") != (equipment_data or ""):
        changed.append("equipment")
    if diff["added"] or diff["removed"]:
        changed.append("drivers")
    diff["changed_fields"] = changed

    fio = dict(user).get('fio', 'Пользователь')
    await db.add_log(real_tg_id, fio, f"Обновил заявку на {object_address} ({date_target})", target_type='application', target_id=app_id)
    return real_tg_id, fio, diff


async def delete_application(app_id, tg_id):
    """Delete an application with cascade resource release. Returns (real_tg_id, fio, app_dict) or raises."""
    from fastapi import HTTPException
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(403, "Нет прав для удаления заявки")

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()

    if not app_row:
        raise HTTPException(404, "Заявка не найдена")

    try:
        app_dict = dict(zip([c[0] for c in cur.description], app_row))
        if app_dict.get('status') in ['approved', 'published', 'in_progress']:
            if app_dict.get('equipment_data'):
                try:
                    eq_list = json.loads(app_dict['equipment_data'])
                    for e in eq_list:
                        await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (e['id'],))
                except:
                    pass

        await db.conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        await db.conn.commit()

        fio = dict(user).get('fio', 'Админ')
        await db.add_log(real_tg_id, fio,
                         f"Удалил заявку №{app_id} (Объект: {app_dict.get('object_address')})",
                         target_type='application', target_id=app_id)
        return real_tg_id, fio, app_dict
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка удаления: {e}")


async def update_last_used_objects(user_id: int, object_id: int):
    """Update user's last used objects list."""
    from fastapi import HTTPException
    real_id = await resolve_id(user_id)
    user = await db.get_user(real_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    last_used = '[]'
    try:
        async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                last_used = row[0]
    except:
        pass

    try:
        ids = json.loads(last_used)
    except:
        ids = []

    if object_id in ids:
        ids.remove(object_id)
    ids.insert(0, object_id)
    ids = ids[:10]

    await db.conn.execute("UPDATE users SET last_used_objects = ? WHERE user_id = ?", (json.dumps(ids), real_id))
    await db.conn.commit()


async def get_last_used_objects(user_id: int):
    """Get user's last used objects list."""
    real_id = await resolve_id(user_id)
    try:
        async with db.conn.execute("SELECT last_used_objects FROM users WHERE user_id = ?", (real_id,)) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                return json.loads(row[0])
    except:
        pass
    return []
