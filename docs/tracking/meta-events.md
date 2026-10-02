# Meta events — what fires today (2026-10-02)

Pixel `2403674420141513` on every funnel page (`marketing/landing-pages/tracking-manifest.mjs:22`). Test Events: https://business.facebook.com/events_manager2/list/pixel/2403674420141513/test_events

**Phase 4 (Conversions API on every page) is stopped.** No Conversions API access token exists in `.env`, Netlify production env (108 names checked) or the database (only the ad-sync login in `ad_platform_connections`). Owner instruction: stop and say so. Token page: https://business.facebook.com/events_manager2/list/pixel/2403674420141513/settings. Note: Meta's own pixel config lists a Conversions API Gateway ("openbridge", AWS us-east-1) — server events may already flow through it; check before building a second sender.

So every event below is **browser only** today. No server copy, so no deduplication yet.

| Page | Event | When | event_id | Source |
|---|---|---|---|---|
| Every funnel page | PageView | Page load | none | funnel head pixel |
| /roadmap | InitiateCheckout (297 USD, once per session) | Pay pressed | none | `public/funnel/fh-attribution.js` |
| /roadmap | PreviewOpened (custom) | "See a sample" opened | — | another session's work, `b26df927` |
| /roadmap | Lead | — | — | **Missing** (Phase 4) |
| /roadmap | Purchase 297 USD | — | — | **Missing** (Phase 4) |
| /apply | Lead | Survey complete (available capital answered) | `lead:<email>` | `marketing/landing-pages/apply-survey.html` |
| /apply | Schedule | Booking accepted in the framed calendar (now fires — 2026-10-02 booking block) | `schedule:<email>:<time>` | `apply-survey.html` + `04e-book-confirm.html` |
| /roadmap-book | Schedule | — | — | **Missing** (Phase 4) |
| /funding-book-call opened directly | Schedule | — | — | **Missing** (Phase 4) |
| /thank-you, /roadmap-thank-you | AddToCalendar, OpenInboxConfirm (custom) | Button taps | none | `05-thank-you.html`, `slo-03-thank-you.html` |
| Sorting-hat offers (6) | Purchase at offer price | — | — | **Missing** (Phase 4) |

Never sent to Meta: card numbers, Social Security number, date of birth, survey answers about income or credit, soft-pull field values.


---

# Phase 4 contract — Meta browser + server events (2026-10-02, building)

Owner ask: server events too, and from mobile (server copies reach Meta even when Safari / in-app browsers block the pixel). Every builder follows this word for word.

## Token and settings
- **Token:** already exists — the Meta connection stored encrypted in `ad_platform_connections` (platform `meta`, system user "Conversions API System User", `ads_management`, can read pixel 2403674420141513). The server reads it the way `api/campaigns/sync.mjs` does (`decryptToken` from `src/adplatforms/tokens.mjs`, staff context via `asStaff` in `src/partners/rls.mjs`), cached per function instance. `META_CAPI_ACCESS_TOKEN` env, if ever set, wins. No agent handles the token by hand.
- `META_PIXEL_ID` env (fallback `2403674420141513`), `META_TEST_EVENT_CODE` env (when set, every server event carries it so it shows in Test Events), `META_API_VERSION` (existing; default `v21.0`).
- Kill switch: `META_CAPI_ENABLED` — server sends only when `"1"` (set at ship).

## One sender
`src/messaging/providers/meta-capi.mjs` (outbound fetch lives only in providers — CLAUDE.md §12):
```js
export async function sendMetaEvents(events, { env = process.env, db, fetchImpl } = {}) // → { ok, sent, error? }
```
Each event: `{ event_name, event_time, event_id, event_source_url, action_source: "website", user_data: { client_ip_address, client_user_agent, fbc, fbp, em: [sha256], ph: [sha256], external_id? }, custom_data? }`. Email and phone are lowercased and trimmed (phone: digits only, US numbers with leading 1) before SHA-256. Never sends card numbers, SSN, date of birth, survey answers about income or credit, soft-pull field values, or raw email/phone.

## Same event_id in browser and server (dedupe)
- Browser-started events: `event_id = "<fh_sid>.<seq>"` — the same `seq` the tracker already sends to our database. The browser calls `fbq('track'|'trackCustom', name, data, { eventID })` and posts the track event (with `meta_event_id`, `fbc`, `fbp`, `url`) to `/api/public/slo-interest`; the server sends the same event to Meta with the same id.
- PageView: the head pixel snippet sets `window.__fhPv = "pv.<fh_sid>.<random>"` and fires `fbq('track','PageView',{}, {eventID: window.__fhPv})`; the tracker's `page_view` carries `meta_event_id = window.__fhPv`.
- Purchase ($297): `event_id = "purchase.<order ref>"` in the browser (checkout:success) AND on the server when the order is marked paid (payment webhook) — Meta counts it once.

## Map (database event → Meta)
| Our event | Meta event | When | custom_data |
|---|---|---|---|
| page_view | PageView | every inventory page | — |
| page_view on /roadmap, /watch, /apply, /home | ViewContent (separate id `<pv>.vc`) | page open | content_name = page |
| continue (buy box step 1) | Lead | step-1 button | content_name "roadmap_buybox" |
| survey_answer on the last question (/apply, /home) | Lead | survey submit | content_name = survey |
| buybox_tab tab 2 (first time per session) | InitiateCheckout | card step shown | value 297, currency USD |
| payment_result success | Purchase | once per order, id `purchase.<ref>` | value 297, currency USD |
| booking_confirmed | Schedule | every booking page | content_name = calendar |
| survey_answer | SurveyStep (custom) | each question answered | survey, step |
| survey_route | SurveyRouted (custom) | sorting hat route | offer |
| video progress 25/50/75/100 | VideoProgress (custom) | each mark | video, pct |
| section_view of the buy box (`fh-cf-form` / `fhw`) | ReachedBuyBox (custom) | once per page load | — |
| softpull_submit | SoftPullSubmitted (custom) | step-3 submit | businesses |

The old `InitiateCheckout` on the Pay press in `fh-attribution.js` and the hand-written `Lead`/`Schedule` calls in `apply-survey.html` are replaced by this map (no double counting).

## fbclid / fbc / fbp
- Stop dropping `fbclid`. The browser keeps it (first touch) and, when the `_fbc` cookie is missing, builds `fbc = "fb.1.<ms>.<fbclid>"`. `fbp` comes from the `_fbp` cookie.
- Every track post, the step-1 contact, the checkout and the soft-pull post carry `fbc` and `fbp`. The server stores them on the order/client so a later server-only Purchase (payment webhook) can send them.
- Server `user_data` also gets `client_ip_address` (`x-nf-client-connection-ip`, else first `x-forwarded-for`) and `client_user_agent`. Email/phone for a session come from that session's `slo.contact_started` row (hashed on the server).
