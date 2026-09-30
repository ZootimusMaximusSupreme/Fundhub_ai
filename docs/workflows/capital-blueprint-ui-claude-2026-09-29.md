# Capital Blueprint — Claude UI pass (2026-09-29)

**Backend is live** (ship `6cc261c6` + staff API when shipped). **Roadmap ($297) do not touch.**

Read first: `docs/UI-STANDARDS.md`, `docs/finance/capital-blueprint-build-spec-2026-09-29.md`, owner offer list in `docs/finance/capital-blueprint-next-2026-09-29.md`.

## Status

| Chat | Owns | Status |
|---|---|---|
| A | client progress/portal: mailing proof upload, optional paydown | claimed (first Claude session, 2026-09-29) |
| B | closer/CSM: partner, next sequence date, bank tracker, combined prequal | pending |
| C | Finance OS paydown block | pending |

No dependencies — all three run at once. Each writes its manifest here when done.

## APIs Claude wires to (no inventing)

| Use | Method | Path |
|-----|--------|------|
| Combined prequal (primary + partner) | GET | `/api/read/blueprint-combined-approval?client_id=` |
| Paydown simulator | POST | `/api/finance/paydown-simulator` body `{ client_id, cash_on_hand }` (Finance OS entitlement) |
| Staff: partner, next sequence, bank tracker | POST | `/api/blueprint/staff-actions` body `{ action, client_id, ... }` |

**staff-actions `action` values:** `create_credit_partner`, `set_next_sequence_date`, `offer_bank_tracker`, `add_bank_todo`, `list_bank_todos`.

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
