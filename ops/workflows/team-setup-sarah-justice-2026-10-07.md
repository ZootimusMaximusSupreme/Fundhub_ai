# Team setup — Sarah and Justice (2026-10-07)

## Team

- **Sarah** — Sales Manager
- **Justice** — High Ticket Closer
- **Chris** — setter for now

## Goal

1. Sarah's and Justice's Google calendars feed the ClickFunnels calendar. Book only when they are free. Booked sales calls go to Justice.
2. Chris gets a text and an email the moment any lead comes in. He answers from his business cell with a personal video, then hands warm leads to Justice.
3. Setter script built from the Cole Gordon setter method already in Chris's Google Drive.

## Owner decisions (2026-10-07)

- **No one is in Chris's ClickFunnels except Chris** (owner-set 2026-10-07). Sarah and Justice are never added as ClickFunnels collaborators. This replaces W1's "add them to ClickFunnels" path.
- Chris plugs their Google calendars in himself, so their availability shows on the funnel.
- No email goes to Sarah or Justice without Chris's explicit send. (The 2026-10-07 first emails went out too early. The agent read "when you're done" as now.)

## Calendar — corrected path (2026-10-07)

1. Sarah and Justice each share their Google calendar with `stanbridgejchris@gmail.com`. Justice: "Make changes to events", so booked calls can land on his calendar. Sarah: "See all event details", for busy times only.
2. Chris's existing Google connection in ClickFunnels then shows their calendars. Justice's calendar: Default Calendar ON + Check For Conflicts ON. Sarah's calendar: Check For Conflicts ON only.
3. The availability hours on the booking page match the call hours they send back.
- Not in the ClickFunnels docs: whether calendars shared into the connected Google account show up there. Check it the moment the shares land.
- Checked 2026-10-07: Chris's Google calendar list holds only his own calendar and US Holidays. Nothing is shared yet.
- Correction drafts (not sent, waiting on Chris): one to Justice, one to Sarah, each as a reply on its first email thread.

## Calendar — plan v2: they plug it into the CRM (2026-10-07, waiting on Chris's go)

Chris: "Tell them to plug it into the CRM. It should just be something they plug in." Chris does nothing (owner-set 2026-10-07).

Facts checked 2026-10-07:
- ClickFunnels writes booked calls onto `stanbridgejchris@gmail.com` (Chris is the organizer on every "Funding Strategy Meeting" event). That is the calendar the booking page reads.
- Sarah (`sarah.b@fundhub.ai`, sales_manager) and Justice (`justice.nikkel@fundhub.ai`, closer) already have active CRM logins.
- No token in the repo can write to any Google calendar. The only Google scopes in the repo are gmail.modify, drive, and calendar.readonly (the hiring service account).
- The existing Google sign-in client is a Desktop type (`scripts/google-oauth-mint.mjs`). A web "Sign in with Google" button would need a new Google Cloud client.
- Owner rule in that script: personal Gmail with per-user sign-in, never Workspace domain-wide delegation.

Plan:
1. **CRM "Connect your calendar" box** for staff. Sarah and Justice paste their Google Calendar private link (Google Calendar → Settings → their calendar → "Secret address in iCal format"). No Google Cloud setup needed.
2. **Busy-time sync, every few minutes:** read each connected calendar's busy times and write "Busy" blocks onto Chris's Google calendar, which ClickFunnels already checks. The booking page then hides those times. No ClickFunnels change.
3. **Booked call to Justice:** on `booking.created` (already received), email Justice a calendar invite with the Meet link, so the call lands on his calendar.

The floor that can't be avoided: step 2 writes to Chris's Google calendar, and Google only lets the owner approve that. Chris taps Allow once; an agent runs the rest (`scripts/google-oauth-mint.mjs` with the calendar scope added).
Known limit: Chris's own busy times keep blocking slots while Chris is the host in ClickFunnels.

Correction drafts with the old "share your calendar" steps are on hold and will be replaced with the CRM steps once the box is live.

## Calendar — plan v3, approved build (2026-10-07)

Chris: "Sounds good... double-check it first, build it, then double-check it again... simulate it with my own Google Calendar... then send the email."

What changed from v2: their plug-in is now **share at "See only free/busy" + type the address in the CRM box**, not the iCal secret link. Why:
- Google works out repeating events itself, so no new library is needed.
- The system only sees busy times, not event details.
- Booked calls reach Justice as a normal Google invite: he's added as a guest on the ClickFunnels event, Meet link included.

