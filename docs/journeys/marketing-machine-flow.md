# Marketing machine flow: what the code does

Generated from code, not from the spec. The intended journey is `marketing-machine-intended.md` (agents do not edit it). Each section says which step wrote it. A path that is not built yet is marked `NOT BUILT` or `UNVERIFIED`. Spec: `docs/specs/marketing-machine-2026-10-04.md`.

## M0 step 3: settings, offers, jobs

Migrations `407_marketing_machine_tables.sql` (tables) and `408_marketing_offers_seed.sql` (seeds). Routes `marketing/settings` and `marketing/offers`, role set `ROLE_SETS.MARKETING` (owner, admin).

### Settings

```mermaid
flowchart TD
    A[Owner or admin opens GET marketing/settings] --> B{Row for this org?}
    B -->|No| C[Insert the default row: weekday 1, 07:00, America/Phoenix, 3 a day, 7 days, size rule total, floor 91, enabled false]
    B -->|Yes| D[Read it]
    C --> D
    D --> E[Return the settings. winner_rule and caption_position_y are null until set]
    F[POST marketing/settings with a patch] --> G{Known keys and valid values?}
    G -->|No| H[400 with the field and a plain sentence]
    G -->|Yes| I[Update, stamp updated_by and updated_at]
    I --> E
    J[Anyone else, including csm] --> K[403]
```

- The marketing clock, worker and the 'enabled' switch are NOT BUILT yet (M0 step 4). Nothing reads `marketing_settings` except this endpoint.

### Offers

```mermaid
stateDiagram-v2
    [*] --> draft: POST new tag with a name
    draft --> ready
    ready --> testing
    testing --> live
    live --> retired
    draft --> retired
    ready --> retired
    testing --> retired
    retired --> [*]: row stays, tag is never renamed or reused
```

- Seeded by 408 for the default org as `live`: `direct_book` (book_call, lane sorting), `blueprint` (book_call, lane uwiq) and `slo` (direct_buy, lane uwiq, checkout 14700 cents).
- Any status can be set by POST. The ready check (every card part filled, every page or page request present, a Meta campaign, an avatar) is `NOT BUILT`: the spec puts it in the M1 Offers tab (7.3).
- `paused` is a separate flag. Restarting a paused offer clears it. The machine that skips paused offers is `NOT BUILT` (M1).
- The database refuses to change `tag` or `org_id` on an existing offer.
- Seeded step pages come from `marketing/landing-pages/tracking-manifest.mjs`. Blueprint has only `/watch`; its survey and booking pages are blank because they could not be confirmed.

```mermaid
flowchart TD
    A[POST marketing/offers with a tag] --> B{Tag exists in this org?}
    B -->|No| C[Create it as draft, card_path marketing/offers tag .md]
    B -->|Yes| D[Patch the fields sent]
    C --> E{card_md sent?}
    D --> E
    E -->|No| F[Return the offer]
    E -->|Yes| G[enqueueRepoWrite in the same transaction]
    G -->|Throws| H[Roll back the whole save, 500]
    G -->|Returns| F
    G -.-> I[PENDING HOOKUP: today a stub that queues nothing and answers queued false, pending outbox]
```

### Supporting tables (created, nothing writes them yet)

`marketing_jobs` (queued, running, done, failed), `marketing_requests` (idempotency; used by the two POSTs when a `request_id` is sent), `marketing_buzzes`, `marketing_model_usage`, `ad_offer_tags`, `agent_requests`, `marketing_shoots`.

`ad_offer_tags` is seeded from decision 9 for the default org: ads 84 to 90 to `slo`, the registry's sorting, funding600 and premium ads to `direct_book`, the uwiq ads to `blueprint`. White-label ads 72 to 76 stay untagged. The reader that takes the script's `offer_key` over this table is `fundhub_offer_tag_for_number` (M0 step 5, below).

### Gaps against the intended journey

- The intended journey says Chris pauses or restarts an offer and edits its card in the Command Center. The endpoints exist; the screen is `NOT BUILT`.
- The card save commits to the repo through the outbox in the intended flow. The outbox is `NOT BUILT` on this branch; see the single call site above.

## M0 step 5: Meta version and sync, every lead's ad number, tag views

Migrations `411_ad_numbers_resolver.sql` and `412_offer_tag_views.sql`. Meta Graph version `v26.0` by default in `src/adplatforms/meta.mjs`, `api/campaigns/sync.mjs`, `src/social/adapters.mjs`, `src/social/oauth.mjs` (now reads `META_API_VERSION`) and `src/messaging/providers/meta-capi.mjs`. The Netlify value of `META_API_VERSION` is set on the Mac (not by this step).

