# Marketing numbers: definitions

Spec: `docs/specs/marketing-machine-2026-10-04.md` §11.1. This file starts with the parts M0 step 5 built (migrations 411 and 412): each lead's ad number, each lead's and each ad's offer tag, and each lead's level. The rest of the 11.1 table (spend, CTR, hook rate, booked calls, cash) is added by the M5 numbers step.

Every view below reads tables that force partner row-level security (`ads`, `campaigns`, `ad_scripts`). Run them inside `asStaff()` (`src/partners/rls.mjs`). A bare query sees none of those rows.

## Ad number: `v_client_ad_number`, `v_visitor_ad_number` (411)

One number per lead, from `fundhub_resolve_ad_number(org, utm_content, utm_term)`. The first step that answers wins:

| Step | Rule | `ad_number_source` |
|---|---|---|
| 1 | `utm_content` starts with 1 to 9 digits (`43-ringlights` → 43). The ads the machine loads (10.3). | `utm_content` |
| 2 | `utm_term` is 15 or more digits and equals `ads.external_id` → that ad's `fundhub_ad_number`. The live ads loaded by hand carry Meta's ad id here. | `meta_ad_id` |
| 3 | `utm_content` equals `ads.name` (trimmed, any case) → that ad's `fundhub_ad_number`. | `ad_name` |

- Numbers are integers: `043` and `43` are one ad.
- Steps 2 and 3 answer only when every matching ads row agrees on one number. Otherwise the lead has no number.
- No number → the lead appears on `GET marketing/ad-links`. `POST marketing/ad-links` (Link) sets the number, source `manual`, on every ads row with that Meta id or name.
- `v_client_ad_number`: one row per `client_ad_attribution` row (first touch, one per client).
- `v_visitor_ad_number`: SLO visitors, from the earliest `slo.contact_started` event per email (`events.payload.attribution`). It carries `actor` and `is_demo`; count only `actor = 'person'` and non-demo rows.

`ads.fundhub_ad_number_source` says where an ad's own number came from: `manual` (Link or the link-asset route), `loader` (M4), `utm` (the sync read it from the ad's link `utm_content`), `name` (the sync read "Ad 93" from the ad's name). The sync only fills an empty number.

## Offer tag: `v_ad_offer_tag`, `v_client_offer_tag` (412)

The first step that answers wins:

| Step | Rule | `offer_tag_source` |
|---|---|---|
| 1 | The ad number's live `ad_scripts` row (not archived) has an `offer_key` that is a tag in `marketing_offers` for the org | `script` |
| 2 | `ad_offer_tags` has a row for the ad number (seeded from §17 decision 9) | `ad_offer_tags` |
| 3 | The Meta campaign is in exactly one offer's `meta_campaign_ids` | `campaign` |
| 4 | The landing page path is on exactly one offer's steps (`v_offer_page_tag`) | `landing_page` |

- For an ad (`v_ad_offer_tag`): its `fundhub_ad_number`, its campaign's `external_id`, and `ads.landing_url` (read by the sync from the ad's creative).
- For a lead (`v_client_offer_tag`): its resolved number; its campaigns are the campaign of any ad matching its Meta ad id or number, any campaign whose name equals its `utm_campaign`, and `utm_campaign` itself when it is a Meta campaign id; its page is `client_ad_attribution.landing_path`.
- Paths compare without host, query, fragment or trailing slash, in lower case (`fundhub_url_path`). The home page tags nothing.
- A page on two offers' steps tags nobody. Today `/watch` is on both Direct Book and Blueprint (§17 decision 8).
- A retired offer still tags its old ads.

## Lead level: `v_client_level` (412, §17 decision 10)

Each lead's furthest level. It is the highest level any evidence row proves. Evidence rows are not taken back, so a level never goes down. Demo rows (`is_demo`) never count. The view also returns one true/false column per piece of evidence.

| Level | Rank | Reached when (table and rule) | Column |
|---|---|---|---|
| cold | 0 | A `clients` row exists (lead form, or an email left on a page that made a client) and nothing below is true | |
| engaged | 1 | An `events` row named `survey.submitted` for the client | `survey_answered` |
| engaged | 1 | A `bookings` row with status `booked`, `rescheduled`, `noshow` or `completed`, matched by `client_id`, or (when the booking has no client) by `attendee_email` = the client's email, any case | `call_booked` |
| warm | 2 | A `call_outcomes` row whose `outcome` is not `no_show` | `had_call` |
| pulled | 3 | A `crs_results` row (the soft pull report), or a `soft_pull_requests` row with status `fulfilled` | `soft_pull_on_file` |
| client | 4 | A `transactions` row with status `succeeded`, or an `events` row named `diagnostic.paid` | `paid` |
| funded | 5 | A `funding_rounds` row with status `funded` or `closed` and `funded_amount` > 0 | `funded` |

Notes:
- A refunded payment still counts as paid: the level never goes down.
- Nothing writes `bookings.status = 'completed'` today (§3); it is in the list so it counts when something does.
- The SLO drip keeps its own lanes, and `src/config/lead-temperature.mjs` keeps its own words. This level is for the marketing numbers only.
- SLO visitors who never became clients are not in this view. They are cold by definition.

Tested with fixture data in `src/http/marketing-ad-numbers.pg.test.mjs`.
