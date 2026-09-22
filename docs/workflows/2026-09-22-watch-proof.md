# /watch proof + /thank-you Sorting Hat — board (2026-09-22)

Owner ask (Chris, 2026-09-22): more proof on https://apply.fundhub.ai/watch to lift
high-intent clicks (today about 14% click to book), 3 testimonials, page not too
long; line the thank-you page up with the Sorting Hat offer. No questions, ship it.

## Tasks

| Unit | Owner | Status |
|---|---|---|
| Build `public/funnel/watch-proof.js` + `thankyou-sort.js`, crops, manifest, push-script dedupe, tests | this session (branch `feat/watch-proof`) | done |
| Merge `feat/watch-proof` to main, `npm run ship` | shipping step | pending |
| `node scripts/cf-push-custom-html.mjs push --only=apply-watch` then `--only=apply-thank-you` | shipping step, after ship | pending |
| Live proof with `NOINJECT=1 node docs/workflows/watch-proof-2026-09-22-evidence/_walk.mjs …` | shipping step, after push | pending |

## Change manifest

- `public/funnel/watch-proof.js` (new) — /watch section under the first Get Started:
  "Real approvals. Real screenshots." (6 win cards: $74,000, $54,500, $50,000 KeyBank,
  $50,000 Chase, $41,000, $25,000 Highland), "What clients texted us" (s34-q1, s21-b,
  s23-b), "One call. Three roads. Nobody gets turned away." + second Get Started → /apply.
- `public/funnel/thankyou-sort.js` (new) — booking check (T14-01, moved from the
  fragment), "Pick your call time" → /funding-book-call for visitors with no fresh
  booking, "What the call decides", step 03 "You leave knowing your road",
  "Real approvals, real texts" before the FAQ.
- `public/funnel/proof/s34-q1.jpg`, `s21-b.jpg`, `s23-b.jpg` (new) — byte copies of the deck crops.
- `clickfunnels-fragments/01-vsl.html` — loads watch-proof.js after the beacon.
- `clickfunnels-fragments/05-thank-you.html` — inline T14-01 block removed (now in
  thankyou-sort.js), step 03 wording, loads thankyou-sort.js.
- `clickfunnels-fragments/tracking-manifest.mjs` — `WATCH_PROOF_SRC`, `THANKYOU_SORT_SRC`,
  `extraFooterScripts` on apply-watch and apply-thank-you, `trackingFooterScripts`
  (moved here; skips any src already on the page).
- `scripts/cf-push-custom-html.mjs` — builder-page push reads the public page too,
  because GET /pages/{id} returns no head_code/footer_code (that blind spot is how the
  beacon got loaded 3 times on /watch); dry-run lists `would_append_footer_srcs`;
  mode now reads `builder_page_tracking_inject_only`.
- `src/ads/funnel-proof-scripts.test.mjs` (new, 18 tests).
- `docs/journeys/sorting-hat-pages-flow.md` (new), `docs/journeys/CHANGELOG.md`.
- Routes: none. Env vars: none. Database: none.
- Not touched: /apply (25068989), /funding-book-call (25062844), `clickfunnels-fragments/slo/*`.

## Proof (before ship: live pages with this branch's script injected by Playwright)

| Check | /watch 390 | /watch 1280 | /thank-you 390 | /thank-you 1280 |
|---|---|---|---|---|
| Page height before → after | 1166 → 1967 (+801) | 1564 → 2165 (+601) | not booked 3070 → 2461; booked 3176 → 3733 (+557) | booked 2444 → 3171 (+727) |
| Budget (plan) | ≤ 1992 ✓ | ≤ 2307 ✓ | none set | none set |
| Sideways scroll | none (390) | none | none | none |
| Proof images load | 9/9 | 9/9 | 6/6 | 6/6 |
| Buttons | 2 × Get Started → /apply | same | Pick your call time → /funding-book-call (not booked) | none added (booked) |
| Beacon tags | 3 (unchanged) | 3 | — | — |
| Script errors | 0 | 0 | 0 | 0 |

Booking states walked on /thank-you: no record, live-writer record (capturedAt only),
slot clicked with empty form — booked only for the real record.

Dry runs (read-only against ClickFunnels): `apply-watch` → mode
`builder_page_tracking_inject_only`, would append only `watch-proof.js`;
`apply-thank-you` → same mode, only `thankyou-sort.js`.

Suite: 10909 tests, 11 fail, 4 skipped on this branch; main at a21b9c4c has 16 fail —
every branch failure also fails on main. Lint clean. `tsc --noEmit` clean.

Marked shots (kept on this Mac; evidence folders are gitignored by repo policy): `docs/workflows/watch-proof-2026-09-22-evidence/*-marked.png`, made by `_walk.mjs` + `_mark.py` in the same folder.

## Decisions made while building (no questions, per owner)

- Approvals are proof-card template `win` cards (owner law), so the amount sits above
  the screenshot, not under it.
- Desktop shows the six approvals in one row, not the planned 3x2 grid: measured with
  the 3x2 grid the page is 2439px at 1280 wide, over the 2307px ceiling. One row: 2165px.
  Tablets (700–999px) do get the 3x2 grid.
- Phone adds about 800px, not the planned ~520: two template-card swipe rows plus the
  closing block. Still under one phone screen and under the 1992px ceiling.
- The booking check accepts `capturedAt` as well as `submittedAt`, because the live
  /funding-book-call page still runs the older writer. With `submittedAt` only, every
  real booker would have been told to pick a call time.

## Left undone

- Haynes' 1–4 minute due-diligence video: none exists (v4 script runs 9–10 minutes).
- No video testimonials: none found for the funding call. Colin's video is for the $297 Roadmap.

## Leftover cards (not worked)

- `src/ads/utm-funnel-fragments.test.mjs` "$297 diagnostic pages load the UTM script"
  fails on main too: `clickfunnels-fragments/slo/slo-03-thank-you.html` does not load
  fh-attribution.js. Owned by the /roadmap session.
- Live /funding-book-call still runs the older booking writer (`capturedAt` only, writes
  on slot click); the repo's `04a-book-top.html` fix has not reached the live page.
