"""
Generate PWA push-notification icons.

Each icon: 192x192, colored circle bg + white glyph + mini ВиКС logo badge
(40x40 on white 44x44 circle, bottom-right, subtle drop shadow).

Plus badge.png (96x96, white bell silhouette, transparent bg) for Android
status bar.

Run:  python scripts/generate_push_icons.py
"""

from __future__ import annotations

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


# ── Paths ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "frontend" / "public" / "push-icons"
# main.png is expected; fall back to icon-192.png if absent
_LOGO_MAIN = ROOT / "frontend" / "public" / "main.png"
_LOGO_FALLBACK = ROOT / "frontend" / "public" / "icon-192.png"
LOGO_SRC = _LOGO_MAIN if _LOGO_MAIN.exists() else _LOGO_FALLBACK

SIZE = 192          # canvas
SS = 4              # supersample factor for smooth circles
STROKE = 16         # glyph stroke width
BADGE_SIZE = 40     # mini logo
BADGE_BG = 44       # white circle behind logo


# ── Helpers ───────────────────────────────────────────────────────────────
def _ss_canvas(color: str) -> Image.Image:
    """Create a supersampled RGBA canvas with a solid circle background."""
    big = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    d.ellipse((0, 0, SIZE * SS - 1, SIZE * SS - 1), fill=color)
    return big


def _finalize(big: Image.Image) -> Image.Image:
    """Downsample supersampled canvas back to final size."""
    return big.resize((SIZE, SIZE), Image.LANCZOS)


