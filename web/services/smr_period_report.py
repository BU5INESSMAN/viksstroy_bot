"""Three-sheet SMR period report for accounting and personnel review."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from io import BytesIO
import re
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo


HEADER_BLUE = "375A9E"
SUBHEADER_BLUE = "DCE6F8"
TOTAL_BLUE = "4A62B9"
GRID_BLUE = "AAB8DA"
MONEY_FORMAT = '#,##0.00" ₽"'
NUMBER_FORMAT = "0.###"


def _num(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _clean_number(value: float) -> int | float:
    rounded = round(float(value or 0), 8)
    return int(round(rounded)) if abs(rounded - round(rounded)) < 1e-8 else rounded


def _ready_clause(alias: str = "a") -> str:
    return (
        f"({alias}.smr_status='approved' OR "
        f"(COALESCE(TRIM({alias}.smr_status),'')='' AND {alias}.kp_status='approved'))"
    )


async def _table_exists(db, table: str) -> bool:
    async with db.conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ) as cursor:
        return await cursor.fetchone() is not None


async def _load_hours(
    db, date_from: date, date_to: date, *, include_unaccounted: bool
) -> list[dict[str, Any]]:
    async with db.conn.execute(
        f"""
        SELECT ah.id,ah.app_id,ah.team_id,ah.user_id AS member_id,
               COALESCE(ah.hours,0) AS hours,
               COALESCE(ah.participant_salary,0) AS participant_salary,
               COALESCE(ah.is_additional,0) AS is_additional,
               COALESCE(NULLIF(TRIM(tm.fio),''),'') AS member_fio,
               COALESCE(NULLIF(TRIM(tm.position),''),'') AS member_position,
               a.public_number,a.date_target,a.object_id,a.object_address,
               a.foreman_id,COALESCE(NULLIF(TRIM(u.fio),''),a.foreman_name,'') AS foreman_name,
               a.smr_accounted_at,a.kp_archived,
               COALESCE(NULLIF(TRIM(o.name),''),NULLIF(TRIM(a.object_address),''),'Объект '||a.id) AS object_name,
               COALESCE(NULLIF(TRIM(t.name),''),'Бригада '||ah.team_id) AS team_name
        FROM application_hours ah
        JOIN applications a ON a.id=ah.app_id
        LEFT JOIN team_members tm ON tm.id=ah.user_id
        LEFT JOIN objects o ON o.id=a.object_id
        LEFT JOIN teams t ON t.id=ah.team_id
        LEFT JOIN users u ON u.user_id=a.foreman_id
        WHERE date(a.date_target) BETWEEN date(?) AND date(?)
          AND {_ready_clause('a')}
          AND (?=1 OR a.smr_accounted_at IS NOT NULL)
        ORDER BY a.date_target,a.id,ah.team_id,member_fio,ah.id
        """,
        (date_from.isoformat(), date_to.isoformat(), int(include_unaccounted)),
    ) as cursor:
        rows = [dict(row) for row in await cursor.fetchall()]

    if rows:
        from smr_roster import enrich_historical_hours

        await enrich_historical_hours(db, rows, sorted({int(row["app_id"]) for row in rows}))

    try:
        from services.employee_identity import identity_map
    except ModuleNotFoundError:  # direct package import in unit tests
        from web.services.employee_identity import identity_map

    mapping = await identity_map(db, {int(row.get("member_id") or 0) for row in rows})
    for row in rows:
        member_id = int(row.get("member_id") or 0)
        identity = mapping.get(member_id) or {}
        row["identity_id"] = int(identity.get("identity_id") or member_id)
        row["member_fio"] = (
            identity.get("canonical_fio")
            or row.get("fio")
            or row.get("member_fio")
            or f"Сотрудник #{member_id}"
        )
        row["member_position"] = (
            identity.get("position")
            or row.get("specialty")
            or row.get("member_position")
            or ""
        )
    return rows


async def _load_works(
    db, date_from: date, date_to: date, *, include_unaccounted: bool
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    async with db.conn.execute(
        f"""
        SELECT akp.id,akp.application_id AS app_id,COALESCE(akp.team_id,0) AS team_id,
               a.public_number,a.date_target,a.object_id,a.object_address,
               COALESCE(NULLIF(TRIM(o.name),''),NULLIF(TRIM(a.object_address),''),'Объект '||a.id) AS object_name,
               COALESCE(NULLIF(TRIM(t.name),''),CASE WHEN COALESCE(akp.team_id,0)=0 THEN 'Общие работы' ELSE 'Бригада '||akp.team_id END) AS team_name,
               COALESCE(NULLIF(TRIM(k.category),''),'Без категории') AS category,
               COALESCE(NULLIF(TRIM(k.name),''),'Работа #'||akp.kp_id) AS name,
               COALESCE(NULLIF(TRIM(akp.unit),''),NULLIF(TRIM(k.unit),''),'') AS unit,
               COALESCE(akp.volume,0) AS volume,
               COALESCE(akp.current_salary,k.salary,0) AS rate_salary,
               COALESCE(akp.current_price,k.price,0) AS rate_price,
               COALESCE(akp.is_additional,0) AS is_additional,
               a.smr_accounted_at,a.kp_archived,'Основная' AS work_kind
        FROM application_kp akp
        JOIN applications a ON a.id=akp.application_id
        LEFT JOIN objects o ON o.id=a.object_id
        LEFT JOIN teams t ON t.id=akp.team_id
        LEFT JOIN kp_catalog k ON k.id=akp.kp_id
        WHERE date(a.date_target) BETWEEN date(?) AND date(?)
          AND {_ready_clause('a')}
          AND (?=1 OR a.smr_accounted_at IS NOT NULL)
          AND COALESCE(akp.volume,0)>0
        """,
        (date_from.isoformat(), date_to.isoformat(), int(include_unaccounted)),
    ) as cursor:
        rows.extend(dict(row) for row in await cursor.fetchall())

    if await _table_exists(db, "application_extra_works"):
        async with db.conn.execute(
            f"""
            SELECT aew.id,aew.application_id AS app_id,COALESCE(aew.team_id,0) AS team_id,
                   a.public_number,a.date_target,a.object_id,a.object_address,
                   COALESCE(NULLIF(TRIM(o.name),''),NULLIF(TRIM(a.object_address),''),'Объект '||a.id) AS object_name,
                   COALESCE(NULLIF(TRIM(t.name),''),CASE WHEN COALESCE(aew.team_id,0)=0 THEN 'Общие работы' ELSE 'Бригада '||aew.team_id END) AS team_name,
                   COALESCE(NULLIF(TRIM(k.category),''),'Дополнительные работы') AS category,
                   COALESCE(NULLIF(TRIM(k.name),''),NULLIF(TRIM(ew.name),''),NULLIF(TRIM(aew.custom_name),''),'Доп. работа') AS name,
                   COALESCE(NULLIF(TRIM(aew.unit),''),NULLIF(TRIM(k.unit),''),NULLIF(TRIM(ew.unit),''),'') AS unit,
                   COALESCE(aew.volume,0) AS volume,
                   COALESCE(aew.salary,k.salary,ew.salary,0) AS rate_salary,
                   COALESCE(aew.price,k.price,ew.price,0) AS rate_price,
                   COALESCE(aew.is_additional,0) AS is_additional,
                   a.smr_accounted_at,a.kp_archived,'Дополнительная' AS work_kind
            FROM application_extra_works aew
            JOIN applications a ON a.id=aew.application_id
            LEFT JOIN objects o ON o.id=a.object_id
            LEFT JOIN teams t ON t.id=aew.team_id
            LEFT JOIN kp_catalog k ON k.id=aew.kp_id
            LEFT JOIN extra_works_catalog ew ON ew.id=aew.extra_work_id
            WHERE date(a.date_target) BETWEEN date(?) AND date(?)
              AND {_ready_clause('a')}
              AND (?=1 OR a.smr_accounted_at IS NOT NULL)
              AND COALESCE(aew.volume,0)>0
            """,
            (date_from.isoformat(), date_to.isoformat(), int(include_unaccounted)),
        ) as cursor:
            rows.extend(dict(row) for row in await cursor.fetchall())
    rows.sort(key=lambda row: (str(row.get("date_target") or ""), int(row.get("app_id") or 0), int(row.get("team_id") or 0), str(row.get("name") or "").casefold()))
    return rows


def _normalize_person_name(value: object) -> str:
    return re.sub(r"[^а-яёa-z0-9]+", " ", str(value or "").casefold()).strip()


def _canonicalize_report_people(rows: list[dict[str, Any]]) -> None:
    """Merge only unambiguous FIO variants without conflating namesakes."""
    display_by_name: dict[str, str] = {}
    position_by_name: dict[str, str] = {}
    complete_names: set[str] = set()
    for row in rows:
        display = re.sub(r"\s+", " ", str(row.get("member_fio") or "").strip())
        normalized = _normalize_person_name(display)
        if not normalized:
            normalized = f"сотрудник {int(row.get('member_id') or 0)}"
            display = display or f"Сотрудник #{int(row.get('member_id') or 0)}"
        if len(normalized.split()) >= 3:
            complete_names.add(normalized)
        if len(display) > len(display_by_name.get(normalized, "")):
            display_by_name[normalized] = display
        position = str(row.get("member_position") or "").strip()
        if len(position) > len(position_by_name.get(normalized, "")):
            position_by_name[normalized] = position

    target_by_name: dict[str, str] = {}
    for normalized in display_by_name:
        parts = normalized.split()
        if normalized in complete_names:
            target_by_name[normalized] = normalized
            continue
        candidates = {
            candidate
            for candidate in complete_names
            if candidate.split()[: len(parts)] == parts
        }
        target_by_name[normalized] = next(iter(candidates)) if len(candidates) == 1 else normalized

    for row in rows:
        original = _normalize_person_name(row.get("member_fio"))
        if not original:
            original = f"сотрудник {int(row.get('member_id') or 0)}"
        target = target_by_name.get(original, original)
        row["report_person_key"] = target
        row["member_fio"] = display_by_name.get(target) or row.get("member_fio")
        row["member_position"] = position_by_name.get(target) or row.get("member_position") or ""


def _aggregate_hours(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aggregated: dict[tuple[int, int, str], dict[str, Any]] = {}
    for row in rows:
        key = (
            int(row["app_id"]),
            int(row["team_id"]),
            str(row.get("report_person_key") or f"member:{int(row.get('member_id') or 0)}"),
        )
        if key not in aggregated:
            aggregated[key] = {
                **row,
                "hours": 0.0,
                "participant_salary": 0.0,
                "calculated_salary": 0.0,
                "member_ids": set(),
                "identity_ids": set(),
            }
        item = aggregated[key]
        item["hours"] += _num(row.get("hours"))
        item["participant_salary"] += _num(row.get("participant_salary"))
        item["member_ids"].add(int(row.get("member_id") or 0))
        item["identity_ids"].add(int(row.get("identity_id") or 0))
    return list(aggregated.values())


def _allocate_work_salary(hours: list[dict[str, Any]], works: list[dict[str, Any]]) -> None:
    """Calculate the catalog-based payroll separately from a foreman's proposal."""
    pools: dict[tuple[int, int], float] = defaultdict(float)
    for work in works:
        pools[(int(work["app_id"]), int(work.get("team_id") or 0))] += (
            _num(work.get("volume")) * _num(work.get("rate_salary"))
        )

    for (app_id, team_id), amount in pools.items():
        recipients = [
            row
            for row in hours
            if int(row["app_id"]) == app_id
            and (team_id == 0 or int(row["team_id"]) == team_id)
            and _num(row.get("hours")) > 0
        ]
        total_hours = sum(_num(row.get("hours")) for row in recipients)
        if amount <= 0 or total_hours <= 0:
            continue
        allocated = 0.0
        for index, row in enumerate(recipients):
            share = (
                round(amount - allocated, 2)
                if index == len(recipients) - 1
                else round(amount * _num(row.get("hours")) / total_hours, 2)
            )
            row["calculated_salary"] += share
            allocated += share


