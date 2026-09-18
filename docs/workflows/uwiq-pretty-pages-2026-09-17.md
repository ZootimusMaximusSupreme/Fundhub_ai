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
| W3 | workflow agent | `src/deliverables/credit-analysis.mjs` (+ own new test file) | done |
| W4a | workflow agent | `src/deliverables/funding-snapshot.mjs` (+ own new test file) | done |
| W4b | workflow agent | `src/deliverables/lender-list.mjs` (+ own new test file) | done |
| W5 | workflow agent | `src/deliverables/roadmap.mjs` (+ own new test file) | done |

W4 was split in two at launch (one file each) so all four documents build at once.
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

### W4b — Capital Partner Shortlist (lender match list)

Files: `src/deliverables/lender-list.mjs` (gold branch), `src/deliverables/gold-lender-list.test.mjs`
(new). Nothing else touched. Not committed (the main session commits).

Signature: `buildLenderList(client, opts = {})`. Gold when `isGold(opts)`. Without opts the output
is byte-identical: diffed for all five fixtures, the empty client and `null` before and after
(`cmp` identical), and `port-parity.test.mjs` passes.

Chart placements:

* `unlockLadder` in 01, after the good-news paragraph. It replaces the old ruler AND the ladder
  table (it draws both). current = median; tiers = the builder's own after-optimization lenders
  grouped by floor, ascending, with the builder's existing rule kept: floors at or under the
  median are dropped (those lenders are held back by something other than score, so the chart's
  "UNLOCKED" row would be false). Caption: "YOUR SHORTLIST BY SCORE FLOOR · A FLOOR IS THE
  MINIMUM, NOT AN APPROVAL". Suppressed with no median, no lenders, or no floor above the median
  (drawn for Jordan and repair; suppressed for academy, no-limit, zero-limit, empty). If the chart
  ever returns "" while tiers exist, the gold ladder table prints instead.
* `applicationOrder` in 03, after the opening paragraph. Steps = the builder's five
  `[rule, instance]` pairs, words unchanged. It replaces `.steps` + the old shotgun. The chart
  draws "The order protects your score. Follow it exactly." and "The same five applications in
  the wrong order get declined.", so those two HTML duplicates are dropped; "The wrong order costs
  you money and time." prints under the chart. If the chart returns "", the old markup prints.

Gold-section checklist (gold heading -> gold look):

