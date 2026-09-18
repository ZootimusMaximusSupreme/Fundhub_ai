#!/usr/bin/env python3
"""Hole N19 — burn numbered red boxes + a caption legend onto the What You Own shots.

Boxes come from r2-n19-verify.mjs, which reads each footer line's real position
in the browser, so a box never points at empty space.

    python3 r2-n19-mark.py <evidence-dir>/<tag>.json
Writes <shot>-marked.png next to each shot."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RED = (255, 40, 40, 255)
WHITE = (255, 255, 255, 255)


def font(size):
    for name in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    data = json.loads(Path(sys.argv[1]).read_text())
    phase = "BEFORE (live)" if data["tag"].startswith("before") else ("AFTER (fixed page, live data)" if data.get("local_page") else "AFTER (live)")
    f_num, f_leg = font(18), font(16)
    for load in data["loads"]:
        img = Image.open(load["shot"]).convert("RGBA")
        marks = load.get("marks") or []
        lines = [f"{phase} — {load['file']} load {load['n']}: {load['look']['rowCount']} rows, "
                 f"{len(marks)} footer line(s) on screen"]
        for i, m in enumerate(marks, 1):
            lines.append(f"{i}. footer line: \"{m['text']}\"")
        legend_h = 14 + 24 * len(lines)
        out = Image.new("RGBA", (img.width, img.height + legend_h), WHITE)
        out.paste(img, (0, 0))
        d = ImageDraw.Draw(out)
        for i, m in enumerate(marks, 1):
            x0, y0 = m["x"] - 4, m["y"] - 4
            x1, y1 = m["x"] + m["w"] + 4, m["y"] + m["h"] + 4
            d.rectangle([x0, y0, x1, y1], outline=RED, width=3)
            d.rectangle([x1 - 26, y0 - 2, x1 + 2, y0 + 24], fill=RED)
            d.text((x1 - 18, y0 + 1), str(i), fill=WHITE, font=f_num)
        y = img.height + 8
        for ln in lines:
            d.text((10, y), ln, fill=(20, 20, 20, 255), font=f_leg)
            y += 24
        dest = Path(load["shot"]).with_name(Path(load["shot"]).stem + "-marked.png")
        out.convert("RGB").save(dest)
        print(dest)


main()
