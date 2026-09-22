#!/usr/bin/env python3
"""Burn numbered red boxes + a legend onto the /funding-book-call before/after shots (CLAUDE.md section 8).

Every box comes from the browser (_raw/<phase>-<width>.json, written by _shoot.mjs).
    python3 docs/workflows/book-call-mobile-2026-09-22-evidence/_mark.py
"""
from __future__ import annotations

import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
RAW = HERE / "_raw"
RED = (225, 25, 25)
WHITE = (255, 255, 255)
INK = (20, 20, 20)


def font(size):
    for name in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(name).exists():
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                pass
    return ImageFont.load_default()


def marks(m):
    w, ph = m["width"], m["phase"]
    s, lg = m["sched"], m["logo"]
    if w < 600:
        if ph == "before":
            return [
                (m["sched"], f"Card only {s[2]}px wide on a {w}px phone ({s[0]}px dead space each side)"),
                (m["logo"], f"Logo {lg[2]}x{lg[3]} runs past the calendar edge; the meeting name is pushed off the card"),
                (m["week"], f"Weekday names break in two ({m['thW']}px columns, month grid {m['grid'][2]}px)"),
                (m["month"], f"Month name wraps onto {m['monthLines']} lines"),
                (m["slot"], f"Times wrap onto {m['slotLines']} lines ({m['slot'][2]}px buttons)"),
            ], (s[1] - 24, m["slot"][1] + m["slot"][3] + 24)
        return [
            (m["sched"], f"Card {s[2]}px wide: {s[0]}px gutters on a {w}px phone"),
            (m["logo"], f"Logo {lg[2]}x{lg[3]}, inside the panel; meeting name shows under it"),
            (m["week"], f"Weekday names on one line ({m['thW']}px columns, month grid {m['grid'][2]}px)"),
            (m["month"], "Month name on one line"),
            (m["slot"], f"Times on one line ({m['slot'][2]}px buttons)"),
        ], (s[1] - 24, m["slot"][1] + m["slot"][3] + 24)
    band = m["band"]
    crop = (s[1] - 20, m["grid"][1] + m["grid"][3] + 20)
    if ph == "before":
        return [
            (m["logo"], f"Logo {lg[2]}x{lg[3]} runs {lg[0] + lg[2] - band[0]}px out of its panel into the right column"),
            (band, "It sits over the grey \"Select a Date & Time:\" band"),
        ], crop
    return [
        (m["logo"], f"Logo {lg[2]}x{lg[3]}, inside its {m['left'][2]}px panel"),
        (band, f"Band clear; calendar column unchanged ({band[2]}px, month grid {m['grid'][2]}px)"),
    ], crop


def main():
    for jp in sorted(RAW.glob("*.json")):
        m = json.loads(jp.read_text())
        name = jp.stem
        img = Image.open(RAW / f"{name}.png").convert("RGB")
        d = m["dpr"]
        items, (y0, y1) = marks(m)
        y0, y1 = max(0, y0) * d, min(img.height, y1 * d)
        img = img.crop((0, y0, img.width, y1))
        dr = ImageDraw.Draw(img)
        fnum = font(16 * d)
        for i, (box, _) in enumerate(items, 1):
            x, y, w, h = [v * d for v in box]
            y -= y0
            dr.rectangle([x, y, x + w, y + h], outline=RED, width=3 * d)
            tag = str(i)
            tw = dr.textlength(tag, font=fnum)
            tx, ty = x, max(0, y - 22 * d)
            dr.rectangle([tx, ty, tx + tw + 10 * d, ty + 22 * d], fill=RED)
            dr.text((tx + 5 * d, ty + 2 * d), tag, fill=WHITE, font=fnum)
        ftxt = font(13 * d)
        head = f"/funding-book-call at {m['width']}px, LIVE apply.fundhub.ai 2026-09-22, own headless Chromium — " + (
            "BEFORE (as live now)" if m["phase"] == "before" else "AFTER (04d-book-fit.html injected in this browser only)")
        wrap = max(30, int(img.width / (7.2 * d)))
        lines = textwrap.wrap(head, wrap)
        for i, (_, cap) in enumerate(items, 1):
            lines += textwrap.wrap(f"{i}. {cap}", wrap)
        lh = 18 * d
        legend = Image.new("RGB", (img.width, lh * len(lines) + 16 * d), WHITE)
        ld = ImageDraw.Draw(legend)
        ld.rectangle([0, 0, legend.width - 1, legend.height - 1], outline=RED, width=2 * d)
        for i, ln in enumerate(lines):
            ld.text((10 * d, 8 * d + i * lh), ln, fill=INK if i < len(textwrap.wrap(head, wrap)) else RED, font=ftxt)
        out = Image.new("RGB", (img.width, img.height + legend.height), WHITE)
        out.paste(img, (0, 0))
        out.paste(legend, (0, img.height))
        dest = HERE / f"{name}-MARKED.png"
        out.save(dest)
        print(dest.name, out.size)


if __name__ == "__main__":
    main()
