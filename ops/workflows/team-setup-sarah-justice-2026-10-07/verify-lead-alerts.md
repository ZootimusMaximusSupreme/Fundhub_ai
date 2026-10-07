# Verify: lead alerts to Chris (W2 build), second tester

Date: 2026-10-07. Branch `claude/ecstatic-galileo-h9suqe`. Build commits `9e432b5` and `f0d2f5a`, compared with `bb9c722`. (A third commit, `cfcad26`, appeared while I worked. It only adds the role-play doc, so it changes none of my results.)

Spec: `w2-lead-alerts-spec.md` in this folder. Board: `ops/workflows/team-setup-sarah-justice-2026-10-07.md`.

Tester: a different session from the builder. I changed no code, made no commit, and pushed nothing. This file is the only thing I wrote in the repo.

## Verdict: FAIL (one go-live blocker, two should-fix bugs)

The new code is mostly careful. Duplicate protection held under a hard race test. Nothing can reach anyone but the two settings. The fence works. No phone number or address leaked.

It fails for three reasons:

1. **Blocker (the cause is older than this build, but it defeats the goal).** The first step of the new workflow calls `resolveClient`. On a database where migration 372 has run, that function throws, so no lead gets an alert. The board says production has run 372. The real-Postgres test hides this by stubbing out the failing read.
2. **Should-fix.** The new pulse check can say PASS ("all alerted") while leads get nothing. That happens in exactly the case from item 1.
3. **Should-fix.** A lead can put HTML in their name or ad tag, and it is sent to Chris as an HTML email.

## What I ran and where

* Scratch Postgres 16 on `127.0.0.1:55432` (data under `/var/tmp/la-verify-pg/`). All 341 migrations applied to an empty database. `fundhub_app` given a login for the run: not a superuser, no `BYPASSRLS` (checked).
* My shell's `DATABASE_URL` points at the hosted Supabase pooler. I never used it. Every command ran with `env -u DATABASE_URL`, or pointed at the scratch URL. Every script that writes refuses to run unless the host is `127.0.0.1:55432`.
* Nothing was sent. The shell has no Twilio SID, Twilio token or Resend key. Every send probe used the real provider code with an injected recorder in place of `fetch` and an explicit `env` object. `MESSAGING_DRY_RUN=0` is set in my shell, so full-suite runs unset it too.
* I did not touch production, did not query it, and did not read `.env.example` (the environment denies it).

### Test counts (exact)

| Command | Result |
|---|---|
| `npm run lint` | 2601 files parse clean, exit 0 |
| `env -u DATABASE_URL npx tsc --noEmit` | exit 0 |
| `src/staff/lead-alert.test.mjs` | 28 tests, 28 pass |
| `src/workflows/lead-alert-owner.test.mjs` | 28 tests, 28 pass |
| `src/pulse/lead-alerts-check.test.mjs` | 10 tests, 10 pass |
| `src/workflows/index.test.mjs` | 13 / 13 |
| `src/journeys/runner/index.test.mjs` | 17 / 17 |
| `src/lib/no-unfenced-transmit.test.mjs` | 5 / 5 |
| `src/pulse/*.test.mjs` (all, no database) | 49 / 49 (the `.pg` files add no tests without a database) |
| `src/workflows/lead-alert-owner.pg.test.mjs`, scratch Postgres, as owner | 8 tests, 8 pass |
| same, as `fundhub_app` | 8 / 8 |
| `src/pulse/system-checks.pg.test.mjs`, as owner | 7 / 7 |
| same, as `fundhub_app` | 7 / 7 |
| `npm run journeys:check` | up to date (9 files) |
| `npm run diagrams:check` | up to date (11 files) |
| Full `npm test`, no database, branch | 13011 tests, 12999 pass, 8 fail, 4 skipped |
| Full `npm test`, no database, `bb9c722` export | 12945 tests, 12933 pass, 8 fail, 4 skipped |

The branch adds 66 tests and all 66 pass. The same 8 tests fail on the base and on the branch: `scripts/sim/push-credit.test.mjs` (1), `src/finance/crs-identities.test.mjs` (1), `src/http/content-tiles.test.mjs` (1), `src/http/payment-links-endpoints.test.mjs` (4), `src/security/superuser-guard.test.mjs` (1, because I unset `DATABASE_URL`). I re-ran each of those files on both trees and got identical counts. I did not run the whole suite against the scratch database (the repo already records many failures there).

## Bugs

