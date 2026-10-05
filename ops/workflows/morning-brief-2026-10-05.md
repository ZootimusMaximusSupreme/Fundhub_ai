# Morning brief and full systems check — work board (2026-10-05)

Source: Chris, voice note 2026-10-05. Spec: [`docs/specs/morning-brief-2026-10-05.md`](../../docs/specs/morning-brief-2026-10-05.md). Projection: [`docs/finance/call-funnel-projection-2026-10-05.md`](../../docs/finance/call-funnel-projection-2026-10-05.md).
Rules: read `CLAUDE.md` first. Claim your row before you start. Write your manifest here when done.

Model: Opus — the cloud session that wrote this board is on Opus. Match. MB2 and MB3 touch the one tripwire (Recon AG-07) and the outbound text path, so they need Opus with thinking effort up.

## The split — 6 workflows

| ID | Owns | Waits on | Status |
|---|---|---|---|
| MB0 | Projection, spec, this board, to-do lines (cloud session, 2026-10-05) | — | done |
| MB1 | The morning text goes to Chris's new number | A Mac session (the cloud can't reach Netlify) | blocked — Kickoff A ran in a cloud session 2026-10-05, not the Mac; the cloud was refused Netlify env access. Needs the Mac. |
| MB2 | Full systems check: extend the daily pulse (Recon AG-07) to every component | — | done — PR #30 merged 2026-10-05 |
| MB3 | Morning brief: "Good morning, Chris" text + stored report, built from MB2 + team + marketing + money | MB1 to send live (it builds and dry-runs without it) | done — PR #22 merged 2026-10-05 |
| MB4 | Cadence rules and AI ops suggestions | Chris said yes 2026-10-05 | done — PR #29 merged 2026-10-05 |
| MB5 | The report page the text links to (front end, last) | MB3 read endpoint | done — PR #31 merged 2026-10-05 |
| MB6 | Evening brief (end-of-day text) + the brief replaces the old pulse text when live | MB3 (merged) | claimed — Kickoff A agent, 2026-10-05 |


**Runs at the same time:** MB1, MB2 and MB3 now. MB4 after his yes. MB5 after MB3.

**MB1 number:** received from Chris 2026-10-05, ends in 6457. The full number stays out of the repo (`.env.example`: "Do not commit the number"). It was given to Chris in chat inside the MB1 prompt. Checked 2026-10-05: the cloud's egress proxy refuses `api.netlify.com`, and computer use can't type into Terminal, so MB1 runs in a Claude Code session on the Mac.

**Real dependency:** MB3 reads MB2's scorecard. Both build to the contract below, so neither waits for the other to finish.

**Outside this board:** the marketing dashboard is being built in another thread. MB3 reads the same numbers and links to it, and must not rebuild it. Money (Plaid cash in and out) needs the Plaid production keys (Chris, today). Until then the money section says "not connected yet" in one line.

## Shared context brief (read once, do not re-discover)

- Today's heartbeat: `src/pulse/daily-pulse.mjs` (9 checks plus 272 GET pings in `src/pulse/registry.mjs`), cron `0 13 * * *` = 6:00 a.m. Arizona, in `src/workflows/daily-pulse.mjs`. It texts `PULSE_SMS_TO` (or `CHRIS_PULSE_SMS`) via `src/pulse/notify.mjs`.
- `PULSE_SMS_TO` is shared: the daily pulse, Blake referral-lead texts (`src/staff/blake-lead-watch.mjs`), and the finished-ad text fallback (`src/ad-videos/notify-fanout.mjs`).
- 661 = +1 661-605-4248, the agent test line for sims (`src/messaging/gate.mjs`). Chris gets the morning text there today. The 2026-08-25 changelog intent was his personal cell.
- The 12 gaps are listed in the spec under "What it misses." Fix those (gap 12, the Mac reporter, is plan-only until Chris says yes). Do not add a second watchdog. Recon AG-07 stays the one tripwire.
- Audit only. No auto-fix. No credit pull. No card charge. No paper mail. Never call the Clarity Data Export from a check.
- Money is integer cents (`src/commissions/money.mjs`). Outbound sends only through `src/messaging/providers/*` (`CLAUDE.md` §12).

