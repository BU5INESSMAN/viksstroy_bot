import pdfplumber
import re
from typing import List, Dict, Optional


def parse_smr_pdf(file_path: str) -> dict:
    """
    Parse a PDF estimate to extract object name, address, and SMR works table.
    Returns: { name, address, works: [{ name, unit, volume }], errors: [] }
    """
    errors = []
    full_text = ""
    all_tables = []

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

            tables = page.extract_tables() or []
            for table in tables:
                all_tables.append(table)

    # --- Extract name & address from header ---
    object_name = ""
    object_address = ""

    # Search for "по адресу:" pattern across the full text
    addr_match = re.search(r'(.{5,300}?)\s*по адресу:\s*(.+)', full_text, re.IGNORECASE)
    if addr_match:
        raw_name = addr_match.group(1).strip()
        raw_address = addr_match.group(2).strip()
        # Clean up: take the meaningful tail of the name (remove leading boilerplate)
        # Often the line is like "Смета на строительство объекта ЖК Счастье по адресу: ..."
        object_name = re.sub(r'^.*?(?:объект[аеу]?\s+|на\s+)', '', raw_name, flags=re.IGNORECASE).strip() or raw_name
        # Address: take until end of line
        object_address = raw_address.split('\n')[0].strip()
    else:
        errors.append("Не найден заголовок с 'по адресу:' — заполните название и адрес вручную")

    # --- Extract SMR table ---
    works = _extract_works_from_tables(all_tables, full_text)

    if not works:
        errors.append("Не найдена таблица 'СМР' / 'Строительно-монтажные работы' — добавьте работы вручную")

    return {
        "name": object_name,
        "address": object_address,
        "works": works,
        "errors": errors,
    }


def _extract_works_from_tables(all_tables: list, full_text: str) -> List[Dict]:
    """Find and extract works from SMR table rows."""
    works = []

    # Strategy 1: look for SMR section in tables
    smr_found = False
    for table in all_tables:
        if not table:
            continue

        for row_idx, row in enumerate(table):
            row_text = " ".join(str(c or "") for c in row).strip()

            # Detect SMR header row
            if not smr_found:
                if re.search(r'(СМР|Строительно[\s-]*монтажные\s+работ)', row_text, re.IGNORECASE):
                    smr_found = True
                continue

            # We're inside the SMR section — parse rows
            if smr_found:
                # Stop if we hit another major section header (e.g. "Итого", empty block)
                if re.search(r'^(Итого|Всего|ИТОГО)', row_text.strip()):
                    break

                work = _parse_work_row(row)
                if work:
                    works.append(work)

        if smr_found and works:
            break  # got our data from this table

    # Strategy 2: if no table-based extraction worked, try text-based
    if not works:
        works = _extract_works_from_text(full_text)

    return works


def _parse_work_row(row: list) -> Optional[Dict]:
    """
    Try to extract (name, unit, volume) from a table row.
    Typical columns: №, Name, Unit, Volume, Price, Cost
    We need: Name, Unit, Volume only.
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

    # Heuristic: find the name (longest text cell), unit (short like "м2", "шт"), volume (number)
    name = ""
    unit = ""
    volume = ""

    # Try positional approach first: typically [№, Name, Unit, Volume, ...]
    if len(cells) >= 4:
        # Check if first cell is a row number
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

    # Validate
    if not name or len(name) < 2:
        return None

    # Clean volume: handle comma decimals
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
    """Fallback: try to parse works from raw text if table extraction failed."""
    works = []
    lines = full_text.split('\n')
    in_smr = False

    for line in lines:
        stripped = line.strip()

        if not in_smr:
            if re.search(r'(СМР|Строительно[\s-]*монтажные\s+работ)', stripped, re.IGNORECASE):
                in_smr = True
            continue

        if re.search(r'^(Итого|Всего|ИТОГО)', stripped):
            break

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
