# Verify: team calendar link (independent second check)

Date: 2026-10-07. Checked by: independent verifier agent (did not build it). Branch `claude/ecstatic-galileo-h9suqe`, code as of `cafefe8` (the commits after it are board notes only, no code). Compared against `53e6949`.
Rules I followed: no code changed, nothing committed, nothing pushed, never booked on the funnel, never touched ClickFunnels, nothing sent except Google invites from my own test events to plus-tag addresses of Chris's inbox, never wrote to the production database. The shell I was given had `DATABASE_URL` pointing at the live Supabase pooler, so every test run below had it removed (`env -u DATABASE_URL`) or pointed at a private scratch Postgres on port 55432.

## Verdicts

| Check | Verdict | One line |
|---|---|---|
| 1. Code review | **PASS, no blocking bug** | It cannot touch a real event on Chris's calendar. 3 should-fix items and 9 minor ones below. |
| 2. Re-run the gates | **PASS** | Lint, tsc and the new tests are clean. The 8 no-database failures are the same 8 that fail on the old commit. |
| 3a. Private busy block hides the slot | **PASS** | Hid in about 1.5 minutes. Came back in under 45 seconds after delete. |
| 3b. Closer added to a booked call | **PARTIAL** | Guests and Meet link stayed, the closer got the invite, the lead got nothing new. The calendar tool cannot send the code's exact "replace the whole guest list" patch, so that exact request is proved only by unit tests. |

## Bugs and risks, worst first

Nothing is blocking. Nothing here can delete or change a real event. The three "should-fix" items are about quiet failures, not damage.

### Should-fix

**S1. A booking can lose its closer invite for good if Google hiccups at the wrong minute.**
- `src/staff/calendar-sync.mjs:141` only invites closers whose row says `connected`.
- `src/staff/calendar-sync.mjs:338` flips every row to `error` when one freeBusy call fails (a Google 5xx, or a network blip while refreshing the token). Rows stay `error` until the next pass, up to 5 minutes.
- `src/workflows/s-04d-closer-calendar-invite.mjs:26` treats "skipped" as finished, so no retry. A booking that lands in that window logs `skipped: no_connected_closer` and the closer is never added.
- **Reproduced** on the scratch database: a connected closer is invited fine; one sync pass with a Google 503 flips the row to `error`; a booking right after gets `{"done":true,"attempts":1,"status":"skipped","reason":"no_connected_closer"}` and no retry.
- Fix idea (not done): invite by "has a saved address", not by the current status, or retry "no connected closer" when a link exists.

**S2. Nobody tells Chris if his Google approval dies.** `src/pulse/registry.mjs:62-72` says the sync is watched by its heartbeat. The heartbeat only says "the job ran". A dead token makes the job return normally with `ok:false`. If the Google consent screen is in "Testing" mode, a calendar token dies after 7 days (the pre-check already notes this, and the repo does not say which mode it is in). After that, old blocks stay but new busy times are not added, so Sarah or Justice could be double-booked. The only warning is on the staff's own screen ("Could not sign in..."). Fix idea: have the 7 a.m. pulse read the row errors, or check the consent screen's publishing status before shipping.

**S3. The branch cannot merge cleanly with `origin/main` (99 commits behind).** A dry-run merge (`git merge-tree`, no files touched) conflicts in 14 files: `db/expected-migrations.mjs`, `src/pulse/heartbeats.mjs`, `src/journeys/runner/index.test.mjs` (the REGISTERED count), and the generated journey and diagram pages. Main already has `434_yesdoor_core.sql` to `437_...`; this branch also has a `434_` file. The names differ, and this repo already has two `381_` files, so it works, but whoever merges must keep both, re-count REGISTERED, re-run `npm run journeys` and the diagram script, and re-run the heartbeat drift test.

### Minor

