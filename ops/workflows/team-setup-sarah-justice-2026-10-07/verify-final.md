# Verify (final): lead alert fixes and Sarah's hiring read access

Date: 2026-10-07. Branch `claude/ecstatic-galileo-h9suqe`, HEAD `688299f` (the merge of `0b8548d` and `8f26db2`).
Earlier findings: `verify-lead-alerts.md` (bugs 2, 3, 4). Bug 1 is out of scope: production still has `clients.ghl_contact_id`.

Tester: a different session from the builder and from the first verifier. I changed no code, made no commit, and pushed nothing. This file is the only thing I wrote in the repo. `git status` is clean apart from it.

## Verdicts

| Part | Verdict |
|---|---|
| A. Lead alert fixes (bugs 2, 3, 4) | **PASS** |
| B. Sarah's hiring read access | **PASS** |

Part B passes, but I found one older problem that her new access makes bigger (F1 below). It is not caused by the merge and I did not touch it.

## Where I ran things

* Scratch Postgres 16.15 on `127.0.0.1:55437`, data under `/var/tmp/final-verify-pg/`. All 341 migrations applied to an empty database. `fundhub_app` got a password and a login on the scratch copy only: not a superuser, no `BYPASSRLS`.
* My shell's `DATABASE_URL` points at the live database. I never used it. Every command ran with `env -u DATABASE_URL`, with a scratch URL, or under `env -i`. Every probe script refuses to run unless the host is `127.0.0.1:55437`.
* Nothing was sent. The shell has no Twilio or Resend key. Each send probe used the real provider code with a recording `fetch` and an explicit `env` object. The probe scripts also replace the global `fetch` with one that throws. It was called 0 times.
* The route-by-route probes ran under `env -i` (no keys, no `MESSAGING_DRY_RUN`, so the messaging fence stayed up).
* Probe scripts are in the session scratchpad, folder `final/` (`probe-a2.mjs`, `probe-a3.mjs`, `probe-a3b.mjs`, `probe-a4.mjs`, `probe-a2-old.mjs`, `probe-a2-perf.mjs`, `probe-b.mjs`, `probe-b2.mjs`, `probe-b3.mjs`, `probe-f1.mjs`, `diff-routes.mjs`, `seed-b.mjs`). None is in the repo.

## Test counts (exact)

| Command | Result |
|---|---|
| `npm run lint` | 2601 files parse clean, exit 0 |
| `env -u DATABASE_URL npx tsc --noEmit` | exit 0 |
| `npm run journeys:check`, `npm run diagrams:check` | up to date (9 files, 11 files) |
| `src/staff/lead-alert.test.mjs` | 32 tests, 32 pass |
| `src/workflows/lead-alert-owner.test.mjs` | 31 tests, 31 pass |
| `src/pulse/lead-alerts-check.test.mjs` | 13 tests, 13 pass |
| `src/http/app-nav-reachability.test.mjs` | 46 tests, 46 pass |
| `src/pulse/*.test.mjs` (no database) | 52 tests, 52 pass |
| Neighbours, no database: `read-api` 33, `app-nav-matches-shell` 33, `dashboard-role-gate` 4, `crm-html` 32, `mobile-shell` 45, `routes` 15, `auth-gate` 3, `ops-pulse` 6, `no-unfenced-transmit` 5, `workflows/index` 13 | all pass, 0 fail |
| `src/pulse/system-checks.pg.test.mjs`, scratch, as owner | 8 / 8 |
| same, as `fundhub_app` | 8 / 8 |
| `src/workflows/lead-alert-owner.pg.test.mjs`, as owner / as `fundhub_app` | 8 / 8 and 8 / 8 |
| `src/hiring/hiring-endpoints.pg.test.mjs`, scratch, as owner | **44 tests, 44 pass** |
| same, as `fundhub_app` | 5 pass, 39 cancelled (see note below the table) |
| `src/auth/role-catalog-drift.pg.test.mjs`, as owner / as `fundhub_app` | 4 / 4 and 4 / 4 |
| `src/hiring/apply-public.pg.test.mjs`, as owner / as `fundhub_app` | 36 / 36 and 36 / 36 |
| `src/hiring/hiring.pg.test.mjs` (file not changed by these commits), as owner / as `fundhub_app` | 31 / 31 and 0 / 31 cancelled (same cause) |
| Full `npm test`, no database, HEAD `688299f` | **13022 tests, 13010 pass, 8 fail, 4 skipped** |

The 8 failures are the same 8 the first verifier recorded on the base commit: `scripts/sim/push-credit.test.mjs` (1), `src/finance/crs-identities.test.mjs` (1), `src/http/content-tiles.test.mjs` (1), `src/http/payment-links-endpoints.test.mjs` (4), `src/security/superuser-guard.test.mjs` (1, only because I unset `DATABASE_URL`). None touches these commits.

