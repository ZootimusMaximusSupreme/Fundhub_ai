# Tracking everything — wiring fixes, page inventory, database events, Meta (2026-10-02)

Owner ask: four phases, approval gate before any deploy. Source audit: `docs/audits/wiring-audit-2026-10-02.md`.
Nothing is pushed to ClickFunnels or deployed until Chris says "approved". Agents do not commit; this session commits at the end of each phase.

## Tasks

| # | Unit | Owner | Status |
|---|---|---|---|
| P1-6 | Commit `marketing/landing-pages/slo/` | this session | done — `2019c1b5` (+ baseline `fa03308c` for the rest of landing-pages) |
| P1-A | Fixes 1, 4, 5 in `slo/slo-01-sales.html` (lock step 3, hide $15 extras, address warning) + green marked draft | agent | done — 23/23 browser checks; draft `slo/preview/wiring-fixes-draft.html` |
| P1-B | Fix 2: save step-1 contact on valid email (ours + ClickFunnels), merge phone later | agent | done — committed `1feca0d1` |
| P1-C | Fix 3: prepare push of `04a-book-top.html` to /funding-book-call (diff vs live, no push) | agent | done — **cannot ship as written**; folded into P3-H3 (see Results) |
| P1-R | Report only: real bookings 14 days, SMS/CRM vs leadconnectorhq, three entity names | agent | done (see Results) |
| P2 | Page inventory: manifest list + every page not in it; add missing pages to manifest | agent | done — `docs/tracking/page-inventory.md`; manifest unchanged (see Results) |
| P3-C | Shared browser tracker `public/funnel/fh-events.js` (+ framed-calendar relay) | agent | done — committed `76d8e3ff` with P3-S |
| P3-S | Server: `src/funnel/pages.mjs`, `src/funnel/track.mjs`, tests; patch for slo-interest handed to this session | agent | done — patch applied by this session |
| P3-H1 | Buy box hooks + section/FAQ/carousel attributes in `slo/slo-01-sales.html` | agent | done — committed `bf563492` with fixes 1/4/5 |
| P3-H2 | Survey hooks: `apply-survey.html`, `public/js/homepage-survey.js` + `public/index.html`, sorting hat `public/funnel/thankyou-sort.js` | agent | done — committed `38d69440` |
| P3-H3 | Booking: /funding-book-call footer block (fix 3), `slo/slo-02-booking.html`, manifest (+ /order row), push script code block | agent | done — committed `1c19a6bd` |
| P4 | Meta pixel + Conversions API | **blocked** — no Conversions API token exists (see Blockers) | blocked |
| G | Gates: show diffs, deploy on "approved", prove live, phone checklist, docs | this session | **waiting on Chris** |
| Q1 | /roadmap and /roadmap/ → one URL | agent | done — committed (see Results) |
| Q2+Q3+Q6+Q7p | /roadmap page: tap speed under 200ms (INP 1.1s), layout shift (CLS 0.15), dead clicks (8.89%), "Fundhub LLC" in page consent + footers — marked draft | agent | claimed |
| Q4 | Clarity JS errors (one Clarity pull) incl. FB Android "Java object is gone"; fix ours | agent | done — no errors from our code |
| Q5 | Buy box in Facebook/Instagram in-app browsers, iPhone + Android (test; fixes go to the page owner) | agent | claimed |
| Q7c | "Fundhub LLC" in stored consent record (new consent version) + other /roadmap funnel pages | agent | done — committed `d9808d03` |

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

### P1-B — step-1 contact on email (committed `1feca0d1`, not live)

- Saves on a valid email (leave the box, Continue, or tab close). Phone/name merge into the same row and the same ClickFunnels contact (upsert by email). Agents/test emails never reach ClickFunnels.
- `src/workflows/slo-genuine-followup.mjs` touched on purpose: without it, an email-first visitor who typed a phone during the 15-minute wait would get no text.
- Not passing: `src/ads/utm-funnel-fragments.test.mjs` "06 paste-in and fh-attribution.js are the same script" — the agent's copy into `marketing/landing-pages/06-utm-hidden-fields.html` (not live, not in the push list) was blocked by a permission check. Left for Chris at the gate.
- No real-Postgres run (no scratch DB on this Mac). New SQL unproven on a real DB: `payload || $1::jsonb`.
- Production has no `CLICKFUNNELS_WORKSPACE_ID`, so each ClickFunnels write does 3 calls; handler waits up to 3s after answering.
- Risk: anyone can type someone else's email on step 1 and change that person's ClickFunnels name/phone.

