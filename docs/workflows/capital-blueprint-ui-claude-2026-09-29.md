# Capital Blueprint — Claude UI pass (2026-09-29)

**Backend is live** (ship `6cc261c6` + staff API when shipped). **Roadmap ($297) do not touch.**

Read first: `docs/UI-STANDARDS.md`, `docs/finance/capital-blueprint-build-spec-2026-09-29.md`, owner offer list in `docs/finance/capital-blueprint-next-2026-09-29.md`.

## Status

| Chat | Owns | Status |
|---|---|---|
| A | client progress/portal: mailing proof upload, optional paydown | done locally (not shipped) |
| B | closer/CSM: partner, next sequence date, bank tracker, combined prequal | done |
| C | Finance OS paydown block | done locally (not shipped) |

No dependencies — all three run at once. Each writes its manifest here when done.

## APIs Claude wires to (no inventing)

| Use | Method | Path |
|-----|--------|------|
| Combined prequal (primary + partner) | GET | `/api/read/blueprint-combined-approval?client_id=` |
| Paydown simulator | POST | `/api/finance/paydown-simulator` body `{ client_id, cash_on_hand }` (Finance OS entitlement) |
| Staff: partner, next sequence, bank tracker | POST | `/api/blueprint/staff-actions` body `{ action, client_id, ... }` |

**staff-actions `action` values:** `create_credit_partner`, `set_next_sequence_date`, `offer_bank_tracker`, `add_bank_todo`, `list_bank_todos`, `update_bank_todo_state` (body: `todo_id`, `state` = `open`|`done`|`skipped`).

**CSM queue read** includes `assigned_csm_staff_id` and `assigned_csm_name` per client row.

## Copy-paste — Claude session A (client)

```
Capital Blueprint client UI only. Do not change the $297 roadmap or ClickFunnels.

1. public/progress.html (and portal link from client-portal.html): when open waypoint verify_kind is dispute_mail_receipt, show upload for subtype dispute_mail_receipt (see src/documents/kinds.mjs). Same upload pattern as existing client_upload doors on client-portal.html.

2. Optional: deep-link Finance OS paydown for entitled clients — POST paydown-simulator from a simple cash input; show before/after prequal from response. Match docs/UI-STANDARDS.md.

Prove: live click on fundhub.ai progress/portal for a Blueprint buyer with an open dispute mail step. No invented prices.
```

## Copy-paste — Claude session B (staff closer / CSM)

```
Capital Blueprint staff UI. HTML/JS only under public/app/. No backend edits unless a route is missing (ask Chris).

Wire on closer-call.html or client-control-panel.html (pick the screen that already owns this client):

- POST /api/blueprint/staff-actions create_credit_partner (one partner: name, email)
- POST set_next_sequence_date (date picker YYYY-MM-DD)
- POST offer_bank_tracker then add_bank_todo / list_bank_todos
- GET /api/read/blueprint-combined-approval for combined prequal display

CSM queue (csm-queue.html): surface assigned_csm and Blueprint exception tasks already in tasks table — read existing queue API, do not rebuild queue.

Match docs/UI-STANDARDS.md. Live prove on fundhub.ai.
```

## Copy-paste — Claude session C (Finance OS)

```
Extend public/app/finance-os.html for Blueprint buyers: show paydown simulator block calling POST /api/finance/paydown-simulator. Label promo section as not live if client_cards has no promo data (backend stub). Do not promise Plaid connect — linkAccount is not implemented.

UI-STANDARDS.md. Human click prove.
```

## Not Claude’s job

- New Commas products
- Contract copy
- Changing offer prices on Present without Chris

## Manifest A (2026-09-29)

