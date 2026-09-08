# Lane E — Data model and plumbing

**Batch:** `marketing-e2e` · **Phase 1, spec only** · Written 2026-09-08.
First draft was read against `main` at `fe864840`. **Re-checked and corrected against `main`
at `4368e9b1`**, which is where `main` sits as this correction is written.
Read-only pass. No application code was changed. This file is the only file created.

**Merge status, confirmed once and dropped:** PR #357 is merged and is an ancestor of `main`
(`git merge-base --is-ancestor fe864840 HEAD` succeeds). It is **not** the tip any more.
Four merges landed on top of it: `41369890`, `19e1bcf9`, `5c1bb8da`, `4368e9b1`
(`git log --oneline -6`). Nothing in this lane is waiting on #357.

> **WARNING TO EVERY LANE — `main` is moving under us.**
> Between the first draft and this correction, six new schema files landed. That broke the
> file numbers this document had handed out. **Re-run `ls db/migrations | tail -14` before
> you create any migration file.** Do not trust a number written down here more than a
> number you just looked at.

---

## What Chris gets when this is done

You will be able to ask one question and get one answer: **"ad number 43 cost me this much,
and brought me these people."** Right now the computer cannot answer that. It stores the
money on one side and the people on the other, and there is no piece of string tying the two
together. This lane finds the missing string and says exactly where each piece goes. It also
lists the storage shelves that were built and never filled — including the one the ad-making
tool needs before it can make anything at all.

---

## What exists today

### The tables that already exist

Every one confirmed by reading the file that creates it.

| Table | Created in | What it holds, in plain words | Who can read it | Does anything write to it today? |
|---|---|---|---|---|
| `ad_platform_connections` | `db/migrations/046_ad_platforms.sql:45` | The login link to a Meta / TikTok / Google ad account. The password is scrambled. | Partner sees only their own rows; staff see all (`046:727-737`) | **Yes** — `api/campaigns/meta-agency.mjs:152`, `api/campaigns/sync.mjs:267` |
| `ad_platform_category_map` | `db/migrations/046_ad_platforms.sql:119` | A lookup list Meta demands: "this kind of offer belongs in that category." | Not in the RLS loop at `046:727-737` | **NO WRITER. And it is empty on purpose** (`046:108-117`) |
| `campaigns` | `db/migrations/046_ad_platforms.sql:155` | One row per ad campaign, copied down from Meta. | Partner-scoped (`046:727-737`) | **Yes** — `api/campaigns/sync.mjs:73`, `api/campaigns/write.mjs:106` |
| `ad_sets` | `db/migrations/046_ad_platforms.sql:247` | One row per ad set (the budget group inside a campaign). | Partner-scoped | **Yes** — `api/campaigns/sync.mjs:102`, `src/optimize/run.mjs:112` |
| `ads` | `db/migrations/046_ad_platforms.sql:282` | One row per individual ad running on the platform. Has `asset_id` pointing at the picture or video (`046:291`). | Partner-scoped | **Yes** — `api/campaigns/sync.mjs:125` |
| `ad_metrics_daily` | `db/migrations/046_ad_platforms.sql:432` | Money spent and results, one row per ad per day. | Partner-scoped | **Yes** — `api/campaigns/sync.mjs:140` |
| `client_ad_attribution` | `db/migrations/286_client_ad_attribution.sql:95` | Which ad brought each person in. The ad **number** is worked out by the database itself (`286:110`). | On, permissive (`286:127`, `286:136`); the org split is done in the app | **Yes** — `src/ads/store.mjs:22`; imported at `src/handlers/client-lifecycle.mjs:17` and actually called at `src/handlers/client-lifecycle.mjs:273` |
| `creative_assets` | `db/migrations/045_creative_factory.sql:163` | Every picture, video, or block of ad words the factory made. `copy_text` added by `301`. | Partner-scoped (policy built at `045:59-72`) | **Yes** — `src/creative/generate.mjs:217` |
| `brand_kits` | `db/migrations/045_creative_factory.sql:86` | A partner's colours, fonts, voice, products. | Partner-scoped | **NO WRITER outside tests.** `api/creative/brand-kits.mjs:20-34` only reads |
| `brand_kit_sources` | `db/migrations/045_creative_factory.sql:128` | The raw web page a brand kit was scraped from. | Partner-scoped | **NO WRITER outside tests.** The only `INSERT` in the repo is a test fixture at `src/compliance/invariants.pg.test.mjs:269` |
| `creative_providers` | `db/migrations/048_campaign_config.sql:40` | Which outside company makes the pictures/videos/words. | Org-level | **NO WRITER, and no seed row.** `src/creative/providers/index.mjs:56` sees an empty result and throws at `:57-60` |
| `campaign_strategies` | `db/migrations/048_campaign_config.sql:90` | The six named ad plans (Forester, Venus Fly Trap, etc.) as settings. | Org-level | Filled by the migration itself — one `INSERT` starting at `048:127` and ending at `048:157`. No app writer, which is correct: it is config |
| `creative_billing_rates` | `db/migrations/050_creative_metering.sql:44` | What to charge a partner for generation and for managed spend. | Org-level | Rows are seeded at `050:62-73` with the price set to `NULL` **on purpose**. No app writer |
| `creative_usage_events` | `db/migrations/050_creative_metering.sql:79` | The running bill: each generation and each slice of spend. | Partner-scoped | **NO WRITER.** Nothing ever charges anything |
| `ad_watch_advertisers` | `db/migrations/278_ad_intelligence.sql:64` | The list of rival advertisers being watched. | Staff write, any signed-in partner may read (`278:316-334`) | **Read side is live. Write side is not.** See "The rival-ad watcher" below |
| `ad_library_records` | `db/migrations/278_ad_intelligence.sql:101` | Every rival ad spotted, one row per sighting. | Same as above | Same as above |
| `ad_creatives_seen` | `db/migrations/278_ad_intelligence.sql:158` | The same rival ad, counted once instead of a thousand times. | Same as above | Same as above |
| `ad_creative_classification` | `db/migrations/278_ad_intelligence.sql:197` | What angle a rival ad uses, decided by a model. | Same as above | Same as above |
| `ad_creative_signals` | `db/migrations/278_ad_intelligence.sql:248` | Weekly scores: which rival angle is heating up. | Same as above | Same as above |
| `org_brand` | `db/migrations/128_org_brand.sql:50` | FundHub's own logo, colours, fonts. | Org-level | **Yes** — `api/org-brand.mjs:240` |
| `partner_brand` | `db/migrations/043_partner_brand.sql:34` | A partner's logo, colours, fonts, voice. | Partner-scoped | **Yes** — `api/partner-brand.mjs:250`, `src/trials/provision.mjs:248` |
| `content_videos` | `db/migrations/171_content.sql:18` | Welcome videos staff upload for the client portal. Not marketing videos. | Org-level | **Yes** — `api/content/upload.mjs:112` |
| `analytics_connections` | `db/migrations/302_analytics_connections.sql:43` | The login link to ClickFunnels and to YouTube. Password scrambled. Staff only. | Staff only (`302:158-171`) | **Yes** — `api/analytics/clickfunnels-connect.mjs:82`, `api/analytics/youtube-connect.mjs:119` |
| `funnel_page_stats` | `db/migrations/302_analytics_connections.sql:99` | Views and conversions for one ClickFunnels page, one row per day. | Staff only | **Yes** — `api/analytics/clickfunnels-sync.mjs:91` |
| `video_watch_stats` | `db/migrations/302_analytics_connections.sql:130` | Views and watch time for one YouTube video, one row per day. | Staff only | **Yes** — `api/analytics/youtube-sync.mjs:137` |

