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
async def get_app_kp_items(app_id: int, tg_id: int = 0):
    if db.conn is None: await db.init_db()
    items = await db.get_app_kp_items(app_id)
    # Strip financial data for non-office roles (privacy)
    if tg_id:
        real_tg_id = await resolve_id(tg_id)
        user = await db.get_user(real_tg_id)
        role = dict(user).get('role', 'worker') if user else 'worker'
        if role not in ('moderator', 'boss', 'superadmin'):
            for item in items:
                item.pop('salary', None)
                item.pop('price', None)
                item.pop('saved_salary', None)
                item.pop('saved_price', None)
    return items


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

    if tg_id:
        user = await db.get_user(real_tg_id)
        fio = dict(user).get('fio', '') if user else ''
        await db.add_log(real_tg_id, fio, f"Отправил отчёт СМР по заявке №{app_id}", target_type='smr', target_id=app_id)
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/review")
async def review_app_kp(app_id: int, request: Request):
    if db.conn is None: await db.init_db()
    data = await request.json()
    # If foreman edited volumes before approving, save them first
    items = data.get('items')
    if items and data.get('action') == 'approve':
        await db.update_kp_volumes_only(app_id, items)
    action = data.get('action')
    await db.review_kp_report(app_id, action)

    tg_id = data.get('tg_id')
    if tg_id:
        real_tg_id = await resolve_id(int(tg_id))
        user = await db.get_user(real_tg_id)
        fio = dict(user).get('fio', '') if user else ''
        action_label = "Одобрил" if action == 'approve' else "Отклонил"
        await db.add_log(real_tg_id, fio, f"{action_label} СМР по заявке №{app_id}", target_type='smr', target_id=app_id)
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
# АРХИВ СМР
# ==========================================


async def _verify_office(tg_id: int):
    """Verify user is moderator, boss, or superadmin. Returns (real_id, user_dict)."""
    real_id = await resolve_id(tg_id)
    user = await db.get_user(real_id)
    if not user or dict(user).get('role') not in ('moderator', 'boss', 'superadmin'):
        raise HTTPException(403, "Нет прав")
    return real_id, dict(user)


@router.post("/api/kp/apps/{app_id}/archive")
async def archive_kp(app_id: int, request: Request):
    """Архивировать СМР заявки (только для модератор+)."""
    if db.conn is None: await db.init_db()
    data = await request.json()
    real_id, user = await _verify_office(data.get('tg_id', 0))
    await db.conn.execute("UPDATE applications SET kp_archived = 1 WHERE id = ?", (app_id,))
    await db.conn.commit()
    await db.add_log(real_id, user.get('fio'), f"Архивировал СМР заявки №{app_id}", target_type='smr', target_id=app_id)
    return {"status": "ok"}


@router.post("/api/kp/apps/{app_id}/restore")
async def restore_kp(app_id: int, request: Request):
    """Восстановить СМР заявки из архива (только для модератор+)."""
    if db.conn is None: await db.init_db()
    data = await request.json()
    real_id, user = await _verify_office(data.get('tg_id', 0))
    await db.conn.execute("UPDATE applications SET kp_archived = 0 WHERE id = ?", (app_id,))
    await db.conn.commit()
    await db.add_log(real_id, user.get('fio'), f"Восстановил СМР заявки №{app_id}", target_type='smr', target_id=app_id)
    return {"status": "ok"}


@router.get("/api/kp/archived")
async def get_archived_kp(tg_id: int = 0):
    """Список архивированных СМР (только для модератор+)."""
    if db.conn is None: await db.init_db()
    await _verify_office(tg_id)
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

    await db.add_log(0, "Система", f"Загрузил справочник КП: {os.path.basename(new_path)}", target_type='system')
    return {"status": "ok", "file": os.path.basename(new_path)}