- **M1. A failed replacement still deletes the old block.** `src/staff/calendar-sync.mjs:386-398`: after an insert fails for a non-auth reason (say a 500), the loop carries on and runs the deletes. Reproduced offline: Justice's meeting grows, the new longer block fails to insert, the old block is deleted, and the slot is open until the next pass. My test shows a slot reopens about 30 seconds after a delete. Fix idea: skip deletes in a pass where any insert failed.
- **M2. Token refresh has no timeout.** `src/messaging/providers/google-calendar.mjs:115` calls the old Drive helper, which uses a bare `fetch`. A stuck connection holds the pass until Netlify kills it at 26 seconds (I proved no timeout exists). The calendar calls themselves do have a 6 second clock.
- **M3. A network blip on token refresh is shown as "Chris's Google approval needs doing again".** `src/staff/calendar-sync.mjs:277` matches any "token refresh failed" text. A real revoked token and a dropped connection look the same to Sarah and Justice. It clears itself on the next pass.
- **M4. Finished blocks are written, then left behind.** The window starts at 00:00 UTC today (`src/staff/calendar-sync.mjs:157`), so a busy time that ended this morning is still written (and, sorted by start, takes write slots before upcoming ones on the very first catch-up). Once the window moves past it, it is never listed again, so it is never deleted. Private clutter on Chris's calendar, nothing more.
- **M5. A POST or PUT could hang with no answer if the save returns no row.** `api/staff/calendar-link.mjs:56` returns `saveLink(...)`, and `:91-92` and `:97-100` stop silently on null. That needs a staff row to change orgs, so it cannot happen today.
- **M6. New setting names are not in `.env.example`:** `GOOGLE_CALENDAR_OAUTH_TOKEN_JSON`, `GOOGLE_CALENDAR_OWNER_EMAIL`.
- **M7. The "never overwrite a stored key" guard in the mint script trusts `netlify env:get`.** `scripts/google-oauth-mint.mjs:358-359`. If Netlify hands back an empty string for a secret value, the guard thinks nothing is stored. I could not test it (api.netlify.com is blocked here). It only matters if the mint is run twice.
- **M8. Reschedules and cancellations are not handled.** The builder wrote this down in `docs/journeys/booking-notifications-flow.md`. If ClickFunnels moves the same Google event, the closer stays on it. If it makes a new one, the closer is not on it.
- **M9. Any staff login can make the server ask Google about any address, and there is no rate limit.** The answer is only "connected / not shared", so the leak is tiny: someone could learn whether a given address has shared a calendar with Chris.

### Things that are fine, and how I know

- **Only our own blocks can be deleted.** The only delete call is in the sync pass. Its ids come from a list asked for with `privateExtendedProperty=fundhubMirror=1`, then checked again in our code (`isMirrorEvent`). I ran a stateful offline sim (60 busy blocks, converge over 3 passes, 25 writes per pass, no change on later passes) with three decoys on the fake calendar: a real booking, a human-made event titled "Busy - Justice", and an event with the property in the wrong place (shared, not private). None was touched.
- **The guest patch keeps guests and the Meet link.** The patch sends the full existing guest list plus the new one and leaves `conferenceData` out. Unit test confirms the body. Live test with the calendar tool confirms the result.
- **Who gets invited.** SQL requires role `closer`, staff status `active`, not demo, same org, link `connected`. The 14 database tests include a suspended closer and a sales manager, neither invited.
- **Auth.** `requireRole(... ROLE_SETS.STAFF)` runs after `requireAuth` (`api/staff/calendar-link.mjs:62-64`). The route is in `ROUTES` (`netlify/functions/api.mjs`). Every method acts on `req.staff.id`; no id comes from the request. A partner login gets a 403. A staff login from another org gets a 403.
- **Migration 434.** Adds one table, nothing else. Applied cleanly on a scratch copy of the whole schema (335 migrations) and applies again with no error. Same RLS shape as 432 (forced RLS, one permissive policy, grants to `fundhub_app`, no TRUNCATE). It leaves existing data alone.
- **Never throws.** I fed the real provider a fetch that throws, a 403 on patch, a 400 `invalid_grant`, and a missing token. Every call came back as a verdict, none threw. A database error inside the sync pass is caught too.
- **Pulse registry and heartbeat entries exist** (`src/pulse/registry.mjs:72`, `src/pulse/heartbeats.mjs:41`) and their drift tests pass.
- **Request shapes match Google's docs** (fetched from developers.google.com on 2026-10-07):
  - `freeBusy`: `POST /calendar/v3/freeBusy`, scope `calendar.freebusy` accepted, `items[].id`, 50 calendars max, per-calendar `errors[].reason` includes `notFound`.
  - `events.list`: `privateExtendedProperty=name=value`, `singleEvents`, `showDeleted`, `maxResults` up to 2500, `timeMin` and `timeMax` are overlap-style bounds. Accepts `calendar.events`.
  - `events.insert`, `events.patch`, `events.delete`: `sendUpdates` is `all`, `externalOnly` or `none`; all accept `calendar.events`. `guestsCanSeeOtherGuests` is a writable boolean. Patch overwrites arrays whole.
  - Token refresh: POST to `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`; a dead token answers `invalid_grant`.

