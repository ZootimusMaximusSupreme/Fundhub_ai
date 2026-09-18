# UnderwriteIQ pretty pages — 2026-09-17

Goal: the four UnderwriteIQ client documents, as web pages, look like the gold pack
(`docs/workflows/gold-deliverables-v5/*.pdf`) and carry every section, table and
chart it has. Look + completeness only. No Python, no WeasyPrint, no headless print,
no new npm package, no invented numbers, no new Commas product.

Chris said "run it all" at 2026-09-17. This board is the coordination file.

## Task list

| id | owner | files owned | status |
|---|---|---|---|
| W1 | this session | `src/deliverables/css.mjs`, `src/deliverables/chrome.mjs`, `src/deliverables/index.mjs` | done |
| W2 | workflow agent | `src/deliverables/gold-charts.mjs` (new), `src/deliverables/gold-charts.test.mjs` (new) | done |
| W3 | workflow agent | `src/deliverables/credit-analysis.mjs` (+ own new test file) | pending — waits on W1 + W2 |
| W4 | workflow agent | `src/deliverables/funding-snapshot.mjs`, `src/deliverables/lender-list.mjs` (+ own new test file) | pending — waits on W1 + W2 |
| W5 | workflow agent | `src/deliverables/roadmap.mjs` (+ own new test file) | pending — waits on W1 + W2 |

Dependency: W3–W5 wait for W1 (gold chrome + stylesheet) and W2 (the eleven charts).
W1 and W2 run at the same time. W3, W4, W5 run at the same time.

## Shared brief (ground once — read this, do not re-derive it)

### What the gold pack is

* The gold PDFs were printed by `docs/workflows/gold-deliverables-v5/fundhub_pdf_template.py`
  (stylesheet + cover + closing) and `docs/workflows/gold-deliverables-v5/fh_charts.py`
  (the eleven charts). Reference only. Never run either.
* The current Node pages in `src/deliverables/` are a port of an OLDER printer,
  `scripts/black-reports/fundhub_gen.py` (8 charts, older CSS). Their words and
  sections are already right and already honest. The look is what is behind.
* Page images of the gold pack, one PNG per PDF page, for side-by-side looking:
  `$SCRATCH/goldpng/<doc>-pNN.png` (see "Proof tooling" below).

### The one structural rule — the `look` switch (why it exists)

`src/deliverables/port-parity.test.mjs` pins every builder's output to the old
Python printer, character for character, for the Jordan Sample client. Chris's
rule: do not skip, delete or weaken a test. So:

* Every builder takes a second argument: `buildX(client, opts = {})`.
* `opts.look === "gold"` → the gold look. Anything else → today's markup, byte for byte.
* `renderDeliverableHtml()` in `index.mjs` always passes `{ look: "gold" }`. So every
  hosted page is gold. The old look survives only so the parity test stays true.
* In gold mode a builder MAY change markup freely (new charts, new wrappers, classes).
  It may NOT change any sentence. Words stay exactly as the builder prints them today.
  Several tests grep the rendered page for exact sentences (see "Test traps").

### The gold chrome (W1 — `chrome.mjs`), all take `opts` last

* `cover(client, doctype, title, opts)` — gold: spectrum hairline across the top,
  wordmark left + spaced tag right, eyebrow/title/short spectrum rule a third down,
  four meta cells at the bottom with left hairlines and mono values, green-dot foot.
  Outer element stays exactly `<div class="cover">`.
* `ctaPage(client, opts)` — gold: centred closing panel. SAME honest lead as today
  (clean bureaus if any, else lenders open today, else book the call). A real link
  button to `BOOK_CALL_URL` = `https://apply.fundhub.ai/schedule/phonecall`, the URL
  printed as a link, and the `<div class="qr">[ QR CODE ]</div>` box kept (a test
  pins it; the gold pack shows the same box). Outer element stays `<div class="cta-page">`.
  Never prints `client.booking_url` in gold mode (the Jordan fixture holds the dead
  `www.fundhubbookingurl.template`).
* `table(headers, rows, numericCols, opts)` — gold: `<table class="fh">`, a cell whose
  whole text is a number / dollar amount / percent gets `class="m"` (mono). The cell
  CONTENT is never wrapped or changed.
