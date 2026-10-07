# Yesdoor MVP build board (2026-10-07)

Owner direction (Chris, 2026-10-07):
- Build a working MVP inside the Fundhub repo for now. Later, move it to its own GitHub repo and its own database.
- Backend first, front end last.
- The CRS credit check and Plaid run against a pretend sandbox for now. Nothing goes live yet.
- Website: like Apartments.com or Zillow, with Arizona listings and a lead funnel. Keep it really simple.
- Duplicate the Fundhub marketing machine for Yesdoor.
- Model plan: Opus writes the detailed build spec; Sonnet builds the backend; the front end comes after.

Source docs (read these, don't re-research):
- `docs/specs/yesdoor-mvp-2026-10-07.md`: the MVP spec, with every owner answer (§10–§17)
- `marketing/offers/yesdoor/scale-3m.md`: money model and plan
- `marketing/offers/yesdoor/industry-research.md`: renter, apartment and broker facts
- `marketing/offers/yesdoor/acq-money-model.md`: the ACQ offers
- `marketing/offers/yesdoor/scale-engine.html`: the money model page

## Tasks

| # | Unit | Model | Owner | Status | Waits on |
|---|---|---|---|---|---|
| B1 | Detailed build spec: entities, states, events, endpoints, integrations, tests, Fundhub modules to copy | Opus | this session | done | — |
| B2 | Backend 1: database tables and migrations (Yesdoor-prefixed, own org) + read endpoints + tests | Sonnet | yesdoor/b2-database | done | B1 |
| B3 | Backend 2: pre-screen + matching (CRS and Plaid sandbox stubs, rules, risk tiers, approved/likely/no, backups) | Sonnet | open | pending | B2 |
| B4 | Backend 3: buildings, tours, money (portal API, spreadsheet + listing-feed import, registration emails, invoices, fee ledger, broker ledger, disputes) | Sonnet | open | pending | B2 |
| M1 | Marketing: 4 avatars (prime renter, Second Chance renter, leasing manager/regional VP, broker), then the marketing-machine copy for Yesdoor | Sonnet | agent | avatars done — waiting on Chris | — |
| F1 | Front end: Zillow-style site, Arizona sample listings, lead funnel, renter / building / broker logins | Sonnet | open | pending | B3, B4 |

Runs at the same time: **B1 and M1** (no shared files). After B2: **B3 and B4** in parallel. F1 is last.

Owner defaults: spec §17 items 1–14 are assumed "defaults OK" unless Chris changes them.

## Prompts (paste one per new session after B1 is done)

### B2: database + read endpoints

```
Fundhub repo. Read ops/workflows/yesdoor-mvp-build-2026-10-07.md, then docs/specs/yesdoor-mvp-build-spec.md (written by B1).
Task B2. Mark B2 claimed on the board. Follow CLAUDE.md §3a: schema → migration → read endpoints → tests that run against a real DATABASE_URL (scratch database only, never production).
Build only what the build spec's "B2" section lists: the Yesdoor tables (own org, Yesdoor-prefixed), constraints in the database, read endpoints routed in netlify/functions/api.mjs, pulse registry rows.
Then: npm run lint, npx tsc --noEmit, npm test. Commit, push, open a draft PR. Write your change manifest under "## B2" on the board. Mark done.
```

### B3: pre-screen + matching

```
Fundhub repo. Read ops/workflows/yesdoor-mvp-build-2026-10-07.md (B2 manifest), then docs/specs/yesdoor-mvp-build-spec.md section "B3".
Task B3. Mark B3 claimed. Build the pre-screen and matcher. CRS and Plaid are sandbox stubs behind a provider module (src/messaging/providers/ pattern); no live calls.
Implement: building rules versions, risk tiers A–D, approved/likely/no per building, backup matches, re-check schedule, "approved but denied" handling. Tests for every rule.
Lint, typecheck, tests green. Commit, push, draft PR. Manifest under "## B3". Mark done.
```

### B4: buildings, tours, money

```
Fundhub repo. Read ops/workflows/yesdoor-mvp-build-2026-10-07.md (B2 manifest), then docs/specs/yesdoor-mvp-build-spec.md section "B4".
Task B4. Mark B4 claimed. Build: building onboarding and portal API, spreadsheet and listing-feed import, tour booking, timestamped registration email (queued messages only), invoice on confirmed move-in, fee ledger (earned → invoiced → paid → safe at 60 days, reversals), broker ledger and payouts, disputes. Copy patterns from src/commissions, src/affiliates, src/contracts, src/bookings, src/lenders as the spec says.
Lint, typecheck, tests green. Commit, push, draft PR. Manifest under "## B4". Mark done.
```

### M1: avatars + marketing machine copy

```
Fundhub repo. Read ops/workflows/yesdoor-mvp-build-2026-10-07.md and marketing/offers/yesdoor/*.md.
Task M1. Mark M1 claimed. Step 1: run the avatar-builder skill four times: prime renter, Second Chance renter, leasing manager / regional VP, broker. Use marketing/offers/yesdoor/industry-research.md as ground truth. Save to marketing/avatars/yesdoor/. Stop and post the four on the board for Chris before step 2.
Step 2 (after Chris OKs): plan the Yesdoor copy of the marketing machine (docs/specs/marketing-machine-2026-10-04.md), with what to copy and what changes. Plan only.
Commit and push. Manifest under "## M1".
```

### F1: front end (last)

```
Fundhub repo. Read ops/workflows/yesdoor-mvp-build-2026-10-07.md (B2–B4 manifests), docs/specs/yesdoor-mvp-build-spec.md section "F1", and docs/rules/UI-STANDARDS.md.
Task F1. Mark F1 claimed. Build the Zillow-style Yesdoor site on the B2–B4 endpoints:
- search with Arizona sample listings, clearly marked as samples until buildings sign
- listing page, pre-screen funnel, tour booking
- renter, building and broker logins
Keep it really simple. Live Playwright and a human click-through before done.
Commit, push, draft PR. Manifest under "## F1".
```

## B1

Done. `docs/specs/yesdoor-mvp-build-spec.md`. It covers:
- tables (§2), state machines (§3), the matcher (§4), the denied-after-approved flow (§5)
- crons (§6), sandbox providers (§7), endpoints (§8), defaults (§9)
- the unit split B2/B3/B4/F1 (§10) and done (§11)

Key decisions:
- all Yesdoor code in `src/yesdoor`, `api/yesdoor`, `public/yesdoor`; `yd_` tables; migrations 434–436
- an import allowlist guarded by a test
- Fundhub logic copied, not shared; nothing transmits
- no merge or ship until Chris says

Owner notes (2026-10-07): sales runs on about 5 commission-based closers working the big companies. The opportunity is global.

## B2

Status: **done** (branch `yesdoor/b2-database`, not merged, not shipped, no PR opened). Migrations were applied to a scratch Postgres only, never to production.

### What was built

**Migrations** (`npm run migrations:manifest` run; 338 entries)
- `db/migrations/434_yesdoor_core.sql`: helper `yd_harden()`; `yd_companies`, `yd_buildings`, `yd_brokers`, `yd_renters`, `yd_accounts`, `yd_account_buildings`, `yd_sessions`, `yd_magic_links`, `yd_consents`, `yd_screenings`, `yd_screening_raw`, `yd_income_checks`, `yd_building_rules`, `yd_listings`, `yd_state_rules`, `yd_events`, `yd_outbox`.
- `db/migrations/435_yesdoor_pipeline.sql`: `yd_agreements`, `yd_matches`, `yd_applications`, `yd_tours`, `yd_disputes`, `yd_touches`; functions `yd_building_is_matchable(uuid)` and `yd_stage_move_ok(from, to)`.
- `db/migrations/436_yesdoor_money.sql`: `yd_invoices` (+ sequence `yd_invoice_number_seq`), `yd_fee_ledger`, `yd_broker_ledger`, `yd_renter_refunds`; function `yd_fee_move_ok(kind, from, to)`.
- `db/seed/296_yesdoor_org_and_samples.sql` (the repo runs `db/seed` after migrations): org `yesdoor`; `yd_state_rules` (CA screening-fee cap about $66 flagged approximate, CA background-check notice, AZ "none on file"); Arizona SAMPLE data, all `is_sample = true`: 3 companies, 8 buildings (Phoenix 2, Tempe, Scottsdale, Mesa 2, Chandler 2; 5 standard rules, 3 second-chance), 8 rules versions, 24 listings $1,200 to $2,400 (mean about $1,611). One building has `app_fee_cents = NULL` on purpose (unknown stays NULL). All names are made up; no sample building is `signed`.

**Database guards** (all proved by tests)
- Every `yd_` table: RLS enabled + forced, `<t>_app_all` policy, `set_updated_at` trigger, DELETE/TRUNCATE revoked from `fundhub_app`. Consents, screenings, raw payloads, income checks, matches, rules, agreements, applications, tours, disputes, events, invoices, both ledgers and renter refunds also carry `fundhub_no_delete()`.
- Every foreign key between `yd_` tables is composite with `org_id`, so a row can never point at another company's row. The only foreign key into a Fundhub table is `orgs(id)`.
- First touch on `yd_renters` is write-once (trigger). Open-application cap of 3 (trigger, race-safe: six parallel bookings, exactly three get in). Stage moves only along the spec §3 arrows; each move stamps its timestamp and writes one `yd_events` row `application.<stage>` (creation writes `application.booked`).
- A building is matchable/bookable only if `signed`/`live` with a signed `building_fee` agreement (its own or its company's), or flagged `is_sample` (demo only).
- Ledger: amount frozen once not `earned`; refund = new negative row reversing the original in full, once; stamped invoiced/paid/safe times never change; `safe` only `refund_days` after `paid_at`; broker `payable`/`paid` only when the fee is `safe` and the hold has passed, and only for the placement that broker first-touched; a refund voids an unpaid broker share.
- Spec §5b additions (coordinator, 2026-10-07): `yd_applications.known_prospect_at` + `known_prospect_evidence` (evidence required), `YD_DEFAULTS.registrationValidDays: 90, knownProspectDays: 3`, and `yd_buildings.allows_renter_incentive boolean NOT NULL DEFAULT false`.

**Code**
- `src/yesdoor/config.mjs`: `YD_DEFAULTS` (spec §9 exactly, frozen; a test compares it to the spec block), plus `YD_AUTH`, `YD_API`, `YD_ROLES`.
- `src/yesdoor/auth/`: `session.mjs`, `magic-link.mjs` (copied pattern, `yd_` tables, queues into `yd_outbox`), `principal.mjs` (`requireYdStaff` over `requireAuth`+`requireRole`, `requireYdAccount`).
- `src/yesdoor/store/`: `org.mjs`, `listings.mjs`, `renters.mjs`, `buildings.mjs`, `brokers.mjs`, `staff.mjs`. `src/yesdoor/http.mjs`: helpers.
- `src/yesdoor/testing/fixture.mjs`: shared pg-test fixture (two fresh orgs per run).
- `src/yesdoor/boundary.test.mjs`: fails on any import outside the §0 allowlist (also checks `api/yesdoor` imports only `src/yesdoor` and `src/db.mjs`).
- `scripts/journeys/extract.mjs`: now recognises `requireYdStaff` / `requireYdAccount` (otherwise the generated journeys drew every Yesdoor route as open to anyone). Journeys regenerated (`npm run journeys`).

### Endpoints (all in `ROUTES` and `PULSE_REGISTRY`; no `ALLOWED_UNMONITORED` rows needed)
- Public: `GET yesdoor/public/listings`, `GET yesdoor/public/listing`.
- Auth: `POST yesdoor/auth/link`, `GET|POST yesdoor/auth/verify`.
- Renter: `GET yesdoor/me`.
- Building user: `GET yesdoor/building/renters`, `/rules`, `/invoices`.
- Broker: `GET yesdoor/broker/renters`, `/money`, `/link`.
- Staff (ops/sales/collections, owner always): `GET yesdoor/staff/pipeline`, `/companies`, `/buildings`, `/disputes`, `/scoreboard`. Money (ops/collections/owner): `/ledger`. Credit (ops/owner only): `/renter?id`, `/screening?id`.
- Every other method on these doors answers 405 with an `allow` header. The POSTs in spec §8 are B3/B4.

### Tests (scratch Postgres 16 + pgvector, as `fundhub_app`, and again as the owner, both 0 skipped)
- `src/http/yesdoor-core.pg.test.mjs` 104, `yesdoor-public.pg.test.mjs` 11, `yesdoor-auth.pg.test.mjs` 21, `yesdoor-accounts.pg.test.mjs` 21, `yesdoor-staff.pg.test.mjs` 26. Total 183 pass.
- Pure: `src/yesdoor/boundary.test.mjs` 4, `src/yesdoor/config.test.mjs` 5.
- Every endpoint test proves: wrong principal 401/403, another org's rows never returned, building/broker (and renter) responses contain no credit keys (deep key scan plus planted marker values).

### For B3 / B4 / F1: things that are not obvious from the spec
- JSON responses are **camelCase**; money is an integer `*Cents` Number; dates are `YYYY-MM-DD` strings; timestamps are ISO. Query `maxRent` is **whole dollars**; `beds` is an exact match (0 = studio).
- pg returns `bigint` as a string. The stores convert with `cents()`; do the same in new code.
- `yd_screenings.consent_id` is **NOT NULL** (and must belong to the same renter): write the consent row first. A finished screening is frozen; a re-check is a new row.
- A placement must be inserted at `booked`; `registered` needs `registration_sent_at` and `registration_outbox_id` set together (queue the `yd_outbox` row first). Strict §3: `registered -> cancelled` is not an arrow.
- Set `yd.actor_kind` / `yd.actor_id` with `set_config(..., true)` inside the transaction to put the actor on the automatic stage events. The cap default lives in the setting `yd.max_open_applications` (default 3, matches `YD_DEFAULTS`; a test fails if they drift).
- One open application per renter per building. One placement fee per application. Refunds reverse in full only.
- Sample buildings (`is_sample`) pass the matchable check so the demo funnel can run; flip `is_sample` to false when a building really signs.
- Login link email: `yd_outbox` row, `template_key 'yd-magic-link'`, `context.magic_link.{url, expires_minutes}`, status `queued`. Nothing sends it until the B4 sandbox dispatcher. Link page path: `/yesdoor/login.html?t=<token>` (F1 builds it; it should POST the token to `auth/verify`). Session carriers: `Authorization: Bearer`, `x-session-token`, or cookie `yesdoor_session`.
- Public endpoints take their company from env `YD_ORG_SLUG` (default `yesdoor`), never from a parameter.
- Tests cannot clean up (nothing deletes), so each run creates fresh `yesdoor-test-<random>-a/-b` orgs. Harmless on a scratch database.

### Left undone / not in B2
- All POST writes (B3/B4), the matcher and sandbox providers (B3), crons and heartbeats (none exist yet, so no `INNGEST_JOBS` rows), `webhooks/esign` (B4).
- **No staff user exists in the `yesdoor` org.** The staff doors need a `staff` row (role owner/ops/...) in org `yesdoor` with a login; creating real logins was not done here.
- `building/update` and the dispute POSTs are where `known_prospect` becomes an attribution dispute (B4). The 90-day `registrationValidDays` rule is config only; no fee guard in the database for a lease signed after it.
- Not run: `npm run ship`, any merge, any production migration. `docs/journeys/yesdoor-flow.md` marks the renter-stage and building-status order as UNVERIFIED (the database checks the values, not the order).
- Process note: this cloud session's shell had a **production** `DATABASE_URL` and live vendor keys in its environment. One `npm test` ran with them before it was caught: see Leftovers.

## B3

**B3a done** (pure half, branch `yesdoor/b3-matcher`, tip 41aa610): 18 modules + 18 test files under `src/yesdoor/`.
- Tests: 385/385 pass; lint and tsc clean.
- Built: config (with the §5b keys), util, match/rules, match/match (`matchBuilding`, `riskTier`, `lane`, `rankBackups`, `matchCandidates`, `buildingView`), match/mismatch, match/attribution (`feeEligible`), schedule, agreements/signed-link, fixtures (7 sample renters), sandbox providers (CRS, Plaid, e-sign, outbox, building connectors: manual, csv, mits-feed, entrata-sandbox), and the boundary test.
- Decisions accepted (Claude, owner said best judgment):
  - Tier C reading.
  - A listing at exactly max rent shows "likely."
  - Backup order: rent fit, then payer score, then distance.
  - The refund is owed only when our match said approved.
  - State rule keys: `background_check_notice_required` and `screening_fee_cap_cents`.
  - `buildingView()` is the only shape buildings ever get.
- Left for B3b: database wiring, the crons, the public endpoints, pulse rows, and the B2 config merge (keep the B3a copy).

## B4

## M1

Status: **avatars done — waiting on Chris.** Step 2 (marketing machine plan) has not started. It starts after Chris OKs the four avatars.

Built with Chris's Avatar Builder SOP (`.claude/workflows/avatar-builder.js`, 7 steps). Ground truth: `marketing/offers/yesdoor/industry-research.md`, plus new web research linked in each file. Every guess is marked [ASSUMED]. No quote or number is made up.

| # | Avatar | File | Core desire | Named mechanism |
|---|---|---|---|---|
| 1 | Sure-Thing Sam, prime renter (Yesdoor Verified) | `marketing/avatars/yesdoor/prime-renter.md` | The best unit, fast, with no wasted fees or doubt | The Yesdoor Verified Pass: verify once, apply where you're approved |
| 2 | Braced-for-No Bree, Second Chance renter | `marketing/avatars/yesdoor/second-chance-renter.md` | A real yes, record and all, without paying to find out | The Before-You-Apply Match: the building's own rules, checked first, plus a backup building |
| 3 | Occupancy-Gap Olivia, regional VP (AZ / SoCal) | `marketing/avatars/yesdoor/leasing-regional-vp.md` | Hit occupancy without more free rent, and stop fraud from turning into bad debt | The Verified Renter Pipeline: bank-verified income, your rules, pay on a lease that lasts 60 days |
| 4 | Guest-Card Gabe, broker / locator | `marketing/avatars/yesdoor/broker-locator.md` | Get paid for every renter placed, without fighting for it | The First-Touch Lock: email prequal plus timestamped registration before the tour |

New facts found (links in the files):
- Phoenix: 12.1% vacancy, over half of communities discounting, 6–8 weeks free in lease-up (Matthews, Q2 2025).
- Maricopa County: a record 87,310 eviction filings in 2024. Phoenix's filing rate is about twice the national rate (Eviction Lab, via KJZZ).
- 73% of rental fraud is caught after move-in (NAA, 2024).
- Texas: locator referrals were 6.5% of Greystar leases and 15% of Fogelman move-ins (CREDaily, secondhand).

Gaps:
- No first-person quotes from renters or locators. Reddit, Glassdoor and Ladders are blocked from the cloud session. Do this pass from the Mac before ads are written.
- No regional VP interviews yet.

Promises held back until true: application fee waived (no building has agreed yet), Yardi or RealPage connection, partner prices (recommended, not set), and "[N] pre-approved renters" (N must be a real count).

Manifest: added the 4 files above and this section. No code, routes or journeys changed.

## F1

## Leftovers

**Incident (2026-10-07, found by the parent session):** the cloud shell carries the production `DATABASE_URL` and live vendor keys. Several plain `npm test` runs today ran with them:
- one by the parent session around 02:xx UTC
- B2's unit phase, 07:33–07:40
- at least one more (B3a or F1) around 07:05

What was found:
- Production now has **34 test clients** in the `fundhub` org, created 07:05:55–07:07:24 UTC (emails `@example.test`, e.g. "Money Chain Client", `is_demo = true`).
- Other tables (events, ledgers, payment links) were not fully checked; the production read was blocked by the permission check.
- B2 reports four payment-link tests got 502 from a live Commas call, so it is unknown whether any Commas sessions were created.

What was done:
- Nothing deleted (deleting data needs Chris's OK).
- All later agents run tests with production variables removed (`env -u DATABASE_URL …`).

Chris decides:
1. Delete the 34 test clients and their child rows?
2. Remove `DATABASE_URL` and vendor keys from this cloud environment's settings?

- **B2, 2026-10-07: production credentials in the cloud session's shell.** The shell for this task carries the PRODUCTION `DATABASE_URL` (Supabase pooler, as `fundhub_app`) plus live Netlify, Supabase, Commas, Twilio, CRS and other keys. Every Yesdoor database command was given an explicit scratch `DATABASE_URL` (Postgres on 127.0.0.1), but one full `npm test` was started without clearing the environment before this was noticed. What ran: the unit phase only (780 files). It stopped with 15 failures, so the `*.pg.test.mjs` phase never started and the Yesdoor pg tests never ran (production has no `yd_` tables). The 15 are tests that expect no database or no keys: journeys-stale (real, fixed in this branch), push-credit netlify-blobs, CRS_ALLOW_LIVE host check, welcome-video, four in `payment-links-endpoints.test.mjs` (got 502, which means they tried a live Commas checkout call that failed), two default-org message routing checks, the db-handle shape check, the live row-lock catalog check, the app-role superuser guard, and one "pass that cannot run". None of these is a write test; the database ones are read-only catalog or routing reads. Not verified from here: whether any Commas checkout session was created, and whether the stubbed-database tests touched the real pool. Suggested check for whoever owns production: Commas for stray sessions between 07:33 and 07:40 UTC on 2026-10-07, and `orgs` for slugs `yesdoor-test-*` (there should be none). The clean rerun used `env -i` and a scratch database.
- **B2, 2026-10-07: full real-Postgres suite on the scratch database (owner connection, CI shape).** 3404 pg tests ran: all five Yesdoor suites pass; 167 other tests fail and 40 are cancelled in suites B2 did not touch. The error text names things outside migrations 434 to 436: `column "ghl_contact_id" does not exist` (clients), `column "video_kind" specified more than once`, `documents_client_id_fkey`, a missing `credentials/sim-identity` file. Not compared against a baseline build of the branch without B2, so "already failing" is the reading of the error text, not a measurement. Also 12369 of 12374 no-database tests pass in a clean environment after the journeys regeneration; the one then-failing test (journeys stale) is fixed in this branch.
