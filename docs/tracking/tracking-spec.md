# Funnel tracking spec — our database (Phase 3, 2026-10-02)

Owner ask (2026-10-02): track everything on every funnel page to our own database, through the existing funnel event door `POST https://fundhub.ai/api/public/slo-interest`. Page list: `docs/tracking/page-inventory.md`. Meta events are a separate file: `docs/tracking/meta-events.md`.

This file is the contract. The server, the shared browser tracker, and every page hook follow it word for word.

## Never recorded

Card numbers, Social Security number, date of birth, and any soft-pull field value. For a form field we record only its **name** and that it was focused or completed. Survey answers are not copied into tracking events (the survey webhook already stores them on the client record). No typed text of any kind.

## One door, one new kind

```
POST /api/public/slo-interest
{ "kind": "track", "event": "<event>", "seq": <int>, "session_id": "<fh_sid>",
  "page": "/roadmap", "props": { ... },
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "landing_path", "referrer_domain", "webdriver": false }
```

- `session_id` is the existing `sessionStorage.fh_sid` (shared with fh-attribution.js).
- `seq` is a per-session counter kept in `sessionStorage.fh_seq`. Idempotency key is `funnel-track:<session_id>:<seq>`, so a retried send is saved once but a second real click is saved again.
- **The server works out `funnel` and `step` from `page`** using one map (`src/funnel/pages.mjs`). The browser cannot invent them. A page not on the map is refused (`page_invalid`).
- Every stored row's payload carries: `page`, `funnel`, `step`, `session_id`, `seq`, `event`, the event's `props`, `attribution` (UTMs via `pickAttribution`), `landing_path`, `actor`, `actor_reason`.
- Stored as an `events` row named `funnel.<event>` (e.g. `funnel.scroll`). Two names keep their old meaning so today's counts keep working: `page_view` is stored as `funnel.page` (once per session per page, old key `funnel-page:<sid>:<page>`), `click` is stored as `funnel.click`.
- Old kinds `visit`, `contact`, `engage`, `page`, `click` keep working unchanged.
- Cap: 500 track rows per session per day. Over the cap the door answers ok and saves nothing.
- Props are an allow-list per event (below). Unknown keys are dropped. Strings are clipped. Numbers are clamped. A prop key that names a sensitive field value is never accepted.

## Pages → funnel and step

| Page | Funnel | Step |
|---|---|---|
| /watch | watch | 1 |
| /apply | watch | 2 |
| /funding-book-call | watch | 3 |
| /thank-you | watch | 4 |
| /roadmap | roadmap | 1 |
| /roadmap-book | roadmap | 2 |
| /roadmap-thank-you | roadmap | 3 |
| /order | watch | 5 |
| /home | homepage | 1 |

Rows are added from `docs/tracking/page-inventory.md` (Phase 2). Same map in the server and the browser.

`/home` is the fundhub.ai homepage survey page. The browser sends `page: "/home"` when the host is `fundhub.ai` (or `www.fundhub.ai`) and the path is `/`, because `apply.fundhub.ai/` is a different page (an unused ClickFunnels template).

## Events

