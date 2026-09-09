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

Phase 1 complete. All five lane sections written, fact-checked and patched. The
readable summary is `docs/specs/marketing-e2e-spec.md`. Four ground-truth files sit
alongside the lane sections in `docs/specs/marketing-e2e/`.

---

# PHASE 2 — building. Live status.

**The target, in one line:** make and measure. Scripts, ads, VSLs and landing page
copy on demand — then track everything and feed it back.
Full version: `docs/specs/marketing-e2e/THE-TARGET.md`.

## Done

| What | Commit | State |
|---|---|---|
| Phase 1 spec, five lanes, four ground-truth files | `67d38a42`, `f1446f3f` | done |
| VSL live page found + the speaking-rate correction | `b97ac08a` | done |
| Chris's eight decisions locked | `3c511a1c` | done |
| ClickFunnels setup steps for Chris | `3342c1d4` | **waiting on Chris** |
| Heartbeat investigation | `3342c1d4` | done — **it has never run** |
| **Migration 377 — the label spine** | `ecb8d8ee` | written, **NOT executed anywhere** |

## In flight

| Unit | What it does | State |
|---|---|---|
| A | Read endpoint over the spine view | building |
| B | Write path — a script and its labels; a rewrite makes a new version | building |
| C | The `asset_id` link. **This is what turns the spine on.** | **done** — manifest at the end of this file |
| D | Routes map + the flow diagram + changelog | waits for A, B, C |

## The three honest limits right now

1. **Nothing has been run against a database.** There is no Postgres, no Docker and no
   Homebrew on this Mac, and GitHub CI is locked out. Every database test skips, and a
   skipped test is not green. Migration 377's first real execution would be the
   production deploy.
2. **The spine reads EMPTY until `ads.asset_id` gets written.** That column has existed
   since migration 046 and nothing has ever filled it. Unit C is about exactly this.
   Empty is not broken, but it looks the same on a screen.
3. **The live site is behind `main`.** Three endpoints return 404 there while routed
   ones return 401. Nothing new works live until one deploy goes out.

## Waiting on Chris

- The five ClickFunnels boxes — **they do not exist**. Steps written at
  `docs/clickfunnels/CHRIS-DO-THIS-FIRST.md`. Nothing downstream works without them.
- Four keys: ClickFunnels (**and which workspace subdomain**), YouTube OAuth trio,
  Clarity project ID, Meta ad account.
- Has a text arrived around 7am each morning? One answer settles the heartbeat.
- Optional: add "mechanism" as a sixth label? One line to add later, not a redesign.

## Open questions raised by lanes

Recorded in each lane section under `## UNKNOWN`. The ones that change what gets built
were put to Chris and answered on 2026-09-08 — see the locked decisions at the top of
`docs/specs/marketing-e2e-spec.md`. Nothing is blocked on an unanswered question.

---

## Manifest — Unit C, the `asset_id` link (2026-09-08)

### The finding first: there is no automatic match, and there never was one

The job was "make something write `ads.asset_id`". The honest answer is that **a
computer cannot work out which of our creatives is running on which Meta ad**,
because the two sides share no identifier of any kind. Checked, not assumed:

| What was checked | What is true | Where |
|---|---|---|
| Does the Meta pull ask for a creative? | No. It asks for `id,name,status,adset_id` and nothing else. | `api/campaigns/sync.mjs:229` |
| Is our creative's id one Meta would know? | No. It is the id our **picture-and-video maker** gave it. The five makers are `copy`, `static`, `ugc-video`, `product-video`, `resize`. None of them is Meta. | `src/creative/providers/_http.mjs:100`, `src/creative/providers/*.mjs` |
| Have we ever sent one of our creatives to Meta? | No. The function that would do it takes an id nobody ever supplies, and nothing calls it. | `src/adplatforms/meta.mjs:93`; only caller of the write wrapper is `src/optimize/run.mjs:95`, which does budget, pause and rotate |

The only match left would be guessing from the ad's **name**. That was refused.
A wrong link makes every angle and hook answer silently wrong, with no error
anywhere — which is worse than an empty screen, because an empty screen tells you
something is missing.

### So it is a person typing, and this is the smallest honest version of that