* `section(num, label, heading)` — unchanged markup; restyled by CSS.
* `chip(text, kind)` — `kind` is `"solid" | "mid" | "line"`. Existing `.tag`, `.tag.solid`,
  `.tag.grey`, `.tag.open` are restyled by CSS to the same three chips, so a builder
  does not have to change its tags.
* New CSS classes a builder may use in gold mode (from the gold template):
  `.lead` (opening paragraph), `.chart` (wraps every chart), `.m` (mono number span),
  `.co` / `.co.info` / `.co.up` + `.ct` / `.cb` (callouts), `.mrow` + `.mc` / `.mlab` /
  `.mval` / `.mver` / `.mnote` (stat cards), `.bigstat` / `.bs-lab` / `.bs-val` / `.bs-sub`,
  `.fh-ul`, `.fh-check`, `.fh-ol` (lists), `.card4` / `.c4t`, `.lname` / `.kvrow` / `.kv` /
  `.fit` (lender card, inside `.lender`), `.cost` / `.cnum` / `.cbody` / `.ctitle` / `.cline`
  (numbered cost items), `.mquote` (month quote), `.monoline` (mono caption line).
  Existing classes (`.callout.bar`, `.card`, `.cards`, `.hero`, `.scorebox`, `.lender`,
  `.steps`, `.check`, `.tl`, `.note`, `.small`) are restyled to the gold look, so
  unchanged markup still looks right.

### The eleven charts (W2 — `gold-charts.mjs`)

A faithful Node port of `fh_charts.py`, public names camelCased, same argument shapes,
`cap` (caption) optional last. Each returns `<div class="chart"><svg …></svg></div>`, or
`""` when DIAGRAM_SPEC §6 says suppress. W2 writes the exact signatures below when done.

Placement (DIAGRAM_SPEC §5 — the builders own placement):

| document | section | chart |
|---|---|---|
| credit analysis | after the opening, before 01 | `journeyMap` |
| | 02 SCORES, above the cards | `scoreLineup` |
| | 03 UTILIZATION, above the bars | `utilizationTank` |
| | 03 UTILIZATION | `utilizationBars` |
| | 05 NEGATIVES, after the table | `severityScale` |
| | 08 BOTTOM LINE, after the cards | `moneyChain` |
| funding snapshot | 01 NUMBERS | `waterfall` |
| lender list | 01 AVAILABLE NOW | `unlockLadder` |
| | 03 APPLICATION ORDER | `applicationOrder` |
| roadmap | 01 PROJECTION | `timeline` |
| | 03 MONTHS 2-3 | `disputeClock` |

Explainers are the product. Never cut one. Suppress a chart rather than draw a false one.

### Honest empty (hard)

A missing limit, score or dollar prints `-`. Never invent 0. Never invent a lender match.
Never call a bureau clean unless the file says so. Never draw a bar you cannot measure.
Keep the honest `ctaPage` lead — the gold pack's "You have clean bureaus ready for
funding now" on every file was a lie.

### Test traps (read before touching a builder)

* `port-parity.test.mjs` — default (no `opts`) output must stay byte-identical. Only
  change behaviour behind `opts.look === "gold"`.
* `render.test.mjs` — every rendered page must contain `<div class="cover">`,
  `<div class="cta-page">`, `<div class="qr">[ QR CODE ]</div>`, the running footer,
  CSS text `.cover, .cta-page { min-height: 100vh;` and `background: #0c0c0c`; no
  `@page`; no "credit repair" anywhere; no `undefined` / `NaN`; the Academy sample must
  not contain `Jordan`, `SYNCB`, `SIGNET BANK`, `San Antonio`, `Knoll Krest`.
* `zero-limit.test.mjs`, `no-limit.test.mjs` — grep the rendered pages for exact
  sentences and table-row shapes like `SECURED CARD</td><td …>$900</td>`. Do not split
  a sentence with markup and do not wrap a table cell's content.
* `three-printer-wording.test.mjs` — wording shared with two other printers. Do not reword.
* No em dash or en dash in the four documents (DIAGRAM_SPEC §8 gate 5).

### Proof tooling (verification only — never a printer)

* Render every fixture to HTML: `node $SCRATCH/render-all.mjs <outdir>`.
* Screenshot a rendered folder in 1100px tiles: serve `$SCRATCH` on port 8765
  (`node $SCRATCH/serve.mjs $SCRATCH 8765`) and run the tile script.