- Files: `src/progress/read.mjs` (waypoint now carries `verifyKind`), `public/progress.html` (upload box on an open `dispute_mail_receipt` step; posts `/api/documents-upload` with kind `client_upload`, subtype `dispute_mail_receipt`).
- Proved: `node --test src/progress/*.test.mjs` 123/123; `npm run lint` clean; local browser run with faked replies — box shows only on the mailing-proof step, upload sends the right kind and subtype, success line shows.
- Not proved: live click as a real Blueprint buyer (needs ship first). Step closing after upload rests on `src/waypoints/verify.mjs` (existing).
- Not done: portal link change and the optional paydown block (Finance OS is Chat C's).

## Manifest C

- Files touched: `public/app/finance-os.html` only (CSS added inline in that file; `finance-os.css` untouched). Commit `3a51c570` (local, not pushed).
- Route used: `POST /api/finance/paydown-simulator` body `{ client_id, cash_on_hand }`. Fields read from the real handler and `src/blueprint/paydown-simulator.mjs`: `preapprovalBefore`, `preapprovalProjected`, `preapprovalAfterFull`, `cashOnHand`, `cashApplied`, `cashUnallocated`, `totalPaydownNeeded`, `allocations[{account,payDollars,balanceBefore,targetBalance}]`, `hasPull`, `pulledAt`; errors `not_entitled` (403), `no such client` (404), 400 text.
- What shows: a "Paydown simulator" panel under the hero when a client is open (cash box, one button "Split this cash", before/after pre-approval, card-by-card split, plain "estimate" note). Every state is worded: no credit report, not subscribed to Finance OS, bad number, server down. A "Promo tracking" panel says "not live" (no table stores promo end dates; confirmed in `src/workflows/blueprint-finance-os-alerts.mjs`). No prices, no Plaid promise.
- Proved: script syntax check OK; `node --test src/ui/*.test.mjs` 48/48; local browser run (fake replies) at 1280px and 390px: request body right, bad input rejected before sending, result renders, not-subscribed message shows, no sideways scroll, big numbers 32px.
- Not proved: a live click against fundhub.ai with a real Blueprint buyer (needs ship first). The simulator route is staff-only (`ROLE_SETS.STAFF`), so this is a staff screen, not a client one.
- Leftovers: none.

## Manifest B

**Files touched (HTML/JS only):**
- `public/app/client-control-panel.html` — new folded "Capital Blueprint" group in the right rail (CSS, markup, one JS block `wireBlueprint`), plus one line in `render()` that fires a `ccp:client` event so the block can read two saved flags off the client record. (`closer-call.html` only redirects to `closer-dashboard.html`, so the control panel was the screen that owns the client.)
- `public/app/csm-queue.html` — Blueprint chip, assigned-CSM chip on prep calls, Blueprint exception count in the header line.

**Routes used (real field names, read from `api/blueprint/staff-actions.mjs`):**
- `POST /api/blueprint/staff-actions` — `create_credit_partner` (`first_name`, `last_name`, `email`, `phone?`; the handler has no single `name` field), `set_next_sequence_date` (`ready_date` YYYY-MM-DD), `offer_bank_tracker` (`offered`), `add_bank_todo` (`bank_key`, `account_kind` personal|business, `notes?`), `list_bank_todos`.
- `GET /api/read/blueprint-combined-approval?client_id=` — combined, primary and partner prequal (uses the `*Display` strings; null shows "Not worked out yet", never 0).
- `GET /api/read/csm-queue` (existing, unchanged) — reads `source_workflow` (`blueprint-coach`, `blueprint-csm-prep`) and `assignee_staff_id`.

**Proved:** every inline script in both files parses; `npm run lint` clean; `src/ui/*.test.mjs` 48/48 pass; local Playwright at 1440px and 390px with mocked API: block loads, partner add (and bad-email refusal in plain words), date save, offer/take back, add bank + list, exact request bodies match the handler, no page errors, no sideways scroll at 390px; csm-queue paints the chips and the count from mocked rows.

**Not proved:** nothing was run against the live database or fundhub.ai (no deploy allowed here). The mocks match the handler code, not a live response. Not walked as a real closer on a real Blueprint buyer.

**Leftovers (Composer closed 2026-09-30 — Claude still owes UI):**
1. ~~CSM queue read missing assigned CSM~~ — **shipped:** `api/read/csm-queue.mjs` returns `assigned_csm_staff_id` + `assigned_csm_name`. **Claude:** show `assigned_csm_name` on `csm-queue.html` (grep shows no use yet).
2. Blueprint buyer gate on live txs — **shipped `dcd50c49`:** `isCapitalBlueprintBuyer` uses `resolve_product_id(product_name)` (was broken `product_id` column).
3. ~~Bank todo done/skipped~~ — **shipped:** `staff-actions` action `update_bank_todo_state` (`todo_id`, `state`). **Claude:** wire Done/Skipped on `client-control-panel.html` bank list (grep shows no use yet).
4. Still open: no read hides Capital Blueprint panel for non-buyers (group shows for all; server returns `not_blueprint_buyer`). Optional v2.
5. Still open: portal deep-link to Finance OS paydown for entitled buyers (staff `finance-os.html` has simulator; portal optional per spec).
6. Live prove blocked until Sim #11 (`029964c5-…`) or another paid Blueprint client exists on production again — not a Claude task.

## Copy-paste — Claude session D (small v2, one chat)

```
Capital Blueprint UI v2 only. Backend is live (dcd50c49). Do not touch roadmap or backend.

1. public/app/csm-queue.html — render assigned_csm_name from GET /api/read/csm-queue when present (field already on each row).

2. public/app/client-control-panel.html — on bank todos from list_bank_todos, add Done and Skipped buttons calling POST /api/blueprint/staff-actions action update_bank_todo_state with todo_id and state done|skipped. Refresh list after.

UI-STANDARDS.md. Live click on fundhub.ai after ship. No invented copy or prices.
```

## Manifest D (2026-09-29)

- Files: `public/app/csm-queue.html` (Blueprint prep rows show `Assigned CSM: <name>` from `assigned_csm_name`; falls back to the old holder wording when the name is null), `public/app/client-control-panel.html` (each bank to-do gets Done / Skipped, or "Put back on the list" once closed; posts `update_bank_todo_state` with `todo_id` and `state`, then re-reads the list).
- Proved: lint clean, `src/ui` tests pass, local browser run with faked replies — name chip and fallback chip show; Skipped sends the exact body and the row flips to Skipped.
- Not proved: live click on fundhub.ai; mailing-proof re-prove needs a real Blueprint buyer on live.
