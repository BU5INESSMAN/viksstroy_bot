import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
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
    teams = []
    if role in ['worker', 'foreman']:
        async with db.conn.execute("SELECT team_id FROM team_members WHERE tg_user_id = ?", (real_tg_id,)) as cur:
            teams = [r[0] for r in await cur.fetchall() if r[0]]
    return await db.get_kp_dashboard_apps(real_tg_id, role, teams)


@router.get("/api/kp/apps/{app_id}/items")
async def get_app_kp_items(app_id: int):
    if db.conn is None: await db.init_db()
    return await db.get_app_kp_items(app_id)


@router.post("/api/kp/apps/{app_id}/submit")
async def submit_app_kp(app_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()

    # Жесткая серверная проверка доступа к заполнению КП
    tg_id = data.get('tg_id')
    req_role = data.get('role', 'worker')
    if tg_id:
        real_tg_id = await resolve_id(int(tg_id))
        user = await db.get_user(real_tg_id)
        if user:
            base_role = dict(user).get('role', 'worker')
            if base_role in ['worker', 'driver', 'guest']:
                async with db.conn.execute("SELECT 1 FROM team_members WHERE tg_user_id = ? AND is_foreman = 1 LIMIT 1",
                                           (real_tg_id,)) as cur:
                    if not await cur.fetchone():
                        raise HTTPException(403, "Нет прав для заполнения КП")

    await db.submit_kp_report(app_id, data.get('items', []), req_role)
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/review")
async def review_app_kp(app_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    await db.review_kp_report(app_id, data.get('action'))
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/update_volumes")
async def update_kp_volumes(app_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    await db.update_kp_volumes_only(app_id, data.get('items', []))
    return {"status": "ok"}


@router.post("/api/kp/export")
async def export_kp_mass(request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    excel_io = await db.generate_mass_excel(data.get('app_ids', []))
    if not excel_io: raise HTTPException(404, "Данные не найдены")
    return StreamingResponse(excel_io, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={
                                 'Content-Disposition': f'attachment; filename*=UTF-8\'\'{quote("экспорт_выполненные_работы.xlsx")}'})


# ==========================================
# НОВЫЕ ЭНДПОИНТЫ ДЛЯ ФАЙЛА СПРАВОЧНИКА
# ==========================================

@router.get("/api/kp/catalog/download")
async def download_kp_catalog():
    """Отдает последний загруженный файл прайса"""
    if db.conn is None: await db.init_db()
    path = db.get_latest_catalog_path()
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Справочник еще не загружен на сервер")

    filename = os.path.basename(path)
    return FileResponse(path, filename=filename)


@router.post("/api/kp/catalog/upload")
async def upload_kp_catalog(file: UploadFile = File(...)):
    """Принимает новый файл, сохраняет и обновляет базу"""
    if db.conn is None: await db.init_db()

    if not file.filename.endswith(('.xlsx', '.csv')):
        raise HTTPException(400, "Допустимы только файлы .xlsx или .csv")

    content = await file.read()
    new_path = await db.save_catalog_file(content)

    success = await db.import_kp_from_excel(new_path)
    if not success:
        raise HTTPException(500, "Ошибка при разборе файла. Проверьте структуру колонок.")

    return {"status": "ok", "file": os.path.basename(new_path)}