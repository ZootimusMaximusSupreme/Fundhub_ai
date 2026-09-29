# $297 /roadmap widget — back-end flow (2026-09-27)

Owner-set 2026-09-27: the checkout is a **three-step** widget on the /roadmap
sales page (https://apply.fundhub.ai/roadmap) — **1 info, 2 card, 3 soft pull**.
Nothing about the credit file is asked before the card is paid. The widget is a
window onto this flow.
Traced from code on branch `feat/roadmap-widget`:
`api/public/slo-checkout.mjs`, `api/public/slo-pull.mjs`,
`api/public/slo-status.mjs`, `api/public/slo-repair-checkout.mjs`,
`src/slo/buyer.mjs`, `src/slo/pull.mjs`, `src/slo/status.mjs`,
`src/slo/address-check.mjs`, `src/slo/repair-offer.mjs`.
Updated 2026-09-22 after the independent review (email takeover, pay bypass,
retry, address rules, address check, phone, Google autocomplete).
Updated 2026-09-27: the steps were re-ordered so the card comes before the soft
pull. No endpoint, schema or server rule changed — the widget stopped sending
`defer_pull` and now posts `slo-pull` on an order the webhook has already paid,
which is the branch `runSloPull` already had.

## Saved before Pay

Step 1 (first name, last name, email, phone) is posted to
`POST /api/public/slo-interest` once the email is real, including when they
leave the page without pressing Pay. A page open on the widget is one
`slo.visit` per browser session. Neither call creates a client, a card page,
or an email.

Each of those rows, and `slo.checkout_started` when they press Pay, carries
`actor`: `person` or `agent`, and `actor_reason`. An agent is an automated
browser, a `@fundhub.ai` email, or a test email. A normal browser with any
other email is a person. Pressing Pay also tells Meta `InitiateCheckout`, and
that ping is skipped for an agent.

## One order, start to finish

```mermaid
flowchart TD
    A[Widget step 1: contact + businesses] -->|POST slo-checkout| EM{Email already a client?}
    EM -->|no| NEW[Create the client: name, phone +1XXXXXXXXXX, account, ad tags, businesses]
    EM -->|yes| OLD[Write NOTHING to that client]
    NEW --> B{SLO_DEMO_PAY = 1?}
    OLD --> B
    B -->|yes| C[Order row: payment_links is_demo, real amount, business_count, no Commas call]
    B -->|no| D[Order row: payment_links sent, business_count + Commas session; answer carries the embedded block]
    C --> E[Widget step 3: identity + consent]
    D --> D2[Widget step 2: Commas card form drawn INSIDE this page, no navigation] --> PAIDHOOK[checkout:success opens step 3; webhook marks the order paid] --> E
    E -->|POST slo-pull| F{Order found by payment_links link_ref + client_id?}
    F -->|no| X0[404 not_found. Nothing stored]
    F -->|demo order, demo OFF| X[409 order_not_paid. Nothing stored]
    F -->|yes| GATE{Order not paid AND client has an identity this order did not write, or a paid purchase?}
    GATE -->|yes| X2[409 existing_account under Email. Nothing stored]
    GATE -->|no| AD{address_confirmed? else geocoder: home + previous address found?}
    AD -->|not found| X3[422 address_unverified: warning under the street box. Nothing stored]
    X3 -->|Pay again, same address: address_confirmed true| AD
    AD -->|found, confirmed, or geocoder down| W[Stamp slo_ref, store identity + consent, mark identity_stored_at on the order row]
    W --> WHICH{Which order?}
    WHICH -->|demo| G[Attempt n: C-00 handle runs now, event slo-demo:ref:n. No diagnostic.paid, no sale]
    WHICH -->|live, NOT paid — only the gap before the webhook lands| H[next: pay. Pull waits, widget polls]
    WHICH -->|live, paid by the Commas webhook| I[Attempt n: emit diagnostic.paid, key slo-pull:ref:n]
    H --> J[Buyer pays on Commas]
    J -->|webhook: payment.received marks link paid; diagnostic.paid with ref| K[C-00: consent gate finds the stored consent]
    I --> K
    G --> L[soft_pull_requests queued → processing, ledger key tied to this order]
    K --> L
    L -->|CRS answers| M[crs_results stored and linked to that request, tier set, decision.rendered event]
    L -->|no bureau answered| N[soft_pull_requests failed]
    N -->|Check my details: back to step 3, n = 1 + failed pulls of this order| E
    M -->|GET slo-status: done| O{bucket}
    N -->|GET slo-status: failed| P[Widget: booking link]
    O -->|funding| Q[Widget: go to roadmap-book?pa=amount]
    O -->|repair| R[Widget: REPAIR_TRIAL / REPAIR_DFY + Talk to us first]
    O -->|none: review tiers| P
    R -->|POST slo-repair-checkout| S{demo?}
    S -->|yes| T[Demo payment_links row, nothing charged]
    S -->|no| U[Commas link, Consulting Services Trial / Standard]
```

### Rules the back end enforces (2026-09-22 review)

| Rule | Where |
|---|---|
| An email is not a login. An email that already belongs to a client writes nothing to that client at checkout: no name, phone, account, ad tags, businesses or slo_ref. | `resolveSloBuyer` → `{ clientId, created }`; `runSloCheckout` writes to the client only when `created`. |
| The order's ref and business count live on the order row (`payment_links.link_ref`, `business_count`, migration 388). The order is found by that row, never by a client field. | `findSloOrder`, `businessesPaidFor`. |
| An unpaid order is refused (`existing_account`, 409, message under Email) when its client has an identity this order did not write, or has paid before. A paid order (webhook) is not refused. A brand-new client has neither, so its order and its retries go through, demo and live. | `sloClientPriorFile`, `markSloOrderIdentity` (`payment_links.identity_stored_at`). |
| A live order starts a pull only when the Commas webhook has marked it paid. Unpaid → identity + consent stored, `next: 'pay'`, whatever the body says about `defer_pull`. Since 2026-09-27 the widget reaches this door **after** the card, so the paid branch is the normal one and `next: 'pay'` is only the gap before the webhook lands. | `runSloPull`. |
| A paid order whose soft-pull form is still empty 15 minutes later gets one text and one email. The link is `https://apply.fundhub.ai/roadmap?ref=&client_id=#fhw`. A form already in, a demo, or a company or test email sends nothing. | `src/workflows/slo-paid-form-nudge.mjs` on `payment.received`. |
| The personal pull asks TransUnion, Experian, and Equifax when `CRS_ACTIVE_BUREAUS` is `TU,EX,EQ`. Each saved company with a name and state gets an Experian Business search and report. A miss does not cancel the personal pull. The buyer dollar counts personal funding once, then each company's business amount. The oldest company is the report the engine scores first. | `runCrsPull`, `orderBusinessReport`. |
| Each new pull after a failed one is a new attempt: `slo-demo:<ref>:<n>` / `slo-pull:<ref>:<n>`, n = 1 + this order's failed or cancelled pulls. A double click inside one attempt is one pull. | `nextSloPullAttempt`. |
| The home and previous address are looked up with the existing geocoder (Google if a server key is set, else the US Census geocoder). Not found → `address_unverified` (422) warning; Pay again with `address_confirmed: true` takes it as typed. Geocoder down or slow (5s) never blocks. Military (AA/AE/AP) is not looked up. | `checkSloAddresses` → `verifyStreetAddress`. |
| Street: 3-48 characters with a digit somewhere (military, Puerto Rico and Wisconsin grid addresses pass). P.O. box is a warning. Apartment: periods and `# ` normalized, then 10 characters at most. No age rule on the date of birth: a real date, 1900 or later, not in the future. | `src/slo/fields.mjs` and the widget's own copy. |
| Phone: optional on the server; when sent, 10 US digits, stored as +1XXXXXXXXXX on a client this checkout creates. | `parseSloPhone`. |
| `GET slo-checkout` returns `mapsBrowserKey` from `GOOGLE_MAPS_BROWSER_KEY` (null when unset, never the server key). | `sloPageConfig`. |

## States the widget polls (GET /api/public/slo-status)

| state | when |
|---|---|
| running | no request of this order yet, its newest request queued or processing, or its result stored but the decision not yet recorded |
| done | a request of this order was fulfilled with a crs_results row AND that row's decision.rendered event exists |
| failed | this order's newest request ended failed or cancelled with no newer result |

Only pulls THIS order started count: a soft_pull_requests row whose ledger key
is `diagnostic-paid:slo-demo:<ref>:<n>`, or `diagnostic-paid:<events.id>` for a
diagnostic.paid event whose payload names this ref (or this order's
payment_links id). Any other pull on the same client — older, or run later by
staff or another order — is never shown. The result shown is the crs_results row
that request was fulfilled with.

## The widget screens (front end, 2026-09-27)

Source: `clickfunnels-fragments/slo/slo-01-sales.html`, the `#fhw` widget after
the SPLIT-LINE comment. Every "Get My Roadmap" and "Get My $297 Funding Roadmap"
button scrolls to it. No page on the way links to `roadmap/pay.html` any more.

```mermaid
flowchart TD
    A[Step 1 Info: first, last, email, phone. Nothing else] -->|Continue, checked in the page| C[POST slo-checkout on opening step 2]
    C -->|field errors| A
    C -->|demo:true, no card form exists| B
    C -->|demo:false + embedded block| G[Commas card form mounted in step 2 — number, expiry, CVC on THIS page]
    G --> B[Step 2 Card: $297 base, then Get My Roadmap]
    B -->|Get My Roadmap calls submitForm on the mounted form| PAY{Commas charges the card}
    PAY -->|form:submission_error, their words on our page| B
    PAY -->|checkout:success — no navigation, ever| S3[Step 3 Soft pull: legal name, DOB, social, home address, previous address, BUSINESS ADD-ON first included / $15 each extra, consent]
    OLD[An old link or a reload: /roadmap?ref=&client_id=] --> S3
    S3 -->|Start My Soft Pull: page checks every box first| D[POST slo-pull. No defer_pull, ever]
    D -->|field errors| S3
    D -->|address_unverified: warning under the street box| S3
    D -->|existing_account on a paid order: the webhook has not landed| S3
    D -->|ok| F[Reading your file: poll slo-status every 1s, up to 90s]
    D -->|ok, next pay: the webhook lands in seconds and starts it| F
    F -->|done, bucket funding| H[apply.fundhub.ai/roadmap-book?pa=amount + ref, client_id, utm tags]
    F -->|done, no bucket| I[apply.fundhub.ai/roadmap-book, no pa]
    F -->|done, bucket repair| J[In-widget offer: the two plans from repair_offer + Talk to us first]
    F -->|failed| K[Could not read your file: Check my details goes back to step 3, support email]
    K -->|a new attempt, a new pull| D
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
| Nothing about the credit file — social, date of birth, address, consent — appears anywhere before step 3, and step 3 opens only once an order exists. | Step 2 never calls `slo-pull`; tab 3 does nothing until `order` is set; the paid return (`?ref=&client_id=`) paints step 3 before the browser draws. |
| A buyer who has paid is never sent back to step 1. | Tabs 1 and 2 are dead once the order is locked; `existing_account` on a locked order shows "your payment is still landing" on step 3 instead of routing to the Email box. |
| Businesses are the ADD-ON and live on step 3, after the card (owner-set 2026-09-27: "business goes to the 3, it's a one click upsell"). Step 1 is contact only. | The block moved into `.s3`; `checkStep3` validates it; `paintExtras()` shows what the extras add. |
| The card step charges the base price alone. Nothing chosen on step 3 can change what that button charged. | `paintTotal()` reads `price.base` only; `startCheckout` sends `business_count: 1` and no business list. |
| **MEASURED 2026-09-27, and it is a gap, not a design:** an extra business picked on step 3 is NOT charged. `runSloPull` records the difference as `slo_business_owed_cents` on the client and says in its own header that "nothing here can charge a card". The only charge path in this repo is `createCheckoutSession`, which mints a hosted Commas card page — its three types are `onetime_non_reusable`, `onetime_reusable`, `subscription`, and none of them charges a card already on file. `slo-repair-checkout`, the one other post-purchase offer, sends the buyer to a second card page for exactly this reason. So a true one-click upsell (tap, saved card, done) cannot be built from what is here today. | `src/slo/pull.mjs`, `src/payments/commas-api.mjs`, `api/public/slo-repair-checkout.mjs`. |
| Nothing about repair or letter mailing shows before a pull result. | The offer pane is filled only from `repair_offer`. |
| The page takes a phone number in step 1 and sends it as `phone`. | slo-checkout stores it as +1XXXXXXXXXX on a client it creates; an existing client's phone is not touched. |
| `address_unverified` puts "We couldn't find that address. Check the street and ZIP, or tap Pay again to use it as typed." under the street box. | The next Pay with the same address (kept in memory only) sends `address_confirmed: true`. |
| `existing_account` puts "This email already has a file with us. Email support@fundhub.ai and we will pick it up." under Email. | Step 1 opens. |
| Google Places autocomplete loads only when `mapsBrowserKey` is not null, on the home and previous street boxes, US addresses only. A pick fills street, city, state and ZIP. | Null key: no Google script, plain boxes. |
| Street, apartment and date-of-birth checks match the server (digit anywhere, `Apt. 4B` allowed, no age rule). | Apartment boxes take 14 characters so periods fit; 10 after normalizing. |
