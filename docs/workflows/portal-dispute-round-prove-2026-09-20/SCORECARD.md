# Portal dispute-round button — live prove 2026-09-20

**Named item:** client portal button to issue a round of disputes (revenue from a current client).

**COMPLIANCE REVIEW REQUIRED** — dispute logic, fee timing, payment rail. No letters mailed. No card charged.

| Field | Value |
|---|---|
| Verdict | **PASS** |
| Sim | Sim Repair E2E20 `9b58de7f-7942-4354-aa4b-c61cfe23e7a4` |
| Portal URL | https://fundhub.ai/app/client-portal.html |
| Progress URL (the button) | https://fundhub.ai/progress.html |
| Door on portal home | **See exactly where your file stands →** |
| Button name | **Continue** (section **Run a round now**) |
| Money | **$100** three bureaus; optional **+$10** creditor letter; **+$20** CFPB and state AG. Extra round — does **not** use a program round. Hosted checkout on Fanbasis. Card is **not** charged until the client finishes that page. |
| Letters | After pay: fresh credit pull, round built, status `staged`. **A staff member presses Send.** Payment does **not** mail. No bureau mail in this prove. |
| Mint | POST `/api/paid-services` **201**, `awaiting_payment`, `round_no` 1, `price_total_cents` 10000, checkout host `www.fanbasis.com` |
| Paid | **no** |
| Bureau mail | **no** |

Clicked the progress page **twice**. Continue showed both times. Then Continue → Yes, continue → Take me to payment → **Your payment page is ready**. Did not open the card form. Did not pay.

Checkout title in code is `Document round N` (not a new Commas keep-catalog product create). Session mint uses `/checkout-sessions`, not `POST /public-api/products/create`.

**Not on the portal home:** there is no **Continue** / **Run a round now** on `/app/client-portal.html`. That page has **Sign to authorize dispute letters** (consent, not pay) and the progress link.

**Leftover (not this hole):** staff viewing `/progress.html?client_id=` hits **Pick a client first** on POST. Board row `STAFF-PAID-ROUND-ID`. Do not fix here.

Evidence: this folder (`client-portal-*.png`, `client-progress-*.png`, `client-confirm-*.png`, `client-mint.png`, `client-ui.json`, `api.json`).
