# Morning brief and full systems check — work board (2026-10-05)

Source: Chris, voice note 2026-10-05. Spec: [`docs/specs/morning-brief-2026-10-05.md`](../../docs/specs/morning-brief-2026-10-05.md). Projection: [`docs/finance/call-funnel-projection-2026-10-05.md`](../../docs/finance/call-funnel-projection-2026-10-05.md).
Rules: read `CLAUDE.md` first. Claim your row before you start. Write your manifest here when done.

Model: Opus — the cloud session that wrote this board is on Opus. Match. MB2 and MB3 touch the one tripwire (Recon AG-07) and the outbound text path, so they need Opus with thinking effort up.

## The split — 6 workflows

| ID | Owns | Waits on | Status |
|---|---|---|---|
| MB0 | Projection, spec, this board, to-do lines (cloud session, 2026-10-05) | — | done |
| MB1 | The morning text goes to Chris's new number | A Mac session (the cloud can't reach Netlify) | blocked — Kickoff A ran in a cloud session 2026-10-05, not the Mac; the cloud was refused Netlify env access. Needs the Mac. |
| MB2 | Full systems check: extend the daily pulse (Recon AG-07) to every component | — | claimed — Kickoff A agent, 2026-10-05, building (Chris: "run the whole thing") |
| MB3 | Morning brief: "Good morning, Chris" text + stored report, built from MB2 + team + marketing + money | MB1 to send live (it builds and dry-runs without it) | claimed — Kickoff A agent, 2026-10-05, building (Chris: "run the whole thing") |
| MB4 | Cadence rules and AI ops suggestions | **Chris: yes on the cadence draft** | blocked |
| MB5 | The report page the text links to (front end, last) | MB3 read endpoint | pending |

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
2. What time? (Today: 6:00 a.m. Arizona)
3. Text only, or text plus an email with the full report? Which email?
4. Cadence rules: yes to the draft in the spec, or which numbers change?
5. Team section: which numbers per person?
6. Financed deposits for 30 days: what counts as a "really good file"? (Projection doc)

### Plans approved 2026-10-05 (Chris: "run it, run the whole thing")

**Migration numbers:** 430 = MB2 (scorecard, job heartbeats). 431 = MB3 (`morning_briefs`). 406–429 are held by the marketing machine.

**MB3 plan (summary).** The brief runs as step 2 of the 6:00 a.m. pulse job (`src/workflows/daily-pulse.mjs`), so it always runs after the pulse. Dry-run: built and saved, nothing new sent. One row per morning in `morning_briefs` (only the last 4 digits of the number are stored). Read page `GET /api/read/morning-brief?date=`, owner and admin only. Numbers are plain database reads, with no model.
- Systems: MB2 scorecard; until then the pulse result in the same shape.
- Marketing: spend from `ad_metrics_daily`; the rest says "waiting on the marketing numbers" until the marketing machine's numbers (M5) merge.
- Team: `computePulse()`, `call_outcomes` per closer, CSM overdue `tasks`, `listUnrecordedCalls`. Advisor files per person: no source today.
- Money: "Money: not connected yet." until Plaid is live in production. Per-company split and ad credit line: no source today.
- Suggestions and "Today": empty until MB4.

**Defaults used until Chris says otherwise (orchestrator, 2026-10-05):** the old pulse text keeps going (the brief does not replace it yet); numbers cover the last 24 hours; the text has no link until MB5; the Mac reporter (gap 12) is plan only.

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

## Manifests

### MB0 — cloud session, 2026-10-05

- Added `docs/finance/call-funnel-projection-2026-10-05.md`: the repo's book-a-call model re-run for $2,500 / $3,000 / $50,000 at $30 / $50 / $100 per booked call; the closer limit; the $250K/month math; the 30-day deposit financing decision (owner-set); the ClarityPay facts and the 2 questions for the rep.
- Added `docs/specs/morning-brief-2026-10-05.md`: what Chris asked, what the pulse checks and misses (read from the code), the text shape, the check rules, the cadence draft, the build order.
- Added this board. Added to-do lines in `TODO.md` and `ops/todo-2026-10-05.md`.
- No app code, schema, env or deploy changed.
