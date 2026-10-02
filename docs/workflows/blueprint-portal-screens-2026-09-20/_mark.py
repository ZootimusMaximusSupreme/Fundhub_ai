# Markup empty vs filled on Blueprint portal shots. Red boxes + legend.
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path("/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/blueprint-portal-screens-2026-09-20")

def font(size):
    for p in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

def mark(src_name, dest_name, boxes):
    im = Image.open(OUT / src_name).convert("RGBA")
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    f = font(18)
    f_small = font(14)
    legend_lines = []
    for i, (xy, caption) in enumerate(boxes, 1):
        d.rectangle(xy, outline=(220, 30, 30, 255), width=5)
        nbox = (xy[0], max(0, xy[1] - 28), xy[0] + 28, xy[1])
        d.rectangle(nbox, fill=(220, 30, 30, 255))
        d.text((xy[0] + 7, xy[1] - 26), str(i), fill=(255, 255, 255, 255), font=f)
        legend_lines.append(f"{i}. {caption}")
    bar_h = 28 + 22 * len(legend_lines)
    d.rectangle((0, im.height - bar_h, im.width, im.height), fill=(20, 20, 20, 230))
    y = im.height - bar_h + 6
    for line in legend_lines:
        d.text((12, y), line, fill=(255, 255, 255, 255), font=f_small)
        y += 22
    out = Image.alpha_composite(im, overlay).convert("RGB")
    dest = OUT / dest_name
    out.save(dest, "PNG")
    print(dest)

# 1. First portal fold: identity is filled, scores are below.
mark(
    "01-portal-dashboard.png",
    "01-portal-dashboard-MARKED.png",
    [
        ((430, 70, 1010, 140), "FILLED — logged in as Sim Eleven-Blueprint"),
        ((250, 160, 1190, 980), "This fold is the welcome video + dispute-sign card. Scores, pre-qual, and docs are BELOW. See 02-portal-scores.png and 02-portal-docs-own-list.png."),
    ],
)

# 2. Scores card is filled; Metro 2 pack not ready.
mark(
    "02-portal-scores.png",
    "02-portal-scores-MARKED.png",
    [
        ((250, 250, 1190, 400), "FILLED — funding file open, pre-qual $212,000"),
        ((250, 430, 1190, 580), "FILLED — Experian 771, Equifax 778, TransUnion 766, Experian business 64"),
    ],
)

mark(
    "02-portal-docs-own-list.png",
    "02-portal-docs-own-list-MARKED.png",
    [
        ((250, 250, 1190, 430), "FILLED — Credit Optimization Roadmap + Funding Snapshot ready to download"),
        ((250, 430, 1190, 520), "EMPTY / NOT READY — Metro 2 Dispute Letter Pack still says Not ready yet"),
    ],
)

# 3. Progress scores + businesses filled; no business PDF.
mark(
    "04-progress-overview.png",
    "04-progress-overview-MARKED.png",
    [
        ((80, 250, 1360, 430), "FILLED — personal scores 771 / 778 / 766"),
        ((80, 450, 1360, 620), "FILLED — two businesses; Holdings Intelliscore 76. EMPTY — no business report PDF (says report not saved yet)"),
    ],
)

# 4. Waypoints are fundability items, not 5 generic repair rows.
mark(
    "05-progress-waypoints.png",
    "05-progress-waypoints-MARKED.png",
    [
        ((80, 160, 1360, 250), "FILLED — next action is fundability: do not open new credit"),
        ((80, 280, 1360, 760), "FILLED — fundability checklist (loan, LLC, EIN, checking). Personal loan marked OVERDUE. Paydowns hidden because this file is already at 10% use."),
    ],
)

# 5. Chat is staff inbox, not AI accountability coach / App Store push.
mark(
    "07-portal-chat.png",
    "07-portal-chat-MARKED.png",
    [
        ((900, 250, 1420, 980), "This is staff chat / portal message. It is NOT an AI accountability coach and it is NOT App Store push."),
    ],
)

print("done")