**New: `api/campaigns/link-asset.mjs`.** One call says "this ad is running that
creative", and can set our own ad number at the same time, because a person doing
one is almost always doing the other.

- Each field is set **only if it was actually sent.** Sending just the number does
  not wipe the creative link, and the other way round. Unknown stays unknown.
  There are exactly two instructions, not three:
  **leave the field out and it is untouched; send it empty or as `null` and it is
  cleared; send it with a value and it is set.**
  A blank box is a *clear*, not a *skip* — so a screen with an empty dropdown must
  send nothing at all, or it will quietly switch that ad's labels back off.
- **A cross-partner link is refused.** Three separate locks: the ad and the
  creative are read inside the partner's own scope, so another partner's rows are
  invisible; the handler compares the owner and the company itself; and migration
  377 added a database trigger (`trg_ads_asset_partner`) that refuses it outright.
- **Answering the question that was asked:** before 377, **nothing** guarded
  ad-to-creative. 377 Part 4b added that guard in the same file that starts
  reading the link. The handler checks anyway so the refusal reads as a plain
  sentence instead of a crash.
- Two ads cannot claim the same number (409). A Meta ad id typed into our number
  box is refused (400) — it is longer than nine digits.

**New: `src/http/ad-asset-link.pg.test.mjs`.** 21 tests. The important pair: the
ad's labels are **all empty before the link** and **all correct after it**. Either
one alone proves nothing.

**What these tests cannot tell you.** They check the handler's own owner check and
the database trigger. They do **not** check the third lock — the database's own
per-partner walls. Those walls only switch on for the low-powered login, and this
file runs as the powerful one. A green run here is not proof that walls work.
`src/db/label-spine.pg.test.mjs` is the file that proves that.

### Files

| File | What |
|---|---|
| `api/campaigns/link-asset.mjs` | new — the write that turns the spine on |
| `src/http/ad-asset-link.pg.test.mjs` | new — 21 tests, never executed (no Postgres here) |
| `docs/workflows/marketing-e2e.md` | this manifest |

Nothing else was touched. No migration, no shared file, no journey doc.

### Unit D needs two rows from me

1. **Route key** — `"campaigns/link-asset": campaignsLinkAsset` in the `ROUTES`
   map, importing `../../api/campaigns/link-asset.mjs`. Until it is there the
   endpoint returns 404 and `src/http/routes.test.mjs` fails.
2. **Pulse registry** — it belongs in `ALLOWED_UNMONITORED` in
   `src/pulse/registry.mjs`, next to `campaigns/meta-agency`, with this reason:
   *"POST only. A GET answers 405 by design, and pinging it with a body would
   rewrite which creative a real ad is running, or claim an ad number nobody
   chose. The monitored door for this surface is the spine read endpoint."*

### One gap between a document and the code, reported not fixed

`docs/journeys/ad-script-flow.md:96` says the `asset_id` link **"arrives on its
own through the Meta sync."** It does not, and it cannot — see the table at the
top of this manifest. That sentence is the exact belief that left the column empty
for the whole life of the project. Unit D owns the flow diagram and the changelog,
so it is left alone here.

### Not done, plainly

- **The test has never run.** There is no Postgres on this machine, so it skips —
  and a skipped `.pg.test.mjs` is not green (`CLAUDE.md` §12). Verified only that
  it skips cleanly with `DATABASE_URL` unset.
- **Nothing is wired.** Until Unit D adds the route, the endpoint is unreachable.
- `npm run lint` clean, `npx tsc --noEmit` clean. The full suite has **6 failures
  with these two files present and the same 6 without them** — measured both ways
  on this branch, 2026-09-08.

  **Correction (2026-09-08, after review). Saying "none is mine" was wrong.** The
  count of 6 does not move, but one of those 6 is `src/http/routes.test.mjs`, and
  it fails *because of this batch*: it names three unreachable handlers and all
  three are ours — `campaigns/link-asset`, `read/ad-spine`, `scripts/write`. That
  test was passing on `main` before this batch. The total looks unchanged only
  because the other two lanes broke the same one test I did.

  It goes green the moment Unit D adds the three route keys. It is the trip-wire
  for the §12 trap working exactly as designed, not a defect — but it is ours, and
  the board should not have said otherwise.

  `src/pulse/registry.test.mjs` is the one that genuinely was already red before
  this batch: it lists `public/eeo-survey` and `read/eeo-aggregate`, neither of
  which is marketing work. The remaining four failures are unrelated to this batch
  — an eeo-aggregate company-scope check, two stale journey checks, a client
  control panel check and an Arizona clock check.

