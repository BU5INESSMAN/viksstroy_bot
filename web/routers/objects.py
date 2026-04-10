import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File
from typing import List
from database_deps import db
import json
import tempfile
from datetime import datetime

router = APIRouter(tags=["Objects"])

@router.get("/api/objects")
async def api_get_objects(archived: int = 0):
    if db.conn is None: await db.init_db()
    return await db.get_objects(include_archived=bool(archived))

@router.post("/api/objects/create")
async def api_create_object(name: str = Form(...), address: str = Form(...), tg_id: int = Form(0)):
    if db.conn is None: await db.init_db()
    if tg_id:
        user = await db.get_user(tg_id)
        if user and dict(user).get('role') in ('foreman', 'brigadier'):
            raise HTTPException(status_code=403, detail="Нет прав на создание объектов")
    await db.create_object(name, address)
    return {"status": "ok"}

@router.post("/api/objects/{obj_id}/update")
async def api_update_object(obj_id: int, name: str = Form(...), address: str = Form(...), default_teams: str = Form(""), default_equip: str = Form("")):
    if db.conn is None: await db.init_db()
    await db.update_object(obj_id, name, address, default_teams, default_equip)
    return {"status": "ok"}

@router.post("/api/objects/{obj_id}/archive")
async def api_archive_object(obj_id: int):
    if db.conn is None: await db.init_db()
    await db.archive_object(obj_id)
    return {"status": "ok"}

@router.post("/api/objects/{obj_id}/restore")
async def api_restore_object(obj_id: int):
    if db.conn is None: await db.init_db()
    await db.restore_object(obj_id)
    return {"status": "ok"}

@router.get("/api/kp/catalog")
async def api_get_kp_catalog():
    if db.conn is None: await db.init_db()
    return await db.get_kp_catalog()

@router.get("/api/objects/{obj_id}/kp")
async def api_get_object_kp(obj_id: int):
    if db.conn is None: await db.init_db()
    return await db.get_object_kp_plan(obj_id)

