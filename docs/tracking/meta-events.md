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
