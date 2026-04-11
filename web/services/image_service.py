import os
import re
import time
import base64
import ssl
import urllib.request
import io

from PIL import Image, ImageDraw, ImageFont


def process_base64_image(base64_str: str, prefix: str) -> str:
    if not base64_str: return ""
    try:
        header, encoded = base64_str.split(",", 1)
        ext = header.split(";")[0].split("/")[1]
        if ext not in ['jpeg', 'jpg', 'png', 'gif', 'webp']: ext = 'png'
        filename = f"{prefix}_{int(time.time())}.{ext}"
        filepath = os.path.join("data", "uploads", filename)
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(encoded))
        return f"/uploads/{filename}"
    except:
        return ""


def download_font(url, filename):
    if not os.path.exists(filename) or os.path.getsize(filename) < 10000:
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx) as response, open(filename, 'wb') as out_file:
                out_file.write(response.read())
        except Exception:
            pass


def get_fonts():
    font_dir = "data/fonts"
    reg_path = os.path.join(font_dir, "Roboto-Regular.ttf")
    bold_path = os.path.join(font_dir, "Roboto-Bold.ttf")
    download_font("https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf", reg_path)
    download_font("https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Bold.ttf", bold_path)
    try:
        font_header = ImageFont.truetype(bold_path, 36)
        font_label = ImageFont.truetype(reg_path, 28)
        font_value = ImageFont.truetype(bold_path, 34)
        font_time = ImageFont.truetype(reg_path, 28)
    except:
        font_header = font_label = font_value = font_time = ImageFont.load_default()
    return font_header, font_label, font_value, font_time


def clean_text(text):
    if not text: return ""
    return re.sub(r'[^\w\sА-Яа-яЁёA-Za-z0-9,.:\-!/()«»]', '', str(text))


def strip_html(text):
    if not text: return ""
    clean = re.compile('<.*?>')
    return re.sub(clean, '', str(text)).strip()


