# Marketing end to end — shared board

**Batch:** `marketing-e2e`
**Started:** 2026-09-08
**Phase:** 1 of 3 — write the build spec. No app code changes in this phase.
**Owner:** Chris. **Ground pass:** done by the lead session.

Read this file before you start. It exists so five agents do not each read the same
twelve files.

---

## STOP — read this before you touch git

**A merge is half-finished in this repository right now.** It is not marketing work
and it is not yours.

- `.git/MERGE_HEAD` exists. Someone is merging `origin/lane2/r3-w10-docs-p3`.
- Five files are in conflict and unresolved:
  `scripts/black-reports/fundhub_gen.py`, `src/deliverables/fixtures/python-bodies.json`,
  `src/deliverables/roadmap.mjs`, `src/underwrite/black-report-client.mjs`,
  `src/underwrite/black-report-client.test.mjs`
- Sixty-six files are staged and uncommitted.

**Rules for every lane:**
- Do NOT run `git merge`, `git rebase`, `git checkout`, `git reset`, `git stash`,
  or `git commit -a`. Do not resolve those conflicts.
- You may create NEW files under `docs/specs/marketing-e2e/`. Nothing else.
- GitHub is locked out. `git push` WILL fail. Do not try. That is not an error.
- The lead session handles all committing at the end.

---

## Correction to the thread prompt — two facts changed

The prompt that started this batch is out of date on two points. Verified 2026-09-08.

**1. PR #357 is MERGED. It is on `main` now.**

```
fe864840  Merge PR #357: ad script generator, analytics, Creative Factory text path
          Tue Sep 8 09:02:18 2026 -0700
          parents: e20c298d (main) + a1697048 (feat/ad-script-generator)
```

`git log --oneline main..origin/feat/ad-script-generator` returns nothing.
`git branch -r --merged main` lists `origin/feat/ad-script-generator`.

So there is **no merge conflict to resolve** in `db/expected-migrations.mjs`,
`db/migrations/300_...sql`, or `src/pulse/registry.mjs`. That problem is solved.
Everything the prompt described as "on the branch" you can now read on `main`.

**2. `origin/feat/ad-script-generator` is merged and can be deleted.**
Per `CLAUDE.md` §8 an agent cannot delete it — the proxy returns 403. Note it for
Chris; do not try.

---

## The four pieces, and who owns what

| Lane | Owns | Writes to | Status |
|---|---|---|---|
| **G** | Ground pass — this file | `docs/workflows/marketing-e2e.md` | **done** |
| **A** | CRO — funnel and landing pages | `docs/specs/marketing-e2e/a-cro.md` | pending |
| **B** | Ad script generation | `docs/specs/marketing-e2e/b-scripts.md` | pending |
| **C** | VSL + watch data (deep) | `docs/specs/marketing-e2e/c-vsl.md` | pending |
| **D** | Creative Factory in the browser | `docs/specs/marketing-e2e/d-factory.md` | pending |
| **E** | Data model + plumbing | `docs/specs/marketing-e2e/e-data.md` | pending |

Lead session merges all five into `docs/specs/marketing-e2e-spec.md`.

---

## Ground brief — what is actually on disk

Every path below was confirmed to exist on 2026-09-08 on `main` at `fe864840`.

### Rules and voice — the ad SOP

```
docs/ads/RULES.md              32,138 bytes   the SOP. Law.
docs/ads/VOICE.md               9,058 bytes   before/after lines Chris rewrote
docs/ads/CONTROLS.md           18,724 bytes   THE VOICE SEED. 5 filmed, running ads.
docs/ads/rules-data.mjs        10,356 bytes   one machine-readable rules source
docs/ads/CONCEPTS.md           55,301 bytes   48 hooks
docs/ads/ANGLE-GENERATOR.md     8,766 bytes
docs/ads/ASSET-BANK.md         18,013 bytes
docs/ads/registry.json          5,868 bytes   24 ads
docs/ads/NEXT.md, POST-BOOKING-15.md, README.md,
docs/ads/apify-scrape-pipeline.md, ascension-ads.md, sms-copy-2026-09.md
docs/ads/build/  docs/ads/scripts/           (directories)
```

### The checker

```
scripts/ads/check-script.mjs           28,513 bytes   the style/rules checker
scripts/ads/check-script.test.mjs      16,209 bytes   its tests
scripts/ads/check-registry-titles.mjs   1,552 bytes
```

### The skill that writes ads

