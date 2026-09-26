# Sleep fears — 2026-09-25

Board for tonight’s “does the live path work” checks. No PII. Hostnames and on/off flags only.

## CRS

**Verdict: ON. No switch changed.**

| Flag | Production now |
|---|---|
| `CRS_API_HOST` | `mware.crscreditapi.com` |
| `CRS_ALLOW_LIVE` | `1` |
| `CRS_ACTIVE_BUREAUS` | `EX,EQ` |
| `ADAPTERS_DRY_RUN` | `0` |

Not sandbox. Allow-live is on. Password not read for a change, not printed, not rotated.

**Latest soft_pull_requests (2026-09-25 evening, last 7 rows):**

| status | fail class | note |
|---|---|---|
| fulfilled ×3 | none | result row present (`crs_softview`) |
| failed ×4 | no_file | `NoFileReturnedNoHit` on EX and EQ — bureau answered; not 401 |

Zero auth-style failures (`login_failed` / CRS113 / Access Denied) in the ledger. Older Aug 2026 TU rows are add-on config (E1006), not login.

**Laptop login probe** (same host flags, local env password, no order, no SSN): returned Access Denied (CRS113). Production ledger above already proves live login from the deployed path earlier tonight; laptop probe is not a production-switch defect. No password change.

**Action taken:** none. Switches already match the earlier-today fix.

## Emails

**Verdict: OK** — live path is sending; nothing purchase / portal / deliverable is sitting in `queued`.

| Check | Result |
|---|---|
| `messaging_settings.outbound_enabled` | on (1 org) |
| Email routing | `resend` enabled |
| Production `MESSAGING_DRY_RUN` | `0` |
| Production `INNGEST_EVENT_KEY` | set (not unset) |
| Email `queued` now | **0** |
| Email `failed` backlog | **37** (see below — none released) |
| Provider accepted last 24h (`provider_message_id` on sent/delivered) | **1** |
| Dispatch lag (system email, 7d) | p50 ~24s, p90 ~5m — sweeper cadence healthy |

**Why nothing was “stuck queued”:** the Inngest message-dispatch sweeper + Resend are draining. Recent purchase/portal/deliverable template keys (portal magic link, welcome, contract, invoice, U02 deliverables, offers) show `delivered` with provider ids. No code change. No blast. Outbound switch left on.

**Failed backlog (37) — not released tonight:**

| Count | Class | Why left alone |
|---|---|---|
| 13 | synthetic journey fence | Correct refuse; never send to test records |
| 12 | `example.com` / sim addresses | Provider rejected; not real clients |
| 12 | Aug soft-pull assessment (staff), Resend was still in test mode | Outside this lane’s purchase/portal/deliverable release list; CRS-adjacent; would be a month-late re-blast |

**Released tonight:** 0 (queue empty; no in-scope failed rows to requeue).

**Still “stuck”:** only the 37 failed above, for the reasons in the table — not a sweeper outage.

## Chris access

**CRM: ok.** **Portal: ok.** No code change. No password reset. No secrets.

| Door | URL | Result |
|---|---|---|
| CRM (staff / owner) | https://fundhub.ai/login.html → lands on https://fundhub.ai/app/pipeline.html | Password login for `chris@fundhub.ai` (owner, active, has hash) returned 200 twice; form login landed on Pipeline as Chris · owner. |
| Client portal (owner / staff door) | https://fundhub.ai/app/client-portal.html with a client id after CRM sign-in | Staff session stays; page shows Chris · owner and loads the file. Bare `/app/client-portal.html` (no id) stays signed in but cannot load a file until a client id is in the URL. |

Not the $297 purchaser portal-provisioning lane. Chris has no `accounts` client row — that is correct for the owner. His door is staff password login, then the portal with a client id (same as PORTALS → Client Portal from a file).

Env password name used for the prove: `STAFF_INITIAL_PASSWORD` (matches stored hash). Value not printed. No card charge, no credit pull, no outbound flip, no `INNGEST` change.
