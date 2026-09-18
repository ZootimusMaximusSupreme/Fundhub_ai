# SLO offer — actual (first slice)

Generated from the code in this worktree. Not from the spec.

## What the code does

```mermaid
flowchart TD
  S["/slo/ — sales page public/slo/index.html"] -->|every CTA| P["/slo/pay.html — email required, first + last optional"]
  S -. fills every price slot .-> A
  P -. fills price + server notices .-> A
  A["GET /api/public/slo-checkout"] --> B["Price $297, next /slo/pull.html"]
  P -->|"valid email"| C
  P -->|"empty / bad email"| P
  P -->|"checkout.ready false"| PAUSE["'Checkout is paused' — button hidden, nothing charged"]
  C["POST email, first_name, last_name"] --> D["Find or create client + portal account"]
  D --> E["Mint Commas $297 Assessment"]
  E --> F["payment_links purpose=diagnostic"]
  F --> G["success_url = /slo/pull.html"]
  E -->|"ok, https checkoutUrl"| CARD["location.assign(checkoutUrl) — Commas card page"]
  E -->|"checkout_failed / 503 / network"| PFAIL["Stay on /slo/pay.html — 'Nothing was charged'"]
  CARD -->|paid| G
  H["Commas paid webhook"] --> I["diagnostic.paid"]
  I --> J["C-00 CRS pull — needs identity + consent"]
  J --> K["analysis.completed"]
  K --> L["slo-pack-delivery"]
  L --> M["Gold HTML pack saved + EMAIL-U02-ANALYZER-FUNDING-DELIVERY"]
```

## Traced paths

- `api/public/slo-checkout.mjs` — mint + write a diagnostic payment link so the existing Commas adapter emits `diagnostic.paid`.
- `src/slo/buyer.mjs` — client, portal account, `slo_ref` stamp.
- `src/slo/deliver.mjs` — same UnderwriteIQ funding pack and email the closer deck uses. The four analysis docs are the gold HTML pages (`src/deliverables/`), not the short PDFs.
- `src/workflows/slo-pack-delivery.mjs` — on `analysis.completed`, only if `slo_ref` is on the client.
- C-00 / C-06 / U-03 / U-04 are unchanged. ClickFunnels adapter is unchanged.
- `public/slo/index.html` — sales copy verbatim from `clickfunnels-fragments/slo/slo-01-sales.html`. Every
  price slot filled from GET `priceDisplay`; none typed. Cut: the layout-preview sample results, the empty
  result placeholders, and the video player (`funnel/slo-vsl.mp4` is 404). A failed price read shows a dash
  and a line saying the exact price is on the next page.
- `public/slo/pay.html` — email required before any POST. Leaves only for an `https` `checkoutUrl` the server
  returned. The charge / soft-pull / keep lines are the server's `notices`, plus "We do not sell your data."
  Every failure path says nothing was charged.

## Not in this code

The pull HTML (`/slo/pull.html`, workflow W2). Identity submit on `/slo/pull.html`. ClickFunnels paste. The live `/watch` funnel.
