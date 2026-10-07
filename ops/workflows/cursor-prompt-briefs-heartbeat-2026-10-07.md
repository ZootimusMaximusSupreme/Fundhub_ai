# Cursor prompt — morning brief, evening brief, heartbeat (2026-10-07)

Paste the block below into Cursor.

```text
Repo: Fundhub_ai. Follow CLAUDE.md. Read these first, do not re-discover:

SPEC (one spec covers all three): docs/specs/morning-brief-2026-10-05.md
BOARD: ops/workflows/morning-brief-2026-10-05.md (MB0-MB6; MB1 is the only open row)
FLOW: docs/journeys/morning-brief-flow.md, docs/journeys/ops-pulse-intended.md / ops-pulse-actual.md, docs/journeys/daily-pulse-actual.md
CADENCE LAW: .claude/rules/change-cadence.md (numbers in CADENCE_DEFAULTS, src/ops/suggestions.mjs)

1. MORNING BRIEF — "Good morning, Chris."
   Code: src/ops/morning-brief.mjs (builder, kind 'morning'), src/ops/suggestions.mjs, src/ops/brief-offers.mjs
   Report page: public/app/morning-brief.html + morning-brief.js (read endpoint GET /api/read/morning-brief?date=)
   Tests: src/ops/morning-brief.test.mjs, src/http/morning-brief.pg.test.mjs, src/http/morning-brief-page.test.mjs
   Expected: one text after the 6:00 a.m. Arizona pulse. Systems (n of n green, reds named, skips shown as "not checked"),
   yesterday's money/marketing, team, at most 1 suggestion in text, link to full report.
   Report = Systems, Marketing, Money, Team, Suggestions (max 3), Today. Stored in morning_briefs.

2. EVENING BRIEF — "Good evening, Chris."
   Code: src/workflows/evening-brief.mjs (Inngest cron EVENING_BRIEF_CRON "0 4 * * *" = 9:00 p.m. Arizona),
   same builder src/ops/morning-brief.mjs with kind 'evening'. Test: src/workflows/evening-brief.test.mjs
   Expected: same sections, "today so far" since local midnight Arizona. Systems reuses this morning's stored check;
   never re-runs the pulse.

3. HEARTBEAT — daily pulse + job heartbeats (Recon AG-07, the only watchdog)
   Code: src/pulse/daily-pulse.mjs, src/workflows/daily-pulse.mjs (cron "0 13 * * *" = 6:00 a.m. Arizona),
   src/pulse/heartbeats.mjs (job_heartbeats table, db/migrations/430), src/pulse/registry.mjs, src/pulse/scorecard.mjs,
   src/pulse/notify.mjs. Writers: Inngest add-on in src/workflows/client.mjs + each netlify/functions/*-sweeper.mjs.
   Tests: src/pulse/heartbeats.test.mjs, heartbeats.pg.test.mjs, src/workflows/daily-pulse.test.mjs
   Expected: every scheduled job listed (INNGEST_JOBS + netlify.toml); red when newest heartbeat is older than 3x schedule.
   Audit only: reports, never restarts or fixes. No text by 6:15 a.m. Arizona = checker is down.

STATE: MB2-MB6 merged. Brief is DRY-RUN: MORNING_BRIEF_LIVE = false in src/ops/morning-brief.mjs (built + saved, not texted).
OPEN: MB1 — set the destination number (PULSE_SMS_TO; moving it also moves Blake lead texts and finished-ad texts),
then flip MORNING_BRIEF_LIVE, then npm run ship once. Needs the Mac (cloud cannot reach Netlify env).

TASK: <write the one thing you want done here>. Touch only that. Run npm run lint, npx tsc --noEmit, npm test.
Commit locally, push to GitHub.
```
