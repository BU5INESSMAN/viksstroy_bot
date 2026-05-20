import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Request, Query, Depends
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import logging
from datetime import datetime
from database_deps import db, TZ_BARNAUL
from auth_deps import get_current_user, require_role
from utils import normalize_invite_code
from services.notifications import notify_users, notify_group_chat
from services.image_service import process_base64_image

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Equipment"])

_require_office = require_role("superadmin", "boss", "moderator")


@router.post("/api/equipment/set_free")
async def set_equipment_free(current_user=Depends(get_current_user)):
    real_tg_id = current_user["tg_id"]
    try:
        await db.conn.execute("UPDATE equipment SET status = 'free' WHERE tg_id = ?", (real_tg_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()

    fio = current_user.get('fio', '')
    await db.add_log(real_tg_id, fio, "Освободил свою технику", target_type='equipment')

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_free_notification():
        try:
            await notify_group_chat(
                f"🟢 <b>Техника освобождена</b>\n👤 Водитель: {fio}\n🕒 Время: {now}", "equipment")
        except Exception as e:
            logger.error(f"Equipment free notification error: {e}")

    asyncio.create_task(_send_free_notification())
    return {"status": "ok"}


@router.get("/api/equipment/admin_list")
async def admin_equip_list(current_user=Depends(get_current_user)):
    # v2.6: enrich with the default-driver's ФИО via JOIN on
    # equipment.default_driver_user_id (the office-owned relation
    # introduced in m_2026_05_invert_default). The FE EquipmentCard
    # renders `default_driver_fio` directly; the user_id stays in
    # `default_driver_user_id` for the picker modal.
    async with db.conn.execute(
        """SELECT e.*,
                  u.fio AS default_driver_fio
             FROM equipment e
             LEFT JOIN users u ON u.user_id = e.default_driver_user_id
            ORDER BY e.category, e.name"""
    ) as cur:
        rows = await cur.fetchall()
        equip = [dict(zip([c[0] for c in cur.description], r)) for r in rows]

    # Strip sensitive fields for non-office users
    role = current_user.get("role")
    if role not in ("superadmin", "boss", "moderator"):
        for eq in equip:
            eq.pop("invite_code", None)

    return equip


@router.get("/api/equipment/availability")
async def equipment_availability(date: str = Query(...), current_user=Depends(get_current_user)):
    """Returns all equipment with time-slot availability for a given date."""

    # Get base hours from settings
    base_start = "08:00"
    base_end = "18:00"
    exchange_on = "1"
    try:
        async with db.conn.execute("SELECT key, value FROM settings WHERE key IN ('equip_base_time_start', 'equip_base_time_end', 'exchange_enabled')") as cur:
            for row in await cur.fetchall():
                if row[0] == 'equip_base_time_start': base_start = row[1] or "08:00"
                elif row[0] == 'equip_base_time_end': base_end = row[1] or "18:00"
                elif row[0] == 'exchange_enabled': exchange_on = row[1] or "1"
    except Exception:
        pass

    def time_to_minutes(t: str) -> int:
        parts = str(t).split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return h * 60 + m

    def minutes_to_time(m: int) -> str:
        return f"{m // 60:02d}:{m % 60:02d}"

    base_start_m = time_to_minutes(base_start)
    base_end_m = time_to_minutes(base_end)

    # Get all equipment
    # v2.6.1: include default_driver_fio so the create/edit modals can
    # auto-fill the driver slot with a human-readable name on equipment
    # add. Same JOIN shape as admin_equip_list and the dashboard bundle.
    async with db.conn.execute(
        """SELECT e.*, u.fio AS default_driver_fio
             FROM equipment e
             LEFT JOIN users u ON u.user_id = e.default_driver_user_id
            WHERE e.is_active = 1
            ORDER BY e.category, e.name"""
    ) as cur:
        eq_rows = await cur.fetchall()
        eq_cols = [c[0] for c in cur.description]
    all_equip = [dict(zip(eq_cols, r)) for r in eq_rows]

    # Get all apps for the date
    async with db.conn.execute(
        "SELECT * FROM applications WHERE date_target = ? AND status NOT IN ('rejected', 'cancelled')", (date,)
    ) as cur:
        app_rows = await cur.fetchall()
        app_cols = [c[0] for c in cur.description]
    apps = [dict(zip(app_cols, r)) for r in app_rows]

    # Get foreman names
    foreman_names = {}
    for a in apps:
        fid = a.get('foreman_id')
        if fid and fid not in foreman_names:
            foreman_names[fid] = a.get('foreman_name', f'Прораб {fid}')

    # Get pending exchange equip ids
    pending_exchange_ids = set()
    try:
        async with db.conn.execute(
            "SELECT requested_equip_id, offered_equip_id FROM equipment_exchanges WHERE status = 'pending'"
        ) as cur:
            for row in await cur.fetchall():
                pending_exchange_ids.add(row[0])
                pending_exchange_ids.add(row[1])
    except Exception:
        pass

    # Build busy_slots per equipment
    equip_busy = {}
    for a in apps:
        eq_data = a.get('equipment_data', '')
        if not eq_data:
            continue
        try:
            eq_list = json.loads(eq_data)
        except (json.JSONDecodeError, TypeError):
            continue
        for eq in eq_list:
            if not isinstance(eq, dict) or eq.get('is_freed'):
                continue
            eid = eq.get('id')
            if eid is None:
                continue
            ts = str(eq.get('time_start', '08'))
            te = str(eq.get('time_end', '17'))
            if ':' not in ts: ts = f"{int(ts):02d}:00"
            if ':' not in te: te = f"{int(te):02d}:00"

            can_ex = (a.get('status') in ('pending', 'waiting') and
                      eid not in pending_exchange_ids and
                      exchange_on == "1")

            slot = {
                "app_id": a['id'],
                "foreman_name": foreman_names.get(a.get('foreman_id'), ''),
                "object_address": a.get('object_address', ''),
                "time_start": ts,
                "time_end": te,
                "app_status": a.get('status', ''),
                "can_exchange": can_ex,
            }
            equip_busy.setdefault(eid, []).append(slot)

    # Build result
    result = []
    for eq in all_equip:
        eid = eq['id']
        busy_slots = equip_busy.get(eid, [])
        in_exchange = eid in pending_exchange_ids

        if eq.get('status') == 'repair':
            result.append({
                "id": eid, "name": eq.get('name', ''),
                "category": eq.get('category', ''),
                "license_plate": eq.get('license_plate', ''),
                # v2.6 commit 7: driver_fio dropped — drivers anchor on
                # application_drivers per-app; default driver lives on
                # equipment.default_driver_user_id.
                "status": "repair",
                "busy_slots": [], "free_slots": [],
                "is_in_pending_exchange": in_exchange,
                "exchange_enabled": exchange_on == "1",
            })
            continue

        # Calculate free slots
        busy_sorted = sorted(busy_slots, key=lambda s: time_to_minutes(s['time_start']))
        occupied = [(time_to_minutes(s['time_start']), time_to_minutes(s['time_end'])) for s in busy_sorted]

        free_slots = []
        cursor_m = base_start_m
        for occ_start, occ_end in occupied:
            if cursor_m < occ_start:
                free_slots.append({"time_start": minutes_to_time(cursor_m), "time_end": minutes_to_time(occ_start)})
            cursor_m = max(cursor_m, occ_end)
        if cursor_m < base_end_m:
            free_slots.append({"time_start": minutes_to_time(cursor_m), "time_end": minutes_to_time(base_end_m)})

        status = "free" if len(busy_slots) == 0 else ("busy" if len(free_slots) == 0 else "partial")

        result.append({
            "id": eid, "name": eq.get('name', ''),
            "category": eq.get('category', ''),
            "license_plate": eq.get('license_plate', ''),
            # v2.6 commit 7: driver_fio dropped from this response.
            "status": status,
            "busy_slots": busy_sorted,
            "free_slots": free_slots,
            "is_in_pending_exchange": in_exchange,
            "exchange_enabled": exchange_on == "1",
        })

    return result


@router.post("/api/equipment/create")
@router.post("/api/equipment/add")
async def add_equipment(name: str = Form(...), category: str = Form(...),
                        driver: str = Form(""),       # v2.6: legacy field, silently dropped
                        driver_fio: str = Form(""),   # v2.6: legacy field, silently dropped
                        license_plate: str = Form(""),
                        current_user=Depends(_require_office)):
    # v2.6: stop writing ФИО into equipment.driver / equipment.driver_fio
    # from ingestion forms. The fields are still accepted in the form body
    # for one release so a stale client (e.g. cached SPA bundle) doesn't
    # 422; we just drop the values server-side. Driver identity now lives
    # in `users.fio` and per-application assignment lives in
    # application_drivers (commits 3+4). Default-driver-per-equipment is
    # set on the Equipment page via PATCH .../default-driver (commit 2).
    if driver or driver_fio:
        logger.debug(
            "single-add: ignored deprecated field(s) driver=%r driver_fio=%r "
            "from legacy client (equipment.name=%r)",
            driver, driver_fio, name,
        )

    try:
        # Write NULL into driver / driver_fio — schema default is empty
        # string / NULL respectively, so the row reads as "no legacy
        # driver" to anything still looking at those columns.
        await db.conn.execute(
            "INSERT INTO equipment (name, category, driver, driver_fio, status, license_plate) "
            "VALUES (?, ?, NULL, NULL, 'free', ?)",
            (name, category, license_plate),
        )
        await db.conn.commit()
    except:
        await db.conn.rollback()

    fio = current_user.get('fio', 'Админ')
    tg_id = current_user["tg_id"]
    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_add_equip_notification():
        try:
            await notify_users(["report_group", "boss", "superadmin"],
                               f"🚜 <b>Новая техника</b>\n👤 Добавил: {fio}\n🚜 Название: {name}\n🕒 Время: {now}", "equipment", category="orders")
        except Exception as e:
            logger.error(f"Equipment add notification error: {e}")

    asyncio.create_task(_send_add_equip_notification())
    await db.add_log(tg_id, fio, f"Добавил технику: {name}", target_type='equipment')
    return {"status": "ok"}


@router.post("/api/equipment/bulk_add")
async def bulk_add_equipment(request: Request, current_user=Depends(_require_office)):
    # JSON-shaped bulk path. v2.6 still writes the `driver` column here for
    # backward compatibility with any programmatic integration that posts
    # to /bulk_add — its retirement is scheduled for commit 7 alongside
    # equipment.driver / driver_fio. The text-based FE flow uses the
    # /bulk_upload route below which never writes driver fields.
    data = await request.json()
    items = data.get("items", [])
    count = 0
    try:
        for item in items:
            name = item.get("name", "").strip()
            category = item.get("category", "Другое").strip()
            driver = item.get("driver", "").strip()
            if name:
                await db.conn.execute("INSERT INTO equipment (name, category, driver, status) VALUES (?, ?, ?, 'free')",
                                      (name, category, driver))
                count += 1
        await db.conn.commit()
    except:
        await db.conn.rollback()

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_bulk_equip_notification():
        try:
            await notify_users(["report_group", "boss", "superadmin"],
                               f"🚜 <b>Массовая загрузка техники</b>\n✅ Загружено единиц: {count}\n🕒 Время: {now}", "equipment", category="orders")
        except Exception as e:
            logger.error(f"Equipment bulk add notification error: {e}")

    asyncio.create_task(_send_bulk_equip_notification())
    fio = current_user.get('fio', 'Админ')
    await db.add_log(current_user["tg_id"], fio, f"Массовая загрузка техники: {count} ед.", target_type='equipment')
    return {"status": "ok", "added": count}


# =============================================
# v2.6: text-based bulk import (Option B from BULK_IMPORT_ANALYSIS.md)
# =============================================
#
# The frontend BulkUploadForm has been POSTing `text=...` to
# /api/equipment/bulk_upload for a while; that endpoint never existed on
# the backend, so the button was effectively a 404. This route fills
# that gap with the Option-B semantics decided after the analysis pass:
#
#   - New format (3 fields per line, pipe-separated):
#         <name> | <category> | <license_plate?>
#     The 3rd field (plate) is optional; empty is allowed.
#
#   - Old format (3 fields, last is a person's ФИО) and any wider/narrower
#     row are rejected up-front with HTTP 400 and a clear pointer to the
#     Equipment page where drivers are now assigned.
#
# Pre-validation pass before any INSERT means a single bad row aborts
# the entire upload — there is no partial-import state to clean up.
#
# The driver/driver_fio columns are NEVER written by this endpoint.


# Russian plate pattern catches license_plate values like "А123АА22" /
# "Е777ЕЕ123" (any letter/digit pattern with at least one digit). Used
# as the "this is not a ФИО" signal.
_PLATE_HAS_DIGIT = __import__("re").compile(r"\d")
# Cyrillic-word heuristic. A ФИО has letters and is space-separated; a
# plate does not. Anything containing whitespace AND letters AND NO
# digits is suspicious enough to call as ФИО (false positive on a
# multi-word category name is fine here since category goes in field 2,
# not field 3).
_LOOKS_LIKE_NAME = __import__("re").compile(r"^[^\d]+\s[^\d]+$")


def _looks_like_fio(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return False
    # Plates always contain digits — quick exclusion.
    if _PLATE_HAS_DIGIT.search(s):
        return False
    # >=2 words, none of which contain a digit → ФИО-ish.
    return bool(_LOOKS_LIKE_NAME.match(s))


@router.post("/api/equipment/bulk_upload")
async def bulk_upload_equipment(
    text: str = Form(...),
    current_user=Depends(_require_office),
):
    """Text-based bulk equipment import (Option B, v2.6).

    Format per line: ``name | category | plate``. Plate is optional —
    omit the 3rd field or leave it blank. Comment lines (``#``) and
    blanks are skipped.

    Old format with a trailing ФИО column is rejected with HTTP 400
    and a message pointing the operator at the Equipment page for
    driver assignment.
    """
    raw_lines = (text or "").splitlines()

    # ── Pre-validation pass ───────────────────────────────────────
    parsed: list[tuple[int, str, str, str]] = []  # (line_no, name, category, plate)
    for idx, raw in enumerate(raw_lines, start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        fields = [p.strip() for p in line.split("|")]

        if len(fields) < 2:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "bad_format",
                    "message": (
                        "Каждая строка должна содержать минимум 2 поля, "
                        "разделённых символом `|`: название и категория."
                    ),
                    "rejected_line_number": idx,
                    "rejected_line": line[:200],
                },
            )
        if len(fields) > 3:
            # >3 strongly suggests the old "category|name|fio|extra" or
            # the proposed-but-unused 5-field format. Either way, reject
            # with the format-changed message.
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "format_changed",
                    "message": (
                        "Формат импорта изменён в v2.6: колонка ФИО водителя "
                        "удалена. Используйте формат "
                        "`название | категория | госномер`. "
                        "Водитель назначается на странице «Техника» после "
                        "загрузки (кнопка «Изменить» рядом с «Драйвер по "
                        "умолчанию»)."
                    ),
                    "rejected_line_number": idx,
                    "rejected_line": line[:200],
                },
            )

        name = fields[0]
        category = fields[1] if len(fields) >= 2 else ""
        plate = fields[2] if len(fields) >= 3 else ""

        if not name:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "bad_format",
                    "message": "Поле «название» обязательно.",
                    "rejected_line_number": idx,
                    "rejected_line": line[:200],
                },
            )
        if not category:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "bad_format",
                    "message": "Поле «категория» обязательно.",
                    "rejected_line_number": idx,
                    "rejected_line": line[:200],
                },
            )

        # ФИО-detection on the 3rd field: matches the legacy template
        # "Категория | Название | ФИО" where the last column was a name.
        if plate and _looks_like_fio(plate):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "format_changed",
                    "message": (
                        "Похоже, последний столбец содержит ФИО водителя — "
                        "это старый формат. В v2.6 ФИО больше не указывается "
                        "при импорте: используйте "
                        "`название | категория | госномер` и назначьте "
                        "водителя на странице «Техника» после загрузки."
                    ),
                    "rejected_line_number": idx,
                    "rejected_line": line[:200],
                    "rejected_field": plate[:120],
                },
            )

        parsed.append((idx, name, category, plate))

    # ── Insert pass ───────────────────────────────────────────────
    inserted = 0
    try:
        for _idx, name, category, plate in parsed:
            await db.conn.execute(
                "INSERT INTO equipment "
                "(name, category, driver, driver_fio, status, license_plate) "
                "VALUES (?, ?, NULL, NULL, 'free', ?)",
                (name, category, plate),
            )
            inserted += 1
        await db.conn.commit()
    except Exception:
        await db.conn.rollback()
        raise HTTPException(status_code=500, detail="Ошибка вставки в БД")

    # ── Audit log ─────────────────────────────────────────────────
    try:
        await db.add_log(
            current_user["tg_id"],
            current_user.get("fio", "Система"),
            f"Массовая загрузка техники (текст): {inserted} ед.",
            target_type="equipment",
            target_id=None,
            details=json.dumps({
                "action": "equipment_bulk_upload",
                "role": current_user.get("role", ""),
                "format_version": 2,
                "total_lines": len(raw_lines),
                "inserted": inserted,
                "skipped_blank_or_comment": len(raw_lines) - len(parsed),
            }, ensure_ascii=False),
        )
    except Exception:
        pass

    # Fire-and-forget the same notification /bulk_add sends — keeps ops
    # in the loop for either path.
    async def _send_bulk_equip_notification():
        try:
            now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
            await notify_users(
                ["report_group", "boss", "superadmin"],
                f"🚜 <b>Массовая загрузка техники</b>\n"
                f"✅ Загружено единиц: {inserted}\n🕒 Время: {now}",
                "equipment", category="orders",
            )
        except Exception as e:
            logger.error(f"Equipment bulk upload notification error: {e}")

    asyncio.create_task(_send_bulk_equip_notification())

    return {"ok": True, "inserted": inserted, "added": inserted}


