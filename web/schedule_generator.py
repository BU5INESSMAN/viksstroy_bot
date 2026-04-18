"""
Генератор изображения ежедневной расстановки (расписание).
Собирает утвержденные/опубликованные заявки на указанную дату и генерирует
визуальную таблицу (PNG) в стиле Excel для публикации в групповой чат.
"""
import sys
import os
import json
import io
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import logging

from PIL import Image, ImageDraw, ImageFont
from database_deps import db, TZ_BARNAUL
from services.max_api import send_max_message, get_max_group_id
import aiohttp
from services.tg_session import get_tg_session

logger = logging.getLogger("SCHEDULE_GEN")


# ─────────────────────────────────────────────
# Шрифты
# ─────────────────────────────────────────────
def _object_cell(pairs: list[tuple[str, str]]):
    """Collapse a list of (name, address) pairs into the cell value used by
    the renderer. Address is intentionally ignored — schedule shows only
    object names."""
    if not pairs:
        return ""
    uniq_names: list[str] = []
    seen: set[str] = set()
    for name, _addr in pairs:
        if name and name not in seen:
            seen.add(name)
            uniq_names.append(name)
    return ", ".join(uniq_names)


def _get_status_label(member: dict, target_date: str) -> str:
    """Return display label for employee status. Always returns a label, never empty or dash."""
    status = (member.get('status') or '').strip()

    # Check date range — if status has expired or not yet active, treat as available
    if status and status != 'available':
        status_until = member.get('status_until', '') or ''
        status_from = member.get('status_from', '') or ''
        if status_until and status_until < target_date:
            status = 'available'  # expired
        if status_from and status_from > target_date:
            status = 'available'  # not yet active

    STATUS_LABELS = {
        'vacation': 'Отп',
        'sick': 'Бол',
        'repair': 'Рем',
    }
    return STATUS_LABELS.get(status, 'Акт')  # default is always 'Акт'


