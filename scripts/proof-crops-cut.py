#!/usr/bin/env python3
"""
Cut the real approval screenshots out of the old Canva client-wins cards.

  python3 scripts/proof-crops-cut.py <scratch-dir> <out-dir>

Reads <scratch>/vision-{A,B,C}.json (box + amount per screenshot, produced by the
vision pass) and <scratch>/cards/card-NN.png (the Canva panel, chrome already stripped).

What it does, in order:
  1. drops entries listed in DROPS      - lender marketing art, not approval proof
  2. bars over the name boxes in REDACT - the deck redacts every other name; these slipped
  3. cuts each box out of its card       - the screenshot only, nothing else
  4. drops near-identical crops          - the same approval collaged onto two cards
  5. names each file with the amount READ OFF that screenshot

Never invents an amount. An unreadable figure stays None and the file says so in its name.
No face is ever added. No name is ever added.
"""
import json, os, sys, hashlib
from PIL import Image, ImageDraw

SCRATCH, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# --- not approval proof: lender marketing art. Verified by eye before listing here. ---
DROPS = {
    ("card-06", 1): "Truist card product art over a stock office photo - lender marketing, not an approval",
    ("card-36", 1): "DM thread showing a legible name and a real face. Its approval is the Chase "
                    "account screen inside it, which ships as card-36 n=2 with no name and no face.",
}

# --- a figure that is real but is NOT an approval. Ship the proof, claim no number. ---
AMOUNT_OVERRIDE = {
    ("card-37", 1): (None, "$49,764.00 is the AVAILABLE BALANCE on the line, not an approved amount"),
}

# --- legible client names. The deck bars every other one; bar these to match. ---
# card, n -> list of boxes in CARD coordinates to paint over
REDACT = {
    # boxes read off a 6x zoom with a coordinate grid, not estimated
    ("card-12", 1): [(166, 369, 245, 389)],                    # "Jefferson," US Bank headline
    ("card-03", 1): [(36, 381, 90, 396), (112, 480, 150, 496)],  # "to ANTHONY" + "Congratulations Anthony!"
    ("card-13", 1): [(36, 300, 90, 315), (112, 400, 150, 415)],  # same collage, 81px higher
}
BAR = (176, 186, 196)   # the grey the deck itself uses for redaction bars

def slug(s):
    if not s: return "lender"
    s = s.lower().split("(")[0]
    return "".join(c if c.isalnum() else "-" for c in s).strip("-")[:22] or "lender"

rows = []
for b in "ABC":
    p = f"{SCRATCH}/vision-{b}.json"
    if os.path.exists(p):
        rows += json.load(open(p))
    else:
        print(f"!! vision-{b}.json missing - that batch is NOT in this run")

kept, dropped, dupes = [], [], []
seen = {}
for r in sorted(rows, key=lambda x: (x["card"], x["n"])):
    key = (r["card"], r["n"])
    if key in DROPS:
        dropped.append({**r, "why": DROPS[key]}); continue
    im = Image.open(f"{SCRATCH}/cards/{r['card']}.png").convert("RGB")
    if key in REDACT:
        d = ImageDraw.Draw(im)
        for bx in REDACT[key]:
            d.rectangle(bx, fill=BAR)
    crop = im.crop(tuple(r["box"]))
    if crop.width < 40 or crop.height < 40:
        dropped.append({**r, "why": f"box too small to be a screenshot ({crop.width}x{crop.height})"}); continue
    # perceptual hash: the same approval collaged onto two cards is cropped at slightly
    # different boxes, so exact bytes never match. Compare shape, not bytes.
    g = crop.resize((16, 16), Image.LANCZOS).convert("L")
    px = list(g.getdata()); avg = sum(px) / len(px)
    sig = tuple(v > avg for v in px)
    hit = next((k for k in seen if sum(a != b for a, b in zip(sig, k)) <= 12), None)
    if hit:
        dupes.append({**r, "same_as": seen[hit]}); continue
    seen[sig] = f"{r['card']}#{r['n']}"
    amt = r.get("amount")
    if key in AMOUNT_OVERRIDE:
        amt, why = AMOUNT_OVERRIDE[key]
        r = {**r, "amount_note": why}
    name = (f"win-{amt}-{slug(r.get('lender'))}" if amt is not None
            else f"win-noamount-{slug(r.get('lender'))}-{r['card'].replace('card-','p')}-{r['n']}")
    path = f"{OUT}/{name}.png"
    n = 2
    while os.path.exists(path):
        path = f"{OUT}/{name}-{n}.png"; n += 1
    crop.save(path)
    kept.append({"id": os.path.basename(path)[:-4], "crop": os.path.abspath(path),
                 "amount": amt, "alt": (f"{r.get('lender') or 'Lender'} {r.get('kind','')} approval"
                                        + (f" for ${amt:,}" if amt is not None else "")).strip(),
                 "card": r["card"], "n": r["n"], "lender": r.get("lender"), "kind": r.get("kind"),
                 "amount_note": r.get("amount_note"), "clipped": r.get("clipped"),
                 "redacted": key in REDACT})

json.dump(kept, open(f"{OUT}/manifest.json", "w"), indent=1)
json.dump({"dropped": dropped, "duplicates": dupes}, open(f"{OUT}/excluded.json", "w"), indent=1)
with_amt = [k for k in kept if k["amount"] is not None]
print(f"in {len(rows)}  kept {len(kept)}  dropped {len(dropped)}  duplicates {len(dupes)}")
print(f"with a real amount {len(with_amt)}   no readable amount {len(kept)-len(with_amt)}")
if with_amt:
    print("amounts:", ", ".join(f"${k['amount']:,}" for k in sorted(with_amt, key=lambda x: -x["amount"])))