**Ruled OUT of this lane, on purpose:** `mail_campaigns`
(`db/migrations/065_mail_campaigns.sql:113`). The shared brief lists it as a marketing table
(`docs/workflows/marketing-e2e.md:204`). It is direct **postal** mail, not paid ads, and
`CLAUDE.md` §12's last bullet records that `src/mail/` deliberately sends nothing. It has no
part in joining ad spend to clients, so this lane does not touch it. Naming it here so a
reader can tell it was excluded rather than missed.

**The empty shelves.** `ad_platform_category_map`, `brand_kits`, `brand_kit_sources`,
`creative_providers`, `creative_usage_events`, and the five `278_ad_intelligence.sql` tables.
Each is a finding and each is ranked below.

### The rival-ad watcher — half wired, and it is the read half

This was wrong in the first draft, so it is spelled out. There are two halves.

- **The read half is finished, routed, and tested.** `api/adintel/board.mjs` imports the
  folder's reader modules at `api/adintel/board.mjs:56-57`. It is imported into the router at
  `netlify/functions/api.mjs:199` and routed at `netlify/functions/api.mjs:759`. It has a
  real test at `src/http/adintel-board.pg.test.mjs`. Its queries read all five tables —
  `ad_creative_signals`, `ad_creatives_seen`, `ad_creative_classification` and
  `ad_watch_advertisers` at `src/creative-intel/board.mjs:127-135`, and
  `ad_library_records` at `src/creative-intel/board.mjs:154`.
- **The write half is not wired at all.** Nothing outside the folder imports
  `ingest.mjs`, `classify.mjs` or `weekly.mjs`. The only importer of any of those three is a
  test: `src/http/adintel-board.pg.test.mjs:26-28`. The writers themselves exist —
  `src/creative-intel/ingest.mjs:128`, `:165`, `:214`,
  `src/creative-intel/classify.mjs:303`, `src/creative-intel/weekly.mjs:219`.
  `src/creative-intel/job.mjs:1-14` says out loud that putting it on a schedule was left
  undone on purpose.

**In plain words:** this is not a shelf nobody looks at. It is a **finished screen that will
show nothing, forever**, until one import and one cron line are added. Different problem,
different urgency.

### How the passwords are kept safe

One file does all of it: **`src/adplatforms/tokens.mjs`**.

- It scrambles with AES-256-GCM (`src/adplatforms/tokens.mjs:27`). That is a standard
  lock that also detects tampering — a changed lock-box fails to open instead of
  opening to nonsense.
- The key comes from an environment setting called `AD_TOKEN_ENC_KEY`
  (`src/adplatforms/tokens.mjs:34`). If it is not set the code **refuses to save**
  rather than saving in plain text (`tokens.mjs:38-40`).
- Each lock-box is tied to one owner id. A box copied into somebody else's row will
  not open (`tokens.mjs:13-19`).
- For the ClickFunnels and YouTube rows, the owner id used is the **org id**, not a
  partner id. That is deliberate and written down at
  `db/migrations/302_analytics_connections.sql:29-34`.
- Where it is used: `api/analytics/clickfunnels-connect.mjs:66` and
  `api/analytics/youtube-connect.mjs:91` lock it; `src/analytics/clickfunnels.mjs:87`
  and `src/analytics/youtube.mjs:96` unlock it.
- The whole credential is stored as **one scrambled blob**, not separate columns
  (`302:23-27`), because ClickFunnels needs a key plus a subdomain and YouTube needs
  three different values.

### The settings this lane depends on (environment variables)

An "environment variable" is a named setting stored outside the code, on Netlify.

| Name | What it is for | Is it set? |
|---|---|---|
| `AD_TOKEN_ENC_KEY` | The master key that scrambles every stored ad-platform and analytics password. Nothing saves without it (`src/adplatforms/tokens.mjs:34-40`). `README.md:205-206` calls it required. | A session log from 2026-08-24 records it as **set** (`docs/workflows/ads-affiliate-stack-2026-08-24.md:45`). **Not re-verified this session** — see UNKNOWN #12. |
| `META_API_VERSION` | Which version of Meta's system to talk to. Falls back to `v21.0` if unset (`src/adplatforms/meta.mjs:28`). | Optional. Has a working default. |
| `TIKTOK_API_VERSION` | Same idea for TikTok. Falls back to `v1.3` (`src/adplatforms/tiktok.mjs:24`). | Optional. Has a working default. |
| `META_BUSINESS_ID`, `META_AD_ACCOUNT_ID` | Chris's Meta business and ad account. | Same 2026-08-24 log records both **set** (`docs/workflows/ads-affiliate-stack-2026-08-24.md:46-47`). Not re-verified. |
| Google Ads / YouTube settings | The YouTube pull. | Same log line 45 records them **all unset**, and says no Google Ads adapter exists yet. |
| **ClickFunnels key, YouTube OAuth, Clarity project ID** | The three things blocked on Chris. | **These are NOT environment variables.** See the next paragraph — it matters, because Chris cannot go set a variable that does not exist. |