## Gates (run by me, 2026-10-07)

| Gate | Result |
|---|---|
| `npm run lint` | exit 0. "2432 file(s) and inline script(s) parse clean" |
| `npx tsc --noEmit` | exit 0, no output |
| `npm test`, no database | **12429 tests, 12417 pass, 8 fail, 4 skipped** (1323 suites, 131.6 s). Same 8 as the old commit. I re-ran those 5 files on a clean export of `53e6949`: also 8 failures (105 tests, 96 pass, 8 fail, 1 skipped). The files are `src/http/content-tiles.test.mjs`, `src/http/payment-links-endpoints.test.mjs`, `src/finance/crs-identities.test.mjs`, `src/security/superuser-guard.test.mjs` (the one that wants `DATABASE_URL`), `scripts/sim/push-credit.test.mjs`. None are in the diff. The old commit's suite (builder's log) had 12365 tests, so the branch adds 64 tests. |
| New unit files | `google-calendar.test.mjs` 17/17, `calendar-sync.test.mjs` 28/28, `staff-calendar.test.mjs` 9/9, `staff-calendar-link.test.mjs` 10/10 (64 total). With the registry, heartbeat, routes, workflow index and no-unfenced-transmit tests: 113/113. |
| `staff-calendar-link.pg.test.mjs`, scratch DB, as owner | 14 tests: 13 pass, 0 fail, 1 skipped (the app-role test needs a second login) |
| Same file with `APP_DATABASE_URL` as `fundhub_app` | **14/14 pass, 0 skipped** |
| `guard:db` and `guard:rls` as `fundhub_app` | 3/3 and 4/4 pass |
| Whole pg suite, branch, scratch DB (all 229 `*.pg.test.mjs` files, one at a time, `APP_DATABASE_URL` set) | **3235 tests, 3026 pass, 167 fail, 40 cancelled, 2 skipped** (466 s) |
| Same suite at the old commit `53e6949` (my own clean export, its own 334-migration scratch DB, 228 files) | **3221 tests, 3012 pass, 167 fail, 40 cancelled, 2 skipped** (483 s) |
| Branch vs old commit | The two lists of failing tests are **identical** (244 "not ok" lines each, diffed by name, none only on one side). So **0 new pg failures**, and the 14 new pg tests all pass. The 167 old failures are not this change's. (The builder reported the same 167 in its logs; I re-measured both sides myself.) |

Scratch Postgres: 16.x, local, port 55432, data in `/var/tmp/pgverify`, all 335 migrations applied (including 434). It is not the live database.

## Simulation on Chris's real Google calendar (Google Calendar tool, as Chris)

The app has no Google token yet, so I played its part with the calendar tool.

### 3a. Private, opaque busy block hides the slot on the live booking page