| Step | Owner | Status |
|---|---|---|
| Pre-check: does a busy event on Chris's calendar hide that slot on the funnel? Does main auto-deploy? Google API facts | agent (Sonnet) | **done: PASS.** A busy event on Chris's calendar hid the Oct 9 3:00 PM slot within about 3 minutes and came back about 50 seconds after the delete. ClickFunnels reads availability through Cronofy. Merging to main does NOT deploy; shipping needs `npm run ship` from the Mac. See `team-setup-sarah-justice-2026-10-07/precheck.md` |
| Build: CRM box, API, migration, 5-minute busy sync, booking → Justice invite, mint script `--calendar`, pulse, journeys | agent (Opus) | **done.** Commits a46d1d9, 8628907, 5f24505, 44a4a32. Migration 434 (`staff_calendar_links`). Lint clean, tsc 0. No-DB suite 12429 tests, same 8 machine-only failures as before. pg files 3235 tests, same 59 baseline failures, 0 new; the 14 new pg tests pass (including as `fundhub_app`). Playwright calendar-connect 8/8. Not run against real Google (no token yet). |
| Verify again: independent review, re-run of every gate, simulation on Chris's real Google calendar (private busy block hides the slot; adding a closer keeps guests and the Meet link) | agent (Sonnet) | claimed |
| Chris's one Allow + ship, from the Mac: `cd ~/Fundhub_ai && git pull && node --env-file=.env scripts/google-oauth-mint.mjs --calendar --set-netlify`, then `npm run ship`. Chris signs in as stanbridgejchris@gmail.com and presses Allow | Mac agent + Chris (one tap) | pending (after merge) |
| Email Sarah and Justice the CRM steps | orchestrator | pending (after verify) |

## Setter — the flow is already in code

The setter flow is built (the "Josh" AI setter):
- The call: `src/workflows/ai-set-01-josh-setter.mjs`. A booking fires a call to confirm the strategy session.
- The text sequence: `src/workflows/ai-set-03-no-answer-cadence.mjs`. If there's no answer, text 1 goes right away, text 2 after 30 minutes, and text 3 two hours after that (corrected 2026-10-07 from the code).
- The 3-way text: `src/workflows/ai-set-04-3way-handoff.mjs`. 15 minutes before the call, a text introduces the advisor (closer) with the meeting link, and a task is opened for the closer.
- 2026-10-07: `docs/sops/setter/` was rewritten from this built flow (README, call script, video intro, closer handoff; the call script went from 503 lines to 86).
- **Owner-set 2026-10-07: no AI setter.** "We're not doing Josh Setter." Josh's prompt is the setting logic, and Chris runs it by hand.
- **The warm-up is Chris's personal video** (his original ask: "personalized video messages... Goal: Warm up leads before passing them to closers").
- The live text copy lives in `db/seed/015` and `db/seed/295`; the copy in `templates-seed.mjs` is older. Every built text is signed "Josh", and the "3-way text" is one text to the lead, not a group thread.

## Tasks

| # | Workflow | Owner | Status | Output |
|---|---|---|---|---|
| W1 | Calendar — research, plan, access request draft | agent (Opus) | done (plan) — build waits on Chris | `team-setup-sarah-justice-2026-10-07/w1-calendar-plan.md` |
| W2 | Lead alerts — find intake paths, spec, build | agent (spec, then build) | built on branch `claude/ecstatic-galileo-h9suqe`, not shipped — sends nothing until the two settings are set at go-live | `team-setup-sarah-justice-2026-10-07/w2-lead-alerts-spec.md` |
| W3 | Setter script — Drive sources, script, video intro, handoff | agent (Sonnet) | done — ready for Chris's review | `docs/sops/setter/` + `team-setup-sarah-justice-2026-10-07/w3-setter-sources.md` |

## Dependencies

- W2 and W3: none. All parallel.
- W1 build waits on Sarah and Justice sharing their Google calendars. Research and plan run now.

## Change manifests

(Each workflow adds its manifest here when done.)

### W1 — Calendar (2026-10-07)

- Written: `team-setup-sarah-justice-2026-10-07/w1-calendar-plan.md`
- Calendar request emails sent 2026-10-07, one each to Justice and Sarah, on Chris's go. Each asks which Google calendar they work from, plus their call hours and time zone, and says a ClickFunnels invite is coming. Includes Chris's line: "Please upload this or provide whatever you need, and then we can plug you into the system." The old combined draft was deleted so it can't be sent twice.
- No code, route, migration, env var, or ClickFunnels changes.
- Findings: ClickFunnels lets each team member connect their own Google calendar, and busy times hide open slots. It supports One-on-One, Collective, and Round Robin hosts. The API can only read booked calls; it cannot set up hosts, calendars, or team members. Booking webhooks carry no host field. Today `/funding-book-call` ("Funding Strategy Meeting") and `/schedule/phonecall` are both hosted by Chris. To route calls to Justice, change the host. The page itself does not change.

### W2 — Lead alerts (2026-10-07)

- Written: `team-setup-sarah-justice-2026-10-07/w2-lead-alerts-spec.md`
- Nothing sent. No code, route, migration, or env changes.
- Findings: 10 lead-in paths. 6 should alert in the first build (ClickFunnels webhook, apply survey, booking-first for brand-new people, homepage survey, climate match, staff New Client). No new-lead alert to Chris exists today. Recommended build: one Inngest job on `entry.captured` and `booking.created` that sends one text (Twilio) and one email (Resend) per person, ever. It skips demo clients and anyone older than 24 hours. New env vars `LEAD_ALERT_SMS_TO` and `LEAD_ALERT_EMAIL_TO`, with no fallback to `PULSE_SMS_TO`. No migration, no screen.

#### W2 build manifest (2026-10-07, Chris approved the build: "Please complete the task")

- **Owner answers (2026-10-07):** the business cell and the alert email are set as settings at go-live and are written nowhere in the repo. The $297 contact, the $297 buyer and the education enrollment stay out. Texting runs 24 hours a day.
- **Added:** `src/workflows/lead-alert-owner.mjs` (the Inngest job, id `lead-alert-owner`, on `entry.captured` and `booking.created`), `src/staff/lead-alert.mjs` (the words, the recipients, the two provider sends), `docs/journeys/lead-alert-flow.md`, and tests: `src/workflows/lead-alert-owner.test.mjs`, `src/workflows/lead-alert-owner.pg.test.mjs`, `src/staff/lead-alert.test.mjs`, `src/pulse/lead-alerts-check.test.mjs`.
- **Changed:** `src/workflows/index.mjs` (registered, 97 to 98), `src/workflows/index.test.mjs` (`EXPECTED_WORKFLOW_IDS`), `src/journeys/runner/index.test.mjs` (`REGISTERED` 97 to 98), `src/pulse/system-checks.mjs` (`checkLeadAlerts`), `src/pulse/system-checks.pg.test.mjs` (one new test), `src/pulse/daily-pulse.mjs` (runs the check), `netlify.toml` (both settings added to `SECRETS_SCAN_OMIT_KEYS`), `docs/journeys/booking-notifications-flow.md` (section 5c), `docs/journeys/CHANGELOG.md`, `docs/diagrams/*` (regenerated).
- **Not changed:** no migration, no route, no screen, no `resolveClient`, no intake handler, no `*-intended.md`. `.env.example` was NOT edited: the environment denies reading it, so the two names were not added there (add `LEAD_ALERT_SMS_TO=` and `LEAD_ALERT_EMAIL_TO=`, names only, when convenient).
- **Journeys affected:** the lead-in doors listed in `docs/journeys/lead-alert-flow.md`. Client-facing behaviour is unchanged: the lead still gets the same welcome.
- **Settings needed at go-live (names only):** `LEAD_ALERT_SMS_TO`, `LEAD_ALERT_EMAIL_TO` (new, no fallback). Already set and used: `TWILIO_SEND_ACCOUNT_SID`, `TWILIO_SEND_AUTH_TOKEN`, `TWILIO_SEND_FROM`, `RESEND_API_KEY`, `RESEND_FROM`, `MESSAGING_DRY_RUN` (must be `0`). Set with `--secret`, then ship once.
- **Pulse:** new check `lead-alerts` (group `messages`). It is RED until both settings are set, by design. No row in `src/pulse/registry.mjs` (no page or `api/` file) and none in `heartbeats.mjs` (not a cron).
- **Fixes after the second tester (verify-lead-alerts.md), same branch:** bug 3 (the alert email is always plain text: `<` and `>` removed from every lead-supplied word), bug 2 (the `lead-alerts` pulse check also reads events with `client_id` NULL, by the event's email, and counts an event no client matches as an unalerted lead), bug 4 (a partial failure with two or more recipients is logged, scrubbed). Bug 1 is NOT fixed here: the coordinator checked read-only and the live `clients` table still has `ghl_contact_id`. Bugs 5 to 12 left alone.
- **Proof still to do after the settings are set and it ships:** the 8-step sim-lead proof in the spec (section 7, "Proof"). Not done here: nothing was sent and nothing was shipped.

### W3 — Setter script (2026-10-07)

- Written: `docs/sops/setter/` (README, setter-call-script, video-intro-script, closer-handoff) and `team-setup-sarah-justice-2026-10-07/w3-setter-sources.md`
- Built from 34 Drive files (Cole Gordon Triage Call and setter systems, Haynes setter SOP, Vann show-rate course, Chris's Fundhub AI Setter SOP, June 2026 Voice Agents SOT) and the repo (offers, closer playbook, Sarah's objection sheet). Every block is tagged by source, as "adapted", or as MISSING FROM SOURCES.
- Where the Drive docs disagree with the repo, the repo wins: the soft pull is $32, not $50, and the banned proof numbers are left out.
- No code or journey changes. Drive was read only.

## Blockers and open questions

- W1: every ClickFunnels setup step (add Sarah and Justice, connect calendars, set hours, change host) is in the ClickFunnels admin. The API cannot do it.
- W1: Sarah and Justice must each click Connect Calendar → Allow themselves. Google asks the calendar owner.
- W1 decisions for Chris: (1) who does the one-time ClickFunnels team add; (2) make Sarah a ClickFunnels admin; (3) meeting style: Justice alone, both, or Justice first with Sarah as backup; (4) `/schedule/phonecall` stays on Chris or moves to Justice; (5) CRM names Justice on each booked call (small code change and a new closer-journey step).

- W2 decisions for Chris: (1) business cell for lead texts (repo only knows the morning-text number ending 6457; it is not stated as the business cell); (2) email address for alerts; (3) should the unpaid $297 contact, the $297 buyer, or an education enrollment also count as a lead (default: none); (4) text 24 hours a day (default: yes).
- W2 risk: a text from our Twilio number to Chris has never been proven to arrive. Email is the backup channel.

- W3 decisions for Chris: (1) say the $32 soft pull out loud on setter calls (default: no, Justice covers it); (2) Justice's title on calls (the Josh prompts say "Senior Advisor"); (3) 4K video law vs texting apps that shrink video (default: film in 4K); (4) is the $297 roadmap path live for setter calls.
- W3 missing from Drive: Cole's DM scripts, ghosted follow-ups, rebooking no-shows, Art of the Delay, and the Setter Scorecard. They are linked from Cole's docs but not in Chris's Drive.

## Leftovers (not this batch)

- CI `suite (real Postgres)` is red on `main` (`bb25668`) with 59 failing tests. The Postgres log shows code reading a dropped `clients.ghl_contact_id` column. Not this batch; commented on PR #57.
- The last ship (Yesdoor, 2026-10-07) hit "netlify deploy: Unauthorized: could not retrieve project" (`ops/workflows/yesdoor-mvp-build-2026-10-07.md:319`). Live may not be running main's tip.

- Older repo rules say the setter seat is AI ("we do not hire setters": closer playbook, closer ramp doc, `src/ops/hire-closer.mjs`). Chris is setting for now. Under chris-word-wins, those lines need an update.

- `ops/workflows/morning-brief-2026-10-05.md:240` prints the full morning-text number, though line 23 of the same board says the full number stays out of the repo.

- Moved or cancelled ClickFunnels calls may not match the original booking. `src/adapters/clickfunnels.mjs:358-365` saves the booking under the webhook id, not the call id. Already noted in `db/migrations/225_bookings.sql:239-243` and `ops/workflows/cf-calendar-switch-plan-2026-09-22.md`.

## Mac step — paste into one Mac agent session (after PR #57 is merged to main)

```
Repo ~/Fundhub_ai. Follow CLAUDE.md. Do these in order and report each result:
1. git checkout main && git pull origin main
2. node --env-file=.env scripts/google-oauth-mint.mjs --calendar --set-netlify
   (a browser opens: Chris signs in as stanbridgejchris@gmail.com and presses Allow. That is his only step.
    It sets GOOGLE_CALENDAR_OAUTH_TOKEN_JSON on Netlify as a secret, and refuses if that var already exists.)
3. npm run ship   (one deploy; applies migration 434; confirms /api/health pending 0)
4. Open https://fundhub.ai/app/calendar.html as a staff login and confirm the "Connect your calendar" box shows.
5. Write the results on ops/workflows/team-setup-sarah-justice-2026-10-07.md and commit + push.
If ship says Netlify "Unauthorized", report that error in one line and stop.
```

After that: the email to Sarah and Justice goes out (share at "See only free/busy" with stanbridgejchris@gmail.com, then type their address into the box), and the first real share proves the free/busy read.
