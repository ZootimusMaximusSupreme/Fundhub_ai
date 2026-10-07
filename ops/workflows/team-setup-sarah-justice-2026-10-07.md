# Team setup — Sarah and Justice (2026-10-07)

## Team

- **Sarah** — Sales Manager
- **Justice** — High Ticket Closer
- **Chris** — setter for now

## Goal

1. Sarah's and Justice's Google calendars feed the ClickFunnels calendar. Book only when they are free. Booked sales calls go to Justice.
2. Chris gets a text and an email the moment any lead comes in. He answers from his business cell with a personal video, then hands warm leads to Justice.
3. Setter script built from the Cole Gordon setter method already in Chris's Google Drive.

## Tasks

| # | Workflow | Owner | Status | Output |
|---|---|---|---|---|
| W1 | Calendar — research, plan, access request draft | agent (Opus) | done (plan) — build waits on Chris | `team-setup-sarah-justice-2026-10-07/w1-calendar-plan.md` |
| W2 | Lead alerts — find intake paths, spec | agent (Sonnet) | claimed | `team-setup-sarah-justice-2026-10-07/w2-lead-alerts-spec.md` |
| W3 | Setter script — Drive sources, script, video intro, handoff | agent (Sonnet) | claimed | `docs/sops/setter/` + `team-setup-sarah-justice-2026-10-07/w3-setter-sources.md` |

## Dependencies

- W2 and W3: none. All parallel.
- W1 build waits on Sarah and Justice sharing their Google calendars. Research and plan run now.

## Change manifests

(Each workflow adds its manifest here when done.)

### W1 — Calendar (2026-10-07)

- Written: `team-setup-sarah-justice-2026-10-07/w1-calendar-plan.md`
- Gmail draft to Justice and Sarah (not sent): asks which Google calendar they work from, plus their call hours and time zone.
- No code, route, migration, env var, or ClickFunnels changes.
- Findings: ClickFunnels lets each team member connect their own Google calendar, and busy times hide open slots. It supports One-on-One, Collective, and Round Robin hosts. The API can only read booked calls; it cannot set up hosts, calendars, or team members. Booking webhooks carry no host field. Today `/funding-book-call` ("Funding Strategy Meeting") and `/schedule/phonecall` are both hosted by Chris. To route calls to Justice, change the host. The page itself does not change.

## Blockers and open questions

- W1: every ClickFunnels setup step (add Sarah and Justice, connect calendars, set hours, change host) is in the ClickFunnels admin. The API cannot do it.
- W1: Sarah and Justice must each click Connect Calendar → Allow themselves. Google asks the calendar owner.
- W1 decisions for Chris: (1) who does the one-time ClickFunnels team add; (2) make Sarah a ClickFunnels admin; (3) meeting style: Justice alone, both, or Justice first with Sarah as backup; (4) `/schedule/phonecall` stays on Chris or moves to Justice; (5) CRM names Justice on each booked call (small code change and a new closer-journey step).

## Leftovers (not this batch)

- Moved or cancelled ClickFunnels calls may not match the original booking. `src/adapters/clickfunnels.mjs:358-365` saves the booking under the webhook id, not the call id. Already noted in `db/migrations/225_bookings.sql:239-243` and `ops/workflows/cf-calendar-switch-plan-2026-09-22.md`.