**Important and easy to get wrong.** The ClickFunnels and YouTube credentials are **not**
environment variables at all. They are typed into a screen and saved into the
`analytics_connections` table as a scrambled blob (`api/analytics/clickfunnels-connect.mjs:82`,
`api/analytics/youtube-connect.mjs:119`, table at `302:43`). So there is no variable name to
give Chris — there is a form to fill in. The Clarity project ID is not a variable either; it
is one line of text pasted into a file (`public/js/clarity.js:27`).

**Not verified this session:** the exact contents of `.env.example`. Reading it was refused by
the permission settings in this session (`File is in a directory that is denied by your
permission settings`). Everything in the table above is read from source files and from a
committed session log, never from `.env.example`. Logged as UNKNOWN #12.

### Routes: the marketing handlers, and whether the site can reach them

`netlify/functions/api.mjs` keeps a hand-typed list called `ROUTES`, exported at
**`netlify/functions/api.mjs:277`**. A handler file that is missing from that list
returns "page not found" both locally and live.

**Every marketing handler under `api/` is in the list. None is a 404.** Every line below was
opened and read.

| Handler file | In `ROUTES`? | Line |
|---|---|---|
| `api/analytics/clickfunnels-connect.mjs` | yes | `netlify/functions/api.mjs:584` |
| `api/analytics/clickfunnels-sync.mjs` | yes | `:585` |
| `api/analytics/youtube-connect.mjs` | yes | `:586` |
| `api/analytics/youtube-sync.mjs` | yes | `:587` |
| `api/read/ad-attribution.mjs` | yes | `:580` |
| `api/read/ad-books.mjs` | yes | `:581` |
| **`api/read/funnel-pages.mjs`** | yes | **`:582`** |
| `api/read/video-stats.mjs` | yes | `:583` |
| `api/campaigns/list.mjs` | yes | `:645` |
| `api/campaigns/detail.mjs` | yes | `:646` |
| `api/campaigns/spend.mjs` | yes | `:647` |
| `api/campaigns/fatigue.mjs` | yes | `:648` |
| `api/campaigns/connections.mjs` | yes | `:649` |
| `api/campaigns/action-log.mjs` | yes | `:650` |
| `api/campaigns/sync.mjs` | yes | `:651` |
| `api/campaigns/write.mjs` | yes | `:652` |
| `api/campaigns/meta-agency.mjs` | yes | `:653` |
| `api/creative/generate.mjs` | yes | `:747` |
| `api/creative/library.mjs` | yes | `:748` |
| `api/creative/brand-kits.mjs` | yes | `:749` |
| `api/creative/jobs.mjs` | yes | `:750` |
| `api/creative/approvals.mjs` | yes | `:751` |
| `api/creative/actions.mjs` | yes | `:752` |
| `api/creative/run.mjs` | yes | `:753` |
| **`api/adintel/board.mjs`** | yes | **`:759`** |
| `api/brand/review.mjs` | yes | `:661` |
| `api/partner-marketing/enable.mjs` | yes | `:676` |
| `api/partner-marketing/usage.mjs` | yes | `:677` |
| `api/partner-marketing/generate-copy.mjs` | yes | `:678` |
| `api/partner-marketing/copy-history.mjs` | yes | `:679` |
| `api/partner-marketing/generate-logo.mjs` | yes | `:680` |
| `api/content/tiles.mjs` | yes | `:762` |
| `api/content/upload.mjs` | yes | `:763` |
| `api/content/welcome-video.mjs` | yes | `:770` |

*(The first draft of this table missed `read/funnel-pages` and `adintel/board`. Both are
added above and both were re-opened to confirm. `read/funnel-pages` matters most to this
lane: it is the screen that would show the ad number once `funnel_page_stats` gets one.)*

A test guards this. The check is at `src/http/routes.test.mjs:99-113`: it collects every
handler file under `api/` that is not in `ROUTES` and fails if the list is not empty. The
excuse list, `ALLOWED_UNROUTED`, is at `src/http/routes.test.mjs:71-82` and holds exactly
three entries, all of them the shelved decline-autopsy pages. **No marketing entries.**

### The SECOND hand-typed list nobody warns you about

There are **two** lists, not one. Missing either one fails the test suite.

`src/pulse/registry.mjs` is a second hand-typed roll-call of every endpoint, used by the
7 a.m. health ping. Its own header says "Add a row in the same change as the feature"
(`src/pulse/registry.mjs:1-4`). The list of endpoint names, `API_KEYS`, runs from
`src/pulse/registry.mjs:26` to `:292`. Marketing is already in it —
`adintel/board` at `:27`, the `campaigns/*` block at `:55-62`, the `creative/*` block at
`:83-89`, `read/ad-attribution` `:192`, `read/ad-books` `:193`, `read/funnel-pages` `:233`,
`read/video-stats` `:265`. Endpoints that must NOT be pinged live in `ALLOWED_UNMONITORED`
at `:6-24`, each with a written reason — the four `analytics/*` endpoints are there
(`:19-22`) because a ping would burn a real ClickFunnels or Google API call.

The guard is `src/pulse/registry.test.mjs:40-52`. It fails if any routed handler is in
neither list.

**So the rule for Lanes A, B, C and D is:** every new endpoint gets a row in
`netlify/functions/api.mjs` `ROUTES` **and** a row in `src/pulse/registry.mjs`. Two files,
same change, or the tests go red.

### The migration manifest

`db/expected-migrations.mjs` is a generated list of every schema file this build of the
code expects the live database to have already run (`db/expected-migrations.mjs:1-8`).
`src/http/health.mjs:60` imports it and compares it against reality, so `/api/health` can say
the database is behind.

**It is current, but the first draft read only part of it.** Corrected, on `main` today:

- The whole file is **290 lines**.
- The `migrations/` block ends at **`db/expected-migrations.mjs:262`**, which is
  `"migrations/376_checkout_expiry_and_escalation_fk.sql"`.
- `db/expected-migrations.mjs:256` is `"migrations/366_creditor_bureau_map.sql"` — the last
  of the old run, not the last line of the file and not the highest migration.
- Lines `:257-262` are `migrations/371` through `migrations/376`.
- After that the file continues with `seed/` files and ends at
  `"seed/295_sms_copy_2026_09.sql"` (`db/expected-migrations.mjs:287`).

It is regenerated with `npm run migrations:manifest` (`package.json:13`).

---

## What is missing

Ranked worst first.

**1. Chris's own ads cannot be stored anywhere in the campaign tables at all.**
This was ranked fourth in the first draft and scoped to one table. Both were wrong. Every
table in the campaign stack demands a partner, and Chris's own ads belong to no partner:

- `ad_platform_connections.partner_id` — `NOT NULL` (`db/migrations/046_ad_platforms.sql:48`)
- `campaigns.partner_id` — `NOT NULL` (`046:158`)
- `ad_sets.partner_id` — `NOT NULL` (`046:250`)
- `ads.partner_id` — `NOT NULL` (`046:285`)
- `ad_metrics_daily.partner_id` — `NOT NULL` (`046:435`)
- `creative_assets.partner_id` — `NOT NULL` (`db/migrations/045_creative_factory.sql:166`)

And it is enforced twice over. A guard defined at `db/migrations/046_ad_platforms.sql:329`
refuses a campaign whose connection belongs to a different partner (the refusal itself is at
`046:337-340`). A second guard defined at `046:367` forces every ad set and ad to match its
parent's partner, and is attached to `ads` at `046:389`. So you cannot slip a house ad in
through a child row.

`docs/ads/CONTROLS.md:13-14` names five filmed, running ads — `Ad_1_Denial`,
`Ad_2_Broker_Burn`, `Ad_3_Competitor`, `Ad_4_Blind_Application`, `VSL_Script_DirectROAS_v1`.

**Is there already a "house" partner row those could hang off?** Not answerable from the
files. Searching every migration for `is_house` or `house_partner` returns **zero matches**,
so no such flag is built into the schema. Whether an ordinary `partners` row exists that
Chris uses for his own ads needs a live database read, which this session cannot do. Logged
as UNKNOWN #10. **This is a blocker on Definition of Done items 1, 2 and 8, not just 8.**

**2. There is no way to join an ad's cost to the people it brought in.**
This breaks the one number Chris actually wants. Full detail in "The links that are missing".

**3. The ad-making tool cannot make anything.** `creative_providers` has no rows and
nothing writes to it. `src/creative/providers/index.mjs:56` checks for a row and finds none;
`:57-60` throws "no active provider configured" the moment anyone presses Generate.
Confirmed by search: there is **no `INSERT INTO creative_providers` in any migration or seed
file** — the only one in the repo is a test fixture at `src/creative/generate.pg.test.mjs:50`.
Migration `048`'s own comment says the empty table is on purpose until somebody picks a
vendor (`db/migrations/048_campaign_config.sql:33-38`).

**4. Nothing can create a brand kit.** No **product** code writes `brand_kits` or
`brand_kit_sources`. The only `INSERT` anywhere in the repo is a test fixture at
`src/compliance/invariants.pg.test.mjs:269`. Everything else is a read:
`api/creative/brand-kits.mjs:29`, `api/creative/library.mjs:50`, `src/partners/rls.mjs:87`,
plus name-only mentions in a scope list at `src/partners/scope.mjs:139`. The Creative Factory
screen will always show an empty list.

**5. Nothing ever charges anybody.** `creative_usage_events` has no writer, and both
prices in `creative_billing_rates` are seeded as blank on purpose
(`db/migrations/050_creative_metering.sql:62-73`).

**6. Meta campaigns are blocked at the database.** `ad_platform_category_map` is empty,
so `meta_category_for()` returns nothing. Two things then refuse the row: the guard raises an
error at `db/migrations/046_ad_platforms.sql:351-353`, and the check constraint at
`046:229-232` rejects it as well. The migration says this is the intended failure until a
human fills the table (`046:108-117`).

**7. The rival-ad watcher's write half is not wired.** The read screen is finished and
routed. Nothing ever fills the tables behind it. Detail above.

**8. There is no table for ad scripts at all.** No migration under `db/migrations/`
creates one. Scripts live as markdown under `docs/ads/` and the ad registry is a flat
file, `docs/ads/registry.json`, loaded by `src/ads/registry.mjs:22`.

**9. There is no table for the second-by-second drop-off curve of a video.**
`video_watch_stats` (`302:130`) has daily numbers and no place for a curve.

**10. Eight marketing endpoints have no test that runs.** Listed under "Test placement".

---

## The data model

### What already works, in plain words

- A person fills in the ClickFunnels form. The web address they clicked carries five
  tags. `src/handlers/client-lifecycle.mjs:273` hands them to `src/ads/store.mjs:22`,
  which saves one row per person in `client_ad_attribution`. (The import that makes that
  call possible is at `src/handlers/client-lifecycle.mjs:17`.)
- The database then works out three things by itself and stores them as real columns:
  the **lane**, the **ad number**, and the **variant** (`286:109-111`). The app never
  types them, so the app can never disagree with them.
- The ad number is just the leading digits of `utm_content`
  (`286:81-84`). `43` works. `43-ringlights` works and the name is thrown away. A
  name is never needed.

### The exact shape the ad number must have — this is not optional

The people side already has a strict shape and the ad side must copy it exactly, or the two
sides will never match and **nothing will error** — the answer will just come back empty.

- `client_ad_attribution.ad_id` is worked out by `fundhub_ad_id()`
  (`db/migrations/286_client_ad_attribution.sql:81-86`). It takes the text, trims the spaces
  off both ends, and keeps only a run of 1 to 9 digits, optionally followed by `-slug` or
  `_slug`. Anything else becomes nothing at all, never a guess.
- It is then locked down by a check constraint at
  `db/migrations/286_client_ad_attribution.sql:116-117`:
  `CHECK (ad_id IS NULL OR ad_id ~ '^[0-9]{1,9}$')`. Digits only. Between one and nine of
  them. Nothing else can ever be stored.

**So the new `ads.fundhub_ad_number` column must carry the same constraint.** Written out:

```
fundhub_ad_number text,
CONSTRAINT ads_fundhub_ad_number_ck
  CHECK (fundhub_ad_number IS NULL OR fundhub_ad_number ~ '^[0-9]{1,9}$')
```

In plain words: without this, somebody types `043` or ` 43` or `43-ringlights` on the ad
side, the join silently matches nothing, and the screen shows a confident zero. The same
constraint goes on `creative_assets.fundhub_ad_number` and
`funnel_page_stats.fundhub_ad_number`.

### The columns that need to be added

Each is a new column on an existing table. Every one goes in a **new** migration file —
editing an already-applied file does nothing at all (`CLAUDE.md` §12).

