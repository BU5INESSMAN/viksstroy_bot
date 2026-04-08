import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from database_deps import db
from utils import resolve_id
from urllib.parse import quote

router = APIRouter(tags=["KP"])


@router.get("/api/kp/dashboard")
async def get_kp_dashboard(tg_id: int):
    if db.conn is None: await db.init_db()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(403)

    role = dict(user).get('role', 'worker')

    # Получаем бригады пользователя
    teams = []
    if role in ['worker', 'foreman']:
        async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (real_tg_id,)) as cur:
            rows = await cur.fetchall()
            teams = [r[0] for r in rows if r[0]]

    return await db.get_kp_dashboard_apps(real_tg_id, role, teams)


@router.get("/api/kp/apps/{app_id}/items")
async def get_app_kp_items(app_id: int):
    if db.conn is None: await db.init_db()
    return await db.get_app_kp_items(app_id)


@router.post("/api/kp/apps/{app_id}/submit")
async def submit_app_kp(app_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    items = data.get('items', [])
    tg_id = data.get('tg_id', 0)

    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    role = dict(user).get('role', 'worker') if user else 'worker'

    await db.submit_kp_report(app_id, items, role)
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/review")
async def review_app_kp(app_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    action = data.get('action')  # 'approve' or 'reject'
    await db.review_kp_report(app_id, action)
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/update_volumes")
async def update_kp_volumes(app_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    items = data.get('items', [])
    await db.update_kp_volumes_only(app_id, items)
    return {"status": "ok"}


@router.post("/api/kp/export")
async def export_kp_mass(request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    app_ids = data.get('app_ids', [])

    if not app_ids:
        raise HTTPException(400, "Нет выбранных заявок")

    excel_io = await db.generate_mass_excel(app_ids)
    if not excel_io:
        raise HTTPException(404, "Данные не найдены")

    filename = f"kp_export_{len(app_ids)}_apps.xlsx"
    encoded_filename = quote(filename)

    headers = {
        'Content-Disposition': f'attachment; filename*=UTF-8\'\'{encoded_filename}'
    }

    return StreamingResponse(
        excel_io,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )