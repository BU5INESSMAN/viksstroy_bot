"""
Генератор изображения ежедневной расстановки (расписание).
Собирает утвержденные/опубликованные заявки на указанную дату и генерирует
визуальную таблицу (PNG) для публикации в групповой чат.
"""
import sys
import os
import json
import io
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw, ImageFont
from database_deps import db, TZ_BARNAUL
from utils import (
    get_fonts, clean_text, strip_html,
    send_max_text, send_max_message, get_max_group_id,
    notify_group_chat,
)
import aiohttp
from maxapi.types import InputMedia


# ─────────────────────────────────────────────
# Утилиты рисования
# ─────────────────────────────────────────────
def _load_fonts():
    """Возвращает набор шрифтов для расстановки."""
    font_dir = "data/fonts"
    reg_path = os.path.join(font_dir, "Roboto-Regular.ttf")
    bold_path = os.path.join(font_dir, "Roboto-Bold.ttf")
    try:
        title_font = ImageFont.truetype(bold_path, 32)
        header_font = ImageFont.truetype(bold_path, 22)
        cell_font = ImageFont.truetype(reg_path, 20)
        cell_bold = ImageFont.truetype(bold_path, 20)
        small_font = ImageFont.truetype(reg_path, 16)
    except Exception:
        title_font = header_font = cell_font = cell_bold = small_font = ImageFont.load_default()
    return title_font, header_font, cell_font, cell_bold, small_font


# ─────────────────────────────────────────────
# Сбор данных из БД
# ─────────────────────────────────────────────
async def _fetch_schedule_data(target_date: str):
    """Получает данные расстановки на конкретную дату."""
    if db.conn is None:
        await db.init_db()

    async with db.conn.execute(
        "SELECT * FROM applications WHERE date_target = ? AND status IN ('approved', 'published', 'in_progress') ORDER BY id",
        (target_date,),
    ) as cur:
        cols = [c[0] for c in cur.description]
        apps = [dict(zip(cols, row)) for row in await cur.fetchall()]

    # Подтягиваем данные бригад, членов, техники
    teams_cache = {}
    async with db.conn.execute("SELECT id, name FROM teams") as cur:
        for r in await cur.fetchall():
            teams_cache[r[0]] = r[1]

    rows = []
    for app in apps:
        foreman_name = app.get("foreman_name", "—")
        obj_addr = app.get("object_address", "—")

        # Бригады
        team_ids_str = str(app.get("team_id", "0"))
        t_ids = [int(x) for x in team_ids_str.split(",") if x.strip().isdigit()]
        team_names = [teams_cache.get(tid, f"Бригада {tid}") for tid in t_ids] or ["—"]

        # Участники
        members_text = []
        selected = app.get("selected_members", "")
        if selected:
            m_ids = [int(x) for x in selected.split(",") if x.strip().isdigit()]
            if m_ids:
                pl = ",".join(["?"] * len(m_ids))
                async with db.conn.execute(
                    f"SELECT fio, position FROM team_members WHERE id IN ({pl})", m_ids
                ) as cur:
                    for r in await cur.fetchall():
                        members_text.append(f"{r[0]} ({r[1]})" if r[1] else r[0])

        # Техника
        equip_text = []
        eq_data_str = app.get("equipment_data", "")
        if eq_data_str:
            try:
                eq_list = json.loads(eq_data_str)
                for eq in eq_list:
                    freed = eq.get("is_freed", False)
                    status_label = "свободна" if freed else "в работе"
                    equip_text.append(f"{eq['name']} ({status_label})")
            except Exception:
                pass

        rows.append({
            "foreman": foreman_name,
            "object": obj_addr,
            "teams": ", ".join(team_names),
            "members": "\n".join(members_text) if members_text else "—",
            "equipment": "\n".join(equip_text) if equip_text else "—",
        })

    return rows


