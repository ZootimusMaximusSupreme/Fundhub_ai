# Lane C — VSL generation and video watch data

**Written:** 2026-09-08. **Branch:** `main` at `fe864840`. **Phase 1 — no app code was
changed. This file is the only thing this lane created.**

Every claim below has a file and a line number next to it. Two deep passes were run
before this one; both were re-checked against the real files. Where they disagreed, the
code settled it, and the settlement is written down.

---

## What Chris gets when this is done

He will finally see the moment people stop watching a video, instead of only an average.
He clicks that moment and sees the exact part of the script he was saying at the time.
He presses one button and gets a fresh version of just that part, already run through the
ad-rules checker, with the rest of the script left word for word the same. Nothing gets
filmed, named, or published by a machine — he still decides all of that. Right now none of
this exists, and the video on the funnel page is not being counted at all.

---

## What exists today

### The headline fact — read this first

**The video on the funnel page is not a YouTube video.** It is a plain movie file sitting
on Fundhub's own website.

- `docs/workflows/cf-vsl-watch-html-step1.html:118-119` is a plain video tag pointing at
  `https://fundhub.ai/funnel/vsl.mp4`.
- The same address appears at `clickfunnels-fragments/01-vsl.html:134-135`.
- The SLO funnel uses its own file: `clickfunnels-fragments/slo/slo-01-sales.html:200`
  and `clickfunnels-fragments/slo/preview/01-sales.html:213` point at `slo-vsl.mp4`.
- The movie itself is in this repository: `public/funnel/vsl.mp4`, 22,212,001 bytes,
  dated 2026-09-07. `public/_headers:64` sets a header on `/funnel/vsl.mp4`.

The only script attached to that player is thirteen lines that turn the sound on when
somebody taps it (`docs/workflows/cf-vsl-watch-html-step1.html:128-141`). It listens for a
tap. **It sends nothing anywhere.** No play count, no quit point, no beacon.

**So every YouTube number in this app describes videos on the YouTube channel. None of
them describes the video on the funnel page.** Today, if Chris asks "how far into my VSL
do people get?", the honest answer is: nobody is counting.

Microsoft Clarity would at least have recorded the screen, but it is switched off.
`public/js/clarity.js:27` reads `var CLARITY_PROJECT_ID = "";` and lines 29-32 stop dead
when it is empty. It is also only loaded on `public/index.html`, `public/optimize.html`
and `public/start.html` — **not** on the ClickFunnels VSL page, which lives outside this
repository.

### The four numbers the app pulls from YouTube

`src/analytics/youtube.mjs:195`:

```
metrics = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage"
```

The rest of that request is at `src/analytics/youtube.mjs:196-204`: `ids=channel==MINE`,
a start date, an end date, `dimensions: "video"`, `sort: "-views"`, `maxResults: "50"`.
The address it calls is at `src/analytics/youtube.mjs:44`.

In plain words, those four numbers are: how many plays, how many minutes in total, how
many seconds the average person watched, and what percent of the video the average person
got through. **That is a summary. It cannot tell you where anybody left.**

### The video list

`src/analytics/youtube.mjs:151` asks YouTube for the channel's uploads list, then walks it
at `:161-180`, fifty at a time, up to forty pages (`:49`). From each video it keeps
**three things only** (`:172-176`): the video's id, its title, and the day it was posted.
Everything else is thrown away.

**The app never asks YouTube for the facts about a video.** There is no call anywhere for
video length, description, tags, thumbnail, privacy setting, likes or comments. Verified
by searching `src/` and `api/` for any `/videos?` request: the only YouTube addresses in
the code are the three at `src/analytics/youtube.mjs:42-44`.

**Video length matters more than it sounds.** Without it, a point on the drop-off curve
can only be a percentage. Chris cannot act on "40% of the way in." He can act on "eight
minutes twelve seconds."

### The pipes and the screen

| Thing | Where |
|---|---|
| Save the three YouTube login details | `api/analytics/youtube-connect.mjs:78-87`, checked against Google before saving (`:103-115`), stored scrambled (`:91`) |
| Pull the numbers | `api/analytics/youtube-sync.mjs`, window is `days` back from today, default 30, capped at 365 (`:67-68`) |
| Write the rows | `api/analytics/youtube-sync.mjs:137-152` |
| Read them back | `api/read/video-stats.mjs:54-58` |
| The screen | `public/app/creative-factory.html:582-612` |
| Routed so it answers | `netlify/functions/api.mjs:583`, `:586`, `:587` |
| Weekly summary uses it | `src/ops/weekly-brief.mjs:79-97` |

### The writing rules that already exist

| Thing | Where | What it is |
|---|---|---|
| The ad SOP | `docs/ads/RULES.md` (608 lines) | Law |
| VSL length | `docs/ads/RULES.md:438-441` | 700-900 words, 5-6 minutes at 150 words a minute |
| **The sixteen beats** | `docs/ads/RULES.md:443-466` | Fixed order. "Beats can be short; none can be skipped" |
| VSL-only rules | `docs/ads/RULES.md:468-480` | The refusal at beat 15 is required. The mechanism is explained once, at beat 12 |
| Speaking rate | `docs/ads/RULES.md:208-215` | 150 words a minute, and the file says plainly it is a guess nobody has timed |
| Machine-readable bands | `docs/ads/rules-data.mjs:172-177` | VSL band: 700-900, allow 630-990 |
| **The voice seed** | `docs/ads/CONTROLS.md:333` | The Founder VSL. `docs/ads/CONTROLS.md:1` marks the file `# LIVE — DO NOT EDIT` |

So **a VSL format already exists in writing.** It is `docs/ads/RULES.md` "Section 2 —
VSLs" at line 431, running to line 481.

