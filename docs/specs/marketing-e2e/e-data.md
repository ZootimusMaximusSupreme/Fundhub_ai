# Lane E — Data model and plumbing

**Batch:** `marketing-e2e` · **Phase 1, spec only** · Written 2026-09-08 on `main` at `fe864840`.
Read-only pass. No application code was changed. This file is the only file created.

**Merge status, confirmed once and dropped:** PR #357 is merged into `main` at `fe864840`
(`git log --oneline -3` shows it as the tip). Nothing in this lane is waiting on it.

---

## What Chris gets when this is done

You will be able to ask one question and get one answer: **"ad number 43 cost me this much,
and brought me these people."** Right now the computer cannot answer that. It stores the
money on one side and the people on the other, and there is no piece of string tying the two
together. This lane finds the missing string and says exactly where each piece goes. It also
lists eight storage shelves that were built and never filled — including the one the ad-making
tool needs before it can make anything at all.

---

## What exists today

### The tables that already exist

Every one confirmed by reading the file that creates it.

| Table | Created in | What it holds, in plain words | Who can read it | Does anything write to it today? |
|---|---|---|---|---|
| `ad_platform_connections` | `db/migrations/046_ad_platforms.sql:45` | The login link to a Meta / TikTok / Google ad account. The password is scrambled. | Partner sees only their own rows; staff see all (`046:724-737`) | **Yes** — `api/campaigns/meta-agency.mjs:152`, `api/campaigns/sync.mjs:267` |
| `ad_platform_category_map` | `db/migrations/046_ad_platforms.sql:119` | A lookup list Meta demands: "this kind of offer belongs in that category." | Not covered by the RLS loop at `046:724-737` | **NO WRITER. And it is empty on purpose** (`046:105-112`) |
| `campaigns` | `db/migrations/046_ad_platforms.sql:155` | One row per ad campaign, copied down from Meta. | Partner-scoped (`046:724-737`) | **Yes** — `api/campaigns/sync.mjs:73`, `api/campaigns/write.mjs:106` |
| `ad_sets` | `db/migrations/046_ad_platforms.sql:247` | One row per ad set (the budget group inside a campaign). | Partner-scoped | **Yes** — `api/campaigns/sync.mjs:102`, `src/optimize/run.mjs:112` |
| `ads` | `db/migrations/046_ad_platforms.sql:282` | One row per individual ad running on the platform. Has `asset_id` pointing at the picture or video (`046:291`). | Partner-scoped | **Yes** — `api/campaigns/sync.mjs:125` |
| `ad_metrics_daily` | `db/migrations/046_ad_platforms.sql:432` | Money spent and results, one row per ad per day. | Partner-scoped | **Yes** — `api/campaigns/sync.mjs:140` |
| `client_ad_attribution` | `db/migrations/286_client_ad_attribution.sql:95` | Which ad brought each person in. The ad **number** is worked out by the database itself (`286:110`). | On, permissive; org split is done in the app (`286:126-139`) | **Yes** — `src/ads/store.mjs:22`, called from `src/handlers/client-lifecycle.mjs:17` |
| `creative_assets` | `db/migrations/045_creative_factory.sql:163` | Every picture, video, or block of ad words the factory made. `copy_text` added by `301`. | Partner-scoped (`045:59-73`) | **Yes** — `src/creative/generate.mjs:217` |
| `brand_kits` | `db/migrations/045_creative_factory.sql:86` | A partner's colours, fonts, voice, products. | Partner-scoped | **NO WRITER.** `api/creative/brand-kits.mjs:20-34` only reads |
| `brand_kit_sources` | `db/migrations/045_creative_factory.sql:128` | The raw web page a brand kit was scraped from. | Partner-scoped | **NO WRITER** |
| `creative_providers` | `db/migrations/048_campaign_config.sql:40` | Which outside company makes the pictures/videos/words. | Org-level | **NO WRITER, and no seed row.** `src/creative/providers/index.mjs:55-60` throws an error when the table is empty |
| `campaign_strategies` | `db/migrations/048_campaign_config.sql:90` | The six named ad plans (Forester, Venus Fly Trap, etc.) as settings. | Org-level | Filled by the migration itself (`048:135+`). No app writer — correct, it is config |
| `creative_billing_rates` | `db/migrations/050_creative_metering.sql:44` | What to charge a partner for generation and for managed spend. | Org-level | Rows exist but the price is **blank on purpose** (`050:62-72`). No app writer |
| `creative_usage_events` | `db/migrations/050_creative_metering.sql:79` | The running bill: each generation and each slice of spend. | Partner-scoped | **NO WRITER.** Nothing ever charges anything |
| `ad_watch_advertisers` | `db/migrations/278_ad_intelligence.sql:64` | The list of rival advertisers being watched. | Staff write, any signed-in partner may read (`278:316-334`) | Writer code exists (`src/creative-intel/ingest.mjs:214`) but **nothing runs it** |
| `ad_library_records` | `db/migrations/278_ad_intelligence.sql:101` | Every rival ad spotted, one row per sighting. | Same as above | Writer exists (`src/creative-intel/ingest.mjs:128`), **never run** |
| `ad_creatives_seen` | `db/migrations/278_ad_intelligence.sql:158` | The same rival ad, counted once instead of a thousand times. | Same as above | Writer exists (`src/creative-intel/ingest.mjs:165`), **never run** |
| `ad_creative_classification` | `db/migrations/278_ad_intelligence.sql:197` | What angle a rival ad uses, decided by a model. | Same as above | Writer exists (`src/creative-intel/classify.mjs:303`), **never run** |
| `ad_creative_signals` | `db/migrations/278_ad_intelligence.sql:248` | Weekly scores: which rival angle is heating up. | Same as above | Writer exists (`src/creative-intel/weekly.mjs:219`), **never run** |
| `org_brand` | `db/migrations/128_org_brand.sql:50` | FundHub's own logo, colours, fonts. | Org-level | **Yes** — `api/org-brand.mjs:240` |
| `partner_brand` | `db/migrations/043_partner_brand.sql:34` | A partner's logo, colours, fonts, voice. | Partner-scoped | **Yes** — `api/partner-brand.mjs:250`, `src/trials/provision.mjs:248` |
| `content_videos` | `db/migrations/171_content.sql:18` | Welcome videos staff upload for the client portal. Not marketing videos. | Org-level | **Yes** — `api/content/upload.mjs:112` |
| `analytics_connections` | `db/migrations/302_analytics_connections.sql:43` | The login link to ClickFunnels and to YouTube. Password scrambled. Staff only. | Staff only (`302:158-171`) | **Yes** — `api/analytics/clickfunnels-connect.mjs:82`, `api/analytics/youtube-connect.mjs:119` |
| `funnel_page_stats` | `db/migrations/302_analytics_connections.sql:99` | Views and conversions for one ClickFunnels page, one row per day. | Staff only | **Yes** — `api/analytics/clickfunnels-sync.mjs:91` |
| `video_watch_stats` | `db/migrations/302_analytics_connections.sql:130` | Views and watch time for one YouTube video, one row per day. | Staff only | **Yes** — `api/analytics/youtube-sync.mjs:137` |

