import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Request
from database_deps import db
import json

router = APIRouter(tags=["Objects"])

@router.get("/api/objects")
async def api_get_objects(archived: int = 0):
    if db.conn is None: await db.init_db()
    return await db.get_objects(include_archived=bool(archived))

@router.post("/api/objects/create")
async def api_create_object(name: str = Form(...), address: str = Form(...)):
    if db.conn is None: await db.init_db()
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
    await db.add_kp_to_object(obj_id, kp_ids)
    return {"status": "ok"}