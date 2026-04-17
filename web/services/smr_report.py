"""SMR Excel report generator.

Produces a clean multi-sheet .xlsx for a single application with:
    - "Часы" (hours): brigade | FIO | specialty | hours | filled by
    - "Работы" (plan works): name | unit | volume | filled by
    - "Доп. работы" (extras): same columns (sheet omitted when empty)

No prices, no salaries — just factual entries and authorship. The
"Заполнил" column uses `application_kp.filled_by_user_id` to resolve
the submitter's FIO + role.
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


_HEADER_FILL = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
_HEADER_FONT = Font(bold=True)
_CENTER = Alignment(horizontal="center", vertical="center")
_LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
_ROLE_RU = {
    'foreman': 'Прораб',
    'brigadier': 'Бригадир',
    'worker': 'Рабочий',
    'driver': 'Водитель',
    'moderator': 'Модератор',
    'boss': 'Руководитель',
    'superadmin': 'Админ',
}


def _sanitize_filename(name: str) -> str:
    """Windows-safe filename stem — Russian letters preserved."""
    if not name:
        return 'report'
    cleaned = re.sub(r'[\\/:*?"<>|]+', '_', name)
    cleaned = re.sub(r'\s+', '_', cleaned).strip('_')
    return cleaned[:80] or 'report'


def _author_label(fio: str | None, role: str | None) -> str:
    if not fio:
        return ''
    role_ru = _ROLE_RU.get((role or '').strip(), '')
    return f"{fio} ({role_ru})" if role_ru else fio


def _autosize(ws, min_w: int = 12, max_w: int = 60):
    for col_idx, column in enumerate(ws.columns, start=1):
        longest = 0
        for cell in column:
            if cell.value is None:
                continue
            for line in str(cell.value).split('\n'):
                longest = max(longest, len(line))
        ws.column_dimensions[get_column_letter(col_idx)].width = max(min_w, min(longest + 2, max_w))


def _write_header(ws, headers: list[str]):
    for col, text in enumerate(headers, start=1):
        c = ws.cell(row=1, column=col, value=text)
        c.font = _HEADER_FONT
        c.fill = _HEADER_FILL
        c.alignment = _CENTER
    ws.row_dimensions[1].height = 22
    ws.freeze_panes = 'A2'


async def generate_smr_excel_bytes(db, app_id: int) -> tuple[bytes, str]:
    """Generate the SMR report .xlsx in memory.
    Returns (file_bytes, suggested_filename).
    """
    # ── Application + object for filename + header context ──
    async with db.conn.execute(
        """
        SELECT a.id, a.date_target, a.foreman_name, a.object_id,
               o.name AS object_name, o.address AS object_address
        FROM applications a
        LEFT JOIN objects o ON o.id = a.object_id
        WHERE a.id = ?
        """,
        (app_id,),
    ) as cur:
        row = await cur.fetchone()
    app_meta = dict(row) if row else {}

    wb = Workbook()

    # ─────────────────────── Sheet 1: Часы ───────────────────────
    ws_hours = wb.active
    ws_hours.title = "Часы"
    _write_header(ws_hours, ["Бригада", "ФИО", "Специальность", "Часы", "Заполнил"])

    hours_rows = await db.get_app_hours(app_id)
    r = 2
    for h in hours_rows:
        if float(h.get('hours') or 0) <= 0:
            continue
        ws_hours.cell(row=r, column=1, value=h.get('team_name') or '').alignment = _LEFT
        ws_hours.cell(row=r, column=2, value=h.get('fio') or '').alignment = _LEFT
        ws_hours.cell(row=r, column=3, value=h.get('specialty') or '').alignment = _LEFT
        ws_hours.cell(row=r, column=4, value=float(h.get('hours') or 0)).alignment = _CENTER
        ws_hours.cell(
            row=r, column=5,
            value=_author_label(h.get('filled_by_fio'), h.get('filled_by_role')),
        ).alignment = _LEFT
        r += 1
    if r == 2:
        ws_hours.cell(row=2, column=1, value='Часы не заполнены').alignment = _LEFT
    _autosize(ws_hours)

    # ─────────────────────── Sheet 2: Работы ───────────────────────
    ws_works = wb.create_sheet("Работы")
    _write_header(ws_works, ["Наименование", "Ед.изм", "Объём", "Заполнил"])

    async with db.conn.execute(
        """
        SELECT akp.volume,
               COALESCE(NULLIF(akp.unit, ''), kc.unit, '') AS unit,
               kc.name AS work_name,
               u.fio AS filled_by_fio,
               u.role AS filled_by_role
        FROM application_kp akp
        LEFT JOIN kp_catalog kc ON kc.id = akp.kp_id
        LEFT JOIN users u ON u.user_id = akp.filled_by_user_id
        WHERE akp.application_id = ? AND akp.volume > 0
        ORDER BY kc.category, kc.name
        """,
        (app_id,),
    ) as cur:
        works = [dict(x) for x in await cur.fetchall()]

    r = 2
    for w in works:
        ws_works.cell(row=r, column=1, value=w.get('work_name') or '').alignment = _LEFT
        ws_works.cell(row=r, column=2, value=w.get('unit') or '').alignment = _CENTER
        ws_works.cell(row=r, column=3, value=float(w.get('volume') or 0)).alignment = _CENTER
        ws_works.cell(
            row=r, column=4,
            value=_author_label(w.get('filled_by_fio'), w.get('filled_by_role')),
        ).alignment = _LEFT
        r += 1
    if r == 2:
        ws_works.cell(row=2, column=1, value='Работы не заполнены').alignment = _LEFT
    _autosize(ws_works)

    # ─────────────────────── Sheet 3: Доп. работы (если есть) ───────────────────────
    async with db.conn.execute(
        """
        SELECT aew.volume,
               COALESCE(NULLIF(aew.unit, ''), kc.unit, ewc.unit, '') AS unit,
               COALESCE(NULLIF(aew.custom_name, ''), kc.name, ewc.name, '') AS work_name,
               u.fio AS filled_by_fio,
               u.role AS filled_by_role
        FROM application_extra_works aew
        LEFT JOIN kp_catalog kc ON kc.id = aew.extra_work_id
        LEFT JOIN extra_works_catalog ewc ON ewc.id = aew.extra_work_id
        LEFT JOIN users u ON u.user_id = aew.filled_by_user_id
        WHERE aew.application_id = ? AND aew.volume > 0
        ORDER BY work_name
        """,
        (app_id,),
    ) as cur:
        extras = [dict(x) for x in await cur.fetchall()]

    if extras:
        ws_extra = wb.create_sheet("Доп. работы")
        _write_header(ws_extra, ["Наименование", "Ед.изм", "Объём", "Заполнил"])
        r = 2
        for e in extras:
            ws_extra.cell(row=r, column=1, value=e.get('work_name') or '').alignment = _LEFT
            ws_extra.cell(row=r, column=2, value=e.get('unit') or '').alignment = _CENTER
            ws_extra.cell(row=r, column=3, value=float(e.get('volume') or 0)).alignment = _CENTER
            ws_extra.cell(
                row=r, column=4,
                value=_author_label(e.get('filled_by_fio'), e.get('filled_by_role')),
            ).alignment = _LEFT
            r += 1
        _autosize(ws_extra)

    # ─────────────────────── Persist ───────────────────────
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    blob = buf.read()

    obj_name = _sanitize_filename(app_meta.get('object_name') or f"app_{app_id}")
    date = (app_meta.get('date_target') or datetime.now().strftime('%Y-%m-%d'))
    filename = f"{obj_name}_{date}.xlsx"

    return blob, filename


async def generate_smr_excel_to_disk(db, app_id: int, dest_dir: Path | None = None) -> Path:
    """Variant that persists to `data/uploads/reports` — used when a caller
    wants a sharable URL path instead of a streaming response."""
    blob, filename = await generate_smr_excel_bytes(db, app_id)
    base = dest_dir or Path("data/uploads/reports")
    base.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    path = base / f"smr_{app_id}_{stamp}.xlsx"
    path.write_bytes(blob)
    return path
