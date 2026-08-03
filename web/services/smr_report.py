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


async def generate_smr_excel_bytes(db, app_id: int, *, include_financial: bool = False) -> tuple[bytes, str]:
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

    from smr_data import get_smr_read_model

    report = await get_smr_read_model(db, app_id)
    wb = Workbook()

    # ─────────────────────── Sheet 1: Часы ───────────────────────
    ws_hours = wb.active
    ws_hours.title = "Часы"
    _write_header(ws_hours, ["Бригада", "ФИО", "Специальность", "Часы", "Заполнил"])

    # v2.10: include addendum hours (доп.отчёт) so they count in the report,
    # matching the works/extras sheets which read the tables directly.
    hours_rows = report.get('hours', [])
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
    # v2.4.3 per-brigade: when any row carries team_id, prepend a "Бригада"
    # column so the distribution across teams is visible in the report.
    works = report.get('plan_works', [])

    has_teams = any(w.get('team_id') for w in works)
    ws_works = wb.create_sheet("Работы")
    if has_teams:
        headers = ["Бригада", "Наименование", "Ед.изм", "Объём"]
    else:
        headers = ["Наименование", "Ед.изм", "Объём"]
    if include_financial:
        headers.extend(["ЗП за ед.", "Сумма ЗП", "Цена за ед.", "Сумма цены"])
    headers.append("Заполнил")
    _write_header(ws_works, headers)

    r = 2
    for w in works:
        col = 1
        if has_teams:
            ws_works.cell(row=r, column=col, value=w.get('team_name') or '—').alignment = _LEFT
            col += 1
        ws_works.cell(row=r, column=col, value=w.get('name') or '').alignment = _LEFT
        col += 1
        ws_works.cell(row=r, column=col, value=w.get('unit') or '').alignment = _CENTER
        col += 1
        ws_works.cell(row=r, column=col, value=float(w.get('volume') or 0)).alignment = _CENTER
        col += 1
        if include_financial:
            volume = float(w.get('volume') or 0)
            salary = float(w.get('current_salary') or 0)
            price = float(w.get('current_price') or 0)
            for value in (salary, volume * salary, price, volume * price):
                ws_works.cell(row=r, column=col, value=round(value, 2)).alignment = _CENTER
                col += 1
        ws_works.cell(
            row=r, column=col,
            value=_author_label(w.get('filled_by_fio'), w.get('filled_by_role')),
        ).alignment = _LEFT
        r += 1
    if r == 2:
        ws_works.cell(row=2, column=1, value='Работы не заполнены').alignment = _LEFT
    _autosize(ws_works)

    # ─────────────────────── Sheet 3: Доп. работы (если есть) ───────────────────────
    extras = report.get('extra_works', [])

    if extras:
        extras_has_teams = any(e.get('team_id') for e in extras)
        ws_extra = wb.create_sheet("Доп. работы")
        if extras_has_teams:
            headers = ["Бригада", "Наименование", "Ед.изм", "Объём"]
        else:
            headers = ["Наименование", "Ед.изм", "Объём"]
        if include_financial:
            headers.extend(["ЗП за ед.", "Сумма ЗП", "Цена за ед.", "Сумма цены"])
        headers.append("Заполнил")
        _write_header(ws_extra, headers)
        r = 2
        for e in extras:
            col = 1
            if extras_has_teams:
                ws_extra.cell(row=r, column=col, value=e.get('team_name') or '—').alignment = _LEFT
                col += 1
            ws_extra.cell(row=r, column=col, value=e.get('name') or '').alignment = _LEFT
            col += 1
            ws_extra.cell(row=r, column=col, value=e.get('unit') or '').alignment = _CENTER
            col += 1
            ws_extra.cell(row=r, column=col, value=float(e.get('volume') or 0)).alignment = _CENTER
            col += 1
            if include_financial:
                volume = float(e.get('volume') or 0)
                salary = float(e.get('salary') or 0)
                price = float(e.get('price') or 0)
                for value in (salary, volume * salary, price, volume * price):
                    ws_extra.cell(row=r, column=col, value=round(value, 2)).alignment = _CENTER
                    col += 1
            ws_extra.cell(
                row=r, column=col,
                value=_author_label(e.get('filled_by_fio'), e.get('filled_by_role')),
            ).alignment = _LEFT
            r += 1
        _autosize(ws_extra)

    if include_financial:
        ws_summary = wb.create_sheet("Итоги", 0)
        _write_header(ws_summary, ["Показатель", "Значение"])
        totals = report.get('totals', {})
        summary_rows = [
            ("Всего часов", totals.get('hours', 0)),
            ("Сумма ЗП", totals.get('salary', 0)),
            ("Сумма цены", totals.get('price', 0)),
        ]
        for row_no, (label, value) in enumerate(summary_rows, start=2):
            ws_summary.cell(row=row_no, column=1, value=label).alignment = _LEFT
            ws_summary.cell(row=row_no, column=2, value=value).alignment = _CENTER
        _autosize(ws_summary)

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