```
.cursor/skills/fundhub-ad-writer/SKILL.md   130 lines
```
It writes cold DR ads, **VSLs**, and evergreen backend ads from `RULES.md` +
`VOICE.md`, and runs the checker before Chris sees a draft. Three rules inside it
matter to more than one lane:
- It never names an ad. Ads are found by number (`utm_content`), not name.
- It never adds a page, tab, or menu row.
- **The rule loader is swappable, the generator is not.** Today the loader is
  "open two markdown files." Later it is "read this brand's row in `brand_kits`."
  That seam is what makes tonight's tool and a paid product feature the same build.

### The flywheel (separate system — general copy, not Fundhub ad scripts)

```
.claude/commands/flywheel.md
.claude/workflows/avatar-builder.js  ad-research.js  offer.js  copy.js
                  ad-strategy.js  deep-research.js
```
`copy.js` holds the surviving banned-word list from the dead humanizer skill
(lines 34-48).

### Creative Factory

```
public/app/creative-factory.html   2,705 lines
public/app/campaign-manager.html   2,459 lines
src/creative/generate.mjs, runner.mjs, + generate.pg.test.mjs, runner.pg.test.mjs,
                                          runner-cron.test.mjs
src/creative/providers/  _http.mjs copy.mjs index.mjs product-video.mjs
                         resize.mjs static.mjs ugc-video.mjs providers.test.mjs
api/creative/  generate.mjs library.mjs brand-kits.mjs jobs.mjs approvals.mjs
               actions.mjs run.mjs
```

The page calls these endpoints (scraped from the HTML):
`api/creative/generate` `library` `brand-kits` `jobs` `approvals` `actions` `run`,
`api/analytics/youtube-connect` `youtube-sync`, `api/brand/review`,
`api/partner-marketing/usage`, `api/read/partners`, **`api/read/video-stats`**.

**All of the above ARE in the hardcoded `ROUTES` map** in
`netlify/functions/api.mjs` (checked: `read/video-stats` line 583, `read/ad-books`
line 581, `analytics/*` lines 584-587, `creative/*` lines 192-198 imports,
`campaigns/*` lines 645-652). So the §12 "handler is not a route" trap is not
currently firing for marketing. Lane D and E must still verify per-endpoint.

### Analytics — read-only, added by PR #357

```
src/analytics/clickfunnels.mjs  11,923 bytes  + clickfunnels.test.mjs
src/analytics/youtube.mjs        9,812 bytes  + youtube.test.mjs
api/analytics/clickfunnels-connect.mjs  clickfunnels-sync.mjs
api/analytics/youtube-connect.mjs       youtube-sync.mjs
```

### Landing pages / funnel

```
public/index.html      785 lines
public/optimize.html   581 lines
public/start.html       69 lines
public/crm.html  public/progress.html  public/contract.html  public/careers.html
public/login.html  public/portal-login.html  public/reset-password.html
public/unsubscribe.html  public/404.html
docs/workflows/cf-vsl-watch-html-step1.html   ClickFunnels custom-HTML skin,
                                              references Survey/V1 and
                                              AppointmentScheduler/V1 widgets
```

### Journeys already written

```
docs/journeys/ad-script-flow.md
docs/journeys/ad-attribution-flow.md
```

### Other docs a lane may need

```
docs/ops/2026-09-06-self-analysis.md          58,079 bytes — the honest gap list
docs/workflows/2026-09-08-what-was-in-flight.md  21,997 bytes
docs/workflows/2026-09-08-marketing-e2e-prompt.md 4,856 bytes
docs/UI-STANDARDS.md                           law for anything under public/app/
docs/COMPANY-BRAIN-BUILD-SPEC.md               line 39 is a known open question
```

---

## Database — what already exists

Marketing-related tables found across `db/migrations/*.sql`:

```
ad_platform_connections    ad_platform_category_map   ad_metrics_daily
ad_sets                    ad_creatives_seen          ad_creative_signals
ad_creative_classification ad_library_records         ad_watch_advertisers
campaigns                  campaign_strategies        client_ad_attribution
creative_assets            creative_providers         creative_usage_events
creative_billing_rates     brand_kits                 brand_kit_sources
org_brand                  partner_brand              content_videos
mail_campaigns
analytics_connections      funnel_page_stats          video_watch_stats
```

Key migrations:

- **286** `client_ad_attribution.sql` — the attribution table and the
  `fundhub_ad_id()` function. `utm_content` is leading digits with an OPTIONAL
  `-slug`; the slug is ignored. `utm_content=43` resolves with no name at all.