### What the ad-writing skill does for a VSL

`.cursor/skills/fundhub-ad-writer/SKILL.md` names the VSL as a supported type at
`:81-82` and points at the sixteen beats. Beyond that one paragraph, it treats a VSL the
same as a short ad. Same voice sources, same checker, same rule at `:123` that it must
never name an ad, and same rule at `:38-39` that it must never add a page, tab, or menu
row.

### What the checker knows about a VSL — the exact answer

`scripts/ads/check-script.mjs` is 575 lines. Searching it for VSL rules turns up
**exactly two things**:

1. `scripts/ads/check-script.mjs:108` — a heading with "VSL" in it makes a block count as
   a script worth checking.
2. `scripts/ads/check-script.mjs:397` — the 700-900 word band is picked when the
   **RUNTIME** line contains `vsl`, `5-6 min`, `700` or `900`.

**That is all.** There is no check for the sixteen beats. There is no check for the
required refusal line. Three holes follow from that, each one real:

- **A `TYPE vsl` line does nothing for length.** `scripts/ads/check-script.mjs:464` reads
  the band from the RUNTIME line only. So a 200-word "VSL" with no RUNTIME line passes,
  because the only test left is the 135-word floor (`scripts/ads/check-script.mjs:382-386`,
  floor set at `docs/ads/rules-data.mjs:181`).
- **A VSL written as plain paragraphs is never length-checked.**
  `scripts/ads/check-script.mjs:483` passes "no band" for that shape — and plain
  paragraphs is exactly the shape the Founder VSL is written in (`docs/ads/CONTROLS.md:333`).
- **The refusal is not checked.** `docs/ads/RULES.md:473-477` says a VSL without it "is
  not our VSL". Nothing in the checker looks for it.

### How a script gets written today, start to finish

1. Something posts to `/api/creative/generate` (`api/creative/generate.mjs:70`). It
   demands a repeat-proof key (`:89`) and an offer type (`:106`).
2. That calls `enqueue()` (`src/creative/generate.mjs:41`), which writes one waiting job.
3. Either the every-two-minutes timer `creative-job-runner` (`netlify.toml:141-142`) or a
   press of "Run queued jobs now" picks it up (`src/creative/generate.mjs:115`).
4. `run()` (`src/creative/generate.mjs:147`) calls the writer, trying up to three times
   (`src/creative/generate.mjs:31`).
5. The writer is `src/creative/providers/copy.mjs`. **Its whole instruction sheet is four
   hard-coded sentences at `src/creative/providers/copy.mjs:90-98`.** It has never heard
   of `docs/ads/RULES.md`, `docs/ads/VOICE.md`, `docs/ads/CONTROLS.md`, the sixteen beats,
   or the checker.
6. The words are saved (`src/creative/generate.mjs:215`), in the `copy_text` column added
   by `db/migrations/301_creative_copy_text.sql:67`.
7. A person approves it. Nothing in that path can approve on its own.

**The checker never runs inside that path.** `scripts/ads/check-script.mjs` is a command a
person or a skill runs by hand. The writer and the checker have never met in code.

### What YouTube will actually give us

This was settled for this batch in `docs/specs/marketing-e2e/youtube-api-ground-truth.md`,
which was written on 2026-09-08 from Google's own published pages. The load-bearing
points, and I am not repeating them from memory:

- The drop-off curve exists. It is asked for at
  `GET https://youtubeanalytics.googleapis.com/v2/reports` with
  `dimensions=elapsedVideoTimeRatio` and `filters=video==<ONE video id>`
  (`docs/specs/marketing-e2e/youtube-api-ground-truth.md:47-61`).
- **One video per request. There is no way to ask for a list**
  (`youtube-api-ground-truth.md:58-61`). Thirty videos means thirty requests.
- Five numbers come back (`youtube-api-ground-truth.md:65-71`). The two that matter:
  `audienceWatchRatio` is the share still watching at that point — the shape of the drop.
  `stoppedWatching` is how many people quit right there.
- **The curve is always 100 points, whatever the video's length**
  (`youtube-api-ground-truth.md:78-83`). So how many seconds each point covers depends on
  how long the video is: about 1.2 seconds on a 2-minute video, about 6 seconds on a
  10-minute one, about 12 on a 20-minute one.
- **Replays, rewinds and skips cannot be had at all. Neither can any per-person watch
  record.** Everything YouTube gives is a total across everybody
  (`youtube-api-ground-truth.md:179-186`).

**One correction to a comment in our own code.** `src/analytics/youtube.mjs:33-40` states
that "the contract's verified Analytics endpoint has no per-video filter." That is wrong
for the retention report, which *requires* `filters=video==` and refuses to run without it
(`youtube-api-ground-truth.md:55`, `:58-61`). Whether the four-number summary report also
accepts a video filter is **UNKNOWN** — the ground-truth file does not say, and I did not
verify it myself.

### ClickFunnels gives no video signal at all

`src/analytics/clickfunnels.mjs:254-255` reads page views and opt-ins from the page-stats
call. There is no video field of any kind in that response. **A video watch number cannot
come from ClickFunnels.**

### Meta gives a second, different curve — and we do not ask for it

`src/adplatforms/meta.mjs:132` asks for exactly:
`spend,impressions,reach,frequency,clicks,ctr,actions,cost_per_action_type,purchase_roas`.
No video field. And `ad_metrics_daily` (`db/migrations/046_ad_platforms.sql:432-457`) has
no video columns to put one in. Meta publishes how far people get through an ad video, but
**the exact field names are UNKNOWN to this lane** — see the UNKNOWN table.

### Other players in this repo, and what they report