- Open times read the way the pre-check does it (live ClickFunnels page, then Cronofy). 49 times open at 18:52 UTC.
- 18:52:38 UTC: created ONE event on Chris's primary calendar, shaped like the code's block: "Busy - Verifier", 2026-10-08 23:00 to 23:30 UTC, `visibility: private`, shown as busy, no reminders, no guests, no notifications.
- Polled every 20 seconds. Still open at 18:53:55. **Gone at 18:54:16**, so hidden between 77 and 98 seconds after it was made (the pre-check measured 3 min 10 s to 3 min 28 s for a normal event; this was faster, one run each).
- 49 open times became 47. The 23:00 slot went, and so did 22:30. That is the 15 minute buffer after each call: a busy block also closes the slot just before it. Not a bug, but good to know.
- Deleted it at 18:55:03. **Back at 18:55:47** (still gone at 18:55:26), so it came back within 23 to 44 seconds.
- Not testable with this tool: the `fundhubMirror=1` private property. Its filter is checked by unit tests and Google's docs.

### 3b. Closer added to a booked call

- 18:53:00 UTC: made a test event on Chris's calendar, 2026-10-09 08:00 to 08:30 UTC (1 a.m. Phoenix, not a bookable time), with a Google Meet link and one guest `stanbridgejchris+sim-lead@gmail.com`. The lead's invite email arrived at 18:53:06.
- 18:55:10: updated it the way S-04D does: added `stanbridgejchris+sim-closer@gmail.com`, told Google to email everyone (`notificationLevel ALL`, same as `sendUpdates=all`), and set guests-cannot-see-guests (`guestsCanSeeGuests: false`, same as `guestsCanSeeOtherGuests: false`). The tool accepted both settings.
- `get_event` after: guests are Chris (organizer), the sim lead and the sim closer. **The Meet link `meet.google.com/taj-xztq-kjb` is unchanged.** `guestPermissions.guestsCanSeeGuests` is false.
- Gmail: the closer's invite arrived at 18:55:16. **The lead got no new email** (still one message in the lead's thread two minutes later). So adding a closer does not send the lead an update, at least with guests hidden.
- What I could not prove: the tool adds one guest ("add") and cannot send the whole attendee list back the way `addAttendees` does (`src/messaging/providers/google-calendar.mjs:303-332`). That exact request is covered by `google-calendar.test.mjs` (body keeps every existing guest, no `conferenceData`, `guestsCanSeeOtherGuests:false`, `sendUpdates=all`) but was not sent to Google by anyone. It is the standard read, append, patch shape and the docs say arrays are replaced whole, so I expect it to work, but it is untested.

### Cleanup

Both test events were deleted (calendar tool, notifications off) and confirmed gone: `get_event` for `sqsmutl1fgp6a5bn6cnnd913cs` (3a) and `ls4sue89npmtfp9u2kvqg2i0js` (3b) both say "not found or deleted", and a list of 7 to 12 October on Chris's calendar with the words "VERIFY" or "Busy" shows nothing.
Left over, harmless: two "Invitation: Funding Strategy Meeting - VERIFY TEST (delete me)" emails in Chris's inbox, one to each plus-tag address (18:53 and 18:55 UTC). I did not touch the mailbox.

## Still not proved by anyone

1. Whether Google lets Chris's token run `freeBusy` on a calendar shared only at "See only free/busy" when that calendar is not in his calendar list. The pre-check flagged this too. Only a real share proves it. The first Connect press by Sarah or Justice should turn Connected; if it says "Not shared yet" after a correct share, this is the cause.
2. The consent screen's publishing status (7-day token expiry if "Testing").
3. The real `events.patch` with the whole guest list (above), and the real `events.list` filter on the private property. Both match the docs and the unit tests.
4. Reschedules (M8).
5. Whether `ADAPTERS_DRY_RUN` is `0` in production for the new calls. Boards of 09-23 and 10-02 say it is. If not, every row shows "Google calls are switched off on this site right now (ADAPTERS_DRY_RUN)".
