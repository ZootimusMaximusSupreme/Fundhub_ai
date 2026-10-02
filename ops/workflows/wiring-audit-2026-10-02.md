# Wiring audit — /roadmap and /watch (2026-10-02)

Read-only audit. No product files change. Final report: `docs/audits/wiring-audit-2026-10-02.md`.

## Tasks

| # | Unit | Owner | Status |
|---|---|---|---|
| W1 | /roadmap pages, checkout, copy consistency | agent W1 | done |
| W2 | /roadmap Fundhub beacons + zero-count cause | agent W2 | done |
| W3 | /watch, booking, sorting hat, Meta Schedule/Purchase | agent W3 | done |
| W4 | Meta pixel/CAPI/dedupe/fbc + Clarity, both funnels | agent W4 | done |
| W5 | Merge, rank fixes, phone checklists, write report, commit | this session | done — docs/audits/wiring-audit-2026-10-02.md |

Agents report back to W5. W5 writes each section below, so there are no write clashes.

## W1

Done. No files changed. Live pages match repo.

- Pages: /roadmap (slo-01-sales.html, widget #fhw :998-1147, script :1148-1915) → /roadmap-book (slo-02-booking.html) → /roadmap-thank-you (slo-03-thank-you.html). slo-02-order.html is not live.
- Buttons: hero :816, how-it-works :834, phone sticky :2074 → scroll handler :2087-2095. Working.
- Payment live: `demo:false`, `checkout.ready:true`, 29700 cents. Success → step 3 at :1394-1399. Working.
- **Break: step 1 does not save to ClickFunnels.** Continue posts only our slo-checkout (api/public/slo-checkout.mjs:288-333). First CF write at step 3 (src/slo/pull.mjs:413-420).
- **Break: "3 · Soft pull" tab opens before paying** (:1593 checks `order`, set at :1659 before payment). Unpaid submit shows "Your payment went through" (:1684, :1107).
- **Break: $15 extra businesses never charged.** Step 2 charges base only (:1449-1455); extras only recorded as `slo_business_owed_cents` (src/slo/pull.mjs:26-30, 369-379), nothing reads it. Known gap docs/journeys/slo-roadmap-widget-flow.md:153.
- UnderwriteIQ amount wired: ?pa from src/slo/status.mjs:186 → crs totalCombined. Working.
- "You Qualified" headline does not exist; booking page says "Want to Get There Faster?" (slo-02-booking.html:117).
- Refund: 7 days everywhere (:817, :922, :1042, :2059). No "15" anywhere. Terms page has no refund line.

## W2

Done. No files changed.

- **slo.click never existed.** Clicks are saved as `funnel.click` (api/public/slo-interest.mjs:121). Today: 135 rows, 31 real people on /roadmap. Click tracking began 10-01 01:06.
- **Step-1 contact** = `slo.contact_started` (slo-interest.mjs:191). Today: 1 real person (12:50 Phoenix). Saved only once a 10-digit phone is typed (public/funnel/fh-attribution.js:149-150).
- 15 of 57 real visitors scrolled to the buy box today; 1 pressed Continue.
- slo.visit (fh-attribution.js:182-187) 66 today; slo.engagement (:223-275) 69; #fhw scroll = `reached_form` flag inside slo.engagement (:246-256). Endpoint routed at netlify/functions/api.mjs:193, :768. All working.
- Fixes: (1) save step 1 on email, merge phone later (server already merges, slo-interest.mjs:219-259); (2) count `funnel.click` + `slo.contact_started`, not `slo.click`.

## W3

Done. No files changed.

- Links all correct; 0 GoHighLevel/leadconnector links in funnel files or live pages.
- Survey → CRM working (126 entry.captured, 81 survey.submitted since 09-26). Lead fires (apply-survey.html:455).
- **Schedule never fires**: live /funding-book-call never stamps `submittedAt`; repo 04a-book-top.html:113 does but was never pushed (re-checked live: 0 matches).
- **bookings table = 0 rows ever**; all 16 booking.created in 14 days are demo.
- No Conversions API, no showed-call event, no Purchase for any of the six offers (src/config/offers.mjs).

## W4

Done. No files changed.

- Pixel `2403674420141513` on every page of both funnels (tracking-manifest.mjs:22,36,297). Working.
- /roadmap: no Lead on step 1; InitiateCheckout on Pay press (public/funnel/fh-attribution.js:276-291) working; **no Purchase** — `checkout:success` at slo-01-sales.html:1392-1397 only opens step 3.
- **No server-side Meta sender (Conversions API) exists** in src/ api/ netlify/ scripts/. So no dedupe. Plan exists, not built: marketing/ads/apply-survey-meta-tracking-2026-09-30.md:13-19.
- fbc/fbp set in browser, never sent to server; fbclid dropped on purpose (fh-attribution.js:2, src/ads/attribution-keys.mjs:15, src/adapters/clickfunnels.mjs:177).
- /apply: Lead (apply-survey.html:455,460-467) and Schedule (:502) fire with event ids, browser only. /roadmap-book and /funding-book-call direct: no Schedule. No Purchase for offers.
- **Clarity:** right id `tscu15s674` (public/js/clarity.js:27, matches .env). Script loads 200, but Clarity's server replies "not being collected due to your configured project settings" — 28 of 28 fetches. Project setting, not code. Check https://clarity.microsoft.com/projects/view/tscu15s674/settings

## Leftovers (other breaks seen, not worked)

- W2: `marketing/landing-pages/slo/` not committed in git; tracked copy `clickfunnels-fragments/slo/` missing on disk (move in progress).
- W2: `slo-02-order.html` loads fh-attribution.js but is not in the push list (tracking-manifest.mjs:477-509).
- W1: step-3 consent says "Fundhub Credit Solutions LLC" (slo-01-sales.html:1098); stored consent says "Fundhub"; footer "Fundhub LLC".
- W1: address warning says "tap Pay again" (:1163) but the button is "Start My Soft Pull".
- W3: SMS/CRM code defaults to services.leadconnectorhq.com (src/messaging/providers/ghl-relay.mjs:56, src/messaging/crm-contacts.mjs:34).
- W3: 09-26 replay of the real 09-24 booking stored as demo, no booking row.
- W4: ClickFunnels script logs `Refused to get unsafe header "X-Clickfunnels-Version"` on /roadmap (their code).
- W4: `.env` has no `META_PIXEL_ID`; pixel comes from hardcoded fallback tracking-manifest.mjs:22.