@router.post("/api/equipment/{equip_id}/update_photo")
async def update_equip_photo(equip_id: int, photo_base64: str = Form(...), current_user=Depends(get_current_user)):
    url = process_base64_image(photo_base64, f"equip_{equip_id}")
    if url:
        try:
            await db.conn.execute("UPDATE equipment SET photo_url=? WHERE id=?", (url, equip_id))
            await db.conn.commit()
        except:
            await db.conn.rollback()
        return {"status": "ok", "photo_url": url}
    raise HTTPException(400, "Ошибка фото")


@router.put("/api/equipment/{equip_id}")
async def edit_equipment(equip_id: int, request: Request, current_user=Depends(_require_office)):
    data = await request.json()
    name = data.get('name', '').strip()
    category = data.get('category', '').strip()
    license_plate = data.get('license_plate', '').strip()
    # v2.6 commit 7: `driver_fio` in the request body is silently ignored.
    # Driver identity now lives in users.fio + application_drivers; the
    # default-driver-per-equipment is set via the dedicated endpoint
    # PATCH /api/equipment/{id}/default-driver.
    if 'driver_fio' in data and (data.get('driver_fio') or '').strip():
        logger.debug(
            "edit_equipment: ignored deprecated field driver_fio=%r "
            "(equipment_id=%s)", data.get('driver_fio'), equip_id,
        )
    if not name or not category:
        raise HTTPException(status_code=400, detail="Название и категория обязательны")
    try:
        await db.conn.execute("UPDATE equipment SET name=?, category=?, license_plate=? WHERE id=?",
                              (name, category, license_plate, equip_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()
        raise HTTPException(status_code=500, detail="Ошибка базы данных")
    async with db.conn.execute("SELECT * FROM equipment WHERE id=?", (equip_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    admin_fio = current_user.get('fio', 'Админ')
    await db.add_log(current_user["tg_id"], admin_fio, f"Обновил технику: {name}", target_type='equipment', target_id=equip_id)
    return dict(zip([c[0] for c in cur.description], row))


@router.post("/api/equipment/{equip_id}/update")
async def update_equipment(equip_id: int, name: str = Form(...), category: str = Form(...), driver: str = Form(""),
                           status: str = Form("free"), license_plate: str = Form(""),
                           current_user=Depends(_require_office)):
    try:
        await db.conn.execute("UPDATE equipment SET name=?, category=?, driver=?, status=?, license_plate=? WHERE id=?",
                              (name, category, driver, status, license_plate, equip_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}


@router.post("/api/equipment/{equip_id}/delete")
async def delete_equipment(equip_id: int, current_user=Depends(_require_office)):
    eq_name = f"№{equip_id}"
    async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (equip_id,)) as cur:
        row = await cur.fetchone()
        if row: eq_name = row[0]
    try:
        await db.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    fio = current_user.get('fio', 'Админ')
    await db.add_log(current_user["tg_id"], fio, f"Удалил технику: {eq_name}", target_type='equipment', target_id=equip_id)
    return {"status": "ok"}


@router.post("/api/equipment/{equip_id}/generate_invite")
async def generate_equip_invite(equip_id: int, current_user=Depends(_require_office)):
    code = await db.get_or_create_equip_invite(equip_id)
    return {
        "invite_link": f"https://miniapp.viks22.ru/equip-invite/{code}",
        "tg_bot_link": f"https://t.me/viksstroy_bot?start=equip_{code}",
        "invite_code": code,
        "join_password": code
    }


@router.get("/api/equipment/invite/{invite_code}")
async def get_equip_invite_info(invite_code: str):
    """Public endpoint — invite landing page for drivers."""
    async with db.conn.execute("SELECT id, name, category, license_plate FROM equipment WHERE invite_code = ?", (invite_code,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return {"id": row[0], "name": row[1], "category": row[2], "license_plate": row[3]}


@router.post("/api/equipment/invite/join")
async def join_equipment(invite_code: str = Form(...), current_user=Depends(get_current_user)):
    """LEGACY (DEPRECATED v2.6): equipment-bound driver redemption.

    v2.6 commit 7: rewritten to use the inverted-ownership model. The
    flow is now:

      1. Look up equipment by legacy ``invite_code``.
      2. If the equipment has a ``default_driver_user_id`` (set during
         the v2.6 migrations or via the office "Драйвер по умолчанию"
         picker), swap that synthetic driver row into the redeeming
         user — application_drivers + driver_categories cascade
         automatically via driver_service.redeem_synthetic_driver.
      3. Otherwise, promote the redeeming user to role='driver',
         attach them to the equipment's category, and (this is the
         only legacy-style write left) set
         ``equipment.default_driver_user_id`` to the redeeming user
         so this equipment is now their default in the new model.
      4. Invalidate legacy ``equipment.tg_id`` and
         ``equipment.invite_code`` so the link cannot be reused.

    NO read of ``equipment.driver_fio`` — the FIO comes from the
    redeeming user's existing ``users.fio`` (or the bot-supplied
    ``current_user['fio']``). NO write to ``users.default_equipment_id``
    — the inverted model is the source of truth post-v2.6.

    The new bridge endpoint at POST /api/auth/equip_invite_bridge
    handles the *anonymous* saved-link case (when the user is not
    already authenticated via TG/MAX); this endpoint stays for the
    bot-driven flow where the user IS authenticated already.
    """
    from services import driver_service

    real_tg_id = current_user["tg_id"]
    invite_code = normalize_invite_code(invite_code)

    async with db.conn.execute(
        "SELECT id, name, category, default_driver_user_id "
        "FROM equipment WHERE invite_code = ?",
        (invite_code,),
    ) as cur:
        eq_row = await cur.fetchone()
    if not eq_row:
        raise HTTPException(status_code=404, detail="Техника не найдена")

    eq_id, eq_name, eq_category, default_drv_uid = (
        eq_row[0], eq_row[1], (eq_row[2] or ""), eq_row[3],
    )
    logger.warning(
        "legacy equipment invite redeemed for equipment_id=%s — "
        "bridging to driver-personal model (v2.6)",
        eq_id,
    )

    fio = current_user.get("fio", "")

    try:
        # Path A: equipment already has a synthetic driver as its
        # default — swap that row into the redeeming user. This
        # cascades driver_categories and application_drivers.
        if default_drv_uid is not None and int(default_drv_uid) < 0:
            await driver_service.redeem_synthetic_driver(
                db, int(default_drv_uid), real_tg_id,
            )
        else:
            # Path B: no synthetic to swap. Promote the redeeming user
            # to role='driver' if they aren't already a higher role,
            # attach them to the equipment's category, and set
            # equipment.default_driver_user_id = redeeming user so the
            # inverted-ownership model captures the new relation.
            user = await db.get_user(real_tg_id)
            if not user:
                await db.add_user(real_tg_id, fio or f"Пользователь {real_tg_id}", "driver")
            else:
                role = dict(user).get("role")
                if role not in ("foreman", "moderator", "boss", "superadmin"):
                    await db.update_user_role(real_tg_id, "driver")
            if eq_category:
                await db.conn.execute(
                    "INSERT OR IGNORE INTO equipment_category_settings (category, icon) "
                    "VALUES (?, NULL)",
                    (eq_category,),
                )
                await db.conn.execute(
                    "INSERT OR IGNORE INTO driver_categories (user_id, category) "
                    "VALUES (?, ?)",
                    (real_tg_id, eq_category),
                )
            # Set the inverted-ownership pointer only if no real
            # driver is already the default (don't clobber an office
            # assignment).
            await db.conn.execute(
                "UPDATE equipment SET default_driver_user_id = "
                "COALESCE(default_driver_user_id, ?) WHERE id = ?",
                (real_tg_id, eq_id),
            )

        # Invalidate legacy equipment-side fields — link is now driver-personal.
        await db.conn.execute(
            "UPDATE equipment SET tg_id = NULL, invite_code = NULL WHERE id = ?",
            (eq_id,),
        )
        await db.conn.commit()
    except HTTPException:
        await db.conn.rollback()
        raise
    except Exception as e:
        await db.conn.rollback()
        logger.exception("legacy equipment redemption failed: %s", e)
        raise HTTPException(status_code=500, detail="Не удалось завершить привязку")

    # Re-fetch FIO for the notification — may have been promoted from synthetic.
    user_now = await db.get_user(real_tg_id)
    if user_now:
        fio = dict(user_now).get("fio") or fio

    try:
        await db.add_log(real_tg_id, fio, f"Привязан к технике «{eq_row[1]}» по приглашению", target_type='equipment', target_id=eq_row[0])
    except Exception:
        pass

    now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

    async def _send_equip_join_notification():
        try:
            await notify_users(["report_group", "boss", "superadmin"],
                               f"🔗 <b>Привязка аккаунта (Техника)</b>\n👤 Водитель: {fio}\n🚜 Привязан к технике: «{eq_row[1]}»\n🕒 Время: {now}",
                               "equipment", category="new_users")
        except Exception as e:
            logger.error(f"Equipment join notification error: {e}")

    asyncio.create_task(_send_equip_join_notification())
    return {"status": "ok"}


@router.post("/api/equipment/{equip_id}/status")
async def change_equip_status(equip_id: int, status: str = Form(...), current_user=Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ('superadmin', 'boss', 'moderator', 'foreman'):
        raise HTTPException(status_code=403, detail="Нет прав")

    try:
        await db.conn.execute("UPDATE equipment SET status = ? WHERE id = ?", (status, equip_id))
        await db.conn.commit()
    except Exception:
        await db.conn.rollback()
        raise HTTPException(status_code=500, detail="Ошибка базы данных")

    return {"status": "ok"}


@router.post("/api/equipment/{equip_id}/unlink")
async def unlink_equipment(equip_id: int, current_user=Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ('superadmin', 'boss', 'moderator', 'foreman'):
        raise HTTPException(status_code=403, detail="Нет прав")
    try:
        await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE id = ?", (equip_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}


# =============================================
# v2.6: default driver per equipment (office-owned)
# =============================================
#
# These endpoints power the new "Драйвер по умолчанию" row on the
# Equipment page card. Office (moderator+) writes; everyone reads.
#
# The picker (GET .../eligible-drivers) returns category-filtered
# drivers by default; pass include_all=true to broaden to every driver
# in the system (for nonstandard assignments — e.g. driver covering
# outside their usual category).


class SetDefaultDriverPayload(BaseModel):
    user_id: Optional[int] = None  # None = clear the default


@router.patch("/api/equipment/{equipment_id}/default-driver")
async def set_default_driver(
    equipment_id: int,
    payload: SetDefaultDriverPayload,
    current_user=Depends(_require_office),
):
    """Office assigns (or clears) the default driver for an equipment unit.

    Validates that the equipment exists and, if a ``user_id`` is supplied,
    that the target user has ``role='driver'``. Audit-logged with the
    previous and new driver ids in JSON ``details`` so changes are
    reviewable.
    """
    async with db.conn.execute(
        "SELECT id, name, default_driver_user_id FROM equipment WHERE id = ?",
        (equipment_id,),
    ) as cur:
        eq = await cur.fetchone()
    if not eq:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    eq_id, eq_name, prev_driver = eq[0], eq[1], eq[2]

    new_driver = payload.user_id
    if new_driver is not None:
        async with db.conn.execute(
            "SELECT user_id, fio, role FROM users WHERE user_id = ?",
            (new_driver,),
        ) as cur:
            u = await cur.fetchone()
        if not u:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        if (u[2] or "").lower() != "driver":
            raise HTTPException(
                status_code=400,
                detail="Пользователь не является водителем",
            )

    try:
        await db.conn.execute(
            "UPDATE equipment SET default_driver_user_id = ? WHERE id = ?",
            (new_driver, eq_id),
        )
        await db.conn.commit()
    except Exception:
        await db.conn.rollback()
        raise HTTPException(status_code=500, detail="Ошибка базы данных")

    try:
        await db.add_log(
            current_user["tg_id"],
            current_user.get("fio", "Система"),
            (
                f"Назначил водителя по умолчанию для «{eq_name}»"
                if new_driver is not None
                else f"Снял водителя по умолчанию с «{eq_name}»"
            ),
            target_type="equipment",
            target_id=eq_id,
            details=json.dumps({
                "action": "set_default_driver",
                "role": current_user.get("role", ""),
                "equipment_id": eq_id,
                "equipment_name": eq_name,
                "previous_driver_user_id": prev_driver,
                "new_driver_user_id": new_driver,
            }, ensure_ascii=False),
        )
    except Exception:
        # Audit log is best-effort; the primary write already succeeded.
        pass

    return {
        "status": "ok",
        "equipment_id": eq_id,
        "default_driver_user_id": new_driver,
    }


@router.get("/api/equipment/{equipment_id}/eligible-drivers")
async def list_eligible_drivers(
    equipment_id: int,
    include_all: bool = Query(False),
    current_user=Depends(get_current_user),
):
    """Drivers the picker offers for this equipment unit.

    Default behaviour: only drivers whose ``driver_categories`` includes
    the equipment's category, ordered by recency-of-use (most recent
    first) then alphabetically.

    With ``include_all=true``: every active driver in the system, same
    ordering. The toggle exists so office can assign a driver outside
    their usual category for a one-off arrangement.

    Read-only — any authenticated user can list; the actual assignment
    is gated by ``set_default_driver`` above.
    """
    async with db.conn.execute(
        "SELECT id, name, category, default_driver_user_id FROM equipment "
        "WHERE id = ?",
        (equipment_id,),
    ) as cur:
        eq = await cur.fetchone()
    if not eq:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    eq_id, eq_name, eq_category, current_default = eq[0], eq[1], (eq[2] or ""), eq[3]

    # Same column set in both branches so the FE doesn't have to switch.
    common_cols = (
        "u.user_id, u.fio, u.last_name, u.first_name, u.middle_name, "
        "u.invite_code, "
        "edu.last_used_at AS last_used_at, "
        "COALESCE(edu.usage_count, 0) AS usage_count"
    )
    common_joins = (
        f"LEFT JOIN equipment_driver_usage edu "
        f"  ON edu.driver_user_id = u.user_id AND edu.equipment_id = ?"
    )
    order_clause = (
        "ORDER BY edu.last_used_at IS NULL ASC, edu.last_used_at DESC, "
        "u.last_name COLLATE NOCASE, u.first_name COLLATE NOCASE"
    )

    if include_all or not eq_category:
        sql = (
            f"SELECT {common_cols} FROM users u {common_joins} "
            f"WHERE u.role = 'driver' AND COALESCE(u.is_blacklisted, 0) = 0 "
            f"{order_clause}"
        )
        params = (eq_id,)
    else:
        sql = (
            f"SELECT {common_cols} FROM users u "
            f"JOIN driver_categories dc ON dc.user_id = u.user_id "
            f"{common_joins} "
            f"WHERE u.role = 'driver' AND COALESCE(u.is_blacklisted, 0) = 0 "
            f"AND dc.category = ? "
            f"{order_clause}"
        )
        params = (eq_id, eq_category)

    async with db.conn.execute(sql, params) as cur:
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in await cur.fetchall()]
    for r in rows:
        r["is_default"] = (r["user_id"] == current_default)
        r["is_synthetic"] = int(r.get("user_id") or 0) < 0

    return {
        "equipment": {
            "id": eq_id,
            "name": eq_name,
            "category": eq_category,
            "current_default_user_id": current_default,
        },
        "drivers": rows,
        "include_all": bool(include_all),
    }


# =============================================
# Stage 6: category icon settings
# =============================================

class CategoryIconPatch(BaseModel):
    icon: Optional[str] = None


@router.get("/api/equipment/category-settings")
async def get_category_settings(current_user=Depends(get_current_user)):
    """Return a flat {category_name: icon_key} map merged with every
    currently-used category so the frontend can render rows for all of
    them."""
    used: set[str] = set()
    async with db.conn.execute(
        "SELECT DISTINCT category FROM equipment WHERE category IS NOT NULL AND category != ''"
    ) as cur:
        for row in await cur.fetchall():
            if row[0]:
                used.add(row[0])

    saved: dict[str, str] = {}
    try:
        async with db.conn.execute(
            "SELECT category, icon FROM equipment_category_settings"
        ) as cur:
            for row in await cur.fetchall():
                if row[0]:
                    saved[row[0]] = row[1] or ""
    except Exception:
        pass

    categories = sorted(used | set(saved.keys()))
    return [{"category": c, "icon": saved.get(c, "")} for c in categories]


@router.patch("/api/equipment/category-settings/{category_name}")
async def set_category_icon(category_name: str, body: CategoryIconPatch,
                            current_user=Depends(_require_office)):
    """Set (or clear) the icon for an equipment category."""
    category = (category_name or "").strip()
    if not category:
        raise HTTPException(400, "Категория не указана")
    icon = (body.icon or "").strip() or None
    try:
        await db.conn.execute(
            "INSERT INTO equipment_category_settings (category, icon) VALUES (?, ?) "
            "ON CONFLICT(category) DO UPDATE SET icon = excluded.icon",
            (category, icon),
        )
        await db.conn.commit()
    except Exception as e:
        logger.error(f"Category icon save failed: {e}")
        raise HTTPException(500, "Ошибка сохранения")

    fio = current_user.get("fio", "")
    await db.add_log(
        current_user["tg_id"], fio,
        f"Установил иконку «{icon or '—'}» для категории «{category}»",
        target_type='equipment',
    )
    return {"status": "ok", "category": category, "icon": icon or ""}