| Add this column | To this table | Plain meaning |
|---|---|---|
| `fundhub_ad_number text` + the digits-only check above | `ads` (`046:282`) | The number Chris puts in the ad's link. This is the single missing piece that ties spend to people. |
| `fundhub_ad_number text` + the same check | `creative_assets` (`045:163`) | Which ad number this picture/video/script ended up being used as. |
| `script_id uuid` | `creative_assets` | Which written script this video was cut from. Needs the script table below to exist first. |
| `youtube_video_id text` | `creative_assets` | Ties a video we made to the YouTube video it was uploaded as. |
| `fundhub_ad_number text` + the same check | `funnel_page_stats` (`302:99`) | Which ad sent traffic to this page. Read back by `api/read/funnel-pages.mjs:33-38`. |

### The tables that need to be created

| New table | Plain meaning |
|---|---|
| `ad_scripts` | One row per written ad script. The words, the lane, the ad number once it gets one, who/what wrote it, and which rules version it was checked against. Today this only exists as markdown files. |
| `ad_script_checks` | One row per run of the style checker (`scripts/ads/check-script.mjs`), so a pass is a stored fact and not a claim. |
| `video_retention_curve` | One row per video per point along the video: how many people were still watching at 5%, 10%, 15%… This is what tells you people quit at 0:42. |