| # | Severity | Where | What |
|---|---|---|---|
| 1 | **Blocking (go-live)** | `src/workflows/lead-alert-owner.mjs:166` calls `resolveClient`. Cause: `src/handlers/client-lifecycle.mjs:152,158,222` (and `:101`) read `clients.ghl_contact_id`. Hidden by the stub at `src/workflows/lead-alert-owner.pg.test.mjs:42`. | Migration `db/migrations/372_rename_legacy_crm_column_and_keys.sql` renames that column to `legacy_contact_id`. On my scratch database (all migrations applied) `resolveClient` threw `column "ghl_contact_id" does not exist` in all three cases: with a client id, with an existing email, and with a brand-new email (probe C). So the first step fails and no alert is sent. The boards say production ran 372: `ops/workflows/tracking-everything-2026-10-02.md:159` ("already applied in production"), `ops/workflows/knockout-2026-10-05.md:255` (K2), `ops/workflows/sync-2026-10-07.md:123`. Both boards say the live database was not checked, and I did not check it either. The pg test says it stubs the read "so the alert itself is what gets measured", so a green pg test proves nothing about this step. The manifest and `docs/journeys/lead-alert-flow.md` never mention it. |
| 2 | **Should-fix** | `src/pulse/system-checks.mjs:110-112` (the `EXISTS` on `e.client_id = c.id`) | The pulse counts a lead only if its `entry.captured` or `booking.created` event row has `client_id` set. When `resolveClient` fails, the intake paths write the event with `client_id` NULL on purpose: `src/adapters/clickfunnels.mjs:631-650` ("event kept, client_id null") and `api/public/survey-submit.mjs:95-112` (`catch { return null }`). Probe B on a real database: an unalerted lead made 2 hours ago with a NULL-`client_id` event gave **PASS, "0 new lead(s) in the last 24 hours, all alerted by text and email"**. The same lead went FAIL as soon as the event carried the client id. This is the failure bug 1 causes, so the one watcher is blind to it. |
| 3 | **Should-fix** | `src/staff/lead-alert.mjs:84-90` (`oneLine` keeps `<` and `>`), `:158-179` (email body); trigger at `src/messaging/providers/resend.mjs:139` (`looksHtml`) | The lead's name (public form) and the ad tag `utm_content` (public URL parameter) go into the email body. If either contains `<table `, `<html` or `<!DOCTYPE html`, the Resend provider sends the whole body as `html`, with the lead's markup live. Probe A: a name of `<table><tr><td><a href="https://evil.example/x">Open the lead in the CRM</a>` produced an `html` field in the Resend payload. The same happened through `utm_content`. Any stranger can plant a clickable link, made to look like the CRM link, in the one email Chris trusts. No script runs, but it is phishing in a trusted message. SMS is not affected. |
| 4 | Minor | `src/staff/lead-alert.mjs:191-216`, `src/workflows/lead-alert-owner.mjs:146-148` | With two or more recipients, if one is accepted and one fails, the channel counts as sent. The failure is dropped: the log line says only "sent". Probe F: `{"status":"sent","accepted":1,"failed":1}`. Whoever is second on the list (Justice, later) can silently get nothing. The reason for not retrying (it would double-text the first person) is sound. A log line with the failed count would not be. |
| 5 | Minor | `src/workflows/lead-alert-owner.mjs:153` | A permanent refusal (HTTP 400 or 422) returns normally, so the run ends green. Real causes: a typo'd but well-formed number, or Chris having replied STOP to the Twilio number. Every lead then gets nothing, the Inngest screen shows success, and the only net is the 7:00 a.m. pulse. The stamp is correctly left empty, so the pulse does catch it, up to a day late. |
| 6 | Minor | `src/pulse/system-checks.mjs:98-99` | `since = now - 24h`, `until = now - 15 min`, and the pulse runs once a day (`0 13 * * *`). A lead made in the 15 minutes before one pulse is skipped by that pulse and is older than the window for the next. Probe B2 confirms the next day's pulse reads PASS. So about 15 minutes of each day is never checked. Using `since = now - 24h - grace` closes it. |
| 7 | Minor | spec section 7 lists `.env.example` | The two names were not added. The manifest says so ("the environment denies reading it"). |
| 8 | Minor | `src/workflows/lead-alert-owner.mjs:138` | The email's "Time:" is the moment the step ran, not the moment the lead came in (the spec says event time). After a retry or an outage it can be later than the real arrival. |
| 9 | Minor (known, documented) | claim at `src/workflows/lead-alert-owner.mjs:116`, send at `:140-145` | If the function is killed after it claims the stamp and before the send returns, the stamp stays set and nothing was sent. The retry sees "already alerted". The pulse cannot see it. `/api/inngest` is killed at 26 seconds, and the send timeout is 10 seconds per recipient, so three or more slow recipients in one step could do it. The flow doc lists this as a known gap. |
| 10 | Minor | `docs/journeys/CHANGELOG.md:1` | The commit column says `(this commit)` where the format wants a hash (`9e432b5`). |
| 11 | Nit | `src/staff/lead-alert.test.mjs:122` | `+442071838750` is a London-format number outside the reserved fiction range. Use a number in the Ofcom drama range. |
| 12 | Info | `netlify.toml:94` | See the section on `SECRETS_SCAN_OMIT_KEYS` below. |