Note on `hiring-endpoints.pg.test.mjs` as `fundhub_app`: the file's own setup runs `ALTER TABLE ... DISABLE TRIGGER` (lines 317 to 337), which only a table owner can do. So the setup fails and the other 39 tests are cancelled. The base commit's copy of the same file does the same (3 pass, 18 cancelled; as owner 21 / 21). It is how the file is built, not something the merge did. I covered the same ground as `fundhub_app` with my own probe instead (Part B below).

**The new tests have teeth.** I copied the new test files into a scratch copy of the tree from before `0b8548d` (commit `aeaca28`) and ran them against the old source: 9 fail (`lead-alert.test` 16, 17, 18; `lead-alert-owner.test` 28, 29, 30; `lead-alerts-check.test` 10, 12; `system-checks.pg.test` 8). All 9 pass at HEAD.

## A. Lead alert fixes (commit `0b8548d`)

### Bug 3: nothing a lead types can make the email go out as HTML. PASS

The Resend provider decides "HTML" with one test on the body: `src/messaging/providers/resend.mjs:139`, `/<!DOCTYPE\s+html|<html[\s>]|<table[\s>]/i`. Every branch needs a real `<`. The fix removes `<` and `>` from every lead-supplied word (`src/staff/lead-alert.mjs:93`, `oneLine`).

What I ran (`probe-a3.mjs`, real Resend provider, recording fetch, `MESSAGING_DRY_RUN=0` in the explicit env):
* 8372 emails. Each of 40 trigger strings (every spelling and case of `<table`, `<html`, `<!DOCTYPE html`, with space, tab, newline, NUL and zero-width characters, nested and repeated brackets, full-width `＜`, HTML entities, URL-encoded, split across first and last name) went into first name, last name, email, phone, channel (`channel_source`), ad tag (`utm_content`), ad id, and into all of them at once.
* Odd value shapes: arrays, an object with its own `toString`, a number, a `String` object.
* 6000 random strings from an HTML-looking alphabet, one field at a time, plus 2000 with every field random at once.
* Result: **0 payloads with an `html` field**. All 8372 had a `text` field, no `<` or `>` in text or subject, no newline in the subject.
* Two controls prove the harness would catch it: a body with a live `<table` sent straight through the provider gives an `html` field; the old cleaner (no bracket removal) with the first trigger gives an `html` field.
* End to end (`probe-a3b.mjs`): a client row with a hostile name, last name, phone and channel, and an ad row with a hostile `utm_content`, run through the real `handle()` with the real Twilio and Resend providers. Plain text, no `html` field, no `<` anywhere, as owner and as `fundhub_app`.

### Bug 2: the pulse sees leads whose event has no client. PASS

`checkLeadAlerts` (`src/pulse/system-checks.mjs`, query from line 111). `probe-a2.mjs`, 23 scenarios on scratch Postgres, each in its own company, run as owner and as `fundhub_app`: **0 mismatches both times**.

* Ghost event (no client, no match) 2 hours old: FAIL, "1 of 1 ... (1 of them have no client record at all ...)". 14 minutes old: PASS (inside the 15 minute grace). 16 minutes old: FAIL. Exactly 15 minutes: counted.
* Event plus a matching client, both stamps: PASS, expected 1. Same client unstamped: FAIL "1 of 1", not 2 of 2 (no double count). Text stamp only: "0 of 1 ... no text, 1 have no email alert".
* One client with 2 events that carry its id and 3 events that do not: counted once. Two ghost emails, one with 5 events: 2. Same ghost email in three spellings (case, spaces): 1. Client email in a different case from the event: matched, counted once.
* Not counted: event 30 hours old, `is_demo` event, `survey.submitted` and `call.completed` events, an event in another company, a client 3 days old, a demo client, a synthetic client, a client inside the grace window.
* A client in another company with the same email does not hide a ghost.
* Odd payloads (`email` null, a number, an object, a bare string, an array, `{}`) do not crash. Each counts as one lead, as the code comment says.
* Settings: both unset or junk gives FAIL naming the setting names only. One unset names just that one. No phone number or address in any detail line.
* The check is a pure read: twice gives the same answer and adds no rows.
* Control: the OLD query on the same ghost event returns `expected 0`, so it was blind (PASS). The new one is not.
* Speed: 150,000 clients and 1,500 ghost events took 552 ms.

### Bug 4: a partial multi-recipient failure is logged, scrubbed, not retried. PASS