### Scorecard contract (MB2 writes it, MB3 reads it)

```
{
  date: "YYYY-MM-DD",            // America/Phoenix
  ran_at: ISO timestamp,
  checks: [{
    id, group,                   // group: front_doors | backend | jobs | messages | money_in | tracking | outside | site | mac
    status: "green" | "red" | "not_checked",
    proof,                       // a time or a count; required when green
    customer_sees,               // red only: what a customer or staff member sees
    since,                       // red only: first morning it went red
    day_count,                   // red only: 1, 2, 3...
    fix                          // red only: fastest likely fix
  }]
}
```

Stored in the database, one row per morning. `not_checked` is never counted as green.

## Questions for Chris (one at a time, in this order)

1. ~~What number should the morning text go to?~~ Answered 2026-10-05 (ends in 6457).
2. ~~What time?~~ Answered 2026-10-05: 6:00 a.m. and 9:00 p.m. Arizona.
3. Text only, or text plus an email with the full report? Which email?
4. ~~Cadence rules~~ Answered 2026-10-05: yes, as a starting point. Light guardrails; no automatic changes; Chris sets the numbers later from proven data (for example, when CRO suggestions start, by spend over time).
5. Team section: which numbers per person?
6. Financed deposits for 30 days: what counts as a "really good file"? (Projection doc)

### Plans approved 2026-10-05 (Chris: "run it, run the whole thing")

**Owner decisions 2026-10-05 (Chris):**
- When the brief goes live, it **replaces** the old "Fundhub morning check" text. ("The text sucks.")
- Add an **end-of-day brief** too. Overnight is when ads break and deals come in, so Chris should know what is going on before bed and when he wakes up. Times (owner-set): 6:00 a.m. Arizona morning, 9:00 p.m. Arizona evening.

- Morning and evening briefs carry the **same** content, in full detail ("every hole of the company"): systems awareness first, then sales team metrics, finances (Finance OS), and ad metrics. Ad and sales numbers are **organized per offer and per funnel**. The stored report is the detailed document, shown on the MB5 page. The text is a short summary pointing to it. The format (text, email or page) matters less than seeing everything in one place.

**Migration numbers:** 430 = MB2 (scorecard, job heartbeats). 431 = MB3 (`morning_briefs`). 406–429 are held by the marketing machine.

**MB3 plan (summary).** The brief runs as step 2 of the 6:00 a.m. pulse job (`src/workflows/daily-pulse.mjs`), so it always runs after the pulse. Dry-run: built and saved, nothing new sent. One row per morning in `morning_briefs` (only the last 4 digits of the number are stored). Read page `GET /api/read/morning-brief?date=`, owner and admin only. Numbers are plain database reads, with no model.
- Systems: MB2 scorecard; until then the pulse result in the same shape.
- Marketing: spend from `ad_metrics_daily`; the rest says "waiting on the marketing numbers" until the marketing machine's numbers (M5) merge.
- Team: `computePulse()`, `call_outcomes` per closer, CSM overdue `tasks`, `listUnrecordedCalls`. Advisor files per person: no source today.
- Money: "Money: not connected yet." until Plaid is live in production. Per-company split and ad credit line: no source today.
- Suggestions and "Today": empty until MB4.

**Defaults used until Chris says otherwise (orchestrator, 2026-10-05):** the old pulse text keeps going (the brief does not replace it yet); numbers cover the last 24 hours; the text has no link until MB5; the Mac reporter (gap 12) is plan only.

**MB2 plan (summary).** Every check reports green, red or not checked, using the board's contract.
- New checks:
  - jobs: 30 scheduled jobs, each red when it misses 3 times its schedule. The `job_heartbeats` table is written by one Inngest add-on, plus one line in each of the 6 Netlify sweepers.
  - messages: the waiting queue and send failures, per channel.
  - backend: `failed_events`.
  - front_doors: 7 funnel pages and the VSL files.
  - money_in: Commas, the ClickFunnels order (only if its order field is found), ClarityPay (not checked: no connection exists yet).
  - tracking: Meta server events.
  - outside: one read-only call per service. Never the Clarity export, and never a credit pull.
  - site: Netlify not paused, last deploy ready.
  - mac: plan only.
