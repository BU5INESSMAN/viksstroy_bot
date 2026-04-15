import pdfplumber
import re
from typing import List, Dict, Optional


def parse_smr_pdf(file_path: str) -> dict:
    """
    Parse a PDF estimate to extract object name, address, and SMR works table.
    Reads ALL pages until 'Итого СМР' is found.
    Returns: { name, address, works: [{ name, unit, volume }], errors: [] }
    """
    errors = []
    full_text = ""
    all_rows = []  # Flattened: all rows from all tables from all pages

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

            tables = page.extract_tables() or []
            for table in tables:
                if table:
                    all_rows.extend(table)

    # --- Extract name & address from header ---
    object_name = ""
    object_address = ""

    addr_match = re.search(r'(.{5,300}?)\s*по адресу:\s*(.+)', full_text, re.IGNORECASE)
    if addr_match:
        raw_name = addr_match.group(1).strip()
        raw_address = addr_match.group(2).strip()
        object_name = re.sub(r'^.*?(?:объект[аеу]?\s+|на\s+)', '', raw_name, flags=re.IGNORECASE).strip() or raw_name
        object_address = raw_address.split('\n')[0].strip()
    else:
        errors.append("Не найден заголовок с 'по адресу:' — заполните название и адрес вручную")

    # --- Extract SMR table (all pages until 'Итого СМР') ---
    works = _extract_works_from_rows(all_rows)

    # Fallback: text-based extraction if table parsing found nothing
    if not works:
        works = _extract_works_from_text(full_text)

    if not works:
        errors.append("Не найдена таблица 'СМР' / 'Строительно-монтажные работы' — добавьте работы вручную")

    return {
        "name": object_name,
        "address": object_address,
        "works": works,
        "errors": errors,
    }


def _extract_works_from_rows(all_rows: list) -> List[Dict]:
    """
    Single-pass through ALL flattened table rows across ALL pages.
    Finds the СМР section header, collects work rows, stops at 'Итого СМР'.
    """
    works = []
    in_smr = False

    for row in all_rows:
        if not row:
            continue

        row_text = " ".join(str(c or "") for c in row).strip()
        row_lower = row_text.lower()

        if not row_text:
            continue

        # Detect SMR section start
        if not in_smr:
            if re.search(r'\bСМР\b|Строительно[\s-]*монтажные\s+работ', row_text, re.IGNORECASE):
                # Make sure this is a section header, not "Итого СМР"
                if 'итого' not in row_lower:
                    in_smr = True
            continue

        # Inside SMR section — check for end marker
        if re.search(r'итого\s+смр|итого\s+строительно', row_lower):
            break  # Done — found "Итого СМР без НДС" or similar

        # Skip sub-totals within SMR (e.g., sub-section totals)
        if re.match(r'^(Всего|ВСЕГО)\b', row_text.strip()):
            continue

        # Skip if we hit a completely different section (safety)
        if re.match(r'^(Материалы|Техника|Оборудование)\s*$', row_text.strip(), re.IGNORECASE):
            in_smr = False
            continue

        # Parse the work row
        work = _parse_work_row(row)
        if work:
            works.append(work)

    return works


def _parse_work_row(row: list) -> Optional[Dict]:
    """
    Try to extract (name, unit, volume) from a table row.
    Typical columns: №, Name, Unit, Volume, Price, Cost
    """
    if not row or len(row) < 3:
        return None

    cells = [str(c or "").strip() for c in row]

    # Skip header rows
    combined = " ".join(cells).lower()
    if any(kw in combined for kw in ['наименование', 'ед.изм', 'ед. изм', '№ п/п']):
        return None

    # Skip empty / numeric-only rows
    non_empty = [c for c in cells if c and not re.match(r'^[\d.,\s]+$', c)]
    if not non_empty:
        return None

    name = ""
    unit = ""
    volume = ""

    # Positional: typically [№, Name, Unit, Volume, Price, Cost]
    if len(cells) >= 4:
        if re.match(r'^\d{1,3}\.?$', cells[0]):
            name = cells[1]
            unit = cells[2]
            volume = cells[3]
        else:
            name = cells[0]
            unit = cells[1]
            volume = cells[2]
    elif len(cells) == 3:
        name = cells[0]
        unit = cells[1]
        volume = cells[2]

    if not name or len(name) < 2:
        return None

    # Clean volume
    volume = volume.replace(',', '.').replace(' ', '')
    try:
        vol_float = float(volume)
    except (ValueError, TypeError):
        vol_float = 0

    if not unit:
        return None

    return {
        "name": name,
        "unit": unit,
        "volume": vol_float,
    }


def _extract_works_from_text(full_text: str) -> List[Dict]:
    """Fallback: parse works from raw text across ALL pages.
    Stops at 'Итого СМР' (case-insensitive)."""
    works = []
    lines = full_text.split('\n')
    in_smr = False

    for line in lines:
        stripped = line.strip()

        if not in_smr:
            if re.search(r'\bСМР\b|Строительно[\s-]*монтажные\s+работ', stripped, re.IGNORECASE):
                if 'итого' not in stripped.lower():
                    in_smr = True
            continue

        # Stop at "Итого СМР" specifically, not just any "Итого"
        if re.search(r'итого\s+смр|итого\s+строительно', stripped, re.IGNORECASE):
            break

        # Skip other section headers if somehow encountered
        if re.match(r'^(Материалы|Техника|Оборудование)\s*$', stripped, re.IGNORECASE):
            in_smr = False
            continue

        # Try to parse: "1. Кладка кирпича   м3   150"
        m = re.match(r'^\d+[\.\)]\s*(.+?)\s{2,}(\S+)\s{2,}([\d.,]+)', stripped)
        if m:
            vol_str = m.group(3).replace(',', '.').replace(' ', '')
            try:
                vol = float(vol_str)
            except ValueError:
                vol = 0
            works.append({
                "name": m.group(1).strip(),
                "unit": m.group(2).strip(),
                "volume": vol,
            })

    return works
