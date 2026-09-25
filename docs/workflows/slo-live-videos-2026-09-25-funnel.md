# SLO funnel — live prove, 2026-09-25

Agent walked the live pages in a real browser (Playwright, Chromium, 1280×1000). No card was
entered. No Commas catalog product was created. Videos were not touched — another agent owns them.

Journey read first: `docs/journeys/slo-offer-intended.md`, `docs/journeys/slo-offer-actual.md`,
`docs/journeys/slo-roadmap-widget-flow.md`.

Sim buyers used (plus-tag, agent phone only): `e2e+slo-prove-1790377108895@fundhub.ai`,
`e2e+slo-prove-1790377236786@fundhub.ai`.

## Scorecard

| # | Step | Verdict |
|---|---|---|
| 1 | Sales page loads, video slot exists, main CTA works | **PASS (video file 404 — noted, not fixed)** |
| 2 | Checkout reaches a real Commas / Fanbasis pay page | **FAIL** |
| 3 | Next step after pay is real | **PASS (demo path only)** |
| 4 | Portal door a paid client hits is not a 404 | **PASS** |

## Step 1 — sales page, video slot, CTA

URL opened: https://apply.fundhub.ai/roadmap/ — HTTP 200.

- Page renders: headline, order summary, guarantee, footer, phone `(561) 304-8368`.
- Video slot exists: `<video id="fh-vsl">` measured 850×477 with a "TAP FOR SOUND" button.
- Main CTA "Show Me How Much I Qualify For" clicked → scrolled to the `#fh-order` checkout
  widget (scrollY 7144, widget in view). Second CTA "Get My Roadmap" is the same `#fh-order` target.
- Price on the page is the server's `$297` from GET https://fundhub.ai/api/public/slo-checkout.

**Break found, not fixed (video agent owns it):** the video source is a 404.
https://fundhub.ai/funnel/slo-vsl.mp4 returns **404** (`text/html`), and
https://fundhub.ai/funnel/slo-vsl-poster.jpg is also blocked. The slot is a black rectangle.

**Observation, not fixed:** a ClickFunnels **TEST MODE** badge is painted bottom-right of the live
public page.

## Step 2 — checkout to a real pay page — FAIL

Walked as a person on https://apply.fundhub.ai/roadmap/ :

1. Step 1 CONTACT — filled first, last, email, phone → **Continue** works, validation works
   (empty fields show "Please enter a real email address." etc).
2. Step 2 PAYMENT — filled legal name, DOB, SSN, home address, business, consent box. Address
   `123 Main St, Austin TX` returned the designed warning "We couldn't find that address… tap Pay
   again to use it as typed." A real address (`1600 Pennsylvania Avenue NW, Washington DC`) passed.
3. Pressed **Get My Roadmap · $297**.

What the live server answered (POST https://fundhub.ai/api/public/slo-checkout):

```
{"ok":true,"demo":true,"ref":"slo_d3683570d2f68363132e23c2","client_id":"bbbfdc25-…","priceCents":29700,"priceDisplay":"$297","businesses":1}
```

`demo: true`. **No `checkoutUrl`. No Commas card page was ever requested.** Netlify production has
`SLO_DEMO_PAY=1`. GET on the same door says so out loud:
`"notices":{"charge":"Demo checkout: your card is not charged."}`.

So today a buyer fills the whole form, presses a $297 button, is never asked for a card, and
Fundhub collects **$0**.

The Commas door itself could not be proven from here: the checkout key
(`FANBASIS_CHECKOUT_API_KEY`) is stored masked on Netlify and the copy in local `.env` is the mask,
which the Commas API rejects with `401 Invalid API key or unauthorized user context`. Because
production is in demo mode, the live handler never calls Commas either, so nothing on the live path
exercises that key. No key was rotated, removed, or changed.

## Step 3 — next step after pay — PASS on the demo path

After the pay press the widget moved the buyer to:

https://apply.fundhub.ai/roadmap-book?ref=slo_d3683570d2f68363132e23c2&client_id=bbbfdc25-afc8-4566-81eb-01e5bf0f2b3b — HTTP 200

Real page: "ORDER COMPLETE · EVERYTHING IS IN YOUR ACCOUNT", and the native calendar
https://apply.fundhub.ai/funding-book-call is framed in it.

Other live doors on that path, all opened:

| URL | Status | What is there |
|---|---|---|
| https://apply.fundhub.ai/roadmap-thank-you | 200 | "RECEIVED · YOUR CALL REQUEST" + FAQ |
| https://fundhub.ai/roadmap/pull.html | 200 | "Let's Build Your Funding Pack" identity form |
| https://fundhub.ai/app/payment-success.html | 200 | "Thanks — you are back from checkout" |
| https://apply.fundhub.ai/schedule/phonecall | 200 | Live 30-minute booking calendar |

A real payer's Commas success URL (`sloPullSuccessUrl` → `/roadmap/pull.html`) lands on a live
page, so the post-pay door is real — but it cannot be walked end to end today because nobody can
pay (step 2).

## Step 4 — portal door — PASS

https://fundhub.ai/app/client-portal.html — HTTP 200, redirects to
https://fundhub.ai/portal-login.html : "Client sign-in — Email me a sign-in link… The link works
once and lasts 15 minutes."

Not a 404. (For the record, `/portal`, `/app/portal.html` and `/app/login.html` are 404s — those
are not the client door; `/app/client-portal.html` is.)

## The one thing that stops ads

`SLO_DEMO_PAY=1` on Netlify production. Until that is off (and a real Commas session mints), every
click on the $297 button collects nothing.