async def load_period_data(db, date_from: date, date_to: date, *, include_unaccounted: bool = False) -> dict[str, Any]:
    if db.conn is None:
        await db.init_db()
    raw_hours = await _load_hours(db, date_from, date_to, include_unaccounted=include_unaccounted)
    works = await _load_works(db, date_from, date_to, include_unaccounted=include_unaccounted)
    _canonicalize_report_people(raw_hours)
    hours = _aggregate_hours(raw_hours)
    _allocate_work_salary(hours, works)
    matrix: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(
            lambda: {
                "participant_salary": 0.0,
                "calculated_salary": 0.0,
                "hours": 0.0,
            }
        )
    )
    employee_names: dict[str, str] = {}
    employee_positions: dict[str, str] = {}
    object_names: dict[str, str] = {}
    for row in hours:
        employee_key = f"person:{row['report_person_key']}"
        object_id = int(row.get("object_id") or 0)
        object_name = str(row.get("object_name") or "Объект").strip() or "Объект"
        object_key = f"object:{object_id}" if object_id > 0 else f"address:{object_name.casefold()}"
        employee_names[employee_key] = str(row.get("member_fio") or employee_key)
        employee_positions[employee_key] = str(row.get("member_position") or "")
        object_names[object_key] = object_name
        bucket = matrix[employee_key][object_key]
        bucket["participant_salary"] += _num(row.get("participant_salary"))
        bucket["calculated_salary"] += _num(row.get("calculated_salary"))
        bucket["hours"] += _num(row.get("hours"))
    employees = sorted(matrix, key=lambda key: (employee_names.get(key, key).casefold(), key))
    objects = sorted(object_names, key=lambda key: (object_names[key].casefold(), key))
    return {
        "employees": employees, "employee_names": employee_names,
        "employee_positions": employee_positions, "objects": objects,
        "object_names": object_names, "matrix": matrix,
        "hours": sorted(hours, key=lambda row: (str(row.get("date_target") or ""), int(row.get("app_id") or 0), str(row.get("team_name") or ""), str(row.get("member_fio") or "").casefold())),
        "works": works, "source_rows": len(raw_hours),
        "include_unaccounted": include_unaccounted,
        "zero_participant_salary_rows": sum(1 for row in hours if _num(row.get("hours")) > 0 and _num(row.get("participant_salary")) == 0),
        "incomplete_employee_names": sorted({
            str(row.get("member_fio") or "")
            for row in hours
            if len(_normalize_person_name(row.get("member_fio")).split()) < 3
        }),
        "unresolved_members": sorted({int(row.get("member_id") or 0) for row in raw_hours if str(row.get("member_fio") or "").startswith("Сотрудник #")}),
    }


