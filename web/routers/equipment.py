import sys
import os

# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Request, Query, Depends
import asyncio
import json
import logging
from datetime import datetime
from database_deps import db, TZ_BARNAUL
from auth_deps import get_current_user, require_role
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
    async with db.conn.execute("SELECT * FROM equipment ORDER BY category, name") as cur:
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
    async with db.conn.execute("SELECT * FROM equipment WHERE is_active = 1 ORDER BY category, name") as cur:
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
                "driver_fio": eq.get('driver_fio', eq.get('driver', '')),
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
            "driver_fio": eq.get('driver_fio', eq.get('driver', '')),
            "status": status,
            "busy_slots": busy_sorted,
            "free_slots": free_slots,
            "is_in_pending_exchange": in_exchange,
            "exchange_enabled": exchange_on == "1",
        })

    return result


@router.post("/api/equipment/create")
@router.post("/api/equipment/add")
async def add_equipment(name: str = Form(...), category: str = Form(...), driver: str = Form(""),
                        license_plate: str = Form(""), current_user=Depends(_require_office)):
    try:
        await db.conn.execute("INSERT INTO equipment (name, category, driver, status, license_plate) VALUES (?, ?, ?, 'free', ?)",
                              (name, category, driver, license_plate))
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
    driver_fio = data.get('driver_fio', '').strip()
    license_plate = data.get('license_plate', '').strip()
    if not name or not category:
        raise HTTPException(status_code=400, detail="Название и категория обязательны")
    try:
        await db.conn.execute("UPDATE equipment SET name=?, category=?, driver_fio=?, license_plate=? WHERE id=?",
                              (name, category, driver_fio, license_plate, equip_id))
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
    real_tg_id = current_user["tg_id"]

    async with db.conn.execute("SELECT id, name, driver_fio FROM equipment WHERE invite_code = ?", (invite_code,)) as cur:
        eq_row = await cur.fetchone()
    if not eq_row: raise HTTPException(status_code=404, detail="Техника не найдена")

    equip_driver_fio = eq_row[2] or ""
    fio = current_user.get("fio", "")

    try:
        await db.conn.execute("UPDATE equipment SET tg_id = ? WHERE id = ?", (real_tg_id, eq_row[0]))
        user = await db.get_user(real_tg_id)
        if not user:
            fio = equip_driver_fio if equip_driver_fio and equip_driver_fio != "Не указан" else f"Пользователь {real_tg_id}"
            await db.add_user(real_tg_id, fio, "driver")
        else:
            user_dict = dict(user)
            fio = user_dict.get('fio', '')
            if equip_driver_fio and equip_driver_fio != "Не указан":
                if not fio or fio.startswith("Пользователь") or fio == "Не указан":
                    fio = equip_driver_fio
                    await db.conn.execute("UPDATE users SET fio = ? WHERE user_id = ?", (fio, real_tg_id))
                    logger.info(f"Auto-set FIO '{fio}' for user {real_tg_id} from equipment '{eq_row[1]}'")
                    try:
                        await db.add_log(real_tg_id, fio, f"ФИО автоматически установлено из техники «{eq_row[1]}»", target_type='user', target_id=real_tg_id)
                    except Exception:
                        pass
            if user_dict['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']:
                await db.update_user_role(real_tg_id, "driver")
        await db.conn.commit()
    except:
        await db.conn.rollback()

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
