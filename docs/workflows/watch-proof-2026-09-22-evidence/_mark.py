#!/usr/bin/env python3
"""Burn numbered red boxes and a caption legend onto the live watch-proof shots.

CLAUDE.md section 8: the boxes come from the browser (each element's real position,
saved next to the raw shot as <name>.boxes.json by _walk.mjs), so a box can never
point at empty space. Raw shots are 2x; the marked copies are saved at 1x.

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

SHOTS = {
    "watch-1280": [
        ("btn1", "First Get Started -> /apply (unchanged)"),
        ("wins", "Real approvals. Real screenshots. Six approvals, amount read off each"),
        ("texts", "What clients texted us. Three real texts, each on its own crop"),
        ("roads", "One call. Three roads. Nobody gets turned away. + second Get Started -> /apply"),
    ],
    "watch-1280-zoom": [
        ("zoomimg", "Click a screenshot: it opens full size"),
        ("zoomclose", "Close (a click anywhere or Escape also closes)"),
    ],
    "watch-390": [
        ("btn1", "First Get Started -> /apply (unchanged)"),
        ("wins", "Six approvals, one sideways swipe row"),
        ("texts", "Three real client texts, one swipe row"),
        ("roads", "One call. Three roads. + second Get Started -> /apply"),
    ],
    "thankyou-1280-booked": [
        ("hero", "Fresh booking AND arrived from /funding-book-call: Your Call Is Booked."),
        ("decides", "What the call decides: three roads, nobody turned away"),
        ("step3", "Step 03: You get one of three roads"),
        ("proof", "Real approvals, real texts: $74,000, $50,000 KeyBank, $25,000 Highland + 3 texts"),
    ],
    "thankyou-390-not-booked": [
        ("hero", "No booking: We've Got Your Application."),
        ("book", "Pick your call time -> /funding-book-call (the line above it reads: One step left: pick a time for your call.)"),
        ("decides", "What the call decides"),
        ("proof", "Real approvals, real texts (swipe row, before the FAQ)"),
    ],
    "thankyou-390-back": [
        ("hero", "Record saved but did not come from the booking page (Back press): not called booked"),
        ("book", "Pick your call time -> /funding-book-call"),
    ],
}


def font(size: int):
    for name in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        if Path(name).exists():
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                pass
    return ImageFont.load_default()


def main():
    for name, marks in SHOTS.items():
        if not (RAW / f"{name}.png").exists():
            print("skip", name)
            continue
        raw = Image.open(RAW / f"{name}.png").convert("RGB")
        boxes = json.loads((RAW / f"{name}.boxes.json").read_text())["boxes"]
        img = raw.resize((raw.width // 2, raw.height // 2), Image.LANCZOS)
        d = ImageDraw.Draw(img)
        f_num, f_leg = font(18), font(15)
        legend = []
        for i, (key, caption) in enumerate(marks, 1):
            b = boxes.get(key)
            if not b or b[2] == 0:
                raise SystemExit(f"{name}: no box for {key}")
            x, y, w, h = b
            d.rectangle([x - 4, y - 4, x + w + 4, y + h + 4], outline=RED, width=4)
            ty = y - 30 if y >= 30 else y + 4
            d.rectangle([x - 4, ty, x + 22, ty + 26], fill=RED)
            d.text((x + 2, ty + 2), str(i), fill=WHITE, font=f_num)
            legend.append(f"{i}. {caption}")
        pad, line = 12, 21
        lw = img.width
        width_chars = max(30, int((lw - 2 * pad) / 7.6))
        rows = [((20, 20, 20), r) for r in textwrap.wrap(f"{name}: LIVE apply.fundhub.ai after the push, 2026-09-22 (Playwright, nothing injected)", width_chars)]
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