## The attack questions, answered

### Can a lead get two alerts?

No, in everything I tried.

* Probe H, real Postgres, stub for the broken read, 12 leads, 4 events each (two `entry.captured` and two `booking.created`) all at once, provider failing 45% of the time, Inngest-style 4 attempts per step. Result: exactly-one 22, **duplicates 0**, zero 2. The 2 zeros are one text and one email (possibly on different leads) that failed on all four tries. Both left their stamp empty, so the pulse can see them. Stamps present: 11 of 12 per channel, and there was no case of "stamp set but nothing delivered".
* The repo's own pg test sends five at once and gets one.
* The only duplicate I can build needs a provider that accepted the message but reported a timeout (status 0). That is treated as retryable and sends again. The provider has no idempotency key. It is unlikely, and I rate it minor.
* A person who uses two different email addresses becomes two clients and gets two alerts. That is by design.
* `entry.captured` fired again (homepage survey uses `Date.now()` in the event key), `booking.created` after the survey, and replays all hit the stamp.

### Can a lead get zero alerts silently?

Yes, in these cases:

* Bug 1 (`resolveClient` throws). Loud in Inngest only, and bug 2 can leave the pulse green.
* A permanent refusal (bug 5): green run, pulse red next morning.
* Fence up (`MESSAGING_DRY_RUN` not an explicit off value): the run returns `fence_held` (`src/workflows/lead-alert-owner.mjs:177-181`) with a warning log and a green run, no stamp, pulse red next morning. Nothing replays those leads later. By design and documented.
* Settings unset or unusable: no claim, a log line, pulse red.
* The claim-then-kill window (bug 9).
* A returning person whose client row is older than 24 hours is skipped (spec decision).
* An invalid entry in a list (for example a mistyped second number) is dropped without a warning. As long as one entry is good the pulse stays green.

### Can it message anyone other than the two settings?

No. Probe D used the real providers with `PULSE_SMS_TO`, `CHRIS_PULSE_SMS` and `AD_VIDEO_SMS_TO` all set:

* one Twilio call, `To` equal to the `LEAD_ALERT_SMS_TO` value only;
* one Resend call, `to` equal to the `LEAD_ALERT_EMAIL_TO` value only;
* neither the lead's phone nor the lead's email was a recipient;
* with both settings unset: statuses `not_configured`, **0 fetches**.

The recipient is built only from the two settings (`leadAlertSmsTo`, `leadAlertEmailTo`). There is no `cc`, no `bcc`, and no `Reply-To` (no `clientId` is passed). Values that are not a dialable number or an address are dropped. They never fall back to anything.

### Does it honour the fence like other provider callers?

Yes. Two layers: the workflow pre-checks `fenceVerdict(MESSAGING_DRY_RUN, env)` before it claims anything (`:177`), and both providers go through `postJson`, which holds unless the flag is an explicit off value. Probe E, real providers, recorder: unset, empty, `1`, `true`, `yes`, `on` and `garbage` gave **0 fetches**; `0`, `false`, `no`, `off`, `OFF` and ` 0 ` each gave 2 fetches. That matches `src/lib/dry-run.mjs`.

### Any outbound `fetch` outside `src/messaging/providers/*` (CLAUDE.md section 12)?

No. `src/lib/no-unfenced-transmit.test.mjs` passes 5 of 5. A grep of the new files finds no `fetch(`, no `node:http`, no `axios`, no `undici`. The only new outbound calls are the two provider `send()` functions. The helper hands `fetchImpl` to them as an option and never calls it.

### PII or addresses in logs, step outputs, errors, code, tests, docs or commits?

Clean.