@router.post("/api/objects/{obj_id}/kp/update")
async def api_update_object_kp(obj_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    kp_ids = data.get("kp_ids", [])
    target_volumes = data.get("target_volumes", {})
    await db.add_kp_to_object(obj_id, kp_ids, target_volumes)
    return {"status": "ok"}

# ==========================================
# ПАРСИНГ PDF СМЕТЫ
# ==========================================

@router.post("/api/objects/parse_pdf")
async def api_parse_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате PDF")

    content = await file.read()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    try:
        tmp.write(content)
        tmp.close()

        from services.pdf_parser import parse_smr_pdf
        result = parse_smr_pdf(tmp.name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка парсинга PDF: {str(e)}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

# ==========================================
# ФАЙЛЫ ОБЪЕКТА (PDF)
# ==========================================

@router.get("/api/objects/{obj_id}/files")
async def api_get_object_files(obj_id: int):
    if db.conn is None: await db.init_db()
    return await db.get_object_files(obj_id)

@router.post("/api/objects/{obj_id}/files/upload")
async def api_upload_object_files(obj_id: int, files: List[UploadFile] = File(...)):
    if db.conn is None: await db.init_db()
    upload_dir = os.path.join("data", "uploads", "objects", str(obj_id))
    os.makedirs(upload_dir, exist_ok=True)
    saved = []
    for f in files:
        if not f.filename.lower().endswith('.pdf'):
            continue
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = f"{ts}_{f.filename}"
        dest = os.path.join(upload_dir, safe_name)
        content = await f.read()
        with open(dest, "wb") as out:
            out.write(content)
        rel_path = f"/uploads/objects/{obj_id}/{safe_name}"
        await db.add_object_file(obj_id, rel_path)
        saved.append(rel_path)
    return {"status": "ok", "files": saved}

@router.post("/api/objects/{obj_id}/upload_pdf")
async def api_upload_object_pdf(obj_id: int, file: UploadFile = File(...), tg_id: int = Form(0)):
    """Загружает основную смету (PDF) для объекта."""
    if db.conn is None: await db.init_db()
    if tg_id:
        from utils import resolve_id
        real_tg_id = await resolve_id(tg_id)
        user = await db.get_user(real_tg_id)
        if not user or dict(user).get('role') not in ('moderator', 'boss', 'superadmin'):
            raise HTTPException(403, "Нет прав для загрузки сметы")

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Файл должен быть в формате PDF")

    upload_dir = os.path.join("data", "uploads", "objects", str(obj_id))
    os.makedirs(upload_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{ts}_{file.filename}"
    dest = os.path.join(upload_dir, safe_name)
    content = await file.read()
    with open(dest, "wb") as out:
        out.write(content)

    rel_path = f"/uploads/objects/{obj_id}/{safe_name}"
    await db.conn.execute("UPDATE objects SET pdf_file_path = ? WHERE id = ?", (rel_path, obj_id))
    await db.conn.commit()
    return {"status": "ok", "pdf_file_path": rel_path}


@router.delete("/api/objects/files/{file_id}")
async def api_delete_object_file(file_id: int):
    if db.conn is None: await db.init_db()
    path = await db.delete_object_file(file_id)
    if path:
        real = os.path.join("data", path.lstrip("/"))
        if os.path.exists(real):
            os.remove(real)
    return {"status": "ok"}

# ==========================================
# СТАТИСТИКА ОБЪЕКТА
# ==========================================

# ==========================================
# ЗАПРОСЫ НА СОЗДАНИЕ ОБЪЕКТОВ (FOREMAN -> MODERATOR)
# ==========================================

@router.post("/api/object_requests/create")
async def api_create_object_request(name: str = Form(...), address: str = Form(""), comment: str = Form(""), tg_id: int = Form(0)):
    """Прораб запрашивает создание нового объекта."""
    if db.conn is None: await db.init_db()
    from utils import resolve_id
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    fio = dict(user).get('fio', 'Пользователь') if user else 'Пользователь'

    await db.conn.execute(
        "INSERT INTO object_requests (name, address, comment, requested_by, requested_by_name) VALUES (?, ?, ?, ?, ?)",
        (name, address, comment, real_tg_id, fio)
    )
    await db.conn.commit()

    import asyncio
    from utils import notify_users
    asyncio.create_task(notify_users(
        ["moderator", "boss", "superadmin"],
        f"📍 <b>Запрос на новый объект</b>\n👤 От: {fio}\n🏗 Название: {name}\n📍 Адрес: {address or 'Не указан'}",
        "objects", category="orders"
    ))
    return {"status": "ok"}


@router.get("/api/object_requests")
async def api_get_object_requests(status: str = "pending"):
    """Получить список запросов на объекты."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute(
        "SELECT * FROM object_requests WHERE status = ? ORDER BY created_at DESC", (status,)
    ) as cur:
        return [dict(row) for row in await cur.fetchall()]


@router.post("/api/object_requests/{req_id}/review")
async def api_review_object_request(req_id: int, action: str = Form(...), tg_id: int = Form(0)):
    """Модератор одобряет или отклоняет запрос на объект."""
    if db.conn is None: await db.init_db()
    from utils import resolve_id, notify_users
    import asyncio
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ('moderator', 'boss', 'superadmin'):
        raise HTTPException(403, "Нет прав")
    mod_fio = dict(user).get('fio', 'Модератор')

    async with db.conn.execute("SELECT * FROM object_requests WHERE id = ?", (req_id,)) as cur:
        req_row = await cur.fetchone()
    if not req_row:
        raise HTTPException(404, "Запрос не найден")
    req_dict = dict(req_row)

    if action == 'approve':
        # Создаем объект
        await db.create_object(req_dict['name'], req_dict['address'] or '')
        await db.conn.execute(
            "UPDATE object_requests SET status = 'approved', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (real_tg_id, mod_fio, req_id)
        )
        await db.conn.commit()
        asyncio.create_task(notify_users(
            [], f"✅ <b>Ваш запрос на объект одобрен!</b>\n🏗 {req_dict['name']}",
            "objects", extra_tg_ids=[req_dict['requested_by']], category="orders"
        ))
    elif action == 'reject':
        await db.conn.execute(
            "UPDATE object_requests SET status = 'rejected', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (real_tg_id, mod_fio, req_id)
        )
        await db.conn.commit()
        asyncio.create_task(notify_users(
            [], f"❌ <b>Ваш запрос на объект отклонён</b>\n🏗 {req_dict['name']}",
            "objects", extra_tg_ids=[req_dict['requested_by']], category="orders"
        ))
    else:
        raise HTTPException(400, "Неверное действие")
    return {"status": "ok"}


# ==========================================
# ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ
# ==========================================

@router.get("/api/extra_works/catalog")
async def api_get_extra_works_catalog():
    """Получить справочник дополнительных работ."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT * FROM extra_works_catalog ORDER BY name") as cur:
        return [dict(row) for row in await cur.fetchall()]


@router.post("/api/extra_works/catalog/create")
async def api_create_extra_work(name: str = Form(...), unit: str = Form("шт"), salary: float = Form(0), price: float = Form(0), tg_id: int = Form(0)):
    """Добавить позицию в справочник дополнительных работ (модератор+)."""
    if db.conn is None: await db.init_db()
    if tg_id:
        from utils import resolve_id
        real_tg_id = await resolve_id(tg_id)
        user = await db.get_user(real_tg_id)
        if not user or dict(user).get('role') not in ('moderator', 'boss', 'superadmin'):
            raise HTTPException(403, "Нет прав")
    await db.conn.execute(
        "INSERT INTO extra_works_catalog (name, unit, salary, price) VALUES (?, ?, ?, ?)",
        (name, unit, salary, price)
    )
    await db.conn.commit()
    return {"status": "ok"}


@router.get("/api/kp/apps/{app_id}/extra_works")
async def api_get_app_extra_works(app_id: int, tg_id: int = 0):
    """Получить доп. работы заявки."""
    if db.conn is None: await db.init_db()
    async with db.conn.execute("""
        SELECT aew.*, ewc.name as catalog_name, ewc.unit as catalog_unit
        FROM application_extra_works aew
        LEFT JOIN extra_works_catalog ewc ON aew.extra_work_id = ewc.id
        WHERE aew.application_id = ?
        ORDER BY aew.id
    """, (app_id,)) as cur:
        items = [dict(row) for row in await cur.fetchall()]

    # Strip financial data for non-office roles
    if tg_id:
        from utils import resolve_id
        real_tg_id = await resolve_id(tg_id)
        user = await db.get_user(real_tg_id)
        role = dict(user).get('role', 'worker') if user else 'worker'
        if role not in ('moderator', 'boss', 'superadmin'):
            for item in items:
                item.pop('salary', None)
                item.pop('price', None)
    return items


@router.post("/api/kp/apps/{app_id}/extra_works/submit")
async def api_submit_app_extra_works(app_id: int, request: Request):
    """Сохранить доп. работы заявки."""
    if db.conn is None: await db.init_db()
    data = await request.json()
    items = data.get('items', [])

    await db.conn.execute("DELETE FROM application_extra_works WHERE application_id = ?", (app_id,))
    for item in items:
        if float(item.get('volume', 0)) > 0:
            await db.conn.execute("""
                INSERT INTO application_extra_works (application_id, extra_work_id, custom_name, volume, salary, price)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                app_id,
                item.get('extra_work_id', 0),
                item.get('custom_name', ''),
                float(item.get('volume', 0)),
                float(item.get('salary', 0)),
                float(item.get('price', 0))
            ))
    await db.conn.commit()
    return {"status": "ok"}


@router.get("/api/objects/{obj_id}/stats")
async def api_get_object_stats(obj_id: int):
    if db.conn is None: await db.init_db()
    progress = await db.get_object_stats(obj_id)
    history = await db.get_object_history(obj_id)
    # Get object creation date
    objects = await db.get_objects(include_archived=True)
    obj_data = next((o for o in objects if o['id'] == obj_id), None)
    created_at = obj_data.get('created_at', '') if obj_data else ''
    return {"progress": progress, "history": history, "created_at": created_at}