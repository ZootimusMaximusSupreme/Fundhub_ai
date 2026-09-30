# Capital Blueprint build — 2026-09-29

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
| follow-up | Composer | done | CSM queue assigned name read; `update_bank_todo_state`; `docs/finance/capital-blueprint-decisions-open.md` |

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

## Live prove — Sim Eleven-Blueprint (2026-09-30)

**Client id used:** `029964c5-4d8e-47ed-88c9-53ac13863fd4` (repo/docs still name this as #11 Sim Eleven-Blueprint).

**Blocker:** That uuid is **not in live production** for org `fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6` (16 clients total; no `Eleven` / `sim-11` row). Staff APIs return `client_not_found` / `not_found` for this id. Browser MCP had no tab — **API + DB (fundhub_app + org context) only**, not a human staff UI walk.

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Blueprint buyer | **FAIL** | No client row; no `Consulting Services Package` / consulting-package paid tx in org; `isCapitalBlueprintBuyer()` **errors** on live schema (`transactions` has `product_name`, not `product_id`) |
| 2 | `client_waypoints` + `blueprint_dispute_*` | **FAIL** | No waypoints for missing client |
| 3 | GET `blueprint-combined-approval` | **FAIL** | HTTP **404** `{"ok":false,"error":"not_found"}` (staff session OK) |
| 4 | Progress open step → mailing proof upload | **FAIL** | GET `/api/read/client-progress` **404** `client_not_found` |
| 5 | Upload + waypoint verify | **BLOCKED** | No open client / step |
| 6 | Control panel combined prequal | **FAIL** | Same as #3 (API); UI not clicked |
| 7 | POST `staff-actions` list / offer | **PARTIAL** | HTTP **404** `not_found` (client missing), **not 403** — staff auth passes |
| 8 | POST `paydown-simulator` | **FAIL** | HTTP **404** `not_found` (client missing) |
| 9 | GET `csm-queue` + `assigned_csm_name` | **PARTIAL** | HTTP **200** `ok:true`, `count:0` — no row to inspect field; DB has `clients.assigned_csm_staff_id` (401) |

**Dirty leftovers (do not fix in prove pass):**

- Sim horsemen #11 file absent from live DB — remint or pick another Blueprint buyer before re-prove.
- ~~`isCapitalBlueprintBuyer` SQL uses `t.product_id`~~ — **fixed 2026-09-30** (`resolve_product_id` + `succeeded` status); ship + re-prove on a live Blueprint buyer.