- Gap 1: each API ping must get its exact expected answer, in the app's own refusal shape.
- Migration 430: `job_heartbeats` and `pulse_scorecards`, one row per Arizona date. A red on a second morning says "day 2."
- Read page: `GET /api/read/systems-check?date=`, owner and admin only.
- Journey: new `docs/journeys/daily-pulse-actual.md`. `ops-pulse-actual.md` describes the Ops money pulse, a different thing.

**MB2 defaults (orchestrator, 2026-10-05):**
- Red after no Commas notice in 72 hours, no ClickFunnels order in 72 hours, or a message waiting more than 30 minutes.
- No `NETLIFY_AUTH_TOKEN` gets copied to the live site, so the site check shows "not checked" until one is set.
- No new pulse staff login. The Mac reporter is not built.
- The daily check keeps its own text.

**Open questions for Chris (MB2):**
1. Build the Mac reporter, yes or no?
2. May an agent set `NETLIFY_AUTH_TOKEN` on the live site so the site check runs?
3. Should a `daily-pulse-intended.md` exist (written by Chris)?

**Open questions for Chris (MB3):**
1. When the brief goes live, should it replace the old "Fundhub morning check" text?
2. "Last 24 hours" or "yesterday, midnight to midnight Arizona"?
3. Which bank accounts belong to Fundhub LLC, Fundhub Credit Solutions and FH Consulting?
4. Where is the ad credit line recorded?

---

## Prompts (each one works pasted into a new session)

### MB1 — text goes to the new number (run on the Mac; the cloud can't reach Netlify env)

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/morning-brief-2026-10-05.md. Mark MB1 "claimed" before you start.

Chris's new number for the morning text: <NUMBER FROM CHRIS>.

1. Read PULSE_SMS_TO and CHRIS_PULSE_SMS from local .env and from Netlify production
   (netlify env:get, or the refresh script if masked). Say by name which is set, and whether it is
   the 661 agent test line (+16616054248). Do not print any other secret.
2. Set PULSE_SMS_TO to the new number in E.164 (+1 and ten digits):
   netlify env:set PULSE_SMS_TO "<+1...>" --context production --context deploy-preview --context branch-deploy --secret
   This also moves Blake's referral-lead texts and the finished-ad text fallback to the new number.
   Write the old value's last 4 digits on the board first, so nothing is lost.
3. One deploy only: npm run ship. Confirm /api/health reads pending 0. A new env value only reaches the
   functions on a deploy; if ship skips because nothing changed, say so on the board.
4. The next 6:00 a.m. run is the proof. Read Twilio's message log (read-only API) and confirm the
   morning text went to the new number, not 661. Do not run the pulse with --live to test it.
   Write the manifest here.
No code change. Never unset or clear any key.
```

### MB2 — full systems check (extend Recon AG-07)

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first
(§3 plan before code, §3a build order, §12 traps). Board: ops/workflows/morning-brief-2026-10-05.md.
Mark MB2 "claimed" before you start. Spec: docs/specs/morning-brief-2026-10-05.md.

Goal: Chris never has to wonder if a part of the system still works. Extend src/pulse/daily-pulse.mjs
(Recon AG-07). Do not build a second watchdog.

Close the 12 gaps in the spec's "What it misses" list:
- job heartbeats: one row per scheduled-job run, written at the end of every sweeper in
  src/workflows/*.mjs; red when a job has not run within 3x its cron interval
- message queue: oldest queued message age, send failures in the last 24 hours, by channel
- failed_events: open count and new in the last 24 hours
- customer pages: apply.fundhub.ai /roadmap, /watch, /apply, /funding-book-call and the thank-you
  pages load with their expected words; the VSL video file answers
- money in: last payment notice received per provider; red when older than the agreed window
- tracking: Meta server events accepted in the last 24 hours, errors 0
- outside services: one harmless read per key (Twilio, Meta, ClickFunnels, Commas, ClarityPay,
  Plaid, CRS, Submagic, OpenAI). Never the Clarity Data Export.
- site: Netlify site not paused, last deploy succeeded
- the scorecard is stored in the database (contract on the board), not in a file the server can't keep
- "not checked" is shown as not checked and never counted as a pass
- the same red on a second morning says day 2
- the Mac's copy of the repo: unpushed commits and uncommitted files, so nothing waits on the Mac
  until the weekend (needs a small Mac-side reporter; the gate relay already runs there). Plan it,
  do not build it before Chris says yes.

Order: write the plan (checks, schema, files) on the board and wait for Chris's yes. Then the migration,
the read endpoint with tests against a real database, docs/journeys/morning-brief-flow.md, and
docs/journeys/ops-pulse-actual.md updated in the same commit. Add every new route to
src/pulse/registry.mjs. Lint, tsc, test suite. Commit, push, PR. No deploy except npm run ship once.
```

