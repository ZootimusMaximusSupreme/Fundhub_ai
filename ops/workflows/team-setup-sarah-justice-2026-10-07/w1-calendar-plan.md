# W1 — Calendar plan: Sarah's and Justice's calendars on the booking page

- **Date:** 2026-10-07
- **Workflow:** W1 of `ops/workflows/team-setup-sarah-justice-2026-10-07.md`
- **Status:** plan only. Nothing built. Nothing pushed to ClickFunnels. No page touched.
- **Model:** Opus — current is Opus. Match.

Words used below:

- **Host** = the person a call is booked with.
- **Meeting type** = one kind of meeting on the booking page (ClickFunnels calls it an "event type").
- **API** = the door our code uses to talk to ClickFunnels.
- **Webhook** = a message ClickFunnels sends us the moment something happens.
- **Admin screen** = the ClickFunnels website you log into. Chris never logs in.

---

## 1. The answer in 5 lines

1. **ClickFunnels can do this.** Each person connects their own Google calendar inside ClickFunnels. The booking page then only shows times when the host is free.
2. **Today every call goes to Chris.** The live page `/funding-book-call` runs the meeting "Funding Strategy Meeting" (30 minutes, Google Meet) with one host: Chris Stanbridge.
3. **To send calls to Justice, make Justice the host of that meeting.** The page itself does not change. The calendar on it stays native.
4. **Blocker:** adding Sarah and Justice to ClickFunnels, connecting calendars, setting hours, and changing the host all live only in the admin screen. The API has no door for any of them. Someone with ClickFunnels admin must do the first step. See decision 1.
5. **Sarah and Justice must each click "Connect Calendar" and "Allow" themselves.** Google asks the calendar owner. Nobody else can click it for them.

---

## 2. What ClickFunnels can and cannot do

Every row has a source. "Admin screen" means no API door exists for it.

