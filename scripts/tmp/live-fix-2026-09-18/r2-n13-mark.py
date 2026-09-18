#!/usr/bin/env python3
"""N13 — burn numbered red boxes and a caption legend onto the shots written by
r2-n13-local-render.mjs (CLAUDE.md section 8: an unmarked shot is not evidence).

    python3 r2-n13-mark.py <run.json> "<caption for 1>" "<caption for 2>"

Box 1 is "Your documents", box 2 is "What has happened so far". The boxes come
from the browser's own element positions, so a box cannot point at empty space.
Writes <shot>-marked.png next to each shot."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RED = (230, 30, 30, 255)


def font(size):
    for name in ("/System/Library/Fonts/Helvetica.ttc",
                 "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


run = json.loads(Path(sys.argv[1]).read_text())
captions = sys.argv[2:4]
f_num, f_leg = font(18), font(15)
for load in run["loads"]:
    if not load.get("boxes"):
        continue
    img = Image.open(load["shot"]).convert("RGBA")
    legend_h = 16 + 26 * len(captions)
    out = Image.new("RGBA", (img.width, img.height + legend_h), (255, 255, 255, 255))
    out.paste(img, (0, 0))
    d = ImageDraw.Draw(out)
    for n, key in enumerate(("docs", "timeline"), start=1):
        b = load["boxes"][key]
        x0, y0, x1, y1 = b["x"] - 4, b["y"] - 4, b["x"] + b["w"] + 4, b["y"] + b["h"] + 4
        d.rectangle([x0, y0, x1, y1], outline=RED, width=4)
        d.rectangle([x0, y0 - 24, x0 + 26, y0], fill=RED)
        d.text((x0 + 8, y0 - 22), str(n), fill=(255, 255, 255, 255), font=f_num)
    y = img.height + 8
    d.line([(0, img.height), (img.width, img.height)], fill=(200, 200, 200, 255), width=1)
    for n, cap in enumerate(captions, start=1):
        d.text((12, y), f"{n}. {load['who']}: {cap}", fill=RED, font=f_leg)
        y += 26
    dest = Path(load["shot"]).with_name(Path(load["shot"]).stem + "-marked.png")
    out.convert("RGB").save(dest)
    print(dest)