* `$SCRATCH` = `/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/d3209d00-2ba4-4a08-b0ce-a8ba315f628f/scratchpad`

## Change manifests

(each workflow appends its manifest here when done)

### W1 — gold chrome and stylesheet (done)

Files: `src/deliverables/css.mjs` (rewritten to the gold tokens), `src/deliverables/chrome.mjs`,
`src/deliverables/index.mjs`.

Exports added to `chrome.mjs`:

* `GOLD` (= `"gold"`), `isGold(opts)` — the look switch. Builders test `isGold(opts)`.
* `BOOK_CALL_URL` = `https://apply.fundhub.ai/schedule/phonecall`.
* `cover(client, doctype, title, opts)` — gold cover when `isGold(opts)`.
* `ctaPage(client, opts)` — gold closing panel when `isGold(opts)`. Same honest lead.
* `ctaLead(client)` — the honest closing sentence, shared by both looks.
* `table(headers, rows, numericCols, opts)` — gold: `<table class="fh">`, `td.m` on numeric cells.
* `chip(text, kind)` — `"solid" | "mid" | "line"` status chip.
* `bookButton(label)` — an ink link button to `BOOK_CALL_URL` for use inside a body.

`index.mjs`: `renderDeliverableHtml` calls `spec.build(client, { look: GOLD })`.

Page measure: the text column is now 508pt (it was 140mm by accident — `box-sizing: border-box`
took the padding out of the 176mm). Charts at `width:100%` render at gold size.

RULE FOR W3–W5 found while proving W1: builders print `client.booking_url` inside body prose
("Book your strategy call at www.fundhubbookingurl.template"). In gold mode every such place must
print a link to `BOOK_CALL_URL` instead (e.g. `<a href="${BOOK_CALL_URL}">apply.fundhub.ai/schedule/phonecall</a>`,
escaped). The dead template URL must never appear on a gold page.

Tests: `node --test src/deliverables/*.test.mjs` 151/151 pass after W1, parity untouched.

### W2 — gold-charts.mjs (done)

Files: `src/deliverables/gold-charts.mjs` (new), `src/deliverables/gold-charts.test.mjs` (new).
Nothing else touched. Not committed (the main session commits).

