#!/usr/bin/env python3
"""Burn numbered red boxes and a legend strip onto the Funnel B live-walk shots.

CLAUDE.md section 8. Every box comes from the browser (the element's real position,
written by _walk-funnel-b.mjs to funnel-b/_raw/<name>.marks.json), so a box never
points at empty space. Tall shots arrive as viewport-sized pieces and are stitched here.
A caption with no box on the page is still listed in the legend, marked "(not on page)".

    python3 docs/workflows/site-proof-2026-09-22-evidence/_mark-funnel-b.py
"""
from __future__ import annotations

import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "funnel-b"
RAW = OUT / "_raw"
RED = (225, 25, 25)
WHITE = (255, 255, 255)
INK = (20, 20, 20)


def font(size: int):
    for name in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(name).exists():
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                pass
    return ImageFont.load_default()


def load(name: str, spec: dict) -> Image.Image:
    segs = spec.get("segs")
    if not segs:
        return Image.open(RAW / f"{name}.png").convert("RGB")
    parts = [Image.open(RAW / s).convert("RGB") for s in segs]
    w = max(p.width for p in parts)
    img = Image.new("RGB", (w, sum(p.height for p in parts)), WHITE)
    y = 0
    for p in parts:
        img.paste(p, (0, y))
        y += p.height
    return img


def main():
    for spec_path in sorted(RAW.glob("*.marks.json")):
        name = spec_path.name[: -len(".marks.json")]
        spec = json.loads(spec_path.read_text())
        img = load(name, spec)
        s = spec.get("dpr", 1)
        d = ImageDraw.Draw(img)
        f_num = font(18 * s)
        line_w = 4 * s
        legend = []
        n = 0
        for m in spec["marks"]:
            n += 1
            x, y, w, h = m["box"]
            pad = 4 * s
            x0, y0 = max(0, x - pad), max(0, y - pad)
            x1, y1 = min(img.width - 1, x + w + pad), min(img.height - 1, y + h + pad)
            if y1 <= y0 or x1 <= x0:
                n -= 1
                legend.append(f"-  {m['caption']} (outside this shot, so no box)")
                continue
            d.rectangle([x0, y0, x1, y1], outline=RED, width=line_w)
            tag_h = 26 * s
            ty = y0 - tag_h if y0 >= tag_h else y0 + line_w
            tx = x0 if x0 + 30 * s < img.width else img.width - 30 * s
            d.rectangle([tx, ty, tx + 28 * s, ty + tag_h], fill=RED)
            d.text((tx + 7 * s, ty + 3 * s), str(n), fill=WHITE, font=f_num)
            legend.append(f"{n}. {m['caption']}")
        for c in spec.get("missing", []):
            legend.append(f"-  {c} (not on page, so no box)")
        # legend strip
        f_leg = font(15 * s)
        pad, line = 12 * s, 21 * s
        chars = max(30, int((img.width - 2 * pad) / (7.4 * s)))
        rows = [(INK, r) for r in textwrap.wrap(f"{spec['title']} | LIVE apply.fundhub.ai, 2026-09-22, own headless Chromium", chars)]
        for t in legend:
            rows += [(RED, r) for r in textwrap.wrap(t, chars)]
        lh = pad * 2 + line * len(rows)
        out = Image.new("RGB", (img.width, img.height + lh), WHITE)
        out.paste(img, (0, 0))
        dl = ImageDraw.Draw(out)
        dl.rectangle([0, img.height, img.width - 1, img.height + lh - 1], fill=(250, 250, 250), outline=RED, width=3 * s)
        for j, (color, t) in enumerate(rows):
            dl.text((pad, img.height + pad + line * j), t, fill=color, font=f_leg)
        dest = OUT / f"{name}-MARKED.png"
        out.save(dest, optimize=True)
        print("wrote", dest.relative_to(HERE.parent.parent.parent), out.size)


if __name__ == "__main__":
    main()