# ─────────────────────────────────────────────
# Отрисовка изображения-таблицы
# ─────────────────────────────────────────────
def _render_schedule_image(date_str: str, rows: list) -> io.BytesIO:
    """Рисует таблицу расстановки и возвращает PNG-буфер."""
    title_font, header_font, cell_font, cell_bold, small_font = _load_fonts()

    # Параметры таблицы
    col_widths = [180, 220, 160, 260, 220]  # Прораб | Объект | Бригада | Состав | Техника
    headers = ["Прораб", "Объект", "Бригада", "Состав", "Техника"]
    table_w = sum(col_widths)
    pad = 40
    img_w = table_w + pad * 2

    # Предварительный расчёт высоты каждой строки
    dummy_img = Image.new("RGB", (1, 1))
    dummy_draw = ImageDraw.Draw(dummy_img)

    def text_height(text, font, max_w):
        lines = []
        for paragraph in text.split("\n"):
            words = paragraph.split(" ")
            if not words or not words[0]:
                lines.append("")
                continue
            current = words[0]
            for w in words[1:]:
                bbox = dummy_draw.textbbox((0, 0), current + " " + w, font=font)
                if bbox[2] - bbox[0] <= max_w:
                    current += " " + w
                else:
                    lines.append(current)
                    current = w
            lines.append(current)
        bbox_line = dummy_draw.textbbox((0, 0), "Ay", font=font)
        line_h = (bbox_line[3] - bbox_line[1]) + 8
        return max(len(lines), 1) * line_h, lines

    row_heights = []
    row_cells = []  # list of list of (wrapped_lines, line_h)
    for r in rows:
        vals = [r["foreman"], r["object"], r["teams"], r["members"], r["equipment"]]
        max_h = 0
        cells = []
        for i, v in enumerate(vals):
            h, wrapped = text_height(v, cell_font, col_widths[i] - 16)
            bbox_line = dummy_draw.textbbox((0, 0), "Ay", font=cell_font)
            line_h = (bbox_line[3] - bbox_line[1]) + 8
            cells.append((wrapped, line_h))
            if h > max_h:
                max_h = h
        row_heights.append(max(max_h + 20, 50))
        row_cells.append(cells)

    # Расчёт общей высоты
    title_block_h = 100
    header_h = 50
    total_rows_h = sum(row_heights) if row_heights else 60
    footer_h = 50
    img_h = title_block_h + header_h + total_rows_h + footer_h + pad

    img = Image.new("RGB", (img_w, img_h), color=(243, 244, 246))
    draw = ImageDraw.Draw(img)

    # --- Заголовок ---
    draw.rounded_rectangle([pad, 20, img_w - pad, 20 + 70], radius=16, fill=(37, 99, 235))
    title_text = f"РАССТАНОВКА НА {date_str}"
    bbox_t = draw.textbbox((0, 0), title_text, font=title_font)
    tx = (img_w - (bbox_t[2] - bbox_t[0])) // 2
    draw.text((tx, 32), title_text, fill=(255, 255, 255), font=title_font)

    y = title_block_h

    # --- Шапка таблицы ---
    x = pad
    draw.rectangle([pad, y, pad + table_w, y + header_h], fill=(55, 65, 81))
    for i, hdr in enumerate(headers):
        bbox_h = draw.textbbox((0, 0), hdr, font=header_font)
        hx = x + (col_widths[i] - (bbox_h[2] - bbox_h[0])) // 2
        draw.text((hx, y + 12), hdr, fill=(255, 255, 255), font=header_font)
        x += col_widths[i]

    y += header_h

    # --- Строки ---
    if not rows:
        draw.rectangle([pad, y, pad + table_w, y + 60], fill=(255, 255, 255), outline=(209, 213, 219))
        no_data = "Нет утверждённых нарядов"
        bbox_nd = draw.textbbox((0, 0), no_data, font=cell_font)
        ndx = (img_w - (bbox_nd[2] - bbox_nd[0])) // 2
        draw.text((ndx, y + 18), no_data, fill=(107, 114, 128), font=cell_font)
        y += 60
    else:
        for ri, (rh, cells) in enumerate(zip(row_heights, row_cells)):
            bg = (255, 255, 255) if ri % 2 == 0 else (249, 250, 251)
            draw.rectangle([pad, y, pad + table_w, y + rh], fill=bg, outline=(229, 231, 235))

            x = pad
            for ci, (wrapped, line_h) in enumerate(cells):
                # Вертикальные разделители
                if ci > 0:
                    draw.line([x, y, x, y + rh], fill=(229, 231, 235), width=1)

                ty = y + 10
                for line in wrapped:
                    draw.text((x + 8, ty), line.strip(), fill=(31, 41, 55), font=cell_font)
                    ty += line_h
                x += col_widths[ci]

            y += rh

    # --- Футер ---
    now_str = datetime.now(TZ_BARNAUL).strftime("%d.%m.%Y %H:%M")
    footer = f"Сгенерировано: {now_str}"
    bbox_f = draw.textbbox((0, 0), footer, font=small_font)
    draw.text((img_w - pad - (bbox_f[2] - bbox_f[0]), y + 15), footer, fill=(156, 163, 175), font=small_font)

    # Обрезаем до фактической высоты
    img = img.crop((0, 0, img_w, y + footer_h))

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

    rows = await _fetch_schedule_data(target_date)
    return _render_schedule_image(target_date, rows)


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
            async with aiohttp.ClientSession() as session:
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

    # Все активные прорабы
    async with db.conn.execute(
        "SELECT user_id FROM users WHERE role = 'foreman' AND is_blacklisted = 0"
    ) as cur:
        all_foremen = {r[0] for r in await cur.fetchall()}

    if not all_foremen:
        return False

    # Прорабы, у которых есть утверждённая/опубликованная заявка на дату
    async with db.conn.execute(
        "SELECT DISTINCT foreman_id FROM applications WHERE date_target = ? AND status IN ('approved', 'published', 'in_progress')",
        (target_date,),
    ) as cur:
        approved_foremen = {r[0] for r in await cur.fetchall()}

    return all_foremen.issubset(approved_foremen)