def _load_font(size: int, bold: bool = False):
    """Calibri → Arial → Roboto → default."""
    candidates = [
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "data/fonts/Roboto-Bold.ttf" if bold else "data/fonts/Roboto-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


# ─────────────────────────────────────────────
# Сбор данных из БД (посекционно)
# ─────────────────────────────────────────────
async def _fetch_schedule_sections(target_date: str) -> list:
    """Возвращает список секций [{title, rows: [{name, role, status, object}]}]."""
    if db.conn is None:
        await db.init_db()

    # Все заявки на дату
    async with db.conn.execute(
        "SELECT * FROM applications WHERE date_target = ? "
        "AND status IN ('approved','published','in_progress') ORDER BY id",
        (target_date,),
    ) as cur:
        cols = [c[0] for c in cur.description]
        apps = [dict(zip(cols, row)) for row in await cur.fetchall()]

    logger.info(f"Schedule sections for {target_date}: {len(apps)} rows found")
    for app in apps:
        logger.info(f"  app #{app.get('id')}: status={app.get('status')}, "
                     f"foreman_id={app.get('foreman_id')} (type={type(app.get('foreman_id')).__name__}), "
                     f"object_address={app.get('object_address')!r}")

    # Обратные индексы: кто на каком объекте — храним пары (name, address)
    # чтобы рендер мог показать адрес отдельной серой строкой.
    member_objs: dict[int, list[tuple[str, str]]] = {}
    equip_objs: dict[int, list[tuple[str, str]]] = {}
    foreman_objs: dict[int, list[tuple[str, str]]] = {}

    # Batch-lookup objects table to split the legacy merged object_address
    # into (name, address) pairs per app.
    obj_id_to_pair: dict[int, tuple[str, str]] = {}
    obj_ids = {int(a["object_id"]) for a in apps if a.get("object_id")}
    if obj_ids:
        pl = ",".join("?" * len(obj_ids))
        async with db.conn.execute(
            f"SELECT id, name, address FROM objects WHERE id IN ({pl})",
            list(obj_ids),
        ) as _oc:
            for oid, oname, oaddr in await _oc.fetchall():
                obj_id_to_pair[int(oid)] = ((oname or "").strip(), (oaddr or "").strip())

    for app in apps:
        legacy = (app.get("object_address", "") or "").strip()
        if app.get("object_id") and int(app["object_id"]) in obj_id_to_pair:
            pair = obj_id_to_pair[int(app["object_id"])]
        else:
            pair = (legacy, "")

        fid = app.get("foreman_id")
        if fid:
            fid = int(fid)
            foreman_objs.setdefault(fid, []).append(pair)

        sel = app.get("selected_members", "") or ""
        for s in sel.split(","):
            s = s.strip()
            if s.isdigit():
                member_objs.setdefault(int(s), []).append(pair)

        eq_str = app.get("equipment_data", "") or ""
        if eq_str:
            try:
                for eq in json.loads(eq_str):
                    eid = eq.get("id")
                    if eid:
                        equip_objs.setdefault(int(eid), []).append(pair)
            except Exception:
                pass

    # v2.4.9: also credit a foreman with an object when their team is
    # assigned to the application, even if someone else created the app.
    # Without this the ПРОРАБЫ section shows an empty "Объект" cell for
    # foremen who didn't personally submit the request.
    try:
        async with db.conn.execute(
            "SELECT team_id, tg_user_id FROM team_members "
            "WHERE is_foreman = 1 AND tg_user_id IS NOT NULL AND tg_user_id != 0"
        ) as _tmc:
            team_foremen: dict[int, list[int]] = {}
            for tm_tid, tm_uid in await _tmc.fetchall():
                if tm_tid is None:
                    continue
                team_foremen.setdefault(int(tm_tid), []).append(int(tm_uid))
    except Exception:
        team_foremen = {}

    for app in apps:
        team_field = app.get("team_id")
        if not team_field:
            continue
        app_teams: list[int] = []
        for part in str(team_field).split(","):
            part = part.strip()
            if part.isdigit():
                app_teams.append(int(part))
        if not app_teams:
            continue
        if app.get("object_id") and int(app["object_id"]) in obj_id_to_pair:
            pair = obj_id_to_pair[int(app["object_id"])]
        else:
            pair = ((app.get("object_address", "") or "").strip(), "")
        for tid in app_teams:
            for uid in team_foremen.get(tid, []):
                foreman_objs.setdefault(uid, []).append(pair)

    logger.info(f"  foreman_objs keys: {list(foreman_objs.keys())}")
    logger.info(f"  member_objs keys: {list(member_objs.keys())}")
    logger.info(f"  equip_objs keys: {list(equip_objs.keys())}")

    sections = []

    # ── ПРОРАБЫ ──────────────────────────────
    ROLE_MAP = {
        "foreman": "прораб",
        "admin": "начальник участка",
        "master": "мастер",
        "viewer": "руководитель строит. уч.",
    }
    async with db.conn.execute(
        "SELECT user_id, fio, role FROM users "
        "WHERE role IN ('foreman','admin','master','viewer') "
        "AND is_blacklisted = 0 AND is_active = 1 ORDER BY fio"
    ) as cur:
        foremen_rows = await cur.fetchall()

    logger.info(f"  foremen from users table: {[(r[0], r[1]) for r in foremen_rows]}")
    if foremen_rows:
        rows = []
        # Batch lookup specialty for each foreman so the label under FIO
        # reflects what the user actually entered in their profile.
        foreman_ids = [r[0] for r in foremen_rows]
        specialties: dict[int, str] = {}
        if foreman_ids:
            pl = ",".join("?" * len(foreman_ids))
            async with db.conn.execute(
                f"SELECT user_id, specialty FROM users WHERE user_id IN ({pl})",
                foreman_ids,
            ) as sp_cur:
                for sp_row in await sp_cur.fetchall():
                    specialties[sp_row[0]] = (sp_row[1] or "").strip()

        for uid, fio, role in foremen_rows:
            objs = foreman_objs.get(uid, [])
            specialty = specialties.get(uid, "")
            # Prefer specialty; fall back to role label only if empty.
            label = specialty or ROLE_MAP.get(role, role or "—")
            rows.append({
                "name": fio or "—",
                "role": label,
                "status": _get_status_label({}, target_date),
                "object": _object_cell(objs),
            })
        sections.append({"title": "ПРОРАБЫ", "rows": rows})

    # ── Бригады (машины) ─────────────────────
    async with db.conn.execute("SELECT id, name FROM teams ORDER BY name") as cur:
        teams = await cur.fetchall()

    for tid, tname in teams:
        async with db.conn.execute(
            "SELECT id, fio, position, status, status_from, status_until FROM team_members "
            "WHERE team_id = ? ORDER BY is_leader DESC, is_foreman DESC, fio",
            (tid,),
        ) as cur:
            members = await cur.fetchall()
        if not members:
            continue
        rows = []
        for mid, fio, pos, m_status, m_status_from, m_status_until in members:
            objs = member_objs.get(mid, [])
            member = {
                'status': m_status,
                'status_from': m_status_from,
                'status_until': m_status_until,
            }
            rows.append({
                "name": fio or "—",
                "role": pos or "—",
                "status": _get_status_label(member, target_date),
                "object": _object_cell(objs),
            })
        sections.append({"title": tname, "rows": rows})

    # ── Техника (по категориям) ───────────────
    async with db.conn.execute(
        "SELECT id, name, category, driver_fio, status FROM equipment "
        "WHERE is_active = 1 ORDER BY category, driver_fio"
    ) as cur:
        equip_rows = await cur.fetchall()

    eq_cats: dict[str, list] = {}
    for eid, ename, cat, driver, eq_status in equip_rows:
        cat = cat or "Прочая техника"
        objs = equip_objs.get(eid, [])
        eq_cats.setdefault(cat, []).append({
            "name": driver or "—",
            "role": ename or "—",
            "status": _get_status_label({'status': eq_status}, target_date),
            "object": _object_cell(objs),
        })

    for cat, rows in eq_cats.items():
        sections.append({"title": cat, "rows": rows})

    return sections


# ─────────────────────────────────────────────
# Отрисовка таблицы (стиль Excel)
# ─────────────────────────────────────────────
def _clip_text(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> str:
    """Обрезает текст до max_w пикселей, добавляя '…'."""
    if not text:
        return ""
    bb = draw.textbbox((0, 0), text, font=font)
    if (bb[2] - bb[0]) <= max_w:
        return text
    while text:
        trial = text + "…"
        bb = draw.textbbox((0, 0), trial, font=font)
        if (bb[2] - bb[0]) <= max_w:
            return trial
        text = text[:-1]
    return "…"


def _render_schedule_image(date_str: str, sections: list) -> io.BytesIO:
    """Рисует таблицу-расстановку в стиле Excel и возвращает PNG-буфер."""
    font = _load_font(14, bold=False)
    font_bold = _load_font(14, bold=True)

    # Ширины колонок: ФИО | Должность | Статус | Объект
    COL_W = [200, 270, 50, 240]
    TABLE_W = sum(COL_W)
    ROW_H = 20
    PX = 4   # padding-x
    PY = 2   # padding-y

    YELLOW = (255, 242, 204)   # #FFF2CC
    BLACK = (0, 0, 0)
    WHITE = (255, 255, 255)

    # Status text → fill color
    STATUS_COLORS = {
        "Акт": (46, 125, 50),      # Dark green
        "Отп": (183, 149, 11),     # Dark yellow
        "Бол": (198, 40, 40),      # Dark red
        "Рем": (198, 40, 40),      # Dark red
    }

    # Дата для отображения
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        display_date = dt.strftime("%d.%m.%Y")
    except ValueError:
        display_date = date_str

    # Считаем высоту: 1 строка (дата) + для каждой секции (заголовок + строки).
    img_h = ROW_H  # date row
    for s in sections:
        img_h += ROW_H  # section header
        img_h += ROW_H * len(s["rows"])
    img_h += 1

    img = Image.new("RGB", (TABLE_W + 1, img_h), WHITE)
    draw = ImageDraw.Draw(img)

    y = 0

    # ── Строка с датой ──
    draw.rectangle([0, y, TABLE_W, y + ROW_H], fill=WHITE, outline=BLACK)
    bb = draw.textbbox((0, 0), display_date, font=font_bold)
    tx = (TABLE_W - (bb[2] - bb[0])) // 2
    draw.text((tx, y + PY), display_date, fill=BLACK, font=font_bold)
    y += ROW_H

    for section in sections:
        # ── Заголовок секции (жёлтый фон) ──
        x = 0
        for cw in COL_W:
            draw.rectangle([x, y, x + cw, y + ROW_H], fill=YELLOW, outline=BLACK)
            x += cw
        draw.text((PX, y + PY), section["title"], fill=BLACK, font=font_bold)
        y += ROW_H

        # ── Строки данных ──
        for row in section["rows"]:
            x = 0
            vals = [row["name"], row["role"], str(row["status"]), row.get("object", "")]
            for ci, val in enumerate(vals):
                draw.rectangle([x, y, x + COL_W[ci], y + ROW_H], fill=WHITE, outline=BLACK)
                if ci == 2:  # Status column — centered, color-coded
                    clipped = _clip_text(draw, str(val), font, COL_W[ci] - PX * 2)
                    text_color = STATUS_COLORS.get(clipped, BLACK)
                    status_font = font_bold if clipped in ("Акт", "Отп", "Бол", "Рем") else font
                    bb = draw.textbbox((0, 0), clipped, font=status_font)
                    cx = x + (COL_W[ci] - (bb[2] - bb[0])) // 2
                    cy = y + (ROW_H - (bb[3] - bb[1])) // 2 - 2
                    draw.text((cx, cy), clipped, fill=text_color, font=status_font)
                else:
                    clipped = _clip_text(draw, str(val), font, COL_W[ci] - PX * 2)
                    draw.text((x + PX, y + PY), clipped, fill=BLACK, font=font)
                x += COL_W[ci]
            y += ROW_H

    img = img.crop((0, 0, TABLE_W + 1, y + 1))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


# ─────────────────────────────────────────────
# Публичный API
# ─────────────────────────────────────────────
async def generate_schedule_image(target_date: str = None) -> io.BytesIO:
    """Генерирует PNG-расстановку. По умолчанию — на завтра."""
    if target_date is None:
        tomorrow = datetime.now(TZ_BARNAUL) + timedelta(days=1)
        target_date = tomorrow.strftime("%Y-%m-%d")

    sections = await _fetch_schedule_sections(target_date)
    return _render_schedule_image(target_date, sections)


async def publish_schedule_to_group(target_date: str = None) -> bool:
    """Генерирует и отправляет расстановку в групповой чат (TG + MAX)."""
    if target_date is None:
        tomorrow = datetime.now(TZ_BARNAUL) + timedelta(days=1)
        target_date = tomorrow.strftime("%Y-%m-%d")

    buf = await generate_schedule_image(target_date)

    # Сохраняем файл
    import time as _time
    filename = f"schedule_{target_date}_{int(_time.time())}.png"
    filepath = os.path.join("data", "uploads", filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(buf.getvalue())

    bot_token = os.getenv("BOT_TOKEN")
    group_id = os.getenv("GROUP_CHAT_ID")
    max_bot_token = os.getenv("MAX_BOT_TOKEN")
    max_group_id = await get_max_group_id()

    published = False

    # TG — отправляем фото в группу
    if bot_token and group_id:
        buf.seek(0)
        data = aiohttp.FormData()
        data.add_field("chat_id", str(group_id))
        data.add_field("photo", buf.getvalue(), filename="schedule.png", content_type="image/png")
        data.add_field("caption", f"📋 Расстановка на {target_date}")
        data.add_field("parse_mode", "HTML")
        try:
            async with await get_tg_session() as session:
                async with session.post(
                    f"https://api.telegram.org/bot{bot_token}/sendPhoto", data=data
                ) as resp:
                    if resp.status == 200:
                        published = True
        except Exception:
            pass

    # MAX — отправляем фото в группу
    if max_bot_token and max_group_id:
        result = await send_max_message(
            max_bot_token, max_group_id,
            f"📋 Расстановка на {target_date}",
            filepath,
        )
        if result:
            published = True

    return published


async def check_all_foremen_approved(target_date: str = None) -> bool:
    """Проверяет, все ли активные прорабы утвердили заявки на указанную дату."""
    if db.conn is None:
        await db.init_db()

    if target_date is None:
        tomorrow = datetime.now(TZ_BARNAUL) + timedelta(days=1)
        target_date = tomorrow.strftime("%Y-%m-%d")

    async with db.conn.execute(
        "SELECT user_id FROM users WHERE role = 'foreman' AND is_blacklisted = 0"
    ) as cur:
        all_foremen = {r[0] for r in await cur.fetchall()}

    if not all_foremen:
        return False

    async with db.conn.execute(
        "SELECT DISTINCT foreman_id FROM applications "
        "WHERE date_target = ? AND status IN ('approved','published','in_progress')",
        (target_date,),
    ) as cur:
        approved_foremen = {r[0] for r in await cur.fetchall()}

    return all_foremen.issubset(approved_foremen)
