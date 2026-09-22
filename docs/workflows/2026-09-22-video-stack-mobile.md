# On a phone the video testimonials stack — 2026-09-22

Owner, 2026-09-22: **"also on mobile the video testimonials should stack."**

## What was wrong

On `/watch` and `/roadmap`, the three `[ VIDEO TESTIMONIAL n ]` boxes sat three
across at every screen width. On a phone that left each one about **106px wide
and 188px tall** — too small to be a video of a person.

Two other workflows landed first and made these cards bigger, but only on a wide
screen: `fix/roadmap-vslot` (`acc66901`) and `fix/watch-card-sizes` (`bd9e62f0`).
Neither added a phone breakpoint, so a phone still showed three slivers.

## The change

One phone breakpoint per page. Both are additive — the desktop sizes the two
branches above just landed are untouched.

`clickfunnels-fragments/slo/slo-01-sales.html`

```css
@media(max-width:699px){.fh-b .proofgrid{grid-template-columns:1fr;gap:16px;justify-items:center}
.fh-b .proofgrid .vslot{width:100%;max-width:380px}}
```

`public/funnel/watch-proof.js` (in `PAGE_CSS`, after the `min-width:700px` block)

```css
@media(max-width:699px){
#fh-watch-proof .fhx-vgrid{display:block}
#fh-watch-proof .fhx-vgrid>.fhx-vslot{width:100%;max-width:380px;margin:0 auto}
#fh-watch-proof .fhx-vgrid>.fhx-vslot+.fhx-vslot{margin-top:16px}
}
```

Three notes on why it is written this way:

* **699px** is the exact inverse of the `/watch` block's existing
  `@media(min-width:700px)`, so the two pages break at the same width.
* `display:block`, not `flex-direction:column`, because the `/watch` slots carry
  `flex:1 1 0`; in a column that basis is the *height*, and it would collapse
  them.
* The **380px cap** only bites between about 430px and 699px, where a
  full-width 9:16 card would otherwise run past 950px tall. Every phone is
  narrower than the cap, so a phone still fills the column.

The shared `.fh-b .vslot` / `#fh-watch-proof .fhx-vslot` base rules are **not**
touched. `src/ads/funnel-proof-scripts.test.mjs` pins those two bodies equal and
its `cssBody()` helper takes the first `selector{` match, so no selector added
here may spell them. None does.

## Measured

My own headless Chromium (the repo's `playwright` dependency, never the shared
MCP browser). Android Chrome UA at 390x844, 360x800 and 600x900; desktop Chrome
UA at 1280x900. `_proof.mjs` reads each slot's real position in the browser, so
a red box can never point at empty space.

| page | width | before | after |
|---|---|---|---|
| /roadmap | 390 | 3 per row, 106x188 | **1 per row, 342x608** |
| /roadmap | 360 | 3 per row, 96x171 | **1 per row, 312x555** |
| /roadmap | 600 | 3 per row | **1 per row, 380x676** |
| /roadmap | 1280 | 3 per row, 168.8x300 | 3 per row, 293.3x521.5 (unchanged) |
| /watch | 390 | 3 per row, 106x188 | **1 per row, 360x640** |
| /watch | 360 | 3 per row, 96x171 | **1 per row, 330x587** |
| /watch | 600 | 3 per row | **1 per row, 380x676** |
| /watch | 1280 | 3 per row, 169x300 | 3 per row, 300x533 (unchanged) |

No horizontal page scroll at any width, before or after.

Shots live in `docs/workflows/2026-09-22-video-stack-mobile-evidence/` (gitignored by
design — boards stay tracked, screenshot dumps stay on disk).

`shots-before-live/` is the live site before the change. `shots-after/` is the
working tree rendered locally — `/watch`'s block rides in on a footer script, so
a local host page stands in for the ClickFunnels builder page. Both sets carry
CLAUDE.md section 8 red boxes and a numbered legend.

## Not shipped from this session

The commit is local and merged to `main`. The change is **not on the live site
yet**: `/roadmap` needs the ClickFunnels Custom HTML push and `/watch` needs the
Netlify deploy that serves `public/funnel/watch-proof.js`. This workflow was
told not to read `.env`, and the ClickFunnels push needs `CLICKFUNNELS_API_KEY`
from it.

## Rerun

```
SRC=live node _proof.mjs <outdir>   # the live pages
SRC=tree node _proof.mjs <outdir>   # the working tree
python3 _apply-marks.py shots-after # burn the red boxes + legend
```