**Eight shelves with nothing on them.** `ad_platform_category_map`, `brand_kits`,
`brand_kit_sources`, `creative_providers`, `creative_usage_events`, and the five
`278_ad_intelligence.sql` tables (which have code, just nothing that calls it).
Each is a finding and each is ranked below.

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
  partner id. That is deliberate and written down at `db/migrations/302_analytics_connections.sql:29-34`.
- Where it is used: `api/analytics/clickfunnels-connect.mjs:66` and
  `api/analytics/youtube-connect.mjs:91` lock it; `src/analytics/clickfunnels.mjs:87`
  and `src/analytics/youtube.mjs:96` unlock it.
- The whole credential is stored as **one scrambled blob**, not separate columns
  (`302:23-27`), because ClickFunnels needs a key plus a subdomain and YouTube needs
  three different values.

### Routes: the marketing handlers, and whether the site can reach them

`netlify/functions/api.mjs` keeps a hand-typed list called `ROUTES`, exported at
**`netlify/functions/api.mjs:278`**. A handler file that is missing from that list
returns "page not found" both locally and live.

**Every marketing handler under `api/` is in the list. None is a 404.** Verified line by line:

| Handler file | In `ROUTES`? | Line |
|---|---|---|
| `api/analytics/clickfunnels-connect.mjs` | yes | `netlify/functions/api.mjs:584` |
| `api/analytics/clickfunnels-sync.mjs` | yes | `:585` |
| `api/analytics/youtube-connect.mjs` | yes | `:586` |
| `api/analytics/youtube-sync.mjs` | yes | `:587` |
| `api/read/ad-attribution.mjs` | yes | `:580` |
| `api/read/ad-books.mjs` | yes | `:581` |
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
| `api/brand/review.mjs` | yes | `:661` |
| `api/partner-marketing/enable.mjs` | yes | `:676` |
| `api/partner-marketing/usage.mjs` | yes | `:677` |
| `api/partner-marketing/generate-copy.mjs` | yes | `:678` |
| `api/partner-marketing/copy-history.mjs` | yes | `:679` |
| `api/partner-marketing/generate-logo.mjs` | yes | `:680` |
| `api/content/tiles.mjs` | yes | `:762` |
| `api/content/upload.mjs` | yes | `:763` |
| `api/content/welcome-video.mjs` | yes | `:770` |

