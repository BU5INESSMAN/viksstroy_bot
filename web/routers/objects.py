import sys
import os
import re
import uuid

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File, Depends, Query
from fastapi.responses import FileResponse
from typing import List
import mimetypes
from pathlib import Path
from database_deps import db
from auth_deps import get_current_user, require_role
import json
import tempfile
from datetime import datetime

router = APIRouter(tags=["Objects"])

_require_office = require_role("superadmin", "boss", "moderator")

# ── Path safety ──────────────────────────────────────────────
UPLOADS_ROOT = Path("data/uploads").resolve()


def _safe_filename(raw: str) -> str:
    """Strip path components, limit length, keep only safe chars."""
    name = os.path.basename(raw or "")
    name = re.sub(r"[^\w.\- ]", "_", name, flags=re.UNICODE)
    name = re.sub(r"_+", "_", name).strip("._ ")
    if not name:
        name = "upload"
    return name[:100]


def _resolve_safe_path(rel_or_abs: str) -> Path:
    """Resolve a file path and ensure it stays inside UPLOADS_ROOT."""
    p = Path(rel_or_abs)
    if not p.is_absolute():
        p = UPLOADS_ROOT / p.lstrip("/\\")
    resolved = p.resolve()
    resolved.relative_to(UPLOADS_ROOT)  # raises ValueError if outside
    return resolved


# ── Objects CRUD ─────────────────────────────────────────────

@router.get("/api/objects")
async def api_get_objects(archived: int = 0, current_user=Depends(get_current_user)):
    return await db.get_objects(include_archived=bool(archived))


@router.post("/api/objects/create")
async def api_create_object(request: Request, current_user=Depends(_require_office)):
    data = await request.json()
    name = data.get("name", "")
    address = data.get("address", "")
    kp_ids = data.get("kp_ids", [])
    target_volumes = data.get("target_volumes", {})

    if not name:
        raise HTTPException(400, "Название обязательно")
    if not kp_ids:
        raise HTTPException(400, "КП обязательна при создании объекта")

    obj_id = await db.create_object(name, address)
    await db.add_kp_to_object(obj_id, kp_ids, target_volumes)

    fio = current_user.get('fio', 'Система')
    await db.add_log(current_user["tg_id"], fio, f"Создал объект: {name}", target_type='object', target_id=obj_id)
    return {"status": "ok", "id": obj_id}


@router.post("/api/objects/{obj_id}/update")
async def api_update_object(obj_id: int, name: str = Form(...), address: str = Form(...),
                            default_teams: str = Form(""), default_equip: str = Form(""),
                            current_user=Depends(_require_office)):
    await db.update_object(obj_id, name, address, default_teams, default_equip)
    await db.add_log(current_user["tg_id"], current_user.get('fio', 'Система'),
                     f"Обновил объект «{name}»", target_type='object', target_id=obj_id)
    return {"status": "ok"}


@router.post("/api/objects/{obj_id}/archive")
async def api_archive_object(obj_id: int, current_user=Depends(_require_office)):
    _name = f"#{obj_id}"
    try:
        async with db.conn.execute("SELECT name FROM objects WHERE id = ?", (obj_id,)) as c:
            r = await c.fetchone()
            if r: _name = r[0]
    except Exception: pass
    await db.archive_object(obj_id)
    await db.add_log(current_user["tg_id"], current_user.get('fio', 'Система'),
                     f"Архивировал объект «{_name}»", target_type='object', target_id=obj_id)
    return {"status": "ok"}


@router.post("/api/objects/{obj_id}/restore")
async def api_restore_object(obj_id: int, current_user=Depends(_require_office)):
    _name = f"#{obj_id}"
    try:
        async with db.conn.execute("SELECT name FROM objects WHERE id = ?", (obj_id,)) as c:
            r = await c.fetchone()
            if r: _name = r[0]
    except Exception: pass
    await db.restore_object(obj_id)
    await db.add_log(current_user["tg_id"], current_user.get('fio', 'Система'),
                     f"Восстановил объект «{_name}»", target_type='object', target_id=obj_id)
    return {"status": "ok"}


# ── KP Catalog (was unprotected — BUG fix) ──────────────────

@router.get("/api/kp/catalog")
async def api_get_kp_catalog(current_user=Depends(get_current_user)):
    return await db.get_kp_catalog()