### MB3 — the morning brief

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first
(§3a build order). Board: ops/workflows/morning-brief-2026-10-05.md. Mark MB3 "claimed" before you start.
Spec: docs/specs/morning-brief-2026-10-05.md ("The morning text" and "The full report").

Build one morning text that starts "Good morning, Chris." plus a stored full report:
- Systems: read the scorecard contract on the board (MB2). Until MB2 lands, use today's
  runDailyPulse() output mapped to the same shape.
- Marketing: same numbers as the marketing machine another thread is building. Its spec is
  docs/specs/marketing-machine-2026-10-04.md (journey: docs/journeys/marketing-machine-intended.md).
  Read its numbers from the same source. Do not rebuild it. Link to its dashboard.
- Team and company numbers: src/ops/pulse.mjs and src/ops/briefs.mjs (company 8, pods, calendar).
- Money: Finance OS reads (api/read/finance-command.mjs, api/read/money-map.mjs). If Plaid is not in
  production yet, one line: "Money: not connected yet."
- Suggestions: leave the slot empty until MB4 lands.
Numbers come from plain database reads (the src/ops/weekly-brief.mjs pattern) and are correct with no
model. Send through src/pulse/notify.mjs to PULSE_SMS_TO. Dry-run until MB1 is done.
One row per morning in morning_briefs. Plan on the board first, wait for Chris's yes, then schema,
read endpoint and tests, diagram, code. Lint, tsc, tests. Commit, push, PR.
```

### MB4 — cadence rules and AI ops suggestions (after Chris says yes to the draft)

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first.
Board: ops/workflows/morning-brief-2026-10-05.md. Mark MB4 "claimed" before you start.

Chris approved the cadence rules with these numbers: <PASTE HIS ANSWER>.
1. Write them as law in both homes: .claude/rules/change-cadence.md and .cursor/rules/change-cadence.mdc,
   plus one owner-set line in CLAUDE.md (do not renumber sections).
2. Build suggestions: at most 3 a morning, biggest dollar impact first, each names its rule and the
   numbers. A passed suggestion stays quiet 7 days unless the numbers get worse. Nothing changes by
   itself. Model write-up grounded only in the numbers (src/ops/weekly-brief.mjs pattern); numbers
   only if the model is down. Store in ops_suggestions. Plan on the board first, then schema, read
   endpoint and tests, diagram, code. Commit, push, PR.
```

### MB5 — report page (front end, last)

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first
and docs/rules/UI-STANDARDS.md (law for public/app/). Board: ops/workflows/morning-brief-2026-10-05.md.
Mark MB5 "claimed" before you start. Only after MB3's read endpoint is merged.