---

## Manifest — Unit B, the write path for scripts and their labels (2026-09-08, revised after review)

### What a person can now do

Save a script. The words, plus five labels: what kind it is, which lane it is for,
its angle, its hook, its offer. Save a rewrite of a script and **the first version
is still there, untouched** — a rewrite is a new row that points back at the one it
replaced. That is the whole reason migration 377 was written that way: you can read
the rewrite next to what it came from.

### The one thing that stops the numbers getting split in half

Chris types "Denial Angle" one day and "denial-angle" the next. Left alone, those
are two different angles and one angle's results get cut in two, with no error
anywhere. So every label is tidied on the way in — trimmed, lower-cased, spaces and
dashes to underscores — by one shared piece of code, `src/ads/label-keys.mjs`.
Three spellings land on one key.

**It is not a list of allowed words.** A brand new angle nobody has written down
saves the first time it is typed (owner rule, 2026-09-06 — naming is never a
blocker). Only the lane is checked against a fixed list, and only because the lane
is a fixed set in the database, so an unknown one is a crash nobody can read.

### The dictionary learns, and never overwrites

Every label that lands on a script is also added to the label dictionary with a
tidy display name. If a name is already there, it is left alone — a name Chris
typed by hand wins forever, however many scripts carry that label.

### Fixed in this pass, after the review

| Was | Now |
|---|---|
| Refusals came back in two different shapes. Some put a short code in `error`, others put a whole sentence there. A screen reading `error` would get a paragraph where it expected a code. | Every refusal is the same shape: a short code in `error`, the readable sentence in `message`. `api/scripts/write.mjs:110-125` and `:305-311`. |
| "The FundHub house owner row is missing, so migration 377 has not been applied here." | That was often the wrong answer. 377 only creates that row for the **main** company (`db/migrations/377_marketing_label_spine.sql:139` ends `WHERE o.is_default`), so a second company hits it with 377 fully applied. The message now says what to actually do. `api/scripts/write.mjs:224-236`. |
| "That script belongs to another company" and "no such script" were told apart in the answer. | Same code, same words, either way. Otherwise somebody can walk a list of ids and learn which ones exist inside another company. `api/scripts/write.mjs:198-206`. |
| `scripts/write` was missing from the pulse registry, so `npm test` was red on it. | Added to `ALLOWED_UNMONITORED` in `src/pulse/registry.mjs` with a written reason. **That test no longer names this unit.** |
| Three refusals had no test: an unknown lane, a label that cannot be tidied into something legal, and a job title that is not allowed. | All three now covered, plus `unknown` as a lane, a rewrite somebody tried to move to another partner, and a rewrite of a script that does not exist. `src/http/scripts-write.pg.test.mjs`. |

### Files

| File | What |
|---|---|
| `api/scripts/write.mjs` | new — the write path |
| `src/ads/label-keys.mjs` | new — the one copy of the tidying rule |
| `src/ads/label-keys.test.mjs` | new — 13 checks, **all 13 run and pass on this machine** |
| `src/http/scripts-write.pg.test.mjs` | new — 12 tests, **never executed** (no Postgres here) |
| `src/pulse/registry.mjs` | one row added to `ALLOWED_UNMONITORED` |
| `docs/workflows/marketing-e2e.md` | this manifest |

`netlify/functions/api.mjs` was **not** touched, on purpose — Unit D owns it.

### Unit D still needs one row from me, and one command

1. **Route key** — `"scripts/write"` in the `ROUTES` map, importing
   `../../api/scripts/write.mjs`. Until it is there the endpoint answers 404 both
   on the laptop and live, and `src/http/routes.test.mjs` stays red. The pulse
   registry half is already done; only the route is outstanding.
