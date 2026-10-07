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

---

## Re-check of fixes

Date: 2026-10-07. Checked by: a different tester than the builder and than the first verifier. Branch `claude/ecstatic-galileo-h9suqe`, HEAD `e0035bf`, diffed against `17087b2` (commits `17a6d66`, `3f56b28`, `e0035bf`; 7 files, all under `src/`).
Rules I followed: no code changed, nothing committed, nothing pushed, nothing sent to Google (every Google call was a fake or a local test server). The shell's `DATABASE_URL` pointed at the live database, so every test ran with it removed (`env -u DATABASE_URL`) or pointed at my own private scratch Postgres (16.x, port 55433, all 341 migrations applied). The live database was never touched. The only file I wrote is this section.

### Verdicts

| Fix | Verdict | One line |
|---|---|---|
| S1 | **PASS** | No blip path changes a row or deletes a block. Only a per-calendar `notFound` or `forbidden` moves a row. A booking right after a blip still invites the connected closer. |
| S2 | **PASS** | A dead token (`invalid_grant`, `invalid_client`, `unauthorized_client`) fails the run non-retriably, the heartbeat records an error, and the pulse shows `job:staff-calendar-busy-sync` FAIL. Blips and a hung token call do not fail the run. |
| M1 | **PASS** | A pass in which any insert failed deletes nothing. The next healthy pass writes the new block first and then removes the old one. |
| M2 | **PASS** | The token refresh carries `AbortSignal.timeout(6000)`. A token endpoint that never answers ended the pass in 6.0 seconds on the real `fetch`. |
| M4 | **PASS** | The window starts at the current minute. A block already under way is not rewritten (0 writes on every later pass, 9 passes followed through a whole meeting, with Google's busy answer both clipped and unclipped). No gap, no churn. |
| "Never touch a non-mirror event" | **PASS, no regression** | 4,000 random diffs with the new clipped compare: 0 non-mirror events in `toDelete`. A stateful run with 4 decoys on the fake calendar: none touched. |

### How I tried to break each one

**S1.** I ran the real sync pass, the real provider and the real token code against a fake Google that I could make fail at each layer. For each case I checked three things: no `UPDATE staff_calendar_links`, no insert or delete sent to Google, and the run result.
- freeBusy answered 503, 500 (HTML body), 429, 401, 403 (API not enabled), and a thrown network error: rows untouched, no writes. Run `ok:false`, `tokenDead:false`.
- Token endpoint answered 503 (HTML), 500 (JSON), 429, and threw: same result.
- `events.list` answered 503: no writes, `tokenDead:false`.
- Per-calendar answers inside a good freeBusy: `backendError`, `internalError`, `groupTooBig`, `tooManyCalendarsRequested`, an empty reason, and a calendar missing from the answer all left Sarah's row untouched and her existing block undeleted. `notFound`, `forbidden`, and `backendError` plus `notFound` moved her row to `pending` and still did not delete her block (it is in `leaveAlone`). A healthy neighbour (Justice) was still handled normally in the same pass.
- "Save and check" (`checkMyCalendar`) during a 503, a thrown error, and a dead token returned `result:"error"` and left the row exactly as it was.
- A booking right after a blip: ran one real sync pass into a 503, then `inviteClosersToBooking` through the real provider. The connected closer was added to the guest list. The new pg test (`a Google blip during a sync pass leaves the closer connected...`) passes on a real database, as owner and as `fundhub_app`.
- Only two other writers of a row status remain, and neither is a blip: the "that is the booking calendar itself" error (`calendar-sync.mjs:332`, `:443`) and "waiting on approval" when the env var is missing or unusable (`:322`, `:447`).

**S2.** The builder's own test calls `heartbeatHooks().finished()` by hand. I wanted the real thing, so I drove the real route `api/inngest.mjs` (the `serveEdge` handler the site uses) with the real Inngest SDK 3.54.2 in dev mode, in two requests, the way Inngest does it (step run, then replay with the step result). The real `staff-calendar-busy-sync` function ran against a local test server standing in for Google's token endpoint, and the heartbeat row landed in the scratch database. Then I called the real `checkJobHeartbeats`.
- Token endpoint answers 400 `invalid_grant` (the real shape): step returned `tokenDead:true` (206), the second request ended 400 with `x-inngest-no-retry: true`, exactly one heartbeat row was written for the whole run (the step request writes none), `outcome='error'`, `error` = the plain sentence. The pulse row read: `FAIL - last run ... ended in an error: Chris's Google calendar approval stopped working (Google refused the stored token), so busy times are not being copied to the booking calendar.`
- Same result with no staff links at all (the token is reached through the existing-blocks list) and with a connected link (reached through freeBusy). In both, the link row stayed `connected` with no error text.
- Token endpoint 503 (HTML) and 500 (JSON), and a hung endpoint: run succeeded (HTTP 200), heartbeat `ok`, pulse row PASS. A blip never fails the run, so it cannot page every five minutes.
- Nothing else in the repo reacts to a failed Inngest run (I searched for `function.failed` and `onFailure`), so a dead token shows up once, at the 7 a.m. pulse, not every five minutes. The pulse reads only the newest heartbeat, so a single odd `invalid_grant` that is followed by a good run clears itself.
- The `finished` hook fires only on the last request of a run (SDK `v1.js:694` skips step requests), so the thrown error after the step is the one that is recorded.

**M1.** Stateful fake calendar, real provider. A meeting grew from 13:00-14:00 to 13:00-14:30; the new block's insert returned 500. That pass sent 0 deletes, the old block stayed on the calendar, `ok:false`, `failures:1`, `deferred:1`, note ends "removals held until the new blocks are in". The next healthy pass sent `insert, delete` in that order and left one block. A pass with no inserts still deletes stale blocks. A pass that hit the 25-write cap (30 blocks) did the inserts only; the second pass finished the rest.

**M2.** Real `fetch` against a local server that never answers: `calendarAccessToken` came back `ok:false` with "Google token refresh failed: The operation was aborted due to timeout" after 6,016 ms, inside the full sync pass (the pass returned, not failed). Not a dead token, so no pulse failure. The unit test passes too. The wrapper passes a fresh `AbortSignal.timeout` on every call, so a retry gets a new clock.

**M4.** A fake calendar that keeps events and answers `events.list` the way Google does (overlap with the window, private-property filter). Meeting 09:00-10:00 followed through passes at 08:50, 08:55, 09:00, 09:05, 09:10, 09:30, 09:55, 10:00, 10:05: one insert at 08:50, then nothing, ever. First seen at 09:20: one insert 09:20-10:00, then nothing. Meetings that ended this morning: never written. Cancelled at 09:25: block deleted (slot not stuck closed). Extended to 10:30 at 09:25: new block in first, old out second, then quiet. Shortened: old replaced. All of that was run twice, once with Google's busy answer clipped to the window and once with whole intervals, and it came out the same.

### Gates (run by me, 2026-10-07)

| Gate | Result |
|---|---|
| `env -u DATABASE_URL npx tsc --noEmit` | exit 0, no output |
| `npm run lint` | exit 0, "2595 file(s) and inline script(s) parse clean" |
| The seven requested unit groups, run together, `DATABASE_URL` unset | **145 tests, 145 pass, 0 fail, 0 cancelled, 0 skipped** |
| ...per file | `calendar-sync.test.mjs` 36/36, `staff-calendar.test.mjs` 12/12, `google-calendar.test.mjs` 18/18, `staff-calendar-link.test.mjs` 10/10, `src/pulse/*.test.mjs` 39/39 (3 database suites in that folder show SKIP with no database), `workflows/index.test.mjs` 13/13, `journeys/runner/index.test.mjs` 17/17 |
| `staff-calendar-link.pg.test.mjs`, scratch DB, as owner | 15 tests: 14 pass, 0 fail, 1 skipped (the app-role test) |
| Same file with `APP_DATABASE_URL` as `fundhub_app` | **15/15 pass, 0 skipped** |
| `src/pulse/heartbeats.pg.test.mjs`, scratch DB | 4/4 pass |

I did not re-run the full 12,000-test suite or the full pg suite; the diff touches only the seven files above and the files that import them are in the groups I ran.

### New findings

None blocks. In order of how much I would care:

1. **Low to medium: a long-lasting setup problem is now invisible.** Because only `notFound` and `forbidden` may touch a row and only a dead token fails the run, these now leave no trace anywhere a person looks: the adapters fence closed (`ADAPTERS_DRY_RUN` not `0`), the Google Calendar API not switched on for the project, a 403 on the scope. I ran each: the sync returns `ok:false` with a good note, but writes no row text, the heartbeat says `ok`, the pulse is PASS, and Sarah's "Save and check" answers `result:"error"` with `last_error: null`, which the screen turns into "Saved, but Google did not answer. Try again in a few minutes." forever (`src/staff/calendar-sync.mjs:349-353` for the pass, `:457-458` for the check; `public/app/calendar.html:1685`). Before this change those cases wrote a plain reason on the row ("Google calls are switched off on this site right now (ADAPTERS_DRY_RUN)"). This matters on day one, because item 5 of "Still not proved by anyone" above is exactly the fence. It is not damage and it is not a failure of S1 or S2 as worded. A way to keep S1 and still say it: write `last_error` without changing `status` (the status stays `connected`, only the words change), or fail the run for the "not switched on" and fence cases the same way as a dead token.
2. **Low: `deleted_client` and `disabled_client` are not in the dead-token list** (`src/staff/calendar-sync.mjs:66`). Those are the codes Google gives when the OAuth client itself was deleted or disabled. I ran `deleted_client` through the real chain: `tokenDead:false`, run succeeds, pulse PASS, nothing shown. That is the same silence S2 set out to remove, for a rarer cause.
3. **Low: one stuck insert holds every delete, indefinitely** (`src/staff/calendar-sync.mjs:399`, the M1 guard). I ran a block whose insert always fails: 3 passes in a row, 0 deletes, and the stale block from a cancelled meeting stays on the calendar, so that slot stays closed. The run is `ok:false` every pass but is not failed, so nothing tells anyone. Likewise one delete that fails stops every later delete in that pass, because the guard counts delete failures too (`out.failures > 0`, checked before each delete). This is the safe direction (a slot stays closed rather than opens), and it is what M1 asked for. It just has no exit.
4. **Nit: a token that dies in the middle of a pass is not flagged that pass** (`src/staff/calendar-sync.mjs:412-419` does not set `tokenDead` from an insert or delete failure). The next pass catches it at freeBusy or the list, so the delay is at most five minutes.
5. **Nit: "Save and check" after a blip shows the previous message** (for example "Not shared yet") in red, because the row keeps its last real answer. True as of the last real check, just not new.

None of these touches the "never touch a non-mirror event" guarantee, and I found no path where a blip changes a row, deletes a block, or fails the run, and no dead-token path that stays off the heartbeat.

### Not proved

- A real Google `freeBusy` answer was not used. I ran both shapes it could take (intervals clipped to the window, and whole intervals) and M4 holds either way.
- Inngest Cloud's own orchestration was not used. I used the real SDK execution engine and the real route, which is where the heartbeat hook and the non-retriable flag are decided.
- The pre-existing S3 (merge conflicts with `origin/main`) and the minor items M3, M5 to M9 above were out of scope for this re-check and are unchanged by these commits, except M3, which the new rule makes moot (a token-refresh blip no longer reaches the staff row at all).
