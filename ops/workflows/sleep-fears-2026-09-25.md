# Sleep fears — 2026-09-25

Shared board for overnight fear lanes. Counts only. No emails, phones, or names.

## Leads

**Path traced:** `apply.fundhub.ai/roadmap` → widget `startCheckout` POSTs `utm_*` (from `fh_attribution` / URL) → `POST /api/public/slo-checkout` → `pickAttribution` → `client_ad_attribution` (+ `custom_fields` copy when the checkout creates the client).

**Tracker:** existing `client_ad_attribution` (migration 286). No new tracker.

**Counts (purpose=`diagnostic`, last 14 days, exclude demo / prove / sandbox / do-not-pay):**

| | links | with `utm_content` / ad id | missing ad tag |
|---|---:|---:|---:|
| Realish checkouts | 16 | 5 | 11 |
| Of missing: existing email at checkout | | | 8 (no attribution row — tags were skipped on purpose) |
| Of missing: new client at checkout | | | 3 (POST had no `utm_*`; page path works when tags are sent) |

**Last 7 days realish:** 2 links, 0 with ad id.

**Drop found:** checkout wrote ad tags only when it *created* the client. An existing email kept the order row and dropped the page’s `utm_*`.

**Fix (2026-09-25):** `api/public/slo-checkout.mjs` always upserts `client_ad_attribution` when the POST includes attribution (first-touch COALESCE). Still no name / phone / account / businesses on an existing email.

**Not a page bug:** live `/roadmap` already merges attribution into the checkout body. Sep 22 demos with `utm_content` proved storage when tags are sent.

## Booking

**Where the closer sees it:** CRM Calendar (`/app/calendar.html`) and Closer Dashboard / Call cockpit **Up next** — both read open `tasks` with title `Strategy session booked` and `assignee_role=closer`. A matching `bookings` row is written beside that.

**Live prove (no new real slot booked):** ClickFunnels had a real `appointments/scheduled_event.created` on 2026-09-23 (Meeting with Chris, start 2026-09-24 18:30 UTC). Fundhub had **no** booking row, **no** closer task, and **no** `booking.created` event for it. Last CRM booking.created before the fix was 2026-09-19 (sim/probe only). Closer and booking rows that *did* land always matched 1:1 when the webhook was accepted.

**Break:** `CLICKFUNNELS_WEBHOOK_SECRET` on Netlify / local did not match the ClickFunnels “Fundhub platform” endpoint signing secret (CF last4 was `4f97`; stored secret last4 was not). Live POSTs to `https://fundhub.ai/api/webhooks/clickfunnels` returned `401 bad_signature`, so the closer never got the task.

**Fix (2026-09-25):** Created a new CF outgoing webhook endpoint (same URL + appointment/contact/form events), set `CLICKFUNNELS_WEBHOOK_SECRET` on Netlify + local `.env` to that create-time secret (last4 `c2f0`), deleted the old mismatched endpoint. Replayed the missed 2026-09-23 appointment into CRM: closer task + booking row now present. Redeploy required so production functions load the new secret.

## Affiliates

**OK with a leftover.** Sign-up page and click recorder were already live. The break was referral attach.

**Counts (live DB, no PII):**
- affiliates active: 19
- accounts with affiliate id: 12
- affiliate link clicks: 11 (9 matched a real code)
- affiliate_referrals: 1 (converted, commission_due null, no sale, no rule)
- clients with affiliate_tier1_owner set: 0
- entry.captured with a1 key: 687; with a1 nonempty: **0**

**Break:** apply funnel `fh-attribution.js` stamped UTMs only. Share links put `?a1=` / `?ref=` on `/watch`, but the form never kept the code, so ClickFunnels webhooks wrote `a1: null` and AF-02 never wrote ownership or `affiliate_referrals`.

**Fix (2026-09-25):** `public/funnel/fh-attribution.js` (+ synced `06-utm-hidden-fields.html`) now first-touch captures a1/a2 (ref/code → a1) and stamps hidden fields. Adapter also reads a1 from formData, custom attributes, and visit landing URL. UTM key list untouched.

**Still broken / unproved:**
- No new live referred purchase proved overnight (no card charge).
- $297 Live Trial fee is owner-set 100% Fundhub (no affiliate cut on that product code). Funding (`card-stacking-dfy`) and repair (`repair-bundle`) are the commission products.
- The one existing converted referral still has null commission (no rule / no sale on that row).
- ClickFunnels workspace still needs contact custom attributes named `a1` and `a2` for the cleanest webhook shape; formData + visit URL paths cover the miss without that.

## Portal

**Fear:** Someone pays $297 and cannot get into the portal.

**Trace:** `/roadmap` till creates a client portal account only when checkout creates a **new** client. An email that already belongs to a CRM client records the order only (no account write — “an email is not a login”). The pull form also calls `ensureSloAccount`. Payment itself did not open the login for that existing-client gap.

**Count (live DB, counts only, no PII):**
- Paid diagnostic `$297+` payment_links (all-time unique buyers): **6**
- With a client portal account: **6**
- Missing a portal account: **0**

**Fix shipped (commit `f0eff646`):** When a `$297` SLO payment clears, open the same invited client account the product already uses (`ensureSloAccount` / `ensureSloPortalForPaidClient`):
- Commas: `payment.received` → paid `slo_*` payment_links row → portal account
- ClickFunnels SLO paid webhook: after sale write → portal account (not behind the post-purchase chase flag)

**Portal URL:** https://fundhub.ai/portal-login.html

**Backfill:** none needed (0 missing).

**Ship note:** local commit is on `main`. `npm run ship` failed repeatedly on Netlify (`zip: not a valid zip file` on function upload). Code is not proven live until a later ship succeeds.

