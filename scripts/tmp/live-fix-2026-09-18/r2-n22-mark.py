#!/usr/bin/env python3
"""HOLE N22 — burn a numbered red box + legend onto the live header shot.

The box comes from the browser's own measurement of #fh-shell-avatar,
recorded in <evidence>/<tag>.json by r2-n22-verify.mjs, so it can never point
at empty space. Writes <tag>-look1-marked.png next to the raw shot.

    python3 scripts/tmp/live-fix-2026-09-18/r2-n22-mark.py before
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

EVID = Path("/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N22")
TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
data = json.loads((EVID / f"{TAG}.json").read_text())
chip = data["chip"][0]
avatar = data.get("api_avatar", {})
if avatar.get("is_sim_photo_id"):
    caption = "1  Chris's photo in the header is the fake sim ID card (same bytes as sim-documents/08/photo-id-1.png)"
elif chip.get("tag") == "button":
    caption = "1  Chris's header shows the '+' (no photo yet) - the sim ID card is gone"
else:
    caption = "1  Chris's header photo - not the sim ID card"

RED = (255, 40, 40, 255)
img = Image.open(EVID / f"{TAG}-look1-page.png").convert("RGBA")
W, H = img.size
LEG = 70
out = Image.new("RGBA", (W, H + LEG), (0, 0, 0, 255))
out.paste(img, (0, 0))
d = ImageDraw.Draw(out)


def font(size):
    for name in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


b = chip["box"]
pad = 8
x0, y0, x1, y1 = b["x"] - pad, b["y"] - pad, b["x"] + b["w"] + pad, b["y"] + b["h"] + pad
d.rectangle([x0, y0, x1, y1], outline=RED, width=4)
d.ellipse([x1 + 4, y1 + 4, x1 + 32, y1 + 32], fill=RED)
d.text((x1 + 13, y1 + 7), "1", fill=(255, 255, 255, 255), font=font(20))
d.text((16, H + 22), caption, fill=(255, 255, 255, 255), font=font(24))
out.convert("RGB").save(EVID / f"{TAG}-look1-marked.png")
print(EVID / f"{TAG}-look1-marked.png")
