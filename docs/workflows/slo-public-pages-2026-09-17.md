# SLO public pages — fundhub.ai/slo/

**Opened 2026-09-17.** Owner: build ONLY the public SLO pages on fundhub.ai (not
apply.fundhub.ai yet). Then ship together with the other session's in-flight SLO
backend work once it is committed. Local git only. No GitHub.

## Hard lines (owner)

- Law: `docs/UI-STANDARDS.md`. Trust first.
- No fake testimonials. No SIM MODE. No earnings claims. No new Commas product.
- Do NOT change checkout math, Commas titles, CRS, or the live apply funnel.
- Receipt title is already "Consulting Services Assessment" — untouched.
- Do not paste into ClickFunnels. Do not touch /watch or /apply.
- Price is never typed in HTML — read from `GET /api/public/slo-checkout`.
- SSN never on the address bar.

## Tasks

| # | Task | Owner | Status | Waits on |
|---|------|-------|--------|----------|
| W1 | `public/slo/index.html` (sales) + `public/slo/pay.html` (pay) | this session | claimed | other session's `api/public/slo-checkout.mjs` edits being committed |
| W2 | `public/slo/pull.html` (Commas success URL) | W2 agent | claimed | nothing |
| SHIP | `npm run ship` once W1, W2 and the other session are all committed | this session | pending | W1, W2, other session |

## Shared context

- Endpoint: `api/public/slo-checkout.mjs`, routed as `public/slo-checkout` in
  `netlify/functions/api.mjs`. Being edited by another session right now
  (with `src/slo/offer.mjs`, `src/slo/buyer.mjs`, `src/slo/deliver.mjs`,
  `db/migrations/385_vsl_funnels.sql`). W1 reads its FINAL shape, never guesses.
- Copy source: `clickfunnels-fragments/slo/slo-01-sales.html` (sales),
  `slo-02-order.html`, `slo-03-thank-you.html`.
- Flow: `/slo/` → `/slo/pay.html` → Commas card page → `/slo/pull.html?ref=…`.

## Manifests

_none yet_

## Blockers

_none yet_
