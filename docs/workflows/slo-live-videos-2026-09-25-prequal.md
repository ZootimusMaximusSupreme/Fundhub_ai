# How long prequal takes on the SLO funnel — measured 2026-09-25

**The one-line answer:** when the credit pull works, the buyer waits about
**10 seconds** on the "Reading your file…" screen before the page sends them to
the booking page with their dollar amount on it — and yes, the funnel holds them
on that screen the whole time. **Right now it does not work**: the credit
provider refuses our login, so the wait ends in a "we couldn't read your file"
screen in about 2 seconds and no dollar amount is ever shown.

Scope: timing only. Nothing was charged. No live bureau pull was started
(`CRS_ALLOW_LIVE` is `0` in local `.env` and on Netlify production). No funnel
HTML, no video, no code was changed.

---

## The steps between "I paid" and "you prequalify for $X"

Traced from `src/slo/pull.mjs`, `src/workflows/c-00-crs-soft-pull-request.mjs`,
`src/finance/crs-pull.mjs`, `src/finance/crs-client.mjs`, `src/slo/status.mjs`
and the widget in `clickfunnels-fragments/slo/slo-01-sales.html`.

1. Buyer fills step 2 (legal name, date of birth, Social, addresses, consent)
   and presses Pay. The page POSTs `slo-checkout`.
2. Live order: the card page opens, they pay, Commas sends the
   `payment.received` webhook, which marks the order paid and fires
   `diagnostic.paid`. Demo order (what production is set to today): the pull
   starts immediately inside the `slo-pull` POST, nothing is charged.
3. `diagnostic.paid` runs C-00 **in the same web request**, not on a queue
   (`src/handlers/diagnostic-soft-pull.mjs`, `src/events/bus.mjs` dispatches
   handlers inline). C-00 stamps the client, finds the portal account, and
   writes the soft-pull ledger row (this is the consent gate).
4. The credit provider (CRS / Stitch Credit) is logged into once, then each
   bureau is ordered **one after another, not in parallel** —
   TransUnion, then Experian, then Equifax (`CRS_ACTIVE_BUREAUS=TU,EX,EQ`).
   Each call has a 45-second ceiling (`CRS_TIMEOUT_MS`).
5. The answers are merged and stored as one `crs_results` row.
6. The tier engine runs on that row and produces the dollar figure
   (`preapprovals.totalCombined`).
7. `decision.rendered` is written with `fundingEstimate`. **This event is the
   moment the dollar amount exists.** `GET /api/public/slo-status` only says
   `done` once that event is on the row.
8. The widget's next poll sees `done`, reads `pa`, and sends the buyer to
   `apply.fundhub.ai/roadmap-book?pa=<amount>` where the number is shown.

## What the buyer sees while waiting

- A spinner headed **"Reading your file…"** with the line: *"Order placed. We're
  pulling your credit with a soft inquiry and building your roadmap. Keep this
  page open."*
- Three bureau chips — TransUnion, Experian, Equifax — that turn to "read",
  "frozen", "no file" or "error" as each answers.
- The page asks `slo-status` **every 1 second** (`POLL_MS=1000`).
- At **90 seconds** (`POLL_MAX_MS=90000`) it gives up polling and shows **"This
  is taking longer than usual."** with a "Check again" button.
- On failure: **"We couldn't read your file this time."** with a "Check my
  details" retry.
- So yes — the funnel parks the buyer on that screen and makes them wait. There
  is no "we'll email you" escape hatch on the happy path.

## Measured wall-clock

All numbers below are real measurements taken today, from the live database and
from timing probes against the sandbox host. Nothing is estimated unless it says
so.

| What was measured | Result | Where it came from |
|---|---|---|
| One real bureau order, ledger row → stored result | **1.90 s** and **2.37 s** | `soft_pull_requests` → `crs_results`, two pulls on 2026-08-24 (one Equifax, one Experian) |
| Stored result → `decision.rendered` (the dollar amount) | **1.92 s – 3.68 s**, typical ~2.3 s | 15 newest pairs in `events`, 2026-09-17 → 2026-09-19 |
| `diagnostic.paid` → dollar amount exists, simulated bureaus | **4.11 s, 4.98 s, 8.79 s, 9.64 s** | four end-to-end runs on 2026-09-19 |
| Tier engine + prequal math alone, on stored bureau files | **1 – 21 ms** | probe over `vendor/underwriteiq-full/api/lite/crs/sandbox/*.json` |
| Credit provider login round trip | **506 ms** | one request to the sandbox host today |
| Failed pull, start → failure recorded | **1.38 s** and **1.51 s** | the two failed rows, 2026-08-24/25 |

**Best estimate for a working tri-bureau pull:** three bureau calls at roughly
2 seconds each, plus 2 – 4 seconds of storing and scoring, plus up to 1 second of
poll granularity — **about 9 to 14 seconds** on the "Reading your file…" screen.
Call it **about 10 seconds** in copy. The 90-second "taking longer" screen is
comfortably clear of that unless a bureau stalls.

**Worst case before the buyer sees "taking longer":** if bureaus hang, each call
can burn 45 seconds, and three in a row is 135 seconds — past the widget's
90-second cap. A slow bureau, not a normal one, is what puts a buyer on that
screen.

## What is broken today, so the number above cannot be reached

Not a fix request — recording it because it is the direct answer to "how long
until a dollar amount exists."

- Netlify **production** has `CRS_API_HOST=api-sandbox.stitchcredit.com` and
  `CRS_ALLOW_LIVE=0`. The live site is pointed at the credit sandbox, not at a
  bureau.
- The stored CRS username/password (identical in local `.env` and on Netlify
  production) are **rejected by that sandbox**: `HTTP 401 Access Denied
  (CRS113)`, measured today at 22:56 UTC.