`src/workflows/lead-alert-owner.mjs:150-158`. `probe-a4.mjs`: the real `handle()`, real Twilio and Resend providers, recording fetch that answers per recipient, a step wrapper that retries a failing `alert-*` step up to 4 times like Inngest, scratch Postgres, 10 scenarios, as owner and as `fundhub_app`: **0 mismatches both times**, 0 real fetches.

* Text to two numbers, one gets HTTP 503 whose body echoes its number: the run is `done`, the log line is `sms PARTLY sent for client <id>: 1 accepted, 1 failed ({"message":"Service unavailable for [number]"})`, the step ran once (not retried), the stamp stays, a second event for the same client sends nothing.
* Same with the failing number first (a retry would have texted the good one twice): one attempt, logged.
* Email: second address refused with HTTP 422 echoing the address: `PARTLY sent ... "Invalid `to` field. [address] ..."`.
* Three recipients, 1 accepted and 2 failed: `1 accepted, 2 failed`. A thrown error carrying a number and an address: `socket hang up talking to [number] [address]`.
* Partial on both channels at once: two warn lines.
* All fail but can be retried: stamp put back, 4 attempts, the run fails loudly, no number or address in any log line or error.
* All refused for good: returns `rejected`, stamp put back, no throw.
* One recipient, or two that both work: the plain `sent` line, no `PARTLY`.
* No recipient number or address (not even the digits) appears in any log line or thrown error in any scenario.

## B. Sarah's hiring read access (commit `8f26db2`, merged in `688299f`)

The merge is clean. All 14 code and test files from each side are byte-identical to their own side's commit. Both CHANGELOG lines survive.

**Every other place that reads `ROLE_SETS.HIRING`.** Searched `src/ api/ netlify/ public/ scripts/ db/` for `HIRING` in every form, including `ROLE_SETS[...]`, destructuring, spreads and `Object.values(ROLE_SETS)`. The only code readers are the six `api/hiring/*.mjs` read handlers (`candidates`, `application`, `postings`, `decisions`, `funnel`, `bench`). `api/hiring/decide.mjs:44` writes its own `requireRole("owner", "admin")`. `api/read/eeo-aggregate.mjs:20` uses `ROLE_SETS.COMPLIANCE`, still owner and admin (`src/http/read-api.mjs:188-193`). `api/ops/hire-closer.mjs`, `api/read/ops-pulse.mjs` and `api/read/search.mjs` use other sets. The security journey and tests only assert on the set. None of the six read handlers returns EEO data. No export route exists.

**Dynamic proof of "nothing else widened".** For all 296 routes in the real dispatcher, I sent GET and POST `{}` as a sales manager (590 requests) on the base tree (`bb9c722`) and on HEAD, same database. **Exactly 6 differences, all six hiring reads**: `hiring/candidates`, `postings`, `decisions`, `funnel`, `bench` go from 403 to 200, and `hiring/application` from 403 to 400 `bad_request` (no `id` was sent, so the role gate passed). Every other route, including `hiring/decide`, `read/eeo-aggregate`, `pii` and `ops/hire-closer`, answered the same.

**Role matrix over real HTTP** (`probe-b.mjs`: the real `netlify/functions/api.mjs` dispatcher, so the route map is part of the proof; real staff rows and sessions; scratch Postgres; 8 roles). 118 checks, run as owner and as `fundhub_app`. Both runs: **117 pass, 1 fail** (the fail is F1, an older problem, below).

| Check | Result |
|---|---|
| `GET` candidates, application, postings, decisions, funnel, bench as `sales_manager`, `owner`, `admin` | 200 on all 6, for all 3 roles |
| same 6 as `closer`, `setter`, `csm`, `funding_advisor`, `inquiry_specialist` | 403 on all 6, for all 5 roles |
| same 6 with no session / a junk token | 401 / 401 |
| `POST /api/hiring/decide` as `sales_manager` (reject and advance, real application id) | 403 `forbidden`, `required: ["owner","admin"]` |
| same as `closer`, `setter`, `csm`, `funding_advisor`, `inquiry_specialist` | 403 |
| same as `owner` and `admin`, empty body | 400 `application_id_required` (gate open, nobody decided) |
| rows in `hiring_decisions` for the test application before and after all refused calls | 0 and 0 |
| `GET /api/hiring/decide` | 405 |
| `POST`, `PUT`, `PATCH`, `DELETE` on `hiring/candidates` as `sales_manager` | 405 |
| `GET /api/read/eeo-aggregate` as `sales_manager` and the five other non-owner roles | 403 |
| same as `owner` and `admin` | 200 |
| `ops/hire-closer`, `read/ops-pulse`, `read/failed-events` as `sales_manager` | 403 (still owner/admin) |
| `GET /api/pii` as `sales_manager` and as `closer` | 403 and 403 (same, not widened) |
| keys in every sales-manager hiring response (92 distinct) matched against race, ethnicity, gender, sex, age, birth, disability, veteran, religion, SSN, EEO | none. The "ethnicity", "age" and "gender" answers the test applicant typed were never stored |
| public `GET /api/hiring/apply` with no session | still 200 |

