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


@router.get("/api/kp/apps/{app_id}/items")
async def get_app_kp_items(app_id: int, current_user=Depends(get_current_user)):
    items = await db.get_app_kp_items(app_id)
    role = current_user.get('role', 'worker')
    # Strip financial data for non-office roles (privacy)
    if role not in ('moderator', 'boss', 'superadmin'):
        for item in items:
            item.pop('salary', None)
            item.pop('price', None)
            item.pop('saved_salary', None)
            item.pop('saved_price', None)
    return items


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