2. **Run `npm run journeys` in the same commit as the route**, and add a line to
   `docs/journeys/CHANGELOG.md`. The page-drawing tool reads the `ROUTES` map
   (`scripts/journeys/render.mjs:304`), so adding a route changes what nine
   journey pages should say the same minute it lands. `CLAUDE.md` §4 says same
   commit, never a follow-up.

   Worth knowing: those nine pages are **already** out of date today, on `main`,
   for reasons that have nothing to do with this batch — `scripts/journeys/generate.test.mjs`
   is red right now and this handler is not in `ROUTES`, so it cannot be the cause.

### Not done, plainly

- **The database test has never run.** No Postgres on this machine. Verified only
  that it skips cleanly with `DATABASE_URL` unset — 1 suite, 0 failures. A skipped
  `.pg.test.mjs` is not green (`CLAUDE.md` §12). It needs one run against a real
  database before anyone trusts the write path.
- **Nothing is wired.** Until Unit D adds the route, the endpoint is unreachable.
- **Two identical posts write two rows.** There is no repeat-protection key, on
  purpose: nothing here bills anything and `ad_scripts` has no column for one.
  Known behaviour, not an oversight.
- **Nothing was committed.** No git command was run at all, per the standing rules
  for this batch. These files exist only on the laptop until somebody commits them.
- `npm run lint` clean, `npx tsc --noEmit` clean. Full suite on this branch,
  2026-09-08: **9628 tests, 9618 pass, 6 fail, 4 skip.** The six are
  `routes:` (names `scripts/write`, `campaigns/link-asset`, `read/ad-spine` — waiting on
  Unit D), `registry:` (names `campaigns/link-asset`, `public/eeo-survey`,
  `read/eeo-aggregate` — **no longer names this unit**), `the journeys are not stale`,
  and three that predate this batch: `client-control-panel.html binds the live URL client`,
  `every clock and timestamp on a staff screen is Arizona`, and `every read endpoint
  scopes to the caller's company` (which names `eeo-aggregate.mjs`).

---

## Manifest — Unit: where people stop watching an ad (2026-09-09)

### What a person gets

For every video ad Meta runs, the app now saves **how far in people got before they
left**: past 3 seconds, a quarter, halfway, three quarters, nearly finished, finished,
and ThruPlay (15 seconds, or the whole thing if it is shorter than 15).

**This cost nothing to get.** Meta has always sent it, free, on a request this app
already makes every time somebody presses Sync. We simply never asked for those seven
names. No pixel, no beacon, no player, no new service.

*(The video on our own funnel page is a different job and is not this one. No ad
platform can see inside a video on our page.)*

### The one thing that would have quietly broken it

These seven numbers **do not arrive as numbers.** Each one arrives as a *list*
containing an object, with the number inside it written as text:

```
video_p25_watched_actions: [ { action_type: "video_view", value: "220" } ]
```

Read that as a number the obvious way and you get nonsense, which saves as blank — and
blank looks exactly like "Meta has no data for this ad". It would have looked like it
was working, forever. So the unpacking happens in one place
(`src/adplatforms/meta.mjs`), and it has its own test that **runs on this laptop** with
no database: 21 checks, 21 pass.

One more trap inside that: when Meta breaks a number down, it sends the parts **and**
their total in the same list. Adding them up counts the same people twice, silently.
The code takes the largest instead, which is right either way. There is a test for it.

### Empty and zero are not the same, and this is the whole point

- A video **nobody watched** is **0**.
- A **photo ad** has **nothing** — there is no video, so there is no such number.

The seven new columns allow blank and have **no default**. A default of 0 would have
turned every photo ad into "nobody watched it", permanently, with no way to tell the
invented zeros from the real ones. Blank means *we do not know*. Any screen built on
this must show an empty cell, never a 0.

### What is deliberately NOT here

**Hook rate and hold rate.** They are the two numbers everyone in paid media reads
(hook rate = 3-second views ÷ how many saw it; hold rate = three-quarters ÷ 3-second
views). Both are arithmetic on the numbers this unit stores. Working them out in two
places is how two different answers to the same question end up on two screens. One
place, once — and that is the integrator's job, not this one.

### One thing fixed on the way past, because it would have hidden its own failure