- **301** `creative_copy_text.sql` — adds `copy_text` to `creative_assets`.
- **302** `analytics_connections.sql` — three new tables (see below).
- **303** `company_brain_generated_source.sql`

### Migration 302 in detail — this is the heart of Lane C

`analytics_connections` (line 43) — one row per connected platform, credentials
encrypted, staff-only RLS.

`funnel_page_stats` (line 99) — one row per ClickFunnels page per day:
`clickfunnels_funnel_id`, `clickfunnels_page_id`, `funnel_name`, `page_name`,
`stat_date`, `views`, `conversions`.

`video_watch_stats` (line 130) — one row per YouTube video per day:
`youtube_video_id`, `video_title`, `stat_date`, `views`,
`estimated_minutes_watched`, `average_view_duration_sec`,
`average_view_percentage` (0-100, stored as given).

Both stats tables follow the NULL rule: **NULL means "the platform did not answer",
never 0.** A real zero and "we don't know" must never look the same on a screen.

### What YouTube actually pulls today — and the gap

`src/analytics/youtube.mjs:195`:
```
metrics = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage"
dimensions = "video"   (line 201)
```
Video list comes from `channels?part=contentDetails&mine=true` → uploads playlist →
`playlistItems?part=snippet` (lines 148-175), giving `title` and `published_at`.

**Four metrics. That is all.** There is no `audienceRetention` call anywhere in the
file. `audienceRetention` with `elapsedVideoTimeRatio` is the second-by-second
drop-off curve — the thing that tells you people quit at 0:42. **We do not pull it
and there is nowhere to store it.** This is the single biggest gap for Chris's
"VSL watch info, all metadata" requirement. Lane C owns proving this and specifying
the fix.

### The ClickFunnels decision Chris must make

`src/analytics/clickfunnels.mjs:255`:
```js
const conversions = Number.isFinite(body.step.optins) ? body.step.optins : null;
```
The file's own header comment (lines 31-36) says ClickFunnels has no field named
"conversions". `step.optins` = someone gave an email. `step.sales_count` = someone
paid. The code currently counts **opt-ins**. **Blocked on Chris.** Write UNKNOWN,
do not guess, do not change it.

---

## Blocked on Chris — write UNKNOWN, never guess

1. ClickFunnels API key
2. YouTube OAuth: client id, client secret, refresh token
3. Microsoft Clarity project ID
4. Meta ad account connection — no `ad_platform_connections` row exists
5. **Decision:** ClickFunnels "conversions" = opt-ins or sales?
6. **Decision:** may `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected? It still
   instructs Google Workspace domain-wide delegation, which Chris banned.

---

## Context that is NOT in this repo

- **The 83 ad scripts (`fundhub-scripts.md`) are gone.** They lived in a chat window
  and were never committed. Chris said on 2026-09-06 he does **not** want them as
  seed material. Do not look for them.
- **The VSL doc (`fundhub-vsl.md`) is gone.** Same story. Do not look for it.
- **`docs/ads/CONTROLS.md` is the voice seed.** Five filmed ads, running, booking
  calls at $32-36 each. Never rewrite that file.
- Four marketing skills died with a laptop. Their banned-word lists survive in
  `.claude/workflows/copy.js:34-48`, `docs/ads/RULES.md:78-84`, and
  `docs/ads/rules-data.mjs`.

---

## Rules every lane follows

1. **Ground every claim in a file path and line number.** Never write from memory.
2. **Cannot verify it? Write `UNKNOWN`.** A gap is a finding, not a hole to fill
   with a plausible guess.
3. **Read only.** Phase 1 changes no app code. You write exactly one new markdown
   file, in `docs/specs/marketing-e2e/`.
4. **Never raise compliance, legal, or regulatory anything.** `CLAUDE.md` §7 is
   removed. No labels, no riders, no "you should have counsel look at this."
5. **Do not volunteer fixes outside your lane.** If you trip over something broken
   that is not yours, leave it alone and say nothing.
6. **5th grade reading level.** Chris does not read code. Say what a user sees, not
   what a function does.
7. **Never make naming a blocker.** Ads are found by number. An untitled ad is not
   a defect.
8. Update your row in the table above: `claimed` → `done`, and add your manifest
   below.

---

## Manifests

_Each lane appends: files read, files written, findings count, blockers._

(pending)

---

## Open questions raised by lanes

(pending)