* Cover -> present, `cover(..., opts)` (title stays the builder's "Capital Partner Shortlist").
* 01 AVAILABLE NOW / Available Right Now -> present: same paragraphs and callout, gold table for
  lenders open today, unlock ladder, note.
* 02 SHORTLIST / After Optimization - Your Shortlist -> present: category `<h3>` + `<p class="small">`
  note (no empty note line), each lender a gold card `.lender > .lname / .kvrow > .kv(.k,.v) / .fit`
  with TYPE / RANGE / SCORE NEEDED / TIME IN BUSINESS / REVENUE / YOU NEED as the builder already
  decides; dollar figures in card values set in mono (`span.m`), as the gold `rich()` did.
* 03 APPLICATION ORDER / Application Order Warning -> present, with the chart.
* 04 STRATEGY -> present as "The Order, Spelled Out": the five rules as `.fh-ol`, rule in bold,
  then the same instance the chart draws. No Academy mention.
* 05 AT A GLANCE / Your Numbers at a Glance -> present, gold table (renumbered from 04).
* Closing panel -> `ctaPage(c, opts)`: honest lead, link to `BOOK_CALL_URL`. The builder prints
  `client.booking_url` nowhere in the body, so nothing else needed swapping.

Gold-mode honesty guards (gold only, default untouched): a missing score prints "-" ("Your Experian
score sits at -. Your median score is -.", at-a-glance median "-", card SCORE NEEDED "-", card RANGE
"-" when both ends are missing); the median of an empty file is not read as 0 (no "N more points"
row against it); a lender with no floor is never "the lowest floor"; a lender's reason that already
ends in "." is not printed with a second full stop ("..").

Gaps, not carried (all prose, none a section / table / chart):

* Gold 03 lines "This part matters a lot. Read it carefully." and "Here is the order that protects
  you:", gold 04 "Do not guess on application order. It is one of the most expensive mistakes
  clients make." and the "the full rules are spelled out below" caption: new copy the builder
  does not print; not added (look + completeness only, no new words).
* Gold 03 rule sentences ("Pay SYNCB/LEVITZ from $1,762 down to $189. Do this before any
  application.", "Navy Federal at 650 is your first personal target. Kabbage at 640 ..."): Jordan's
  prose. 04 prints the builder's own instances instead.
* Gold 04 "Learn the Full Strategy" Academy advert: dropped by instruction.
* Gold 05 closing paragraph ("You are close, Jordan. The two moves that unlock most of this
  list ..."): Jordan's prose; no builder sentence or derive.mjs helper produces it.
* Cover title "Jordan's Capital Partner Shortlist": the builder's title has no first name; kept.
* Seen, words kept as the rule requires: with the ladder suppressed (academy, empty) the builder's
  callout still says "The score ladder below shows exactly how many points stand between you and
  each one."; for the empty file 02 says "Nothing on this list is out of reach. Every lender the
  matcher knows is already open to you." with no lenders on file.

Workaround in my file, see Blockers: `interInCharts()` pins the charts' Inter text with an inline
style because `css.mjs` sets `svg text` to mono. Delete it once the CSS is fixed.

Tests: `node --test src/deliverables/gold-lender-list.test.mjs` 34/34 pass, 0 skipped.
`node --test src/deliverables/*.test.mjs` 320 tests, 318 pass, 2 fail, 0 skipped. The 2 are the
expected render.test.mjs counts ("lender_match has 4", "27 in total"), now 5 and 28, owned by the
main session. `npm run lint` clean.
Visual check: Jordan tiles next to gold pages 1-10 (cover, ladder, cards, order chart, at a
glance, closing) read as the same document; repair, academy, no-limit and empty shot and read:
nothing broken, nothing invented. Tiles: `$SCRATCH/W4b-png/`.

W4b fix pass (2026-09-17, after the independent check). All 8 checker gaps read against the code
and confirmed real; all 8 fixed in `lender-list.mjs`, gold look only. None rejected. The fix drops
or re-targets a false line; it adds no new sentence. The "Seen, words kept" item above is
superseded: those lines no longer print where they are false.

1. 01 open-today table: a missing range printed `$0K-$0K` (moneyRange reads null as 0). Now `-`,
   or `$5K - -` when one end is missing.
2. 01 callout: "You are not far off. The score ladder below ..." prints only when the ladder (chart
   or table) is drawn. Otherwise just "No lenders are matched for immediate funding right now."
3. Empty file: section 02 is left out when the file has no lender at all (same as W4a's 05), so
   "Every lender the matcher knows is already open to you" no longer contradicts 01. "But here's
   the good news. You are not far off. Weeks, not years." (no hero card) prints only with a median
   and at least one lender. Empty page now reads 01, 03, 04, 05.
4. 05 at a glance: "680-700 projected" prints only for a known median under 680 (Jordan 636,
   repair 595). No score, 700, 762: `-`.
5. First target (03 chart and 04): the lowest floor among personal lenders, a lender open today
   first; a business lender only when no personal lender has a floor. Jordan: Navy Federal Credit
   Union at 650 (the gold pack's first personal target), not Kabbage at 640. No-limit/zero-limit:
   Marcus at 660, open today. Same "X ASKS FOR N. THAT IS YOUR FIRST TARGET" words.
6. A file whose matcher never split lenders into now/after (Jordan, repair, academy): "0 open
   today" holds only when every floor is above the median. Academy (762, every floor 700 or less)
   now gets "Lenders Available - 15", no "none matched today" callout, and its 02 lead is just
   "Here is who fits you and why." Jordan and repair are unchanged (0 / 15, as the gold pack).
7. "that's critical" prints only at 80% or more, the mapper's own CRITICAL line (utilStatus() in
   `black-report-client.mjs`). Academy now reads "And your utilization is at 17%."
8. 04 "The Order, Spelled Out" is now a square-bullet list (`.fh-ul`) of the five rules as sentences
   in the chart's exact words (bold rule, then e.g. "Pay SYNCB/LEVITZ down to $189."), not the
   chart's mono capitals again, and it ends on the builder's bold "The wrong order costs you money
   and time." (moved from under the chart, printed once). Gold's extra words ("from $1,762", "Do
   this before any application.", "Do not guess on application order ...") are still not added.

Default look: byte-identical for the six fixtures, `null`, and four edge clients (no range, 17%
utilization, business-only, no scores), compared before/after with `cmp`; `port-parity.test.mjs`
22/22.
Tests: 33 added to `gold-lender-list.test.mjs` (one block per gap: "fix pass 1" to "fix pass 8").
Run against the old builder in a scratch copy of the tree, 34 of 67 fail, including at least one
in every fix-pass block; against the new builder 67/67 pass. My first-pass tests that pinned the
old wrong lines now pin the correction: the "every default sentence" check lists each corrected
line with exactly what prints instead and fails if a listed correction is not needed.
`node --test src/deliverables/gold-lender-list.test.mjs` 67/67 pass, 0 skipped.
`node --test src/deliverables/*.test.mjs` 463 tests, 453 pass, 10 fail, 0 skipped. 2 are the
expected render.test.mjs counts. The other 8 are in `gold-funding-snapshot.test.mjs` (W4a's file,
being edited now); the same 8 fail with my old builder, so they are not from this change.
`npm run lint` clean.
Visual check: Jordan, academy, empty and no-limit re-shot at 900px. Tiles: `$SCRATCH/W4b-fix-png/`.

### W4a — Capital Readiness Snapshot (funding snapshot)

Files: `src/deliverables/funding-snapshot.mjs` (gold branch), `src/deliverables/gold-funding-snapshot.test.mjs`
(new). Nothing else touched. Not committed (the main session commits).

Signature: `buildFundingSnapshot(client, opts = {})`. Gold when `isGold(opts)`. Without opts the
output is byte-identical: compared for all five fixtures and the empty client before and after,
and `port-parity.test.mjs` passes. The 04 lines and the 06 warning are now held as [bold lead,
rest] pairs / two constants so both looks print the same strings.

Chart placement: `waterfall` in 01, after the today-vs-after table, before the builder's
"PERSONAL LOAN PRE-APPROVAL BAND · UNDERWRITEIQ" note. Steps are the builder's own labels:
`[["TODAY","Current pre-approval",now,"base"],["UTILIZATION FIX",payDownCardsLine(c),after-now,"gain"],["PROJECTED","After optimization",after,"total"]]`.
It replaces the old `svgWaterfall`. Suppressed when either pre-approval is not on the file (null
or blank is not read as $0) or projected is not above current. Drawn: Jordan, academy, no-limit,
zero-limit. Suppressed: repair ($0 to $0), empty (no figures).

Gold-section checklist (gold heading -> present, how):

* Cover -> `cover(..., opts)`.
* 01 NUMBERS / Your Numbers Right Now -> gold table (today vs after, funding gap row), waterfall,
  note, the builder's bold fundable/gap paragraph.
* 02 BREAKDOWN / Breakdown by Category -> Personal Cards gold table + overall utilization line;
  Installment Loans, Mortgage / Real Estate, Child Support / Public Obligations gold tables with
  the gold chips on the status column and on a notes cell that is exactly a status word ("Clean"),
  the cell's own text inside the chip; Business Accounts paragraph.
* 03 COSTING YOU / What Is Costing You Money -> intro line, then one numbered `.cost` block per
  item (`.cnum` / `.ctitle` / `.cline`), fix order unchanged, one `.cline` per sentence (split only
  between sentences, no word changed).
* 04 NOT A FACTOR / What Does Not Affect Your Funding -> each item a numberless `.cost` block (bold
  title, one line per sentence, hairline under), which is how gold page 6 draws them. Not `.card4`:
  that class draws a boxed card and the gold page has no box.
* 05 AFTER OPTIMIZATION / Where You Could Be - After Optimization -> gold table, only when the
  locked lender bucket has lenders (empty file: section absent, nothing invented).
* 06 NEXT STEP / Your Next Step -> the do-not-open warning as a `.co` callout (`.ct` + `.cb`),
  "Your fastest wins:" then the wins as `.fh-ol`, then the builder's "Those N moves..." line.
* Gold page 8 book-the-call box -> `.co.info`: "Book your strategy call now:" + link to
  `BOOK_CALL_URL` (apply.fundhub.ai/schedule/phonecall). The builder never printed
  `client.booking_url` in the body, so there was nothing else to swap.
* Closing panel -> `ctaPage(c, opts)`, honest lead.

Gold-only honest-empty guards (default untouched): a missing median / Experian score prints "-"
(was a blank cell); the funding gap is worked out only from two stated figures, so the empty file
reads "- left on the table", not "$0 left on the table". A file that states $0 (repair) still
prints $0.

Gaps, not carried:

* 06 "Jordan, here is the honest truth. You are fundable right now. But the version of you ...
  gets offered 2-5x more money at better rates." F53 dropped "You are fundable right now" for a
  file without the numbers, and "2-5x" is on no file. Not added.
* 04 intro "You do not need to lose sleep over these. They are cleanup only." and the gold's
  richer 03/04 coaching lines ("Lenders see this and think you are drowning...", "Inquiries - 46
  Total", "5 on File"): new copy or Jordan's prose. Not added (no new words).
* 06 "Your 3 fastest wins:" count and "Those three moves alone can push your score past 680 ...":
  the builder prints "Your fastest wins:" and its own F53 line. Kept.
* Page 8 "Want to learn how to build this the right way? Fundhub Academy ..." (Academy advert and
  the banned phrase): dropped. "Your next funding window is closer than you think. Let's not waste
  it.": a promise no file supports, dropped.
* Page 8 mono line "capital readiness snapshot · experian primary bureau · scores: ex 630 / eq
  636": the CLIENT dict has no primary-bureau field. Not added.
* Seen, words kept as the rule requires: on the empty file "Your fastest wins:" has no list under
  it, and 03 still opens "Each item below is hurting your pre-approval." above one item.

Workaround in my file, see Blockers: `interInChart()` pins the waterfall's Inter sublabels with an
inline style because `css.mjs` sets `svg text` to mono. Delete it once the CSS is fixed.

Tests: `node --test src/deliverables/gold-funding-snapshot.test.mjs` 40/40 pass, 0 skipped
(section order x6 clients, gold chrome/tables, waterfall drawn/suppressed x9 incl. proportions
within 1%, 03/04/06 blocks, booking link + no dead/client URL, no em/en dash / NaN / undefined /
banned phrase / Academy x6, Academy leak list, honest empty, default look unchanged, every
sentence of the old look prints in the gold look x6).
`node --test src/deliverables/*.test.mjs` 320 tests, 318 pass, 2 fail, 0 skipped. The 2 are
render.test.mjs "lender_match has 4" / "27 in total" (W4b's lender list, see W4b). The funding
snapshot count (6) passes. `npm run lint` clean.
Visual check: Jordan tiles next to gold pages 1-9 read as the same document; repair and empty
shot and read: charts suppressed, dashes where the file is silent, nothing invented.
Tiles: `$SCRATCH/W4a-png/`, `$SCRATCH/W4a-png-repair/`, `$SCRATCH/W4a-png-empty/`.

W4a fix pass (2026-09-17, after the independent check). Same two files only; not committed. All
10 findings read against the code and the rendered pages; all 10 real. 9 fixed in
`funding-snapshot.mjs`, gold only. Finding 10 (phone width) is only partly in this file (see
Blockers). What changed in gold:
1. 01 AFTER OPTIMIZATION scores are the file's own `score_targets` (Jordan: "680-710 (projected)",
   "690+"), else "-". The typed "700+ (projected)" is gone from gold (default look keeps it).
2. The chart caption prints only right under a drawn waterfall.
3. "Your fastest wins:" and its list print only when there is a win (empty file: gone).
4. A category with no rows prints "None on file." (existing house phrase) under its heading
   instead of a header-only table.
5. Personal Cards: STATUS is the account state ("Closed" when the flag is CLOSED or the file's
   utilization cell says closed, "Open" for a flag only an open card gets, else "-"); the flag
   chip sits once, beside the percent. No flag chip on a closed card.
6. The "Those N moves ... toward ..." line prints only with a real gain (both figures, projected
   above current) and when every listed win moves money (a card with no target does not).
   Repair, no-limit, zero-limit: line gone. Jordan and academy keep it.
7. Waterfall also needs a card to pay down (known utilization, balance above target). No-limit
   and zero-limit are now suppressed (the manifest above said drawn; that changed here).
8. One row per account: rows matching in every shown column (bureau ignored) are dropped from
   the four 02 tables, 03, the wins and the chart's card count (academy 9 cards -> 3, one
   Toyota loan; repair 8 -> 3). The 03 negatives stay one per bureau, each names its bureau.
9. Engine codes print as plain words (same words as black-report-node.mjs RATING_WORDS, which is
   not exported, so the table is copied locally): "Late30Days" -> "30 days late",
   "CollectionOrChargeOff" -> "Collection or charge-off", "ChargeOff" -> "Charge-off",
   "AsAgreed" -> "Paying on time". Only a lone code token is changed; "Charge-Off" stays.
10. Personal Cards cells now carry one chip, so the table fits at 390px (measured: no chip
    outside the table, was 4). The chart part is not in this file.
Word changes are only the ones above (each is an honest-empty or untrue-claim fix). Risk: on the
hand-written Jordan fixture the table now shows "SYNCB/LEVITZ (old)" as Closed (its cell says
"Paid/Closed") while the chart line still says "5 open revolving cards" (`derive.mjs`
`openRevolving` counts by flag only; not my file). Real mapper rows never carry "closed" in the
utilization cell. Test file: the "every old sentence prints in gold" check now compares prose
block by block, tables out (tables are checked row by row), with an explicit per-client list of
the sentences the fixes remove, each asserted absent from gold. Plus one describe per finding.
Default look byte-identical: 13 outputs (5 fixtures + empty, no opts and `look:"plain"`, null
client) compared before/after, identical; `port-parity.test.mjs` passes.
Tests: `node --test src/deliverables/gold-funding-snapshot.test.mjs` 112/112 pass, 0 skipped.
`node --test src/deliverables/*.test.mjs` 535 tests, 533 pass, 2 fail, 0 skipped. The 2 are the
same render.test.mjs "lender_match has 4" / "27 in total" (W4b's section count, not this file).
`npm run lint` clean. Tiles: `$SCRATCH/W4a-fix-png*/` (900px x6 clients, 390px Jordan).

### W5 — 6-Month Business Readiness Roadmap

Files: `src/deliverables/roadmap.mjs` (gold branches), `src/deliverables/gold-roadmap.test.mjs` (new).
Nothing else touched. Not committed (the main session commits).

Signature: `buildRoadmap(client, opts = {})`, `const gold = isGold(opts)`. No opts, `{}` or any
non-gold look prints the old markup byte for byte: checked against a snapshot taken before the edit
for all five fixtures, the empty client and `null`; `port-parity.test.mjs` passes.

Chart placements:

* `timeline` in 01, after the big number. Replaces `svgProjection` and the HTML month strip (the
  chart draws the same six months, phases, actions and the builder's `EX 650-665` / `EX 665-680`
  notes). Start = today's median. Range = `PROJECTED_MEDIAN` "680-710", the builder's own stated
  month-6 range (the same constant the 07 table prints). Suppressed when there is no median, and
  when the median is already at or above 680 (the band would show a score that may fall). When
  suppressed, the HTML month strip prints instead so the month plan stays, and the range caption
  goes with the chart. Jordan 636 and repair 595 draw; academy 762, no-limit / zero-limit 700 and
  the empty client do not.
* `disputeClock` in 03, replacing `svgDisputeFlow`. The HTML "Why disputes take rounds, not days."
  heading and the two sentences under it are dropped because the chart draws all three word for
  word. The "THE PROCESS BEHIND EVERY DISPUTE ROUND IN THIS PLAN" caption stays.
* Both go through `interInCharts()` (W4b's workaround, copied; delete both when css.mjs is fixed).

Gold-section checklist (gold heading -> present, how):

* Cover -> yes, `cover(..., opts)`.
* Opening note -> yes, `.co.info` box holding `p.lead` (gold page 2 draws it as a bordered box).
* 01 PROJECTION Your Projected Pre-Approval -> yes: `.bigstat` (value + "Up from ... increase"),
  `timeline`, "Where You Stand Right Now vs. Where You're Going" as a gold table.
* 02 MONTH 1 Launch -> yes: `.mquote`; Step 1 with one `.card4` per open card that has a balance
  (kv: bureau, balance, limit, utilization, pay down to, amount to pay; a card with no 10% target
  prints "-" and says why in the shared `noTargetReason` words), then the full account table
  under "Every revolving account on this file" (kept: zero-limit / no-limit tests grep its row
  shape), the total line, and "You do not have to do this all at once..." in a `.co.info` box;
  Steps 2 to 6 as `h3` + `.fh-ul`, with `h4` labels "Round 1 targets on Experian" and "Personal
  information on file"; Step 4 adds "Inquiries on your Experian file" from the file's own
  inquiries row (count + note), only when Experian shows one or more.
* 03 MONTHS 2-3 Results -> yes: `.mquote`, `disputeClock`, Month 2 text, "Month 2 Action Items"
  (the builder's own Month 2 checklist items), Month 3 text, "Round 2 targets, if still on the
  file after Round 1" (the file's negatives by name and bureau), Month 3 score projection.
* 04 MONTH 4 Final Push -> yes: `.mquote`, "Round 3 Dispute Letters" over the builder's Round 3
  list; settlement with `h4` "Your settlement script" (`.co`), offer range, `h4` "Rules for this
  negotiation" + list; child support note when the file has one.
* 05 MONTH 5 Business Milestone -> yes: "Business Credit Profile Setup" + list, "Why This Month
  Matters for Lenders" + paragraph.
* 06 MONTH 6 The Reveal -> yes: "Re-Pull All Three Bureaus", paragraph, month 1 vs month 6 gold
  table, "Your New Pre-Approval Number" + `.bigstat` with its label.
* 07 TRANSFORMATION -> yes, gold table.
* 08 CHECKLIST -> yes, `h4` per month + `ul.fh-check`.
* 09 CALL TO ACTION -> yes: paragraph; "Book your strategy call at
  <a href=BOOK_CALL_URL>apply.fundhub.ai/schedule/phonecall</a>." in a `.co.info` box; disclaimer.
* Honest CTA panel -> yes, `ctaPage(c, opts)`.

Honest-empty fixes, gold pages only (the old look keeps its bytes):

* No pre-approval figures: the old look prints "a $0 increase" (`Number(null)` is 0). Gold: "a - increase".
* Blank score cells in the 01 and 07 tables print "-".
* No state: "File your LLC online with the Secretary of State." (not "in  online"). No address: the
  "Use your address at ." bullet is left out.
* Step 3 with no Equifax negatives: "No Equifax negatives are listed on this file." (the Experian
  step's own sentence) instead of an empty list.
* A paydown table with no rows is left out (headings over nothing).

Gaps, not carried, and why:

* Month 5 and Month 6 opening quotes: the builder has none; the gold lines are gold prose, not file data.
* Gold's per-client narration ("Experian is our primary bureau...", "Why it matters: ...", "Pro tip
  from your FundHub team", "Best case deletions in Round 1", per-item Round 2 advice): Jordan prose.
* Per-bureau score projections (Month 3 "Experian: 650-665", Month 5 "Personal Score Check"): no
  per-bureau projection on the CLIENT dict (`score_targets` is never filled). The builder already
  says only "holding at or above" today's score.
* Named lenders with time-in-business and ranges (Capital One Spark, Kabbage, OnDeck, Marcus, Navy
  Federal) and "Business funding unlocks start at $5,000-$20,000...": Jordan's lenders; the file
  carries no time-in-business data.
* "On that call we will:" list and "The $19,841 number ... is a math problem": promises and prose,
  not file data.
* Transformation rows for card balances, charge-offs, address and name variations: the builder
  prints "Identity mismatches" instead; card balances are already in the 01 and 06 tables.
* Fundhub Academy callouts: never.
* Mono numbers inside prose sentences (gold `rich()`): not done. A span inside a sentence splits
  the sentences the tests grep. Mono is on table cells (W1) and card values.

Tests: `node --test src/deliverables/gold-roadmap.test.mjs` 60 tests, 60 pass, 0 skipped (all nine
sections and the gold sub-sections in order for 6 files; both charts placed for Jordan and
suppressed per spec section 6; every text run the old look prints is on the gold page, with the
exceptions above, mutation-checked; cards match the table; booking link, no fundhubbookingurl, no
client.booking_url; no em/en dash, NaN, undefined, "credit repair", "Fundhub Academy"; no blank
cell; academy leak list; old look unchanged). Roadmap-touching tests (port-parity, no-limit,
zero-limit, three-printer-wording, roadmap-honest-prose, gold-roadmap): 147/147.
Full `node --test src/deliverables/*.test.mjs`: 430 tests, 426 pass, 4 fail, 0 skipped. None is
the roadmap: 2 in gold-credit-analysis.test.mjs (W3, still claimed), 2 in render.test.mjs
("lender_match has 4" / "27 in total", W4b's fifth section, see W4b). `npm run lint` clean.
Visual: Jordan, repair, academy and empty tiles in `$SCRATCH/W5-png*`, read next to `goldpng`
p01 to p15.

W5 fix pass (2026-09-17, after the independent check). 13 checker gaps read against the code
and the rendered pages. 10 fixed in `roadmap.mjs` (gold branch only), 3 rejected. The old look is
byte-identical (all five fixtures, the empty client and `null`, with no opts, `{}` and a non-gold
look, compared against a snapshot taken before the edit), and `port-parity.test.mjs` passes.
This pass supersedes two lines above: the timeline no longer draws the `EX 650-665` / `EX 665-680`
notes, and its range is no longer `PROJECTED_MEDIAN`.
Fixed: (1) no month note on any gold page, chart or strip: the EX figures were the Jordan
Sample's, on no file (DIAGRAM_SPEC 4.11). (2) Month-6 score targets come from the file's own
`score_targets`, same field and words as the 01 table ("Set at your next pull" when blank); the
timeline draws the file's stated range and is suppressed with none (spec section 6), so repair
no longer draws one; Jordan still does (636 to 680-710). (3) One row per real account: a card
reported by three bureaus is one card (BUREAU lists all three), one table row, one checklist line,
counted once in the paydown total (repair $6,160, not $16,230; academy $3,350, not $10,050) and in
"N cards carrying high balances". (4) Business pre-approval "before" is "-" (no file carries
one); lenders open today read "-" when the file has only the flat `lenders` list (F45); a split
file prints its real count (no-limit 5). (8) An Equifax item with no `why` prints the file's type,
no dangling " - "; engine codes print as words ("30 days late", "Collection or charge-off").
(9) "Up from X today - a Y increase" and "climbs toward X" only when both figures are on the file
and the projection is higher; "You qualify for a personal loan right now ... estimate: X." only
when the file has a pre-approval above $0; the rest of Step 6 always prints. (10) Negative targets
agree: a bureau with items aims at "reduced" and so does the total; a bureau with none aims at 0;
a bureau with no row on the file reads "-", not 0. (11) LLC Formed / Business Credit Profile read
the `business` record: none on the file, "-"; `hasEntity` false, "No" / "None"; true, "Yes" / "-".
(12) An empty file's Step 1 says the shared "There are no open revolving cards on this file to
pay down." instead of "Lenders see your utilization". (13) The "nothing on this file to dispute or
pay down" line is left out when an open card carries a balance (no-limit, academy, zero-limit).
Rejected: (5) Month 5 and Month 6 quotes are new copy, not in the builder ("words unchanged", as
W4a and W4b ruled), and the 06 line promises funding. (6) The gold 09 "On that call we will:"
list, "$19,841 ... is not a wish" and "Let's go get it." are new copy and promises; turning the
holding-you-back sentence into a heading and list would split a sentence with markup and change
its words (the sentence is built in `derive.mjs`, not this file). (7) The paydown table cannot go:
`zero-limit.test.mjs:186-190` and the no-limit MIXED test grep the hosted gold roadmap for that
table's row shape (`SECURED CARD</td><td>$900</td>...`), and those files are not W5's. It no longer
repeats a card per bureau, and for Jordan it also carries the closed and $0 cards that get no card.
Partly: for the empty client the lender and business cells stay "0 / 0" and "No / None", because
`emptyBlackReportClient()` itself carries `lenders_now: []` and `business.hasEntity: false`, the
same values the mapper writes for a real client with no match and no company. Jordan's "Experian
1 + Equifax 7 = 7 negatives" is the file's own bureau-row counts, not the roadmap's arithmetic.
The empty client's big number stays a lone "-" (the house mark for an unknown dollar); only the
holed sentence under it is gone.
New in `roadmap.mjs`: `export function oneRowPerAccount(rows)` and a private `plainRating()`,
twins of W4a's private helpers in `funding-snapshot.mjs`; both belong in `derive.mjs` once that
file is free (see Blockers).
Tests: `gold-roadmap.test.mjs` 70 tests, 70 pass, 0 skipped: one test per fixed gap (gaps 1, 2,
3, 4, 8, 9, 10, 11, 12, 13, plus the stated-range timeline test), with the words test now built
from the one-row-per-account file and each dropped statement listed and tested; mutation-checked
(undoing the dedupe, the EX notes, the lender dash, the qualify guard, the pay-down guard, or
dropping a gold sentence each fails a test).
Full `node --test src/deliverables/*.test.mjs`: 545 tests, 543 pass, 2 fail, 0 skipped. The 2 are
render.test.mjs "lender_match has 4" / "27 in total" (W4b's fifth section, already on the board).
`npm run lint` clean. No em or en dash in any page body.
Visual: all six fixtures rendered and shot at 900px, `$SCRATCH/W5-fix-png/` (Jordan) and
`$SCRATCH/W5-fix-png/<fixture>/`.

### W3 — Financial Profile Assessment (credit analysis)

Files: `src/deliverables/credit-analysis.mjs`, `src/deliverables/gold-credit-analysis.test.mjs` (new).
Nothing else touched. Not committed (the main session commits).

Signature: `buildCreditAnalysis(client, opts = {})`. `const gold = isGold(opts)`. No opts (or any
other look) prints the old markup byte for byte: checked against a saved copy of the old output
for all six clients (Jordan, repair, academy, no-limit, zero-limit, empty), and `port-parity.test.mjs`
passes. Gold passes `opts` to `cover()`, `ctaPage()` and every `table()`.

Chart placements (gold only; each replaces an old drawing):

| chart | where | replaces | drawn when |
|---|---|---|---|
| `journeyMap` | after the opening, before 01 | `svgTwoTrack` + the two HTML lines it now draws | two tracks are true: a clean bureau, outcome not REPAIR_ONLY, money today not $0, and at least one negative (else suppressed, the HTML lines print as before) |
| `scoreLineup` | 02, above the four cards | the `.scorebox` row, "LENDERS PICK THE MIDDLE SCORE", and the three lines under it | exactly three scores |
| `utilizationTank` | 03, after the table | `svgPaydownBars` + the hero sentence + "Get it under the dotted line..." | the hero card (worst with a known limit) is marked CRITICAL, payAmount = `paydownAmt(row)`, target = `targetBal(row)`, and the chart's own headline matches the table's words |
| `utilizationBars` | 03, after the tank | the `utilBar` rows | at least one card with a known pct and target; unknown-limit cards never passed; "Overall revolving" only when `utilTotalsKnown` and more than one open card has a known limit |
| `severityScale` | 05, after the table | `svgSeverity` + "Your N negative items are not equally bad." | 3+ negatives, each with a table number; rail order = the report's own order (last item left, item 1 right, as the old rail), strict a/b |
| `moneyChain` | 08, after the three cards | the HTML `.flowrow` + the "How ..." and "You are not paying ..." lines | both pre-approvals known and projected > current |

Blocks: opening `<p class="lead">`; bureau / revolving / AU / inquiry / personal-data status cells as
gold chips (`chip()`, template weights: DIRTY/CRITICAL solid, HIGH/MEDIUM mid, rest line; an empty
status prints `-`); every `.callout.bar` (primary bureau, spread, TARGET, URGENT) as `.co`; the four
score cards and the three 08 pre-approval cards as `.mrow/.mc`; each negative item as a `.co` panel
with an `<h4>` and a paragraph (gold p. 7-8); the inquiries IMPORTANT note as `.co.info`; the
after-repair paragraph as `.co.up` and "Ready to move?" as `.co.info` (gold p. 11).

Words: every sentence the old look prints still prints in gold, in a paragraph or drawn inside a
chart (the test strips the replaced drawings from the old output and checks every remaining
sentence against the gold text, all six clients). Exceptions, all deliberate:
* "Book your strategy call at <client.booking_url>." prints `<a href="BOOK_CALL_URL">apply.fundhub.ai/schedule/phonecall</a>`.
* Honest empty, gold only (these only differ on a file missing the figure): unknown outcome, median,
  spread, Experian score and pre-approval delta print `-` (the old look printed a blank, or `+$0` /
  "$0 more funding" from `Number(null)`); a bureau the file does not list is no longer "STRONG / Your
  cleanest bureau on this file." (card verdict `-`), and the 01 callout drops "On this file it is
  clean." unless the file says CLEAN.
* `scoreLineup` leaves out "Your best and worst are 0 points apart. Closing that gap is the job."
  when the spread is 0 (W2's rule; no fixture has a 0 spread).
* Rail and bar labels shorten long creditor names to a whole word ("STUDENT LOAN MARKETI", "American
  Express Blue") so labels do not collide; the full names stay in the tables.
* Line-up notes (DIAGRAM_SPEC 4.1): the negative count when it cannot read backwards; else
  "Negative items on it" / "Nothing negative on it"; else "From your tri-merge report". Jordan gets
  the middle one (Experian 630 has 1 item, Equifax 636 has 7).

Workaround, same as W4a/W4b: `interInCharts()` in `credit-analysis.mjs` adds an inline Inter style
to the charts' Inter text because `css.mjs` `svg text { font-family: mono }` overrides it. Delete
with theirs once `css.mjs` is fixed.

Gold-section checklist (gold heading -> present?, how):
* Cover -> yes, W1 gold cover.
* Opening -> yes, the builder's paragraph as `.lead`.
* Journey map -> yes for Jordan; suppressed on the other fixtures (see gaps).
* 01 BUREAUS Bureau Health Summary -> yes, gold table with chips + `.co` primary-bureau callout.
* 02 SCORES Score Breakdown by Bureau -> yes, `scoreLineup` + note + four `.mc` cards + `.co` spread callout.
* 03 UTILIZATION -> yes, gold table, `utilizationTank`, note, `utilizationBars`, dashed-line note,
  the utilization paragraph, `.co` TARGET callout.
* 04 AU ACCOUNTS -> yes, gold table with NEUTRAL chip + paragraph (or "No authorized user accounts...").
* 05 NEGATIVES -> yes, gold table, `severityScale`, "Start with ...", note, each item one by one as a `.co` panel.
* 06 INQUIRIES -> yes, `.co.info` IMPORTANT, gold table with priority chips, paragraph.
* 07 PERSONAL DATA -> yes, gold table with priority chips, `.co` URGENT callout.
* 08 BOTTOM LINE -> yes, three `.mc` pre-approval cards, `moneyChain` + note, stage table,
  `.co.up` after-repair, `.co.info` Ready to move with the real link.
* Honest CTA panel -> yes, W1 `ctaPage(c, opts)`.

Gaps (gold has it, not carried honestly):
1. Journey map on a file that is not two-track (repair-only, no clean bureau, $0 today): the builder
   prints "Your plan runs on two tracks at the same time.", "You do not wait for repair to finish
   before you get money. Both tracks run at the same time." and "BOTH TRACKS ARE ALREADY IN THIS
   PLAN" for every file. The chart's one-track "Your plan starts with repair." would contradict those
   words on the same screen, and rewording them is not W3's call. Map suppressed there; see Blockers.
2. Journey map on a file with no negatives (academy, no-limit, zero-limit): three dispute rounds
   would be invented. Suppressed.
3. Tank on a card that is not CRITICAL (academy's worst card is 19%): the chart itself says "A nearly
   full card tells every lender 'I am maxed out.'" Suppressed; the builder's sentences print instead.
4. Gold's closing paragraph ("Jordan, you have the foundation ... $50,000+ ... Fundhub Academy") and
   "Let me walk you through each one of these ...": Jordan-sample prose with invented figures and the
   Academy plug; the builder dropped it (F53). Not carried.
5. Gold stage-table detail ("+20 to +40 pts on Experian", an inquiry-cluster Step 3 row,
   "$10K-$250K+"), the AU cell's "Cannot help funding, not hurting score", the "ugly truth"
   utilization paragraph, the "60%" penalty and the spelled-out delta: none of it is on the CLIENT
   dict. The builder's own rows and sentences print.
6. Notes (`.note`) print upper case as the builder writes them; the gold prints them as lower-case
   mono lines. A `text-transform` call for W1 if wanted; same in all four documents.
7. Severity order is the report's own table order, as asked. On the repair fixture that order is
   grouped by bureau, so the rail says "Capital One hurts the most", the same claim the old rail made.

Tests: `src/deliverables/gold-credit-analysis.test.mjs`, 50 tests, 50 pass, 0 skipped: section order
(6 clients), chart placed/suppressed matrix (6 clients) + section placement for Jordan, no old
drawings left, tank/bars/rail/line-up/chain numbers, chain suppressed when projected <= current,
no sentence lost (6 clients, with the honest-empty list for the empty client), link to
BOOK_CALL_URL and no `fundhubbookingurl`, no em/en dash / NaN / undefined / banned phrase, academy
leak list, no Academy plug, honest empty, default look unchanged.
`node --test src/deliverables/*.test.mjs`: 430 tests, 428 pass, 2 fail, 0 skipped. Both failures are
`render.test.mjs` "lender_match has 4" / "27 in total" (W4b's fifth section, already on the board).
`npm run lint` clean.
Visual check: Jordan, repair, academy, no-limit and empty rendered in Chromium at 900px next to the
gold PNGs (tiles in `$SCRATCH/W3-png*`). Jordan reads as the gold pack page for page.

**W3 fix pass (2026-09-17).** Same two files, gold only; the default look is still byte-identical
for all six clients (checked against a saved copy) and `port-parity.test.mjs` passes. All 14 checker
gaps were real; all 14 fixed:
1-2. One card on three bureaus is now one card (`distinctCards()`, keyed on creditor + balance +
   limit, the mapper's own F43 fallback key). The bars, the money chain and the Step 1 rows take the
   top two distinct cards; the Overall row counts distinct measured cards. Academy: Amex 19% and
   Chase 18%, "How $3,200 becomes $22,150", "$2,300 + $900". Repair: Synchrony and Credit One.
3. After-repair panel: "moves from X toward 700+" prints only with a known Experian under 700 and
   something for "full repair" to mean; "At that level ... $40,000+" only with it and no known
   pre-approval at or above $40,000. The last two sentences always print. Jordan and repair keep all
   three; academy, no-limit, zero-limit and empty keep the last two. The words are unchanged.
   "SBA 7(a)" and "$40,000+" are the builder's standing words (fundhub_gen.py), not from any file.
4. Money chain also needs a card with a paydown above $0 to its 10% target; no "see table" chain.
   No-limit and zero-limit now have no chain.
5. Tank, then its source note, then the bars (gold p. 4-5). "A high balance ..." now opens the
   utilization paragraph instead of sitting between the tank and its note.
6. With the rail drawn, "Start with X on Y." is left out: the rail draws "Start on the right. X
   hurts the most. Fix it first." Without a rail it prints.
7. Captions follow their charts: the dashed-line note only with bars, the dot-number note only with
   the rail, "How ... more funding." and "EVERY FIGURE COMES FROM ..." only with the chain.
8. An empty bureaus / cards / inquiries / personal-data list prints "None on file." (W4a's line), not
   headings over nothing; an empty negatives list drops its table (its own "No derogatory items ..."
   line follows). An inquiry total with no counts prints "-", not 0. "None on file." is the one
   phrase added, the same one the funding snapshot uses.
9. The rail is drawn only when the report ranks its own items (every item says why it matters, as
   Jordan's do). The mapper numbers items in bureau order with no reason, so repair gets no rail and
   no longer calls a 30-day late the worst item; its status codes are no longer drawn as notes.
10. The rail is left out past 10 items (`RAIL_MAX`), measured in Chromium at 900px: 10 draws clear,
    11 overlaps at the left end. The page copy then says the count.
11. The lead's "You qualify for funding today" prints only with a known pre-approval above $0 and an
    outcome that is not REPAIR_ONLY. The two-track lines and "BOTH TRACKS ARE ALREADY IN THIS PLAN"
    print only with money today AND items to dispute. With those gone, repair (REPAIR_ONLY, $0) now
    gets W2's one-track map ("Your plan starts with repair."), as DIAGRAM_SPEC 4.5 asks. This answers
    W3's open question below without rewording anything.
12. Step 2 stage rows print "-" in SCORE IMPACT and FUNDING IMPACT; the file states neither. The type
    and the why are still in the 05 table.
13. URGENT callout: a full stop after the issue when it has none.
14. Projected card counts distinct open cards with a balance, and of those the ones with a paydown to
    target when any have one (Jordan 2, academy 3, repair 3), through the shared `payDownCardsLine()`.
    "That alone moves your pre-approval." is left off with nothing to pay or projected at or below
    current (repair $0 to $0, empty).
Tests: `gold-credit-analysis.test.mjs` 65 tests, 65 pass, 0 skipped (15 new, one per gap; the
sentence test now lists every deliberate drop per client and fails if a listed change goes stale).
`node --test src/deliverables/*.test.mjs`: 560 tests, 558 pass, 2 fail, 0 skipped. The 2 are the
same `render.test.mjs` "lender_match has 4" / "27 in total" (W4b's fifth section). `npm run lint`
clean. Visual check: Jordan, repair, academy, no-limit, empty at 900px in `$SCRATCH/W3-fix-png-*`.

### W1 — integration pass after W3–W5 (main session, done)

Blockers the builders raised for W1, all closed:

* Chart text forced to mono: `svg text` is now `svg text:not([font-family])`, so the gold charts
  keep their own Inter / mono. The four `interInChart(s)` workarounds were deleted from
  credit-analysis, funding-snapshot, lender-list and roadmap.
* Wide hyphens: `tabular-nums` moved off `body` onto number cells and stat values only.
* Phone charts: a chart runs edge to edge on a phone and shows the whole picture (vector, so a
  pinch-zoom is sharp). A sideways-scrolling chart was tried and cut its own sentences off.
  The page never scrolls sideways at 390px (measured on all four).
* Em dashes in the stylesheet source: gone.
* Grey caption lines: lower case, as gold prints them.
* Tables: the spectrum top border is gone (it doubled the section rule once a table became a
  block on a phone; the gold PDF shows none).
* Duplicate helpers: `plainRating` (was twice) now lives once in `derive.mjs`. New
  `paydownCards(rows)` in `derive.mjs` is the one list both the credit analysis and the funding
  snapshot count, so "Pay down your N open revolving cards" reads 2 on both (it read 2 and 5).
  The two `oneRowPerAccount` helpers are different rules on purpose and stay apart.

Tests changed by the main session:

* `render.test.mjs`: section count 27 -> 28, lender_match 4 -> 5 (the gold pack's count; the
  owner listed five Shortlist sections). Same assertion, new number.
* `gold-funding-snapshot.test.mjs` (written this session by W4a): the waterfall's card count is
  2, not 5, to match the credit analysis.

Proof: `node --test src/deliverables/*.test.mjs` 560/560, 0 skipped. `npm run lint` clean.
`npx tsc --noEmit` clean. Full `npm test`: 10426 pass, 8 fail, 4 skipped. The 8 are in staff
screens and route registries (crm-html, cross-org-guard, read-endpoints-org-scope, journeys
runner, pulse registry); none imports a file this batch touched. Final critic: 28/28 sections,
11/11 charts, no dead booking URL on any of 24 pages, the phone-call link on all 24.

## Blockers and open questions

* **W4b, for W1 / the main session: `css.mjs` draws every gold chart's Inter text in mono.**
  `src/deliverables/css.mjs` line ~192 has `svg text { font-family: ${MONO}; }`. A stylesheet
  rule beats an SVG `font-family` attribute, so the lender names in the unlock ladder and the
  headlines / rule lines in the application order chart (and every other gold chart's Inter
  text) render in JetBrains Mono. The gold template has no such rule. Suggested one-line fix:
  `svg text:not([font-family]) { ... }` (gold charts always set the attribute). W4b works
  around it inside `lender-list.mjs` (`interInCharts()`, adds an inline style); delete that
  helper once the CSS is fixed. Affects W3, W4a, W5 charts too.
* **W4a:** same workaround in `funding-snapshot.mjs` (`interInChart()`), delete with W4b's.
  FYI for W1: `css.mjs` comments carry em dashes (e.g. `/* callouts — the gold .co ...`). They
  sit inside `<style>`, so a reader never sees them, but a dash gate that greps the raw page HTML
  (not the shown text) would trip on every document.
* **W4a fix pass, for W1 / W2 (not fixable in a builder): chart labels are unreadable on a phone.**
  At 390px every gold chart's 508-wide viewBox draws at 358px, so the waterfall's 7-8pt labels
  ("TODAY", "UTILIZATION FIX", the sublabels) come out near 5px. Affects all eleven charts. Needs a
  shared fix in `css.mjs` (a phone rule) or `gold-charts.mjs` (a phone layout / larger label
  size). The table half of the same finding is fixed in `funding-snapshot.mjs`.

* **W5, for W1 / the main session: every hyphen in Inter prints wide.** `css.mjs` sets
  `font-variant-numeric: tabular-nums` on `body`, and Inter's tabular set includes the hyphen
  (measured in Chromium at 40px / 800: 25.8px tabular vs 18.9px normal). So "Pre-Approval",
  "Month 1 - Launch" and the cover's "6-Month" print with gaps on every gold page. The gold
  template sets no tabular-nums. Suggested fix: move `tabular-nums` from `body` to the number
  elements (`td.m`, `span.m`, `.bs-val`, `.mval`, `.kv .v`). Not worked around in `roadmap.mjs`.

* **W3, open question for the main session / Chris (words, not look): the journey map on a file that
  is not two-track.** The credit analysis prints "Your plan runs on two tracks at the same time.",
  "You do not wait for repair to finish before you get money. Both tracks run at the same time." and
  "YOUR OUTCOME: ... BOTH TRACKS ARE ALREADY IN THIS PLAN" for every file, including REPAIR_ONLY with
  $0 today (repair fixture) and files with no negatives (academy). W2's `journeyMap` draws a one-track
  "Your plan starts with repair." map for the first kind, which would contradict those sentences on
  the same screen. W3 keeps the words and draws the map only when it is two-track. To show the
  one-track map, those three sentences need a repair-first version for those files.
  **Answered in the W3 fix pass:** the false sentences are left out on those files, and repair
  gets the one-track map. No rewording needed.

* **W5 fix pass, for the main session: two helpers now live twice.** `oneRowPerAccount()` (one
  row per real account, F43) and `plainRating()` (engine codes as words) are in
  `funding-snapshot.mjs` (W4a, private) and `roadmap.mjs` (W5, `oneRowPerAccount` exported for
  its test). Same rule, same words. Move one copy into `derive.mjs` and import it in both once
  that file is free. Not done here: `derive.mjs` is not W5's file.