| Player | Where | What it reports today |
|---|---|---|
| The funnel VSL | `docs/workflows/cf-vsl-watch-html-step1.html:118-119` | **Nothing** |
| The SLO VSLs | `clickfunnels-fragments/slo/slo-01-sales.html:200` | **Nothing.** Two of the three files are still to be made (`TODO.md:196`) |
| The client-portal welcome video | `public/app/client-portal.html:1262`, `:1303` | **Nothing is recorded.** There IS a listener at `:1303` but it only paints a clock on screen. It sends nothing to the server. This one already knows who the viewer is, so per-person watch data is genuinely possible here |
| Microsoft Clarity | `public/js/clarity.js:27` | **Nothing — it is off**, and it is not on the VSL page anyway |
| Wistia / Vimeo / Mux | not present | — |

---

## What is missing — worst first

1. **The funnel VSL is not measured at all.** Not a play count, not a completion rate, not
   a quit point. This is the exact thing Chris asked about and it is at zero.
   (`docs/workflows/cf-vsl-watch-html-step1.html:118-141`, `public/funnel/vsl.mp4`)
2. **No drop-off curve is pulled, and there is nowhere to put one.** The one YouTube
   report the app calls asks for four totals (`src/analytics/youtube.mjs:195-206`).
   `video_watch_stats` has seven data columns and one row per video per day
   (`db/migrations/302_analytics_connections.sql:130-152`). A curve is a hundred rows per
   video. It does not fit and adding columns will not make it fit.
3. **Nothing stores a script with timing.** This is the hard part of the whole lane. The
   words live as one lump in `copy_text` (`db/migrations/301_creative_copy_text.sql:67`).
   The Founder VSL is plain paragraphs (`docs/ads/CONTROLS.md:333`). The checker actively
   *strips* the timing it sees (`scripts/ads/check-script.mjs:85-86`). So a moment in a
   video has nothing to point at.
4. **Video length is never fetched**, so a point on the curve can only ever be a
   percentage, not a timestamp (`src/analytics/youtube.mjs:161-176`).
5. **No link between a script and the video cut from it.** Nothing joins a written ad to a
   YouTube video id, and it cannot be worked out: YouTube hands back a title
   (`src/analytics/youtube.mjs:174`), and the skill is forbidden from giving a script a
   title (`.cursor/skills/fundhub-ad-writer/SKILL.md:32-36`). There is nothing to match on.
6. **The writer does not read the rules.** `src/creative/providers/copy.mjs:90-98` is four
   hard-coded sentences. The swappable rule loader that
   `.cursor/skills/fundhub-ad-writer/SKILL.md:39-49` describes does not exist as code.
7. **The checker never runs inside the writing path.** Steps 1-7 above never touch it.
8. **The checker has no VSL rules past word count.** Sixteen beats: unchecked. The
   required refusal: unchecked. `TYPE vsl`: ignored for length.
9. **`stat_date` is not a real date.** `api/analytics/youtube-sync.mjs:149` writes today's
   date, and the file's own note at `:11-12` says each row means "as of today, this
   video's totals over the last 30 days." **So two rows a week apart share 23 days of the
   same views.** Adding them together counts the same views twice, and
   `src/ops/weekly-brief.mjs:88-95` adds them together.
10. **The read endpoint does not return the video's id.** `api/read/video-stats.mjs:54-58`
    returns the title but not the id, so two videos with no title show as the same blank
    row, and the screen cannot link to a video.
11. **Nothing runs the YouTube pull on a timer.** `netlify.toml:135-153` lists five timed
    jobs. None of them is a YouTube sync. Skip a week and that week is lost.
12. **The 50-video cap silently cuts the list short.**
    `src/analytics/youtube.mjs:203` asks for 50 and the file's own note at `:38-40` admits
    a busier channel will not get every video.
13. **Clarity is off**, so there is no session replay anywhere
    (`public/js/clarity.js:27`).
14. **Meta's video numbers are not requested** (`src/adplatforms/meta.mjs:132`) and
    `ad_metrics_daily` has no columns for them
    (`db/migrations/046_ad_platforms.sql:432-457`).

---

## The data model

### What exists

**`analytics_connections`** — `db/migrations/302_analytics_connections.sql:43-79`. One row
per platform per company, staff only.

| Column | Plain meaning |
|---|---|
| `platform` | `clickfunnels` or `youtube` |
| `external_account_id` | The YouTube channel id, filled in at connect time (`api/analytics/youtube-connect.mjs:41-60`) |
| `encrypted_credentials` | The three login details, scrambled into one blob |
| `connection_state` | `pending` / `active` / `expired` / `revoked` / `error` |
| `last_error` | The platform's own words, never reworded |
| `last_synced_at` | When the last pull worked |

**`video_watch_stats`** — `db/migrations/302_analytics_connections.sql:130-152`.

| Column | Plain meaning |
|---|---|
| `youtube_video_id` | YouTube's id for the video |
| `video_title` | Its name. Can be empty |
| `stat_date` | **Not the day the views happened.** The day we pulled. See gap 9 |
| `views` | Plays in the window. Empty means "YouTube did not answer", never zero |
| `estimated_minutes_watched` | Total minutes, added up |
| `average_view_duration_sec` | Average seconds watched |
| `average_view_percentage` | Average percent watched, 0-100, stored exactly as given (`:141-143`) |
| one-of-a-kind rule | `(connection_id, youtube_video_id, stat_date)` (`:147-148`) |

**`funnel_page_stats`** — `:99-121`. Page views and opt-ins per ClickFunnels page.

**`content_videos`** — `db/migrations/171_content.sql:18-32`. The portal welcome-video
library. It has a `duration_label` which is a text label, not a number, and **no watch
columns at all**.

**`ad_metrics_daily`** — `db/migrations/046_ad_platforms.sql:432-457`. Spend, impressions,
reach, frequency, clicks, click rate, conversions, cost per action, return on spend.
**No video columns.**

