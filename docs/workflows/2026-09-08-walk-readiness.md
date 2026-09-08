# Walk readiness — 2026-09-08

Prep check for the fulfillment walks. Written on the rebuilt Mac after the eight
branches were merged into local `main`.

**Scope of what this proves.** Everything below is read out of the code and out of
Netlify's own environment listing. **No production data was read.** The harness
blocked every route to it this session — raw Postgres, the authenticated
`/api/dashboard/clients` call, and the MCP wiring. So this document answers "is
the SYSTEM ready", not "what state are the three clients in". Those are different
questions and the second one is still open.

Blocker numbers are from `docs/workflows/fulfillment-walk-2026-09-05.md` §2.

## Ready

| # | Blocker as written on 09-05 | Now |
|---|---|---|
| 2 | `SIM_WEBHOOK_SECRET` must exist in production and NOT be stored `--secret`, or every receipt is refused 401 | **Ready.** Netlify returns it whole, 48 chars. Stored unmasked, which is what push-payment needs |
| 3 | The Commas webhook does no work — a cron sweeper does. If it is not firing, push-payment prints 200 and nothing happens | **Ready.** `commas-inbox-sweeper` is in `netlify.toml:152`, and the vendor tree that killed every scheduled function on 09-06 is bundled at `netlify.toml:117`. That was PR #356, the last thing merged before the laptop died |
| 6 | The only Enroll button hardcodes the **$200 trial**. The six-round $1,000 program is reachable only from the live sales screen | **Fixed, and better than asked.** `src/workflows/repair-enrollment.mjs` enrols off the payment itself, called from `purchase-routing.mjs:281` on `deposit.paid` / `sale.closed` / `payment.received`. The trial is now the named exception, so a repair product added later gets the full course instead of silently capping a paying client at two rounds. The old button at `inquiry-remover.html:3989` still posts `{program:"trial", price_total:200}` — do not press it |
| 8 | No committed script writes `pii_identity` or `client_consents`. One must be written | **Ready.** `scripts/sim/seed-fulfillment-client.mjs` exists and does it — client, identity, consent, state, tier, and one open pay link. Dry-run unless `--confirm` |
| 10 | Lender match passes every lender when the client's state is empty — ~313 instead of ~20-26 | **Behaves correctly, by decision.** `match.mjs:372` — `if (!state) return true; // unknown client state — do not invent a block`. Unknown means include. The seeder writes a state, so a fresh walk client is not in this case |
| — | Walk1 gets a real checklist | **Ready.** `src/repair/enroll.mjs:166` seeds `client_waypoints`. The 09-06 board recorded 0 rows for Walk1 |

## Needs you, and only you

| # | What | Where |
|---|---|---|
| 1 | `push-payment.mjs` refuses unless an OPEN `payment_links` row exists, and the **only** thing that mints one is the closer deck's Send pay link button (`api/closer-deck.mjs:93`). One press per client, before the receipt | Closer deck, once per client |
| — | **Identity: A or B.** The walk clients carry your own identity. A = real identity, no bureau pull. B = sandbox identity, real pull. Nothing proceeds without this | `fulfillment-walk-2026-09-05.md:101` |
| — | `FANBASIS_CHECKOUT_API_KEY` comes back from Netlify as asterisks — stored `--secret`. Needed only to mint the pay link when seeding a **new** client. Read it off the Netlify UI, or re-set it | Netlify env |
| — | `MIGRATION_DATABASE_URL` is masked the same way. Only matters if migrations are run by hand; the production deploy runs them itself | Netlify env |

## Still unknown — needs a live look

None of this can be answered from code.

1. **What state Walk1, Walk2 and Walk3 are actually in.** Last known, from the 09-06 board: Walk2 never enrolled (events stop at `payment.received`); Walk3 only looked enrolled because the desk button was pressed, which caps it at 2 rounds; Walk1 has 11 tasks with two exact duplicates. The enrolment fix does **not** reach back and repair them — the board says both need enrolling by hand from the Present deck. Nothing records that being done. Two days stale.
2. **Whether the site deployed green** after PR #356 on 09-06. `/api/health` says `ok:true, db:up, migrations:270, pending:0`, so the database is current — but that does not prove the scheduled functions recovered.
3. **Whether the DOC-CHECK agent row is live.** Blocker 9: the funding document hold has no manual override anywhere. If that agent is not running, Walk1's funding card sticks on Apply Now permanently.
4. **Whether `synthetic=true` and `is_demo=true` are set** on all three. Blocker 0.2: these are the only two guards that stop real texts and real bureau calls about invented people. Neither `push-credit.mjs` nor `push-payment.mjs` writes them. On 2026-09-03 an unfenced loop sent 51 real texts to one phone in two hours.

## Not deployed

Local `main` is 63 commits ahead of what is live. The site is serving `5cee255a`
from 2026-09-06 12:52. Everything merged today — the ad script generator and
analytics, client documents, dispute letters, waypoint nudges, the rewritten
customer texts — is committed locally and has not shipped.

Nine database changes are waiting: migrations 302, 303, 371-376 and seed 295.
Seed 295 is the nine rewritten customer texts. They apply on the next migrate.

## The order, when you are at a real machine

Per `seed-fulfillment-client.mjs`. Getting it wrong fails silently.

1. `seed-fulfillment-client.mjs` — client, identity, consent, state, open pay link
2. `push-credit.mjs` — the credit file, which stamps `outcome_tier`
3. `push-payment.mjs` — the receipt, which starts fulfilment

Pay before the credit file is in and the money lands on a board that looks right
while F-01, S-06 and C-06 all read `outcome_tier`, find nothing, and return
quietly. No error, no red screen.