@router.get("/api/objects/{obj_id}/kp")
async def api_get_object_kp(obj_id: int, current_user=Depends(get_current_user)):
    return await db.get_object_kp_plan(obj_id)


@router.post("/api/objects/{obj_id}/kp/update")
async def api_update_object_kp(obj_id: int, request: Request, current_user=Depends(_require_office)):
    data = await request.json()
    kp_ids = data.get("kp_ids", [])
    target_volumes = data.get("target_volumes", {})
    await db.add_kp_to_object(obj_id, kp_ids, target_volumes)
    return {"status": "ok"}


# ── PDF parsing ──────────────────────────────────────────────

@router.post("/api/objects/parse_pdf")
async def api_parse_pdf(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате PDF")

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(413, "Файл слишком большой (максимум 25MB)")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    try:
        tmp.write(content)
        tmp.close()

        from services.pdf_parser import parse_smr_pdf
        result = parse_smr_pdf(tmp.name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка парсинга PDF: {str(e)[:200]}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


# ── SMR import from PDF ─────────────────────────────────────

def _fuzzy_name_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    a, b = a.lower().strip(), b.lower().strip()
    if a == b or a in b or b in a:
        return True
    words_a = {w for w in a.split() if len(w) > 3}
    words_b = {w for w in b.split() if len(w) > 3}
    if words_a and words_b:
        return len(words_a & words_b) >= min(2, len(words_b))
    return False


def _match_work_to_catalog(work: dict, catalog: list):
    wn = (work.get("name") or "").lower().strip()
    if not wn:
        return None
    best, best_score = None, 0
    for item in catalog:
        cn = (item.get("name") or "").lower().strip()
        if not cn:
            continue
        if wn == cn:
            return item
        if wn in cn or cn in wn:
            score = min(len(wn), len(cn)) / max(len(wn), len(cn))
            if score > best_score:
                best_score, best = score, item
            continue
        min_len = min(len(wn), len(cn))
        if min_len >= 15:
            match_len = 0
            for a, b in zip(wn, cn):
                if a == b:
                    match_len += 1
                else:
                    break
            if match_len >= min_len * 0.7:
                score = 0.85 + (match_len / min_len - 0.7) * 0.5
                if score > best_score:
                    best_score, best = score, item
                continue
        words_w = {w for w in wn.split() if len(w) > 2}
        words_c = {w for w in cn.split() if len(w) > 2}
        if words_w and words_c:
            score = len(words_w & words_c) / max(len(words_w), len(words_c))
            if score > best_score:
                best_score, best = score, item
    return best if best_score >= 0.5 else None


@router.post("/api/objects/{obj_id}/smr/import")
async def api_import_smr_from_pdf(obj_id: int, file: UploadFile = File(...),
                                  current_user=Depends(_require_office)):
    """Parse PDF, save permanently, return comparison for confirmation."""
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(413, "Файл слишком большой (максимум 25MB)")

    # H-08 fix: sanitize filename, use UUID prefix
    orig_name = file.filename or "smr.pdf"
    clean = _safe_filename(orig_name)
    stored_name = f"{uuid.uuid4().hex[:12]}_smr_{clean}"

    object_dir = UPLOADS_ROOT / "objects" / str(obj_id)
    object_dir.mkdir(parents=True, exist_ok=True)
    perm_path = object_dir / stored_name

    # Path traversal safety
    try:
        perm_path.resolve().relative_to(UPLOADS_ROOT)
    except ValueError:
        raise HTTPException(400, "Недопустимое имя файла")

    with open(perm_path, "wb") as out:
        out.write(content)

    rel_path = str(perm_path.relative_to(Path("data/uploads")))
    db_path = f"/uploads/{rel_path.replace(os.sep, '/')}"
    try:
        await db.add_object_file(obj_id, db_path, original_name=f"СМР — {orig_name}", file_size=len(content))
    except Exception:
        pass

    try:
        from services.pdf_parser import parse_smr_pdf
        parsed = parse_smr_pdf(str(perm_path))
    except Exception as e:
        raise HTTPException(500, f"Ошибка парсинга PDF: {str(e)[:200]}")

    objects = await db.get_objects(include_archived=True)
    obj = next((o for o in objects if o['id'] == obj_id), None)
    if not obj:
        raise HTTPException(404, "Объект не найден")

    current_plan = await db.get_object_kp_plan(obj_id)
    current_kp_ids = {p['id'] for p in current_plan}
    catalog = await db.get_kp_catalog()

    new_works = []
    unmatched = []
    for work in parsed.get("works", []):
        matched = _match_work_to_catalog(work, catalog)
        if matched:
            new_works.append({
                "kp_id": matched["id"],
                "name": matched["name"],
                "unit": matched.get("unit", ""),
                "volume": work.get("volume", 0),
                "is_new": matched["id"] not in current_kp_ids,
            })
        else:
            unmatched.append({"name": work.get("name", "?"), "unit": work.get("unit", ""), "volume": work.get("volume", 0)})

    new_kp_ids = {w["kp_id"] for w in new_works}

    to_remove = []
    for p in current_plan:
        if p['id'] not in new_kp_ids:
            try:
                async with db.conn.execute(
                    "SELECT COUNT(*) FROM application_kp WHERE kp_id = ? AND volume > 0 AND application_id IN (SELECT id FROM applications WHERE object_id = ?)",
                    (p['id'], obj_id)
                ) as cur:
                    row = await cur.fetchone()
                    has_history = row[0] > 0 if row else False
            except Exception:
                has_history = False
            to_remove.append({"kp_id": p['id'], "name": p.get("name", "?"), "has_history": has_history})

    warnings = list(parsed.get("errors", []))
    incomplete = [w.get("name", "?") for w in parsed.get("works", []) if not w.get("volume")]
    if incomplete:
        warnings.append(f"⚠️ {len(incomplete)} работ без указанного объёма. Проверьте данные.")

    return {
        "parsed_name": parsed.get("name", ""),
        "parsed_address": parsed.get("address", ""),
        "object_name": obj.get("name", ""),
        "name_match": _fuzzy_name_match(parsed.get("name", ""), obj.get("name", "")),
        "new_works": [w for w in new_works if w["is_new"]],
        "existing_works": [w for w in new_works if not w["is_new"]],
        "to_remove": to_remove,
        "unmatched": unmatched,
        "total_parsed": len(parsed.get("works", [])),
        "total_matched": len(new_works),
        "incomplete_count": len(incomplete),
        "warnings": warnings,
    }


@router.post("/api/objects/{obj_id}/smr/confirm")
async def api_confirm_smr_import(obj_id: int, request: Request, current_user=Depends(_require_office)):
    """Apply SMR import: add new works, remove deselected."""
    data = await request.json()
    add_ids = data.get("add_kp_ids", [])
    remove_ids = data.get("remove_kp_ids", [])
    volumes = data.get("volumes", {})

    for kp_id in add_ids:
        try:
            async with db.conn.execute("SELECT id FROM object_kp_plan WHERE object_id = ? AND kp_id = ?", (obj_id, kp_id)) as cur:
                if not await cur.fetchone():
                    vol = volumes.get(str(kp_id), 0)
                    await db.conn.execute("INSERT INTO object_kp_plan (object_id, kp_id, target_volume) VALUES (?, ?, ?)", (obj_id, kp_id, vol))
        except Exception:
            pass

    for kp_id in remove_ids:
        try:
            await db.conn.execute("DELETE FROM object_kp_plan WHERE object_id = ? AND kp_id = ?", (obj_id, kp_id))
        except Exception:
            pass

    await db.conn.commit()
    _obj_name = f"#{obj_id}"
    try:
        async with db.conn.execute("SELECT name FROM objects WHERE id = ?", (obj_id,)) as c:
            r = await c.fetchone()
            if r: _obj_name = r[0]
    except Exception: pass
    await db.add_log(current_user["tg_id"], current_user.get('fio', 'Система'),
                     f"Импорт СМР из PDF для «{_obj_name}»: +{len(add_ids)} / -{len(remove_ids)}",
                     target_type='object', target_id=obj_id)
    return {"status": "ok", "added": len(add_ids), "removed": len(remove_ids)}


# ── Object files ─────────────────────────────────────────────

ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.gif', '.xlsx', '.xls', '.csv', '.doc', '.docx', '.dwg', '.zip'}


@router.get("/api/objects/{obj_id}/files")
async def api_get_object_files(obj_id: int, current_user=Depends(get_current_user)):
    return await db.get_object_files(obj_id)


@router.get("/api/files/{file_id}/download")
async def api_download_file(file_id: int, download: int = Query(0),
                            current_user=Depends(get_current_user)):
    """C-08 fix: authenticated file serving with path-traversal safety.
    Default: inline (preview in browser). ?download=1: force save-as.
    """
    async with db.conn.execute(
        "SELECT object_id, file_path, original_name FROM object_files WHERE id = ?", (file_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Файл не найден")

    obj_id = row[0]
    file_path_str = row[1] or ""
    original_name = row[2] or ""

    # Path traversal safety — resolve inside data/ and verify
    try:
        clean_rel = file_path_str.lstrip("/")
        if clean_rel.startswith("uploads/"):
            resolved = (Path("data") / clean_rel).resolve()
        else:
            resolved = (Path("data/uploads") / clean_rel).resolve()
        resolved.relative_to(UPLOADS_ROOT)  # ValueError if outside
    except (ValueError, OSError):
        raise HTTPException(403, "Недопустимый путь файла")

    if not resolved.is_file():
        raise HTTPException(404, "Файл отсутствует на диске")

    # Guess MIME from filename for proper inline rendering
    display_name = original_name or resolved.name
    mime_type, _ = mimetypes.guess_type(display_name)
    if not mime_type:
        mime_type = "application/octet-stream"

    # Build Content-Disposition: inline for preview, attachment for download
    from urllib.parse import quote as url_quote
    disposition = "attachment" if download else "inline"

    # ASCII-safe fallback for filename= (HTTP headers are latin-1 only)
    ascii_fallback = re.sub(r'[^\x20-\x7E]', '_', display_name).replace('"', '').strip()
    if not ascii_fallback or ascii_fallback == '_':
        ascii_fallback = f"file_{file_id}"

    # RFC 5987 UTF-8 encoded filename (modern browsers prefer this)
    encoded_name = url_quote(display_name, safe='')
    headers = {
        "Content-Disposition": f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_name}"
    }

    return FileResponse(
        path=str(resolved),
        media_type=mime_type,
        headers=headers,
    )


@router.post("/api/objects/{obj_id}/files/upload")
async def api_upload_object_files(obj_id: int, files: List[UploadFile] = File(...),
                                  current_user=Depends(_require_office)):
    """H-08 fix: sanitized filenames with UUID prefix."""
    object_dir = UPLOADS_ROOT / "objects" / str(obj_id)
    object_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for f in files:
        ext = os.path.splitext(f.filename or '')[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        content = await f.read()
        if len(content) > 25 * 1024 * 1024:
            continue  # skip oversized files silently

        orig_name = f.filename or "upload"
        clean = _safe_filename(orig_name)
        stored_name = f"{uuid.uuid4().hex[:12]}_{clean}"
        dest = object_dir / stored_name

        # Path safety check
        try:
            dest.resolve().relative_to(UPLOADS_ROOT)
        except ValueError:
            continue

        with open(dest, "wb") as out:
            out.write(content)
        rel_path = f"/uploads/objects/{obj_id}/{stored_name}"
        await db.add_object_file(obj_id, rel_path, original_name=orig_name, file_size=len(content))
        saved.append(rel_path)
    return {"status": "ok", "files": saved}


@router.post("/api/objects/{obj_id}/upload_pdf")
async def api_upload_object_pdf(obj_id: int, file: UploadFile = File(...),
                                current_user=Depends(_require_office)):
    """Upload main estimate PDF for object. H-08 fix: safe filename."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Файл должен быть в формате PDF")

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(413, "Файл слишком большой (максимум 25MB)")

    orig_name = file.filename or "estimate.pdf"
    clean = _safe_filename(orig_name)
    stored_name = f"{uuid.uuid4().hex[:12]}_{clean}"

    object_dir = UPLOADS_ROOT / "objects" / str(obj_id)
    object_dir.mkdir(parents=True, exist_ok=True)
    dest = object_dir / stored_name

    try:
        dest.resolve().relative_to(UPLOADS_ROOT)
    except ValueError:
        raise HTTPException(400, "Недопустимое имя файла")

    with open(dest, "wb") as out:
        out.write(content)

    rel_path = f"/uploads/objects/{obj_id}/{stored_name}"
    await db.conn.execute("UPDATE objects SET pdf_file_path = ? WHERE id = ?", (rel_path, obj_id))
    try:
        async with db.conn.execute("SELECT id FROM object_files WHERE object_id = ? AND file_path = ?", (obj_id, rel_path)) as cur:
            if not await cur.fetchone():
                await db.conn.execute(
                    "INSERT INTO object_files (object_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)",
                    (obj_id, rel_path, f"Смета КП — {orig_name}", len(content))
                )
    except Exception:
        pass
    await db.conn.commit()

    fio = current_user.get('fio', '')
    _pname = f"#{obj_id}"
    try:
        async with db.conn.execute("SELECT name FROM objects WHERE id = ?", (obj_id,)) as _c:
            _pr = await _c.fetchone()
            if _pr: _pname = _pr[0]
    except Exception: pass
    await db.add_log(current_user["tg_id"], fio, f"Загрузил PDF для объекта «{_pname}»", target_type='object', target_id=obj_id)
    return {"status": "ok", "pdf_file_path": rel_path}


@router.post("/api/objects/files/{file_id}/rename")
async def api_rename_object_file(file_id: int, new_name: str = Form(...),
                                 current_user=Depends(_require_office)):
    """Rename a file (updates original_name in DB only)."""
    try:
        await db.conn.execute("UPDATE object_files SET original_name = ? WHERE id = ?", (new_name.strip()[:200], file_id))
        await db.conn.commit()
        return {"status": "ok"}
    except Exception:
        raise HTTPException(500, "Ошибка переименования")


@router.delete("/api/objects/files/{file_id}")
async def api_delete_object_file(file_id: int, current_user=Depends(_require_office)):
    """C-09 fix: file delete requires office role + audit log."""
    obj_id = None
    file_path = None
    try:
        async with db.conn.execute("SELECT object_id, file_path, original_name FROM object_files WHERE id = ?", (file_id,)) as cur:
            row = await cur.fetchone()
            if row:
                obj_id = row[0]
                file_path = row[1]
    except Exception:
        pass

    path = await db.delete_object_file(file_id)

    # If this was the main estimate PDF, clear pdf_file_path on the object
    if obj_id and file_path:
        try:
            async with db.conn.execute("SELECT pdf_file_path FROM objects WHERE id = ?", (obj_id,)) as cur:
                obj_row = await cur.fetchone()
                if obj_row and obj_row[0] and obj_row[0] == file_path:
                    await db.conn.execute("UPDATE objects SET pdf_file_path = NULL WHERE id = ?", (obj_id,))
                    await db.conn.commit()
        except Exception:
            pass

    # Delete physical file with path safety
    effective_path = path or file_path
    if effective_path:
        try:
            real = Path("data") / effective_path.lstrip("/")
            resolved = real.resolve()
            resolved.relative_to(UPLOADS_ROOT)  # safety check
            if resolved.is_file():
                os.remove(resolved)
        except (ValueError, OSError):
            pass

    await db.add_log(current_user["tg_id"], current_user.get("fio", "Система"),
                     f"Удалил файл #{file_id}" + (f" объекта #{obj_id}" if obj_id else ""),
                     target_type='object', target_id=obj_id or 0)
    return {"status": "ok"}


# ── Object stats ─────────────────────────────────────────────

@router.get("/api/objects/{obj_id}/stats")
async def api_get_object_stats(obj_id: int, current_user=Depends(get_current_user)):
    progress = await db.get_object_stats(obj_id)
    history = await db.get_object_history(obj_id)
    objects = await db.get_objects(include_archived=True)
    obj_data = next((o for o in objects if o['id'] == obj_id), None)
    created_at = obj_data.get('created_at', '') if obj_data else ''
    return {"progress": progress, "history": history, "created_at": created_at}


# ── Object requests (foreman → moderator) ────────────────────

@router.post("/api/object_requests/create")
async def api_create_object_request(name: str = Form(...), address: str = Form(""), comment: str = Form(""),
                                    current_user=Depends(get_current_user)):
    """Foreman requests creation of a new object."""
    real_tg_id = current_user["tg_id"]
    fio = current_user.get('fio', 'Пользователь')

    await db.conn.execute(
        "INSERT INTO object_requests (name, address, comment, requested_by, requested_by_name) VALUES (?, ?, ?, ?, ?)",
        (name, address, comment, real_tg_id, fio)
    )
    await db.conn.commit()

    import asyncio
    from services.notifications import notify_users
    asyncio.create_task(notify_users(
        ["moderator", "boss", "superadmin"],
        f"📍 <b>Запрос на новый объект</b>\n👤 От: {fio}\n🏗 Название: {name}\n📍 Адрес: {address or 'Не указан'}",
        "objects", category="orders"
    ))
    await db.add_log(real_tg_id, fio, f"Отправил запрос на создание объекта: {name}", target_type='object')
    return {"status": "ok"}


@router.get("/api/object_requests")
async def api_get_object_requests(status: str = "pending", current_user=Depends(_require_office)):
    """List object requests. Office only."""
    async with db.conn.execute(
        "SELECT * FROM object_requests WHERE status = ? ORDER BY created_at DESC", (status,)
    ) as cur:
        return [dict(row) for row in await cur.fetchall()]


@router.post("/api/object_requests/{req_id}/review")
async def api_review_object_request(req_id: int, request: Request, current_user=Depends(_require_office)):
    """Moderator approves or rejects object request."""
    from services.notifications import notify_users
    import asyncio

    data = await request.json()
    action = data.get("action", "")
    mod_fio = current_user.get('fio', 'Модератор')
    real_tg_id = current_user["tg_id"]

    async with db.conn.execute("SELECT * FROM object_requests WHERE id = ?", (req_id,)) as cur:
        req_row = await cur.fetchone()
    if not req_row:
        raise HTTPException(404, "Запрос не найден")
    req_dict = dict(req_row)

    if action == 'approve':
        name = data.get("name", req_dict['name'])
        address = data.get("address", req_dict['address'] or '')
        kp_ids = data.get("kp_ids", [])
        target_volumes = data.get("target_volumes", {})

        if not kp_ids:
            raise HTTPException(400, "КП обязательна при создании объекта")

        obj_id = await db.create_object(name, address)
        await db.add_kp_to_object(obj_id, kp_ids, target_volumes)

        await db.conn.execute(
            "UPDATE object_requests SET status = 'approved', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (real_tg_id, mod_fio, req_id)
        )
        await db.conn.commit()
        asyncio.create_task(notify_users(
            [], f"✅ <b>Ваш запрос на объект одобрен!</b>\n🏗 {name}",
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
    action_label = "одобрил" if action == 'approve' else "отклонил"
    await db.add_log(real_tg_id, mod_fio, f"Рассмотрел запрос на объект «{req_dict['name']}»: {action_label}", target_type='object', target_id=req_id)
    return {"status": "ok"}


# ── Extra works ──────────────────────────────────────────────

@router.get("/api/extra_works/catalog")
async def api_get_extra_works_catalog(current_user=Depends(get_current_user)):
    async with db.conn.execute("SELECT * FROM extra_works_catalog ORDER BY name") as cur:
        return [dict(row) for row in await cur.fetchall()]


@router.post("/api/extra_works/catalog/create")
async def api_create_extra_work(name: str = Form(...), unit: str = Form("шт"),
                                salary: float = Form(0), price: float = Form(0),
                                current_user=Depends(_require_office)):
    await db.conn.execute(
        "INSERT INTO extra_works_catalog (name, unit, salary, price) VALUES (?, ?, ?, ?)",
        (name, unit, salary, price)
    )
    await db.conn.commit()
    await db.add_log(current_user["tg_id"], current_user.get('fio', ''), f"Добавил доп. работу: {name}", target_type='object')
    return {"status": "ok"}


@router.get("/api/kp/apps/{app_id}/extra_works")
async def api_get_app_extra_works(app_id: int, current_user=Depends(get_current_user)):
    async with db.conn.execute("""
        SELECT aew.*, ewc.name as catalog_name, ewc.unit as catalog_unit
        FROM application_extra_works aew
        LEFT JOIN extra_works_catalog ewc ON aew.extra_work_id = ewc.id
        WHERE aew.application_id = ?
        ORDER BY aew.id
    """, (app_id,)) as cur:
        items = [dict(row) for row in await cur.fetchall()]

    role = current_user.get('role', 'worker')
    if role not in ('moderator', 'boss', 'superadmin'):
        for item in items:
            item.pop('salary', None)
            item.pop('price', None)
    return items


@router.post("/api/kp/apps/{app_id}/extra_works/submit")
async def api_submit_app_extra_works(app_id: int, request: Request, current_user=Depends(get_current_user)):
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