| What we need | Can ClickFunnels do it? | Where | Source |
|---|---|---|---|
| Each team member connects their own Google calendar | Yes | Admin screen: Appointments → Calendar Connections → Connect Calendar → Google → Allow | [Connect and Manage a Calendar](https://support.myclickfunnels.com/docs/appointments-how-to-connect-and-manage-a-calendar/); [Event Types, "Event Host(s)" caution](https://support.myclickfunnels.com/docs/appointments-how-to-create-and-manage-event-types/): "team members have the ability to connect their individual calendars within the workspace, which can then be selected as a host" |
| Hide times when the host is busy | Yes | Admin screen: calendar gear → "Check For Conflicts" | Connect and Manage a Calendar, "Editing Appointment Calendar Settings" |
| A second calendar (like personal Gmail) also counts as busy | Yes | Admin screen | Event Types caution: "each team member gets one default calendar where their appointments will be scheduled ... the extras are used for conflict checking only" |
| Working hours | Yes | Admin screen: Appointments → Availability Schedules. If nobody changes it, the default is 9 AM to 5 PM weekdays | [Availability Schedules](https://support.myclickfunnels.com/docs/appointments-define-your-availability-with-availability-schedules/) |
| One host only (Justice) | Yes, "One-on-One" | Admin screen | Event Types, Step 1 |
| Both must be free, both on the call | Yes, "Collective" (many hosts, one guest) | Admin screen | Event Types, Step 1 |
| Share calls between hosts | Yes, "Round Robin" with weighting (High / Medium / Low) and 3 modes: Weighted Random, Maximize Availability, Equal Distribution | Admin screen | Event Types, "Weighting"; [Changelog 2026-04-24](https://changelog.myclickfunnels.com/three-ways-to-assign-round-robin-appointments.md); [Changelog 2026-10-02](https://changelog.myclickfunnels.com/2026-10-02-improvements-3.md): each host's busy calendars now only block that host |
| Host cancels in Google → the time opens up again | Yes | Automatic | Changelog 2026-04-24, "External Cancellation Sync" |
| Add Sarah and Justice to the ClickFunnels workspace | Yes | **Admin screen only:** Workspace Settings → Collaborators → Add new collaborator | [Manage Workspace Collaborators](https://support.myclickfunnels.com/docs/collaborators-how-to-manage-workspace-collaborators/). The API has no door: the published spec has only `GET /users`, `GET /teams`, `GET`/`PUT /teams/{id}` for people ([OpenAPI](https://developers.myclickfunnels.com/openapi/clickfunnels-api.json)) |
| Create or change meeting types, hosts, hours, Round Robin, conferencing | Yes | **Admin screen only.** The whole API has one appointments door, and it only reads: `GET /workspaces/{workspace_id}/appointments/scheduled_events` | [List Scheduled Events](https://developers.myclickfunnels.com/reference/listappointmentsscheduledevents.md); [llms.txt index](https://developers.myclickfunnels.com/llms.txt) lists no other appointments endpoint |
| Read booked calls | Yes | API: List Scheduled Events (needs `appointments:read`) | List Scheduled Events |
| Tell us when a call is booked, moved, or cancelled | Yes | Webhook: `appointments/scheduled_event.created`, `.rescheduled`, `.canceled` | [Webhook Event Types](https://developers.myclickfunnels.com/docs/webhook-event-types.md) |
| Tell us **which host** got the call | **No** | — | The webhook and the API record carry meeting name, time, status, time zone, and the guest. There is no host field. Webhook Event Types payload; `AppointmentsScheduledEventAttributes` in List Scheduled Events |
| Start a ClickFunnels workflow when a call is booked, for one meeting type or one calendar | Yes | API: workflow trigger `$appointments.appointment_scheduled` with `appointments_event_type_id` / `appointments_calendar_id`; a `notify_step` can ping team members (`user_ids`) | [Create Trigger](https://developers.myclickfunnels.com/reference/createworkflowtrigger.md); [Create Step](https://developers.myclickfunnels.com/reference/createworkflowstep.md) |
| See who is on the team | Yes | API: `GET /teams/{id}` (its `memberships` list) | [Fetch Team](https://developers.myclickfunnels.com/reference/fetchteam.md). Doc gap: the List Users page points to `GET /teams/{team_id}/memberships`, but that path is not in the published spec |
| Change appointments through the ClickFunnels MCP server (an AI connector) | **Unproven** | It has an "Appointments" read and write area. The docs do not list what it can change. It needs one sign-in approval by a workspace user | [MCP Server help](https://support.myclickfunnels.com/docs/clickfunnels-mcp-server/); [Changelog 2026-09-18](https://changelog.myclickfunnels.com/2026-09-18-build-with-ai-and-the-mcp-server-are-out-of-beta.md) |
| Read a calendar that was only "shared" with another Google account | **Not in the docs** | — | No ClickFunnels page says it does. So "just share your calendar with Chris" is not a proven path |
| Which small ClickFunnels role can connect a calendar | **Not in the docs** | — | [Collaborator Roles](https://support.myclickfunnels.com/docs/collaborators-collaborator-roles/) lists Reader, Customer Support, Affiliate Manager, Funnel Builder, Marketing, Billing, Administrator. None mentions Appointments. Only Administrator ("all actions") is sure to work |

The ClickFunnels changelog (checked through its 2026-10-02 entries) has nothing newer on calendars or Google sync than the rows above.

---

## 3. What is live today (looked up 2026-10-07)

**Booking pages (read from the public page source; nothing changed):**

- `https://apply.fundhub.ai/funding-book-call` — native ClickFunnels calendar. Meeting "Funding Strategy Meeting" (meeting type id 14234), One-on-One, 30 minutes, Google Meet, one host: **Chris Stanbridge**. The $297 page also books here (owner-set 2026-09-22, `ops/workflows/cf-calendar-switch-plan-2026-09-22.md`).
- `https://apply.fundhub.ai/schedule/phonecall` — a second booking door, "Meeting with Chris". Host is Chris. The last real ClickFunnels booking (2026-09-23) came through this one (`ops/workflows/sleep-fears-2026-09-25.md`).

**Our CRM (what happens when ClickFunnels says a call was booked):**

- The webhook lands at `https://fundhub.ai/api/webhooks/clickfunnels` (`src/http/router.mjs:71-75`). The ClickFunnels webhook was re-made on 2026-09-25 with the appointment events on (`ops/workflows/sleep-fears-2026-09-25.md`).
- `src/adapters/clickfunnels.mjs:66-74` knows the three appointment webhooks. `mapToCanonical` (`:740-743`) turns them into `booking.created`, `booking.rescheduled`, `booking.cancelled`.
- `src/handlers/comms.mjs:467-505` (`onBookingCreated`) makes a "Strategy session booked" task for the **closer role, with no named person** (`assigneeRole: "closer"`, line 486). It writes a `bookings` row, tags the client `call:booked`, and moves the sales card to "booked".
- The `bookings` table has no host column (`db/migrations/225_bookings.sql:43-74`).
- `tasks.assignee_staff_id` exists (`db/migrations/041_task_routing.sql:37-38`) but booking tasks leave it empty. The closer screen shows tasks named for that closer **or named for nobody** (`src/sales/closer-now.mjs:15-16`). Fundhub has 4 active closer logins: Justice and 3 test logins. So today every closer login sees every booked call.
- The meeting name is read from the webhook (`src/adapters/clickfunnels.mjs:339-342`) but is not passed into the booking (`:869-879`). So `bookings.event_type_slug` stays empty.

**Staff rows (live database):**

- Sarah Blankstein — `sales_manager` — `sarah.b@fundhub.ai` — active — booked-call text OFF.
- Justice Nikkel — `closer` — `justice.nikkel@fundhub.ai` — active — booked-call text OFF — no phone on file.
- Chris emails them at `sarahblankstein247@gmail.com` and `justice.nikkel@gmail.com` (Gmail, sent 2026-09-03). The draft below goes there.

**Already in the repo:** a Google Calendar free/busy reader for hiring interviews (`src/hiring/calendar-freebusy.mjs`). It reads @fundhub.ai calendars through the company Google service account. It can help us check the page later. It cannot feed ClickFunnels.

---

## 4. The setup, step by step

### Step A — Put Sarah and Justice in ClickFunnels (BLOCKER)

Admin screen only. No API door.

1. Workspace Settings → Collaborators → **Add new collaborator**.
2. Team Member → **+ Add new** → email, first name, last name → **Create**.
3. Pick a role → **Create collaborator**.

Who can do this: only someone who already has ClickFunnels admin. Chris never logs in. See decision 1.

Roles: if Sarah is **Administrator**, she can do Steps C and D herself, so Chris never logs in again for this. The docs do not say which smaller role lets Justice connect his calendar. If his role cannot, Sarah raises him to Administrator.

### Step B — Sarah and Justice each connect their Google calendar (their step, about 3 minutes)

These steps are in the email draft too.

1. Open the ClickFunnels invite. Set a password. Sign in.
2. Left menu → **Appointments** → **Calendar Connections**.
3. **Connect Calendar** (top right) → **Google Calendar**.
4. Check the box to accept the terms.
5. Pick your work Google account → **Allow**.
6. Gear icon next to that calendar → turn ON **Default Calendar** → turn ON **Check For Conflicts** → **Update Calendar**.
7. Second Google calendar (like personal Gmail)? Connect it the same way. Leave **Default Calendar** OFF. Turn **Check For Conflicts** ON.

Justice's Default Calendar is where booked sales calls land. With a Google calendar connected, Google Meet is the default meeting link ([Conferencing](https://support.myclickfunnels.com/docs/appointments-how-to-add-a-conferencing-connection/)).

### Step C — Working hours (admin screen)

1. Appointments → **Availability Schedules** → **Add New Schedule**.
2. Name it "Justice — sales calls".
3. **Included calendars** → his calendars.
4. Paint the hours from his reply. Pick his **Time Zone**. **Save New Rules**.
5. Same for Sarah if she is a host (decision 3).

Who: Sarah, if she is Administrator.

### Step D — Send booked calls to Justice (admin screen)

Appointments → **Event Types** → **Funding Strategy Meeting** → gear → **Event Host(s)**. Pick one, per decision 3:

| Choice | How | What it does |
|---|---|---|
| **1. Justice alone** (recommended unless Sarah sits in on calls) | Swap host Chris → Justice on the same meeting. Pick his schedule. Update. | Open times show only when Justice is free. Calls land on Justice's calendar. The page is untouched because it already shows this meeting. Sarah's calendar is connected but not used here. |
| **2. Both on every call** | Make a new "Collective" meeting with Justice and Sarah. Attach it to the `/funding-book-call` step: step menu → **Manage Event Types** → **Attach Event**. | Open times show only when both are free. The invite lands on both calendars. Attaching does not replace the page. The docs only show picking the meeting kind when you create one, so changing the old meeting's kind is not documented. |
| **3. Justice first, Sarah as backup** | Make a new "Round Robin" meeting. Justice weight High, Sarah Low. Attach it the same way. | Calls are shared. The docs do not promise "Justice every time unless busy." Our CRM cannot tell who got each call, because ClickFunnels never says. |

The native calendar on `/funding-book-call` is never replaced. No page code changes in any choice.

### Step E — The agent proves it (API and public page only; no admin)

1. Read the live `/funding-book-call` page source. The host list must read Justice. (That is how this plan read "Chris" today.)
2. API `GET /teams/{id}` → Sarah and Justice show up as team members.
3. Open the page in a browser. Compare the open times to Justice's busy times. If his work calendar is @fundhub.ai, read his busy times with `src/hiring/calendar-freebusy.mjs`. If it is personal Gmail, that check is not possible from here.
4. One test booking with a plus-tag sim email and the agent phone (+16616054248). Check: booking row and closer task in our CRM, and the event on Justice's calendar. Then cancel it from the confirmation email link. The API cannot cancel.
5. API List Scheduled Events → the test booking shows, then shows cancelled.

---

## 5. Agent by API vs. admin screen only

| Agent does it by API or public page | Admin screen only — blocker while Chris never logs in |
|---|---|
| Read booked calls (List Scheduled Events) | Add Sarah and Justice as collaborators |
| Booking webhooks (already on since 2026-09-25) | Connect each Google calendar (each person, themselves) |
| Read team members (`GET /teams/{id}`) | Availability schedules (working hours) |
| Read the public page to prove the host | Meeting host, kind, Round Robin weighting |
| Optional: ClickFunnels workflow that pings Justice on a new booking (`$appointments.appointment_scheduled` + `notify_step`). Not needed: our CRM already gets the webhook | Attach a new meeting type to the page step |
| | Conferencing (Google Meet / Zoom) settings |

This run made no ClickFunnels API call. Reading the ClickFunnels key from `.env` was blocked here. The page check needed no key.

---

## 6. Repo changes the build would need (plan only; needs Chris's OK)

The calendar part needs **no code**. Code is needed only if Chris wants our CRM to name Justice on each booked call (decision 5).

1. `src/adapters/clickfunnels.mjs` (around lines 437-458 and 869-879): pass the meeting name (`event_type.name`) into the booking, so `bookings.event_type_slug` gets filled.
2. `src/handlers/comms.mjs` `onBookingCreated` (lines 467-505): name Justice's staff row on the "Strategy session booked" task. It uses the existing `tasks.assignee_staff_id` column. **No migration.**
3. The link "this meeting → this closer" lives in one small new config file (for example `src/config/booking-hosts.mjs`), keyed by meeting name. A new file needs Chris's OK. Because ClickFunnels never says who the host is, this only works when one meeting has one host (choice 1). With choice 2 or 3, the CRM cannot know.
4. Tests: `src/adapters/clickfunnels.test.mjs`, a handler test, and a real-database test at `src/http/<name>.pg.test.mjs` (CLAUDE.md §12: tests under `api/` never run).
5. Journeys: naming a closer on a booked call is a new step. It is not in `docs/journeys/role-closer-intended.md` or `docs/journeys/client-intended.md`. Chris must OK it first (CLAUDE.md §4). Then update `docs/journeys/role-closer-actual.md`, `docs/journeys/booking-notifications-flow.md`, and `docs/journeys/CHANGELOG.md` in the same commit.
6. No new route, so no change to `src/pulse/registry.mjs`. No new env var. No migration.
7. Overlaps W2 (lead alerts): if Justice should get a text on each booking, add his phone to his staff row and turn on the booked-call text on Staff & Teams (`src/staff/booked-call-alert.mjs`). Data change, no code.

---

## 7. Decisions only Chris can make

1. Who does the one-time ClickFunnels admin step (add Sarah and Justice)? (a) Chris, once. (b) Chris approves the ClickFunnels AI connector once, and an agent tries it (unproven it can add people). (c) Someone who already has ClickFunnels admin.
2. Make Sarah a ClickFunnels Administrator, so she does Steps C and D and Chris never logs in? Yes / no.
3. Meeting style: Justice alone, both on every call, or Justice first with Sarah as backup?
4. "Meeting with Chris" (`/schedule/phonecall`): keep it on Chris, or move it to Justice too?
5. Should our CRM name Justice on each booked call (the code in section 6)? Yes / no.

---

## 8. Leftover for the board (not this task, not touched)

- Moved and cancelled calls may not find their booking. `src/adapters/clickfunnels.mjs:358-365` saves the booking under the webhook's own id, not the call's id. Already named in `db/migrations/225_bookings.sql:239-243` and `ops/workflows/cf-calendar-switch-plan-2026-09-22.md` section 3.

---

## 9. Access request to Sarah and Justice

- **Gmail draft created, not sent.** Draft id `r-6995786141977127618`.
- **To:** `justice.nikkel@gmail.com`, `sarahblankstein247@gmail.com` (the addresses Chris already emails them at).
- **Subject:** Quick setup: connect your Google calendar to our booking page
- **It asks for:** which Google calendar they use for work, their call hours and time zone, and the Step B clicks once the ClickFunnels invite arrives.
- **Timing:** the invite only arrives after decision 1. The two questions can be answered now.

---

## Change manifest (W1)

- Files written: `ops/workflows/team-setup-sarah-justice-2026-10-07/w1-calendar-plan.md` (this file).
- Gmail: one draft (`r-6995786141977127618`), not sent.
- Code, routes, migrations, env, ClickFunnels: none changed.
- Journeys impacted: none yet. Section 6 item 5 would touch `role-closer` and `client` if approved.
