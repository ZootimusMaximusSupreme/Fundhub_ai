#!/usr/bin/env python3
"""Numbered red boxes + a caption legend on the LIVE /watch card-size proof shots.

CLAUDE.md section 8. Every box is the element's real on-screen position, read out of the
browser by _walk.mjs and saved next to each raw shot, so a box can never point at empty
space. Nothing here is injected: both phases are what apply.fundhub.ai actually served.

    node _walk.mjs before <dir>   # live page before the ship
    node _walk.mjs after  <dir>   # live page after the ship
    python3 _mark.py
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
    print("wrote", name + "-marked.png")


def crop_to(img, y, h, pad_top=56, pad_bot=24):
    top = max(0, int(y) - pad_top)
    bot = min(img.height, int(y + h) + pad_bot)
    return img.crop((0, top, img.width, bot)), top


def r4(m):
    return m["x"], m["y"], m["w"], m["h"]


live = {p: json.loads((HERE / f"live-{p}.json").read_text()) for p in ("before", "after")}

# 1 & 2. The video testimonial row — the cards, and the air around them.
for width, cap in ((1280, "desktop"), (390, "phone")):
    panels, lines = [], []
    for n, phase in enumerate(("before", "after"), 1):
        img, m = load(f"vids-{width}-{phase}")
        rowx, roww = m["vrowLeft"], m["vrowRight"] - m["vrowLeft"]
        slot = m["slot"]
        panel, top = crop_to(img, slot["y"], slot["h"])
        box(panel, (rowx, slot["y"] - top, roww, slot["h"]), n)
        air = round((m["railWidth"] - roww) / 2)
        when = "before" if phase == "before" else "now"
        if m.get("stacked"):
            lines.append(
                f"{when}: each card {round(slot['w'])} x {round(slot['h'])}px, one per row on a phone "
                f"(box 1 of 3, the other two follow below, {round(m['vgap'])}px apart) — {round(roww)}px of the "
                f"{m['railWidth']}px page column, {air}px of empty space each side"
            )
        else:
            lines.append(
                f"{when}: each card {round(slot['w'])} x {round(slot['h'])}px, "
                f"gap {round(m['vgap'])}px, the three fill {round(roww)}px of the {m['railWidth']}px page column "
                f"— {air}px of empty space each side"
            )
        panels.append(panel)
    tail = "one card fills the width" if width == 390 else "the cards fill the row"
    save(legend(side_by_side(panels), lines, f"From our clients ({cap}, {width}px): {tail}"), f"videos-{width}")

# 3 & 4. One approval card, before and after.
for width, cap in ((1280, "desktop"), (390, "phone")):
    panels, lines = [], []
    for n, phase in enumerate(("before", "after"), 1):
        img, m = load(f"wins-{width}-{phase}")
        # the second card on screen: clear of the row's soft left edge, so the box sits on a
        # whole card rather than one the fade is halfway through
        on = m.get("onScreenCards") or []
        x, y, w, h = r4(on[1] if len(on) > 1 else m["card"])
        panel, top = crop_to(img, y, h, pad_top=44, pad_bot=20)
        box(panel, (x, y - top, w, h), n)
        lines.append(
            f"{'before' if phase == 'before' else 'now'}: card {round(w)} x {round(h)}px "
            f"({m['cardCount']} approvals, gap {round(m['cardGap'])}px, row {m['railWidth']}px wide)"
        )
        panels.append(panel)
    save(legend(side_by_side(panels), lines, f"Real approvals. Real screenshots. ({cap}, {width}px): every card 20% larger"),
         f"approvals-{width}")

# 5 & 6. End of the slide, live after the ship: the last card stops inside the row,
#        and the page never scrolls sideways.
for width, cap in ((1280, "desktop"), (390, "phone")):
    img, m = load(f"end-{width}-after")
    rail, last = m["rail"], m["lastCard"]
    top_y = min(rail["y"], last["y"])
    panel, top = crop_to(img, top_y, max(rail["h"], last["h"]), pad_top=40, pad_bot=20)
    box(panel, (rail["x"], rail["y"] - top, rail["w"], rail["h"]), 1)
    box(panel, (last["x"], last["y"] - top, last["w"], last["h"]), 2)
    a = live["after"][str(width)]
    lines = [
        f"the row, {round(rail['w'])}px wide — scrolled by mouse wheel to where the slide stops: "
        f"it moved {abs(round(a['ride']['endTx']))}px, all {round(a['ride']['travelNeeded'])}px it needed, and goes no further",
        f"approval {m['cardCount']} of {m['cardCount']}, the last one, fully inside the row "
        f"({round(last['x'])}-{round(last['x'] + last['w'])} inside {round(rail['x'])}-{round(rail['x'] + rail['w'])}) "
        f"— page width {m['docScrollW']} = window {m['docClientW']}, so no sideways scroll",
    ]
    save(legend(panel, lines, f"The sliding row reaches the last approval ({cap}, {width}px) — live, nothing injected"),
         f"carousel-end-{width}")

print("done")
