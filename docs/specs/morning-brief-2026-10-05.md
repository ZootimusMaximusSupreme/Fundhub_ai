# Morning brief and full systems check — spec (2026-10-05)

**Status:** spec only. Nothing is built yet. Build order is `CLAUDE.md` §3a. Work board: [`ops/workflows/morning-brief-2026-10-05.md`](../../ops/workflows/morning-brief-2026-10-05.md).

## What Chris asked for (2026-10-05)

- **One text every morning** that starts "Good morning, Chris." Detailed and formal, and also inspiring. Text, email, whatever works.
- **To a different number.** Today the morning text lands on the 661 line.
- **Systems:** every component still working. "The pulse or heartbeat doesn't check everything."
- **Marketing:** the numbers for the day, plus a link to the marketing dashboard (another thread is building it right now).
- **Money:** cash in and cash out from the accounts connected through Plaid (Finance OS; Plaid gets finished today).
- **Team:** what the people are doing.
- **AI ops suggestions:** "hey, this thing is breaking" or "we need to fix this." Chris doesn't have to take them.
- **Cadence:** Chris sets it. Nothing gets tweaked every day. The rules live in the repo.

**Why it matters (Chris, 2026-10-05):** system anxiety. Not knowing whether things still work makes him nervous, and he starts delaying projects. Re-running end-to-end checks out of worry costs tokens and money, and he can't remember whether he already checked. He called it one of his biggest problems, and it will stay one for the entire build.

Chris keeps his own walkthroughs; the morning check answers the daily "is it all still working" question so he stops re-running checks out of worry.

## What runs today (read from the code on 2026-10-05)

The heartbeat is the **daily pulse**, run by the Recon agent (AG-07): `src/pulse/daily-pulse.mjs`, scheduled in `src/workflows/daily-pulse.mjs`.

- It runs at **6:00 a.m. Arizona** (cron `0 13 * * *`, which is UTC).
- It texts one line to the number in `PULSE_SMS_TO` (or `CHRIS_PULSE_SMS`): "Fundhub morning check (date): X passed, Y failed, Z skipped. Failed: … Suggested fixes are on the pulse board."
- The same `PULSE_SMS_TO` number also gets Blake's lead-watch texts (`src/staff/blake-lead-watch.mjs`), and it's the fallback for the finished-ad text (`src/ad-videos/notify-fanout.mjs`).
- **The 661 number** (+1 661-605-4248) is the agent test line used for sim clients (`src/messaging/gate.mjs`, `AGENT_PROVE_PHONE_DIGITS`). The 2026-08-25 changelog says the pulse should text Chris's personal cell. Chris says the morning text lands on the 661 line, so `PULSE_SMS_TO` most likely holds the 661 number. The cloud can't read Netlify env to confirm, so confirm it from the Mac.

### What the pulse checks (9 checks)

| # | Check | What a pass proves |
|---|---|---|
| 1 | `/api/health?strict=1` | The database answers, and no database changes are waiting to be applied |
| 2 | `/login.html` | The login page loads |
| 3 | Client Control Panel apply door | That page loads with the right words |
| 4 | `/api/read/underwrite` | The route answers |
| 5 | Gate relay | Mac only. Always "skip" on the server |
| 6 | Recon agent row | AG-07 is marked live |
| 7 | Unrecorded sales calls | Counts held calls with no recording |
| 8 | Gmail | The prove inbox search works |
| 9 | 272 page pings | 234 API routes, 37 staff screens and /climate/ each answer a GET |

### What it misses — why it feels like it doesn't check everything

