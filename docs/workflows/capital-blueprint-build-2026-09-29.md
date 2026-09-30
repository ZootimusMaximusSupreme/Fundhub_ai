# Capital Blueprint build — 2026-09-29

**Workflow:** **done** (2026-09-30). All lanes shipped. **Open gate only:** live mailing-proof upload re-prove when a paid Blueprint buyer exists on production (Sim Eleven remint not done — owner left alone).

**Board:** all Composer/Claude lanes write status here.

**Roadmap ($297):** do not touch.

**Spec:** `docs/finance/capital-blueprint-build-spec-2026-09-29.md`

## Lanes

| Lane | Owner | Status | Files |
|------|--------|--------|-------|
| 1 | Cursor session | done (slice) | `src/agents/context.mjs`, `src/blueprint/coach-exception.mjs`, `comms.mjs` STOP→CSM for Blueprint buyers |
| 2 | agent | **done** | dispute waypoint defs + verify proof |
| 3 | agent | done | `401_clients_assigned_csm.sql`, `src/blueprint/assign-csm.mjs`, `src/blueprint/closer-ready.mjs`, `src/workflows/blueprint-closer-ready-sweeper.mjs`, `src/waypoints/purchase.mjs` hook |
| 4 | agent | done | `src/finance/finance-os-pull-fulfil.mjs`, `src/blueprint/monthly-pull-aftercare.mjs`, sweeper hook |
| 5 | agent | done | `src/finance/finance-os-entitlement.mjs` grant, `src/blueprint/paydown-simulator.mjs`, `api/finance/paydown-simulator.mjs`, `src/workflows/blueprint-finance-os-alerts.mjs` |
| 6 | agent | done | `402_credit_partner_link.sql`, `src/blueprint/credit-partner.mjs`, `api/read/blueprint-combined-approval.mjs` |
| 7 | agent | done | `403_next_funding_sequence.sql`, `src/blueprint/next-funding-sequence.mjs`, `src/blueprint/bank-relationship.mjs`, `blueprint-next-funding-sequence-sweeper` |
| 8 | agent | done | `src/blueprint/welcome-kit.mjs`, money-chain hook |
| 9–10 | Claude | done (`4be6a1e7`) | progress upload, control panel Blueprint group, CSM queue chips, Finance OS paydown |
| follow-up | Composer + Claude D | done | CSM queue assigned name read; `update_bank_todo_state`; buyer gate **ship `dcd50c49`**; Session D UI **ship `548c9a47`** — `assigned_csm_name` on csm-queue; bank todo Done / Skipped / Put back on control panel; `docs/finance/capital-blueprint-decisions-open.md` |

## Migration numbers (reserved)

- 400 — blueprint dispute waypoint definitions
- 401 — clients.assigned_csm_staff_id (**shipped** lane 3)

## Lane 3 manifest (2026-09-29)

- **Migration:** `db/migrations/401_clients_assigned_csm.sql` — nullable FK `clients.assigned_csm_staff_id → staff`.
- **On Blueprint pay:** `assignCsmForBlueprintPurchase()` from `src/blueprint/assign-csm.mjs`, called inside `seedChecklistForPurchase()` (`src/waypoints/purchase.mjs`). Round-robin among active `role = csm` staff when unset.
- **Closer gate:** `evaluateBlueprintCloserReady()` in `src/blueprint/closer-ready.mjs` — UnderwriteIQ `fundable` on freshest pull + client prep waypoints closed (excludes `no_new_credit`) → CSM prep call task → after prep task `done`, closer task.
- **Sweeper:** `blueprint-closer-ready-sweeper` hourly cron in `src/workflows/index.mjs`.
- **Tests:** `src/blueprint/assign-csm.test.mjs`, `src/blueprint/closer-ready.test.mjs`, `src/workflows/blueprint-closer-ready-sweeper.test.mjs`.
- 402 — credit partner link (**shipped** lane 6)
- 403 — next funding sequence + `blueprint_bank_relationship_todos` (**shipped** lane 7)
- 404 — reserved (bank todos live in 403)

## Lanes 6–8 manifest (2026-09-29)

**Lane 6 — credit partner**

- `db/migrations/402_credit_partner_link.sql` — `credit_partner_links` (org, primary, partner).
- `src/blueprint/credit-partner.mjs` — create partner `clients` row + link; `ensurePartnerChecklistIfConsented()` requires partner `soft_pull_consent` before `seedClientWaypoints`.
- `GET api/read/blueprint-combined-approval?client_id=` — sums prequal from both files via `prequalFromCustomFields` (same keys as portal/closer reads).

**Lane 7 — Next Funding Sequence + bank tracker**