The line that saves a day of numbers ended by throwing every error away, silently. On a
database where migration 378 has not been applied yet, it would have saved **nothing**
and said nothing about why. The error now travels back and appears in the sync's own
answer. Nothing else about that loop changed.

### Files

| File | What |
|---|---|
| `db/migrations/378_ad_video_metrics.sql` | new — seven nullable columns on `ad_metrics_daily`, plus a "cannot be negative" guard |
| `src/adplatforms/meta.mjs` | the unpacker (`watchedActionCount`, `videoMetrics`), one exported field list, and the seven values added to `normalizeInsight` |
| `api/campaigns/sync.mjs` | asks Meta for the seven fields; stores them; reports a failed write instead of swallowing it |
| `src/adplatforms/meta-video.test.mjs` | new — 21 checks, **all 21 run and pass here**, no database needed |
| `src/http/campaigns-video-metrics.pg.test.mjs` | new — 8 checks including the whole sync driven against a fake Meta. **Never executed** |
| `db/expected-migrations.mjs` | regenerated by `npm run migrations:manifest` (279 migrations) |
| `docs/journeys/ad-label-spine-flow.md` | the "drop-off is never pulled" gap corrected; the diagram now shows it |
| `docs/journeys/CHANGELOG.md` | one entry at the top |

**No route to add.** `campaigns/sync` is already in the `ROUTES` map
(`netlify/functions/api.mjs:666`) and already in the pulse registry
(`src/pulse/registry.mjs:68`). `netlify/functions/api.mjs` was not touched.

### Not done, plainly

- **Nothing has been pulled in real life.** There is no Meta connection row at all, so
  every one of the seven columns is empty until Chris connects the ad account. Empty is
  correct here; it is also indistinguishable from broken on a screen.
- **The database test has never run.** No Postgres on this Mac, so it skips — and a
  skipped `.pg.test.mjs` is not green (`CLAUDE.md` §12). Verified only that it skips
  cleanly with `DATABASE_URL` unset.
- **Migration 378 is not applied anywhere**, including live. It runs on the production
  deploy only (`CLAUDE.md` §11).
- **The Meta payload in the tests is written from Meta's documentation**, not captured
  from a real ad account. Nobody here has seen one of these fields come back.
- **No screen shows the curve** and nothing joins it to the labels.
- `npm run lint` clean (1973 files), `npx tsc --noEmit` clean. Full suite on this
  branch, 2026-09-09: **9649 tests, 9641 pass, 4 fail** — `registry:` (names
  `public/eeo-survey` and `read/eeo-aggregate`, not marketing),
  `client-control-panel.html binds the live URL client`, `every clock and timestamp on
  a staff screen is Arizona`, and `every read endpoint scopes to the caller's company`
  (names `eeo-aggregate.mjs`). All four predate this unit and none names anything it
  touched. The pg files did not run at all: `scripts/run-suite.mjs:82` exits as soon as
  the unit run is non-zero.

### Two stale line numbers this change caused, reported not fixed

Adding lines to `api/campaigns/sync.mjs` moved the lines other documents point at.
`docs/journeys/ad-label-spine-flow.md` was corrected. **Not** corrected, because they
belong to other lanes: the comment at `api/campaigns/link-asset.mjs:14` (says
`sync.mjs:229`, now `:260`) and the Phase 1 spec `docs/specs/marketing-e2e/e-data.md`
(nine references, all now off by roughly 30 lines). Nothing about what they *say* has
changed — only where to look.

---

## Unit — INTEGRATION: hook rate and hold rate (2026-09-09)

**Status:** `done` (code), `unproven` (against a database).

Folds units A (Meta video drop-off) and B (spend and booked calls, joined by label)
together into the one number a buyer reads. Unit B did not write its own manifest —
another lane had this file open at the time — so its files are listed at the bottom here.

### What a person can now ask that they could not

One call: `GET /api/read/ad-spine?group_by=hook&days=30`.

Per label it already said what the ads cost and how many people booked. It now also says
**how far into the video people got**, as the two rates everybody who buys ads reads:

- **hook rate** = 3-second views ÷ impressions — did the opening stop them
- **hold rate** = p75 views ÷ 3-second views — did the middle keep them