A test already guards this. `src/http/routes.test.mjs:31-71` fails if any file under
`api/` is neither in `ROUTES` nor on a written-down excuse list, and the excuse list
holds no marketing entries.

### The migration manifest

`db/expected-migrations.mjs` is a generated list of every schema file this build of the
code expects the live database to have already run (`db/expected-migrations.mjs:1-8`).
`src/http/health.mjs` compares it against reality, so `/api/health` says "behind"
instead of "fine" when a deploy skipped its migrations.

**It is current.** Its last entry is `migrations/366_creditor_bureau_map.sql`
(`db/expected-migrations.mjs:256`), which matches the highest file on disk. It is
regenerated with `npm run migrations:manifest` (`package.json:13`).

---

## What is missing

Ranked worst first.

**1. There is no way to join an ad's cost to the people it brought in.**
This breaks the one number Chris actually wants. Detail in "The links that are missing" below.

**2. The ad-making tool cannot make anything.** `creative_providers` has no rows and
nothing writes to it. `src/creative/providers/index.mjs:55-60` throws
"no active provider configured" the moment anyone presses Generate. Migration
`050`'s own comment says this is on purpose until somebody chooses a vendor
(`db/migrations/048_campaign_config.sql:35-38`).

**3. Nothing can create a brand kit.** `brand_kits` and `brand_kit_sources` have no
writer anywhere in `src/`, `api/`, or `scripts/`. The Creative Factory screen reads
brand kits (`api/creative/brand-kits.mjs:29`) and will always show an empty list.

**4. `creative_assets` cannot hold a house ad.** `partner_id` is `NOT NULL`
(`db/migrations/045_creative_factory.sql:100`) and points at the `partners` table.
Chris's own ads belong to no partner. Today his five running ads (`docs/ads/CONTROLS.md`)
have nowhere in this table to live.

**5. Nothing ever charges anybody.** `creative_usage_events` has no writer, and both
prices in `creative_billing_rates` are deliberately blank
(`db/migrations/050_creative_metering.sql:62-72`).

**6. Meta campaigns are blocked at the database.** `ad_platform_category_map` is empty,
so `meta_category_for()` returns nothing, and the check at
`db/migrations/046_ad_platforms.sql:229-232` rejects every Meta campaign insert. The
migration says this is the intended failure until a human fills the table
(`046:105-112`).

**7. The rival-ad watcher is built and switched off.** All five `278` tables have
working writer code in `src/creative-intel/`, but nothing imports it. `src/creative-intel/job.mjs:5-14`
says out loud that registering it on a schedule was left undone on purpose.

**8. There is no table for ad scripts at all.** No migration under `db/migrations/`
creates one. Scripts live as markdown under `docs/ads/` and the ad registry is a flat
file, `docs/ads/registry.json`, loaded by `src/ads/registry.mjs:22`.

**9. There is no table for the second-by-second drop-off curve of a video.**
`video_watch_stats` (`302:130`) has four daily numbers and no place for a curve.

**10. Five marketing endpoints have no test that runs.** Listed under "Test placement" below.

---

## The data model

### What already works, in plain words

- A person fills in the ClickFunnels form. The web address they clicked carries five
  tags. `src/handlers/client-lifecycle.mjs:17` hands them to `src/ads/store.mjs:22`,
  which saves one row per person in `client_ad_attribution`.
- The database then works out three things by itself and stores them as real columns:
  the **lane**, the **ad number**, and the **variant** (`286:109-111`). The app never
  types them, so the app can never disagree with them.
- The ad number is just the leading digits of `utm_content`
  (`286:81-84`). `43` works. `43-ringlights` works and the name is thrown away. A
  name is never needed.

