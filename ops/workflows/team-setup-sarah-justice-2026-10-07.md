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
| W2 | Lead alerts — find intake paths, spec | agent (Sonnet) | done (spec) — build waits on Chris | `team-setup-sarah-justice-2026-10-07/w2-lead-alerts-spec.md` |
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

- Older repo rules say the setter seat is AI ("we do not hire setters": closer playbook, closer ramp doc, `src/ops/hire-closer.mjs`). Chris is setting for now. Under chris-word-wins, those lines need an update.

- `ops/workflows/morning-brief-2026-10-05.md:240` prints the full morning-text number, though line 23 of the same board says the full number stays out of the repo.

- Moved or cancelled ClickFunnels calls may not match the original booking. `src/adapters/clickfunnels.mjs:358-365` saves the booking under the webhook id, not the call id. Already noted in `db/migrations/225_bookings.sql:239-243` and `ops/workflows/cf-calendar-switch-plan-2026-09-22.md`.