Together with cost per booked person, that turns "this angle is losing" into "this angle is
losing *because the first three seconds do not stop anybody*" — which is a different fix
from "the middle drags".

### Change manifest — this unit

| File | What changed |
|---|---|
| `src/ops/meta-marketing.mjs` | **new** `watchRate()` at `:89` — THE only place either rate is worked out. Imports the same `MIN_N_RATE` `costPerBooked` already uses. Added to the default export. |
| `src/ops/meta-marketing.test.mjs` | 9 new tests (15 total, all passing, no database needed) |
| `api/read/ad-spine.mjs` | two sums added to the grouped money `SELECT` (`:353`) on the join that already existed; `shapeGroup` (`:478`) gained `video_3sec_watched`, `video_p75_watched`, `hook_rate`, `hold_rate`; header updated |
| `src/http/ad-spine.test.mjs` | 9 new tests (32 total, all passing, no database needed) |
| `src/http/ad-spine.pg.test.mjs` | photo-ad fixture row added (30000 impressions, no video); 4 new end-to-end assertions. **Never executed** |
| `docs/journeys/ad-label-spine-flow.md` | the "hook rate and hold rate are not worked out anywhere" gap is closed and the page says so; diagram gained the rates node; moved line citations repointed |
| `docs/journeys/CHANGELOG.md` | one entry at the top |

**No route to add, no migration, no dependency, no new endpoint, no new screen.**
`netlify/functions/api.mjs` was not touched — `read/ad-spine` was already routed and already
in the pulse registry. `db/expected-migrations.mjs` regenerated and came back identical
(279 migrations).

### Decisions

- **ONE definition, and a test that fails if a second appears.** `watchRate()` lives beside
  `costPerBooked` because it is the same shape of answer to the same shape of question, and
  it imports the same `MIN_N_RATE` (`src/ops/discoveries.mjs:9`). No second threshold was
  invented — the brief forbade one and 378's own header asked for exactly this. A test in
  `src/http/ad-spine.test.mjs` strips the comments out of the endpoint and fails if it ever
  names `MIN_N_RATE` itself or divides the video counts on its own.
- **A photo ad has NO hook rate, and that is the whole point.** No video means no 3-second
  views, so the rate is blank with a plain-words note. Never 0, never "0%". A zero there
  would make a working photo ad read as the worst ad in the account with nothing anywhere
  saying why. Asserted in three places, including against a fixture that reports 30000
  impressions and no video at all.
- **A real zero survives as zero.** A video nobody watched past three seconds has a hook
  rate of 0 and it is a measurement, not a gap.
- **Zero denominator is refused, not divided.** Hold rate on a group whose 3-second count is
  0 comes back blank.
- **Rates above 1 are passed through, not clamped.** Meta estimates and later restates these
  counts, so a day can land with p75 above the 3-second count. Squashing it would hide a
  real Meta restatement behind a tidy number.
- **`sum()` skipping NULLs is the behaviour we want and nothing coalesces.** A group with one
  video ad and nine photo ads sums to the video ad's number — "of what we were told". The
  365-day fixture test proves the photo ad's missing count is not folded in as 0.
- **Only two of 378's seven columns are selected.** The other five are not part of either
  rate and nothing reads them; a test fails if they appear in the query.
- **The rate is a plain fraction, rounded to four places** (0.32 means 32%). Nothing formats
  a percent — same reasoning as cents staying cents. Rounding only so a screen does not
  print `0.30000000000000004`.

### Not done, plainly

- **`src/http/ad-spine.pg.test.mjs` has never been executed.** No Postgres on this Mac. It
  skips clean with `DATABASE_URL` unset (0 tests, 0 failures). The photo-ad fixture and the
  four new assertions are unproven against a real database. Somebody with Postgres has to
  run it. A skipped `.pg.test.mjs` is not green (`CLAUDE.md` §12).
- **Migration 378 is applied nowhere, including live.** It runs on the production deploy
  only (`CLAUDE.md` §11), so until the branch merges, `/api/health` reports it pending and
  the seven columns do not exist. Against such a database the two new sums would fail.
- **No real Meta numbers have ever arrived.** `ad_platform_connections` has no row, so every
  video column is empty and every rate will come back blank until Chris connects the ad
  account. Blank is correct — and on a screen it is indistinguishable from broken, which is
  why the note beside each rate says which reason applied.
