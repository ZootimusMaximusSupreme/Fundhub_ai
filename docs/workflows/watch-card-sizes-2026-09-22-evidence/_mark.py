#!/usr/bin/env python3
"""Numbered red boxes + a caption legend on the /watch card-size before/after shots.

CLAUDE.md section 8. Every box is the element's real position, read out of the browser
by _walk.mjs and saved next to each raw shot, so a box can never point at empty space.
Raw shots are 2x; the marked images are saved at 1x next to this file.

    node _walk.mjs before && node _walk.mjs after && python3 _mark.py
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
RAW = HERE / "_raw"
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


def box(img, xywh, num):
    d = ImageDraw.Draw(img)
    x, y, w, h = [round(v) for v in xywh]
    d.rectangle([x + 1, y, x + w - 2, y + h], outline=RED, width=3)
    f = font(16)
    ty = y - 22 if y > 24 else y
    d.rectangle([x + 1, ty, x + 27, ty + 22], fill=RED)
    d.text((x + 7, ty + 2), str(num), fill=WHITE, font=f)


def legend(img, lines, title):
    f, ft = font(15), font(17)
    pad = 12
    rows = [title] + [f"{i}  {t}" for i, t in enumerate(lines, 1)]
    wrapped = []
    for i, r in enumerate(rows):
        cur = ""
        for w in r.split():
            test = (cur + " " + w).strip()
            if ImageDraw.Draw(img).textlength(test, font=f) > img.width - 2 * pad - 20:
                wrapped.append((i, cur)); cur = w
            else:
                cur = test
        wrapped.append((i, cur))
    out = Image.new("RGB", (img.width, img.height + pad * 2 + 22 * len(wrapped)), WHITE)
    out.paste(img, (0, 0))
    d = ImageDraw.Draw(out)
    d.line([0, img.height, img.width, img.height], fill=RED, width=2)
    y = img.height + pad
    for i, text in wrapped:
        d.text((pad, y), text, fill=RED if i == 0 else INK, font=ft if i == 0 else f)
        y += 22
    return out


def side_by_side(panels, gap=14):
    h = max(p.height for p in panels)
    out = Image.new("RGB", (sum(p.width for p in panels) + gap * (len(panels) - 1), h), WHITE)
    x = 0
    for p in panels:
        out.paste(p, (x, 0)); x += p.width + gap
    return out


def save(img, name):
    img.save(HERE / f"{name}-marked.png", optimize=True)
    print("wrote", name)


def crop_to(img, x, y, w, h, pad_top=60, pad_bot=24):
    top = max(0, int(y) - pad_top)
    bot = min(img.height, int(y + h) + pad_bot)
    return img.crop((int(x), top, int(x + w), bot)), top


# 1 & 2. The video testimonial row: the cards, and the air around them.
for width, cap in ((1280, "desktop"), (390, "phone")):
    panels, lines = [], []
    for n, phase in enumerate(("before", "after"), 1):
        img, meta = load(f"vids-{width}-{phase}")
        x, y, w, h = meta["vrow"]
        bx, _, bw, _ = meta["vblock"]
        panel, top = crop_to(img, 0, y, img.width, h)
        box(panel, (x, y - top, w, h), n)
        air = round((bw - w) / 2)
        sw, _, _, sh = 0, 0, 0, 0
        slot = meta["slot"]
        lines.append(
            f"{'before' if phase == 'before' else 'now'}: each card {round(slot[2])} x {round(slot[3])}px, "
            f"gap {round(meta['vgap'])}px, the three fill {round(w)}px of a {round(bw)}px row — {air}px of empty space each side"
        )
        panels.append(panel)
    save(legend(side_by_side(panels), lines, f"From our clients ({cap}, {width}px): the video testimonial cards now fill the row"), f"videos-{width}")

# 3 & 4. One approval card, before and after.
for width, cap in ((1280, "desktop"), (390, "phone")):
    panels, lines = [], []
    for n, phase in enumerate(("before", "after"), 1):
        img, meta = load(f"wins-{width}-{phase}")
        x, y, w, h = meta["card"]
        panel, top = crop_to(img, 0, y, img.width, h, pad_top=40, pad_bot=20)
        box(panel, (x, y - top, w, h), n)
        lines.append(f"{'before' if phase == 'before' else 'now'}: card {round(w)} x {round(h)}px ({meta['cardCount']} approvals, gap {round(meta['cardGap'])}px, row {meta['railWidth']}px wide)")
        panels.append(panel)
    lines.append("")
    save(legend(side_by_side(panels), lines[:2], f"Real approvals. Real screenshots. ({cap}, {width}px): every card 20% larger"), f"approvals-{width}")