**Real browser** (Chromium, the page served from `public/` with `/api` going through the real dispatcher and a real session in `localStorage`):
* `hiring.html` **opens for `sales_manager`**, `owner` and `admin`: final path stays `/app/hiring.html`, 2 candidate cards drawn, the six hiring calls all 200, no page errors, no error text on the page.
* Opening a candidate: owner and admin get Advance and Reject. The sales manager gets neither, and sees "Hiring and rejecting are done by the owner or an admin. You can read everything on this screen."
* `closer`, `setter`, `csm` are bounced off the page (to `closer-dashboard.html`, `pipeline.html`, `csm-queue.html`), 0 cards.

## Bugs and leftovers

| # | Severity | Where | What |
|---|---|---|---|
| F1 | **Medium. Older than both commits; the merge makes it reach one more role. Not fixed, not in scope.** | `api/hiring/candidates.mjs:62`, `postings.mjs:43`, `decisions.mjs:65`, `funnel.mjs:28`, `bench.mjs:33` | Five of the six hiring reads filter on `WHERE ... org_id = (SELECT id FROM orgs WHERE is_default LIMIT 1)` and ignore the caller's company. Only `api/hiring/application.mjs:21` uses the session company. So anyone with a hiring role in a different company reads the default company's applicant names, emails, phones and scores. Probe: a sales manager of a second company got 200 and 2 of the default company's candidates from `hiring/candidates`, but 404 on `hiring/application?id=`. The same lines exist unchanged since `45df46b`, and `8f26db2` changes no file under `api/hiring/`. I also tried an owner and an admin of the second company (`probe-f1.mjs`): both get the same 200s with the default company's rows (candidates 2, decisions 1, funnel 2, bench 4) and 404 on `application?id=`. So this was already true for owners and admins; the new role only adds sales managers of other companies to that group. The second company `yesdoor` exists in the seed (`db/seed/296_yesdoor_org_and_samples.sql`). Whether it has staff in these roles in production, I did not look. |
| F2 | Low | `public/app/hiring.html:2560` calls `GET /api/demo/mode`; its gate is owner/admin: `api/demo/mode.mjs:6` and `:11` | For a sales manager that call returns 403 on every load of the hiring page. The page swallows it: no error shown, no page error. Only effect: demo rows never show for her, even when demo mode is on. Owner and admin get 200. |
| F3 | Low (false red, one day) | `src/pulse/system-checks.mjs:124-127` | The second `EXISTS` in `real_leads` puts no age limit on the "no client id" event. A client made in the last 24 hours that no lead event made (for example added by staff), whose email matches a client-less `entry.captured` or `booking.created` event of any age, counts as a lead with no alert. The pulse reads red until that client is 24 hours old. Probe scenario S17. |
| F4 | Info | `src/staff/lead-alert.mjs:93` | `oneLine` removes `<` and `>` but keeps everything else. A web address typed as a name stays in the email as plain text. Some mail apps turn that into a tappable link. It is not HTML, and it sits under the "Name:" label. |
| F5 | Info | `docs/journeys/role-sales-manager-intended.md:75` | Still says Hiring (6 routes) "should stay blocked". The builder already reported it. Agents do not edit the intended file (CLAUDE.md section 4), so it needs Chris's word. |

No bug found in the three lead alert fixes. No bug found in the hiring gate itself.

## Not verified

* That an alert reaches Chris's phone or inbox. That needs the real settings and a real send, which the brief forbids.
* Anything about production data: whether `yesdoor` (or any other company) has staff in the hiring roles, whether migration 372 has run there, whether production's `events` and `clients` match scratch.
* The whole alert path through `resolveClient`. Bug 1 (out of scope) makes `resolveClient` throw on a database with migration 372. My workflow probes answer the `resolve-client` step from the test harness, as the repo's own pg test does. So "a lead gets an alert end to end in production" is still not shown.
* `npm run verify:e2e` and the changed `src/verification/journeys/security.mjs`, because that harness is scratch-only by rule and I judged a rerun not needed. Lint parses the file.
* The Hiring menu row staying hidden (the builder's claim). I checked that the page opens by address, not the sidebar.

## Cleanup

The scratch Postgres on port 55437 was stopped at the end. Its files, the base trees (`base/`, `prefix/`) and the route-diff output are in `/var/tmp/final-verify-pg/`, outside the repo. `git status` shows only this file as new.
