# System diagnostic — 2026-10-07 (read-only)

Chris asked at ~21:50 UTC: "in 1 hour run a full system diagnostic." Ran 22:56–23:10 UTC with three Sonnet agents. Read-only: no fixes, no sends, no data writes. Live database was read with SELECT only (Supabase MCP).

## Scorecard

| # | Area | Result | What we saw |
|---|---|---|---|
| 1 | Live site up | PASS | fundhub.ai, /api/health, apply.fundhub.ai/funding-book-call, /schedule/phonecall all 200. Health: db up, 387 applied, pending 0. |
| 2 | Live site = GitHub main? | **FAIL** | Live is built from a copy that is not on GitHub. Live has `/app/marketing-command-center.html` (on no GitHub branch) and lacks `/app/morning-brief.html` (on main since 2026-10-05). Health "expected" = 361 vs main's manifest 341. Last logged ship: 2026-10-04; the 2026-10-07 Yesdoor ship hit "Netlify Unauthorized". |
| 3 | Today's merges live? | FAIL (not shipped) | Team calendar link: `/api/staff/calendar-link` = 404 live, no "Connect your calendar" box, `staff_calendar_links` table absent. Sarah's hiring screen change: not in live `hiring.html`. Lead alerts: not live (inferred). All wait on the Mac ship. |
| 4 | Booking page | PASS | 52 open 30-minute slots in the 3-day window (first Oct 7 5:00 PM AZ, last Oct 10 3:00 PM AZ). Read via the Cronofy endpoint; nothing booked. |
| 5 | **New leads** | **FAIL — watch** | No `entry.captured` since Oct 2 22:45 UTC and no `booking.created` since Sep 26, while funnel visits continue (721 page views in 7 days, 150 today; 11 calendar views). Could be low traffic or broken lead capture; the database alone can't tell. The 31 "commas" clients today arrived in a 40-second burst with no phones — an import, not leads. |
| 6 | Job heartbeats | PARTIAL | Receipts started 20:08 UTC today. 23 jobs reporting on time, 0 errors. Silent but due: `yd-touches`, `yd-outbox-dispatch`, `meta-sync-sweeper`, `staff-calendar-busy-sync` (likely not deployed). 15 daily/monthly jobs not yet due. |
| 7 | Daily pulse | PASS | Ran every morning Oct 1–7, outcome pass. The new pulse scorecard table is empty until tomorrow's run. |
| 8 | Messages | PASS | 0 queued, 0 stuck, 0 failed in 24h. 7-day failures all on Oct 1 (example.com test addresses, one client with no phone). |
| 9 | Sending switches | PASS | Fundhub outbound on (cap 500); email → Resend, SMS → Twilio, both enabled. `marketing_settings.enabled` = false (weekly script batch off). |
| 10 | Failed events | PASS (old backlog) | Nothing new in 7 days. 24 old rows from Aug 12–21 still pending (missing `product_id` on payments ×22, missing survey column ×2). |
| 11 | Tests on main | FAIL (unchanged) | Same 59 database-test failures as the baseline, 0 new. The "screens (real browser)" job never finishes: it hits its 15-minute limit with 128 of 490 tests unrun and 45 failures among those that ran. |
| 12 | Pull requests and branches | PASS (housekeeping) | 12 open, all drafts, none ready; #59, #47, #26 conflict with main. Every unmerged branch has a PR. 52 merged branches are clutter (cloud can't delete). |
| 13 | Security advisor | FAIL | 25 ERROR: views running with owner permissions (`security_definer_view`). 2 functions anyone can call: `fundhub_vsl_recent_count`, `rls_auto_enable`. 144 functions with a mutable search path (warn). |
| 14 | Performance advisor | PASS (warnings) | 56 duplicate-policy warnings, 1 duplicate index, 331 unindexed foreign keys (info). |
| 15 | Database logs (last hour) | PASS | No spike. 2 one-off app errors. |
| 16 | Netlify env and deploy logs | UNKNOWN | api.netlify.com is blocked from the cloud. |

## What matters most

1. **Shipping `main` as-is would drop the live Command Center page.** The live site was deployed from a Mac copy that is not on GitHub. The Mac step must push that copy and merge `main` into it before shipping (see below).
2. **No leads recorded since Oct 2,** with people still visiting the funnel. Worth a named check of lead capture.
3. **Security advisor:** `rls_auto_enable` and `fundhub_vsl_recent_count` can be called by anyone.

## Corrected Mac step (replaces the one above it on the team board)

```
Repo ~/Fundhub_ai. Follow CLAUDE.md. Report each result.
1. Back up: node scripts/github-push-whole-repo.mjs (pushes every local branch and tag; never forces).
2. Find the branch the live site was built from (it has public/app/marketing-command-center.html). Commit any uncommitted work on it.
3. git fetch origin && git merge origin/main (merge commit). Resolve conflicts; regenerate with npm run migrations:manifest, npm run journeys, npm run diagrams. Run npm run lint, npx tsc --noEmit, npm test. Push the branch and open a PR to main.
4. Set the two lead-alert settings (values are in Chris's chat, never in the repo):
   netlify env:set LEAD_ALERT_SMS_TO "<business cell>" --context production --context deploy-preview --context branch-deploy --secret
   netlify env:set LEAD_ALERT_EMAIL_TO "<alert email>" --context production --context deploy-preview --context branch-deploy --secret
5. Check netlify env:get MESSAGING_DRY_RUN --context production is 0. Report only; do not change it.
6. node --env-file=.env scripts/google-oauth-mint.mjs --calendar --set-netlify (Chris signs in as stanbridgejchris@gmail.com and presses Allow)
7. npm run ship (from the merged branch)
8. Confirm these load: /app/marketing-command-center.html, /app/calendar.html (shows "Connect your calendar"), /app/hiring.html, /app/morning-brief.html.
9. Write the results on ops/workflows/team-setup-sarah-justice-2026-10-07.md, commit, push.
If ship says Netlify "Unauthorized", report that error in one line and stop.
```
