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

## The widget screens (front end, 2026-09-22)

Source: `clickfunnels-fragments/slo/slo-01-sales.html`, the `#fhw` widget after
the SPLIT-LINE comment. Every "Get My Roadmap" and "Show Me What I Qualify For"
button scrolls to it. No page on the way links to `roadmap/pay.html` any more.

```mermaid
flowchart TD
    A[Step 1 Contact: first, last, email, phone] -->|Continue, checked in the page| B[Step 2 Payment: legal name, DOB, social, home address, previous address, businesses, consent]
    B -->|Pay: page checks every box first| C[POST slo-checkout]
    C -->|field errors| B
    C -->|demo:true| D[POST slo-pull, no defer_pull]
    C -->|demo:false + checkoutUrl| E[POST slo-pull with defer_pull:true]
    D -->|field errors| B
    E -->|field errors| B
    D -->|ok| F[Reading your file: poll slo-status every 1s, up to 90s]
    E -->|ok, next pay| G[Commas card page]
    G -->|returns to /roadmap?ref=&client_id=| F
    F -->|done, bucket funding| H[apply.fundhub.ai/roadmap-book?pa=amount + ref, client_id, utm tags]
    F -->|done, no bucket| I[apply.fundhub.ai/roadmap-book, no pa]
    F -->|done, bucket repair| J[In-widget offer: the two plans from repair_offer + Talk to us first]
    F -->|failed| K[Could not read your file: Check my details goes back to step 2, support email]
    F -->|90s, still running| L[Taking longer than usual: Check again]
    J -->|POST slo-repair-checkout, demo| M[You're in. We'll email next steps.]
    J -->|POST slo-repair-checkout, live| N[Commas card page for that plan]
```

| Rule | Where the page does it |
|---|---|
| Demo or live comes from the server (`demo` on GET and POST slo-checkout). | The yellow demo note shows only when GET says `demo:true`. |
| Total today = base + each extra × (businesses − 1), from GET slo-checkout (defaults 29700 / 1500 cents). | Updates as businesses are added or removed; the Pay button shows the same total. |
| A lone Business 1 may be left blank (it is skipped, the order is still one business). Added businesses must be filled in or removed. | Keeps the shown total equal to what the server charges. |
| Server errors go under the box they name (`field`, including `businesses.i.key`). | Unknown fields show in one line above the Pay button. |
| The social and DOB go in the POST body only; the social box is cleared after a good answer. | Never put in storage, the console or the address bar. |
| `console.info("fh-widget time-to-bucket <ms>")` when state becomes done. | Measured from the Pay press (across the card page through a stored timestamp). |
| Nothing about repair or letter mailing shows before a pull result. | The offer pane is filled only from `repair_offer`. |
| The page takes a phone number in step 1 and sends it as `phone`. | slo-checkout does not store it yet (the back end takes no phone). |