### The columns that need to be added

Each is a new column on an existing table. Every one goes in a **new** migration file —
editing an already-applied file does nothing at all (`CLAUDE.md` §12).

| Add this column | To this table | Plain meaning |
|---|---|---|
| `fundhub_ad_number text` | `ads` (`046:282`) | The number Chris puts in the ad's link. This is the single missing piece that ties spend to people. |
| `fundhub_ad_number text` | `creative_assets` (`045:163`) | Which ad number this picture/video/script ended up being used as. |
| `script_id uuid` | `creative_assets` | Which written script this video was cut from. Needs the script table below to exist first. |
| `youtube_video_id text` | `creative_assets` | Ties a video we made to the YouTube video it was uploaded as. |
| `fundhub_ad_number text` | `funnel_page_stats` (`302:99`) | Which ad sent traffic to this page. |

### The tables that need to be created

| New table | Plain meaning |
|---|---|
| `ad_scripts` | One row per written ad script. The words, the lane, the ad number once it gets one, who/what wrote it, and which rules version it was checked against. Today this only exists as markdown files. |
| `ad_script_checks` | One row per run of the style checker (`scripts/ads/check-script.mjs`), so a pass is a stored fact and not a claim. |
| `video_retention_curve` | One row per video per point along the video: how many people were still watching at 5%, 10%, 15%… This is what tells you people quit at 0:42. |

Lane B owns the shape of `ad_scripts`. Lane C owns the shape of `video_retention_curve`.
This lane only reserves the numbers and states that they do not exist today.

---

## The links that are missing

This is the most important part of this lane. Five joins were traced. **Two work. Three
do not.**

### 1. A `creative_assets` row → the ad it became — **WORKS**

`ads.asset_id` points straight at `creative_assets.id`
(`db/migrations/046_ad_platforms.sql:291`). There is even an index for it (`046:318`).

### 2. An ad → its spend and results — **WORKS**

`ad_metrics_daily.ad_id` points at `ads.id`
(`db/migrations/046_ad_platforms.sql:436`), one row per ad per day, unique on
(ad, date) (`046:462-463`).

### 3. An ad → the clients it produced — **BROKEN**

This is the one that matters most and it is severed clean through.

- `client_ad_attribution.ad_id` is **text**, and it is the number from the web link —
  `"43"` (`286:110`, `286:81-84`).
- `ad_metrics_daily.ad_id` is a **uuid**, and it is a pointer to our own `ads` row
  (`046:436`).

**Two different things wearing the same name.** They cannot be joined. Nothing anywhere
in `046_ad_platforms.sql` mentions `utm` — checked, zero matches.

**Missing column:** `ads.fundhub_ad_number text` — the number Chris types into the ad's
link. With that one column the chain becomes:

`ad_metrics_daily` → `ads.fundhub_ad_number` = `client_ad_attribution.ad_id` → `clients`

and "ad 43 cost me $X and brought me Y people" becomes one query.

### 4. A video (`video_watch_stats`) → the script it was cut from — **BROKEN**

`video_watch_stats` holds `youtube_video_id` and `video_title` and nothing else that
identifies the video (`302:130-149`). There is **no script table in the database at all**
— no migration creates one.

**Missing:** the `ad_scripts` table, plus `creative_assets.youtube_video_id` and
`creative_assets.script_id` to walk from the YouTube id back to the words.

### 5. A funnel page (`funnel_page_stats`) → the ad that sent traffic to it — **BROKEN**

`funnel_page_stats` holds the ClickFunnels funnel id, page id, names, date, views and
conversions (`302:99-121`). There is no ad column and no `utm` column.

**Missing:** `funnel_page_stats.fundhub_ad_number text`.

Note honestly: ClickFunnels' own page-stats endpoint is per page per day. Whether it can
also break the numbers down by `utm_content` is **UNKNOWN** — nobody has been able to
call the endpoint, because there is no API key. If it cannot, the ad-level funnel number
has to be counted from our own `client_ad_attribution` rows instead.

---

## The screens

This lane builds no screen. What it changes is what the existing screens are able to say.