| Event | When | Props (allow-list) | Who sends it |
|---|---|---|---|
| `page_view` | Page opens, once per session per page | `title` | shared tracker |
| `time_on_page` | Every 15s while visible (one row per 15s mark: 15, 30, 45, 60, 90, 120, 180, 300, 600) | `seconds` | shared tracker |
| `exit` | Tab hidden for good / page closed, once per page load | `seconds`, `max_scroll` | shared tracker |
| `click` | Every button or link press | `element_id`, `label`, `href_path`, `y_px`, `y_pct`, `section`, `nth` | shared tracker |
| `video` | play, pause, unmute, mute, and 25/50/75/100% watched (each % once per video per page load) | `video`, `action` (play/pause/unmute/mute/progress), `pct`, `current_s`, `duration_s` | shared tracker |
| `scroll` | 25/50/75/100% of page depth, each once per page load | `depth` | shared tracker |
| `section_view` | Each section with an `id` (or `data-fh-section`) reaching the screen, once per page load | `section` | shared tracker |
| `carousel` | Testimonial carousel next, previous, play | `carousel`, `action` (next/prev/play), `index` | shared tracker (by `data-fh-carousel` / known classes) or page hook |
| `faq_open` | Each FAQ question opened (`<details>` toggle or FAQ button) | `question` (label slug) | shared tracker |
| `survey_answer` | Each survey question answered | `survey`, `step_num`, `question_id` | survey page hook |
| `survey_route` | Sorting hat routes someone | `survey`, `offer` (offer code) | thank-you / survey hook |
| `buybox_tab` | Each buy box tab shown | `tab` (1/2/3) | /roadmap buy box hook |
| `field_focus` | A buy box / survey / booking field gets focus, once per field per page load | `form`, `field` (name only) | page hook |
| `field_complete` | That field left with a value that passes its check, once per field | `form`, `field` | page hook |
| `continue` | Buy box step 1 Continue pressed | `step` | buy box hook |
| `validation_error` | A field or step check fails | `form`, `field`, `code` (short slug, never the value) | page hook |
| `payment_attempt` | Pay pressed and card form submitted | `amount_cents` | buy box hook |
| `payment_result` | checkout:success or a decline / error | `result` (success/fail), `code` | buy box hook |
| `softpull_submit` | Start My Soft Pull pressed and accepted by the form check | `businesses` (count) | buy box hook |
| `calendar_view` | A booking calendar is on screen | `calendar` | booking hook |
| `time_selected` | A time slot picked | `calendar` | booking hook |
| `booking_confirmed` | Book / Confirm pressed and the booking saved | `calendar` | booking hook |
| `preview_opened` | A "See a sample" preview opened under a /roadmap order summary line | `deliverable` | /roadmap buy box hook |
| `preview_closed` | That preview closed (close press, or tab hidden / page closed while open) | `deliverable`, `open_ms` | /roadmap buy box hook |

## Sample previews (/roadmap, 2026-10-01)

`deliverable` is one of exactly: `how_much_you_qualify_for`, `credit_analysis_report`, `credit_optimization_roadmap`, `dispute_letter_pack`, `bank_lender_match_list`, `business_duplication_map`. Any other value (or none) is refused with `deliverable_invalid` (HTTP 400) and nothing is saved. `open_ms` is whole milliseconds the preview stayed open, clamped 0..600000 (missing = 0).

Each open also fires Meta custom event `PreviewOpened` with `content_name` = the deliverable (`fbq('trackCustom','PreviewOpened',{content_name:d})`, the same pixel and call style the thank-you pages use).

Same `session_id` (`fh_sid`) as the `continue` event, so a visitor's opens and their step-1 press join. View `v_roadmap_preview_continue_daily` (opened vs not-opened Continue rate per day) and `v_roadmap_preview_open_ms_daily` (average `open_ms` per deliverable per day): `db/migrations/405_roadmap_preview_views.sql`. Days are UTC. Only `actor = 'person'` sessions count.

## Browser API

The shared tracker (`public/funnel/fh-events.js`) defines:

```js
window.fhTrack(event, props)   // sends one track event; never throws
```

Page hooks call it safely before or after the tracker has loaded:

```js
(window.fhTrack || function (e, p) { (window.fhq = window.fhq || []).push([e, p]); })("continue", { step: 1 });
```

The tracker drains `window.fhq` when it loads. Inside an iframe the shared tracker stays silent (the parent page counts the step); a framed booking calendar reports through the parent page.

### Framed calendar → parent page

/apply and /roadmap-book show https://apply.fundhub.ai/funding-book-call inside a frame. Code inside the frame never sends to the server itself. It does this:

```js
var msg = { fh: "track", event: "time_selected", props: { calendar: "funding-book-call" } };
if (window.self !== window.top) window.parent.postMessage(msg, "https://apply.fundhub.ai");
else (window.fhTrack || function (e, p) { (window.fhq = window.fhq || []).push([e, p]); })(msg.event, msg.props);
```

The shared tracker on the parent page listens for `message` events from origin `https://apply.fundhub.ai` with `data.fh === "track"`, accepts only `calendar_view`, `time_selected`, `booking_confirmed`, and calls `fhTrack` with them. Opened directly (not framed), the same page sends its own events.

### Booking confirmed — the one signal

`booking_confirmed` (and Meta Schedule later) fire only when ClickFunnels has **accepted** the booking — never on the Book press alone (a Book press with a bad phone is refused by ClickFunnels). The /funding-book-call footer block stamps `fh_booking_v1.submittedAt` at that same moment, so the existing listeners on /apply and /roadmap-book keep working.

## Clarity

`public/js/clarity.js` (project `tscu15s674`) loads on every page in the inventory. The shared tracker also sends `click` labels to Clarity as custom events, as today.
