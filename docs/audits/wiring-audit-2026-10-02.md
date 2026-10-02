# Wiring audit — /roadmap and /watch (2026-10-02)

Read-only. No product files changed. Live pages fetched with a cache-bust on 2026-10-01. Database counts are read-only queries on production (Supabase `oqpnlusrotpxfenysfxz`). Working board: `ops/workflows/wiring-audit-2026-10-02.md`.

Paths below are relative to the repo root. `sales` = `marketing/landing-pages/slo/slo-01-sales.html`.

## The short version

1. **Meta never hears about a sale.** No Purchase event exists on either funnel. No server-side Meta sender (Conversions API) exists anywhere in the repo.
2. **A /roadmap buyer can skip the card.** The "3 · Soft pull" tab opens before payment. Submitting it shows "Your payment went through" with no charge.
3. **Schedule never fires on /watch.** The live booking page is an older copy that never stamps the booking as submitted.
4. **The zeros were a wrong name, not a broken beacon.** `slo.click` has never existed; clicks are saved as `funnel.click`. Today had 31 real-person clicks and 1 real step-1 contact.
5. **Clarity is installed correctly, but Clarity's own server says it is not collecting**, because of a setting in the Clarity project.

---

## /ROADMAP ($297)

Pages in order: https://apply.fundhub.ai/roadmap (`sales`, widget `#fhw` :998-1147) → https://apply.fundhub.ai/roadmap-book (`slo/slo-02-booking.html`) → https://apply.fundhub.ai/roadmap-thank-you (`slo/slo-03-thank-you.html`). Server calls: `api/public/slo-checkout.mjs`, `slo-pull.mjs`, `slo-status.mjs`, `slo-interest.mjs`; routes `netlify/functions/api.mjs:764-788`. Card form: Commas/Fanbasis embed (`sales:1333`). `slo-02-order.html` is old and not live.