| Page | What is there now | What the new columns let it say |
|---|---|---|
| `public/app/campaign-manager.html` (2,459 lines) | Campaigns, spend, ad sets, action log | A "Cost per client" column per ad, once `ads.fundhub_ad_number` exists |
| `public/app/creative-factory.html` (2,705 lines) | Library, jobs, approvals, brand kits | Each asset showing the ad number it became, and the script it came from |
| Ad books read — `api/read/ad-books.mjs` | Leads and booked calls grouped by lane / ad number / variant, tags pulled from `docs/ads/registry.json` | The same groups with real money next to them |
| Video stats read — `api/read/video-stats.mjs:1-20` | Daily YouTube views and watch time, newest first | The drop-off curve, once `video_retention_curve` exists |

No new page, tab, or menu row is proposed by this lane.

---

## Definition of done

A human can tick these.

1. `ads.fundhub_ad_number` exists and `api/campaigns/sync.mjs` fills it in.
2. Running one query returns, for ad number 43: money spent, leads, booked calls.
   Nobody has to type a name anywhere for this to work.
3. `creative_assets.fundhub_ad_number`, `.script_id` and `.youtube_video_id` exist.
4. An `ad_scripts` table exists and at least one real script is stored in it.
5. `funnel_page_stats.fundhub_ad_number` exists, or it is written down that
   ClickFunnels cannot supply it and the number is counted from our own rows instead.
6. `video_retention_curve` exists and holds one video's curve.
7. `creative_providers` has one active row, so pressing Generate stops erroring.
8. Something writes `brand_kits`, or brand kits are written off and the Creative
   Factory screen stops asking for them.
9. `npm run migrations:manifest` was re-run and `db/expected-migrations.mjs` lists
   every new file.
10. `npm run lint` passes. `npx tsc --noEmit` passes.
11. The full test suite runs green against a real `DATABASE_URL`, with **zero skipped**
    `.pg.test.mjs` files.
12. Every new endpoint has a test at `src/http/<name>.pg.test.mjs`. Nothing under `api/`.
13. `src/http/routes.test.mjs` still passes, so every new handler is reachable.
14. After the merge to `main` deploys, `/api/health` reports **up**, not `pending`.

---

## Migration numbering — reserved

**The prompt says the highest migration is 303. That is wrong.** The highest file on
disk is `db/migrations/366_creditor_bureau_map.sql`, and `db/expected-migrations.mjs:256`
confirms it. `301`, `302` and `303` are simply the newest *marketing* files; eighteen
higher-numbered files exist. Numbering a new file `304` would place it **before**
migrations that are already applied, which is confusing at best.

**Always a brand-new file.** Editing an applied migration does nothing — `db/migrate.mjs`
records each file by name in `schema_migrations` and skips a name it has already seen
(`CLAUDE.md` §12).

Reserved, starting after 366:

| Number | File name | For | Lane |
|---|---|---|---|
| **367** | `367_ad_number_on_ads.sql` | `ads.fundhub_ad_number` + index. **The join that unlocks everything.** | E |
| **368** | `368_creative_asset_lineage.sql` | `creative_assets.fundhub_ad_number`, `.script_id`, `.youtube_video_id` | E |
| **369** | `369_ad_scripts.sql` | `ad_scripts` and `ad_script_checks` | B |
| **370** | `370_video_retention_curve.sql` | `video_retention_curve` | C |
| **371** | `371_funnel_page_ad_number.sql` | `funnel_page_stats.fundhub_ad_number` | A |
| **372** | `372_creative_provider_seed.sql` | The one `creative_providers` row that makes Generate work | D |

Order matters: **367 before 368**, and **369 before 368** if `script_id` is a real
foreign key.

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
`creative/generate`, `creative/library`, `creative/jobs`, `creative/approvals`,
`creative/brand-kits`, `campaigns/list`, `campaigns/detail`, `campaigns/spend`,
`campaigns/fatigue`, `campaigns/connections`, `campaigns/action-log`,
`read/video-stats`, `read/ad-attribution`, `read/ad-books`, `brand/review`,
`content/tiles`, `content/upload`, `content/welcome-video`,
`partner-marketing/enable`, `partner-marketing/generate-logo`.

(`read/ad-attribution` and `read/ad-books` are covered by
`src/http/ad-attribution.pg.test.mjs`, which drives them through the real router at
`src/http/ad-attribution.pg.test.mjs:100` — that also proves they are routed.)

**Marketing endpoints with NO test anywhere:**