All three analytics tables are staff-only, locked at
`db/migrations/302_analytics_connections.sql:158-171`.

### Migration numbering — a correction that matters

The shared brief says the highest migration is 303
(`docs/workflows/marketing-e2e.md:214-216`). **It is not.** Counted on disk on 2026-09-08:
**242 files, and the highest is `db/migrations/376_checkout_expiry_and_escalation_fk.sql`.**

An earlier pass of this lane said the highest was 366 and the next free numbers were
367-369. **That is also wrong now.** The next free numbers are **377, 378, 379.** Anybody
who takes 304, or 367, will collide with a file that already exists.

Editing an already-applied migration does nothing (`CLAUDE.md` §12), so this has to be
right the first time.

### What has to be created — three new tables and one new column

I am naming and shaping these. Nothing here has been built.

#### PROPOSED `db/migrations/377_video_retention_curve.sql`

**`video_retention_points`** — where the drop-off curve lives. One row per point.

| Column | Plain meaning |
|---|---|
| `id` | Row id |
| `org_id` | Which company |
| `connection_id` | Which YouTube account it came from. Same shape as `302:133` |
| `youtube_video_id` | Which video |
| `captured_on` | The day we pulled it |
| `window_start` / `window_end` | The first and last day of viewing this covers |
| `elapsed_ratio` | How far through, `0.01` to `1.00` |
| `elapsed_sec` | How far through in seconds. **Empty when the video's length is unknown** |
| `audience_watch_ratio` | Share still watching here. Empty means YouTube did not answer |
| `stopped_watching` | How many people quit right here |
| `started_watching` | How many playbacks began right here |
| `relative_retention` | How this compares with other videos of similar length |
| `video_length_sec` | The video's length. Empty when unknown |
| `captured_at` | When the row was written |

- **One-of-a-kind rule:** `(connection_id, youtube_video_id, captured_on, elapsed_ratio)`.
  Same idea as `302:147-148` with the curve position added, so a re-run updates instead of
  doubling.
- **Staff only**, copied exactly from `db/migrations/302_analytics_connections.sql:158-171`.
- **No fake zeros.** A point YouTube did not answer for gets **no row**, never a row with
  zero in it. This copies the rule already written at
  `api/analytics/youtube-sync.mjs:19-20` and
  `db/migrations/302_analytics_connections.sql:111-113`.
- **Two window columns instead of one date**, because that is what the existing pull
  actually produces (`api/analytics/youtube-sync.mjs:11-12`). Naming the range stops the
  next person reading these as per-day numbers.

**Findings are not stored.** "There is a cliff at 0:42" is the curve plus a threshold.
Thresholds change. Store the curve, work out the finding when somebody looks. Otherwise
every threshold change means rewriting history.

#### PROPOSED `db/migrations/378_vsl_scripts.sql`

**`vsl_scripts`** — the script as a thing with versions.

| Column | Plain meaning |
|---|---|
| `asset_id` | The row that already holds the words in `copy_text` (`301:67`). The words are **not** copied here |
| `version` | 1, 2, 3… |
| `parent_script_id` | Which version this came from. Empty for version 1 |
| `rewrite_reason` | `first_draft` / `retention_drop` / `owner_edit`. **Empty means we do not know** — never filled in with a guess |
| `trigger_youtube_video_id` | Whose curve caused this. Empty when watch data caused nothing |
| `trigger_sec` | The moment of the drop. Empty when there was none |
| `trigger_captured_on` | Which pull of the curve was used |

**`vsl_script_sections`** — one row per beat. **This is the table that lets a timestamp
point at words.**

| Column | Plain meaning |
|---|---|
| `script_id` | Which script version |
| `beat_no` | 1 to 16, from `docs/ads/RULES.md:447-466` |
| `beat_name` | "the three ways it usually goes" |
| `body` | The words of this beat and nothing else |
| `word_start` / `word_end` | Running word numbers where this beat starts and ends |
| `start_sec` / `end_sec` | Estimated start and end time. Empty when the rate is unset |
| `timing_source` | `estimated_150wpm` or `measured`. **A screen must never show a guess as a measurement** |
| `words_per_minute` | The rate used, saved on the row, so changing `docs/ads/RULES.md:210` later does not silently rewrite old numbers |
| `changed_from_parent` | Was this the one beat that got rewritten |

Rules on it: `(script_id, beat_no)` is one of a kind, and `beat_no` must be between 1 and
16.

**`vsl_script_videos`** — the link that closes the loop.

| Column | Plain meaning |
|---|---|
| `script_id` | Which version was filmed |
| `youtube_video_id` | Which video came out of it |
| `utm_content_ad_id` | The ad number. Empty when it is not running as an ad yet — **not a defect** |
| `confirmed_by` / `confirmed_at` | Who said so, and when |

**Why this last table has to exist.** The watch data arrives keyed by a YouTube video id.
The script is a row keyed by an internal id. **There is no shared field.** YouTube hands
back a title (`src/analytics/youtube.mjs:174`) and the skill is forbidden from giving a
script a title (`.cursor/skills/fundhub-ad-writer/SKILL.md:32-36`). So there is literally
nothing to match on and no clever join will invent one.

**One person, one click, once per video. That is the price and there is no way around it.**

One idea I looked at and am rejecting so nobody re-opens it: `ads.asset_id` in
`db/migrations/046_ad_platforms.sql` already points from a live ad back to the creative it
came from. But that connects a script to a **Meta** ad, not to a **YouTube** video —
different platform, different id. And no Meta connection exists anyway
(`docs/workflows/marketing-e2e.md:269`). It does not solve this.