- **No screen shows any of this.** Nothing in `public/` calls `read/ad-spine`.
- **Nothing was committed.** No git command was run.

### Checks, measured 2026-09-09 on this Mac, `DATABASE_URL` unset

- `npm run lint` — clean, 1974 files
- `npx tsc --noEmit` — silent, exit 0
- `npm run migrations:manifest` — 279 migrations, no change
- `node --test src/http/routes.test.mjs` — 15 tests, 15 pass
- `npm test` — **9690 tests, 9682 pass, 4 fail, 4 skipped**

The 4 failures are the same 4 that were there before this batch and none names a file in
it: `registry:` (names `public/eeo-survey` and `read/eeo-aggregate`),
`client-control-panel.html binds the live URL client`, `every clock and timestamp on a staff
screen is Arizona`, and `every read endpoint scopes to the caller's company` (names
`eeo-aggregate.mjs` only). `read/ad-spine` appears in neither list.

### Unit B's manifest, folded in here because it could not write its own

| File | What changed |
|---|---|
| `src/http/ad-spine.test.mjs` | **new** — the first database-free coverage this endpoint ever had |
| `src/http/read-api.mjs` | `readDays` / `DEFAULT_DAYS` / `MAX_DAYS` now live here, once |
| `api/read/ad-spine.mjs` | imports the shared `readDays`; `has_window` gate; `ads_reported_in_window`; `people_rows_in_window` |
| `api/read/finance-command.mjs` | its local `readDays` copy deleted, imports the shared one |
| `src/http/ad-spine.pg.test.mjs` | `adspine_nonumber` fixture group; the no-number rule now asserted unconditionally |
| `docs/journeys/ad-label-spine-flow.md`, `docs/journeys/CHANGELOG.md` | updated |

Unit B left two things deliberately undone and they are still undone: the `::bigint` cast in
`AD_NUMBER_MATCH` defeats both text indexes (the durable fix is normalising the number where
it is **written**, on `link-asset`, not casting where it is read), and
`api/read/transactions.mjs` and `api/read/money-map.mjs` still hold their own `readDays`
copies — out of that lane's scope, named in the shared helper's comment so the next person
finds it.

---

## Unit — the label spine on a screen. `done` (code), never run against a live answer.

**What Chris asked for:** data and dashboards. One question: *which angle and which hook are
working?*

**What was true before this:** three endpoints answered and **no page in `public/` called any
of them.** The answer existed and nobody could see it.

**What there is now:** one panel on a page that already exists. `public/app/campaign-manager.html:416`,
called **Which angle and which hook are working**, sitting between the two panels on that screen
that already read org-wide, staff-only endpoints (ad performance, funnel pages).

**No new page, no new tab, no new menu row.** `netlify/functions/api.mjs` was **not touched** —
`read/ad-spine` has been routed at `:591` since 2026-09-08, so **no route key is needed from the
integrator.**

### What it shows

Pick a label — angle, hook, lane, offer or script type — and a window of 7, 14, 30 or 90 days.
One row per label:

| Column | Where it comes from |
|---|---|
| the friendly name, with the raw key under it | `ad_labels`, through the endpoint's `name` |
| how many ads carry it, and how many reported inside the window | `ads` and `ads_reported_in_window` |
| spend | `spend_cents` |
| people who arrived, people who booked | `people`, `people_booked` |
| cost per booked person | `cost_per_booked_person` |
| hook rate, hold rate | `hook_rate`, `hold_rate` |

Both the label and the window are **server** queries, so changing either re-reads. Re-sorting
rows already in memory would leave 7-day rows sitting under a 30-day footer.

### The three things that matter, and they are all about honesty

**1. A dash is not a zero, and they do not look alike.** The endpoint returns `null` for "nobody
told us" and a number for a real zero, deliberately and everywhere
(`api/read/ad-spine.mjs:106-127`). A screen that prints both as `0` throws away the whole reason
that read was written the way it was. So every cell asks *did the server say null?* before it
formats anything. A null paints a grey dash carrying **the endpoint's own sentence** on hover —
no day of spend was reported, or no ad here carries our number so nobody could be matched, or
Meta reported no video because a photo ad has none. A real zero paints as a black `0`.