### P3-H1 — buy box hooks (committed `bf563492` with fixes 1/4/5, not live)

- 71 events captured in a stubbed walk; 38 typed values searched, none found in any payload. Layout identical (1,616 elements) phone + desktop. Fix checks 23/23 still pass. No new test failures.
- Card fields: no focus/complete (inside the card company's frame, no field events exposed).
- Another session committed `f941b315` (Colin testimonial #2) into this same page today. A push of /roadmap will carry that change too.

### P3-S — server side of kind "track" (not live)

- New: `src/funnel/pages.mjs` (page → funnel/step, incl. /order and /home), `src/funnel/track.mjs` (`recordTrack`: per-event props allow-list, sensitive-value drop, seq idempotency, 500/session/day cap), `src/funnel/track.test.mjs` (32 tests, two read the spec tables so code and spec can't drift), `src/http/slo-interest-track.pg.test.mjs` (skips without a scratch DB), `db/migrations/404_funnel_track_index.sql` (partial index for the cap count).
- `api/public/slo-interest.mjs`: kind "track" → `recordTrack`; page list now the shared map (old kinds page/click also accept /order and /home).
- Live DB measured read-only: `events` is 4,606 rows / 5.3 MB, collation `en_US.UTF-8` — the existing idempotency index cannot serve a LIKE prefix, so the new partial index is needed; build time is negligible.
- **Not run: database tests.** No Postgres on this Mac (no brew, no docker). Needs a scratch database.
- Leftover: `db/expected-migrations.mjs` lacks six older migrations (114, 168, 255, 371, 372, 381) from today's stash merge `7edde860` → `health-migrations.test.mjs` already failing. Only the 404 line was added.

### P3-C — shared tracker (committed `76d8e3ff`, not live)

- Every event goes out as kind "track". Old kinds page/click are no longer sent, so the server must ship with it — both are on Netlify, so one `npm run ship` turns on both.
- Every press is now a row (was first press only). Cap 500/session/day.
- Headless walk on /roadmap and /apply captured page_view, click, scroll, section_view, video play/25%/unmute, carousel next/play, faq_open, exit, calendar relay. Typed test text never appeared in a payload. Relay dropped an `email` prop and ignored a relayed `click`.
- Combined: lint clean, tsc clean, tracker + server tests 112/112. Full suite 28 failures, all also failing at HEAD (other uncommitted work).
- Not exercised: a real exit beacon on the network, real phone, live ClickFunnels pages.

### P3-H3 — booking confirm block + /order (committed `1c19a6bd`, not live)

- Success signal: ClickFunnels' own `cf:form_submitted:ok` on `document` — fired only when the booking POST comes back OK (live `user_pages-*.js` `submitPage()`); bad phone never submits; 422 fires `checkout:order-submit-errors`.
- Block stamps `submittedAt` after the old writer and keeps it for 6s against the old 400ms loop. Sends calendar_view / time_selected / booking_confirmed (framed → parent relay; direct → fhTrack).
- Browser proof on the real live page with real ClickFunnels + Cronofy scripts, POST faked: bad phone → nothing; 422 → nothing; 200 direct → stamped + booking_confirmed; 200 framed in /roadmap-book → parent relayed events and moved to /roadmap-thank-you; 422 framed → stayed.
- Push preview: apply-book footer 193 → 6,982 bytes (same 3 script tags + block, whole-footer replace); apply-order footer empty → fh-events + Clarity.
- 22 new tests; three deliberate breaks each caught.
- Not proven: a real ClickFunnels booking (would create a real appointment).
- At ship: update `docs/journeys/slo-offer-actual.md:86` and `docs/journeys/sorting-hat-pages-flow.md:57` (both say submittedAt is never stamped) + CHANGELOG.

## Gate — waiting on Chris (2026-10-02)

Built, tested, committed, **not live**: `1feca0d1`, `bf563492`, `76d8e3ff`, `1c19a6bd`, `38d69440`. Full diff: `ops/workflows/tracking-everything-2026-10-02.diff`. Marked draft of /roadmap: https://claude.ai/artifact/XD5JRJQ87do6GvCk5eFSja

**Deploy blocker:** `npm run ship` refuses an uncommitted tree (`scripts/ship.mjs:63`). The tree holds another session's cleanup: 2,010 deleted paths (596 moved with the same content, 1,414 removed: 734 old `docs/workflows` boards, 443 `scripts/tmp*`, 96 `vendor/` copies, old root notes), 230 modified, 140 untracked. Same block stopped the Colin #2 deploy (`ops/workflows/2026-10-01-colin-testimonial-2.md`). Committing it is Chris's call.

Also: the /roadmap page now points at the Colin #2 video, which is not on fundhub.ai yet (404). So /roadmap must not be pushed before ship.

Can go live without ship (ClickFunnels-only): /funding-book-call booking block (fix 3), /order footer, /apply hooks, /roadmap-book attributes.

## Owner decisions logged

- 2026-10-02: company name in the /roadmap funnel is **Fundhub LLC** (consent text, stored consent record, footer). Owner-set.

## Queue (owner ask 2026-10-02, after Phase 3) — log every change in `docs/audits/wiring-audit-2026-10-02.md`, diff before deploy

1. /roadmap and /roadmap/ → one URL. 2. Tap speed (INP 1.1s → under 200ms), esp. buy box. 3. Layout shift (CLS 0.15) — reserve space for video, carousel, buy box. 4. Clarity JS errors incl. FB Android "Java object is gone"; fix ours. 5. Buy box in FB/IG in-app browsers iPhone + Android. 6. Dead clicks 8.89% — step tabs, order summary, testimonial cards, FAQ rows. 7. "Fundhub LLC" everywhere in /roadmap funnel.

**Owner correction (2026-10-02):** the Clarity INP (1.4 s) and CLS (0.2) were from fundhub.ai/affiliates/ (2 pageviews), not /roadmap. Measure /roadmap's real tap response and layout shift on mobile first; fix only what the measurement shows. Same check on /affiliates (page agent also owns `public/affiliates/index.html`).

File ownership: the page agent owns `marketing/landing-pages/slo/slo-01-sales.html` alone; Q4/Q5 hand page fixes to it through this session.

## Ship attempt — 2026-10-02 (Chris said "ship")

- Product files in the pending tree were checked: 145 files, path strings only (238/238 lines), every new path exists.
- **Blocked by the Claude Code auto-mode safety check, nothing went live:**
  1. Committing the 2026-10-01 reorganization (needed before `npm run ship`) — denied as "Irreversible Local Destruction" (it records ~1,400 file deletions). Index reset; tree left exactly as found.
  2. `node scripts/cf-push-custom-html.mjs push --only=apply-book` (ClickFunnels-only booking fix) — denied as "Production Deploy".
  3. A read-only `git log -S` search for the old guarantee section — denied under the same reason.
- Needs Chris: allow these actions (permission mode / allow rules are his), then "ship" again.

## Queue 2 (owner ask 2026-10-02) — after the page agent finishes `slo-01-sales.html`

Buy box v2 on /roadmap: refund line above the step-1 button; step 1 = first name, last name, email (phone moves to step 3, still required; contact still saved on valid email); "Step 1 of 3" label replaces the tabs; under-button text "Your roadmap shows up in your portal today."; button "Get My Funding Roadmap"; all tracking still fires; "buy box version 2" marker with deploy time. Restore the old guarantee section from git history in its original position, 7-day window, consistent with the new line. Diff before deploy; log in the audit doc.

## Second ship attempt — 2026-10-02 (Chris: "ship go go go")

- Reorganization commit retried with queue-agent files left out → denied again by the auto-mode safety check ("Irreversible Local Destruction"). Unstaged; tree as found. Not retried again.
- Found while preparing: `npm run ship` also stops on six db files missing from `db/expected-migrations.mjs` (from the 2026-10-01 parked-stash commit `7edde860`). Five are already applied in production (114_crm_agent_seed, 168_retire_legacy_crm_agents, 255_doc_agent_docs_received, 371_doc02_email_partner_sms_requeue, 372_rename_legacy_crm_column_and_keys). **One is not: `381_blueprint_entitlement.sql`** — grants the Capital Blueprint tile to product `consulting-package`; its own header says DIY letter buyers who fall back to that code would also unlock the tile. Owner decision before it goes to production.
- Queue agents are still editing files, so ship has to run from a clean copy of the committed main (ships only committed, approved work).

### Q7c — Fundhub LLC (committed `d9808d03`, not live)
- New stored consent `soft-pull-v3` used only by the /roadmap pull; v1/v2 untouched; other consent screens keep v2 (owner decision covered /roadmap only).
- pull.html, /roadmap-book and /roadmap-thank-you footers now "Fundhub LLC". Removed the small "Credit Solutions" tag under the logo on pull.html.
- After the page agent lands: sync `src/http/slo-sales-widget-html.test.mjs:185,190` and `src/consent/disclosures.test.mjs:99,106-118` to the new sales-page consent text.
- At ship: `docs/journeys/slo-offer-actual.md:57` says soft-pull-v1 → v3; CHANGELOG line.

### Q4 — Clarity JS errors (report; no code change)

- One Clarity export pull (1 of 10 today): 3 days, URL + Browser + OS. Export has no INP/CLS fields. Script errors: only /roadmap, 3 of 96 sessions (iPhone Safari 2, Instagram Android 1). /roadmap dead clicks 8 clicks in 5 sessions (5.2%), rage clicks 0. Raw data kept in the session scratchpad (URLs carry fbclid).
- Clarity IS recording real visitors (96 /roadmap sessions in 3 days). The "not being collected" reply only applies to this Mac — most likely Clarity IP blocking covers this office. The earlier audit's "Clarity broken" was wrong for real visitors.
- 34 live loads (8 pages × iPhone, Android, FB Android, IG Android, + FB/IG iOS on /roadmap): our scripts threw nothing. Errors seen are Meta pixel in-app calls (`properties://browser/*`), ClickFunnels' "unsafe header", and /order's ClickFunnels checkout failing a Cloudflare bot check in the test browser.
- "Error invoking postMessage: Java object is gone" is Chromium's Android Java-bridge message (`gin_java_bridge_errors.cc`); it comes from Meta's in-app bridge code that the pixel triggers, not from our two framed postMessage calls (both framed-only, try/catch, never on unload). Nothing visible to the buyer.
- Leftover (Phase 4): Meta's pixel config lists a Conversions API Gateway ("openbridge" on AWS us-east-1, backup on Google Cloud) — server events may already be flowing through Meta's gateway. Check before building a second sender.

### Q1 — one URL for /roadmap (committed, not live)

- The split: **every ad visit lands on apply.fundhub.ai/roadmap/** (234 people in 14 days, 127 from fb_ad); the no-slash form gets direct links only (48 people). Same page byte for byte. Our tracker already merges them (`page`), only `landing_path` and Clarity split. fundhub.ai/roadmap(/) still serves the OLD Netlify copy (200).
- Canonical: https://apply.fundhub.ai/roadmap. Netlify 301s for fundhub.ai/roadmap, /roadmap/, /roadmap/index.html, /slo (query kept). pay.html / pull.html untouched.
- apply.fundhub.ai/roadmap/ cannot get a real 301 (ClickFunnels API has no redirect setting; the DNS record is DNS-only at Cloudflare and no Cloudflare token exists). Fix there: a head block with `<link rel="canonical">` + `history.replaceState` to `/roadmap`, before pixel/Clarity/tracking. curl still sees 200; people, pixel, Clarity and our data see `/roadmap`.
- 18 new tests, 4 deliberate breaks caught; Chromium + WebKit proof of the rewrite keeping utm/fbclid/ref/client_id/#fhw.
- Order at ship: Netlify part with `npm run ship`; the /roadmap push after ship (it also carries the Colin #2 video, which 404s until ship).
- Not changed (not asked): Meta ad URLs, discount-197 and infinite-drip links still say `/roadmap/` — the browser rewrite covers them.
- At ship: update `docs/journeys/slo-offer-actual.md:5,11`, page-inventory row 21, CHANGELOG.
