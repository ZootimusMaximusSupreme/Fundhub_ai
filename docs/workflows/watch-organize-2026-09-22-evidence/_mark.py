#!/usr/bin/env python3
"""Numbered red boxes + a caption legend on the /watch organize proof shots.

CLAUDE.md section 8. Every box comes from the browser (the element's real position,
saved next to each raw shot by _walk.mjs), so a box can never point at empty space.
Raw shots are 2x; the marked images are saved at 1x next to this file.

    python3 _mark.py <raw dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "_raw"
RED = (230, 30, 30)
INK = (20, 20, 20)
WHITE = (255, 255, 255)


def font(size):
    for name in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(name).exists():
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                pass
    return ImageFont.load_default()


def load(name):
    raw = Image.open(RAW / f"{name}.png").convert("RGB")
    meta = json.loads((RAW / f"{name}.json").read_text())
    return raw.resize((raw.width // 2, raw.height // 2), Image.LANCZOS), meta


def box(img, xywh, num, dy=0):
    d = ImageDraw.Draw(img)
    x, y, w, h = xywh
    y -= dy
    d.rectangle([x + 1, y, x + w - 2, y + h], outline=RED, width=3)
    tag = str(num)
    f = font(16)
    d.rectangle([x + 1, y - 22 if y > 24 else y, x + 25, (y - 22 if y > 24 else y) + 22], fill=RED)
    d.text((x + 7, (y - 20 if y > 24 else y + 2)), tag, fill=WHITE, font=f)


def legend(img, lines, title):
    f, ft = font(15), font(17)
    width = img.width
    pad = 12
    rows = [title] + [f"{i}  {t}" for i, t in enumerate(lines, 1)]
    wrapped = []
    for i, r in enumerate(rows):
        words, cur = r.split(), ""
        for w in words:
            test = (cur + " " + w).strip()
            if ImageDraw.Draw(img).textlength(test, font=f) > width - 2 * pad - 20:
                wrapped.append((i, cur)); cur = w
            else:
                cur = test
        wrapped.append((i, cur))
    h = pad * 2 + 22 * len(wrapped)
    out = Image.new("RGB", (width, img.height + h), WHITE)
    out.paste(img, (0, 0))
    d = ImageDraw.Draw(out)
    d.line([0, img.height, width, img.height], fill=RED, width=2)
    y = img.height + pad
    for i, text in wrapped:
        d.text((pad, y), text, fill=RED if i == 0 else INK, font=ft if i == 0 else f)
        y += 22
    return out


def side_by_side(panels, gap=14):
    h = max(p.height for p in panels)
    w = sum(p.width for p in panels) + gap * (len(panels) - 1)
    out = Image.new("RGB", (w, h), WHITE)
    x = 0
    for p in panels:
        out.paste(p, (x, 0)); x += p.width + gap
    return out


def save(img, name):
    img.save(HERE / f"{name}-marked.png", optimize=True)
    print("wrote", name)


# 1. Side gutters on a phone (390 wide).
panels, lines = [], []
labels = {"gut-before": "/watch before", "gut-after": "/watch now", "gut-roadmap": "/roadmap"}
for n, (name, label) in enumerate(labels.items(), 1):
    img, meta = load(name)
    img = img.crop((0, 0, 390, 720))
    b = meta["boxes"]["h1"]
    box(img, b, n)
    left = round(b[0]); right = round(390 - b[0] - b[2])
    lines.append(f"{label}: headline {left}px from the left edge, {right}px from the right (column {round(b[2])}px wide)")
    panels.append(img)
save(legend(side_by_side(panels), lines, "Phone side margins, 390px wide: /watch now matches /roadmap"), "gutters-390")

# 2. H1 at 1280.
panels, lines = [], []
labels = {"h1-before": "/watch before", "h1-after": "/watch now", "h1-roadmap": "/roadmap"}
for n, (name, label) in enumerate(labels.items(), 1):
    img, meta = load(name)
    b = meta["boxes"]["h1"]
    top = max(0, int(b[1]) - 30)
    img = img.crop((140, top, 1140, int(b[1] + b[3]) + 16))
    box(img, (b[0] - 140, b[1] - top, b[2], b[3]), n)
    amt = f"; dollar amounts: {meta['amt']}" if meta.get("amt") else ""
    lines.append(f"{label}: {meta['h1']}{amt}")
    panels.append(img)
w = max(p.width for p in panels)
stack = Image.new("RGB", (w, sum(p.height for p in panels) + 14 * 2), WHITE)
y = 0
for p in panels:
    stack.paste(p, (0, y)); y += p.height + 14
save(legend(stack, lines, "Headline font at 1280 wide: /watch now uses the /roadmap headline rule"), "h1-1280")

# 3. The approvals row slides right as the page scrolls down.
panels, lines = [], []
for n in range(3):
    img, meta = load(f"carousel-390-{n}")
    b = meta["boxes"]["rail"]
    top = max(0, int(b[1]) - 60)
    img = img.crop((0, top, 390, min(img.height, top + 330)))
    box(img, (b[0], b[1] - top, b[2], b[3] - 18), n + 1)
    lines.append(f"page scrolled {meta['scroll']}px: row moved {meta['tx']}px")
    panels.append(img)
save(legend(side_by_side(panels), lines, "Scroll down, the 16 approvals slide right (phone). The whole row stays on screen while it moves; the page never stops."), "carousel-390")

# 4. The organized column.
for w, cap in ((1280, "desktop"), (390, "phone")):
    img, meta = load(f"column-{w}")
    bx = meta["boxes"]
    for n, k in enumerate(("wins", "vids", "roads"), 1):
        box(img, bx[k], n)
    save(legend(img, [
        "Real approvals. Real screenshots. All 16 approvals from the deck, amount read off each screenshot",
        "From our clients: 3 vertical video placeholders, same dark slot as /roadmap (no client texts)",
        "One call. Three roads. Nobody gets turned away. + second Get Started -> /apply",
    ], f"/watch under the first Get Started, one column ({cap}, {w}px)"), f"column-{w}")

# 5. /thank-you.
for w in (390, 1280):
    img, meta = load(f"thankyou-{w}")
    box(img, meta["boxes"]["proof"], 1)
    save(legend(img, ["Real approvals, real screenshots: $74,000 / $50,000 KeyBank / $25,000 Highland. The three client texts are gone."],
                f"/thank-you ({w}px)"), f"thankyou-{w}")