Checked in a browser by handing `renderAdSpine()` a made-up response of the endpoint's exact
shape: the row with `spend_cents: 0` and `people: 0` printed `0.00` and `0`; the row with
`spend_cents: null` and `people: null` printed dashes with their reasons.

**2. The refusal is printed, not hidden.** When the sample is too small to divide,
`costPerBooked()` returns no cost and a plain sentence saying how many are needed and how many
there are. That sentence is printed in the cell, under the dash. The number ten is **never typed
into the HTML**, so the screen cannot drift away from `MIN_N_RATE` in `src/ops/discoveries.mjs:9`.

**3. The empty state is the normal state today, and it says why.** Nothing is labelled, no Meta
account is connected, and the endpoint is not on the live site yet. So the first thing Chris sees
is an empty panel, and it reads *"No ads on file yet, so there is nothing to group"* followed by
what makes ads and labels appear. Two more lines appear only when they are true **and only when
there are rows to misread**: that no spend was reported for the window, and that
`people_rows_in_window` is 0 — the endpoint's own company-wide check on whether any zero in the
people columns can be believed at all.

There are **no sample rows anywhere.** The panel starts null and is filled only by a read that
answered. *Reading*, *rejected* and *empty* are three different messages, using the same
`panelUnread` / `panelRow` contract the rest of that screen already uses. Staff-only, matching the
endpoint's own gate, so a partner login is told it is staff-only rather than the false "you are
not signed in".

### Manifest

| File | What changed |
|---|---|
| `public/app/campaign-manager.html` | the panel — markup at `:397-457`, the render and read code at `:1327-1500`, plus the state holder, the window select's listener, the `SRC` entry, the `wireAll` staff gate, and one boot call |
| `docs/journeys/ad-label-spine-flow.md` | the "no screen calls any of the three endpoints" line was **false** as of this change and is corrected; the diagram gained the panel |
| `docs/journeys/CHANGELOG.md` | one line appended, newest at top |

**No new CSS and no new dependency.** It reuses `.card` `.card-hd` `.eyebrow` `.rail` `.selwrap`
`.tblscroll` `table.grid` `.cap` `.pager` `.empty` `.mnum` `.nul` `.sub`, so it cannot trip the
`UI-STANDARDS` §12.7 type trap (no px font size is written anywhere) and it adds nothing to the
screen's horizontal overflow.

### Not done, plainly

- **No real row has ever reached this panel.** No Meta account is connected and no ad has been
  labelled, so every number it can show today is blank. Blank is correct here and on a screen it
  looks the same as broken, which is exactly why the dash carries its reason and the caps say what
  is missing.
- **The endpoint is not on the live site yet.** Until a deploy goes out, opening the panel on
  production will show *"This could not be read right now. Press Reload to try again."* That is
  the honest answer, not a fault to chase.
- **No Playwright spec was added and none was run.** `CLAUDE.md` §6 asks for a Playwright check on
  a UI change. The CRM specs need a signed-in session against a running site, and there is no
  database on this machine, so it could not be run here. What was done instead: the file was
  opened in a real browser and all four states were driven directly — reading, rejected, empty,
  and full — with a hand-made response of the endpoint's exact shape. The horizontal overflow was
  measured at 375px with the panel shown and hidden: 1090 both ways, so the panel adds none of it.
- **Nothing was committed.** No git command was run.

### Checks, measured 2026-09-09 on this Mac, `DATABASE_URL` unset

- `npm run lint` — clean, 1977 files
- `npx tsc --noEmit` — silent, exit 0
- `npm run journeys:check` — up to date, 9 files
- `npm run diagrams:check` — up to date, 11 files
- `npm test` — **9690 tests, 9682 pass, 4 fail, 4 skipped**

The 4 failures were measured **both ways**: with this change, and with `campaign-manager.html`
restored to `HEAD`. The list is byte-identical — `client-control-panel.html binds the live URL
client`, `every clock and timestamp on a staff screen is Arizona`, `every read endpoint scopes to
the caller's company`, and `registry: every routed api/ handler and live public/app desk is
listed`. None of them names `campaign-manager.html`.
