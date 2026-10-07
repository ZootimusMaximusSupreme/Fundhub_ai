# Pre-check results (2026-10-07)

Tester: agent (Sonnet). Run 2026-10-07 18:08 to 18:20 UTC. No product code changed. Nothing booked, nothing sent, ClickFunnels admin never opened.

## The short answer

| # | Question | Result |
|---|---|---|
| 1 | Does a busy event on Chris's Google calendar hide that time on the live booking page? | **PASS.** Hidden about 3 minutes after the event was made. Back about 50 seconds after it was deleted. |
| 2 | Does a push to main deploy production? | **No sign that it does.** No Netlify status, check or deploy shows on any recent commit or on PR #57. The last ship's deploy step was refused by Netlify. The live site is not running main's latest code. |
| 3 | Google Calendar API facts | a, b, c, d all hold as written in the plan. Two catches: a patch replaces the whole guest list, and a shared calendar does not land in the other person's calendar list by itself. Details below. |

## 1. The crux: busy event hides the slot

### How the page loads its open times

The page `https://apply.fundhub.ai/funding-book-call` is a ClickFunnels calendar. ClickFunnels does not keep the open times itself. A scheduling service called Cronofy does. The page makes two calls:

1. `POST https://apply.fundhub.ai/user_pages/api/v1/appointments/event_types/14234/calendar_config` with body `{"host_id":14784}`. No login needed. It returns a short-lived token and the question to ask (`availability_query_json`).
2. `POST https://api.cronofy.com/v1/availability?et=<token>` with that question. It returns `available_slots`, each with a `start` and `end` in UTC.

What the question says (read from the live response):

- Cronofy account `acc_6072c7c7b998d50062653c61`, calendar `cal_antijzI54wbfVsMP_FLXRYCPViGou2zBrEyj5Ug` (only one calendar is checked), hours rule `schedule_10589`, `managed_availability: true`.
- 30-minute calls, a slot every 30 minutes, 0 minutes buffer before and 15 minutes after.
- The window is short: from one hour from now to three days from now. So the page only ever offers about three days.

`https://apply.fundhub.ai/schedule/phonecall` ("Meeting with Chris") is a different page type. Its HTML carries the same Cronofy account, the same calendar id and the same hours rule, with host id 14853 and a 5 minute buffer on each side. Slots there come from the same calendar. I did not test it separately.

### Re-check the open times without a browser

Two things are easy to miss. The token goes in the `et` query string, not in an Authorization header. And Cronofy answers 401 unless the `Cronofy-Element` header is sent.

```bash
cfg=$(curl -sS -X POST https://apply.fundhub.ai/user_pages/api/v1/appointments/event_types/14234/calendar_config \
  -H 'Content-Type: application/json' -d '{"host_id":14784}')
tok=$(echo "$cfg" | jq -r .cronofy.element_token)
q=$(echo "$cfg" | jq -r .cronofy.availability_query_json | jq -c '. + {response_format:"overlapping_slots", max_results:512}')
curl -sS -X POST "https://api.cronofy.com/v1/availability?et=$tok" \
  -H 'Content-Type: application/json; charset=utf-8' -H 'Origin: https://apply.fundhub.ai' \
  -H 'Cronofy-Element: v1.60.0, DateTimePicker' -d "$q" | jq -r '.available_slots[].start'
```

Tested 2026-10-07: it printed 48 start times. The version in `Cronofy-Element` (v1.60.0) is the one the page loads today; if the page moves to a newer Cronofy script, send that version.

In a real browser (Playwright, Chromium), the page showed the same list in the viewer's time zone.

### The test

- Slot picked: **Friday 2026-10-09, 22:00 to 22:30 UTC.** That is 3:00 to 3:30 PM on Chris's calendar clock (his calendar's time zone is America/Phoenix, UTC-7). It was 48 slots in the list before the test.
- Event made on `stanbridgejchris@gmail.com` (primary): "Fundhub busy-block test - delete me", exactly 22:00 to 22:30 UTC, shown as busy (Google default), no guests, no notifications, no reminders. Created **18:10:29 UTC**.
- Checked every 20 seconds.