**Who owns the shape of these two tables is UNKNOWN.** The first draft asserted that Lane B
owns `ad_scripts` and Lane C owns `video_retention_curve`. There is no anchor for that
anywhere. What the shared brief actually says is narrower: it names Lane C as the owner of
the video work at `docs/workflows/marketing-e2e.md:217` ("Migration 302 in detail — this is
the heart of Lane C") and again at `:248` ("Lane C owns proving this and specifying"). It
says nothing about who owns `ad_scripts`. So: **`video_retention_curve` → Lane C, anchored.
`ad_scripts` → owner not written down anywhere; whoever takes it should claim it on the
shared board first.** This lane only reserves the file numbers and states that neither table
exists today.

---

## Who is allowed to see the answer — the tenancy problem

This is the hardest part of the headline query and the first draft did not mention it at all.

The two sides of the join live under **different security rules**.

- **The people side** — `client_ad_attribution` — is keyed on `org_id`
  (`db/migrations/286_client_ad_attribution.sql:97`). Row security is switched on
  (`286:127`) but the policy lets everything through (`286:136-137`,
  `USING (true) WITH CHECK (true)`). The split between organisations is done by the app
  writing `WHERE org_id = ...`, not by the database.
- **The money side** — `ads`, `ad_metrics_daily`, `campaigns`, `ad_sets`,
  `ad_platform_connections` — is keyed on `partner_id`, and the database itself enforces it.
  The loop at `db/migrations/046_ad_platforms.sql:727-737` runs
  `fundhub_apply_partner_rls()` over all of them. That function is defined at
  `db/migrations/045_creative_factory.sql:59-72` and its rule is:
  `USING (partner_id = fundhub_current_partner() OR fundhub_is_staff())`.

**What that means in plain words.** If the query runs as a partner, the database will hand
back only that partner's ad rows — and Chris's house ads, which belong to no partner, would
not be among them. If it runs as staff, all ad rows come back and the app must add the
`org_id` filter itself on the people side or it will mix organisations together.

**The rule for whoever builds the headline query:** run it **as staff**, using the same
staff wrapper the existing screens use (`asStaff` from `src/partners/rls.mjs`, as
`api/read/funnel-pages.mjs:14` and `:31` do), and put the `org_id` filter in the SQL by hand.
Adding `ads.fundhub_ad_number` on its own does **not** make the query runnable. Get this
wrong and you get either an empty answer or one partner's numbers showing up inside
another's.

---

## The links that are missing

Five joins were traced. **Two work. Three do not.**

### 1. A `creative_assets` row → the ad it became — **WORKS**

`ads.asset_id` points straight at `creative_assets.id`
(`db/migrations/046_ad_platforms.sql:291`). There is an index for it (`046:318`).

### 2. An ad → its spend and results — **WORKS**

`ad_metrics_daily.ad_id` points at `ads.id`
(`db/migrations/046_ad_platforms.sql:436`), one row per ad per day, unique on
(ad, date) (`046:461-462`).

### 3. An ad → the clients it produced — **BROKEN**

This is the one that matters most and it is severed clean through.

- `client_ad_attribution.ad_id` is **text**, and it is the number from the web link —
  `"43"` (`286:110`, `286:81-86`).
- `ad_metrics_daily.ad_id` is a **uuid**, and it is a pointer to our own `ads` row
  (`046:436`).

**Two different things wearing the same name.** They cannot be joined. Nothing anywhere
in `046_ad_platforms.sql` mentions `utm` — checked, zero matches.

**Missing column:** `ads.fundhub_ad_number text`, with the digits-only check written out
above. With that one column the chain becomes:

`ad_metrics_daily` → `ads.fundhub_ad_number` = `client_ad_attribution.ad_id` → `clients`

run as staff, with `org_id` filtered by hand — see the tenancy section above.

### 3a. Where does the number in `ads.fundhub_ad_number` actually come from?

**This is a real hole and it changes the shape of the work.** The first draft assumed
`api/campaigns/sync.mjs` would fill the column in. It cannot, as written.

What that file asks Meta for, verbatim from the code:

- campaigns — `id,name,status,objective,daily_budget,special_ad_categories`
  (`api/campaigns/sync.mjs:199-204`)
- ad sets — `id,name,status,daily_budget,campaign_id` (`api/campaigns/sync.mjs:211-216`)
- **ads — `id,name,status,adset_id`** (`api/campaigns/sync.mjs:225-230`)
- daily numbers — `spend,impressions,clicks,ctr,actions,purchase_roas,date_start`
  (`api/campaigns/sync.mjs:242`)

**No link, no destination URL, no `utm` anything is requested anywhere in the file.** The
row it writes into `ads` carries only the external id, the name and the status
(`api/campaigns/sync.mjs:124-129`).

**Whether Meta can supply the link at all is UNKNOWN.** Nobody in this session has been able
to call Meta's API — there is no `ad_platform_connections` row and no working connection. So
this document will not name a Meta field it has not seen return data. Logged as UNKNOWN #13.

**Two possible outcomes, and somebody must choose before Definition of Done item 1 is real:**

1. Meta's ad object can return the destination link. Then `api/campaigns/sync.mjs:225-230`
   asks for that extra field, pulls `utm_content` out of the link, and the column fills
   itself. No screen needed.
2. It cannot. Then the number has to be **typed by a human** against each ad, and that
   screen does not exist and is not specified anywhere. That is new work nobody has scoped.

### 4. A video (`video_watch_stats`) → the script it was cut from — **BROKEN**

`video_watch_stats` holds `youtube_video_id` and `video_title` and nothing else that
identifies the video (`302:130-149`). There is **no script table in the database at all**
— no migration creates one.

**Missing:** the `ad_scripts` table, plus `creative_assets.youtube_video_id` and
`creative_assets.script_id` to walk from the YouTube id back to the words.

### 5. A funnel page (`funnel_page_stats`) → the ad that sent traffic to it — **BROKEN**

`funnel_page_stats` holds the ClickFunnels funnel id, page id, names, date, views and
conversions (`302:99-121`). There is no ad column and no `utm` column. The screen that reads
it is `api/read/funnel-pages.mjs`, whose query is at `api/read/funnel-pages.mjs:33-38` and
selects exactly `funnel_name, page_name, stat_date, views, conversions` — so today there is
nothing ad-shaped for it to show.

**Missing:** `funnel_page_stats.fundhub_ad_number text`, same digits-only check.

**Can ClickFunnels break its own numbers down by ad?** UNKNOWN, and marked as such. What is
anchored: the two endpoints this depends on are named at
`db/migrations/302_analytics_connections.sql:36-38` as
`GET /funnels/{id}/stats` and `GET /pages/{id}/stats`, and that same comment records they
were in **closed beta** as of the API's own changelog on 2026-09-07. The code reads one page
at a time and pulls two numbers out of a `step` object
(`src/analytics/clickfunnels.mjs:250-256`). **Whether those endpoints accept a `utm_content`
filter is not stated anywhere in this repo and nobody has been able to call them** — there is
no API key. Logged as UNKNOWN #7. If they cannot, the ad-level funnel number has to be
counted from our own `client_ad_attribution` rows instead.

---

## The screens

This lane builds no screen. What it changes is what the existing screens are able to say.

| Page | What is there now | What the new columns let it say |
|---|---|---|
| `public/app/campaign-manager.html` (2,459 lines) | Campaigns, spend, ad sets, action log. It already fetches funnel pages — `public/app/campaign-manager.html:1231` calls `/api/read/funnel-pages` and holds the result at `:701-702` | A "Cost per client" column per ad, once `ads.fundhub_ad_number` exists |
| `public/app/creative-factory.html` (2,705 lines) | Library, jobs, approvals, brand kits | Each asset showing the ad number it became, and the script it came from |
| Ad books read — `api/read/ad-books.mjs` | Leads and booked calls grouped by lane / ad number / variant, tags pulled from `docs/ads/registry.json` | The same groups with real money next to them |
| Funnel pages read — `api/read/funnel-pages.mjs:33-38` | Funnel name, page name, date, views, conversions | Which ad number sent the traffic, once `funnel_page_stats.fundhub_ad_number` exists |
| Video stats read — `api/read/video-stats.mjs:1-20` | Daily YouTube views and watch time, newest first | The drop-off curve, once `video_retention_curve` exists |
| Rival-ad board — `api/adintel/board.mjs`, routed at `netlify/functions/api.mjs:759` | A finished screen with five empty tables behind it | Real rival-ad data, the moment the write half is put on a schedule |

No new page, tab, or menu row is proposed by this lane.

---

## Where the marketing numbers go afterwards — migration 303

The lane scope named `303` by filename, and the first draft never described it. Here is what
it does.

`db/migrations/303_company_brain_generated_source.sql` widens one setting on the
`brain_files` table so a document can be marked as `'generated'` — meaning this app wrote it
itself, rather than it coming from Google Drive or from a person uploading it
(`303:22-24`, the new `CHECK (source IN ('drive', 'upload', 'generated'))`).

**Why it matters to this lane, in plain words.** Company Brain is the assistant that reads
company documents and writes Chris a weekly brief. Before `303`, it could only read files a
human put there. `303` is the doorway that lets marketing numbers — the ones this whole batch
is about — be written into Company Brain automatically and turned into that brief. The file
that writes them is named in the migration's own header: `src/company-brain/ingest-generated.mjs`
(`303:7-8`). The migration also records that a generated brief is treated as already approved
(`303:14-20`).

So it is not a marketing table. It is the **pipe that carries the finished marketing numbers
out to Chris**. Nothing in this lane changes it; it is here so no lane wonders why `303` was
skipped.

---

## Definition of done

A human can tick these.

1. `ads.fundhub_ad_number` exists **and carries the digits-only check**
   (`^[0-9]{1,9}$`, matching `db/migrations/286_client_ad_attribution.sql:117`), and something
   fills it in. Where the number comes from is decided first — see "3a" above, because
   `api/campaigns/sync.mjs:225-230` does not fetch a link today.
2. Running one query returns, for ad number 43: money spent, leads, booked calls.
   Nobody has to type a name anywhere for this to work. **The query runs as staff, with the
   `org_id` filter written into the SQL** — see the tenancy section.
3. `creative_assets.fundhub_ad_number`, `.script_id` and `.youtube_video_id` exist, with the
   same check on the number column.
4. An `ad_scripts` table exists and at least one real script is stored in it.
5. `funnel_page_stats.fundhub_ad_number` exists, or it is written down that
   ClickFunnels cannot supply it and the number is counted from our own rows instead.
6. `video_retention_curve` exists and holds one video's curve.
7. `creative_providers` has one active row, so pressing Generate stops erroring.
8. The house-ad problem is settled: either a real `partners` row exists that Chris's own ads
   hang off, or a decision is recorded that house ads live somewhere else. Items 1 and 2
   cannot be finished before this one is.
9. Something writes `brand_kits`, or brand kits are written off and the Creative
   Factory screen stops asking for them.
10. `npm run migrations:manifest` was re-run and `db/expected-migrations.mjs` lists
    every new file.
11. Every new endpoint is in **both** lists: `ROUTES` in `netlify/functions/api.mjs:277` and
    `API_KEYS` in `src/pulse/registry.mjs:26`. `src/http/routes.test.mjs:99-113` and
    `src/pulse/registry.test.mjs:40-52` both still pass.
12. `npm run lint` passes. `npx tsc --noEmit` passes.
13. The full test suite runs green against a real database, and **where it was run is written
    down**. `CLAUDE.md` §12 records the last real measurement — 6,867 tests, zero failures and
    zero skips, on local Postgres 16.14, and it says explicitly to re-measure rather than
    quote that line. No number is claimed here; see UNKNOWN #9.
14. Every new endpoint has a test at `src/http/<name>.pg.test.mjs`. Nothing under `api/`.
15. After the merge to `main` deploys, `/api/health` reports state `up`, not `behind`.

---

## Migration numbering — reserved

> **This whole section was wrong in the first draft and has been rebuilt. It told two lanes
> to create files that already exist. Read the corrected numbers below and re-check them
> before you write anything.**

**The prompt says the highest migration is 303. That is wrong, and so was the first draft's
correction of it.** The highest file on disk today is
**`db/migrations/376_checkout_expiry_and_escalation_fk.sql`**, confirmed two ways:
`ls db/migrations | tail -14`, and `db/expected-migrations.mjs:262`, which is the last
`migrations/` line in the manifest. `301`, `302` and `303` are simply the newest *marketing*
files; many higher-numbered files exist. (The first draft said "eighteen higher-numbered
files exist" — that number had no anchor, and it moves every week. Dropped. Look at the
highest filename instead of counting.)

**Numbers 367, 368, 369 and 370 are free. 371 through 376 are TAKEN.** These six landed on
`main` after the first draft was written:

```
371_waypoint_nudges.sql
372_regulator_complaints.sql
373_regulator_complaint_insert_guard.sql
374_client_escalations.sql
375_waypoint_nudge_destination_cap.sql
376_checkout_expiry_and_escalation_fk.sql
```

All six are already in the manifest at `db/expected-migrations.mjs:257-262`.

**Always a brand-new file.** Editing an applied migration does nothing — `db/migrate.mjs`
records each file by name in `schema_migrations` and skips a name it has already seen
(`CLAUDE.md` §12).

Corrected reservations:

| Number | File name | For | Lane |
|---|---|---|---|
| **367** | `367_ad_number_on_ads.sql` | `ads.fundhub_ad_number` + the digits-only check + index. **The join that unlocks everything.** | E |
| **368** | `368_creative_asset_lineage.sql` | `creative_assets.fundhub_ad_number`, `.script_id`, `.youtube_video_id` | E |
| **369** | `369_ad_scripts.sql` | `ad_scripts` and `ad_script_checks` | owner not yet claimed — see "The tables that need to be created" |
| **370** | `370_video_retention_curve.sql` | `video_retention_curve` | C (`docs/workflows/marketing-e2e.md:217`, `:248`) |
| **377** | `377_funnel_page_ad_number.sql` | `funnel_page_stats.fundhub_ad_number` | A |
| **378** | `378_creative_provider_seed.sql` | The one `creative_providers` row that makes Generate work | D |

Order matters: **367 before 368**, and **369 before 368** if `script_id` is a real
foreign key.

**Before you create your file, run `ls db/migrations | tail -14` and check your number is
still free.** `main` gained six files between the first draft and this correction. It can
gain more.

---

## Test placement — the trap, and who is caught by it

`npm test` runs `scripts/run-suite.mjs` (`package.json:20`), which walks exactly two
folders: `src/` and `scripts/` (`scripts/run-suite.mjs:50`). **A test file placed under
`api/` never runs and nobody is told.**

**Good news: there are no test files under `api/` today.** Checked — zero.

Endpoint tests belong at `src/http/<name>.pg.test.mjs` and import the `api/` handler.
That pattern is followed correctly by, for example,
`src/http/analytics-youtube.pg.test.mjs:19-20`.

**Marketing endpoints with a test in the right place:** `analytics/clickfunnels-connect`,
`analytics/clickfunnels-sync`, `analytics/youtube-connect`, `analytics/youtube-sync`,
`read/funnel-pages`, `creative/generate`, `creative/library`, `creative/jobs`,
`creative/approvals`, `creative/brand-kits`, `adintel/board`, `campaigns/list`,
`campaigns/detail`, `campaigns/spend`, `campaigns/fatigue`, `campaigns/connections`,
`campaigns/action-log`, `read/video-stats`, `read/ad-attribution`, `read/ad-books`,
`brand/review`, `content/tiles`, `content/upload`, `content/welcome-video`,
`partner-marketing/enable`, `partner-marketing/generate-logo`.

- `read/funnel-pages` is covered inside `src/http/analytics-clickfunnels.pg.test.mjs` — it
  imports the handler at `:31` and drives it at `:311`.
- `adintel/board` is covered by `src/http/adintel-board.pg.test.mjs`.
- `read/ad-attribution` and `read/ad-books` are covered by
  `src/http/ad-attribution.pg.test.mjs`, which drives them through the real router at
  `src/http/ad-attribution.pg.test.mjs:100` — that also proves they are routed.

**Marketing endpoints with NO test anywhere:**

| Handler | Why it matters |
|---|---|
| `api/campaigns/sync.mjs` | This is the file that pulls spend down from Meta and writes `ad_metrics_daily` (`:140`). The new ad-number column would be written here. Untested. |
| `api/campaigns/write.mjs` | Pauses and starts live campaigns (`:106`, `:112`). Untested. |
| `api/campaigns/meta-agency.mjs` | Creates the ad-account connection row (`:152`). Untested. |
| `api/creative/actions.mjs` | Archives and approves assets (`:52`, `:67`, `:81`). Untested. |
| `api/creative/run.mjs` | Kicks off a generation run. Untested. |
| `api/partner-marketing/usage.mjs` | Read by the Creative Factory page. Untested. |
| `api/partner-marketing/generate-copy.mjs` | Writes ad copy. Untested. |
| `api/partner-marketing/copy-history.mjs` | Reads it back. Untested. |

`api/campaigns/sync.mjs` is the worst gap on that list, because it is the exact file the
new join column would have to be written by.

---

## Migrations run on the production deploy only — what that means for shipping

In plain words.

There is **one database** behind everything. Live site, preview builds, branch builds —
all the same one. So a rule was put in: **only the real, live deploy is allowed to change
the shape of the database.** Everything else is forbidden from touching it
(`netlify.toml:85-86` runs the migration; `netlify.toml:67` for every other case runs
only a check. `db/migrate.mjs:48-56` refuses and exits if it finds itself in any build
that is not the live one).

### The setting name changed, and getting it wrong costs you an hour

**Migrations no longer use `DATABASE_URL` by default.** They ask for
**`MIGRATION_DATABASE_URL`** first, and fall back to `DATABASE_URL` only if that is not set
(`db/migrate.mjs:5-6`, and the resolver at `db/migrate.mjs:122-129`).

Why, in plain words: the running website connects as a limited account that is allowed to
read and change rows but **not** to reshape tables. Migrations reshape tables, so they need
the admin account instead. That is written out at `db/migrate.mjs:58-73`.

So for a lane testing a new migration against its own scratch database, either of these
works, and the first is the one to prefer:

```
MIGRATION_DATABASE_URL="postgres://...scratch..." node db/migrate.mjs
DATABASE_URL="postgres://...scratch..." node db/migrate.mjs
```

The fallback is deliberate so old habits keep working (`db/migrate.mjs:71-73`).

### What this means for the marketing work

1. **A preview link proves nothing about a new table.** If a lane adds
   `ads.fundhub_ad_number` and opens a pull request, the preview site runs against the
   database as it is **today** — without that column. Any screen that needs it will
   break on the preview.
2. **That breakage is correct.** It is not a bug to chase. It is the safety rule working
   (`db/migrate.mjs:38-42` says so).
3. **The column is not real until the branch is merged into `main` and `main` deploys.**
   Nobody may say "the schema change is applied" because a preview built.
4. **How to check for real:** open `/api/health`. `src/http/health.mjs:151` sets the answer
   to `up` when nothing is missing and **`behind`** when something is. The word is `behind`,
   not `pending` — `pending` is the **count** of missing files (`src/http/health.mjs:145-149`).
   The first draft said `pending`; corrected.
5. Running `node db/migrate.mjs` by hand on a laptop is unaffected. The rule only bites
   inside a Netlify build (`db/migrate.mjs:33-36`).

**Practical order for every lane:** merge the migration to `main` first, wait for the
live deploy, check `/api/health` says `up`, and only then judge whether a screen works.

---

## UNKNOWN — blocked or unverifiable

| # | What | Why it is unknown |
|---|---|---|
| 1 | **ClickFunnels API key** | Not supplied. Blocked on Chris. It is **not** an environment variable — it is typed into a screen and saved into `analytics_connections` (`api/analytics/clickfunnels-connect.mjs:82`, table at `302:43`). Without it nothing can be pulled and `funnel_page_stats` stays empty. |
| 2 | **YouTube OAuth client id, client secret, refresh token** | Not supplied. Blocked on Chris. Also a form, not an environment variable (`api/analytics/youtube-connect.mjs:119`). `video_watch_stats` stays empty. |
| 3 | **Microsoft Clarity project ID** | **Better news than the first draft gave.** The recorder is already written and already wired in. `public/js/clarity.js` is 48 lines and carries Microsoft's own official loader, marked as such at `public/js/clarity.js:35` and fetching the tag at `:44`. Five live pages already load it: `public/index.html`, `public/optimize.html`, `public/start.html`, `public/education/enroll/index.html`, `public/affiliates/index.html`. It is deliberately switched off: `CLARITY_PROJECT_ID` at `public/js/clarity.js:27` is an empty string, and the guard at `:30-31` makes the whole file do nothing — no network call, no globals, no console noise — while it stays empty. **Two things are missing, both of them Chris's.** (a) The project ID text, pasted into `public/js/clarity.js:27` (the file's own instruction, `:7`). (b) In the Clarity website itself, Settings → Masking set to **Strict**. No code can set (b); the file says so at `public/js/clarity.js:9`, and records that a fake masking call was found and deleted on 2026-09-07 (`:11-14`). |
| 4 | **Meta ad account connection** | No `ad_platform_connections` row exists. Until one does, `campaigns`, `ads` and `ad_metrics_daily` stay empty and the join fix cannot be proven with real numbers. |
| 5 | **Decision: does ClickFunnels "conversions" mean opt-ins or sales?** | The code counts opt-ins today — `src/analytics/clickfunnels.mjs:255` reads `body.step.optins`. The file's own header (`src/analytics/clickfunnels.mjs:31-37`) says ClickFunnels has no field literally called "conversions", and names `step.sales_count` as the alternative. Blocked on Chris. Not guessed, not changed. |
| 6 | **Decision: may `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected?** | It still instructs Google Workspace domain-wide delegation, which Chris banned. Blocked on Chris. Untouched. |
| 7 | **Can ClickFunnels break page stats down by `utm_content`?** | Cannot be tested without item 1. The two endpoints are named at `db/migrations/302_analytics_connections.sql:36-38` and were in closed beta as of 2026-09-07 per that same comment. Nothing in this repo states whether they accept a `utm_content` filter. If they cannot, join #5 must be counted from our own `client_ad_attribution` rows instead. |
| 8 | **Does the live database actually have migrations 301, 302, 303 and 366-376 applied?** | Not checked. The first draft gave the wrong reason for this. `CLAUDE.md` §11 blocks `api.netlify.com` and `api.supabase.com`, which are Netlify's and Supabase's **management** systems — a different thing from the site's own `/api/health` page, which is served by the site (`transcendent-wisp-888771`) and was simply not opened in this session. Everything above is read from the files on disk. Definition of Done item 15 needs somebody to actually open `/api/health` and read whether the state is `up` or `behind` (`src/http/health.mjs:151`). |
| 9 | **The real pass/fail count of the test suite right now** | Not measured this session. No tests were run and no database was connected. `CLAUDE.md` §12 says measure it yourself and record where, so no number is quoted here. |
| 10 | **Whether a `partners` row already exists that Chris's own ads could hang off** | The constraints are real and confirmed on six tables (listed under finding #1 above), and searching every migration for `is_house` or `house_partner` returns zero matches — so no house-partner concept is built into the schema. Whether an ordinary partner row is being used for this needs a live database read, which this session cannot do. |
| 11 | **Whether YouTube's `audienceRetention` report is available on Chris's channel** | Cannot be checked without item 2. Lane C owns proving it (`docs/workflows/marketing-e2e.md:248`). |
| 12 | **Which environment variables are actually set** | `.env.example` could not be read — the permission settings in this session refuse that directory ("File is in a directory that is denied by your permission settings"). The variable names in "The settings this lane depends on" above come from the source files that read them and from a committed session log (`docs/workflows/ads-affiliate-stack-2026-08-24.md:45-47`), never from `.env.example`. Nothing here was checked against the live Netlify settings. |
| 13 | **Whether Meta's API can return an ad's destination link, and under which field name** | Cannot be checked. There is no connection (item 4) and no call can be made. `api/campaigns/sync.mjs:225-230` asks Meta for `id,name,status,adset_id` and nothing else, so today the link is definitely not fetched. This document will not name a Meta field it has not seen return data. This is the hole under Definition of Done item 1 — see "3a". |