| Step | Item | Expected | Found (file:line) | Status |
|---|---|---|---|---|
| Landing | Hero button | Scrolls to buy box | `sales:816` → handler `sales:2087-2095` | Working |
| Landing | How It Works button | Scrolls to buy box | `sales:834` → same handler | Working |
| Landing | Phone sticky bar | Shows on phones, scrolls to box | `sales:2074`, show/hide `:2078-2085` | Working |
| 1 Info | Fields | First, last, email, phone | `sales:1015-1025`, checks `:1309-1319` | Working |
| 1 Info | Continue → step 2 | Opens card step | `sales:1576-1585` | Working |
| 1 Info | Contact saved to ClickFunnels before card | ClickFunnels contact | Continue writes only our database (`api/public/slo-checkout.mjs:288-333`). First ClickFunnels write is at step 3 (`src/slo/pull.mjs:413-420`) | **Broken** |
| 1 Info | Step-1 contact beacon | `slo.contact_started` | `public/funnel/fh-attribution.js:142-164`, saved `api/public/slo-interest.mjs:185-217`. Only sends after a full 10-digit phone (`fh-attribution.js:149-150`). Today: 1 real person | Working (email-only visitors are never saved) |
| 2 Card | Card form loads | Commas form | `sales:1358-1411` | Working |
| 2 Card | Takes payment | Live $297 | Live server: `demo:false`, `checkout.ready:true`, 29700 cents. Submit `sales:1739-1756` | Working (charge itself: Can't verify from code) |
| 2 Card | Success → step 3 | Opens soft pull | `sales:1392-1397` | Working |
| 2→3 | Step 3 locked until paid | Locked | Tab handler `sales:1593` checks only `order`, which exists before payment (`sales:1659`). Unpaid submit shows "Your payment went through" (`sales:1684`, `:1107`) | **Broken** |
| 3 Pull | Fields + consent | Legal name, DOB, SSN, address, businesses, consent | `sales:1047-1101` | Working |
| 3 Pull | Submit → pull → poll | Runs pull | `sales:1666-1719`, poll `:1783-1802` | Working |
| 3 Pull | ClickFunnels contact | Name, phone, address, business; never SSN/DOB/EIN | `src/slo/pull.mjs:413-420`, blocked fields `src/slo/cf-contact.mjs:7-15` | Working in code (Can't verify live) |
| 3 Pull | $15 per extra business | Charged | Price `src/finance/slo-business-pricing.mjs:19` = 1500. Card step charges base only (`sales:1449-1455`). Extras only recorded as `slo_business_owed_cents` (`src/slo/pull.mjs:26-30, 369-379`); nothing reads it. Step 3 still says "$X added" (`sales:1460`) | **Broken** |
| 3→Book | Amount passed to booking | `?pa=` with UnderwriteIQ amount | `sales:1616-1622`, `:1803-1811`; amount from `src/slo/status.mjs:186` ← `src/adapters/crs.mjs:18,57` | Working |
| Book | Amount shown | UnderwriteIQ figure | `slo-02-booking.html:167-200` | Working |
| Book | "You Qualified" headline | "You Qualified" | Not in any file or live page. Page says "Want to Get There Faster?" (`slo-02-booking.html:117`) | **Missing** |
| Book | Booked → thank-you | /roadmap-thank-you | `slo-02-booking.html:443-453` | Working in code (booking itself: Can't verify) |
| Copy | Refund window | Same everywhere | 7 days at `sales:817`, `:922`, `:1042`, `:2059`. "15 days" exists nowhere (repo or live). Terms page has no refund line | Working |
| Beacon | slo.visit | Once per session | `fh-attribution.js:182-187`. Today 66 | Working |
| Beacon | slo.engagement | Seconds on page | `fh-attribution.js:223-275`, server `slo-interest.mjs:135-182`. Today 69 | Working |
| Beacon | #fhw scroll | Box came into view | `reached_form` flag inside slo.engagement (`fh-attribution.js:246-256`). Today 15 of 57 real visitors | Working |
| Beacon | slo.click | Button presses | Name `slo.click` never existed. Saved as `funnel.click` (`slo-interest.mjs:121`, sent from `public/funnel/fh-events.js:76-79`). Today 31 real people on /roadmap | Working under a different name |
| Meta | Pixel ID | One ID | `2403674420141513` on all 3 pages (`marketing/landing-pages/tracking-manifest.mjs:22`) | Working |
| Meta | Lead on step 1 | Fires | No `fbq('track'…)` in `sales` at all | **Missing** |
| Meta | InitiateCheckout | On card step | `fh-attribution.js:276-291` on Pay press, 297 USD | Working (no event_id) |
| Meta | Purchase once, 297 USD | Fires once | `sales:1392-1397` sends nothing to Meta. No Purchase anywhere | **Missing** |
| Meta | Schedule on /roadmap-book | Fires | PageView only | **Missing** |
| Meta | Browser/server event_id | Shared | No server sender exists (grep of `src/ api/ netlify/ scripts/`: none). Plan only: `marketing/ads/apply-survey-meta-tracking-2026-09-30.md:13-19` | **Missing** |
| Meta | fbclid / fbc / fbp | Reach the server | Set in browser only. fbclid dropped on purpose (`fh-attribution.js:2`, `src/ads/attribution-keys.mjs:15`, `src/adapters/clickfunnels.mjs:177`) | **Broken** |
| Clarity | Installed, right ID | `tscu15s674` | `public/js/clarity.js:27`, matches `.env` | Working |
| Clarity | Records sessions | Data uploads | Clarity server replies "not being collected… due to your configured project settings" (28 of 28 fetches). No uploads | **Broken** (setting, not code) |

## /WATCH (book a call)

Pages in order: https://apply.fundhub.ai/watch (ClickFunnels page + `01-vsl.html`, `public/funnel/watch-proof.js`) → https://apply.fundhub.ai/apply (`apply-survey.html`, calendar framed inline) → https://apply.fundhub.ai/funding-book-call (ClickFunnels scheduler + `04a-book-top.html` etc.) → https://apply.fundhub.ai/thank-you (`05-thank-you.html`, `public/funnel/thankyou-sort.js`) → sales call → one of six offers (`src/config/offers.mjs:16`). Push map: `tracking-manifest.mjs:337-463`. All in `marketing/landing-pages/` unless noted.

| Step | Item | Expected | Found (file:line) | Status |
|---|---|---|---|---|
| /watch | Get Started (top) | → /apply | `01-vsl.html:159`, live `href="/apply"` | Working |
| /watch | Get Started (second) | → /apply | `public/funnel/watch-proof.js:591` | Working |
| All | Dead GoHighLevel / leadconnectorhq links | None | 0 in funnel files, 0 in all 4 live pages | Working |
| /apply | Answers → CRM | Each screen saved | `apply-survey.html:343` → `/api/webhooks/clickfunnels`. Production since 09-26: 126 `entry.captured`, 81 `survey.submitted` | Working |
| /apply | Survey → calendar | Calendar after result | `apply-survey.html:446`, frame `:155` | Working |
| /apply | Meta Lead | Once, survey complete | `apply-survey.html:455`, gate `:462`, event_id `lead:<email>` | Working (browser only) |
| Booking | Meta Schedule | On Book/Confirm | `apply-survey.html:492` needs `submittedAt`. Repo writer stamps it (`04a-book-top.html:113`) but was never pushed; live /funding-book-call has 0 `submittedAt` (re-checked 2026-10-01) | **Broken** |
| Booking | Booking saved only on submit | On Book/Confirm | Live page still saves on every change (400ms loop). Repo removed it (`04a-book-top.html:131-136`), not pushed | **Broken** (same push) |
| Booking | Booking /funding-book-call opened directly → Schedule | Fires | PageView only | **Missing** |
| Booking | Next page after booking | /thank-you | Set inside ClickFunnels funnel 968281, not in repo | Can't verify from code |
| Booking | Webhook → handler | `booking.created` | `src/adapters/clickfunnels.mjs:65,710,876`; route `netlify/functions/api.mjs:65,1239` | Working (code) |
| Booking | Handler → CRM | Closer task, booking row, tag, pipeline | `src/handlers/comms.mjs:467-507` → `src/bookings/store.mjs:242` | Working (code) |
| Booking | Real bookings on production | Rows exist | `bookings` = 0 rows ever. All 16 `booking.created` in 14 days are `is_demo=true`, no client; last 2026-09-26 | Can't verify — no live proof |
| Booking | Call on host calendar | Invite | ClickFunnels scheduler via Cronofy; settings in ClickFunnels | Can't verify from code |
| /thank-you | Confirms the call | "Your Call Is Booked." | `thankyou-sort.js:473-481` | Working |
| /thank-you | Custom events | AddToCalendar, OpenInboxConfirm | `05-thank-you.html:181`, `:268` | Working |
| Call | "Showed call" via Conversions API | CRM → Meta | No sender exists; `src/sales/call-outcomes.mjs` only records | **Missing** |
| Offer | Purchase SOFT_PULL $32 | value 32 | `offers.mjs:96`; no Purchase | **Missing** |
| Offer | Purchase FUNDING_DFY $3,000 | value 3000 | `offers.mjs:107-108`; none | **Missing** |
| Offer | Purchase REPAIR_DFY $1,000 | value 1000 | `offers.mjs:119`; none | **Missing** |
| Offer | Purchase REPAIR_TRIAL $200 | value 200 | `offers.mjs:130`; none | **Missing** |
| Offer | Purchase Capital Blueprint $5,000 | value 5000 | `offers.mjs:160`; none | **Missing** |
| Offer | Purchase Capital Academy $5,000 | value 5000 | `offers.mjs:197`; none | **Missing** |
| Meta | Pixel ID | One ID | `2403674420141513` on all 4 live pages | Working |
| Meta | Browser/server dedupe | Shared event_id | Browser sends ids; no server side to match | **Missing** |
| Meta | fbclid / fbc / fbp | Reach the server | Browser only, same as /roadmap | **Broken** |
| Clarity | Records sessions | Data uploads | Same project-setting refusal | **Broken** (setting) |

## Why the zeros (slo.click and step-1 contacts)

- **slo.click:** no code has ever saved that name. Clicks are `funnel.click`, recording since 2026-10-01 01:06. Any count of `slo.click` will always be 0.
- **Step-1 contacts:** today is 1, not 0. 15 of 57 real visitors reached the box (26%). Only 1 pressed Continue. A contact is saved only after a full phone number is typed, so email-only visitors leave nothing.

| Day | slo.visit | reached box | slo.contact_started | funnel.click (real, /roadmap) |
|---|---|---|---|---|
| 10-01 | 66 | 15 | 1 | 31 |
| 09-30 | 23 | 5 | 0 | not yet recording |
| 09-29 | 150 | 390 rows | 14 (13 test runs) | not yet recording |
| 09-28 | 25 | 7 | 0 | not yet recording |
| 09-27 | 74 | 24 | 2 (test runs) | not yet recording |

## Why Clarity is empty

The ID is right and the script loads. Clarity's server answers every request with "Data from this session is not being collected by Microsoft Clarity due to your configured project settings." So it is switched off in the project. Most likely IP blocking, recording paused, or a site address that does not match. Check: https://clarity.microsoft.com/projects/view/tscu15s674/settings

---

## Fixes, ranked by sales impact (none done — waiting for approval)

1. **Lock the /roadmap soft-pull tab until the card succeeds.** One line at `sales:1593` (require `order.locked`). Stops buyers skipping the $297 and being told they paid.
2. **Push the repo booking writer to /funding-book-call** (`node scripts/cf-push-custom-html.mjs push --only=apply-book`). Turns Schedule on and stops saving before Book is pressed.
3. **Send Purchase to Meta.** Browser on `checkout:success` (`sales:1392`) with `purchase:<order ref>`, 297 USD; plus a server-side Meta sender (Conversions API) for Lead, Schedule, Purchase (six offers at their prices) and showed call, reusing the browser event ids and passing fbc/fbp. Plan already written: `marketing/ads/apply-survey-meta-tracking-2026-09-30.md`. This is new build work.
4. **Save the /roadmap contact to ClickFunnels at step 1**, and save on email alone (merge the phone later; server already merges, `slo-interest.mjs:219-259`).
5. **Charge the $15 extras or stop saying "$X added".** Needs your pick: a second card page, or move the business picker before the card.
6. **Prove a real /watch booking lands in the CRM.** `bookings` has 0 rows ever. Pull ClickFunnels appointments by API and compare.
7. **Lead on /roadmap step 1**, Schedule on /roadmap-book and direct /funding-book-call.
8. **Clarity:** change the project setting. No code.
9. **Count `funnel.click`, not `slo.click`,** wherever the zero came from.
10. "You Qualified" headline on /roadmap-book — only if you want that wording. Refund line on the terms page (7 days) — low.

---

## Phone checklist — /roadmap

Before you start: open Meta Test Events on your laptop — https://business.facebook.com/events_manager2/list/pixel/2403674420141513/test_events — and type `https://apply.fundhub.ai/roadmap` into "Test browser events", then open the link it gives you on your phone.

| # | Do this | You should see | Meta Test Events | ClickFunnels / CRM |
|---|---|---|---|---|
| 1 | Open https://apply.fundhub.ai/roadmap | Headline and video | PageView | nothing |
| 2 | Scroll past the first screen, tap the blue "Get My $297 Funding Roadmap" bar | Page glides to the box with tabs 1 · Info, 2 · Card, 3 · Soft pull | (nothing) | nothing |
| 3 | **Negative test:** tap "3 · Soft pull" now | It should stay locked. **Today it opens** (fix 1). Do not submit | nothing | nothing |
| 4 | Tap "1 · Info", fill first, last, email, phone, tap Continue | Card boxes load | Should be Lead — **today nothing** (fix 7) | ClickFunnels contact should appear — **today it does not** (fix 4) |
| 5 | Type a card, tap "Get My Roadmap · $297" | Soft pull step opens | InitiateCheckout 297 USD. Purchase should follow — **today nothing** (fix 3) | Charge in Commas/Fanbasis |
| 6 | Optional: tap "+ Add a business ($15)" | "$15 added" | — | No extra charge happens (fix 5) |
| 7 | Fill legal name, DOB, Social Security number, address, business, tick consent, tap Start My Soft Pull | "Underwriting…" with bureau chips | — | ClickFunnels contact with name, phone, address, business |
| 8 | Wait about 10 seconds | /roadmap-book with your dollar amount counting up | PageView | ClickFunnels `prequal_amount` equals that amount |
| 9 | Pick a time and book | /roadmap-thank-you "You're All Set." | Should be Schedule — **today PageView only** (fix 7) | Booked appointment in ClickFunnels |
| 10 | Tap the calendar button | Calendar file | AddToCalendar | — |

ClickFunnels contacts (address not confirmed from repo): https://chrisstanbridgestea3f77f.myclickfunnels.com/account/contacts

## Phone checklist — /watch

Same Test Events link, with `https://apply.fundhub.ai/watch` as the test URL.

| # | Do this | You should see | Meta Test Events | CRM |
|---|---|---|---|---|
| 1 | Open https://apply.fundhub.ai/watch | Headline, video, Get Started, approvals sliding | PageView | nothing |
| 2 | Tap Get Started | /apply "Let's Start With Your Info" | PageView | after contact screen: new client + `entry.captured` |
| 3 | Answer every screen through Available Capital | "You're qualified. Pick a time below." and the calendar | **Lead** | one `survey.submitted` per screen on the client |
| 4 | Pick a slot, enter name/email/phone, press Book/Confirm | Booking confirms in the frame | Should be **Schedule** — **today nothing** (fix 2) | `booking.created`, closer task, `bookings` row, `call:booked` tag, card moved to booked — **unproven today** (fix 6) |
| 5 | Land on /thank-you | "Your Call Is Booked." | PageView; AddToCalendar / OpenInboxConfirm when tapped | — |
| 6 | After the call, closer logs the outcome | — | Should be showed-call event — **today nothing** (fix 3) | outcome row |
| 7 | Client pays for an offer | — | Should be Purchase at that offer's price — **today nothing** (fix 3) | deposit / sale events |

---

## Leftovers seen, not worked

- `marketing/landing-pages/slo/` is not committed in git; the tracked copy `clickfunnels-fragments/slo/` is missing on disk.
- `slo-02-order.html` loads tracking but is not in the push list.
- Step-3 consent says "Fundhub Credit Solutions LLC" (`sales:1098`); stored consent says "Fundhub"; footer says "Fundhub LLC".
- Address warning says "tap Pay again" (`sales:1163`); that button is "Start My Soft Pull".
- SMS/CRM code still defaults to `services.leadconnectorhq.com` (`src/messaging/providers/ghl-relay.mjs:56`, `src/messaging/crm-contacts.mjs:34`) though GoHighLevel was cancelled 2026-08-15.
- The 2026-09-26 replay of the real 2026-09-24 booking is stored as demo with no booking row, which contradicts `ops/workflows/sleep-fears-2026-09-25.md:35`.
- `.env` has no `META_PIXEL_ID`; the pixel comes from a hardcoded fallback (`tracking-manifest.mjs:22`).