def _base_sheet(sheet, title: str, subtitle: str) -> None:
    sheet.sheet_view.showGridLines = False
    sheet["A1"] = title
    sheet["A1"].font = Font(name="Arial", size=15, bold=True, color="FFFFFF")
    sheet["A1"].fill = PatternFill("solid", fgColor=HEADER_BLUE)
    sheet["A2"] = subtitle
    sheet["A2"].font = Font(name="Arial", size=9, color="44546A")
    sheet.freeze_panes = "A5"


def _style_header(cell, *, dark: bool = True) -> None:
    cell.font = Font(name="Arial", size=9, bold=True, color="FFFFFF" if dark else "1F2937")
    cell.fill = PatternFill("solid", fgColor=HEADER_BLUE if dark else SUBHEADER_BLUE)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    side = Side(style="thin", color=GRID_BLUE)
    cell.border = Border(left=side, right=side, top=side, bottom=side)


def _style_data_range(sheet, min_row: int, max_row: int, min_col: int, max_col: int) -> None:
    side = Side(style="thin", color="D9E0F0")
    for row in sheet.iter_rows(min_row=min_row, max_row=max_row, min_col=min_col, max_col=max_col):
        for cell in row:
            cell.font = Font(name="Arial", size=9)
            cell.border = Border(bottom=side)
            cell.alignment = Alignment(vertical="top", wrap_text=False)