#### PROPOSED `db/migrations/379_creative_checker_failures.sql`

Add one column, `checker_failures`, to `creative_assets`. Empty means the checker never
ran on this row — which is the true answer for every row that exists today and for every
picture. An empty list means it ran and found nothing. **Those two are different and must
stay different**, for the same reason written at
`db/migrations/301_creative_copy_text.sql:48-60`.

### The empty-versus-zero rule, applied

| Situation | What is stored | What the screen says |
|---|---|---|
| YouTube gave no curve | no rows | "No drop-off data yet" |
| Too few views to trust | rows stored, no verdict worked out | "Not enough views yet" |
| Genuinely nobody watched past that point | `audience_watch_ratio = 0` | "0% still watching" |
| Video length unknown | `elapsed_sec` empty | shown as a percentage, not a time |
| Script never rewritten from anything | `parent_script_id` empty | "First version" |
| No video linked yet | no `vsl_script_videos` row | "Not linked to a video yet" — **not an error** |

---

## The screens

`docs/UI-STANDARDS.md` is law for anything under `public/app/`. **Hard rule honoured: no
new page, no new tab, no new menu row** (`.cursor/skills/fundhub-ad-writer/SKILL.md:38-39`).
Everything below lands inside `public/app/creative-factory.html`, which already exists.
`public/app/campaign-manager.html` gets **no change**.

### Screen 1 — the "Video performance" card, which is already there

Today it lives at `public/app/creative-factory.html:582-612` and shows:

- A coloured chip with the connection state (`:586`).
- A **Sync now** button (`:587`).
- A six-column table (`:592-594`): **Video | Date | Views | Watch time | Avg view
  duration | Avg view %**.
- Below it, three boxes — Client ID, Client secret, Refresh token — and a **Connect**
  button (`:600-611`). Connect checks the details against Google before saving anything,
  and if Google refuses, Google's own sentence is shown
  (`api/analytics/youtube-connect.mjs:103-115`).
- Missing numbers show as a grey dash, never a zero.

**PROPOSED: one more column, "Biggest drop."**

- Reads `0:42 · −12 pts` when a cliff was found.
- Reads `—` when there is no curve at all.
- Reads `not enough views` when there were too few views to trust.
- Sorting on it puts the worst video first.
- **No chart on the card.** `docs/UI-STANDARDS.md:55` — the big number, not a chart.

**Clicking a row opens the side panel.** That panel already exists at
`public/app/creative-factory.html:694` and is already used for assets at `:2044`. Nothing
new is created.

### Screen 2 — the video side panel (PROPOSED, alongside the existing one)

Four sections, using the same layout blocks already used at
`public/app/creative-factory.html:2046-2095`:

1. **The basics** — video, views, watch time, when it was last synced.
2. **Where people leave** — one big sentence: *"Half your viewers are gone by 0:42."* Under
   it, the three steepest drops with their times.
3. **The words you were saying** — the beat that covers that moment, its number, its name,
   and its full text. Then, and this is not optional, a plain-words warning:
   *"This is an estimate. It comes from counting words at 150 a minute, not from the video
   itself. The real moment may be a few seconds either side."* Grounded in
   `docs/ads/RULES.md:208-215`.
   **A second warning belongs here too:** the curve is always 100 points, so on a longer
   video each point covers more time
   (`docs/specs/marketing-e2e/youtube-api-ground-truth.md:78-97`). The curve finds the
   *section* that loses people. It can never blame one sentence.
4. **Not linked yet** — when no video-to-script link exists, this replaces section 3. A
   short list of scripts and one button, **"This is the script."** One click, once per
   video, forever.

**One main button in the panel: "Write a new version of this part."**
`docs/UI-STANDARDS.md:10` — one main action. It is switched off, with the reason shown,
when no script is linked or when the drop lands in the refusal or the safety close.

All four states are required by `docs/UI-STANDARDS.md:45-50`: loading, empty
("No drop-off data yet. Press Sync now."), error (the connection's own words in the
caption at `public/app/creative-factory.html:589`), and full.

### Screen 3 — the asset side panel, "The words" section

It already shows the words at `public/app/creative-factory.html:2062`.

**PROPOSED: three lines added under the words when the asset is a VSL script.**

- *"Version 3 of this script."*
- *"Written because half the viewers were gone by 0:42 in the last cut."*
- *"Only beat 5 changed. The other fifteen are word for word the same as version 2."* —
  with version 2 clickable, opening in the same panel.

Version 1 shows one line: *"First version. No earlier one."*

### Screens 4 and 5 — the review queue and the jobs list

**No change, and that is the point.** A rewritten script is an ordinary creative row
waiting for approval, and an ordinary queued job. It lands in the queue that already
exists and Chris approves it the way he already does. Do not build a second approval path.

---

## How a drop turns into new words — the loop, step by step

### Step 1 — something notices the drop

PROPOSED, and nothing like it exists today. Two rules worked out from the curve, neither
of them stored:

- **The cliff.** Any short stretch where the share still watching falls by more than a set
  number of points.
- **The half-gone mark.** The first moment the share still watching drops below half.

Plus a floor of views, under which no verdict is given at all and the screen says "not
enough views yet" rather than showing a zero — the rule already written into the database
at `db/migrations/302_analytics_connections.sql:111-113`.

**Both threshold numbers are proposals. Chris has never set them.** They belong in one
place in one file so changing them is a one-line edit, the same way the speaking rate is
handled at `docs/ads/RULES.md:210`.

### Step 2 — the moment maps back to a line

**Today this is impossible.** Nothing in this repository stores a script with timing.

PROPOSED, honestly: store the script broken into its sixteen beats with a running word
count on each. Then turn a time into a word using the 150-a-minute rate:
0:42 × 150 ÷ 60 = **word 105**. Whichever beat covers word 105 is the suspect.