1. **A route that refuses counts as "up."** An API route that answers 400, 401, 403 or 405 passes. So most of the 234 API pings only prove the route exists.
2. **Nobody checks the other 25 scheduled jobs.** The message sender (every 5 minutes), the Meta ad sync, the drips, the Commas inbox drain, the Finance OS pull, the payout run and the rest are all unchecked. Nothing records when a scheduled job last ran.
3. **Stuck messages.** Nothing checks for texts or emails waiting in the queue too long, or failing to send.
4. **The dead-letter list.** `failed_events` (what broke, in which handler) is never read.
5. **Customer pages.** The funnel pages on apply.fundhub.ai (/roadmap, /watch, /apply, /funding-book-call, the thank-you pages) and the VSL video file are not checked. Only fundhub.ai routes and /climate/ are.
6. **Money in.** Nothing checks that payment notices still arrive, or that a pay link can still be made.
7. **Ad tracking.** Nothing checks that Meta accepted yesterday's server events (Lead, Schedule, Purchase).
8. **Outside services.** No key is tested except Gmail: Twilio, Meta, ClickFunnels, Commas, ClarityPay, Plaid, the credit-pull vendor (CRS), Submagic, OpenAI.
9. **A paused site.** Netlify paused the site once for bandwidth. The pulse would only show that as everything down, with no reason.
10. **The board it points to is not kept.** The text says "Suggested fixes are on the pulse board." On the server the board file can't be saved, because only `/tmp` is writable there and `/tmp` is wiped. The failures are saved in the database (`agent_runs.detail`, cut at 2,000 characters).
11. **A skip sits next to a pass.** "8 passed, 0 failed, 2 skipped" reads as fine, even though the 2 skipped checks never ran.
12. **Work sitting on the Mac.** Nothing tells Chris when work on the Mac hasn't been pushed to GitHub. He saves to Git on weekends (Chris, 2026-10-05), so work can sit unsaved for days. The pulse runs on the server and can't see the Mac, so this needs a small Mac-side reporter (the gate relay already runs there).

## The morning text (shape — placeholders, not real numbers)

```
Good morning, Chris. <weekday, date>.

Systems: <n> of <n> checks green. <"Nothing needs you." or the red ones in one line each>
Yesterday: <cash in> in, <cash out> out. <booked calls> booked at <cost per booked call>, <shows> showed, <sales> sold.
Team: <calls held>, <no-shows>, <files funded>.
<Up to 1 suggestion in the text. The rest are in the report.>

Full report: <link>
```

The **full report** (the link) has six parts, in this order:

1. **Systems** — every check: green, red, or not checked, each with its proof (a time or a count). Each red one says what a customer sees, since when, and the fastest fix.
2. **Marketing** — yesterday and the 7-day trend: spend, booked calls, cost per booked call, shows, show rate, sales, cash, return on ad spend. Ads that are dying by the watch-curve law (`marketing/ads/watch-curve.md`). Link to the marketing dashboard. It uses the same numbers as the dashboard, from one source.
3. **Money** — cash in and cash out yesterday and month to date, per connected account (Fundhub LLC, Fundhub Credit Solutions, FH Consulting), and how much ad money is left on the credit line.
4. **Team** — per closer: calls held, no-shows, sales. CSM overdue tasks. Funding advisor files in progress and funded. Unrecorded calls.
5. **Suggestions** — at most 3, from the AI ops agent, by the cadence rules below.
6. **Today** — the one thing that matters most today.

## Rules for the systems check

- **Green means it ran and passed, with proof.** A skipped check shows as "not checked" with the reason. The headline never says all green while anything is not checked.
- **No text by 6:15 a.m. Arizona means the checker itself is down.** That's the signal. There's no second watchdog: Recon (AG-07) stays the one tripwire, and this extends it (`src/pulse/daily-pulse.mjs` header).
- **Audit only.** It never fixes anything, never pulls credit, never charges a card, never mails paper (existing pulse law).
- **Clarity export is never part of the daily check.** Owner law: one pull per time Chris asks (`.claude/rules/clarity-export-rate-limit.md`).
- **Repeats are counted.** The same failure on a second morning says "day 2."
- **Each check is cheap and read-only.** Outside services get a harmless read (for example "who am I" on the account). Nothing writes, sends, or spends.

## Cadence rules — DRAFT. Chris sets the numbers.

These are **not law** until Chris says yes. After that they become `.claude/rules/change-cadence.md` plus `.cursor/rules/change-cadence.mdc` plus one owner-set line in `CLAUDE.md` (the rules-for-both law). Rules 2, 4 and 6 come from things already in the repo. The rest are starting defaults for Chris to change.

