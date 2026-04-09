import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File
from typing import List
from database_deps import db
import json
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