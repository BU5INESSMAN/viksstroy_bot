"""Period payroll matrix for completed SMR reports.

The workbook intentionally mirrors the accounting export supplied by the
customer: employees are rows, objects are paired salary/hour columns and the
last row/columns contain totals.  Participant salary is a dedicated value
entered by a foreman; catalog work-rate salary is never substituted for it.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins


HEADER_BLUE = "4574A0"
TOTAL_BLUE = "4A62B9"
GRID_BLUE = "7D8AB9"
HEADER_BORDER = "BDC7EB"


def _clean_number(value: float) -> int | float:
    rounded = round(float(value or 0), 8)
    if abs(rounded - round(rounded)) < 1e-8:
        return int(round(rounded))
    return rounded


async def load_period_matrix(db, date_from: date, date_to: date) -> dict[str, Any]:
    """Return employee/object salary and person-hour aggregates.

    Only reports that are genuinely in the ready state are included. Main and
    addendum rows are both counted, because an addendum is part of the final
    factual report. Deleted team-member names fall back to the immutable SMR
    audit snapshots when available and finally to a stable technical label.
    """
    if db.conn is None:
        await db.init_db()

    async with db.conn.execute(
        """
        SELECT ah.id,
               ah.app_id,
               ah.user_id AS member_id,
               COALESCE(NULLIF(TRIM(tm.fio), ''), '') AS member_fio,
               a.object_id,
               COALESCE(NULLIF(TRIM(o.name), ''),
                        NULLIF(TRIM(a.object_address), ''),
                        'Объект ' || a.id) AS object_name,
               COALESCE(ah.hours, 0) AS hours,
               COALESCE(ah.participant_salary, 0) AS participant_salary
        FROM application_hours ah
        JOIN applications a ON a.id = ah.app_id
        LEFT JOIN team_members tm ON tm.id = ah.user_id
        LEFT JOIN objects o ON o.id = a.object_id
        WHERE date(a.date_target) BETWEEN date(?) AND date(?)
          AND (
                a.smr_status = 'approved'
                OR (
                    COALESCE(TRIM(a.smr_status), '') = ''
                    AND a.kp_status = 'approved'
                )
              )
        ORDER BY object_name COLLATE NOCASE, member_fio COLLATE NOCASE, ah.id
        """,
        (date_from.isoformat(), date_to.isoformat()),
    ) as cursor:
        rows = [dict(row) for row in await cursor.fetchall()]
    from smr_roster import enrich_historical_hours
    if rows:
        async with db.conn.execute('PRAGMA table_info(application_hours)') as cursor:
            has_teams = 'team_id' in {r[1] for r in await cursor.fetchall()}
        if has_teams:
            async with db.conn.execute('SELECT id,team_id FROM application_hours') as cursor:
                hour_teams = {r[0]:r[1] for r in await cursor.fetchall()}
            for row in rows:
                row['team_id'] = hour_teams[row['id']]
            await enrich_historical_hours(db, rows, sorted({r['app_id'] for r in rows}))
    for row in rows:
        row['member_fio'] = row.get('fio') or row['member_fio']

    matrix: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: {"salary": 0.0, "hours": 0.0})
    )
    employee_names: dict[str, str] = {}
    object_names: dict[str, str] = {}
    missing_names: set[int] = set()
    for row in rows:
        fio = str(row.get("member_fio") or "").strip()
        member_id = int(row.get("member_id") or 0)
        if not fio:
            missing_names.add(member_id)
            fio = f"Сотрудник #{member_id}"
        object_name = str(row.get("object_name") or "Объект").strip() or "Объект"
        employee_key = f"member:{member_id}"
        object_id = int(row.get("object_id") or 0)
        object_key = (
            f"object:{object_id}"
            if object_id > 0
            else f"address:{object_name.casefold()}"
        )
        employee_names[employee_key] = fio
        object_names[object_key] = object_name
        bucket = matrix[employee_key][object_key]
        bucket["salary"] += float(row.get("participant_salary") or 0)
        bucket["hours"] += float(row.get("hours") or 0)

    employees = sorted(
        matrix,
        key=lambda key: (employee_names.get(key, key).casefold(), key),
    )
    objects = sorted(
        {object_key for employee in matrix.values() for object_key in employee},
        key=lambda key: (object_names.get(key, key).casefold(), key),
    )
    zero_salary_rows = sum(
        1 for row in rows
        if float(row.get("hours") or 0) != 0
        and float(row.get("participant_salary") or 0) == 0
    )
    return {
        "employees": employees,
        "employee_names": employee_names,
        "objects": objects,
        "object_names": object_names,
        "matrix": matrix,
        "source_rows": len(rows),
        "zero_salary_rows": zero_salary_rows,
        "missing_member_ids": sorted(value for value in missing_names if value > 0),
    }


def build_period_workbook(
    data: dict[str, Any], date_from: date, date_to: date
) -> Workbook:
    """Build the exact matrix layout used by the supplied July 2026 report."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Лист_1"
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = "portrait"
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.page_margins = PageMargins(
        left=0.3937007874,
        right=0.3937007874,
        top=0.3937007874,
        bottom=0.3937007874,
        header=0,
        footer=0,
    )

    normal_font = Font(name="Arial", size=8)
    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    total_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor=HEADER_BLUE)
    total_fill = PatternFill("solid", fgColor=TOTAL_BLUE)
    body_side = Side(style="thin", color=GRID_BLUE)
    head_side = Side(style="thin", color=HEADER_BORDER)
    body_border = Border(left=body_side, right=body_side, top=body_side, bottom=body_side)
    head_border = Border(left=head_side, right=head_side, top=head_side, bottom=head_side)

    sheet["A2"] = "Параметры:"
    sheet["C2"] = (
        f"Период: {date_from.strftime('%d.%m.%Y')} - "
        f"{date_to.strftime('%d.%m.%Y')}"
    )
    for address in ("A2", "C2"):
        sheet[address].font = normal_font
        sheet[address].alignment = Alignment(vertical="top")

    sheet.merge_cells("A4:C5")
    sheet["A4"] = "Сотрудник"

    objects: list[str] = data["objects"]
    employee_start = 6
    first_data_column = 4
    column_pairs: list[tuple[int, int, str]] = []
    next_column = first_data_column
    object_names: dict[str, str] = data.get("object_names") or {}
    for index, object_key in enumerate(objects):
        object_name = object_names.get(object_key, object_key)
        if index == 0:
            salary_column, hours_column = next_column, next_column + 2
            sheet.merge_cells(
                start_row=4,
                start_column=salary_column,
                end_row=4,
                end_column=hours_column,
            )
            sheet.merge_cells(
                start_row=5,
                start_column=salary_column,
                end_row=5,
                end_column=salary_column + 1,
            )
            next_column += 3
        else:
            salary_column, hours_column = next_column, next_column + 1
            sheet.merge_cells(
                start_row=4,
                start_column=salary_column,
                end_row=4,
                end_column=hours_column,
            )
            next_column += 2
        sheet.cell(4, salary_column, object_name)
        sheet.cell(5, salary_column, "Заработная плата")
        sheet.cell(5, hours_column, "Количество часов")
        column_pairs.append((salary_column, hours_column, object_key))

    total_salary_column, total_hours_column = next_column, next_column + 1
    sheet.merge_cells(
        start_row=4,
        start_column=total_salary_column,
        end_row=4,
        end_column=total_hours_column,
    )
    sheet.cell(4, total_salary_column, "Итого")
    sheet.cell(5, total_salary_column, "Заработная плата")
    sheet.cell(5, total_hours_column, "Количество часов")

    for row in range(4, 6):
        for column in range(1, total_hours_column + 1):
            cell = sheet.cell(row, column)
            cell.font = header_font
            cell.fill = header_fill
            cell.border = head_border
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    matrix = data["matrix"]
    employees: list[str] = data["employees"]
    employee_names: dict[str, str] = data.get("employee_names") or {}
    for offset, employee_key in enumerate(employees):
        row = employee_start + offset
        sheet.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)
        name_cell = sheet.cell(row, 1, employee_names.get(employee_key, employee_key))
        name_cell.font = normal_font
        name_cell.alignment = Alignment(vertical="top", wrap_text=True)
        name_cell.border = body_border

        row_salary = 0.0
        row_hours = 0.0
        for pair_index, (salary_column, hours_column, object_key) in enumerate(column_pairs):
            values = matrix[employee_key].get(object_key, {"salary": 0, "hours": 0})
            salary = float(values.get("salary") or 0)
            hours = float(values.get("hours") or 0)
            # The supplied report merges the two salary cells of its wider
            # first object only for non-empty employee rows.
            if pair_index == 0 and salary:
                sheet.merge_cells(
                    start_row=row,
                    start_column=salary_column,
                    end_row=row,
                    end_column=salary_column + 1,
                )
            row_salary += salary
            row_hours += hours
            for column, value, number_format in (
                (salary_column, salary, "#,##0.00"),
                (hours_column, hours, "0.########"),
            ):
                cell = sheet.cell(row, column)
                if value:
                    cell.value = _clean_number(value)
                cell.font = normal_font
                cell.border = body_border
                cell.alignment = Alignment(horizontal="right", vertical="top")
                cell.number_format = number_format
        for column, value, number_format in (
            (total_salary_column, row_salary, "#,##0.00"),
            (total_hours_column, row_hours, "0.########"),
        ):
            cell = sheet.cell(row, column, _clean_number(value))
            cell.font = normal_font
            cell.border = body_border
            cell.alignment = Alignment(horizontal="right", vertical="top")
            cell.number_format = number_format
        sheet.row_dimensions[row].height = 11.25

    total_row = employee_start + len(employees)
    sheet.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=3)
    if column_pairs:
        sheet.merge_cells(
            start_row=total_row,
            start_column=column_pairs[0][0],
            end_row=total_row,
            end_column=column_pairs[0][0] + 1,
        )
    sheet.cell(total_row, 1, "Итого")
    grand_salary = 0.0
    grand_hours = 0.0
    for salary_column, hours_column, object_key in column_pairs:
        salary_total = sum(
            float(matrix[employee_key].get(object_key, {}).get("salary") or 0)
            for employee_key in employees
        )
        hours_total = sum(
            float(matrix[employee_key].get(object_key, {}).get("hours") or 0)
            for employee_key in employees
        )
        grand_salary += salary_total
        grand_hours += hours_total
        sheet.cell(total_row, salary_column, _clean_number(salary_total)).number_format = "#,##0.00"
        sheet.cell(total_row, hours_column, _clean_number(hours_total)).number_format = "0.########"
    sheet.cell(total_row, total_salary_column, _clean_number(grand_salary)).number_format = "#,##0.00"
    sheet.cell(total_row, total_hours_column, _clean_number(grand_hours)).number_format = "0.########"

    for column in range(1, total_hours_column + 1):
        cell = sheet.cell(total_row, column)
        cell.font = total_font
        cell.fill = total_fill
        cell.border = head_border
        cell.alignment = Alignment(
            horizontal="right" if column >= first_data_column else None,
            vertical="top",
        )

    sheet.row_dimensions[1].height = 9.95
    sheet.row_dimensions[2].height = 11.25
    sheet.row_dimensions[3].height = 9.95
    sheet.row_dimensions[4].height = 38.25
    sheet.row_dimensions[5].height = 25.5
    sheet.row_dimensions[total_row].height = 12.75
    sheet.column_dimensions["A"].width = 9.67
    sheet.column_dimensions["B"].width = 0.36
    sheet.column_dimensions["C"].width = 20.33

    for index, (salary_column, hours_column, object_key) in enumerate(column_pairs):
        object_name = object_names.get(object_key, object_key)
        title_width = min(32.5, max(14.0, len(object_name) * 0.47))
        if index == 0:
            sheet.column_dimensions[get_column_letter(salary_column)].width = 5.17
            sheet.column_dimensions[get_column_letter(salary_column + 1)].width = max(15.0, title_width - 5.0)
            sheet.column_dimensions[get_column_letter(hours_column)].width = max(15.17, title_width)
        else:
            sheet.column_dimensions[get_column_letter(salary_column)].width = title_width
            sheet.column_dimensions[get_column_letter(hours_column)].width = title_width + 0.17
    sheet.column_dimensions[get_column_letter(total_salary_column)].width = 15.33
    sheet.column_dimensions[get_column_letter(total_hours_column)].width = 18.33
    sheet.print_area = f"A1:{get_column_letter(total_hours_column)}{total_row}"
    return workbook


async def generate_period_report(
    db, date_from: date, date_to: date
) -> tuple[bytes, str, dict[str, Any]]:
    data = await load_period_matrix(db, date_from, date_to)
    workbook = build_period_workbook(data, date_from, date_to)
    buffer = BytesIO()
    workbook.save(buffer)
    filename = (
        f"СМР {date_from.strftime('%d.%m.%Y')} - "
        f"{date_to.strftime('%d.%m.%Y')}.xlsx"
    )
    summary = {
        "employees": len(data["employees"]),
        "objects": len(data["objects"]),
        "source_rows": data["source_rows"],
        "zero_salary_rows": data["zero_salary_rows"],
        "missing_member_ids": data["missing_member_ids"],
    }
    return buffer.getvalue(), filename, summary