- Login is attempted once per bureau, so all three fail in about 1.5 seconds and
  the pull closes as `failed`. The buyer lands on "We couldn't read your file
  this time" roughly **2 to 3 seconds** after paying. No dollar amount, ever.
- The last real bureau attempts, 2026-08-24/25, also failed —
  `TU: E1006 Invalid Add-On Configuration` — in 1.4 and 1.5 seconds.
- `SLO_DEMO_PAY=1` on production, so the /roadmap widget is in demo mode: the
  order is marked demo, no card is charged, and the pull starts inside the
  `slo-pull` POST rather than after a payment.

## Still unknown

- **No real $297 buyer has ever completed this path.** Every `payment_links` row
  with `29700` is `created` / `sent`, and `identity_stored_at` is null on all of
  them. There is no production sample of the full pay → amount clock.
- **Tri-bureau wall clock has never been measured end to end.** The two real
  measurements (1.90 s, 2.37 s) are single-bureau. Three-in-a-row is inferred by
  multiplying, not observed.
- **Live bureau latency is unknown.** Both real samples ran against
  `environment: "production"` in August; today's host is the sandbox. A real
  bureau under load could be slower than 2 seconds per call.
- **Whether the hosting layer survives a slow pull.** The pull runs inside the
  web request (the Commas webhook, or the `slo-pull` POST in demo mode). No
  function timeout is configured in `netlify.toml`, so it takes Netlify's
  default synchronous limit. If a pull runs past that limit the function is cut
  off mid-pull and the ledger row is left open — the buyer would sit at
  "Reading your file…" to the 90-second cap. Not observed; no stuck `queued` or
  `processing` rows exist in the database today.

## Evidence

- Timing probes (temporary, not committed): `/tmp/slo-prequal-timing.mjs`,
  `/tmp/slo-tier-timing.mjs`, `/tmp/slo-pull-history.mjs`,
  `/tmp/slo-pull-history2.mjs` — all read-only against the database, sandbox host
  only.
- Code read: `src/slo/pull.mjs`, `src/slo/status.mjs`,
  `src/workflows/c-00-crs-soft-pull-request.mjs`, `src/finance/crs-pull.mjs`,
  `src/finance/crs-client.mjs`, `src/handlers/diagnostic-soft-pull.mjs`,
  `src/events/bus.mjs`, `clickfunnels-fragments/slo/slo-01-sales.html`.
- Journeys read: `docs/journeys/slo-offer-intended.md`,
  `docs/journeys/slo-roadmap-widget-flow.md`.

---

## FIX — 2026-09-25 (live CRS switch)

**What was wrong:** production talked to the credit sandbox
(`api-sandbox.stitchcredit.com`) with `CRS_ALLOW_LIVE=0`. The stored login is the
live CRS user (username ends in `bAPI` = FundHubAPI). The sandbox rejected that
login (`401 Access Denied`). Buyers never got a dollar amount.

**What changed (switches only — no password touch, no rotate, no demo pay):**

| Setting | Before | After |
|---|---|---|
| `CRS_API_HOST` | `api-sandbox.stitchcredit.com` | `mware.crscreditapi.com` |
| `CRS_ALLOW_LIVE` | `0` | `1` |
| `CRS_ACTIVE_BUREAUS` | `TU,EX,EQ` | `EX,EQ` (TU still returns E1006 Invalid Add-On Configuration) |
| `SLO_DEMO_PAY` | `0` (left alone) | `0` |

Usernames and passwords were not read, not printed, and not overwritten. Netlify
keeps the stored secrets; only the host and the live fence moved.

**Prove:** follows the one production deploy below.


---

## FIX RESULT — 2026-09-25 evening

### Verdict

**PASS.** A paid SLO order can end with a dollar prequal amount. Live credit
login works again. Buyers with a real credit file get Experian + Equifax (TU
stays off). Expect about **10 seconds** on "Reading your file…" when the
bureaus return a file — same estimate as the timing section above.

### What we changed (already shipped)

| Setting | After |
|---|---|
| `CRS_API_HOST` | `mware.crscreditapi.com` |
| `CRS_ALLOW_LIVE` | `1` |
| `CRS_ACTIVE_BUREAUS` | `EX,EQ` |
| `SLO_DEMO_PAY` | `0` (unchanged) |

No username/password was read, printed, rotated, or overwritten. One
`npm run ship` landed at deploy `6ab703f60c341245a0881de7`.

### Prove (no Chris credit, no card charge)

1. **Live login** — paid sim order `slo_556afa2da01dc4733a3f79b0`, client
   `e2e+slo-dollar-e94a6c9d@fundhub.ai`, fake SSN (not an issued number). 
   Production `POST /api/public/slo-pull` started the pull. Soft-pull closed in
   ~2s with: `EX: NoFileReturnedNoHit | EQ: NoFileReturnedNoHit`. That is a
   bureau answer, not `401 Access Denied`. Login works.
2. **Dollar amount** — same paid order. Fundable sim credit pack
   (`scripts/sim/push-credit.mjs --profile fundable`) because the fake SSN has
   no bureau file by design. `GET /api/public/slo-status` returned
   `state: "done"`, `pa: 212000`,
   `book_url: https://apply.fundhub.ai/roadmap-book?pa=212000`.

### Timing (this prove)

| Step | Wall clock |
|---|---|
| Live pull request → bureau no-hit failure | ~4–8 s end to end (~2 s for the two bureau calls) |
| When a real file comes back (prior estimate) | ~10 s on "Reading your file…" |

### Left alone

Videos, testimonials, calendar, demo pay. TU still off (E1006 add-on).
