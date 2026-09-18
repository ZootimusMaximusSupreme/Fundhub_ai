# Full End-To-End Audit — 2026-09-17 overnight — CSM + AR + STAFF

**When:** 2026-09-17 night into 2026-09-18 (Pacific).  
**Lane:** CSM + AR + STAFF. Tester only. **No product fix.**  
**Gate:** LIVE look. **No SMS. No email.** No live credit pull. No real card. Did not flip outbound.  
**File:** #8 Sim Eight-Funding `d682c13b-11f3-4bd5-a0c5-232b6a7875c4`  
**Owner session:** minted from live database for `chris@fundhub.ai`. Token not printed.  
**Cite:** `docs/journeys/role-csm-actual.md` (call flow). There is **no** `role-csm-intended.md`. `role-owner-intended.md` is doors only. System map `docs/workflows/system-map-2026-08-26.md`. Talk / event order **UNVERIFIED**.

## Hard stops kept

No Claim. No End shift. No Send. No invoice email. No send-portal-link. No reset-link email. No Pay now. No live CRS. No card charge. Demo left **off**. No new CSM user.

## Live scorecard

| Path | Result | Evidence |
|---|---|---|
| GET `/api/auth/login` | **PASS** (demo off) | 200. `demo.enabled: false`. Login page has no demo button row. Shot `01-login-form.png`. |
| Staff rows `role=csm` | **FAIL** (no real CSM) | Live DB: one row, `csm@demo.fundhub.local`, demo, active. GET `/api/read/staff?role=csm` **200**, **0** real rows (`hiddenCount` 29 on that read — demo people hidden). |
| Real CSM form login | **FAIL** (expected) | Typed `csm@demo.fundhub.local` + shared demo password on `https://fundhub.ai/login.html`. Stayed on login. Red box: demo logins are off. POST same door **403** `demo_logins_disabled`. Did not turn demo on. Did not mint a CSM. Shot `02-csm-form-login.png`. |
| `/app/csm-queue.html` as owner | **PASS** (look) | Owner cookie opens the queue. GET `/api/read/csm-queue` **200**, **7** calls. Screen matches: Walk4 late, Walk1 owes $5,000, Eleven on the list, Eight owes **$2,500** (1 invoice). Claim / Write answers / End shift visible. Owner already on shift. **Did not click Claim, Write answers, or End shift.** Shot `03-csm-queue.png`. |
| AR / invoices #8 | **PASS** (look) | Invoice `INV-B4B9C768` (`b4b9c768-…`). Status **sent**. Source funding success fee. **$2,500.00** due. **$0** paid. Sent 2026-09-17 18:58 UTC. Ops AR table: Walk1 $5,000 + Eight $2,500 = **$7,500** unpaid, both Sent. Shot `09-ops-ar-table.png`. |
| Finance OS #8 | **PASS** (look) | `/app/finance-os.html?client_id=` Eight. Paid so far **$3,000.00** (Card Stacking DFY Sep 17). Invoiced billed **$2,500.00**, paid **$0.00**, still owed **$2,500.00**. Suggestions **403** not entitled (no Finance OS add-on). Did not post a receipt. Shots `05-finance-os-8.png`, `08-finance-os-invoiced.png`. |
| Portal Payments tab #8 (owner) | **FAIL** | Opened Account & history → Payments. Screen shows only Card Stacking DFY **3000.00 succeeded**. No “Due now”, no **$2,500**, no Pay now. GET `/api/read/portal-summary` for the same file **does** have the $2,500 bill and a Fanbasis pay link. Staff paint of this tab uses the staff client read and leaves the bill off. Did not click Pay now. Did not email a client magic link, so the client’s own view is **not** proved. Shot `07-portal-8-payments.png`. |
| Meet tape → transcriber → closer `fetchContext` | **SKIP** | Overnight, no new call. GET `/api/read/agent-context?client_id=` #8 **200**. Two deposit outcomes. Transcript empty. No `said:` line. No live Meet rows with spoken words. Cannot prove spoken words without a new call. |

## Beta / ops (after live facts — not mixed into live scores)

`BETA_PAGES` in the shell is empty. No screen is flagged Beta tonight. Walked owner/ops desks by URL. Did not click Send, Pause sending, Email unsent invoices, Write today’s C-suite tasks, Write a post, Promote, Revert, or Save.

| Screen | Result | Notes |
|---|---|---|
| Ops Admin | **PASS** (load + tabs) | Money tab KPIs + AR table. People tab: real staff list, 29 demo people hidden. Period control opens. Send / Pause / Email unsent **not clicked**. Shots `04-ops-ar.png`, `09-ops-ar-table.png`, `10-ops-people.png`. |
| Agent Editor | **PASS** (opens) | 25 agents, 5 live. Send / Promote / Revert / Save not clicked. `+ NEW AGENT` opened a form; counts stayed 5 live / 25 agents. Did not save. |
| Company Brain, Journeys, Contracts, Campaigns, Social Studio, Creative Factory, Content, Automations, Hiring, Staff & teams, Products, Galaxy | **PASS** (open) | Each loaded as owner. Send / charge / sync skipped. |

A page cannot PASS if a main **send** button is broken — those were not clicked, so they are **SKIP**, not PASS.

## Outbound

**None.** No SMS. No email. No Claim. No invoice mail. No portal link.

## Lane overall

**FAIL.** A real customer-success person still cannot sign in (demo off, only the demo CSM row). The owner can run the queue. Money on #8 matches: **$3,000** in, **$2,500** billed and unpaid. The client Payments tab, as staff, hides that unpaid bill even though the portal API has it.

Meet tape **SKIP**. Beta desks **open**; send buttons **SKIP**.

## Shots

`docs/workflows/full-e2e-audit-2026-09-17-csm-ar-evidence/`

- `01-login-form.png` — demo panel off
- `02-csm-form-login.png` — CSM sign-in refused
- `03-csm-queue.png` — 7 calls, Eight owes $2,500
- `04-ops-ar.png` / `09-ops-ar-table.png` — AR $7,500
- `05-finance-os-8.png` / `08-finance-os-invoiced.png` — $3,000 paid / $2,500 billed
- `06-portal-8.png` / `07-portal-8-payments.png` — Payments tab missing the $2,500 due
- `10-ops-people.png` — People tab
- `b-*.png` — ops/beta page opens

## Stop

This chat does not fix. No second hole.
