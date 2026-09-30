# Capital Blueprint build — 2026-09-29

**Workflow:** backend/API **PASS**. UI leftovers for Claude. Human-click recreate at close-out **blocked** (Netlify `usage_exceeded` on fundhub.ai).

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

**Close-out:** **PASS** — remint + live prove 2026-09-30 (agent). Workflow **closed**.

**Client id used:** `029964c5-4d8e-47ed-88c9-53ac13863fd4` — Sim Eleven-Blueprint, `stanbridgejchris+sim-11@gmail.com`, phone `+16616054248`, paid Capital Blueprint (`consulting-package` / Consulting Services Package $5,000 simulated receipt — no real card). Historical uuid reused.

**Remint path:** `scripts/sim/seed-fulfillment-client.mjs --profile blueprint --id <uuid> --confirm` → `push-credit --profile blueprint` → `push-payment --ref pl_…`. Entitlements: `credit-optimization-roadmap`, `metro2-letter-pack`. Finance OS subscription **active** 12 months. CSM assigned: `DEMO Client Success Manager` (`6ec4e592-…`). Sample credit PREMIUM_STACK / $212k. Dispute waypoints seeded (mail letters / mailing proof / bureau response).

**Staff auth:** owner session minted via `createSession` for `chris@fundhub.ai` (STAFF_E2E_PASSWORD masked in `.env`). Playwright human click on live `fundhub.ai`. Browser MCP tab open failed this pass — Playwright covered the UI walk.

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Blueprint buyer + waypoints (incl. dispute steps) | **PASS** | Paid link `pl_3d9b8aecf2da5fac8f50f31f`; 8 waypoints incl. `blueprint_dispute_*`; buyer entitlements + Finance OS sub |
| 2 | GET `blueprint-combined-approval` | **PASS** | **200** `ok:true`, combinedPrequal **$212,000** |
| 3 | Progress / mailing proof upload + step clears | **PASS** | POST `/api/documents-upload` subtype `dispute_mail_receipt` **200**; `evaluateWaypoints` closed `blueprint_dispute_mail_receipt` → **done**; progress UI shows dispute steps |
| 4 | Control panel Blueprint group / `staff-actions` | **PASS** | Expanded `#bp-group`; `list_bank_todos` / `offer_bank_tracker` **200**; portal + CCP show Sim Eleven-Blueprint |
| 5 | Bank todo Done / Skipped / Put back (Session D) | **PASS** | API `update_bank_todo_state` **200** for done/skipped/open; UI clicks on `#bp-body .bp-todo-acts` Done → Put back → Skipped → Put back (Chase todo) |
| 6 | POST `paydown-simulator` (entitlement) | **PASS** | **200** `ok:true`, `entitled:true`, cash 5000, preapproval $212k |
| 7 | GET `csm-queue` + `assigned_csm_name` | **PASS** | **200**, Eleven on queue; `assigned_csm_name` = **DEMO Client Success Manager**. UI chip "Assigned CSM:" only renders when `source_workflow === blueprint-csm-prep` — this row is Accountability halfway check-in, so chip not drawn; API field present |

**Mailing-proof upload re-prove:** **PASS** (gate closed).

**Ship this close-out:** none — remint was live DB + sim scripts/docs only; product UI already on `548c9a47`.

**Dirty leftover (card only, not actioned):** CSM queue "Assigned CSM:" chip is gated to `blueprint-csm-prep` tasks only — accountability/halfway tasks carry `assigned_csm_name` in JSON but do not show the chip.

## Grok independent double-check (2026-09-30)

Remint worker `c3a69492` finished first. This pass did not remint again. Same live file.

**Client id:** `029964c5-4d8e-47ed-88c9-53ac13863fd4` — Sim Eleven-Blueprint · `stanbridgejchris+sim-11@gmail.com` · paid Consulting Services Package **$5,000** (`status=succeeded`, provider `sim-pay-1790742620460`) · no real card · no new Commas products.

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Client + paid tx + entitlements + dispute waypoints | **PASS** | Buyer `isCapitalBlueprintBuyer` **true**. Ents `credit-optimization-roadmap`, `metro2-letter-pack`. Eight waypoints incl. `blueprint_dispute_*`. CSM `6ec4e592-…` |
| 2 | GET `blueprint-combined-approval` | **PASS** | **200** `ok:true` combined prequal **$212,000** |
| 3 | POST `staff-actions` `list_bank_todos` | **PASS** | **200** Chase personal todo `dff3b20f-…` |
| 4 | POST `paydown-simulator` | **PASS** | **200** `ok:true` `entitled:true` |
| 5 | GET `csm-queue` `assigned_csm_name` | **PASS** (API) | Eleven row present. Name **DEMO Client Success Manager**. `source_workflow=customer-insights-mid` |
| 6 | Mailing-proof step close (recreate prior FAIL) | **PASS** (API) | Reopened step → live POST `/api/documents-upload` subtype `dispute_mail_receipt` → waypoint **done** `2026-09-30T04:38:34Z`. Hook: `onDocsReceivedReviewChecklist` on `docs.received` (ship `61440626`) |
| 7 | Browser MCP clicks | **FAIL / blocked** | MCP could not open a tab. Then whole site **503** `usage_exceeded` |
| 8 | Playwright CSM chip / bank Done / progress redraw | **NOT RE-PROVED** | Login page timed out once. Retry blocked by the same **503**. Do not keep the remint agent's UI **PASS** as independently proven |

**Grok backend fix (already shipped):** `src/handlers/client-lifecycle.mjs` + `src/handlers/client-lifecycle.test.mjs` — `docs.received` now runs `evaluateWaypoints` so mailing proof closes without a local evaluate call. Journeys: `docs/journeys/client-progress-actual.md`, `docs/journeys/CHANGELOG.md`. Seed: `scripts/sim/seed-fulfillment-client.mjs` blueprint profile.

**Ship this close-out:** none — no new product code after `61440626`. Site was over the Netlify usage cap; `npm run ship` would not help the 503.

**Leftovers for Claude (HTML only — Grok did not touch pages):**

1. CSM queue "Assigned CSM:" chip only paints on `blueprint-csm-prep` rows. Halfway/accountability rows have the name in JSON and no chip.
2. `progress.html` mailing-proof upload does not redraw the step after a good upload (copy still says it closes once staff have looked at it). Reload after the hook marks **done** is the current path.
3. Control-panel Capital Blueprint group stays folded. Bank Done / Skipped live in `#bp-body`. Independent click recreate did not finish.