def _paste_badge(canvas: Image.Image) -> Image.Image:
    """Paste white-circle + mini logo + drop shadow, bottom-right."""
    if not LOGO_SRC.exists():
        return canvas

    # Position: 10px margin from bottom-right
    margin = 10
    cx = SIZE - margin - BADGE_BG // 2
    cy = SIZE - margin - BADGE_BG // 2

    # 1. Drop shadow (3px offset, 30% alpha black, 4px blur)
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse(
        (cx - BADGE_BG // 2 + 3, cy - BADGE_BG // 2 + 3,
         cx + BADGE_BG // 2 + 3, cy + BADGE_BG // 2 + 3),
        fill=(0, 0, 0, int(255 * 0.30)),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(4))
    canvas.alpha_composite(shadow)

    # 2. White circle background
    wd = ImageDraw.Draw(canvas)
    wd.ellipse(
        (cx - BADGE_BG // 2, cy - BADGE_BG // 2,
         cx + BADGE_BG // 2, cy + BADGE_BG // 2),
        fill=(255, 255, 255, 255),
    )

    # 3. Mini logo — 40x40, centered in the white circle
    try:
        logo = Image.open(LOGO_SRC).convert("RGBA")
        logo = logo.resize((BADGE_SIZE, BADGE_SIZE), Image.LANCZOS)
        # Circular mask so logo stays within the badge background
        mask = Image.new("L", (BADGE_SIZE, BADGE_SIZE), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, BADGE_SIZE, BADGE_SIZE), fill=255)
        canvas.paste(logo, (cx - BADGE_SIZE // 2, cy - BADGE_SIZE // 2), mask)
    except Exception:
        pass
    return canvas


def _draw_glyph_cross(d: ImageDraw.ImageDraw) -> None:
    """X cross (two diagonal lines) — app-rejected."""
    pad = 58
    c = SIZE * SS
    p = pad * SS
    w = STROKE * SS
    d.line([(p, p), (c - p, c - p)], fill="white", width=w)
    d.line([(c - p, p), (p, c - p)], fill="white", width=w)


def _draw_glyph_check(d: ImageDraw.ImageDraw) -> None:
    """Checkmark polyline — app-approved."""
    w = STROKE * SS
    points = [
        (52 * SS, 100 * SS),
        (82 * SS, 130 * SS),
        (142 * SS, 68 * SS),
    ]
    d.line(points, fill="white", width=w, joint="curve")


def _draw_glyph_document(d: ImageDraw.ImageDraw) -> None:
    """Document (rounded rect + 3 horizontal lines) — app-new."""
    w = STROKE * SS // 2
    r = 10 * SS
    # Outer rect
    d.rounded_rectangle(
        (54 * SS, 44 * SS, 138 * SS, 148 * SS),
        radius=r, outline="white", width=w,
    )
    # Three lines
    lw = 8 * SS
    for y in (78, 100, 122):
        d.rounded_rectangle(
            (68 * SS, (y - 4) * SS, 124 * SS, (y + 4) * SS),
            radius=lw // 2, fill="white",
        )


def _draw_glyph_headphones(d: ImageDraw.ImageDraw) -> None:
    """Headphones (top arc + two ear circles) — support-new."""
    w = STROKE * SS
    # Top arc
    d.arc((44 * SS, 42 * SS, 148 * SS, 146 * SS), start=180, end=360,
          fill="white", width=w)
    # Left ear
    d.rounded_rectangle(
        (44 * SS, 90 * SS, 72 * SS, 140 * SS),
        radius=14 * SS, fill="white",
    )
    # Right ear
    d.rounded_rectangle(
        (120 * SS, 90 * SS, 148 * SS, 140 * SS),
        radius=14 * SS, fill="white",
    )


def _draw_glyph_speech(d: ImageDraw.ImageDraw) -> None:
    """Speech bubble (rounded rect + tail) — support-reply."""
    r = 18 * SS
    # Bubble
    d.rounded_rectangle(
        (42 * SS, 50 * SS, 150 * SS, 124 * SS),
        radius=r, fill="white",
    )
    # Tail — small triangle bottom-left
    d.polygon(
        [(66 * SS, 124 * SS), (54 * SS, 150 * SS), (90 * SS, 124 * SS)],
        fill="white",
    )


def _draw_glyph_arrows(d: ImageDraw.ImageDraw) -> None:
    """Two opposite arrows (← →) — exchange-request."""
    w = STROKE * SS
    # Top arrow pointing right
    y1 = 76 * SS
    d.line([(52 * SS, y1), (140 * SS, y1)], fill="white", width=w)
    d.line([(140 * SS, y1), (120 * SS, y1 - 18 * SS)], fill="white", width=w)
    d.line([(140 * SS, y1), (120 * SS, y1 + 18 * SS)], fill="white", width=w)
    # Bottom arrow pointing left
    y2 = 116 * SS
    d.line([(52 * SS, y2), (140 * SS, y2)], fill="white", width=w)
    d.line([(52 * SS, y2), (72 * SS, y2 - 18 * SS)], fill="white", width=w)
    d.line([(52 * SS, y2), (72 * SS, y2 + 18 * SS)], fill="white", width=w)


def _draw_glyph_clock(d: ImageDraw.ImageDraw) -> None:
    """Clock (circle outline + two hands) — smr-debt."""
    w = STROKE * SS // 2
    # Outer circle
    d.ellipse((46 * SS, 46 * SS, 146 * SS, 146 * SS),
              outline="white", width=w)
    # Hour hand (up)
    d.line([(96 * SS, 96 * SS), (96 * SS, 66 * SS)], fill="white", width=w)
    # Minute hand (right)
    d.line([(96 * SS, 96 * SS), (126 * SS, 96 * SS)], fill="white", width=w)


def _draw_glyph_calendar(d: ImageDraw.ImageDraw) -> None:
    """Calendar (rect + top tabs + grid) — schedule-published."""
    w = STROKE * SS // 2
    # Main body
    d.rounded_rectangle(
        (46 * SS, 56 * SS, 146 * SS, 146 * SS),
        radius=10 * SS, outline="white", width=w,
    )
    # Top bar
    d.rounded_rectangle(
        (46 * SS, 56 * SS, 146 * SS, 82 * SS),
        radius=10 * SS, fill="white",
    )
    # Two tabs
    d.rounded_rectangle(
        (66 * SS, 40 * SS, 78 * SS, 66 * SS),
        radius=4 * SS, fill="white",
    )
    d.rounded_rectangle(
        (114 * SS, 40 * SS, 126 * SS, 66 * SS),
        radius=4 * SS, fill="white",
    )
    # Grid dots
    for r_y in (100, 122):
        for c_x in (70, 96, 122):
            d.ellipse(
                (c_x * SS - 4 * SS, r_y * SS - 4 * SS,
                 c_x * SS + 4 * SS, r_y * SS + 4 * SS),
                fill="white",
            )


def _draw_glyph_pin(d: ImageDraw.ImageDraw) -> None:
    """Location pin (teardrop + dot) — object-request."""
    # Teardrop body — ellipse on top, triangle on bottom
    d.ellipse((60 * SS, 44 * SS, 132 * SS, 116 * SS), fill="white")
    d.polygon(
        [(78 * SS, 104 * SS), (114 * SS, 104 * SS), (96 * SS, 154 * SS)],
        fill="white",
    )
    # Inner dot (hole)
    d.ellipse((84 * SS, 68 * SS, 108 * SS, 92 * SS), fill=(0, 0, 0, 0))


def _draw_glyph_pin_with_bg(canvas: Image.Image, bg_color: str) -> None:
    """Pin version that re-paints the hole in the original background color."""
    # We draw white pin first on the canvas, then the hole gets bg color
    d = ImageDraw.Draw(canvas)
    d.ellipse((60, 44, 132, 116), fill="white")
    d.polygon([(78, 104), (114, 104), (96, 154)], fill="white")
    d.ellipse((84, 68, 108, 92), fill=bg_color)


def _draw_glyph_person(d: ImageDraw.ImageDraw) -> None:
    """Person silhouette (circle head + trapezoid torso) — user-registered."""
    # Head
    d.ellipse((76 * SS, 42 * SS, 116 * SS, 82 * SS), fill="white")
    # Torso — trapezoid
    d.polygon(
        [
            (60 * SS, 150 * SS),
            (132 * SS, 150 * SS),
            (120 * SS, 98 * SS),
            (72 * SS, 98 * SS),
        ],
        fill="white",
    )


# ── Icon specs ────────────────────────────────────────────────────────────
ICONS = [
    ("app-rejected.png",       "#EF4444", _draw_glyph_cross),
    ("app-approved.png",       "#10B981", _draw_glyph_check),
    ("app-new.png",            "#3B82F6", _draw_glyph_document),
    ("support-new.png",        "#8B5CF6", _draw_glyph_headphones),
    ("support-reply.png",      "#06B6D4", _draw_glyph_speech),
    ("exchange-request.png",   "#F97316", _draw_glyph_arrows),
    ("smr-debt.png",           "#EAB308", _draw_glyph_clock),
    ("schedule-published.png", "#22C55E", _draw_glyph_calendar),
    ("object-request.png",     "#2563EB", None),   # special: uses bg fill
    ("user-registered.png",    "#6B7280", _draw_glyph_person),
]


def _draw_bell(size: int = 96) -> Image.Image:
    """White bell silhouette on transparent canvas — badge.png."""
    big_size = size * SS
    img = Image.new("RGBA", (big_size, big_size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Bell body — rounded trapezoid
    body = [
        (big_size * 0.28, big_size * 0.72),
        (big_size * 0.72, big_size * 0.72),
        (big_size * 0.62, big_size * 0.30),
        (big_size * 0.38, big_size * 0.30),
    ]
    d.polygon(body, fill="white")
    # Top knob
    d.ellipse(
        (big_size * 0.45, big_size * 0.18, big_size * 0.55, big_size * 0.28),
        fill="white",
    )
    # Base line
    d.rectangle(
        (big_size * 0.22, big_size * 0.72, big_size * 0.78, big_size * 0.78),
        fill="white",
    )
    # Clapper
    d.ellipse(
        (big_size * 0.46, big_size * 0.78, big_size * 0.54, big_size * 0.88),
        fill="white",
    )
    return img.resize((size, size), Image.LANCZOS)


def generate() -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []

    for filename, color, draw_fn in ICONS:
        big = _ss_canvas(color)
        d = ImageDraw.Draw(big)

        if draw_fn is not None:
            draw_fn(d)
            canvas = _finalize(big)
        else:
            # object-request — pin with hole that exposes the bg color
            canvas = _finalize(big)
            _draw_glyph_pin_with_bg(canvas, color)

        canvas = _paste_badge(canvas)
        out_path = OUT_DIR / filename
        canvas.save(out_path, "PNG", optimize=True)
        created.append(out_path)
        print(f"  [OK] {filename}")

    # Badge — white bell on transparent, 96x96
    badge = _draw_bell(96)
    badge_path = OUT_DIR / "badge.png"
    badge.save(badge_path, "PNG", optimize=True)
    created.append(badge_path)
    print(f"  [OK] badge.png")

    return created


if __name__ == "__main__":
    print(f"Output dir: {OUT_DIR}")
    print(f"Logo source: {LOGO_SRC.name}")
    files = generate()
    print(f"\nCreated {len(files)} files.")