| Time (UTC) | After creating | 22:00 slot |
|---|---|---|
| 18:10:39 to 18:13:39 | up to 3 min 10 s | still open (every check) |
| 18:13:57 to 18:14:18 | 3 min 28 s to 3 min 49 s | **gone** (47 slots left) |
| 18:14:39 to 18:15:01 | after deleting (event deleted at about 18:14:30) | still gone |

- So it took **between 3 min 10 s and 3 min 28 s** for the slot to disappear.
- The real page agrees. Loaded in a browser and clicked on Friday the 9th, it listed 10:00, 10:30, 11:00, 11:30 AM, 1:00 PM, then jumped to 3:30 PM. The 3:00 PM slot was missing.
- The next slot (22:30 UTC) stayed open. The 15 minute buffer did not take it.
- **Deleted at about 18:14:30 UTC.** The slot was open again at **18:15:22 UTC** (not yet at 18:15:01). That is back within about 50 seconds.
- Deleted for sure: `get_event` says not found, and a list of Friday the 9th on his calendar shows only his own events.

### Verdict

**PASS.** ClickFunnels (through Cronofy) does check Chris's primary Google calendar, and a plain busy event there removes that time from the booking page. This also shows that `cal_antijzI54wbfVsMP_FLXRYCPViGou2zBrEyj5Ug` is, or mirrors, his primary calendar.

One more sign, not a separate test: Chris's own recurring events on that Friday (Admin / email batch 12:30, Deep work 2:00 PM) line up with open times that are missing from the list (12:00, 12:30, 2:00, 2:30 PM). The hours rule may explain part of that.

### What this means for the build

- Plan on a delay of about 3 to 4 minutes for Google to reach Cronofy, on top of the 5 minute sync job. A time that just turned busy can still be bookable for up to about 8 to 9 minutes. That is one measurement, not a guarantee.
- Removing a busy block frees the slot faster than adding one hides it (about 50 seconds here).
- The page only offers the next three days. The busy sync only has to cover now to about four days out for the page to be right.
- Existing ClickFunnels events on his calendar look like this: title "Funding Strategy Meeting - <lead name>", Chris is creator and organizer, a Google Meet link is attached, and the lead is the one guest. Justice would be a second guest on those.

### Not tested

- Only one kind of busy event: a timed 30 minute event made on the primary calendar. Not tested: an event shown as free, an all-day event, a private event, a recurring event, or the title "Busy".
- One slot, one run. The delay is a single measurement.
- The phone call page was not tested directly (same calendar and rule, so expected to behave the same).
- Not tested: whether ClickFunnels still blocks when Chris is not the host (the board already lists this as a known limit).

## 2. Does a push to main deploy production?

Checked with the GitHub tools and `gh api`.

Latest three commits on main:

| Commit | What | GitHub checks |
|---|---|---|
| `bb25668` (17:35 UTC) | Merge of PR #58, Yesdoor upsell ladder | Actions only: suite (no database) passed, suite (real Postgres) failed, screens (real browser) cancelled |
| `b96ee73` | Yesdoor board: "database applied, deploy refused by Netlify" | Actions only: same pattern, some cancelled |
| `3b8c0cb` | Yesdoor money model | Actions only: all three cancelled |

- None of the three has a commit status. The combined status is "pending" with zero entries.
- None has a Netlify check run. The only check suites on main are `github-actions` and `claude`.
- The repo's GitHub "deployments" list is empty.
- **PR #57** (head `0b4df76`) has no Netlify deploy preview: no status, no check, no bot comment. Only Actions runs, still going when I looked.
- I could not read the repo's webhooks (the proxy blocks that path, 403), so I cannot say whether Netlify's Git link exists.

Other evidence:

- `ops/workflows/yesdoor-mvp-build-2026-10-07.md` line 319: after PR #55 merged, `npm run ship` applied 14 database changes, then "`netlify deploy` answered 'Unauthorized: could not retrieve project'. So the live site still runs the old build."
- `ops/ship-log.md` on main: the last entry is 2026-10-04.
- Live `https://fundhub.ai/api/health` at 18:11 UTC: `migrations: 387, expected: 357, pending: 0`. Main's `db/expected-migrations.mjs` lists 340. So the build on the live site is not main's latest code.
- `netlify.toml` has a `[context.production]` build command, and comments about "Git production builds", so a Git-connected build may exist. Nothing visible from here shows it running.

Finding: do not assume a merge to main puts code live. Today a deploy needs `npm run ship`, and its deploy step was refused on 2026-10-07. I did not touch Netlify (blocked host per CLAUDE.md §11).

## 3. Google Calendar API facts

**a. freebusy.query with a free/busy-only share.** Holds, with one catch.
- A calendar shared at "See only free/busy" is the `freeBusyReader` role: "Lets the grantee see whether the calendar is free or busy at a given time, but does not allow access to event details." ([Calendar sharing](https://developers.google.com/workspace/calendar/api/concepts/sharing); role text: "Provides read access to free/busy information." in [ACL](https://developers.google.com/workspace/calendar/api/v3/reference/acl); the Calendar Help wording is "People can only find out when you're busy" in [Share your calendar](https://support.google.com/calendar/answer/37082).)
- [freebusy.query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) "Returns free/busy information for a set of calendars", by calendar id. Scopes include `calendar.freebusy` and `calendar.readonly`.
- Catch: the freebusy page does not say the calendar must be in the caller's calendar list, and nothing says it must not. The sharing page says: "Sharing a calendar with a user no longer automatically inserts the calendar into their `CalendarList`." The list and the access list are separate. Only the first real share can prove which way it goes. I could only test Chris's own calendar.

**b. events.patch adding a guest with sendUpdates=all.** Holds, with one catch.
- [events.patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch): `sendUpdates` "all": "Notifications are sent to all guests." Other values: "externalOnly" (non-Google Calendar guests only) and "none".
- Catch: patch replaces arrays whole. [Performance guide](https://developers.google.com/workspace/calendar/api/guides/performance): "Patch requests that contain arrays replace the existing array with the one you provide. You cannot modify, add, or delete items in an array in a piecemeal fashion." So the patch must send the full guest list (Chris, the lead, and Justice), or the lead is dropped.
- The Meet link stays if the patch leaves `conferenceData` out: "fields that you omit are not cleared" (same guide), and `conferenceDataVersion` 0 "ignores conference data in the event's body" (patch page). That second part is my reading of the doc, not tested.
- "All guests" can include the lead, so the lead may get an update email too. I was not allowed to email anyone, so I did not test what Justice or the lead receives.

**c. events.list privateExtendedProperty.** Holds. [events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list): "Extended properties constraint specified as propertyName=value. Matches only private properties. This parameter might be repeated multiple times to return events that match all given constraints." It cannot be used together with `syncToken`.

**d. 7-day refresh token expiry in Testing.** Holds. [OAuth 2.0 expiration](https://developers.google.com/identity/protocols/oauth2#expiration): "A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of 'Testing' is issued a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile." Calendar scopes are not in that exception. Other ways a token dies: the user revokes access, six months unused, too many tokens on one account. I searched `scripts/google-oauth-mint.mjs`, `docs/` and `ops/` for the consent screen's publishing status. It is not written down in the repo, so someone has to read it in Google Cloud.

## Cleanup

- Test event `dusanbcr09amnf03g333etc2q8` deleted 2026-10-07 ~18:14:30 UTC and confirmed gone.
- Nothing is left behind on Chris's calendar or on ClickFunnels. The only file written is this one. No commit, no push.