1. **Nothing changes by itself.** Every suggestion waits for Chris or for the person who owns that thing.
2. **Broken things get fixed the same day.** A red systems check counts as a repair, so the cadence limits below don't apply to it. (From the pulse: suggested fixes, never auto-fix.)
3. **New ad, no verdict too early.** An ad gets no verdict until it has spent 2× the target cost per booked call, and it has run at least 3 days. *(Default.)*
4. **Raising daily spend follows the model's ramp.** First, cost per booked call holds for a week. Second, the closers are under 90% full. Third, real sales came in that week. (`ops/workflows/ads-waterfall-projections-2026-08-26.md` §9.)
5. **Budget moves are small and slow.** One change per ad set every 3 days, and no more than 20% up or down. Meta needs about 50 of the optimized event in 7 days to finish learning, and a big edit restarts the count. *(Default.)*
6. **Pages, VSL and copy change weekly, one change at a time.** This matches the weekly read in the marketing machine (owner, 2026-10-04).
7. **Offers and prices stay put until 20 real sales** on the current version. *(Default.)*
8. **Suggestions:** at most 3 a morning, the biggest dollar impact first. Each one names its rule and the numbers behind it. A suggestion Chris passed on doesn't come back for 7 days, unless the numbers get worse. *(Default.)*

## AI ops suggestions — how they are made

- Reuse the weekly brief pattern (`src/ops/weekly-brief.mjs`). The numbers come from plain database reads, and they're correct with the model switched off. The model then writes the suggestions, grounded only in those numbers. If the model is down, the brief goes out with numbers only.
- The voice is the Ops / AI COO from `src/ops/pulse.mjs` and `src/ops/briefs.mjs` ("What needs doing today?").
- A suggestion that breaks a cadence rule is never sent. It waits for its window.

## Reuse before building

| Need | Already in the repo |
|---|---|
| Systems checks | `src/pulse/daily-pulse.mjs`, `src/pulse/registry.mjs` (extend; no second watchdog) |
| Text send | `src/pulse/notify.mjs` → `src/messaging/providers/twilio.mjs` |
| Phone buzz | `src/messaging/providers/ntfy.mjs` |
| Company 8, pods, calendar, Meta snapshot | `src/ops/pulse.mjs`, `src/ops/briefs.mjs` |
| Numbers plus model write-up | `src/ops/weekly-brief.mjs` |
| Dying-ad rule | `src/ops/watch-curve.mjs`, `marketing/ads/watch-curve.md` |
| Dead letters | `failed_events` table, `api/read/failed-events.mjs` |
| Money | Finance OS reads (`api/read/finance-command.mjs`, `api/read/money-map.mjs`), Plaid |

## Build order (`CLAUDE.md` §3a)

1. **Workflow questions**, one at a time (list below).
2. **Schema:** `job_heartbeats` (one row per scheduled job run: job, started, finished, outcome, count), written at the end of every sweeper. `morning_briefs` (one row per day: each section, the text, the link, who it went to, when, delivery status). `ops_suggestions` (rule, numbers, status open / taken / passed, quiet-until date).
3. **Read endpoint and tests:** `GET /api/read/morning-brief?date=`. Tests run against a real database.
4. **Diagram:** `docs/journeys/morning-brief-flow.md`.
5. **Front end last:** the report page the text links to.

## Questions for Chris — one at a time, in this order

1. **What number should the morning text go to?** This blocks the send. Moving `PULSE_SMS_TO` also moves Blake's lead texts and the finished-ad text to that number.
2. What time? Today it's 6:00 a.m. Arizona.
3. Text only, or text plus an email with the full report? Which email?
4. Cadence rules: yes to the draft, or which numbers change?
5. Team section: which numbers per person?

## Boundaries

- Recon (AG-07) stays the only watchdog. This extends it.
- Checks report and people fix. Nothing fixes itself.
- Chris keeps his own walkthroughs.

## Sources

- Meta learning phase (about 50 optimization events in 7 days, and a big edit restarts it): https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/
