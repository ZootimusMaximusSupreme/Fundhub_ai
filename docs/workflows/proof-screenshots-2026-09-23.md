# Proof screenshots — finish the real approval crops (2026-09-23)

Owner ask: crop the REAL approval screenshot out of each old Canva "CLIENT WINS" card,
read the dollar amount off that screenshot, and publish the crops.

**Owner decision 2026-09-23:** every crop file gets Fundhub branding baked in.
(Chris chose "Brand every crop file" over bare crops. This overrides the
"no border, no logo, no frame" line in the original paste. Logged, settled.)

## Ground brief (W0, done)

- Drive folder `1GclLLeMNOVjVSQOJUVBgQYp7WAd3pF11` **is** `broll` itself.
- `broll/old-approvals` (77 files) holds the raw source: `deck-page-01..38.png`, 1920x983.
  Each is a **screenshot of the Canva editor**, not a clean export.
- `broll/client-wins` (40 files) is a subset: its `sanitized-page-01..37.png` are
  byte-identical (same md5) to the ones in `old-approvals`. Nothing unique. Skipped.
- `sanitized-page-*.png` (806x707) was an earlier half-pass — it cropped the Canva
  chrome and the CLIENT WINS bar but LEFT the yellow headline and wood on. Not usable.
- `broll/written-testimonials` — EMPTY. `broll/video-testimonials` — EMPTY.
  So there is no written quote and no client video in the source. Nothing to leave alone.
- `broll/approvals` (22 files) already holds real high-res crops from a DIFFERENT batch
  (70k, 500k, 469k, 54k, 41k, 40k, 400k, 39k, 30k, 25k, 250k, 24k, 23k). Almost no
  overlap with the Canva deck. Destination folder — do not overwrite these.
- There is **no `approval-cards` folder** anywhere in this tree.
- Card panel is identical on all 38 pages: crop (714,8)-(1206,865) = **492x857**.
  That is the resolution ceiling. Inner crops land ~200x300. Source limit, not a bug.
- Old company branding on every card: "TRADELINE SECRETS" seal + "CLIENT WINS" bar.
  Never ships.

Local working copies (this machine, scratch):
- panels: `$S/cards/card-01..38.png` (492x857, Canva chrome already stripped)
- grid:   `$S/grid/grid-01..38.png` (2x, magenta X gridlines, cyan Y gridlines, every 50 panel px)

## Law for every workflow

- Amount is read off the **inner screenshot**. The big yellow "$NNK" on the Canva card is
  a slide total, NOT a screenshot number. It never names a file.
- No face in the screenshot -> no face out. No name in -> no name out.
- Never invent an amount. Cannot read one -> write `NO AMOUNT`, do not guess.
- Duplicate screenshot across pages -> keep one, mark the rest `DUPLICATE`.
- Do not touch the sales page. Do not put the 750 headline back.
- Company is **Fundhub**. Never FundHub.

## Tasks

| Batch | Cards | Owner | Status |
| --- | --- | --- | --- |
| A | card-01 .. card-13 | W1 | pending |
| B | card-14 .. card-26 | W2 | pending |
| C | card-27 .. card-38 | W3 | pending |
| publish | crop + brand + Drive + repo + commit | W0 | waiting on A/B/C |

## Findings (agents append here)

### W0 — resolution ceiling, confirmed by looking everywhere (2026-09-23)

The Canva panel is 492x857, so inner crops land ~200x300. Before accepting that as the
ceiling I searched the whole Drive for higher-res originals of these same approvals:

- `broll/approvals` (22 files) holds high-res originals of a DIFFERENT batch. Its
  `25k-keypoint.jpg` (1806x1186) is the same file as `Andrea Hwang Keypoint Approval.png`
  in `My Drive / Inbox — Sort or Delete`, so that batch was built from real originals.
- Drive-wide name search for approval / approved / credit limit / credit line / line of
  credit returns only those, plus 3 loose images in `Inbox — Sort or Delete`.
- `Inbox — Sort or Delete` is a 200-item dumping ground of unrelated legal and personal
  documents. It is not a curated approval source and was not mined.

**Finding: the Canva deck is the only source for these ~40 approvals, at 492x857.**
A proper Canva export (the design is portrait ~1080x1920) would be roughly 2x sharper than
these editor screenshots. That needs a Canva login and is the one real quality upgrade left.

### W0 — tooling ready

- `scripts/proof-crop-brand.mjs` — renders one crop through
  `clickfunnels-fragments/slo/fundhub-proof-cards.html` with Playwright. The branding IS
  that template (its CSS, its type, its own fundhub wordmark vector). The template file is
  never edited. Face off, name off, tilt zeroed, amount from the crop only.
- `scripts/proof-crops-publish.mjs` — uploads branded PNGs to Drive `broll/approvals`,
  skipping any name already present so the 22 originals are never overwritten.
- Smoke test passed on card-01 / FNBO / $45,000.

### Vision pass complete — A, B, C (2026-09-23)

**59 real screenshots found across 37 cards. 34 carry an amount readable in their own
pixels. 25 do not.** card-38 is a blank filler panel and holds nothing.

The null rate is a resolution artifact, not a data problem: at 492x857 many credit-line
figures are a smudge. A proper Canva export would likely rescue most of them.

#### Cross-check against the prior `AMOUNTS.md`

24 of 28 comparable pages agree exactly — two independent passes, same numbers. Where they
disagree, I zoomed and settled it by eye:

| page | read off pixels | AMOUNTS.md | verdict |
| --- | --- | --- | --- |
| 3 / 13 | $25,000 | $20,000 + $30,000 (p3), $25,000 (p13) | **AMOUNTS.md wrong.** Same Umpqua collage on both pages, and it gives two different answers. The email plainly reads "Your credit line is $25,000." |
| 7 | $25,000 | $20,000 | **AMOUNTS.md wrong.** Highland Bank page plainly reads "Your credit line: $25,000.00". |
| 26 | $5,000 | $5,000 | **Both agree — and both contradict the card.** The Canva headline says $15K. The email reads "a total credit line of $5,000", one digit before the comma. The card's own claim is not backed by its proof. |
| 8, 32, 37 | fewer amounts | more amounts | prior pass counted figures I could not verify in pixels. Left null rather than guessed. |

**`AMOUNTS.md` has at least two wrong amounts and contradicts itself on the Umpqua collage.
Do not treat it as a source.**

#### Excluded, and why

- `card-06 #1` — Truist card art over a stock office photo. Lender marketing, not proof.
- `card-36 #1` — DM thread with a legible name ("Josh", "Daniel Dixon Jr") and a real face.
  Its approval is the Chase account screen inside it, which ships as `card-36 #2` clean.
- `card-37 #1` — "$49,764.00" is the **available balance** on the line, not an approved
  amount. The screenshot ships; no figure is claimed over it.
- `card-03` / `card-13` are the same Umpqua collage. One ships, one is dropped as duplicate.

#### Names — redacted to match the deck's own convention

Ten screenshots still show a client's first name: Anthony (3, 13, 25), Jefferson (12),
Fernando (16), Akash (18), Jessica (20), Alex (21), Hadri (24), Benjamin (26).
Every other name in this deck is already behind a grey bar; these were missed. They get the
same bar. Nothing is added and nothing is invented — a real client's name does not go on a
public page.

Not a name, do not bar: the Elan stock sample card art prints "CHRIS JOHNSON" and
"4000 1234 5678 9010" on cards 7 and 25. Dummy placeholder values.