def _add_table(sheet, name: str, start_row: int, end_row: int, end_col: int) -> None:
    if end_row < start_row + 1:
        return
    table = Table(displayName=name, ref=f"A{start_row}:{get_column_letter(end_col)}{end_row}")
    table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True, showFirstColumn=False, showLastColumn=False)
    sheet.add_table(table)


def build_period_workbook(data: dict[str, Any], date_from: date, date_to: date) -> Workbook:
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Сводка"
    mode = "включая неучтённые" if data.get("include_unaccounted") else "только учтённые"
    subtitle = f"Период: {date_from:%d.%m.%Y} — {date_to:%d.%m.%Y} · {mode}. Архивные СМР включены; отбор по дате работ."
    _base_sheet(summary, "Сводный отчёт СМР", subtitle)
    last_col = max(2, 2 + len(data["objects"]) * 3 + 3)
    summary.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_col)
    summary.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_col)
    summary.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_col)
    quality_notes = [
        "Предложение прораба и внутренний расчёт по справочнику показаны отдельно. "
        "Прораб не видит справочные расценки и вводит предложение самостоятельно."
    ]
    if data.get("zero_participant_salary_rows"):
        quality_notes.append(
            f"Строк с рабочими часами и ЗП 0: {data['zero_participant_salary_rows']}."
        )
    if data.get("incomplete_employee_names"):
        quality_notes.append(
            "Неполные ФИО требуют исправления в аудите сотрудников: "
            + ", ".join(data["incomplete_employee_names"])
            + "."
        )
    summary["A3"] = " ".join(quality_notes)
    summary["A3"].font = Font(name="Arial", size=9, color="9A3412")
    summary["A3"].fill = PatternFill("solid", fgColor="FFF7ED")
    summary["A3"].alignment = Alignment(wrap_text=True, vertical="center")
    summary.row_dimensions[3].height = 34
    summary.merge_cells("A4:A5"); summary.merge_cells("B4:B5")
    summary["A4"] = "Сотрудник"; summary["B4"] = "Должность"
    column_groups: list[tuple[int, int, str]] = []
    col = 3
    for object_key in data["objects"]:
        summary.merge_cells(start_row=4, start_column=col, end_row=4, end_column=col + 2)
        summary.cell(4, col, data["object_names"][object_key])
        for offset, label in enumerate(("Предложение прораба", "Расчёт по справочнику", "Часы")):
            summary.cell(5, col + offset, label)
        column_groups.append((col, col + 1, col + 2, object_key)); col += 3
    summary.merge_cells(start_row=4, start_column=col, end_row=4, end_column=col + 2)
    summary.cell(4, col, "Итого")
    for offset, label in enumerate(("Предложение прораба", "Расчёт по справочнику", "Часы")):
        summary.cell(5, col + offset, label)
    total_cols = (col, col + 1, col + 2)
    for row_no in (4, 5):
        for column in range(1, col + 3):
            _style_header(summary.cell(row_no, column), dark=row_no == 4)
    matrix = data["matrix"]; start_row = 6
    for offset, employee_key in enumerate(data["employees"]):
        row_no = start_row + offset
        summary.cell(row_no, 1, data["employee_names"].get(employee_key, employee_key))
        summary.cell(row_no, 2, data["employee_positions"].get(employee_key, ""))
        totals = [0.0, 0.0, 0.0]
        for proposal_col, calculation_col, hours_col, object_key in column_groups:
            bucket = matrix[employee_key].get(object_key, {})
            values = (
                _num(bucket.get("participant_salary")),
                _num(bucket.get("calculated_salary")),
                _num(bucket.get("hours")),
            )
            for target_col, value in zip((proposal_col, calculation_col, hours_col), values):
                if value: summary.cell(row_no, target_col, _clean_number(value))
            totals = [totals[index] + values[index] for index in range(3)]
        for target_col, value in zip(total_cols, totals): summary.cell(row_no, target_col, _clean_number(value))
    end_employee_row = start_row + len(data["employees"]) - 1
    total_row = max(start_row, end_employee_row + 1)
    summary.cell(total_row, 1, "Итого"); summary.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=2)
    for proposal_col, calculation_col, hours_col, object_key in column_groups:
        for target_col, key in (
            (proposal_col, "participant_salary"),
            (calculation_col, "calculated_salary"),
            (hours_col, "hours"),
        ):
            value = sum(_num(matrix[employee].get(object_key, {}).get(key)) for employee in data["employees"])
            summary.cell(total_row, target_col, _clean_number(value))
    grand = {
        "participant_salary": sum(_num(row.get("participant_salary")) for row in data["hours"]),
        "calculated_salary": sum(_num(row.get("calculated_salary")) for row in data["hours"]),
        "hours": sum(_num(row.get("hours")) for row in data["hours"]),
    }
    for target_col, key in zip(total_cols, ("participant_salary", "calculated_salary", "hours")): summary.cell(total_row, target_col, _clean_number(grand[key]))
    for cell in summary[total_row]: cell.font = Font(name="Arial", size=9, bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor=TOTAL_BLUE)
    if data["employees"]: _style_data_range(summary, start_row, end_employee_row, 1, col + 2)
    for column in range(3, col + 3):
        for row_no in range(5, total_row + 1): summary.cell(row_no, column).number_format = MONEY_FORMAT if (column - 3) % 3 in (0, 1) else NUMBER_FORMAT
    summary.column_dimensions["A"].width = 32; summary.column_dimensions["B"].width = 28
    for column in range(3, col + 3): summary.column_dimensions[get_column_letter(column)].width = 18
    summary.freeze_panes = "C6"; summary.auto_filter.ref = f"A5:{get_column_letter(col + 2)}{max(total_row - 1, 5)}"

    details = workbook.create_sheet("По заявкам"); _base_sheet(details, "Сотрудники по заявкам", subtitle)
    headers = ["Дата", "Номер заявки", "Объект", "Прораб", "Бригада", "Сотрудник", "Должность", "Часы", "Предложение прораба", "Расчёт по справочнику", "Учтено", "В архиве"]
    details.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    details.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
    for column, label in enumerate(headers, 1): details.cell(4, column, label); _style_header(details.cell(4, column))
    for row_no, row in enumerate(data["hours"], 5):
        values = [date.fromisoformat(str(row.get("date_target"))[:10]) if row.get("date_target") else None, row.get("public_number") or f"№{row.get('app_id')}", row.get("object_name") or "", row.get("foreman_name") or "", row.get("team_name") or "", row.get("member_fio") or "", row.get("member_position") or "", _clean_number(_num(row.get("hours"))), round(_num(row.get("participant_salary")), 2), round(_num(row.get("calculated_salary")), 2), "Да" if row.get("smr_accounted_at") else "Нет", "Да" if int(row.get("kp_archived") or 0) else "Нет"]
        for column, value in enumerate(values, 1): details.cell(row_no, column, value)
    details_end = 4 + len(data["hours"])
    if data["hours"]:
        _style_data_range(details, 5, details_end, 1, len(headers))
        for row_no in range(5, details_end + 1): details.cell(row_no, 1).number_format = "dd.mm.yyyy"; details.cell(row_no, 8).number_format = NUMBER_FORMAT; details.cell(row_no, 9).number_format = MONEY_FORMAT; details.cell(row_no, 10).number_format = MONEY_FORMAT
    _add_table(details, "SMRPeriodDetails", 4, details_end, len(headers))
    for column, width in enumerate([12, 18, 30, 28, 25, 32, 28, 11, 20, 20, 11, 11], 1): details.column_dimensions[get_column_letter(column)].width = width

    works_sheet = workbook.create_sheet("Работы"); _base_sheet(works_sheet, "Работы за период", subtitle)
    work_headers = ["Дата", "Номер заявки", "Объект", "Бригада", "Вид работы", "Часть отчёта", "Категория", "Наименование", "Ед. изм.", "Объём", "ЗП за единицу", "Сумма ЗП", "Цена СМР за единицу", "Сумма СМР", "Учтено", "В архиве"]
    works_sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(work_headers))
    works_sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(work_headers))
    for column, label in enumerate(work_headers, 1): works_sheet.cell(4, column, label); _style_header(works_sheet.cell(4, column))
    for row_no, row in enumerate(data["works"], 5):
        volume = _num(row.get("volume")); rate_salary = _num(row.get("rate_salary")); rate_price = _num(row.get("rate_price"))
        values = [date.fromisoformat(str(row.get("date_target"))[:10]) if row.get("date_target") else None, row.get("public_number") or f"№{row.get('app_id')}", row.get("object_name") or "", row.get("team_name") or "", row.get("work_kind") or "", "Дополнение" if int(row.get("is_additional") or 0) else "Основная часть", row.get("category") or "", row.get("name") or "", row.get("unit") or "", _clean_number(volume), round(rate_salary, 2), round(volume * rate_salary, 2), round(rate_price, 2), round(volume * rate_price, 2), "Да" if row.get("smr_accounted_at") else "Нет", "Да" if int(row.get("kp_archived") or 0) else "Нет"]
        for column, value in enumerate(values, 1): works_sheet.cell(row_no, column, value)
    works_end = 4 + len(data["works"])
    if data["works"]:
        _style_data_range(works_sheet, 5, works_end, 1, len(work_headers))
        for row_no in range(5, works_end + 1):
            works_sheet.cell(row_no, 1).number_format = "dd.mm.yyyy"; works_sheet.cell(row_no, 10).number_format = NUMBER_FORMAT
            for column in (11, 12, 13, 14): works_sheet.cell(row_no, column).number_format = MONEY_FORMAT
    _add_table(works_sheet, "SMRPeriodWorks", 4, works_end, len(work_headers))
    for column, width in enumerate([12, 18, 30, 25, 18, 16, 22, 45, 11, 11, 16, 16, 18, 16, 11, 11], 1): works_sheet.column_dimensions[get_column_letter(column)].width = width
    for sheet in workbook.worksheets:
        sheet.row_dimensions[1].height = 25; sheet.row_dimensions[4].height = 34
        sheet.sheet_properties.pageSetUpPr.fitToPage = True; sheet.page_setup.orientation = "landscape"; sheet.page_setup.fitToWidth = 1; sheet.page_setup.fitToHeight = 0
    return workbook


async def generate_period_report(db, date_from: date, date_to: date, *, include_unaccounted: bool = False) -> tuple[bytes, str, dict[str, Any]]:
    data = await load_period_data(db, date_from, date_to, include_unaccounted=include_unaccounted)
    workbook = build_period_workbook(data, date_from, date_to)
    buffer = BytesIO(); workbook.save(buffer)
    filename = f"СМР {date_from:%d.%m.%Y} - {date_to:%d.%m.%Y}.xlsx"
    return buffer.getvalue(), filename, {
        "employees": len(data["employees"]),
        "objects": len(data["objects"]),
        "source_rows": data["source_rows"],
        "works": len(data["works"]),
        "zero_salary_rows": data["zero_participant_salary_rows"],
        "unresolved_members": data["unresolved_members"],
        "incomplete_employee_names": data["incomplete_employee_names"],
    }