Build the page the morning text links to, behind the staff login, owner and admin only. Six parts in
the spec's order: Systems, Marketing, Money, Team, Suggestions, Today. Red checks first. Every number
shows where it came from. Add the page to src/pulse/registry.mjs. Live Playwright check. Commit, push, PR.
```

## Run it all — two kickoff prompts (Chris, 2026-10-05)

Paste each into Claude Code on the Mac, running Opus. They are independent and can run side by side in two sessions.

### Kickoff A — morning brief and systems check (MB1 to MB5)

```
Fundhub repo. Read CLAUDE.md, then ops/workflows/morning-brief-2026-10-05.md and docs/specs/morning-brief-2026-10-05.md.
Chris approves the split on the board. Run MB1 first myself on this Mac (the new text number is +14808656457; follow the MB1 prompt on the board).
Then delegate MB2 and MB3 to two agents at the same time, each using its prompt on the board, each in its own worktree and branch, each opening one PR.
MB5 starts after MB3's read endpoint merges. MB4 stays blocked until Chris says yes to the cadence rules.
Mark each row claimed on the board before it starts and write its manifest when done. When every PR is merged, delete each merged branch locally and on GitHub, run npm run ship once, and finish with the CLAUDE.md section 9 report.
```

### Kickoff B — marketing machine (another thread owns it)

```
Read docs/specs/marketing-machine-2026-10-04.md and run section 0. I approve the spec, its split and the intended journey. Section 17: all defaults. Start the lanes.
```

Agents for Kickoff B are in `.claude/agents/` (mm-architect, mm-builder, mm-chore, mm-reviewer). Step prompts are in the spec, section 0.9.

---

## Leftovers (found, not owned by this board)

- 2026-10-05: the GitHub test job "Named guards" is red on `main` because the test that every read page filters by company fails for 2 pages: `api/read/blueprint-combined-approval.mjs` and `api/read/eeo-aggregate.mjs`. This is not from this batch. It needs its own fix.

## Manifests

### MB0 — cloud session, 2026-10-05

- Added `docs/finance/call-funnel-projection-2026-10-05.md`: the repo's book-a-call model re-run for $2,500 / $3,000 / $50,000 at $30 / $50 / $100 per booked call; the closer limit; the $250K/month math; the 30-day deposit financing decision (owner-set); the ClarityPay facts and the 2 questions for the rep.
- Added `docs/specs/morning-brief-2026-10-05.md`: what Chris asked, what the pulse checks and misses (read from the code), the text shape, the check rules, the cadence draft, the build order.
- Added this board. Added to-do lines in `TODO.md` and `ops/todo-2026-10-05.md`.
- No app code, schema, env or deploy changed.

### MB3 — Kickoff A agent, 2026-10-05 (PR #22, merged)

- New: `db/migrations/431_morning_briefs.sql`, `src/ops/morning-brief.mjs`, `src/finance/cashflow.mjs`, `api/read/morning-brief.mjs` (`GET /api/read/morning-brief?date=`, owner and admin only), `docs/journeys/morning-brief-flow.md`, and tests.
- Edited: `src/workflows/daily-pulse.mjs` (step 2 "morning-brief" runs after the pulse), `src/pulse/notify.mjs` (`textMorningBrief`), `src/pulse/registry.mjs`, `netlify/functions/api.mjs`, `api/read/finance-command.mjs` (uses the shared cash read, same query), `src/http/read-endpoints-org-scope.test.mjs` (one entry: the company filter lives in `readMorningBrief`), `db/expected-migrations.mjs`, `docs/journeys/CHANGELOG.md`.
- Dry-run: `MORNING_BRIEF_LIVE = false`. The brief is built and saved, and nothing is texted. The old pulse text is unchanged.
- Tests: lint clean, tsc 0. With no database, the suite fails the same 33 tests that already fail on `main`. On a scratch Postgres as `fundhub_app`: `morning-brief.pg` 7/7, `finance-command.pg` 3/3, `guard:db` 3/3, `guard:rls` 4/4.
- Waiting on: MB2 (day counts), the marketing numbers (M5), MB4 (suggestions), MB5 (report link), MB1 (going live).
- Leftovers, not fixed: migration 114 fails on an empty database ("VALUES lists must all be the same length"), and some generated journey files are stale on `main`.

### MB4 — Kickoff A agent, 2026-10-05 (PR #29, merged)

- Law: `.claude/rules/change-cadence.md` and `.cursor/rules/change-cadence.mdc` (same words), plus one owner-set "Change cadence" section in `CLAUDE.md` (no renumbering). The 8 rules are starting defaults with light guardrails. Chris tunes the numbers later from proven data.
- Migration 432 `ops_suggestions`. `src/ops/suggestions.mjs` (`buildSuggestions`, `setSuggestionStatus`). `GET /api/read/ops-suggestions?date=`, owner and admin only. Diagram: `docs/journeys/ops-suggestions-flow.md`.
- Rules built: 2 (failed events), 6 (dying ads get a new opening; one page change a week), 4 limited by 5 (raise spend at most 20%, only when the numbers allow). Skipped, no source: rule 3 (no stored target cost per booked call), rule 7 (no offer or price version record).
- Tests: units 29/29. On a scratch Postgres as `fundhub_app`, the pg tests passed 19/19. With no database: 32 failures, against 33 on `main`. No new failures.
- Wiring the suggestions into the brief is handed to MB6.
- Leftovers, not fixed:
  - Ad tables read as empty under the app role unless a staff scope is used. This likely affects KPI spend and the dying-ad buzz.
  - The dying-ad SQL in `src/ops/watch-curve.mjs` never selects `clicks`.
  - Migration 114 is broken on a fresh database.
- Safety note: about 18:51 UTC, MB4 ran the unit stage of `npm test` with the inherited live `DATABASE_URL`. The live database refuses connections from this cloud machine (measured: connection timeout), so nothing reached it.

### MB2 — Kickoff A agent, 2026-10-05 (PR #30, merged)

- Migration 430: `job_heartbeats` (one row per scheduled-job run) and `pulse_scorecards` (one row per company per Arizona date, in the board contract shape).
- New: `src/pulse/heartbeats.mjs`, `src/pulse/system-checks.mjs` (message queue, failed events, money in, Meta tracking), `src/pulse/scorecard.mjs` (day counts, not checked never green), `src/messaging/providers/pulse-probes.mjs` (one read-only call per outside service: CRS login only, never the Clarity export), `api/read/systems-check.mjs` (`GET /api/read/systems-check?date=`, owner and admin only).
- Edited:
  - `src/pulse/daily-pulse.mjs`: funnel pages, VSL files, Mac row; the scorecard is saved on live runs.
  - `src/pulse/registry.mjs`: a refusal counts as up only when it is the app's own refusal.
  - `src/pulse/notify.mjs`: the text now says "X green, Y red, Z not checked."
  - Every scheduled job writes a heartbeat: one Inngest add-on, plus 6 Netlify functions.
  - New `docs/journeys/daily-pulse-actual.md`.
- Tests: on scratch Postgres, the new pg tests passed 19/19 as `fundhub_app`. With `main` merged in, no-database run (orchestrator): the only new failure was stale journeys. Fixed by running `npm run journeys`, then lint and tsc clean.
- Defaults pending Chris: Commas 72 hours, queue 30 minutes. ClickFunnels orders: off, because no order event exists in the code. ClarityPay and Netlify: not checked.
- Found, not fixed: `https://fundhub.ai/funnel/slo-vsl3-repair.mp4` is 404 and the live /roadmap-book page links to it. `/api/public/decline-autopsy` is 404.
- Safety: about 18:50 UTC, 3 MB2 pg tests ran with the inherited live `DATABASE_URL`. The orchestrator checked live read-only through Supabase: no `pulsechk-` company, no commas_inbox rows and no failed_events rows in the last 3 hours. Nothing landed.

### MB5 — Kickoff A agent, 2026-10-05 (PR #31, merged)

- Page `/app/morning-brief.html`, owner and admin only, in the Watch sidebar. Six parts in spec order, reds first, each number shows its source, all times Arizona, Morning/Evening switch.
- `report_url` is now filled by `reportUrl(date, env)` in `src/ops/morning-brief.mjs`.
- Tests: page test plus `e2e/morning-brief.spec.mjs` (6/6 Playwright with a stubbed API). Marked screenshots: `ops/workflows/morning-brief-2026-10-05-evidence/shots/*-MARKED.png`. No new failures after merging `main` (orchestrator run). Live-site proof waits for ship.
