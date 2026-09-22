# /watch organize — board (2026-09-22)

Owner ask (Chris, 2026-09-22): stop touching /roadmap. On https://apply.fundhub.ai/watch:
organize it; no "what clients texted us" (vertical video placeholders instead); the
phone side margins as thin as /roadmap's; the approvals row slides right as you
scroll down, with 10 more approvals; the headline font the same as /roadmap.

## Tasks

| Unit | Owner | Status |
|---|---|---|
| `public/funnel/watch-proof.js`, `public/funnel/thankyou-sort.js`, tests, flow doc, proof shots | this session (branch `feat/watch-organize`) | done |
| Ship `public/funnel/*.js` (`npm run ship` from main) | shipping step, after merge | pending |

No ClickFunnels push is needed: both pages already load these files from
fundhub.ai, and fundhub.ai serves them `max-age=0, must-revalidate`, so a ship is
live on the next page load. The footer tags and `tracking-manifest.mjs` are unchanged.

## Change manifest

- `public/funnel/watch-proof.js` — one column under the first Get Started:
  1. "Real approvals. Real screenshots." — all 16 cards in `clickfunnels-fragments/slo/client-wins/deck.json`
     (was 6), deck order, src/width/height/alt from the deck. The row slides right as
     the page scrolls down: one `translate3d` per animation frame, passive scroll listener
     on the document (the live page scrolls inside `<body>`). It moves while the whole
     row is on screen (bottom edge 90% down → top edge 10% down). Nothing pins or holds
     the page. Reduced motion: a plain swipe row. Off-screen images switch to eager
     loading when the row is within two screens.
  2. "From our clients" — 3 vertical video placeholders `[ VIDEO TESTIMONIAL 1–3 ]`,
     CSS copied from `/roadmap`'s `.fh-b .vslot` (a test holds them equal).
  3. "One call. Three roads. Nobody gets turned away." + second Get Started → /apply.
  - Page alignment, only where this script runs (`html.fhw`): the ClickFunnels
    section/row/column boxes around `.fh-root` lose their side padding; the H1 takes the
    `/roadmap` H1 rule word for word; the dollar amounts use the H1's font (no mono, no
    underline). H1 words unchanged.
  - "What clients texted us" removed.
- `public/funnel/thankyou-sort.js` — the three client-text cards removed; the row is the
  three approvals, kicker "Real approvals, real screenshots".
- `src/ads/funnel-proof-scripts.test.mjs` — 25 → 38 tests (the 3 client-text tests replaced): all 16 deck cards on /watch;
  no client texts on either page; block order and headings; video slot equals /roadmap's;
  carousel math (`fhxShift`) and no pinning; H1 rule equals /roadmap's; gutter fix scoped.
- `docs/journeys/sorting-hat-pages-flow.md`, `docs/journeys/CHANGELOG.md`.
- `docs/workflows/watch-organize-2026-09-22-evidence/` — `_walk.mjs`, `_mark.py`, 7 marked shots.
- Not touched: /roadmap and everything under `clickfunnels-fragments/slo/` (read only),
  `clickfunnels-fragments/tracking-manifest.mjs`, the ClickFunnels pages. Routes, env, database: none.
- `public/funnel/proof/*.jpg` (the client-text crops) stay on disk, now unused by these pages.

## Proof (live pages, this branch's scripts swapped in by Playwright; own headless Chromium)

| Check | /watch 390 (Android Chrome UA) | /watch 1280 (desktop Chrome UA) |
|---|---|---|
| Side gutters (headline, video, buttons, new blocks) | 54/54 → **24/24**; /roadmap 24/24 | column unchanged: 852 wide at x=214 |
| H1 | Inter 700 30px, ls −1.35px, mono underlined amounts → **Inter 700 28px, ls −1.26px, lh 28.56px**, amounts Inter 700, no underline; /roadmap identical | Inter 700 50px + mono → **Inter 700 46px, ls −2.07px, lh 46.92px**; /roadmap identical |
| Page height | 1949 → 1968 | 2107 → 2483 |
| Sideways page scroll | none (scrollWidth 390) | none (1280) |
| Approvals | 16 cards, $20,000 … $500,000, 16/16 images load | 16/16 |
| Row slide (track 2598 / 3138 px, row 390 / 852 px) | scroll 223 → 0, 334 → −552, 445 → −1104, 556 → −1656, 667 → −2207, then rests at −2208 | 483 → 0, 600 → −571, 717 → −1144, 833 → −1713, 950 → −2286 |
| Real mouse-wheel scroll | page moves exactly the wheel amount each step (never held); row follows | same |
| Reduced motion | swipe row (`overflow-x:auto`), no transform | — |
| "texted" anywhere on the page | no | no |
| Script errors | 0 | 0 |

| /thank-you | 390 | 1280 |
|---|---|---|
| Proof row | 6 cards (3 wins + 3 texts) → 3 wins, kicker "Real approvals, real screenshots" | same |
| Images | 3/3 | 3/3 |
| Page height | 2443 → 2413 | 2414 → 2153 |
| Script errors / sideways scroll | 0 / none | 0 / none |

Marked shots: `watch-organize-2026-09-22-evidence/gutters-390-marked.png`,
`h1-1280-marked.png`, `carousel-390-marked.png`, `column-1280-marked.png`,
`column-390-marked.png`, `thankyou-390-marked.png`, `thankyou-1280-marked.png`.

Gates: `npm run lint` clean; `node --test src/ads/*.test.mjs` 120/120.