- `db/migrations/403_next_funding_sequence.sql` — custom_fields keys documented in migration header; `blueprint_bank_relationship_todos` table.
- `src/blueprint/next-funding-sequence.mjs` — staff-set `blueprint_next_sequence_ready_date`; daily sweeper → closer task when date ≤ today.
- `src/blueprint/bank-relationship.mjs` — closer sets `blueprint_bank_tracker_offered`; todos only when offered.
- `src/workflows/blueprint-next-funding-sequence-sweeper.mjs` — cron `30 6 * * *`.

**Lane 8 — welcome kit**

- `src/blueprint/welcome-kit.mjs` — on `consulting-package` pay, `createTask` for `funding_advisor` with kit checklist + funding snapshot numbers in task body.
- Hook: `grantForPurchase` in `src/handlers/money-chain.mjs` (same path as checklist seed).

**Tests:** `src/blueprint/combined-approval.test.mjs` (unit).

## Lane 2 manifest (done)

**What shipped**

- `db/migrations/400_blueprint_dispute_waypoint_definitions.sql` — three client-owned Capital Blueprint dispute steps (mail letters, upload mailing proof, upload bureau response) with action-only copy and `verify_kind` values `dispute_mail_receipt` and `bureau_response_upload`.
- `src/waypoints/seed.mjs` — `blueprintDisputeSteps` flag; dispute definitions skipped unless true.
- `src/waypoints/purchase.mjs` — Capital Blueprint (`consulting-package`) purchase passes `blueprintDisputeSteps: true`; repair enroll unchanged (no dispute rows).
- `src/waypoints/verify.mjs` — document proof judges; `evaluateWaypoints` closes steps when matching rows exist in `documents`.
- `src/documents/kinds.mjs` — `client_upload` subtype `dispute_mail_receipt` for mailing proof uploads.
- Tests: `src/waypoints/verify.test.mjs` (unit); `src/waypoints/blueprint-dispute.pg.test.mjs`; catalog/ purchase expectations updated in `seed.pg.test.mjs` / `purchase.pg.test.mjs`.

**Not in this lane**

- Agent `fetchContext` waypoints (lane 1).
- Portal upload UI wiring for the new subtype (frontend).
- Letter-mail upsell billing (Commas keep-title blocker per spec §4.7).

## Live prove Sim Eleven

**Ship under test:** `11b75d36` — `/api/health` **pending 0** (327 applied).

**Client id (docs / walk boards):** `029964c5-4d8e-47ed-88c9-53ac13863fd4` — Sim Eleven-Blueprint, FH-000398, `stanbridgejchris+sim-11@gmail.com`, paid Capital Blueprint (`consulting-package`).

**Blocker (2026-09-30):** That uuid is **not on live production** (`DATABASE_URL` / fundhub.ai org: 16 clients, zero `sim-11` / `Eleven-Blueprint` row, zero active blueprint entitlements). Prove used staff session (Chris owner) + live HTTPS APIs. **Browser MCP could not open a tab** — no human staff UI walk (control panel / csm-queue screens not clicked).

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Blueprint buyer + waypoints (incl. dispute steps) | **FAIL** | No client row; no waypoints; `isCapitalBlueprintBuyer()` **false** |
| 2 | GET `blueprint-combined-approval` | **FAIL** | HTTP **404** `not_found` for Eleven id; staff auth OK |
| 3 | Progress / mailing proof upload + step clears | **FAIL** | GET `/api/read/client-progress` **404** `client_not_found`; upload **not attempted** |
| 4 | Control panel Blueprint group / `staff-actions` not 403 | **PARTIAL** | Eleven: **404** `not_found` (not auth **403**). Existing client `Walk Prove`: `list_bank_todos` **200** `ok:true`. UI not opened |
| 5 | POST `update_bank_todo_state` (Session D **`548c9a47`**) | **PARTIAL** | Eleven: **404** `not_found` (not **403**). No live bank todo to flip. HTML wired on control panel; **not live-clicked** (no buyer row) |
| 6 | POST `paydown-simulator` (entitlement) | **FAIL** | Eleven: **404** `not_found`. Walk Prove: **403** `not_entitled` (expected non-buyer) |
| 7 | GET `csm-queue` + `assigned_csm_name` in JSON | **PARTIAL** | **200** `ok:true`, `items:[]` — field not on a row; API read ships `assigned_csm_name` in `presentRow()` |

**Mailing-proof upload re-prove:** **BLOCKED** until a live paid Blueprint buyer exists (open dispute mail step + upload + verify). Sim Eleven remint **not done** (owner left alone).

**Re-prove when:** Any paid Blueprint buyer on live (not necessarily remint #11), then `node --env-file=.env scripts/tmp/capital-blueprint-live-prove-2026-09-29.mjs`.

**Dirty leftover (card only):** Sim #11 horsemen file absent from live DB — remint/data, not HTML; not actioned this close-out.
