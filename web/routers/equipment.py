import sys
import os
# Переходим на уровень выше (в папку web), чтобы импорты сработали
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Request
import uuid
import random
from database_deps import db
from utils import resolve_id, notify_users, process_base64_image

router = APIRouter(tags=["Equipment"])

@router.post("/api/equipment/set_free")
async def set_equipment_free(tg_id: int = Form(...)):
    real_tg_id = await resolve_id(tg_id)
    try:
        await db.conn.execute("UPDATE equipment SET status = 'free' WHERE tg_id = ?", (real_tg_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    user = await db.get_user(real_tg_id)
    if user:
        fio = dict(user).get('fio', '')
        await db.add_log(real_tg_id, fio, "Освободил свою технику")
        await notify_users(["report_group"], f"🟢 <b>Техника освобождена</b>\nВодитель {fio} завершил работу.", "equipment")
    return {"status": "ok"}

@router.get("/api/equipment/admin_list")
async def admin_equip_list():
    async with db.conn.execute("SELECT * FROM equipment ORDER BY category, name") as cur: rows = await cur.fetchall()
    return [dict(zip([c[0] for c in cur.description], r)) for r in rows]

@router.post("/api/equipment/add")
async def add_equipment(name: str = Form(...), category: str = Form(...), driver: str = Form(""), tg_id: int = Form(0)):
    try:
        await db.conn.execute("INSERT INTO equipment (name, category, driver, status) VALUES (?, ?, ?, 'free')", (name, category, driver))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await notify_users(["report_group"], f"🚜 <b>Автопарк изменен</b>\nДобавлена новая техника: {name}", "equipment")
    return {"status": "ok"}

@router.post("/api/equipment/bulk_add")
async def bulk_add_equipment(request: Request):
    data = await request.json()
    items = data.get("items", [])
    count = 0
    try:
        for item in items:
            name = item.get("name", "").strip()
            category = item.get("category", "Другое").strip()
            driver = item.get("driver", "").strip()
            if name:
                await db.conn.execute("INSERT INTO equipment (name, category, driver, status) VALUES (?, ?, ?, 'free')", (name, category, driver))
                count += 1
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await notify_users(["report_group"], f"🚜 <b>Массовая загрузка</b>\nДобавлено {count} единиц техники.", "equipment")
    return {"status": "ok", "added": count}

@router.post("/api/equipment/{equip_id}/update_photo")
async def update_equip_photo(equip_id: int, photo_base64: str = Form(...), tg_id: int = Form(0)):
    url = process_base64_image(photo_base64, f"equip_{equip_id}")
    if url:
        try:
            await db.conn.execute("UPDATE equipment SET photo_url=? WHERE id=?", (url, equip_id))
            await db.conn.commit()
        except:
            await db.conn.rollback()
        return {"status": "ok", "photo_url": url}
    raise HTTPException(400, "Ошибка фото")

@router.post("/api/equipment/{equip_id}/update")
async def update_equipment(equip_id: int, name: str = Form(...), category: str = Form(...), driver: str = Form(""), status: str = Form("free"), tg_id: int = Form(0)):
    try:
        await db.conn.execute("UPDATE equipment SET name=?, category=?, driver=?, status=? WHERE id=?", (name, category, driver, status, equip_id))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}

@router.post("/api/equipment/{equip_id}/delete")
async def delete_equipment(equip_id: int, tg_id: int = Form(0)):
    try:
        await db.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}

@router.post("/api/equipment/{equip_id}/generate_invite")
async def generate_equip_invite(equip_id: int):
    async with db.conn.execute("SELECT invite_code FROM equipment WHERE id = ?", (equip_id,)) as cursor:
        row = await cursor.fetchone()
        if row and row[0]:
            code = row[0]
        else:
            code = str(random.randint(100000, 999999))
            try:
                await db.conn.execute("UPDATE equipment SET invite_code = ? WHERE id = ?", (code, equip_id))
                await db.conn.commit()
            except:
                await db.conn.rollback()
    return {
        "invite_link": f"https://miniapp.viks22.ru/equip-invite/{code}",
        "tg_bot_link": f"https://t.me/viksstroy_bot?start=equip_{code}",
        "invite_code": code,
        "join_password": code
    }

@router.get("/api/equipment/invite/{invite_code}")
async def get_equip_invite_info(invite_code: str):
    async with db.conn.execute("SELECT * FROM equipment WHERE invite_code = ?", (invite_code,)) as cur:
        row = await cur.fetchone()
    if not row: raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return dict(zip([c[0] for c in cur.description], row))

@router.post("/api/equipment/invite/join")
async def join_equipment(invite_code: str = Form(...), tg_id: int = Form(...)):
    async with db.conn.execute("SELECT id, name FROM equipment WHERE invite_code = ?", (invite_code,)) as cur:
        eq_row = await cur.fetchone()
    if not eq_row: raise HTTPException(status_code=404, detail="Техника не найдена")

    real_tg_id = await resolve_id(tg_id)
    try:
        await db.conn.execute("UPDATE equipment SET tg_id = ? WHERE id = ?", (real_tg_id, eq_row[0]))
        user = await db.get_user(real_tg_id)
        fio = dict(user).get('fio', f"Пользователь {real_tg_id}") if user else f"Пользователь {real_tg_id}"
        if not user: await db.add_user(real_tg_id, fio, "driver")
        elif dict(user)['role'] not in ['foreman', 'moderator', 'boss', 'superadmin']: await db.update_user_role(real_tg_id, "driver")
        await db.conn.commit()
    except:
        await db.conn.rollback()
    await notify_users(["report_group"], f"🔗 <b>Привязка аккаунта</b>\nВодитель {fio} привязан к технике «{eq_row[1]}».", "equipment")
    return {"status": "ok"}

@router.post("/api/equipment/{equip_id}/unlink")
async def unlink_equipment(equip_id: int, tg_id: int = Form(0)):
    try:
        await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE id = ?", (equip_id,))
        await db.conn.commit()
    except:
        await db.conn.rollback()
    return {"status": "ok"}