Three things must be said out loud on the screen or this becomes a lie:

- It is an **estimate**, not a measurement. `docs/ads/RULES.md:208-215` says so itself.
- The error **grows** the further into the script you go.
- The answer is a **beat**, never a sentence — and YouTube's own resolution says the same
  thing independently (`docs/specs/marketing-e2e/youtube-api-ground-truth.md:94-97`).

The one upgrade that would remove the guess is YouTube's caption track, which carries real
timings. `src/analytics/youtube.mjs` calls no captions address anywhere. **UNKNOWN** —
do not write code against it until somebody has made one real call.

### Step 3 — what gets rewritten

**One beat. Not the whole script, not one line.**

One line is too small; people quit over ten or fifteen seconds, not one sentence. The
whole script is too big, and the repo already says why: `docs/ads/RULES.md:540` — changing
two things at once means you cannot tell what moved the number.

**Fifteen beats stay word for word identical. One is replaced. The result is still a whole
script**, because you cannot film half a VSL.

Two beats can never be the one that changes: **beat 15, the refusal**
(`docs/ads/RULES.md:473-477`, "A VSL without it is not our VSL") and **beat 14, the safety
close** (`docs/ads/RULES.md:466`). If the drop lands inside either, the rewrite takes the
beat before it instead.

### Step 4 — what rules the rewriter reads

Through a swappable loader (`.cursor/skills/fundhub-ad-writer/SKILL.md:39-49`), never by
opening files inside its own writing logic:

| Source | What it supplies |
|---|---|
| `docs/ads/RULES.md:438-480` | Length, the sixteen beats, the VSL-only rules |
| `docs/ads/RULES.md` Part 1 | The hard no's and banned words |
| `docs/ads/VOICE.md` | Before/after lines showing how Chris actually talks |
| `docs/ads/CONTROLS.md:333` | The Founder VSL. **Read, never written** (`docs/ads/CONTROLS.md:1`) |
| `docs/ads/CONCEPTS.md` | A replacement angle for the beat being rewritten |
| `docs/ads/ASSET-BANK.md` | The proof that is allowed — nothing else (`docs/ads/RULES.md:417-427`) |
| `docs/ads/rules-data.mjs` | The machine lists, so the writer and the checker agree |
| PROPOSED — the fifteen unchanged beats | So the new beat joins onto what sits either side of it |

PROPOSED `src/creative/rules-loader.mjs` — one function returning all of that as plain
text. `src/creative/providers/copy.mjs:90` asks the loader instead of hard-coding four
sentences. Tonight the loader opens markdown files; later it reads a brand's row in the
database, and the writing never changes.

### Step 5 — the checker runs before Chris sees it

**Inside the writer, not after it.** `checkOneScript` is already exported at
`scripts/ads/check-script.mjs:406`, so nothing new has to be written to call it.

1. The writer produces the full sixteen-beat script.
2. It builds the labelled block the checker understands
   (`scripts/ads/check-script.mjs:71-86`), and **the RUNTIME line must be there**, because
   that and nothing else is what applies the 700-900 band
   (`scripts/ads/check-script.mjs:464`).
3. It calls `checkOneScript`. Failures come back with a line number and a message.
4. Failures → rewrite → check again, inside the three-tries loop that already exists
   (`src/creative/generate.mjs:31`, `:147-178`).
5. Still failing after three tries: **the script is stored anyway, with its failures
   recorded.** Never thrown away. Same reasoning already written at
   `db/migrations/301_creative_copy_text.sql:48-60`.
6. Then the normal path continues, and a person approves.

**PROPOSED additions to `scripts/ads/check-script.mjs`, all three enforcing rules that
already exist in writing:**

| Check | Rule it enforces | Why it is missing today |
|---|---|---|
| `TYPE vsl` sets the band even with no RUNTIME line | `docs/ads/RULES.md:438-441` | `scripts/ads/check-script.mjs:464` reads RUNTIME only |
| The refusal is present | `docs/ads/RULES.md:473-477` | Nothing looks for it |
| All sixteen beats, in order | `docs/ads/RULES.md:443-466` | Nothing looks for them |

**The beat markers must NOT be written inside the script file.** The checker puts every
unlabelled line under whichever label came last
(`scripts/ads/check-script.mjs:120-143`), so a line reading "— beat 5 —" inside the body
would be scanned for banned words and counted in the word total. The beat boundaries live
in the database. The file the checker reads is clean spoken words and nothing else — the
same rule already written for teleprompters at
`docs/journeys/ad-script-flow.md:120-124`.

### The endpoints this needs

`netlify/functions/api.mjs` holds a hardcoded list of routes. **A handler that is not in
that list returns "not found" everywhere, and this has shipped twice** (`CLAUDE.md` §12).
The existing marketing entries are confirmed at `netlify/functions/api.mjs:583`, `:586`,
`:587`, `:747` and `:753`.

All PROPOSED:

| # | What it does | New file | Sits next to |
|---|---|---|---|
| 1 | Pull the curve — **fold into the sync that already exists**, so no new route and no second button | none | `api/analytics/youtube-sync.mjs` |
| 2 | Read one video's curve | `api/read/video-retention.mjs` | `netlify/functions/api.mjs:583` |
| 3 | Read one script's beats and version history | `api/read/vsl-script.mjs` | `netlify/functions/api.mjs:583` |
| 4 | Link a video to a script — the one thing a machine cannot do | `api/creative/link-video.mjs` | `netlify/functions/api.mjs:753` |
| 5 | Ask for a rewrite of one beat | `api/creative/rewrite-section.mjs` | `netlify/functions/api.mjs:753` |

Each new file needs its import line added too — the list alone is not enough.