def wrap_text(text, font, max_width, draw):
    lines = []
    for paragraph in text.split('\n'):
        words = paragraph.split(' ')
        if not words or not words[0]:
            lines.append('')
            continue
        current_line = words[0]
        for word in words[1:]:
            bbox = draw.textbbox((0, 0), current_line + " " + word, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current_line += " " + word
            else:
                lines.append(current_line)
                current_line = word
        lines.append(current_line)
    return lines


def create_app_image(date_str, address, foreman, team_name, equip_list, comment_str=""):
    font_header, font_label, font_value, font_time = get_fonts()
    img_w, img_h = 900, 2400
    img = Image.new('RGB', (img_w, img_h), color=(243, 244, 246))
    draw = ImageDraw.Draw(img)

    header_h = 140
    draw.rounded_rectangle([40, 40, img_w - 40, 40 + header_h], radius=24, fill=(37, 99, 235))
    draw.rectangle([40, 40 + header_h - 24, img_w - 40, 40 + header_h], fill=(37, 99, 235))

    logo_path = "frontend/public/logo.png"
    logo_drawn = False
    if os.path.exists(logo_path):
        try:
            logo_img = Image.open(logo_path).convert("RGBA")
            aspect = logo_img.width / logo_img.height
            new_h = 80
            new_w = int(new_h * aspect)
            logo_img = logo_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            r, g, b, a = logo_img.split()
            white_logo = Image.merge("RGBA", (Image.new('L', a.size, 255), Image.new('L', a.size, 255),
                                              Image.new('L', a.size, 255), a))
            start_x = (img_w - new_w) // 2
            img.paste(white_logo, (start_x, 40 + (header_h - new_h) // 2), white_logo)
            logo_drawn = True
        except:
            pass

    if not logo_drawn:
        bbox = draw.textbbox((0, 0), "ВИКС РАСПИСАНИЕ", font=font_header)
        draw.text(((img_w - (bbox[2] - bbox[0])) // 2, 40 + (header_h - (bbox[3] - bbox[1])) // 2), "ВИКС РАСПИСАНИЕ",
                  fill=(255, 255, 255), font=font_header)

    y_offset = 40 + header_h

    def draw_block(content_pairs, current_y, is_first=False):
        padding_x, padding_y = 40, 40
        max_text_w = img_w - (40 * 2) - (padding_x * 2)
        parsed_content = []
        box_h = padding_y * 2
        if is_first: box_h += 65

        for lbl, val in content_pairs:
            if isinstance(val, list):
                bbox_lbl = draw.textbbox((0, 0), lbl.upper(), font=font_label)
                lbl_h = bbox_lbl[3] - bbox_lbl[1]
                val_h = 0
                if not val:
                    bbox_val = draw.textbbox((0, 0), "Без техники", font=font_value)
                    val_h = (bbox_val[3] - bbox_val[1]) + 12
                    parsed_content.append((lbl, "Без техники", (bbox_val[3] - bbox_val[1]) + 12, "text"))
                else:
                    items_parsed = []
                    for eq in val:
                        eq_name = clean_text(eq.get('name', ''))
                        eq_time = f"⏰ {eq.get('time_start', '08')}:00 - {eq.get('time_end', '17')}:00"
                        bbox_name = draw.textbbox((0, 0), eq_name, font=font_value)
                        name_h = (bbox_name[3] - bbox_name[1]) + 12
                        bbox_time = draw.textbbox((0, 0), eq_time, font=font_time)
                        time_h = (bbox_time[3] - bbox_time[1]) + 12
                        items_parsed.append((eq_name, eq_time, name_h, time_h))
                        val_h += name_h + time_h + 15
                    parsed_content.append((lbl, items_parsed, 0, "list"))
                box_h += lbl_h + 15 + val_h + 30
            else:
                val_clean = clean_text(val).strip()
                wrapped_val = wrap_text(val_clean, font_value, max_text_w, draw)
                bbox_lbl = draw.textbbox((0, 0), lbl.upper(), font=font_label)
                lbl_h = bbox_lbl[3] - bbox_lbl[1]
                val_h, line_h = 0, 0
                if wrapped_val:
                    bbox_val = draw.textbbox((0, 0), wrapped_val[0], font=font_value)
                    line_h = (bbox_val[3] - bbox_val[1]) + 12
                    val_h = len(wrapped_val) * line_h
                box_h += lbl_h + 15 + val_h + 30
                parsed_content.append((lbl, wrapped_val, line_h, "text"))

        draw.rounded_rectangle([40, current_y, img_w - 40, current_y + box_h], radius=24, fill=(255, 255, 255))

        if is_first:
            draw.rectangle([40, current_y, img_w - 40, current_y + 24], fill=(255, 255, 255))
            draw.line([80, current_y + 70, img_w - 80, current_y + 70], fill=(229, 231, 235), width=3)
            draw.text((80, current_y + 25), "ДЕТАЛИ ЗАЯВКИ", fill=(31, 41, 55), font=font_header)
            text_y = current_y + 110
        else:
            text_y = current_y + padding_y

        for lbl, val_data, line_h, val_type in parsed_content:
            draw.text((80, text_y), lbl.upper(), fill=(156, 163, 175), font=font_label)
            text_y += 35
            if val_type == "text":
                if isinstance(val_data, str):
                    draw.text((80, text_y), val_data, fill=(107, 114, 128), font=font_value)
                    text_y += line_h
                else:
                    for line in val_data:
                        if line.strip():
                            draw.text((80, text_y), line.strip(), fill=(17, 24, 39), font=font_value)
                            text_y += line_h
            elif val_type == "list":
                for eq_name, eq_time, n_h, t_h in val_data:
                    draw.text((80, text_y), eq_name, fill=(37, 99, 235), font=font_value)
                    text_y += n_h
                    draw.text((80, text_y), eq_time, fill=(107, 114, 128), font=font_time)
                    text_y += t_h + 15
            text_y += 20
        return current_y + box_h + 20

    y_offset = draw_block([("ДАТА ВЫЕЗДА", date_str), ("АДРЕС ОБЪЕКТА", address)], y_offset, is_first=True)
    y_offset = draw_block([("ВЫБРАННЫЕ БРИГАДЫ", f"{team_name}\n(Прораб: {foreman})")], y_offset)
    y_offset = draw_block([("ТРЕБУЕМАЯ ТЕХНИКА", equip_list)], y_offset)
    if comment_str and comment_str.lower() != 'нет': y_offset = draw_block([("КОММЕНТАРИЙ", comment_str)], y_offset)

    img = img.crop((0, 0, img_w, int(y_offset) + 30))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf
