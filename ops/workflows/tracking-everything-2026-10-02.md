# Tracking everything — wiring fixes, page inventory, database events, Meta (2026-10-02)

Owner ask: four phases, approval gate before any deploy. Source audit: `docs/audits/wiring-audit-2026-10-02.md`.
Nothing is pushed to ClickFunnels or deployed until Chris says "approved". Agents do not commit; this session commits at the end of each phase.

## Tasks

| # | Unit | Owner | Status |
|---|---|---|---|
| P1-6 | Commit `marketing/landing-pages/slo/` | this session | done — `2019c1b5` (+ baseline `fa03308c` for the rest of landing-pages) |
| P1-A | Fixes 1, 4, 5 in `slo/slo-01-sales.html` (lock step 3, hide $15 extras, address warning) + green marked draft | agent | done — 23/23 browser checks; draft `slo/preview/wiring-fixes-draft.html` |
| P1-B | Fix 2: save step-1 contact on valid email (ours + ClickFunnels), merge phone later | agent | claimed |
| P1-C | Fix 3: prepare push of `04a-book-top.html` to /funding-book-call (diff vs live, no push) | agent | done — **cannot ship as written**; folded into P3-H3 (see Results) |
| P1-R | Report only: real bookings 14 days, SMS/CRM vs leadconnectorhq, three entity names | agent | done (see Results) |
| P2 | Page inventory: manifest list + every page not in it; add missing pages to manifest | agent | done — `docs/tracking/page-inventory.md`; manifest unchanged (see Results) |
| P3-C | Shared browser tracker `public/funnel/fh-events.js` (+ framed-calendar relay) | agent | claimed |
| P3-S | Server: `src/funnel/pages.mjs`, `src/funnel/track.mjs`, tests; patch for slo-interest handed to this session | agent | claimed |
| P3-H1 | Buy box hooks + section/FAQ/carousel attributes in `slo/slo-01-sales.html` | agent | claimed |
| P3-H2 | Survey hooks: `apply-survey.html`, `public/js/homepage-survey.js`, sorting hat `public/funnel/thankyou-sort.js` | agent | pending (next free slot) |
| P3-H3 | Booking: /funding-book-call footer block (fix 3), `slo/slo-02-booking.html`, manifest (+ /order row), push script code block | agent | claimed |
| P4 | Meta pixel + Conversions API | **blocked** — no Conversions API token exists (see Blockers) | blocked |
| G | Gates: show diffs, deploy on "approved", prove live, phone checklist, docs | this session | pending |

## File ownership (no two units edit the same file)

- P1-A: `marketing/landing-pages/slo/slo-01-sales.html`, new `marketing/landing-pages/slo/preview/wiring-fixes-draft-build.mjs` + its outputs
- P1-B: `public/funnel/fh-attribution.js`, `api/public/slo-interest.mjs`, `src/slo/cf-contact.mjs`, tests under `src/`
- P1-C: none (read + diff only)
- P1-R: none
- P2: `marketing/landing-pages/tracking-manifest.mjs`, `docs/tracking/page-inventory.md`

## Blockers

- **P4 — no Conversions API token.** Checked `.env` (META_AD_ACCOUNT_ID, META_APP_ID, META_APP_SECRET, META_BUSINESS_ID only), Netlify production (same four names, 108 vars total), and the database. The only Meta token stored is the ad-sync login in `ad_platform_connections` (platform meta, saved 2026-08-24, no expiry). That is not a Conversions API token. Owner instruction: stop and tell him.

## Results

### P1-C — fix 3 cannot ship through the push script

- `push --only=apply-book` changes nothing today (`footer_already_right`). The writer fix in `04a-book-top.html` lives in the page **body** (a Custom HTML element above the native calendar). The script only writes footer/head code (`scripts/cf-push-custom-html.mjs:374`, `:826`). The manifest `fragments` key is never read.
- The only API way to change a builder page body is `PUT /pages/{id}` markup, which replaces the whole tree. The API markup has **no calendar element** — a markup write would delete the live calendar. Not an option.
- Route chosen: a new marked code block in footer_code (same `code_block_upsert` method `fh-framed` uses) that stamps `submittedAt` **after** the old writer runs, and only when the booking is really accepted. Built in P3-H3 together with the booking tracking events.
- Found on the way: the Book listener is capture-phase, so it stamps before ClickFunnels checks the form — a Book press with a bad phone would fire Schedule and move a /roadmap buyer to /roadmap-thank-you with no booking (`04a:120-124`; same note in `docs/journeys/CHANGELOG.md` 2026-08-19). New block must wait for real success.
- Turning `submittedAt` on also wakes `slo-02-booking.html:443-452` (sends buyer to /roadmap-thank-you). Same success rule must hold.
- Direct visit to /funding-book-call: nothing fires Schedule, before or after the fix.
- Live proof: the edge cache now ignores query strings (`?cb=` returns a cached HIT, 25+ min). Prove by API `GET /pages/25062844?expand[]=footer_code`, then the public page once the cache expires.
- Leftover: `--dry-run` overwrites `ops/workflows/cf-push-snapshots/page-25062844-*.html` before checking the flag (`cf-push-custom-html.mjs:412-417`).

### P1-A — fixes 1, 4, 5 done (not pushed)

- Fix 1: one gate in `go()` — step 3 opens only when `order.locked` (card success, demo pay, or paid return link). Tab 3 needs `paid`. Unpaid step-3 submit goes back to step 2: "Finish the card step first. The soft pull opens after you pay." "Your payment went through" now only on paid paths.
- Fix 4: `EXTRA_BIZ=false` hides the add button, summary note, step-3 sentence and "$X added". Logic kept; one switch brings it back.
- Fix 5: warning now says "tap Start My Soft Pull again".
- Proof: 23/23 Playwright checks on a fake host with every network call stubbed; old page fails the same checks.
- Test `src/http/slo-sales-widget-html.test.mjs:288` updated to the new approved wording (this session). File now 24 pass / 2 fail; both failures were already failing before this work.
- Gap left: a hand-typed `?ref=&client_id=` link still opens step 3 (server still refuses to pull unpaid). Closing it needs `src/slo/status.mjs` to report paid — not in scope.
- Risk: running `reorg-draft-build.mjs --live` again would rebuild the page from its frozen copy and undo these fixes.

### P1-R — reports (no changes)

- **Bookings:** 1 real booking in 14 days — Jonathan, booked 2026-09-23 on the "Meeting with Chris" calendar (/schedule/phonecall), call 2026-09-24. It was refused at our door (401 bad_signature, `src/adapters/clickfunnels.mjs:757-759`), replayed 2026-09-26 04:36 and saved, then **deleted 2026-09-26 20:15 by a bulk test-data cleanup** (1,306 events flipped to demo, his client deleted, booking row cascaded via `db/migrations/225_bookings.sql:57`). Nothing in the repo ran that cleanup. Postgres counters: 89 bookings inserted since 07-24, all deleted. Webhook endpoint 113188 now points at fundhub.ai and works (contact deliveries saved 09-27 → 10-01). Funnel 968281 order: VSL → Apply → Funding Book Call → Thank You → $297 Roadmap Order. Restoring Jonathan = a data write → needs Chris.
- **SMS:** working via Twilio (`src/messaging/dispatch.mjs:268-275`, `:484`). 14 days: 18 delivered, 1 sent, 1 failed (no phone). GoHighLevel relay off and never used (0 messages all time). The leadconnectorhq default is dead code.
- **CRM contact sync (GoHighLevel):** off — no key, no calls (`src/messaging/crm-contacts.mjs:38-40`). 23 of 26 clients flagged "not_configured" (`src/handlers/client-lifecycle.mjs:129-134`). Harmless.
- **Company names:** "Fundhub Credit Solutions LLC" on /roadmap step-3 consent (`slo-01-sales.html:1098`) and `public/roadmap/pull.html`; plain "Fundhub" in every stored consent (`src/consent/disclosures.mjs:56,79,87,91`); "Fundhub LLC" on /watch, /funding-book-call, /thank-you, /roadmap disclaimer, /roadmap-thank-you, terms and privacy (only place with an address: Bowling Green, FL). No doc proves which is registered. Chris picks.

### P2 — page inventory (`docs/tracking/page-inventory.md`)

- 7 live ClickFunnels funnel steps, all already in the manifest: /watch, /apply, /funding-book-call, /thank-you, /roadmap, /roadmap-book, /roadmap-thank-you.
- Not in manifest: **/order** (funnel 968281 step 5, live mode, native $297 checkout, 3 views / 0 sales in 30 days, no Clarity, no events script) — this session adds it (live funnel step, Chris: no exceptions). **/schedule/phonecall** ("Meeting with Chris" calendar — the one real booking used it) — ClickFunnels API cannot add code to it.
- Netlify pages (not ClickFunnels): fundhub.ai homepage survey (live, last real submit 2026-08-18; no pixel, no events), /start, /education/*, /affiliates/, /partner/*, old /roadmap/{,pay,pull}.html, /optimize. Their tracking is script tags in `public/**`.
- Survey steps: /apply 9 question screens (contact, funding_target_amount, planned_use, money_change_now, self_reported_fico, has_business, revenue or income ×2, available_capital) + review + result/calendar. Homepage survey 9 + contact.
- Dead: /apply-page (25068989), Hero Theme template pages, archived funnels, slo-02-order.html (not on any live page), climate front door (never built).
- Leftover: manifest `apply-survey` row names dead page 25068989 (push still finds the right one by path). Pre-existing test failure `src/ads/funnel-proof-scripts.test.mjs:452` (01-vsl.html still loads funding-paths.js).