Number 5 **does not call a model.** It queues a job the same way everything else does
(`src/creative/generate.mjs:41`) and the existing two-minute timer does the rest
(`netlify.toml:141-142`). It must pass a repeat-proof key, because
`src/creative/generate.mjs:49-52` refuses to make one up, and an offer type, because
`api/creative/generate.mjs:105-112` requires it.

Reads 2 and 3 must copy the login checks at `api/read/video-stats.mjs:35-37` and the
staff-scoped query wrapper at `:45`. **That wrapper is not optional** — without it the
query comes back empty and silently looks like "no data yet"
(`api/read/video-stats.mjs:16-19`).

**Also needed, and it is not an endpoint:** a timed job for the YouTube sync in
`netlify.toml` next to the five at lines 135-153. Once a day is enough. Without it the
curve is only as fresh as the last button press.

---

## Writing a VSL from scratch, before any watch data exists

**The seed is `docs/ads/CONTROLS.md:333` — the Founder VSL.** `docs/ads/RULES.md:433-434`
says every rule in the VSL section was taken from that script, not invented. The file is
locked: `docs/ads/CONTROLS.md:1` and `.cursor/skills/fundhub-ad-writer/SKILL.md` both say
never rewrite it.

**The format:** 700-900 words, 5 to 6 minutes at 150 a minute
(`docs/ads/RULES.md:438-441`). The checker allows 630 to 990
(`docs/ads/rules-data.mjs:176`).

**The sixteen beats, in order**, quoted from `docs/ads/RULES.md:447-466`:

| # | Beat |
|---|---|
| 1 | Call out who it is for, and ask for a couple of minutes |
| 2 | Who I am — name, founder, close to a decade |
| 3 | What I keep seeing — good owners with solid credit, blocked from money |
| 4 | Why I built it — "I got tired of watching that happen" |
| 5 | The three ways it usually goes — bank denies, consultant burns them, DIY stacks inquiries |
| 6 | The check-in — "Does any of that sound familiar?" The one place a question belongs |
| 7 | The absolution — none of it happened because they were not qualified |
| 8 | What it really cost — the plan behind the money |
| 9 | The near-miss — "like it's literally one thing away" |
| 10 | "That's not on you." Then name where it is on |
| 11 | Proof — decade, $25 million, Koi Poke |
| 12 | The mechanism, in full, step by step. The only place it is explained at length |
| 13 | What happens when you click |
| 14 | The safety close — no hard inquiry, no obligation, nothing moves, costs nothing |
| 15 | **The refusal.** Required |
| 16 | CTA and the cost of waiting |

Non-negotiables from `docs/ads/RULES.md:468-480`: cause first in the opening fifteen
seconds; the mechanism explained once, at beat 12; the refusal at beat 15 is required;
never promise what they will *get* on the call, only what he will *show* them; one real
case study, and today that is Koi Poke.

Proof is capped at three things (`docs/ads/RULES.md:417-427`): close to a decade in
business funding, over $25 million secured, Koi Poke. Anything else is a made-up win.

**The heading carries no name.** `.cursor/skills/fundhub-ad-writer/SKILL.md:32-36` — only
Chris names an ad. A blank title is not a problem to fix.

**In the database, version 1 is:** one script row at version 1 with no parent and reason
`first_draft`; sixteen beat rows, none marked as changed; and **no video link at all**
until Chris films it and links it. That is the correct empty state, not a gap.

---

## Definition of done

A human can tick each of these one at a time.

**The curve arrives**
1. `db/migrations/377_video_retention_curve.sql` is applied and `/api/health` shows
   nothing pending.
2. The YouTube sync pulls the curve and writes rows into the new table.
3. A video YouTube gave no curve for writes **no row at all** — confirmed by looking, not
   assumed.
4. A database-backed test proves 2 and 3 against a real database. A skipped test is not
   green (`CLAUDE.md` §12).

**The script gets structure**
5. `db/migrations/378_vsl_scripts.sql` and `379_creative_checker_failures.sql` are applied.
6. The Founder VSL from `docs/ads/CONTROLS.md:333` is loaded as version 1, sixteen beats,
   and the beat word counts add up to the whole script.
7. Every one of the three new tables refuses a read when the person is not staff. Proved
   by a test, not by reading the rule.

**The link closes**
8. Chris clicks "This is the script" on one video and the link row appears.
9. Both new read endpoints are in the route list in `netlify/functions/api.mjs`, and
   `src/http/routes.test.mjs` passes.

**The rewrite works**
10. `src/creative/rules-loader.mjs` exists and `src/creative/providers/copy.mjs` gets its
    rules from it, not from the four hard-coded sentences at `:90-98`.
11. `src/creative/providers/copy.mjs` calls `checkOneScript` and will not hand back a
    script that failed, until three tries are used.
12. A script that still fails after three tries is stored with its failures recorded,
    never dropped.
13. `scripts/ads/check-script.mjs` now fails a VSL missing the refusal, fails one missing
    a beat, and applies the 700-900 band when `TYPE vsl` is present with no RUNTIME line.
    Three new tests in `scripts/ads/check-script.test.mjs`.
14. A rewrite changes exactly one beat. The other fifteen are identical to the parent, and
    a test proves it.

**Chris can see it**
15. The "Video performance" card shows a "Biggest drop" column, and shows a dash or "not
    enough views" rather than a zero when there is no answer.
16. Clicking a video row opens the panel, shows the drop, shows the beat, and says in
    plain words that the timing is an estimate and that the curve finds a section, not a
    sentence.
17. No new page, no new tab, no new menu row anywhere.
18. All four states — loading, empty, error, full — work on the new column and the new
    panel.

