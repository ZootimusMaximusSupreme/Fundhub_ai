# $297 /roadmap widget — back-end flow (2026-09-22)

Owner-set 2026-09-22: the checkout is a two-step widget on the /roadmap sales
page (https://apply.fundhub.ai/roadmap). The widget is a window onto this flow.
Traced from code on branch `feat/roadmap-widget`:
`api/public/slo-checkout.mjs`, `api/public/slo-pull.mjs`,
`api/public/slo-status.mjs`, `api/public/slo-repair-checkout.mjs`,
`src/slo/pull.mjs`, `src/slo/status.mjs`, `src/slo/repair-offer.mjs`.

## One order, start to finish

```mermaid
flowchart TD
    A[Widget step 1: contact + businesses] -->|POST slo-checkout| B{SLO_DEMO_PAY = 1?}
    B -->|yes| C[Order row: payment_links is_demo, real amount, no Commas call]
    B -->|no| D[Order row: payment_links sent + Commas card page URL]
    C --> E[Widget step 2: identity + consent]
    D --> E
    E -->|POST slo-pull| F{Which order?}
    F -->|demo order, demo on| G[Store identity + consent, then C-00 handle runs now. No diagnostic.paid, no sale]
    F -->|demo order, demo OFF| X[Refused: order_not_paid. Nothing stored]
    F -->|real order + defer_pull, not paid| H[Store identity + consent. Pull waits]
    F -->|real order, no defer_pull, or already paid| I[Store identity + consent, emit diagnostic.paid]
    H --> J[Buyer pays on Commas]
    J -->|webhook: payment.received marks link paid; diagnostic.paid| K[C-00: consent gate finds the stored consent]
    I --> K
    G --> L[soft_pull_requests queued → processing]
    K --> L
    L -->|CRS answers| M[crs_results stored, tier set, decision.rendered event]
    L -->|no bureau answered| N[soft_pull_requests failed]
    M -->|GET slo-status: done| O{bucket}
    N -->|GET slo-status: failed| P[Widget: booking link]
    O -->|funding| Q[Widget: go to roadmap-book?pa=amount]
    O -->|repair| R[Widget: REPAIR_TRIAL / REPAIR_DFY + Talk to us first]
    O -->|none: review tiers| P
    R -->|POST slo-repair-checkout| S{demo?}
    S -->|yes| T[Demo payment_links row, nothing charged]
    S -->|no| U[Commas link, Consulting Services Trial / Standard]
```

## States the widget polls (GET /api/public/slo-status)

| state | when |
|---|---|
| running | no request yet, a request queued or processing, or a result stored but its decision not yet recorded |
| done | this order's crs_results row AND its decision.rendered event exist |
| failed | this order's newest request ended failed or cancelled with no newer result |

Only rows made at or after this order's payment_links row count.
