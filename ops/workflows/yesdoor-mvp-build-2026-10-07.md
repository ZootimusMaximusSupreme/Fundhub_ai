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
| B1 | Detailed build spec: entities, states, events, endpoints, integrations, tests, Fundhub modules to copy | Opus | this session | claimed | — |
| B2 | Backend 1: database tables and migrations (Yesdoor-prefixed, own org) + read endpoints + tests | Sonnet | open | pending | B1 |
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

## B2

## B3

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