Import: `import { journeyMap, scoreLineup, ... } from "./gold-charts.mjs";` Only dependencies are
`./escape.mjs` and `./format.mjs` (`usd`, for the tank's dollars). Every function returns `<div class="chart"><svg ...></svg></div>` or `""`.
Push the string straight into the page; `""` means "this chart is not drawn here".
`cap` is always optional and last. JS has no keyword arguments, so to give `unlockLadder` or
`utilizationBars` or `timeline` a caption with the default range, pass `undefined` for the range
slots (e.g. `unlockLadder(636, tiers, undefined, undefined, "cap")`).

Exported signatures (arrays where the Python had tuples):

* `scoreLineup(rows, cap)` — rows `[[bureauName, score, note]]` x3, any order. `""` if not exactly 3 rows or any score is not a number.
* `utilizationTank(cardName, limit, balance, targetBal, payAmount, cap)` — `""` if limit is not a positive finite number, balance/targetBal/payAmount not finite, targetBal < 0, payAmount <= 0, balance <= targetBal, or payAmount is not balance - targetBal within $1 (spec 4.2; pass `paydownAmt(row)` and `targetBal(row)` from `derive.mjs`). Dollars print with `usd()` (whole dollars).
* `severityScale(items, cap)` — items `[[tableNum, shortName, plainNote, fx0to1, "a"|"b"]]`. `""` if fewer than 3 items or any fx is not a number in 0..1.
* `moneyChain(steps, headline, teach, cap)` — steps `[[kicker, boldLine, subLine]]`. The CALLER suppresses it when projected <= current. Backstop: `""` if any panel reads "$A becomes $B" with B <= A. `""` if fewer than 2 steps or 5+ steps (panels do not fit).
* `journeyMap({ now, after, rounds = 3, hasCleanBureau, outcome }, cap)` — now/after are display strings (`usd(...)` output, e.g. `"$7,936"`) or null; rounds 1-4; `hasCleanBureau` must be `=== true`; outcome is the client outcome code. `""` if the argument is null / not an object (no journey record) or rounds is not a whole number 1-4. `now` of $0 or less drops Track 1 (an empty FUND NOW track).
* `disputeClock(cap)` — static. Never `""`.
* `applicationOrder(steps, cap)` — steps `[[boldRule, subInstance]]`. `""` if no steps.
* `waterfall(steps, cap)` — steps `[[label, sublabel, value, "base"|"gain"|"total"]]`. `""` if no total step, any value missing/negative, the total is not larger than every base step (projected <= current), or the running total ever passes the total (spec 4.8: total is the largest value).
* `unlockLadder(current, tiers, lo = 620, hi = 710, cap)` — tiers `[[scoreFloor, [lenderName, ...]]]`. Tiers with no names are dropped. `""` if current is not a number, any floor is not a number, or no tier has a lender. Score above every tier: all rows UNLOCKED. Values outside lo/hi widen the rail.
* `utilizationBars(rows, targetPct = 10, cap)` — rows `[[label, pct, detail]]`. A row whose pct is null / not a number (unknown limit) is LEFT OUT. `""` if no row has a known pct. pct > 100: fill stops at 100%, printed percent stays true.
* `timeline(months, startScore, endLo, endHi, lo = 620, hi = 720, cap)` — months `[[n, phase, "a · b · c", noteOrNull]]`. `""` if fewer than 2 months, the LAST month's number is not 6 (the range is drawn on the last column), start/endLo/endHi not a number (no stated month-6 range), or endLo > endHi. A score outside lo/hi widens the axis (deviation 13).

Deviations from `fh_charts.py`, and why:

1. Web, not PDF: `<svg width="100%" viewBox="0 0 508 H" style="display:block;width:100%;height:auto;max-width:508pt" role="img" aria-label="...">`. The Python pinned width/height in pt for WeasyPrint.
2. Every chart has an `aria-label` (its headline, or a one-line summary for the analytics).
3. Section 6 suppression guards the Python did not have (listed per function above).
4. `journeyMap` is parameterised (spec 4.5). Two tracks, with the Python's exact geometry and copy, only when `hasCleanBureau === true` and outcome is not `REPAIR_ONLY`. Otherwise Track 1 is not drawn at all: the repair rounds run on one row under "REPAIR FIRST", headline "Your plan starts with repair.", bold line "Repair comes first on this file. Then a fresh report shows what opens up." The bigger-number box ("$19,841 / BIGGER APPROVALS") is drawn only when both now and after read as plain dollar amounts and after > now; otherwise the map ends at RE-CHECK with no box after it. A missing now prints `- AVAILABLE TODAY`. rounds 4 squeezes the boxes to fit; 1-3 use the Python spacing.
5. `severityScale`: the Python hard-coded Jordan's "Your 7 negative items" and "The SIGNET BANK charge-off sits on the file most lenders read first" and "The two on the far left are paperwork errors" for every client. Now: the count is `items.length`, the lead is "Start on the right. {name of the item furthest right} hurts the most. Fix it first.", the second line is "The ones on the far left hurt less and are easier to fix."
6. `applicationOrder`: "The same five applications ..." only for exactly 5 steps; any other count prints "The same applications in the wrong order get declined." Under 4 steps the shotgun panel keeps the 4-step height so its spokes stay inside it (identical output for 4+).
7. `scoreLineup`: the "Your best and worst are N points apart. Closing that gap is the job." line is left out when N is 0.
8. `utilizationBars`: drawn 10 units lower. The Python put the "TARGET 10%" label at y=-2, outside the frame; it is invisible in the gold PDF (credit analysis page 5).
9. `utilizationTank`: fills clamp at 0-100% (spec section 6); a fill height never goes negative.
10. Text: every interpolated string is escaped with `escape.mjs` (quotes too; `'` prints as `&#39;` where Python wrote `&#x27;`, same character). A caller's em/en dash becomes `-`. Safety net: if a finished chart would contain `NaN`, `undefined`, `Infinity` or "credit repair", it returns `""`. The phrase is matched as the reader sees it: any spaces, line breaks, no-break spaces, hyphens, soft hyphens or zero-width joiners between the words, and across two wrapped `<text>` lines.
11. Numbers format like Python `%.1f` / `%.0f`, including round-half-even on an exact tie (JS `toFixed` rounds those up), so coordinates match the gold digits.
12. Gradient id stays `fhspec` in every chart (spec: keep the id). The `<defs>` string is byte-identical in all eleven, so duplicate ids on one page resolve to the same gradient; a test pins that.
13. `timeline` widens its score axis when the start score or the month-6 range falls outside lo/hi, as `unlockLadder` does. The Python kept 620-720 fixed, so a 598 start drew the TODAY dot at y=147, under the month rail and among the month labels. Inside 620-720 nothing moves (the gold 636 / 680-710 prints the Python's exact coordinates). The timeline prints no axis, so this changes a slope, never a printed number.
14. A percent or score prints at most one decimal, no trailing ".0" (`utilizationBars` pct and target, `unlockLadder` marker and floors, `timeline` start and range, and their aria-labels). The Python printed the raw float (`93.03062302006336%`). Whole numbers print exactly as before.
15. `utilizationTank` prints dollars with `usd()` from `format.mjs` (whole dollars, same as the tables on the page), where the Python printed the raw value (`$1,572.8999999999999`). Whole numbers print exactly as before.

Notes for W3-W5:

* `journeyMap`, `scoreLineup`, `utilizationTank`, `severityScale`, `moneyChain`, `disputeClock`, `applicationOrder` draw their own headline inside the frame, as the Python did. The credit analysis builder already prints "Your plan runs on two tracks at the same time." as a paragraph above the chart; the gold PDF shows it once. W3 decides placement.
* `utilizationBars` rows: pass pct as a number (93), not "93%". Pass null for an unknown limit and the row is left out.
* `waterfall` / `moneyChain`: suppress `moneyChain` yourself when projected <= current.
* `journeyMap`: pass `hasCleanBureau: cleanBureaus(client).length > 0` and `now: usd(...)`; `usd(null)` is `"-"`, which reads as missing (no bigger claim). `now` of `"$0"` drops Track 1 and switches the map to "Your plan starts with repair." If the page prose above the chart says "two tracks", check it agrees.
* `timeline` (W5): the months array must end at month 6 (`[6, "Reveal", ...]`), or the chart is `""`.
* `utilizationTank` (W3): pass `payAmount` = balance - targetBal (`paydownAmt(row)`), or the chart is `""`.

Tests: `src/deliverables/gold-charts.test.mjs`, 86 tests: 5 per chart x 11 (draws, deterministic,
key labels, no NaN/undefined/em/en dash, web SVG wrapper), caption, shared gradient defs,
spectrum-only-as-hairline, 4 proportion checks (bars 93/69/97% within 1%, waterfall 7,936/19,841
and gain within 1%, tank fills, half-even tie), 20 section-6 edge-case tests, escaping of
`<script>` in all ten charts that take caller text plus a caption, dash replacement, banned
phrase, NaN in caller text.
`node --test src/deliverables/gold-charts.test.mjs` 86/86 pass, 0 skipped.
`node --test src/deliverables/*.test.mjs` 237/237 pass, 0 skipped. `npm run lint` clean.

W2 fix pass (2026-09-17, after the independent check): 9 checker findings read against the code.
8 fixed in `gold-charts.mjs`, 1 partly rejected (journeyMap with `now` missing keeps Track 1 and
prints "-", the house mark for unknown; `$0` is fixed). The timeline-axis finding is fixed by
documenting the widening (deviation 13) and pinning it with a test, not by going back to the
Python's fixed axis, which drew an out-of-range dot among the month labels. 9 regression tests
added (one per finding).
One existing fixture changed, not weakened: the escaping test's two-month timeline now ends at
month 6 (it was `[1, 2]`, which the month-6 guard now correctly suppresses; the assertions are
unchanged). All 14 charts in the earlier W2 visual-check page rebuild byte-identical.
`node --test src/deliverables/gold-charts.test.mjs` 95/95 pass, 0 skipped.
`node --test src/deliverables/*.test.mjs` 246/246 pass, 0 skipped. `npm run lint` clean.
Visual check: all eleven rendered in Chromium with the gold fonts next to the gold PNGs
(journey map, ladder, shotgun match the gold pages).

## Blockers and open questions

(none yet)