| Handler | Why it matters |
|---|---|
| `api/campaigns/sync.mjs` | This is the file that pulls spend down from Meta and writes `ad_metrics_daily` (`:140`). The new ad-number column will be written here. Untested. |
| `api/campaigns/write.mjs` | Pauses and starts live campaigns (`:106`, `:112`). Untested. |
| `api/campaigns/meta-agency.mjs` | Creates the ad-account connection row (`:152`). Untested. |
| `api/creative/actions.mjs` | Archives and approves assets (`:52`, `:67`, `:81`). Untested. |
| `api/creative/run.mjs` | Kicks off a generation run. Untested. |
| `api/partner-marketing/usage.mjs` | Read by the Creative Factory page. Untested. |
| `api/partner-marketing/generate-copy.mjs` | Writes ad copy. Untested. |
| `api/partner-marketing/copy-history.mjs` | Reads it back. Untested. |

`api/campaigns/sync.mjs` is the worst gap on that list, because it is the exact file the
new join column has to be written by.

---

## Migrations run on the production deploy only — what that means for shipping

In plain words.

There is **one database** behind everything. Live site, preview builds, branch builds —
all the same one. So a rule was put in: **only the real, live deploy is allowed to change
the shape of the database.** Everything else is forbidden from touching it
(`netlify.toml:85-86` runs the migration; `netlify.toml:67` for every other case runs
only a check. `db/migrate.mjs:48-52` refuses and exits if it finds itself in any build
that is not the live one).

What this means for the marketing work:

1. **A preview link proves nothing about a new table.** If a lane adds
   `ads.fundhub_ad_number` and opens a pull request, the preview site runs against the
   database as it is **today** — without that column. Any screen that needs it will
   break on the preview.
2. **That breakage is correct.** It is not a bug to chase. It is the safety rule working.
3. **The column is not real until the branch is merged into `main` and `main` deploys.**
   Nobody may say "the schema change is applied" because a preview built.
4. **How to check for real:** open `/api/health`. It says `up` when the live database has
   every migration this code expects, and `pending` when it does not
   (`db/expected-migrations.mjs:1-6`).
5. Running `node db/migrate.mjs` by hand on a laptop is unaffected. The rule only bites
   inside a Netlify build (`db/migrate.mjs:35`).

**Practical order for every lane:** merge the migration to `main` first, wait for the
live deploy, check `/api/health` says `up`, and only then judge whether a screen works.

---

## UNKNOWN — blocked or unverifiable

| # | What | Why it is unknown |
|---|---|---|
| 1 | **ClickFunnels API key** | Not set. Never supplied. Blocked on Chris. Without it nothing can be pulled and `funnel_page_stats` stays empty. |
| 2 | **YouTube OAuth client id, client secret, refresh token** | Not set. Blocked on Chris. `video_watch_stats` stays empty. |
| 3 | **Microsoft Clarity project ID** | Not set. Blocked on Chris. Nothing in this repo references it. |
| 4 | **Meta ad account connection** | No `ad_platform_connections` row exists. Until one does, `campaigns`, `ads` and `ad_metrics_daily` stay empty and the join fix cannot be proven with real numbers. |
| 5 | **Decision: does ClickFunnels "conversions" mean opt-ins or sales?** | The code counts opt-ins today — `src/analytics/clickfunnels.mjs:255`. The file's own header (`:31-36`) says ClickFunnels has no field literally called "conversions". Blocked on Chris. Not guessed, not changed. |
| 6 | **Decision: may `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected?** | It still instructs Google Workspace domain-wide delegation, which Chris banned. Blocked on Chris. Untouched. |
| 7 | **Can ClickFunnels break page stats down by `utm_content`?** | Cannot be tested without item 1. If it cannot, join #5 must be counted from our own `client_ad_attribution` rows instead. |
| 8 | **Does the live database actually have migrations 301-303 and 366 applied?** | Cannot be checked from here. `api.netlify.com` and `api.supabase.com` are blocked by network policy, so `/api/health` cannot be read. Everything above is read from the files on disk. |
| 9 | **The real pass/fail count of the test suite right now** | Not measured this session. `DATABASE_URL` was not used and no tests were run. `CLAUDE.md` §12 says measure it yourself and record where; that was not done here, so no number is quoted. |
| 10 | **Whether `creative_assets.partner_id NOT NULL` is a real blocker for house ads** | The constraint is real (`db/migrations/045_creative_factory.sql:100`). Whether a "house" partner row already exists that Chris's own ads could hang off was not verified — that needs a live database read. |
| 11 | **Whether YouTube's `audienceRetention` report is available on Chris's channel** | Cannot be checked without item 2. Lane C owns proving it. |
