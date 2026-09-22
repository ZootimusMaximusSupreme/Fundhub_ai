#!/usr/bin/env python3
"""Burn numbered red boxes + a legend strip (under the picture) onto the Funnel A proof shots.

Same idea as docs/workflows/book-calendar-2026-09-22-evidence/_apply-marks.py: boxes come
from the walk script, which reads each element's real position in the browser. A box off
the picture stops the run instead of being clamped onto empty space.

Run from the repo root:
    python3 docs/workflows/site-proof-2026-09-22-evidence/_mark-funnel-a.py
Reads funnel-a/shot-marks-<width>.json + funnel-a/_raw/*.png, writes funnel-a/<name>-MARKED.png.
"""
from __future__ import annotations

import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent / "funnel-a"
RAW = HERE / "_raw"
RED = (230, 20, 20)
WHITE = (255, 255, 255)
INK = (20, 20, 22)


def font(size: int, bold: bool = False):
    for name in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        p = Path(name)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                continue
    return ImageFont.load_default()


def mark(src: Path, spec: dict) -> Path:
    shot = Image.open(src).convert("RGB")
    W, H = shot.size
    scale = 2 if src.stem.endswith("-390") else 1  # the 390px shots are taken at 2x
    marks = spec.get("marks", [])
    notes = spec.get("notes", [])
    f_title = font(18 * scale, True)
    f_line = font(14 * scale)
    f_num = font(16 * scale, True)
    width = max(W, 520 * scale)
    chars = max(40, int(width / (7.4 * scale)))
    lines = []
    for m in marks:
        for i, part in enumerate(textwrap.wrap(f"{m['n']}. {m.get('caption', '')}", chars) or [""]):
            lines.append(("mark", part if i == 0 else "    " + part))
    for nt in notes:
        for i, part in enumerate(textwrap.wrap(f"- {nt}", chars) or [""]):
            lines.append(("note", part if i == 0 else "  " + part))
    lh = 21 * scale
    strip = 16 * scale + 26 * scale + lh * len(lines) + 12 * scale
    im = Image.new("RGB", (width, H + strip), WHITE)
    im.paste(shot, (0, 0))
    d = ImageDraw.Draw(im)
    for m in marks:
        b = m["box"]
        x, y, w, h = b["x"], b["y"], b["w"], b["h"]
        if x < 0 or y < 0 or x + w > W + 1 or y + h > H + 1:
            raise SystemExit(f"{src.name}: mark {m['n']} box {b} is outside the {W}x{H} picture")
        pad = 3 * scale
        d.rectangle([max(0, x - pad), max(0, y - pad), min(W - 1, x + w + pad), min(H - 1, y + h + pad)], outline=RED, width=4 * scale)
        tag = str(m["n"])
        bw, bh = 26 * scale, 24 * scale
        bx = min(max(0, x - pad), W - bw)
        by = y - pad - bh if y - pad - bh >= 0 else min(H - bh, y + pad)
        d.rectangle([bx, by, bx + bw, by + bh], fill=RED)
        d.text((bx + 8 * scale, by + 3 * scale), tag, fill=WHITE, font=f_num)
    # legend strip under the picture
    d.rectangle([0, H, width, H + strip], fill=INK)
    d.line([0, H, width, H], fill=RED, width=3 * scale)
    ty = H + 12 * scale
    d.text((14 * scale, ty), spec.get("legend", src.stem), fill=WHITE, font=f_title)
    ty += 28 * scale
    for kind, text in lines:
        d.text((14 * scale, ty), text, fill=(255, 190, 190) if kind == "mark" else (205, 205, 210), font=f_line)
        ty += lh
    out = HERE / src.name.replace(".png", "-MARKED.png")
    im.save(out, optimize=True)
    return out


def main() -> None:
    done = 0
    for mf in sorted(HERE.glob("shot-marks-*.json")):
        manifest = json.loads(mf.read_text())
        for name, spec in manifest.items():
            raw = RAW / name
            if not raw.exists():
                print("missing", name)
                continue
            if not spec.get("marks"):
                print("NO MARKS (not counted):", name)
                continue
            print("marked", mark(raw, spec).name)
            done += 1
    print(f"done {done}")


if __name__ == "__main__":
    main()
