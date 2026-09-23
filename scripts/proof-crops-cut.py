#!/usr/bin/env python3
"""
Cut the real approval screenshots out of the old Canva client-wins cards.

  python3 scripts/proof-crops-cut.py <scratch-dir> <out-dir>

Reads <scratch>/vision-{A,B,C}.json (box + amount per screenshot, produced by the
vision pass) and <scratch>/cards/card-NN.png (the Canva panel, chrome already stripped).

What it does, in order:
  1. drops entries listed in DROPS      - lender marketing art, not approval proof
  2. bars over every name box in name-boxes.json - the deck bars every other name;
     these were missed. Missing that file is a hard stop, never a silent skip.
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

def _load_name_boxes():
    p = f"{SCRATCH}/name-boxes.json"
    if not os.path.exists(p):
        print("!! name-boxes.json missing - NO name will be barred. Refusing to publish blind.")
        sys.exit(2)
    out = {}
    for r in json.load(open(p)):
        if r.get("boxes"):
            out[r["card"]] = [tuple(b) for b in r["boxes"]]
    return out

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
# Boxes come from <scratch>/name-boxes.json, read off a 4x grid rather than estimated.
# Keyed by card; applied to that card's screenshot that carries the name.
# --- not a name, but still someone's identifier. Barred for the same reason. ---
EXTRA_BARS = {
    # the same BOA message appears on two cards; bar the reference number on BOTH,
    # so it cannot matter which copy the picker keeps
    ("card-19", 1): [(78, 434, 126, 448)],   # credit application reference number 4142115717
    ("card-08", 4): [(256, 558, 300, 567)],  # the same number on the other copy
}

# --- the same screenshot the hash could not pair, because the two copies carry
# --- different-sized redaction bars. Verified side by side by eye before listing.
MERGE_AS = {
    ("card-16", 1): ("card-01", 2),   # identical BOA "Credit limit: $12,000" message
    ("card-15", 1): ("card-01", 3),   # same FNBO "$45,000 in 0% business credit" screen
    ("card-09", 2): ("card-21", 1),   # same Citizens "APPROVED!!! / cold streak" thread
    ("card-23", 1): ("card-09", 3),   # same Amex "I GOT APPROVED. LETS GOOO" message
    ("card-06", 3): ("card-02", 1),   # same "Business cards (1) $0.00" account screen
    ("card-13", 2): ("card-13", 1),   # thumbnail of the same Umpqua email on the same card
    ("card-13", 3): ("card-13", 1),   # the second thumbnail of it on that card
    ("card-20", 1): ("card-09", 1),   # same Chase Ink "credit limit is $74,000" welcome
    ("card-11", 1): ("card-06", 2),   # same NIHFCU "approved me for $5k!" thread
}

BAR = (176, 186, 196)   # the grey the deck itself uses for redaction bars

def slug(s):
    if not s: return "lender"
    s = s.lower().split("(")[0]
    out = "".join(c if c.isalnum() else "-" for c in s)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")[:22].strip("-") or "lender"

NAME_BOXES = _load_name_boxes()
print(f"name boxes loaded for {len(NAME_BOXES)} cards: {', '.join(sorted(NAME_BOXES))}")

rows = []
for b in "ABC":
    p = f"{SCRATCH}/vision-{b}.json"
    if os.path.exists(p):
        rows += json.load(open(p))
    else:
        print(f"!! vision-{b}.json missing - that batch is NOT in this run")

kept, dropped, dupes = [], [], []

# ---- pass 1: cut every surviving screenshot, keep it in memory with its signature ----
cand = []
for r in sorted(rows, key=lambda x: (x["card"], x["n"])):
    key = (r["card"], r["n"])
    if key in DROPS:
        dropped.append({**r, "why": DROPS[key]}); continue
    im = Image.open(f"{SCRATCH}/cards/{r['card']}.png").convert("RGB")
    bars = list(NAME_BOXES.get(r["card"], [])) if r.get("has_name") else []
    bars += EXTRA_BARS.get(key, [])
    if bars:
        d = ImageDraw.Draw(im)
        for bx in bars:
            d.rectangle(bx, fill=BAR)
    crop = im.crop(tuple(r["box"]))
    if crop.width < 40 or crop.height < 40:
        dropped.append({**r, "why": f"box too small to be a screenshot ({crop.width}x{crop.height})"}); continue
    amt = r.get("amount")
    if key in AMOUNT_OVERRIDE:
        amt, why = AMOUNT_OVERRIDE[key]
        r = {**r, "amount_note": why}
    g = crop.resize((16, 16), Image.LANCZOS).convert("L")
    px = list(g.getdata()); avg = sum(px) / len(px)
    cand.append({"r": r, "crop": crop, "amount": amt, "bars": len(bars),
                 "sig": tuple(v > avg for v in px)})

# ---- pass 2: group the same approval reused on several cards ----
groups = []
for c in cand:
    hit = next((g for g in groups
                if sum(a != b for a, b in zip(c["sig"], g[0]["sig"])) <= 12), None)
    if hit is None:
        groups.append([c])
    else:
        hit.append(c)

# ---- pass 2b: force-merge pairs the hash missed ----
def _find(k):
    return next((g for g in groups if any((c["r"]["card"], c["r"]["n"]) == k for c in g)), None)
for a, b in MERGE_AS.items():
    ga, gb = _find(a), _find(b)
    if ga is not None and gb is not None and ga is not gb:
        gb.extend(ga); groups.remove(ga)
        print(f"force-merged {a[0]}#{a[1]} into {b[0]}#{b[1]} (verified same screenshot)")

# ---- pass 3: one file per group. Keep the cleanest image, carry the best amount. ----
for g in groups:
    amts = {c["amount"] for c in g if c["amount"] is not None}
    if len(amts) > 1:
        print(f"!! group disagrees on the amount {sorted(amts)}: "
              + ", ".join(f'{c["r"]["card"]}#{c["r"]["n"]}' for c in g) + " -> left with no figure")
    amount = amts.pop() if len(amts) == 1 else None
    # Keep the CLEAREST copy. Bars are applied correctly to whichever copy wins, so a bar
    # is not a reason to prefer a smaller, blurrier version of the same approval.
    best = sorted(g, key=lambda c: (-c["crop"].width * c["crop"].height, c["bars"]))[0]
    for c in g:
        if c is not best:
            dupes.append({**c["r"], "same_as": f'{best["r"]["card"]}#{best["r"]["n"]}'})
    r, crop = best["r"], best["crop"]
    name = (f"win-{amount}-{slug(r.get('lender'))}" if amount is not None
            else f"win-noamount-{slug(r.get('lender'))}-{r['card'].replace('card-','p')}-{r['n']}")
    path = f"{OUT}/{name}.png"
    n = 2
    while os.path.exists(path):
        path = f"{OUT}/{name}-{n}.png"; n += 1
    crop.save(path)
    kept.append({"id": os.path.basename(path)[:-4], "crop": os.path.abspath(path),
                 "amount": amount,
                 "alt": (f"{r.get('lender') or 'Lender'} {r.get('kind','')} approval"
                         + (f" for ${amount:,}" if amount is not None else "")).strip(),
                 "card": r["card"], "n": r["n"], "lender": r.get("lender"), "kind": r.get("kind"),
                 "amount_note": r.get("amount_note"), "clipped": r.get("clipped"),
                 "redacted": best["bars"] > 0, "bars": best["bars"],
                 "also_on": [f'{c["r"]["card"]}#{c["r"]["n"]}' for c in g if c is not best]})

json.dump(kept, open(f"{OUT}/manifest.json", "w"), indent=1)
json.dump({"dropped": dropped, "duplicates": dupes}, open(f"{OUT}/excluded.json", "w"), indent=1)
with_amt = [k for k in kept if k["amount"] is not None]
print(f"in {len(rows)}  kept {len(kept)}  dropped {len(dropped)}  duplicates {len(dupes)}")
print(f"with a real amount {len(with_amt)}   no readable amount {len(kept)-len(with_amt)}")
if with_amt:
    print("amounts:", ", ".join(f"${k['amount']:,}" for k in sorted(with_amt, key=lambda x: -x["amount"])))