**The gates** (`CLAUDE.md` §6)
19. `npm run lint` clean.
20. `npx tsc --noEmit` clean.
21. Full test suite green against a real database, zero skips, and where it was measured
    written down.
22. Playwright check on the changed screen.
23. `docs/journeys/ad-script-flow.md` updated in the **same commit** as the code, and one
    line appended to `docs/journeys/CHANGELOG.md`.
24. Every screenshot shown to Chris has red boxes on the exact thing being discussed,
    numbered, with a caption legend (`CLAUDE.md` §8).

**The real test**
25. Somebody who did not build it opens the screen cold and can say, without asking a
    question, where people are quitting the VSL.

---

## UNKNOWN — blocked or unverifiable

| # | What | Why it is unknown |
|---|---|---|
| 1 | **DECISION, and it gates this whole lane: where does the VSL live from now on — a file on our own site, YouTube, or both?** | Today it is a file on our own site (`docs/workflows/cf-vsl-watch-html-step1.html:118-119`, `public/funnel/vsl.mp4`) and **no YouTube number describes it**. Everything else in this lane branches on this one answer |
| 2 | **YouTube client id, client secret and refresh token** | Chris has not supplied them. The three boxes at `public/app/creative-factory.html:600-611` are empty, so no connection row exists and nothing here has ever run against real data |
| 3 | Which permission the existing refresh token carries | No permission string appears anywhere in this repository. `src/analytics/youtube.mjs:95-128` just posts the token and uses whatever comes back. The one needed is named at `docs/specs/marketing-e2e/youtube-api-ground-truth.md:194` |
| 4 | Whether Chris's channel holds the VSL, or any video at all | Needs a live call. Cannot be checked from the code |
| 5 | Whether the retention report works at all on this channel | It needs channel-owner permission. Cannot be checked without item 2 |
| 6 | Whether the four-number summary report accepts a per-video filter | `src/analytics/youtube.mjs:33-40` says no such filter exists. The ground-truth file proves the **retention** report requires one (`youtube-api-ground-truth.md:55`), so the comment is wrong at least for that report. Whether it is also wrong for the summary report is not settled either way |
| 7 | Whether YouTube's captions could supply real timings and remove the 150-a-minute guess | No captions address is called anywhere in `src/analytics/youtube.mjs`. Format and permission unverified |
| 8 | The YouTube Analytics daily request allowance | `docs/specs/marketing-e2e/youtube-api-ground-truth.md:203` says Google's page states no figure. Nothing in this repository states one either. It matters because retention is one request per video |
| 9 | Whether the uploads list includes private and unlisted videos | Not stated in Google's own page. If it does not, an unlisted video would sync with a blank title, because the title map is built from that list (`api/analytics/youtube-sync.mjs:130`) |
| 10 | **The speaking rate** | `docs/ads/RULES.md:208-215` states plainly that 150 a minute is a choice and nobody has timed a filmed ad. **Every timestamp this design produces inherits that guess.** One filmed ad, one stopwatch, one number written down would fix it forever |
| 11 | **The threshold numbers** — how big a fall counts as a cliff, and how few views is too few | These are proposals. Chris has never set them. They should live in one place so changing them is a one-line edit |
| 12 | Whether a rewrite may ever change more than one beat | `docs/ads/RULES.md:540` states the one-change-at-a-time principle but writes it inside the evergreen section. Whether it binds VSLs is written nowhere. One beat is the recommendation; Chris decides |
| 13 | **DECISION: is the snapshot date the shape Chris wants?** | `api/analytics/youtube-sync.mjs:11-17` asks this question in the code and it has never been answered. It decides whether rows may be added together, and `src/ops/weekly-brief.mjs:88-95` adds them today |
| 14 | Whether a per-day breakdown can be asked for alongside the per-video one in a single request | Not stated in the ground-truth file. This decides whether item 13 is fixed with one request or many |
| 15 | Whether the Founder VSL was ever filmed and uploaded | Nothing in the repository says. No video means no curve and the loop has nothing to start on |
| 16 | Meta's exact video field names | `src/adplatforms/meta.mjs:132` asks for none of them, `ad_metrics_daily` has no columns for them (`db/migrations/046_ad_platforms.sql:432-457`), and this lane did not verify the field names against Meta's own reference. Do not build on remembered names |
| 17 | **Meta ad account connection** | No connection row exists (`docs/workflows/marketing-e2e.md:269`), so Meta's video numbers cannot be pulled and "was this script filmed" cannot be answered that way |
| 18 | **Microsoft Clarity project ID** | `public/js/clarity.js:27` is empty by design and Chris has not supplied one. It is also not loaded on the VSL page even if it were set |
| 19 | **ClickFunnels API key** | Not supplied. No ClickFunnels number has ever been fetched live |
| 20 | **DECISION: does ClickFunnels "conversions" mean opt-ins or sales?** | `src/analytics/clickfunnels.mjs:255` counts opt-ins today. Owner's call. Not touched |
| 21 | **DECISION: may `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected?** | Owner's call. Outside this lane, listed because it was named as blocked |

### Two corrections to earlier writing, so nobody repeats them

- **Migration numbers.** `docs/workflows/marketing-e2e.md:214-216` says the highest is 303.
  An earlier pass of this lane said 366. **Both are wrong.** Counted on disk 2026-09-08:
  242 files, highest `db/migrations/376_checkout_expiry_and_escalation_fk.sql`. The next
  free numbers are **377, 378, 379.**
- **How precise the curve can be.** An earlier pass implied the drop-off curve could point
  near a single line of script. It cannot. YouTube always returns 100 points, so on a
  longer video each point covers more time
  (`docs/specs/marketing-e2e/youtube-api-ground-truth.md:78-97`). The curve finds the
  section that loses people. Any screen that claims more than that is lying.
