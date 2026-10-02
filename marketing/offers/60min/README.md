# The 60 Minute Offer

Owner project, opened 2026-09-23. **Private system for Chris** (owner-set 2026-09-24) — not a
product with customers. Do not design it multi-tenant, do not build onboarding or support for it.

## The offer

You bring an offer. You get a live business in under an hour: sales page, checkout on your own
merchant account, booking calendar, follow-up, and the delivery flow that runs when somebody pays.
Every piece proved before handover.

Domain **the60minuteoffer.com** — confirmed unregistered 2026-09-23. Not yet bought.
`60minuteoffer.com` is taken. `the60minuteoffer.ai`, `60minuteoffer.ai` and
`the60minutecompany.com` were open the same day.

## The clock

Measured against this repo's own numbers, not guessed.

| Minutes | Phase | Parallel |
|---|---|---|
| 0–2 | Generate every component | 1,000 agents |
| 2–10 | Test and fix each component | 1 agent per component |
| 10–15 | Migrate and deploy | serial |
| 15–17 | Money path end to end | serial |
| 17–19 | 200 adversarial users | 200 agents |
| 19–20 | Vision pass on every screen | 1 per screen |
| 20–27 | Fix round | as needed |
| **27** | **Live** | 33 minutes spare |

**Why 27 and not 600.** The first estimate was 10 hours, because this repo's Playwright suite
takes **18.3 minutes** for one serial run and convergence needs many runs. The fix is Chris's:
test each component in parallel with its own agent, and gate the launch on the **money path only**
— land → optin → checkout → paid → booked → follow-up, about 12 clicks, ~90 seconds sharded.
The other 387 browser tests run after you are live. That single change is what collapses the clock.

Recorded timings this is built on: unit suite ~36s, Playwright suite 18.3 min / 388 tests.

## The proof stack

The hard problem, in Chris's words: *"sometimes we test and run end to end tests and then I do a
human end to end and shit is still fucked up."*

One root cause: **the same understanding writes the code and writes its test**, so they agree with
each other and are both wrong. Nine countermeasures, ranked by how much of the gap each closes:

1. **Writer is never the tester.** A second agent writes tests from the spec, never seeing the code.
   Disagreement between them *is* the bug, surfaced automatically.
2. **A skipped test fails the gate.** This repo reports `3730 passing, 0 failing` with 442 tests
   silently skipped when `DATABASE_URL` is unset — see `CLAUDE.md` §12. That is a green light on
   nothing.
3. **Zero mocks on the money path.** Real Postgres, real payment sandbox, real browser.
   `src/messaging/providers/memory.mjs` is fine for unit tests and poison for a launch gate.
4. **A machine looks at the screen.** Not "did it return 200" but "could a person finish this?"
   Screenshot every step, vision agent judges. Catches the spinner that never stops and the button
   below the fold.
5. **200 adversarial users.** Double-click submit, back mid-checkout, refresh on payment, two tabs,
   emoji in the name field, `+` in the email, abandon and return an hour later.
6. **Ugly data, not tidy fixtures.** Nulls, apostrophes in surnames, ten-year-old dates, a phone
   number with no area code.
7. **Never run the gate as a superuser.** This repo's tenant isolation tests passed for months
   while isolation was broken, because the connection role bypassed row-level security. `fundhub_app`
   exists for this.
8. **Found by hand once, never again.** Any path a human finds broken joins the gate permanently.
9. **It keeps watching after launch.** A canary buys something on production every five minutes and
   shouts. `ntfy` and web push are already wired in this repo.

Cost of all nine: **+5 minutes** of the 33 spare.

## What is NOT in the hour

None of these are code and none go faster with a better model. They are the pre-warm list:

- Domain registered and DNS pointed (put it on Cloudflare — seconds, not hours)
- Merchant account created and live
- Ad account warm, creative uploaded and paused
- **The offer decided.** This one is Chris, not an agent.

## What this repo already gives it

The expensive parts are built and running: auth, subscriptions and invoices, the message dispatcher
across email/SMS/WhatsApp/voice/push, the agent runtime with guardrails, white-label branding
(`src/brand/`, `src/partners/`), ClickFunnels HTML push, ad attribution back to the exact ad, and
the workflow engine on a five-minute heartbeat. A new brand is env values and a new page, not a new
platform.

Commas is already integrated end to end — checkout links, webhooks, inbox, reconciliation
(`src/payments/`, `src/subscriptions/`, `COMMAS_*`). Known gap: a webhook Commas fails to deliver
is logged and dropped on their side, so that payment is invisible until a human notices. Build the
daily reconciliation check on day one.

## Economics, measured

Regenerating this repo from scratch (558k lines: 207k app, 226k tests, 46k SQL, 78k front end) at
Lithos's published Kimi K3 rates — $2.40/$12.00 per million base, $5.60/$28.00 ultra — comes to
roughly **$600–2,000 base, $1,500–4,500 ultra**. Tokens are not the cost. Verification is.

On speed: Lithos claims 800 tok/s, ~16× typical. That is real for *writing*. End to end it is
2–3×, because inference is roughly a third of an agentic loop and test runs, deploys and browser
checks did not get faster. Do not quote 16× for delivery.

## Files

- [integration-agent.md](integration-agent.md) — the agent that wires accounts by API
- [site/the60minuteoffer.dc.html](site/the60minuteoffer.dc.html) — the sales page
- [site/canvas.json](site/canvas.json) — canvas index for both boards
- Live canvas: https://claude.ai/artifact/RKPFVnkZt211zhaiBK1KBM

## Open

Pricing is `[PRICE]` in all three tiers. Nothing else is blocking.
