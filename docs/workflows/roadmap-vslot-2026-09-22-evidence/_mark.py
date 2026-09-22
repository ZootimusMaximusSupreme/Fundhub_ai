#!/usr/bin/env python3
"""Burn numbered red boxes and a caption legend onto the live /roadmap vslot shots.

CLAUDE.md section 8: every box comes from the browser — each element's real
position on the live page, saved next to the raw shot as <name>.boxes.json by
_walk.mjs / _checkout.mjs — so a box can never point at empty space.
Raw shots are 2x; the marked copies are saved at 1x.

    python3 _mark.py
"""
from __future__ import annotations

import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
RAW = HERE / "_raw"
RED = (230, 30, 30)
WHITE = (255, 255, 255)

# name -> (boxes file stem, caption for the shot, [(box key, caption), ...])
SHOTS = {
    "before-desktop-1280-zoom": (
        "before-desktop-1280-zoom",
        "BEFORE the push - live apply.fundhub.ai/roadmap at 1280 wide, desktop Chrome",
        [
            ("grid", "The three video slots sit in a 660px row - card 168.8 x 300"),
            ("slot1", "One card: 168.8 wide, 300 tall. The empty space each side is what the owner saw"),
            ("secureFoot", "The page column is 900 wide (x 190 to 1090). The row stops 120px short on each side"),
        ],
    ),
    "after-desktop-1280-zoom": (
        "after-desktop-1280-zoom",
        "AFTER the push - live apply.fundhub.ai/roadmap at 1280 wide, desktop Chrome",
        [
            ("grid", "The row is now 900px and fills the page column - gap 55.3 down to 10"),
            ("slot1", "One card: 293.3 x 521.5. Still exactly 9:16 (0.5625). Dark #111113, border #26262B, 12px radius"),
            ("secureFoot", "The row now lines up edge for edge with the strip above it (both x 190 to 1090)"),
            ("heading", "Heading From people who bought it still there, still centered"),
        ],
    ),
    "before-mobile-390-zoom": (
        "before-mobile-390-zoom",
        "BEFORE the push - live apply.fundhub.ai/roadmap at 390 wide, Android Chrome",
        [
            ("grid", "342px row, three across, gap 12"),
            ("slot1", "One card: 106.0 x 188.4"),
        ],
    ),
    "after-mobile-390-zoom": (
        "after-mobile-390-zoom",
        "AFTER the push - live apply.fundhub.ai/roadmap at 390 wide, Android Chrome",
        [
            ("grid", "Still 342px, still three across, gap 12 down to 10. No sideways page scroll (scrollWidth 390 = window 390)"),
            ("slot1", "One card: 107.3 x 190.8. Still exactly 9:16. Phone view barely moves, as asked"),
        ],
    ),
    "checkout-desktop-1280": (
        "checkout-desktop-1280-zoom",
        "AFTER the push - the $297 checkout still works, 1280 wide. Nothing was typed, Continue was never clicked",
        [
            ("tabs", "Step tabs: 1 Contact and 2 Payment"),
            ("step1", "Step 1 is the open step - first name, last name, email, phone"),
            ("continue", "Continue is on screen and enabled (never clicked, nothing submitted)"),
            ("grid", "The bigger video row directly below, same 900px width as the checkout"),
        ],
    ),
    "checkout-mobile-390": (
        "checkout-mobile-390-zoom",
        "AFTER the push - the $297 checkout still works, 390 wide. Nothing was typed, Continue was never clicked",
        [
            ("tabs", "Step tabs: 1 Contact and 2 Payment"),
            ("step1", "Step 1 is the open step - first name, last name, email, phone"),
            ("continue", "Continue is on screen and enabled (never clicked, nothing submitted)"),
            ("grid", "The video row below, three across, still inside the 390 screen"),
        ],
    ),
}


def font(size: int):
    for name in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        if Path(name).exists():
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                pass
    return ImageFont.load_default()


def main():
    for name, (boxstem, shot_caption, marks) in SHOTS.items():
        src = RAW / f"{name}.png"
        if not src.exists():
            raise SystemExit(f"missing raw shot {src}")
        raw = Image.open(src).convert("RGB")
        boxes = json.loads((RAW / f"{boxstem}.boxes.json").read_text())["boxes"]
        img = raw.resize((raw.width // 2, raw.height // 2), Image.LANCZOS)
        d = ImageDraw.Draw(img)
        f_num, f_leg = font(18), font(15)
        legend = []
        used: list[tuple[int, int]] = []
        for i, (key, caption) in enumerate(marks, 1):
            b = boxes.get(key)
            if not b or b[2] == 0:
                raise SystemExit(f"{name}: no box for {key}")
            x, y, w, h = b
            d.rectangle([x - 4, y - 4, x + w + 4, y + h + 4], outline=RED, width=4)
            ty = y - 30 if y >= 30 else y + 4
            tx = x - 4
            # two boxes can share a corner (a grid and its heading). Slide the
            # badge right until it sits on empty pixels so no number is hidden.
            while any(abs(tx - ux) < 30 and abs(ty - uy) < 28 for ux, uy in used):
                tx += 32
            used.append((tx, ty))
            d.rectangle([tx, ty, tx + 26, ty + 26], fill=RED)
            d.text((tx + 6, ty + 2), str(i), fill=WHITE, font=f_num)
            legend.append(f"{i}. {caption}")
        pad, line = 12, 21
        lw = img.width
        width_chars = max(30, int((lw - 2 * pad) / 7.6))
        rows = [((20, 20, 20), r) for r in textwrap.wrap(shot_caption, width_chars)]
        for t in legend:
            rows += [(RED, r) for r in textwrap.wrap(t, width_chars)]
        lh = pad * 2 + line * len(rows)
        out = Image.new("RGB", (lw, img.height + lh), WHITE)
        out.paste(img, (0, 0))
        dl = ImageDraw.Draw(out)
        dl.rectangle([0, img.height, lw - 1, img.height + lh - 1], fill=(250, 250, 250), outline=RED, width=3)
        for j, (color, t) in enumerate(rows):
            dl.text((pad, img.height + pad + line * j), t, fill=color, font=f_leg)
        out.save(HERE / f"{name}-marked.png", optimize=True)
        print("wrote", f"{name}-marked.png", out.size)


if __name__ == "__main__":
    main()