* The diff has 1778 added lines. A scan for phone-shaped digits found only 555-range fiction numbers (`+15555550100`, `(602) 555-0142`, and so on) and `example.test` or `example.com` addresses. There is no `@gmail.com`. There is no `6457` and no `6616054248` anywhere.
* The commit messages contain no digits or addresses beyond the attribution line.
* Logs carry a client id and a status only. `scrubError` strips numbers and addresses. Probe G: `+16025550142`, `(602) 555-0142`, `602.555.0142`, `6025550142`, `Chris.Lastname+tag@Gmail.com` and `"owner@example.test"` were all scrubbed. It also scrubs dates like `2026-10-07 12:00:00`, which is harmless.
* Step outputs are status words and ids only (the unit test "no step hands back the lead's name, number or address" passes).

### `netlify.toml`: `SECRETS_SCAN_OMIT_KEYS`

The change adds two names to a comma list in `[build.environment]`. It changes no code path and no deploy setting. The only effect is that Netlify's secrets scanner will not fail a build if the value of those two settings appears in the build.

It is safe. It is also unneeded and slightly weakens a net: the real values appear nowhere in the repo, so a scanner that watched them would only ever fire if someone committed Chris's number or address by mistake. One more note: this environment already carries a `SECRETS_SCAN_OMIT_KEYS` value without the two new names. I could not tell which source wins at build time, so the edit may be a no-op. Neither outcome is harmful.

### Does the pulse check go red and green correctly? Is 15 minutes sensible?

On a real database (probe B and B2, plus the repo's pg test):

* A real lead 14 minutes old with no stamp: PASS (inside the grace).
* The same plus a lead 16 minutes old with no stamp: FAIL, "1 of 1 new lead(s) ... have no text alert and 1 have no email alert".
* Email stamped, text not: FAIL with counts 1 and 0.
* Stamped, or demo, synthetic, older than 24 hours, or no lead event: not counted.
* Either setting missing: FAIL, by setting name only.

The 15-minute grace is longer than Inngest's four attempts (it uses `defaultMaxRetries = 3`), and it errs toward a false red instead of a false green, so the size is sensible. Its flaws are bugs 2 and 6. Detection is also up to a day late, because the pulse runs once at 13:00 UTC. One expected effect: the first pulse after go-live will be red if any lead arrived in the 24 hours before the ship, because those leads have no stamps.

## Other things I checked and found fine

* Both triggers are registered: the Inngest config shows `entry.captured` and `booking.created`. The journey runner's registry maps both events to `lead-alert-owner`.
* The journey runner skips its synthetic client in the new workflow (`custom_fields.synthetic === true`), so a journey run alerts nobody. The runner calls the workflow `handle` directly with no sender override, so this skip is its only protection.
* The `step.run` failure design matches this Inngest version (3.54.2): an exhausted step throws a `StepError` into the function, the loop catches it, the other channel still goes, and the run ends with a `NonRetriableError`.
* The claim is one `UPDATE ... WHERE COALESCE(custom_fields->>field, '') = ''`. `clients.custom_fields` is `NOT NULL DEFAULT '{}'`, so the jsonb merge is safe. The release removes the key, as the pg test checks.
* The CRM link target `public/app/client-control-panel.html` exists and reads `id`.
* The new pg test passes as `fundhub_app`, so row-level security does not get in the way of the stamp or the pulse read.

## Not verified

* That a text reaches Chris's phone, and that the carrier registration has cleared. Needs the real settings and a real send, which the brief forbids. The flow doc says the same.
* Behaviour against a live Inngest server (retry timing, `StepError` catch). Checked from the SDK source and tests only.
* Whether production still has `clients.ghl_contact_id`. This decides bug 1. A read-only check by someone allowed to look: `SELECT column_name FROM information_schema.columns WHERE table_name = 'clients' AND column_name IN ('ghl_contact_id', 'legacy_contact_id');`
* `.env.example`, which I was not able to read.

## Leftover cards (not worked, per the one-hole rule)

* K2, the `ghl_contact_id` read, is already carded on `knockout-2026-10-05.md` and `sync-2026-10-07.md`. It is the cause of bug 1 and I did not touch it.
* Possible direction for bug 1 without waiting for K2: let the workflow get the client id from the event, or by its own email lookup, instead of `resolveClient`. That is the builder's call.
* Live-test and e2e leads that are not marked `+fhtest` (for example `+sim-` or `e2e+` addresses) are real leads to this workflow and will text Chris. The spec's proof step relies on that.

## Cleanup

The scratch Postgres on port 55432 was stopped at the end of the run. Its files and the baseline export are in `/var/tmp/la-verify-pg/` (outside the repo). My probe scripts are in the session scratchpad directory. `git status` shows only this file as new.