### The Meta pull

```mermaid
flowchart TD
    A[netlify/functions/meta-sync-sweeper.mjs, every hour at :17 UTC] --> B{MARKETING_WORKER_SECRET and site URL set?}
    B -->|No| C[Log the reason, answer 200, start nothing]
    B -->|Yes| D{UTC hour is 07?}
    D -->|Yes| E[POST meta-sync-background ?pass=nightly]
    D -->|No| F[POST meta-sync-background ?pass=hourly]
    E --> G{Secret matches?}
    F --> G
    G -->|No| H[404, nothing runs]
    G -->|Yes| I[sweep: every partner with a usable Meta connection, one at a time]
    I --> J[Insights at level=ad: last 3 days hourly, 28 days nightly, with inline_link_clicks]
    J --> K[Campaigns, ad sets, ads with creative url_tags and link]
    K --> L[Upsert ads: landing_url; our number from the link utm_content, else from the name, only while the number is empty]
    L --> M[Upsert ad_metrics_daily per ad per day, link_clicks NULL when Meta did not send it]
```

- The Inngest cron `meta-campaign-sync-sweeper` is no longer registered (it ran inside the 26 s `/api/inngest`). The same `sweep()` runs in the 15-minute background function.
- If Meta refuses the ads list with the creative fields, the plain list is read and the ads still sync, without the link.
- A number with source `manual` or `loader` is never overwritten by the sync.
- The button (`POST campaigns/sync`) still pulls 28 days.

### Every lead's ad number

```mermaid
flowchart TD
    A[client_ad_attribution row, or the first slo.contact_started event for an email] --> B{utm_content starts with 1-9 digits?}
    B -->|Yes| N[That number, source utm_content]
    B -->|No| C{utm_term is 15+ digits and equals ads.external_id?}
    C -->|Yes, all matching ads agree on one number| O[That number, source meta_ad_id]
    C -->|No| D{utm_content equals an ads.name, any case?}
    D -->|Yes, all matching ads agree on one number| P[That number, source ad_name]
    D -->|No, or they disagree| Q[No number: shows on GET marketing/ad-links]
    Q --> R[POST marketing/ad-links: owner or admin sets the number, source manual, on every ad with that Meta id or name]
    R --> C
```

- Views `v_client_ad_number` (leads) and `v_visitor_ad_number` (SLO visitors, one row per email). Numbers compare as integers: 043 = 43.
- `ads_fundhub_number_uq` is replaced by a plain index: one number can run in several ad sets.
- `ads.fundhub_ad_number_source`: `manual` (Link, or the link-asset route), `loader` (M4, `NOT BUILT`), `utm`, `name` (the sync). Existing numbers were backfilled as `manual`.
- `api/read/ad-spine.mjs` (the people pass) and `api/read/ad-attribution.mjs` now read the resolved number. `ad-attribution` also returns `ad_number` and `ad_number_source`.
- These views read `ads`, which forces partner row-level security: callers run them inside `asStaff()`.

### Offer tags and lead level

```mermaid
flowchart TD
    A[An ad, or a lead through its resolved number] --> B{Live script with that number has an offer_key that is a real offer tag?}
    B -->|Yes| T1[Tag, source script]
    B -->|No| C{ad_offer_tags row for that number?}
    C -->|Yes| T2[Tag, source ad_offer_tags]
    C -->|No| D{Its Meta campaign is in exactly one offer's meta_campaign_ids?}
    D -->|Yes| T3[Tag, source campaign]
    D -->|No| E{Its landing page is on exactly one offer's steps?}
    E -->|Yes| T4[Tag, source landing_page]
    E -->|No| T5[Untagged]
```

- `v_ad_offer_tag` (each Meta ad, landing page from `ads.landing_url`), `v_client_offer_tag` (each lead; campaign from the lead's ad, or a campaign named like its `utm_campaign`; page from `landing_path`).
- A page two offers share tags nobody. Today `/watch` is on both Direct Book and Blueprint, so a lead whose only clue is `/watch` is untagged.
- `v_client_level`: cold, engaged, warm, pulled, client, funded. The table behind each level is in `docs/marketing/metrics.md`.

### Gaps against the intended journey

- The Ads tab with the Link button is `NOT BUILT` (lane E). The endpoint is `marketing/ad-links`.
- Nothing reads the tag views yet (the planner, the Offers screen and the numbers are M1, M2 and M5).
- Confirming one live server event in Events Manager after the ship is a Mac step, `UNVERIFIED` here.
