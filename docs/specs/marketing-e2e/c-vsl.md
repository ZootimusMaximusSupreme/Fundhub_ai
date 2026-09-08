# Lane C — VSL generation and video watch data

**Written:** 2026-09-08. **Branch:** `main`. **Phase 1 — no app code was changed. This file
is the only thing this lane created.**

Every claim about something that exists has a file and a line next to it. Everything that
does not exist yet is marked **PROPOSED**. Where a number could not be checked, it says
**UNKNOWN** instead of guessing.

**Three reviewers went over an earlier draft of this file and found real errors in it.**
Every anchor into `docs/specs/marketing-e2e/youtube-api-ground-truth.md` was pointing at
the wrong line. It claimed a screen exists that Chris cannot open. It claimed an invented
rule was already in the database. Those are all corrected below, and the corrections are
listed at the end so the same mistakes do not come back.

**This file agrees with `docs/specs/marketing-e2e/vsl-measurement-truth.md`.** Where the
two ever differed, that file was right and this one has been changed to match. The one
place they still disagree is written down in "Where this file and the truth file
disagree" near the end.

---

## What Chris gets when this is done

**Say the honest thing first: today nobody is counting the VSL, and the first job is to
start counting it.**

When this is built:

- He sees how far people get into the VSL on the funnel page — **to the second**, because
  it is our own video on our own site.
- He sees how many quit, and where.
- He sees which people who watched went on to book a call.
- He clicks a bad moment and sees the part of the script he was saying then.
- He presses one button and gets a fresh version of just that part, already run through
  the ad-rules checker, with the rest of the script left word for word the same.

**What he does not get, and this matters:** a way to know whether the rewrite worked. That
needs the new version filmed, uploaded, and enough people watching both cuts. None of that
is in this build. It is written up under "The loop does not close yet" below.

Nothing gets filmed, named, or published by a machine. Chris still decides all of that —
that is the standing rule at `.cursor/skills/fundhub-ad-writer/SKILL.md:32-36` (only Chris
names an ad) and `:37-38` (never add a page, tab or menu row).

---

## What exists today

### The headline fact — read this first

**The video on the funnel page is not a YouTube video.** It is a plain movie file sitting
on Fundhub's own website.

- `docs/workflows/cf-vsl-watch-html-step1.html:118-119` is a plain video tag pointing at
  `https://fundhub.ai/funnel/vsl.mp4`.
- The same address appears at `clickfunnels-fragments/01-vsl.html:134-135`.
- The movie is in this repository: `public/funnel/vsl.mp4`. Listing the folder on
  2026-09-08 shows one file and nothing else: 22,212,001 bytes, dated 2026-09-07.
- **Its length is 207.215 seconds — 3 minutes 27 seconds.** Read out of the file's own
  `mvhd` header on 2026-09-08 (timescale 1000, 207,215 units). The same number is recorded
  independently at `docs/specs/marketing-e2e/vsl-measurement-truth.md:30`.
- `public/_headers:64-65` sets `Content-Type: video/mp4` on `/funnel/vsl.mp4`.
- The master copy is `clickfunnels-fragments/assets/VSL.mov`, 37,776,474 bytes. **It is
  207.206 seconds long** — read from its header the same way. So the master and the
  published mp4 are the same cut, nine thousandths of a second apart.

The player has one script attached. The script block runs
`docs/workflows/cf-vsl-watch-html-step1.html:128-141`, and the twelve lines of code inside
it are `:129-140`. It does three things: turn the sound on, rewind to zero, show the
normal video controls. **It sends nothing anywhere.** No play count, no quit point, no
beacon.

**So every YouTube number in this app describes videos on the YouTube channel. None of
them describes the video on the funnel page.** Today, if Chris asks "how far into my VSL
do people get?", the honest answer is: nobody is counting.

Microsoft Clarity would at least have recorded the screen, but it is switched off.
`public/js/clarity.js:27` reads `var CLARITY_PROJECT_ID = "";` and lines 29-32 stop dead
when it is empty. It is loaded on exactly three pages — `public/index.html:783`,
`public/optimize.html:579` and `public/start.html:67` — and **not** on the VSL page. It is
also not deployed at all: `docs/specs/marketing-e2e/vsl-measurement-truth.md:180-182`
records that `https://fundhub.ai/js/clarity.js` returns 404 and the live homepage
mentions Clarity nowhere.

### There are five videos in the funnel, not one

| Video | Where the player is | What it reports today |
|---|---|---|
| The main VSL, `vsl.mp4` | `docs/workflows/cf-vsl-watch-html-step1.html:118-119` | **Nothing.** File is on disk, 207.215 s |
| `slo-vsl.mp4` | `clickfunnels-fragments/slo/slo-01-sales.html:200` and `clickfunnels-fragments/slo/preview/01-sales.html:213` | **Nothing.** File does not exist |
| `slo-vsl2-funding.mp4` | `clickfunnels-fragments/slo/slo-03-thank-you.html:129` and `preview/03-thank-you.html:142` | **Nothing.** File does not exist |
| `slo-vsl3-repair.mp4` | swapped into the same player by script at `clickfunnels-fragments/slo/slo-03-thank-you.html:200-203` | **Nothing.** File does not exist |
| The client-portal welcome video | `public/app/client-portal.html:1262`, listener at `:1303` | **Nothing is recorded.** The listener only paints a clock on screen. This one already knows who the viewer is, so per-person watch data is genuinely possible here |

**Three of the four funnel files are missing, plus a poster image.** `public/funnel/` holds
exactly one file, `vsl.mp4`. Searching the whole repository for `slo-vsl` finds only page
markup and to-do notes, never a file. `TODO.md:196-197` lists `slo-vsl.mp4` plus a poster,
`slo-vsl2-funding.mp4` and `slo-vsl3-repair.mp4` and says all of them come out of the
shoot. `clickfunnels-fragments/slo/README.md:18` says the same. So it is three of three
missing, plus `slo-vsl-poster.jpg`. **The pages are written and live; the videos are not
made yet.**

**One page shows two different videos to two different people.**
`clickfunnels-fragments/slo/slo-03-thank-you.html:200-203`: when the web address carries
`?track=repair`, a script replaces the player's source with `slo-vsl3-repair.mp4`. The
same player element, `fh-vsl2`, plays a different film. `clickfunnels-fragments/slo/README.md:14`
documents it. **Anything we build must record which file actually played, not which player
it played in**, or those two videos are reported as one.

**Wistia, Vimeo and Mux:** no player from any of them is used on any page in this repo. Two
of the names do appear, and they are unrelated to the funnel: `package.json:34` and `:36`
define scripts named `notion:vimeo` and `notion:captions`, and
`scripts/notion-legacy-transcribe.mjs:37-38` recognises `vimeo.com` and `wistia` addresses.
That is Notion import tooling.

### The four numbers the app pulls from YouTube

`src/analytics/youtube.mjs:195`:

```
metrics = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage"
```

The rest of that request is at `src/analytics/youtube.mjs:196-204`: `ids=channel==MINE`,
a start date, an end date, `dimensions: "video"`, `sort: "-views"`, `maxResults: "50"`.

In plain words, those four numbers are: how many plays, how many minutes in total, how
many seconds the average person watched, and what percent of the video the average person
got through. **That is a summary. It cannot tell you where anybody left.**

### The video list

`src/analytics/youtube.mjs:151` asks YouTube for the channel's uploads list, then walks it
at `:161-180`, fifty at a time, up to forty pages (`:49`). From each video it keeps
**three things only** (`:172-176`): the video's id, its title, and the day it was posted.
Everything else is thrown away.

**The app never asks YouTube for the facts about a video.** No call anywhere asks for video
length, description, tags, thumbnail, privacy setting, likes or comments.

**There are four YouTube addresses in the code, not three.** An earlier draft of this file
said three and said the search covered `src/` and `api/`. It missed one that is in `api/`:

- `src/analytics/youtube.mjs:42` — the token address
- `src/analytics/youtube.mjs:43` — the Data API base
- `src/analytics/youtube.mjs:44` — the Analytics base
- `api/analytics/youtube-connect.mjs:45` — a hard-coded call to
  `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true`, used to look up the
  channel id at connect time

The conclusion is unchanged: **not one of the four asks for a video's length, description,
tags or thumbnail.** But the count and the word "only" were wrong.

### The pipes and the screen

| Thing | Where |
|---|---|
| Save the three YouTube login details | `api/analytics/youtube-connect.mjs:78-87`, checked against Google before saving (`:103-115`), stored scrambled (`:91`) |
| Pull the numbers | `api/analytics/youtube-sync.mjs`, window is `days` back from today, default 30, capped at 365 (`:67-68`) |
| Write the rows | `api/analytics/youtube-sync.mjs:137-152` |
| Read them back | `api/read/video-stats.mjs:54-58` |
| The screen | `public/app/creative-factory.html:582-612` — **in the repo only, see below** |
| Routed in the repo | `netlify/functions/api.mjs:583`, `:586`, `:587` |
| **NOT on the live site** | **Measured 2026-09-08.** `https://fundhub.ai/api/read/video-stats`, `/api/analytics/youtube-connect` and `/api/analytics/youtube-sync` all return **404**. For comparison `/api/read/ad-books` and `/api/creative/library` return **401**, which is what a routed endpoint looks like. **The deployed build predates these files.** |
| Weekly summary uses it | `src/ops/weekly-brief.mjs:79-97` |

**Nothing in that table can be clicked by Chris today.** Not because it is broken, but
because the live site is older than `main`. Until `main` is deployed, all of it is repo-only.

### The writing rules that already exist

| Thing | Where | What it is |
|---|---|---|
| The ad SOP | `docs/ads/RULES.md` (608 lines) | Law |
| VSL length | `docs/ads/RULES.md:438-441` | 700-900 words, 5-6 minutes at 150 words a minute |
| **The sixteen beats** | `docs/ads/RULES.md:443-466` | Fixed order. "Beats can be short; none can be skipped" (`:445`) |
| VSL-only rules | `docs/ads/RULES.md:468-480` | The refusal at beat 15 is required (`:473-477`). The mechanism is explained once, at beat 12 (`:472`) |
| Speaking rate | `docs/ads/RULES.md:208-215` | 150 words a minute, and the file says plainly it is a guess nobody has timed |
| Machine-readable bands | `docs/ads/rules-data.mjs:172-177` | VSL band: 700-900, allow 630-990 |
| **The voice seed** | `docs/ads/CONTROLS.md:333-403` | The Founder VSL, 841 words. `docs/ads/CONTROLS.md:1` marks the file `# LIVE — DO NOT EDIT` |

So **a VSL format already exists in writing.** It is `docs/ads/RULES.md` "Section 2 —
VSLs" at line 431, running to line 481. `docs/ads/RULES.md:433-434` says the section was
taken from the Founder VSL, "not invented", and puts that script at 841 words.

### The speaking rate is already provably wrong, and the repo proves it

This is the single most important correction in this file.

- The Founder VSL is **841 words**. Counted on disk from `docs/ads/CONTROLS.md:335-403`
  on 2026-09-08: 841. `docs/ads/RULES.md:434` and `:440` independently say 841.
- The filmed video is **207.215 seconds**.
- 841 ÷ 207.215 × 60 = **243 words a minute.**

The rules say 150 (`docs/ads/RULES.md:208-215`). **The real rate, if that file is that
script, is about 243 — sixty per cent faster.** Every timestamp this whole design would
produce is wrong by roughly that much.

There is a fork here and this file cannot close it:

- **Either** `public/funnel/vsl.mp4` is the Founder VSL, and 150 must be replaced with a
  measured number before any timestamp is shown to anybody,
- **or** it is a different, shorter script that exists nowhere on disk, and then the
  written 700-900 word / 5-6 minute band at `docs/ads/RULES.md:438-441` does not describe
  the video we actually ship.

Either way, **3 minutes 27 seconds is under the 5-6 minute band the rules treat as law.**
Somebody has to watch the file and answer one question: is this the Founder VSL? It is
listed as UNKNOWN item 1.

### What the checker knows about a VSL — the exact answer

`scripts/ads/check-script.mjs` is 575 lines. Searching it for `vsl` finds **three code
lines**, not two:

1. `scripts/ads/check-script.mjs:108` — a heading containing "VSL" makes a block count as
   a script worth checking.
2. `scripts/ads/check-script.mjs:396` — `if (/2\s*min/.test(t) && !/vsl/.test(t))`. A guard
   that stops a VSL being dropped into the 2-minute band.
3. `scripts/ads/check-script.mjs:397` — the 700-900 word band is picked when the
   **RUNTIME** line contains `vsl`, `5-6 min`, `700` or `900`.

**That is all.** There is no check for the sixteen beats. There is no check for the
required refusal line. Three holes follow, each one real:

- **A `TYPE vsl` line does nothing for length.** `scripts/ads/check-script.mjs:464` reads
  the band from the RUNTIME line only. So a 200-word "VSL" with no RUNTIME line passes
  everything except the 135-word floor (`scripts/ads/check-script.mjs:382-386`, floor set
  at `docs/ads/rules-data.mjs:181`).
- **A VSL written as plain paragraphs is never checked against the 700-900 band.**
  `scripts/ads/check-script.mjs:483` passes "no band" for that shape, and `:386` returns
  early when there is no band. The 135-word floor still applies, because `:382-386` runs
  on every script whatever its shape. **So a 300-word "VSL" written as paragraphs
  passes.** Plain paragraphs is exactly the shape the Founder VSL is in
  (`docs/ads/CONTROLS.md:335-403`, and `scripts/ads/check-script.mjs:470` says so).
- **The refusal is not checked.** `docs/ads/RULES.md:473-477` says a VSL without it "is
  not our VSL". Nothing in the checker looks for it.

### How a script gets written today

In plain words: Chris (or a timer) asks for copy, the request waits in a queue, a
background job picks it up, a model writes the words, and the words are saved for a person
to approve. **The checker is never part of that.**

The seven steps, with anchors, for whoever builds it:

1. A request arrives at `/api/creative/generate` (`api/creative/generate.mjs:70`). It
   demands a repeat-proof key (`:89`) and an offer type (`:106`).
2. That calls `enqueue()` (`src/creative/generate.mjs:41`), which writes one waiting job.
3. Either the every-two-minutes timer `creative-job-runner` (`netlify.toml:141-142`) or a
   press of "Run queued jobs now" picks it up (`src/creative/generate.mjs:115`).
4. `run()` (`src/creative/generate.mjs:147`) calls the writer, trying up to three times
   (`src/creative/generate.mjs:31`).
5. The writer is `src/creative/providers/copy.mjs`.
6. The words are saved (`src/creative/generate.mjs:215`) in the `copy_text` column added
   by `db/migrations/301_creative_copy_text.sql:67`.
7. A person approves it. Nothing in that path can approve on its own.

**The checker never runs inside that path.** `scripts/ads/check-script.mjs` is a command a
person or a skill runs by hand. The writer and the checker have never met in code.

### What the model is actually told — corrected

An earlier draft said the writer's "whole instruction sheet is four hard-coded sentences at
`src/creative/providers/copy.mjs:90-98`." **Wrong twice.** Anybody rewriting this to read
from a loader would have missed two of the three pieces.

The model is handed **two** instructions, both built in `src/creative/providers/copy.mjs`
and both handed over together at `:36-40`:

| Piece | Where | What it holds |
|---|---|---|
| `systemPrompt` | `:89-112` | Six fixed lines at `:91-98` (one saying who the advertiser is, one heading the hard rules, then four bullets), **plus** a five-line credit-repair block added at `:99-107` when the offer type is `credit_repair`, **plus** a brand-voice line added at `:108-110` when a brand kit has one |
| `userPrompt` | `:116-125` | Three lines telling the model how many variants to write and that each must use a different angle |

**Both are hard-coded. Neither has ever heard of `docs/ads/RULES.md`, `docs/ads/VOICE.md`
or `docs/ads/CONTROLS.md`** — confirmed by searching everything under `src/creative/` for
those file names: nothing. The comment at `src/creative/providers/copy.mjs:85-88` says the
rules were copied in "by intent rather than by generation", which is exactly the thing a
loader would fix.

### What YouTube will actually give us

Settled for this batch in `docs/specs/marketing-e2e/youtube-api-ground-truth.md`, written
2026-09-08 from Google's own published pages.

**Every anchor below was wrong in the earlier draft — all nine were short by about
seventeen lines. These are the real ones, re-checked line by line on 2026-09-08.**

- The drop-off curve is asked for at
  `GET https://youtubeanalytics.googleapis.com/v2/reports` with
  `dimensions=elapsedVideoTimeRatio` and `filters=video==<ONE video id>`
  (`docs/specs/marketing-e2e/youtube-api-ground-truth.md:64-73`).
- **One video per request. There is no way to ask for a list**
  (`youtube-api-ground-truth.md:72`, explained at `:75-78`). Thirty videos means thirty
  requests.
- Five numbers come back (`youtube-api-ground-truth.md:80-88`). The two that matter most:
  `audienceWatchRatio` is the share still watching at that point — the shape of the drop
  (`:84`). `stoppedWatching` is how many people quit right there (`:87`).
  `totalSegmentImpressions` (`:88`) is how many times each chunk was viewed at all — **the
  only per-point count of people YouTube offers.**
- **The curve is always 100 points, whatever the video's length**
  (`youtube-api-ground-truth.md:95-96`). How many seconds each point covers therefore
  depends on the video's length (`:104-109`): 1.2 seconds on a 2-minute video, 6 on a
  10-minute one, 12 on a 20-minute one.
  **For a video the length of ours — 207.215 seconds — one point is 2.07 seconds.** That
  is the finest thing YouTube could ever say about it.
- The curve finds a **section**, never a sentence
  (`youtube-api-ground-truth.md:111-114`, "not precise enough to blame one sentence").
- **Replays, rewinds, skips and any per-person watch record cannot be had at all**
  (`youtube-api-ground-truth.md:196-201`). Everything is a total across everybody.
- The permission needed is `https://www.googleapis.com/auth/yt-analytics.readonly`
  (`youtube-api-ground-truth.md:211`).
- **The daily request allowance is UNKNOWN.** `youtube-api-ground-truth.md:220` records
  that Google's `reports.query` page states no quota figures at all.

**One correction to a comment in our own code.** `src/analytics/youtube.mjs:33-40` states
that "the contract's verified Analytics endpoint has no per-video filter." That is wrong
for the retention report, which *requires* `filters=video==` and refuses to run without it
(`youtube-api-ground-truth.md:72`). Whether the four-number summary report also accepts a
video filter is **UNKNOWN** — the ground-truth file does not say, and this lane did not
verify it.

### Everything YouTube would hand over that we ask for none of

`docs/specs/marketing-e2e/youtube-api-ground-truth.md:138-181` lists roughly twenty more
things. Chris asked for "all meta data etc.", so here is the whole inventory in the shape
that question needs. **Nothing in the "Can we get it today" column is a yes.**

| Field | Where it comes from | Can we get it today | Where it would be stored |
|---|---|---|---|
| Video length (duration) | YouTube Data API, `part=contentDetails` (`ground-truth:178-179`) | **No.** `src/analytics/youtube.mjs:151`, `:162` ask only for the channel and playlist items | PROPOSED `video_meta.duration_sec` |
| Description, tags, thumbnail, category, language | Data API `part=snippet` (`ground-truth:177-178`) | **No** | PROPOSED `video_meta` |
| Privacy setting | Data API `part=status` (`ground-truth:179`) | **No** | PROPOSED `video_meta` |
| View, like, comment counts | Data API `part=statistics` (`ground-truth:179`) | **No** | PROPOSED `video_meta` |
| Recording details | Data API `part=recordingDetails` (`ground-truth:180`) | **No** | PROPOSED `video_meta` |
| **Which outside website sent the viewer** | `dimensions=insightTrafficSourceDetail` (`ground-truth:145-146`) | **No** | PROPOSED, out of scope for this build |
| **Watches that happened on our funnel page** | `dimensions=insightPlaybackLocationDetail` with `filters=insightPlaybackLocationType==EMBEDDED` (`ground-truth:151-153`) | **No** | PROPOSED, out of scope for this build |
| Age band, sex | `dimensions=ageGroup`/`gender` with `metrics=viewerPercentage` (`ground-truth:157-158`) | **No** | PROPOSED, out of scope |
| Country, region, city | `dimensions=country`, `province`, `city` (`ground-truth:159-160`) | **No** | PROPOSED, out of scope |
| Device, operating system | `dimensions=deviceType`, `operatingSystem` (`ground-truth:164`) | **No** | PROPOSED, out of scope |
| Likes, comments, shares, subscribers gained/lost | `ground-truth:168-169` | **No** | PROPOSED, out of scope |
| Card impressions and clicks | `ground-truth:170-171` | **No** | PROPOSED, out of scope |

**Two of those are worth building and the rest are not, for this lane.** Video length,
because without it the curve can only be a percentage. And
`insightPlaybackLocationDetail`, because it is the one field that would separate watches
on our funnel page from watches on youtube.com. Everything else is real, gettable, and not
what Chris asked for. **It is listed so nobody has to re-do the inventory.**

### ClickFunnels gives no video signal at all

`src/analytics/clickfunnels.mjs:254-255` reads page views and opt-ins from the page-stats
call. That is what we choose to read; it cannot show what ClickFunnels sends back. The
claim that there is no video field at all is settled instead at
`docs/specs/marketing-e2e/clickfunnels-api-ground-truth.md:110-112`: "Nothing in the
ClickFunnels stats vocabulary reports how long anyone watched a video on a page. If a VSL
sits on a ClickFunnels page, the watch data has to come from the video player." **A video
watch number cannot come from ClickFunnels.**

### Meta

`src/adplatforms/meta.mjs:132-133` asks for exactly:
`spend,impressions,reach,frequency,clicks,ctr,actions,cost_per_action_type,purchase_roas`.
No video field. And `ad_metrics_daily` (`db/migrations/046_ad_platforms.sql:432-457`) has
no video columns to put one in.

**Whether Meta publishes a video drop-off curve at all is UNKNOWN to this lane, and so are
any field names.** Nothing in this repository states either. Do not build on remembered
names — make one real call first. See UNKNOWN item 16.

---

## What is missing — worst first

1. **The funnel VSL is not measured at all.** Not a play count, not a completion rate, not
   a quit point. This is the exact thing Chris asked about and it is at zero.
   (`docs/workflows/cf-vsl-watch-html-step1.html:118-141`, `public/funnel/vsl.mp4`)
2. **There is no way to receive a measurement even if the page sent one.** No beacon
   endpoint exists anywhere in `api/`
   (`docs/specs/marketing-e2e/vsl-measurement-truth.md:154`), and no table could hold it
   (`:136-139`).
3. **Three of the four funnel video files do not exist** (`TODO.md:196-197`,
   `public/funnel/` holds only `vsl.mp4`), and one page swaps between two of them by web
   address (`clickfunnels-fragments/slo/slo-03-thank-you.html:200-203`).
4. **The speaking rate is wrong.** 150 words a minute
   (`docs/ads/RULES.md:208-215`) against 841 words in 207.215 seconds is a 60% error. Every
   timestamp inherits it.
5. **Nothing stores a script with timing.** The words live as one lump in `copy_text`
   (`db/migrations/301_creative_copy_text.sql:67`). The Founder VSL is plain paragraphs
   (`docs/ads/CONTROLS.md:335-403`). The checker actively *strips* the timing it sees
   (`scripts/ads/check-script.mjs:85-86`). So a moment in a video has nothing to point at.
6. **No link between a script and the video cut from it.** Nothing joins a written ad to a
   video. YouTube hands back a title (`src/analytics/youtube.mjs:174`) and the skill is
   forbidden from giving a script a title
   (`.cursor/skills/fundhub-ad-writer/SKILL.md:32-36`). There is nothing to match on.
7. **The writer does not read the rules.** `src/creative/providers/copy.mjs:89-112` and
   `:116-125` are hard-coded. The swappable rule loader that
   `.cursor/skills/fundhub-ad-writer/SKILL.md:39-49` describes does not exist as code.
8. **The checker never runs inside the writing path.**
9. **The checker has no VSL rules past word count.** Sixteen beats: unchecked. The required
   refusal: unchecked. `TYPE vsl`: ignored for length.
10. **No drop-off curve is pulled from YouTube, and there is nowhere to put one.**
    `video_watch_stats` has seven data columns and one row per video per day
    (`db/migrations/302_analytics_connections.sql:130-152`). A curve is a hundred rows per
    video.
11. **Video length is never fetched**, so a YouTube curve point can only ever be a
    percentage (`src/analytics/youtube.mjs:161-176`).
12. **`stat_date` is not a real date.** `api/analytics/youtube-sync.mjs:149` writes today's
    date, and the file's own note at `:11-12` says each row means "as of today, this
    video's totals over the last 30 days." **So two rows a week apart share 23 days of the
    same views.** Adding them counts the same views twice, and
    `src/ops/weekly-brief.mjs:88-95` adds them together.
13. **The read endpoint does not return the video's id.** `api/read/video-stats.mjs:54-58`
    returns the title but not the id, so two untitled videos show as the same blank row.
14. **Nothing runs the YouTube pull on a timer.** `netlify.toml:135-153` lists five timed
    jobs; none is a YouTube sync.
15. **The 50-video cap silently cuts the list short**
    (`src/analytics/youtube.mjs:203`, note at `:38-40`).
16. **Clarity is off** (`public/js/clarity.js:27`) and not deployed
    (`docs/specs/marketing-e2e/vsl-measurement-truth.md:180-182`).
17. **The whole YouTube half is not on the live site.** Measured 2026-09-08: three 404s
    where 401s should be. Deploying `main` fixes it; nothing in this lane can.

---

## The data model

### What exists

**`analytics_connections`** — `db/migrations/302_analytics_connections.sql:43-79`. One row
per platform per company, staff only.

| Column | Plain meaning |
|---|---|
| `platform` | `clickfunnels` or `youtube` |
| `external_account_id` | The YouTube channel id, filled at connect time (`api/analytics/youtube-connect.mjs:41-60`) |
| `encrypted_credentials` | The three login details, scrambled into one blob |
| `connection_state` | `pending` / `active` / `expired` / `revoked` / `error` |
| `last_error` | The platform's own words, never reworded |
| `last_synced_at` | When the last pull worked |

**`video_watch_stats`** — `db/migrations/302_analytics_connections.sql:130-149`.

| Column | Plain meaning |
|---|---|
| `youtube_video_id` | YouTube's id for the video (`:135`) |
| `video_title` | Its name. Can be empty (`:136`) |
| `stat_date` | **Not the day the views happened.** The day we pulled. See gap 12 |
| `views` | Plays in the window. Empty means "YouTube did not answer", never zero |
| `estimated_minutes_watched` | Total minutes, added up |
| `average_view_duration_sec` | Average seconds watched (`:141`) |
| `average_view_percentage` | Average percent watched, 0-100, stored exactly as given (`:142-143`) |
| one-of-a-kind rule | `(connection_id, youtube_video_id, stat_date)` (`:147-148`) |

**`funnel_page_stats`** — `:99-121`. Page views and opt-ins per ClickFunnels page. Its
`views` and `conversions` columns carry the rule that matters most here, written at
`db/migrations/302_analytics_connections.sql:110-113`: **NULL, never 0, when the platform
did not answer. A real zero and "we don't know" must never look the same on a screen.**
That is a rule about not-knowing versus zero. **It says nothing about a minimum number of
views** — see the correction under Step 1.

**`content_videos`** — `db/migrations/171_content.sql:18-32`. The portal welcome-video
library. Has a `duration_label` which is a text label, not a number, and **no watch
columns at all**.

**`ad_metrics_daily`** — `db/migrations/046_ad_platforms.sql:432-457`. **No video columns.**

All three analytics tables are staff-only, locked at
`db/migrations/302_analytics_connections.sql:158-171`.

### Migration numbering

`docs/workflows/marketing-e2e.md:215` says the highest migration is 303. **It is not.**
Counted on disk 2026-09-08: **242 files, highest
`db/migrations/376_checkout_expiry_and_escalation_fk.sql`.** An earlier pass of this lane
said 366. Also wrong. **The next free numbers are 377 onward.** Anybody who takes 304, or
367, collides with a file that already exists. Editing an already-applied migration does
nothing (`CLAUDE.md` §12), so this has to be right the first time.

### PROPOSED — the tables for the video that actually matters

Nothing below exists. All of it is **PROPOSED**. This is the half that answers Chris's
question, and it comes first for that reason.

#### PROPOSED `db/migrations/377_vsl_watch.sql`

**`vsl_watch_sessions`** — one row per person, per viewing of the page.

| Column | Plain meaning |
|---|---|
| `id` | Row id |
| `org_id` | Which company |
| `video_key` | **Which file actually played** — `vsl.mp4`, `slo-vsl.mp4`, `slo-vsl2-funding.mp4`, `slo-vsl3-repair.mp4`. Required, because `clickfunnels-fragments/slo/slo-03-thank-you.html:200-203` swaps one player between two films |
| `page_url` | The page the player was on |
| `session_key` | A random id the page makes. Not a name, not an email |
| `visitor_key` | The same visitor id the attribution already uses, when there is one. **Empty when we do not know** |
| `utm_content_ad_id` | The ad number that sent them, read the way `fundhub_ad_id()` already reads it (`db/migrations/286_client_ad_attribution.sql`). Empty is normal |
| `started_at` / `last_seen_at` | First and last sign of life |
| `video_length_sec` | How long the file is, as the browser reported it. Empty when the browser never said |
| `furthest_sec` | The furthest point they reached |
| `left_at_sec` | Where they were when they left. **Empty when the leaving message never arrived** — see obstacle 10 |
| `unmuted` | Did they turn the sound on. Empty means we never heard either way |
| `play_count` | How many times a play started in this session. 2 or more after an unmute is normal, see obstacle 3 |
| `completed` | Did they reach the end |
| `autoplay_only` | True when nothing but the muted autoplay ever happened — **these people never chose to watch** |
| `user_agent_class` | `human` / `known_bot` / `unknown`. See obstacle 9 |

**`vsl_watch_positions`** — one row per moment, per session.

| Column | Plain meaning |
|---|---|
| `session_id` | Which viewing |
| `second` | Whole seconds from the start, 0 upward |
| `play_index` | **Which play this was.** 1 for the muted autoplay, 2 for the play after the unmute. Without this the opening looks twice as well watched as it is |
| `event` | `progress` / `rewind` / `skip` / `pause` / `stall` / `ended` |
| `recorded_at` | When it arrived |

- **One-of-a-kind rule:** `(session_id, play_index, second, event)`, so a repeated beacon
  updates instead of doubling.
- **Staff only for reading**, copied from
  `db/migrations/302_analytics_connections.sql:158-171`. Writing comes in through the open
  endpoint below, which is the one thing here that a stranger can reach.
- **No fake zeros.** Anything we did not hear is left empty, never written as 0. Same rule
  as `db/migrations/302_analytics_connections.sql:110-113` and
  `db/migrations/301_creative_copy_text.sql:37-45`.

**What this buys over YouTube**, and it is why this half comes first
(`docs/specs/marketing-e2e/vsl-measurement-truth.md:87-99`):

| What we want to know | YouTube | Our own player |
|---|---|---|
| Share still watching at each moment | 100 points, so 2.07 s apart on this video | **Every second.** 207 points |
| Exactly where someone quit | Nearest 1% | The exact second |
| Replays, rewinds, skips | **Impossible** | Yes |
| Did they turn the sound on | Not reported | Yes — the unmute click is already in the page at `docs/workflows/cf-vsl-watch-html-step1.html:138-139` |
| Did this person go on to book a call | No | **Yes** — same visitor, same site |

#### PROPOSED `db/migrations/378_video_retention_curve.sql`

For YouTube videos only. Build it **after** 377, and only if Chris decides videos go on
YouTube (UNKNOWN item 2).

**`video_retention_points`** — one row per curve point.

| Column | Plain meaning |
|---|---|
| `org_id` / `connection_id` | Which company, which YouTube account. Same shape as `302:132-133` |
| `youtube_video_id` | Which video |
| `captured_on` | The day we pulled it |
| `window_start` / `window_end` | The first and last day of viewing this covers |
| `elapsed_ratio` | How far through, `0.01` to `1.00` |
| `elapsed_sec` | How far through in seconds. **Empty until the length is fetched — today that means every row** |
| `audience_watch_ratio` | Share still watching here. Empty means YouTube did not answer |
| `stopped_watching` | How many people quit right here |
| `started_watching` | How many playbacks began right here |
| `total_segment_impressions` | **How many times this chunk was viewed at all** (`youtube-api-ground-truth.md:88`). The only per-point count of people YouTube gives. Without it there is no honest way to say "not enough views" about a *point* |
| `relative_retention` | How this compares with other videos of similar length |
| `video_length_sec` | The video's length. Empty when unknown |
| `captured_at` | When the row was written |

- **One-of-a-kind rule:** `(connection_id, youtube_video_id, captured_on, elapsed_ratio)`.
- **Staff only**, copied from `db/migrations/302_analytics_connections.sql:158-171`.
- **No fake zeros.** A point YouTube did not answer for gets **no row**.
- **Two window columns instead of one date**, because that is what the existing pull
  produces (`api/analytics/youtube-sync.mjs:11-12`).

**Findings are not stored.** "There is a cliff at 0:42" is the curve plus a threshold.
Thresholds change. Store the curve, work out the finding when somebody looks.

#### PROPOSED `db/migrations/379_vsl_scripts.sql`

**`vsl_scripts`** — the script as a thing with versions.

| Column | Plain meaning |
|---|---|
| `asset_id` | The row that already holds the words in `copy_text` (`301:67`). The words are **not** copied here |
| `version` | 1, 2, 3… |
| `parent_script_id` | Which version this came from. Empty for version 1 |
| `rewrite_reason` | `first_draft` / `retention_drop` / `owner_edit`. **Empty means we do not know** |
| `trigger_video_key` | Which file's curve caused this — our own file or a YouTube id. Empty when watch data caused nothing |
| `trigger_sec` | The moment of the drop. Empty when there was none |
| `trigger_captured_on` | Which pull of the curve was used |

**`vsl_script_sections`** — one row per beat. **This is the table that lets a moment point
at words.**

| Column | Plain meaning |
|---|---|
| `script_id` | Which script version |
| `beat_no` | 1 to 16, from `docs/ads/RULES.md:447-466` |
| `beat_name` | "the three ways it usually goes" |
| `body` | The words of this beat and nothing else |
| `word_start` / `word_end` | Running word numbers where this beat starts and ends |
| `start_sec` / `end_sec` | Estimated start and end time. **Empty when the rate is unset — which is the correct state today** |
| `timing_source` | `estimated` or `measured`. **A screen must never show a guess as a measurement** |
| `words_per_minute` | The rate used, saved on the row, so changing `docs/ads/RULES.md:210` later does not silently rewrite old numbers |
| `changed_from_parent` | Was this the one beat that got rewritten |
| `split_by` | `human` or `import`. Who drew this boundary |

Rules on it: `(script_id, beat_no)` is one of a kind, and `beat_no` is between 1 and 16.

**Who splits the script into sixteen beats — the answer is a person, by hand, once per
script.** This was missing from the earlier draft and it is the hinge the whole
timestamp-to-words idea hangs on.

- The words arrive as one lump in `copy_text` (`db/migrations/301_creative_copy_text.sql:67`).
- Beat markers must **not** be written inside the script text — see Step 5 below for why.
- So there is no parser, and **PROPOSED: none should be written.** A person reads the
  script, drags fifteen boundaries in the asset panel, and presses Save. The screen shows
  the running word count as they go, so `word_start` and `word_end` are filled in by the
  screen, not typed.
- For a script the writer produced, **PROPOSED: the writer returns the sixteen beats as
  sixteen separate pieces of text** (see Step 4), so the boundaries are known before
  anything is joined into a lump. Only a script written before this build, or pasted in by
  hand, needs the manual split.
- The Founder VSL needs the manual split exactly once. That is done-item 8.
- `split_by` records which of the two happened, so nobody has to guess later.

**`vsl_script_videos`** — the link that closes the loop.

| Column | Plain meaning |
|---|---|
| `script_id` | Which version was filmed |
| `video_key` | Which film came out of it — our own file name, or a YouTube video id |
| `video_source` | `self_hosted` or `youtube` |
| `utm_content_ad_id` | The ad number. Empty when it is not running as an ad yet — **not a defect** |
| `confirmed_by` / `confirmed_at` | Who said so, and when |

**Why this last table has to exist.** The watch data arrives keyed by a file name or a
YouTube id. The script is a row keyed by an internal id. **There is no shared field.**
YouTube hands back a title (`src/analytics/youtube.mjs:174`) and the skill is forbidden
from giving a script a title (`.cursor/skills/fundhub-ad-writer/SKILL.md:32-36`). So there
is nothing to match on and no clever join will invent one. **A person has to say so once
per video.** That is a design conclusion drawn from those two anchors, not a fact somebody
measured.

One idea looked at and rejected so nobody re-opens it: `ads.asset_id` in
`db/migrations/046_ad_platforms.sql` already points from a live ad back to the creative it
came from. But that connects a script to a **Meta** ad, not to a film. And no Meta
connection exists anyway (`docs/workflows/marketing-e2e.md:269`).

#### PROPOSED `db/migrations/380_creative_checker_failures.sql`

Add one column, `checker_failures`, to `creative_assets`. Empty means the checker never
ran on this row — the true answer for every row that exists today and for every picture.
An empty list means it ran and found nothing. **Those two are different and must stay
different**, for the reason already written at
`db/migrations/301_creative_copy_text.sql:37-45` ("NULL here means 'this asset has no
text'… exactly the 'NULL means unknown, do not default it to 0' mistake CLAUDE.md §12
warns about"). *(Note: `301:48-60` is a different argument — why no CHECK constraint was
added. The earlier draft cited it twice by mistake.)*

### The empty-versus-zero rule, applied

| Situation | What is stored | What the screen says |
|---|---|---|
| Nothing was ever measured on this video | no rows | "Nothing is counting this video yet" |
| Too few viewers to trust | rows stored, no verdict worked out | "Not enough views yet" |
| Genuinely nobody watched past that point | `audience_watch_ratio = 0` | "0% still watching" |
| **YouTube video length not fetched** | `elapsed_sec` empty | **shown as a percentage.** On the build as written this is EVERY row, not an edge case — nothing fetches duration |
| The leaving message never arrived | `left_at_sec` empty | "We lost them somewhere after 1:12" using `furthest_sec` |
| Script never rewritten from anything | `parent_script_id` empty | "First version" |
| No video linked yet | no `vsl_script_videos` row | "Not linked to a video yet" — **not an error** |

---

## The screens

`docs/UI-STANDARDS.md` is law for anything under `public/app/`. **Hard rule honoured: no
new page, no new tab, no new menu row** (`.cursor/skills/fundhub-ad-writer/SKILL.md:37-38`).
Everything below lands inside `public/app/creative-factory.html`, which already exists.
`public/app/campaign-manager.html` gets **no change**.

### Screen 1 — the "Video performance" card

**It is in the repo. It is NOT on the live site.** Measured 2026-09-08: the live page
`https://fundhub.ai/app/creative-factory.html` returns 200 and is **142,484 bytes**, and
contains zero mentions of "Video performance", `vidConnBadge`, `ytClientId` or
`video-stats`. The repo copy is **153,066 bytes** and has the card. **Nothing on this card
can be seen or clicked by Chris until `main` is deployed.**

In the repo at `public/app/creative-factory.html:582-612` it has:

- A coloured chip with the connection state (`:586`).
- A **Sync now** button (`:587`).
- A six-column table (`:592-594`): **Video | Date | Views | Watch time | Avg view
  duration | Avg view %**.
- Three boxes — Client ID, Client secret, Refresh token — and a **Connect** button
  (`:600-611`). Connect checks the details against Google before saving, and if Google
  refuses, Google's own sentence is shown (`api/analytics/youtube-connect.mjs:103-115`).
- Missing numbers show as a grey dash, never a zero
  (`public/app/creative-factory.html:2404-2409`).

**PROPOSED: the card gains a Fundhub-hosted section above the YouTube table**, because the
funnel VSL is the video Chris asked about and it is not in that table.

- One row per file: `vsl.mp4`, and the three SLO files once they exist.
- Columns: **Video | People who chose to watch | Watched to the end | Biggest drop**.
- "People who chose to watch" counts sessions where `autoplay_only` is false. **Autoplay
  viewers are counted separately and labelled**, because they never decided to watch — see
  obstacle 2.
- Reads `—` when nothing has been measured. Reads `not enough views` below the floor.

**PROPOSED: one more column on the YouTube table, "Biggest drop."**

- Reads `0:42 · −12 pts` when a cliff was found **and the video's length is known**.
- Reads `12% of the way in · −12 pts` when the length is not known — **which is every row
  until a length call is built.**
- Reads `—` when there is no curve at all, `not enough views` below the floor.
- **Sorting it is a rough ordering, not a league table**, and the column caption must say
  so. A YouTube curve point covers a different number of seconds on every video
  (`youtube-api-ground-truth.md:104-109`), so a 12-point fall on a 2-minute video happened
  over 1.2 seconds and the same fall on a 20-minute video happened over 12. Only compare
  videos of similar length.
- **No chart on the card.** `docs/UI-STANDARDS.md:55` — the big number, not a chart.

**Clicking a row opens the side panel.** That panel already exists at
`public/app/creative-factory.html:694` and is already used for assets at `:2044`.

### Screen 2 — the video side panel (PROPOSED)

Uses the layout blocks already at `public/app/creative-factory.html:2046-2095`.

1. **The basics** — video, how many watched, how many chose to watch, how many finished,
   when it was last measured.
2. **Where people leave** — one big sentence: *"Half your viewers are gone by 0:42."* Under
   it, the three steepest drops. **For our own video this is a real second.** For a YouTube
   video it is a percentage until a length call exists.
3. **The words you were saying** — the beat that covers that moment, its number, its name,
   its full text. **This section is switched off until somebody has timed a filmed ad**,
   because the 150-a-minute rate is provably wrong for the one video we have. While it is
   off, the panel shows the moment and the whole script, and says: *"We can show you where
   people leave. We cannot yet tell you which line you were on, because nobody has timed a
   filmed ad. One stopwatch fixes this."*
   When it is switched on, it carries two plain warnings that are not optional:
   *"This is an estimate. It comes from counting words, not from the video itself."*
   and, for YouTube videos only, *"The curve is 100 points however long the video is, so it
   finds a section, never one sentence"* (`youtube-api-ground-truth.md:111-114`).
4. **Not linked yet** — when no video-to-script link exists, this replaces section 3. A
   short list of scripts and one button, **"This is the script."** One click, once per
   video, forever.

**One main button in the panel: "Write a new version of this part."**
`docs/UI-STANDARDS.md:10` — one main action. It is switched off, with the reason shown,
when no script is linked, when the timing is unset, or when the drop lands in the refusal
or the safety close.

All four states are required by `docs/UI-STANDARDS.md:45-50`: loading, empty ("Nothing is
counting this video yet"), error (the connection's own words in the caption at
`public/app/creative-factory.html:589`), and full.

### Screen 3 — the asset side panel, "The words" section

It already shows the words at `public/app/creative-factory.html:2062`.

**PROPOSED: three lines added under the words when the asset is a VSL script.**

- *"Version 3 of this script."*
- *"Written because half the viewers were gone by 0:42 in the last cut."*
- *"Only beat 5 changed. The other fifteen are word for word the same as version 2."* —
  with version 2 clickable, opening in the same panel.

Version 1 shows one line: *"First version. No earlier one."*

**PROPOSED: the beat splitter.** Sixteen labelled boxes with the script's words in them and
a running word count. A person drags a boundary and presses Save. This is where the manual
split described above actually happens. It is one screen, used once per imported script.

### Screens 4 and 5 — the review queue and the jobs list

**No change, and that is the point.** A rewritten script is an ordinary creative row
waiting for approval, and an ordinary queued job. Do not build a second approval path.

---

## How a drop turns into new words — the loop, step by step

### Step 1 — something notices the drop

PROPOSED. Nothing like it exists today.

**PROPOSED file: `src/creative/retention-thresholds.mjs`.** One file, exporting the three
numbers and one function `findDrops(curve)`. Named here because the earlier draft said the
numbers "belong in one place in one file" and then never named the file, which left the
whole copy half blocked with nobody able to see that it was blocked.

Three rules, none of them stored as a finding:

- **The cliff.** A fall of more than `CLIFF_POINTS` percentage points inside
  `CLIFF_WINDOW_SEC` seconds. **Both numbers are PROPOSED and Chris has never set them.**
- **The half-gone mark.** The first moment the share still watching drops below half. This
  one needs no threshold and is testable today.
- **The floor.** Below `MIN_VIEWERS` people, no verdict at all — the screen says "not
  enough views yet" rather than showing a number. **PROPOSED. Chris has never set it.**

**Correction, and it matters.** An earlier draft called the floor "the rule already written
into the database at `db/migrations/302_analytics_connections.sql:111-113`." **It is not.**
Those lines say NULL rather than 0 when the platform did not answer — a rule about
not-knowing versus zero. **No views floor exists anywhere in the database.** Calling an
invented threshold a pre-approved rule is how a number nobody chose ends up shipping.

**Two things the floor needs before it can be written:**

- For a YouTube curve, the count of people at a *point* is `total_segment_impressions`
  (`youtube-api-ground-truth.md:88`). Without storing it there is no denominator, only a
  whole-video number.
- The whole-video `views` in `video_watch_stats` covers a different window than the curve's
  own `window_start`/`window_end`, so the two do not line up. Gap 12 has to be settled
  first.

**When the cliff and the half-gone mark point at different moments**, the screen shows both
and names them. It does not pick. **PROPOSED: the rewrite button acts on the cliff**,
because it is the sharper signal, and the panel says which one it used.

**Nobody knows how many people watch the VSL today, because nothing counts it.** So the
floor cannot be set from experience either. It could be eleven.

### Step 2 — the moment maps back to a line

**Today this is impossible, and the guess we would use is wrong.**

PROPOSED: store the script broken into its sixteen beats with a running word count on each,
then turn a time into a word using a rate.

**The rate is the problem.** The rules say 150 a minute (`docs/ads/RULES.md:208-215`, which
states plainly it is a choice nobody has timed). The one filmed VSL we have is 841 words in
207.215 seconds — **243 a minute.** Under 150, 0:42 maps to word 105. Under 243 it maps to
word 170. On a 16-beat, 841-word script that is two or three beats apart. **It is not
drift that grows; it is a constant bias, wrong from the first second.**

So, honestly:

- **Until somebody times a filmed ad and writes the number down, this screen must not name
  a beat at all.** It shows the moment and lets a person read the script.
- The answer, when it comes, is a **beat**, never a sentence.
- Whatever rate is measured is saved on every row (`words_per_minute`), so changing it
  later never silently rewrites old numbers.

The one upgrade that removes the guess entirely for a self-hosted file is a caption file
with real timings, which we could make ourselves from the master
(`clickfunnels-fragments/assets/VSL.mov`). For a YouTube video it is YouTube's caption
track. `src/analytics/youtube.mjs` calls no captions address anywhere. **UNKNOWN** — do not
write code against the YouTube one until somebody has made a real call.

### Step 3 — what gets rewritten

**One beat. Not the whole script, not one line.**

The whole script is too big, and the repo says why: `docs/ads/RULES.md:540-541` — "Change
one of three things… Changing two at once means you cannot tell what moved the number."

**One line is too small — and this is an assumption, not a measurement.** The honest
version: we rewrite a whole beat because a beat is the finest thing our timing can point
at. Not because we know how long it takes somebody to quit. **We have never measured a
single viewer of this video.**

**Fifteen beats stay word for word identical. One is replaced. The result is still a whole
script**, because you cannot film half a VSL.

Two beats can never be the one that changes:

- **Beat 15, the refusal** — `docs/ads/RULES.md:463-465` is the beat, and
  `docs/ads/RULES.md:473-477` is the rule that makes it mandatory ("A VSL without it is not
  our VSL").
- **Beat 14, the safety close** — `docs/ads/RULES.md:462`.

*(Correction: the earlier draft cited `docs/ads/RULES.md:466` for the safety close. Line
466 is beat 16, the CTA. Pointing the untouchable rule at the wrong beat would have let a
rewriter change the safety close and protect the call to action instead.)*

If the drop lands inside either, the rewrite takes the beat before it.

### Step 4 — what rules the rewriter reads, and what it hands back

Through a swappable loader (`.cursor/skills/fundhub-ad-writer/SKILL.md:39-49`), never by
opening files inside its own writing logic.

| Source | What it supplies |
|---|---|
| `docs/ads/RULES.md:438-480` | Length, the sixteen beats, the VSL-only rules |
| `docs/ads/RULES.md` Part 1 | The hard no's and banned words |
| `docs/ads/VOICE.md` | Before/after lines showing how Chris actually talks |
| `docs/ads/CONTROLS.md:333-403` | The Founder VSL. **Read, never written** (`docs/ads/CONTROLS.md:1`) |
| `docs/ads/CONCEPTS.md` | A replacement angle for the beat being rewritten |
| `docs/ads/ASSET-BANK.md` | The proof that is allowed — nothing else (`docs/ads/RULES.md:417-427`) |
| `docs/ads/rules-data.mjs` | The machine lists, so the writer and the checker agree |
| PROPOSED — the fifteen unchanged beats | So the new beat joins onto what sits either side of it |

PROPOSED `src/creative/rules-loader.mjs` — one function returning all of that as plain
text. `src/creative/providers/copy.mjs:89` asks the loader instead of hard-coding. Tonight
the loader opens markdown files; later it reads a brand's row in the database, and the
writing never changes.

**PROPOSED — what goes in and what comes back.** The earlier draft described where the
button sits and what it reads, but never what it does. Filling that in:

**In:** `script_id`, `beat_no`, the beat's current words, the fifteen other beats in order,
the reason (`retention_drop` plus the moment), and the total word count of the other
fifteen.

**Out:** the new words for that one beat, and nothing else. Not a whole script. The one new
beat is stitched between beats *n−1* and *n+1* by the endpoint, not by the model, so
nothing else can drift.

**Who builds the RUNTIME line:** the endpoint, not the model. It is a fixed line, it must
be there (`scripts/ads/check-script.mjs:464`), and a model that forgets it silently
switches the length check off.

**When the rewrite pushes the whole script outside 700-900 words:** it will, sometimes,
because the band applies to the joined total (`scripts/ads/check-script.mjs:463-465`) and
only one beat moved. **PROPOSED: the endpoint hands the model a word budget for the beat —
the parent beat's word count, plus or minus what the whole script has to spare inside
630-990 (`docs/ads/rules-data.mjs:176`).** If three tries still land outside the band, the
script is stored with its failures recorded and a person decides. Never silently trimmed
somewhere else, because that would be changing two things at once.

### Step 5 — the checker runs before Chris sees it

**Inside the writer, not after it.** `checkOneScript` is already exported at
`scripts/ads/check-script.mjs:406`, so nothing new has to be written to call it.

1. The writer produces the full sixteen-beat script.
2. The endpoint builds the labelled block the checker understands
   (`scripts/ads/check-script.mjs:71-86`), **including the RUNTIME line**, because that and
   nothing else applies the 700-900 band (`scripts/ads/check-script.mjs:464`).
3. It calls `checkOneScript`. Failures come back with a line number and a message.
4. Failures → rewrite → check again, inside the three-tries loop that already exists
   (`src/creative/generate.mjs:31`, `:147-178`).
5. Still failing after three tries: **the script is stored anyway, with its failures
   recorded.** Never thrown away. Same reasoning already written at
   `db/migrations/301_creative_copy_text.sql:37-45`.
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
would be scanned for banned words and counted in the word total. **The beat boundaries live
in the database**, which is exactly why a person splits them on a screen rather than typing
markers. The file the checker reads is clean spoken words and nothing else — the same rule
already written for teleprompters at `docs/journeys/ad-script-flow.md:120-124`.

### The loop does not close yet — say this out loud

**There is no step that asks whether the new words worked.** The loop runs: notice a drop,
find the beat, rewrite the beat, check it, ship it for approval. Then it stops.

To learn whether a rewrite helped, four things have to happen and **none of them is in this
build**: the new version filmed, uploaded, enough viewers on both cuts to tell a real
change from noise, and a screen that puts the two curves side by side. `vsl_script_videos`
holds the raw material, but no screen, endpoint or done-item ever compares two versions.

**So the one-change-at-a-time rule (`docs/ads/RULES.md:540-541`) buys nothing until that
exists.** It is still the right way to build, because doing it the other way makes the
comparison impossible later. But nobody should be told this build measures improvement.

**And the turnaround is not one button press.** Every rewritten beat means the whole video
re-filmed, re-uploaded, and then left to gather viewers. That is weeks per cycle, and it
stalls on Chris, who is the only person who films. `docs/ads/RULES.md` sets no rule for how
long to wait.

**PROPOSED, as its own later piece of work:** a two-curve comparison screen, and a rule for
the minimum viewers on each cut before a verdict. Not in this build. Not in the definition
of done.

### The endpoints this needs

`netlify/functions/api.mjs` holds a hardcoded list of routes. **A handler that is not in
that list returns "not found" everywhere, and this has shipped twice** (`CLAUDE.md` §12).
Existing marketing entries confirmed at `netlify/functions/api.mjs:583`, `:586`, `:587`,
`:747` and `:753`.

All PROPOSED:

| # | What it does | New file | Sits next to |
|---|---|---|---|
| 1 | **Receive the beacon from the funnel page.** The one open endpoint | `api/public/vsl-watch.mjs` | `netlify/functions/api.mjs:583` |
| 2 | Read one self-hosted video's curve | `api/read/vsl-watch.mjs` | `netlify/functions/api.mjs:583` |
| 3 | Read one script's beats and version history | `api/read/vsl-script.mjs` | `netlify/functions/api.mjs:583` |
| 4 | Save a hand-drawn beat split | `api/creative/split-script.mjs` | `netlify/functions/api.mjs:753` |
| 5 | Link a video to a script — the one thing a machine cannot do | `api/creative/link-video.mjs` | `netlify/functions/api.mjs:753` |
| 6 | Ask for a rewrite of one beat | `api/creative/rewrite-section.mjs` | `netlify/functions/api.mjs:753` |
| 7 | **YouTube only** — pull the curve. Fold into the sync that already exists, so no new route | none | `api/analytics/youtube-sync.mjs` |
| 8 | **YouTube only** — fetch each video's length so a percentage can become a time | none | `api/analytics/youtube-sync.mjs` |
| 9 | YouTube only — read one video's curve | `api/read/video-retention.mjs` | `netlify/functions/api.mjs:583` |

Each new file needs its import line added too — the list alone is not enough.

**Number 1 is unlike everything else here.** It has to accept traffic from somebody who is
not signed in, because a person watching a VSL has no account
(`docs/specs/marketing-e2e/vsl-measurement-truth.md:158-160`). That means a size limit, a
rate limit, and the cross-site permission described in obstacle 1.

**Number 8 was missing from the earlier draft and nothing else can replace it.** Without a
length, every YouTube curve row has an empty `elapsed_sec` and every screen falls back to a
percentage. That is not an edge case; on the build as written it is 100% of rows.

Number 6 **does not call a model.** It queues a job the same way everything else does
(`src/creative/generate.mjs:41`) and the existing two-minute timer does the rest
(`netlify.toml:141-142`). It must pass a repeat-proof key, because
`src/creative/generate.mjs:49-52` refuses to make one up, and an offer type, because
`api/creative/generate.mjs:105-112` requires it.

**Reads 2, 3 and 9 must copy two things from `api/read/video-stats.mjs`.** First the login
checks at `:35-37`. Second — and this is the one that bites — **every database read has to
go through `asStaff()`, the helper at `:45` that tells the database who is asking.** The
file's own comment at `:16-19` says why: without it "a bare `db.query` is anonymous to that
policy and would silently return zero rows rather than erroring, which is worse than a
crash because it looks like 'no data yet'." **A screen that shows nothing when there is
plenty of data is the worst possible failure, because nobody reports it.**

**Also needed, and it is not an endpoint:** a timed job for the YouTube sync in
`netlify.toml` next to the five at lines 135-153. Once a day is enough.

---

## Writing a VSL from scratch, before any watch data exists

**The seed is `docs/ads/CONTROLS.md:333-403` — the Founder VSL, 841 words.**
`docs/ads/RULES.md:433-434` says every rule in the VSL section was taken from that script,
"not invented". The file is locked: `docs/ads/CONTROLS.md:1`.

**The written format:** 700-900 words, 5 to 6 minutes at 150 a minute
(`docs/ads/RULES.md:438-441`). The checker allows 630 to 990
(`docs/ads/rules-data.mjs:176`). **Note the mismatch with reality:** the one filmed VSL is
3 minutes 27 seconds, under the written 5-6 minute band. See UNKNOWN item 1.

**The sixteen beats, in order**, quoted from `docs/ads/RULES.md:447-466`:

| # | Beat | Line |
|---|---|---|
| 1 | Call out who it is for, and ask for a couple of minutes | `:447` |
| 2 | Who I am — name, founder, close to a decade | `:448` |
| 3 | What I keep seeing — good owners with solid credit, blocked from money | `:449` |
| 4 | Why I built it — "I got tired of watching that happen" | `:450` |
| 5 | The three ways it usually goes — bank denies, consultant burns them, DIY stacks inquiries | `:451-452` |
| 6 | The check-in — "Does any of that sound familiar?" The one place a question belongs | `:453` |
| 7 | The absolution — none of it happened because they were not qualified | `:454` |
| 8 | What it really cost — the plan behind the money | `:455` |
| 9 | The near-miss — "like it's literally one thing away" | `:456` |
| 10 | "That's not on you." Then name where it is on | `:457` |
| 11 | Proof — decade, $25 million, Koi Poke | `:458` |
| 12 | The mechanism, in full, step by step. The only place it is explained at length | `:459-460` |
| 13 | What happens when you click | `:461` |
| 14 | **The safety close** — no hard inquiry, no obligation, nothing moves, costs nothing | `:462` |
| 15 | **The refusal.** Required | `:463-465` |
| 16 | CTA and the cost of waiting | `:466` |

Non-negotiables from `docs/ads/RULES.md:468-480`: cause first in the opening fifteen
seconds (`:470-471`); the mechanism explained once, at beat 12 (`:472`); the refusal at
beat 15 is required (`:473-477`); never promise what they will *get* on the call, only what
he will *show* them (`:478-479`); one real case study, and today that is Koi Poke (`:480`).

Proof is capped at three things (`docs/ads/RULES.md:417-427`): close to a decade in
business funding, over $25 million secured, Koi Poke.

**The heading carries no name.** `.cursor/skills/fundhub-ad-writer/SKILL.md:32-36` — only
Chris names an ad. A blank title is not a problem to fix.

**In the database, version 1 is:** one script row at version 1 with no parent and reason
`first_draft`; sixteen beat rows with `split_by = 'human'` and empty `start_sec`/`end_sec`;
and **no video link at all** until Chris confirms which film came from it. That is the
correct empty state, not a gap.

---

## Obstacles nobody has solved yet

These are real and none of them was in the earlier draft. Each one changes a number Chris
would be shown.

1. **Cross-site.** The funnel page is served by ClickFunnels — the file's own CSS targets
   ClickFunnels elements — and the beacon would post to `fundhub.ai`. That is a browser
   calling one site from a page on another, and the receiving endpoint has to be built to
   allow it or the browser silently refuses. Named at
   `docs/specs/marketing-e2e/vsl-measurement-truth.md:130-132`. **Design it in; do not
   discover it.**
2. **Autoplay means the video plays before anybody chooses to watch.**
   `docs/workflows/cf-vsl-watch-html-step1.html:118` is
   `<video autoplay muted playsinline preload="auto">`. Somebody who scrolls past counts as
   a viewer. The curve will show a huge fall in the first seconds that means only "they
   were never watching." **`autoplay_only` on the session row exists for this.**
3. **Unmuting restarts the video from zero.**
   `docs/workflows/cf-vsl-watch-html-step1.html:132-133` runs
   `v.muted=false; v.currentTime=0; v.controls=true;`. So one person watching once produces
   the opening twice. A naive curve would show the opening as the best-retained part of the
   video and a false cliff at whatever second they tapped. **`play_index` on every position
   row exists for this. Without it the very first curve Chris sees is wrong in a way that
   looks completely plausible.**
4. **If autoplay is blocked, nothing fires at all.** Phones block autoplay in low-power and
   data-saver modes. The video never starts, so no "started watching" message is sent, and
   those visitors vanish rather than showing as zero. **The count silently undercounts and
   there is no way to tell by how much.**
5. **YouTube may hide retention on a low-view video.** Neither this file nor
   `docs/specs/marketing-e2e/youtube-api-ground-truth.md` records a minimum-audience gate,
   and `relativeRetentionPerformance` (`youtube-api-ground-truth.md:85`) needs a peer group
   to compare against. **UNKNOWN** whether the API returns empty rows or an error.
   Worth one real call before building the empty state, because "no rows because too few
   people" and "no rows because the sync broke" look identical.
6. **The view count and the curve cover different time windows.** The proposed curve has
   its own `window_start`/`window_end`; `views` lives in `video_watch_stats` over a rolling
   30-day snapshot that gap 12 says cannot be added up. **The floor has no clean number to
   test against until that is settled.**
7. **Filming is the bottleneck, not the button.** See "The loop does not close yet."
8. **Beacons get blocked.** Ad blockers and browser tracking protection eat requests that
   look like analytics. The share lost is unknown and is not spread evenly. **"We measured
   400 people" really means "we measured the 400 whose browser let us."**
9. **Previews and crawlers will be counted as viewers.** Meta's link preview fetcher,
   ClickFunnels' own preview and speed bots all load the page and can start a muted
   autoplaying video. **`user_agent_class` on the session row exists for this**, and the
   first curve must exclude `known_bot`.
10. **The "how far did they get when they left" number is the hardest one to capture.**
    `docs/specs/marketing-e2e/vsl-measurement-truth.md:122` sends it on page-hide. On a
    phone that is the message most likely to be dropped — the page can be frozen or
    restored rather than closed. **The exact number this lane exists to produce is the
    least reliable one to collect.** That is why `furthest_sec` is kept separately from
    `left_at_sec`: the first survives, the second may not.
11. **A 22 MB file with `preload="auto"` downloads before anybody presses anything**
    (`docs/workflows/cf-vsl-watch-html-step1.html:118`; `public/funnel/vsl.mp4` is
    22,212,001 bytes). On a slow phone the video can stall mid-play, which looks exactly
    like somebody quitting. **The `stall` event on the position row exists for this.**
    Without it the curve cannot tell "this part is boring" from "the video buffered here."
12. **More than one self-hosted file.** Whatever is built must work for four, not one — see
    the five-videos table. Otherwise the SLO funnel is another year of nothing.
13. **Putting the VSL on YouTube to measure it would measure a different audience.** A
    curve from people who found the video on YouTube describes YouTube viewers, not people
    who clicked a paid ad and landed on the funnel. **Uploading it would produce a number,
    and the number would be about somebody else.** This is the thing that makes UNKNOWN
    item 2 not a free choice.
14. **Repeat visits.** If the same person opens the funnel page three times, the design
    produces three sessions. **Whether that counts once or three times is a decision nobody
    has made, and it changes every percentage on the screen.**

---

## Definition of done

A human can tick each of these one at a time. Everything named here is **PROPOSED and does
not exist yet** — these are future checks, not present facts.

**The funnel VSL gets counted — this is the half Chris asked for**
1. `db/migrations/377_vsl_watch.sql` is applied and `/api/health` shows nothing pending.
2. The measuring script is in `docs/workflows/cf-vsl-watch-html-step1.html`, and it does
   not introduce a repeating timer — the rule at `public/app/client-portal.html:1240` and
   the test that enforces it (`src/http/crm-html.test.mjs`).
3. The receiving endpoint is in the route list in `netlify/functions/api.mjs`, accepts a
   request from a page on another site, and has a size and rate limit.
4. One real watch on the live page writes one session row and its position rows.
5. A watch that is nothing but the muted autoplay is stored with `autoplay_only` true and
   is **not** counted in "people who chose to watch."
6. An unmute produces `play_index` 2, and the curve does not count the opening twice.
7. A database-backed test proves 4, 5 and 6 against a real database. A skipped test is not
   green (`CLAUDE.md` §12).

**The script gets structure**
8. `db/migrations/379_vsl_scripts.sql` and `380_creative_checker_failures.sql` are applied.
9. The Founder VSL from `docs/ads/CONTROLS.md:335-403` is split by hand into sixteen beats
   on the new screen, the beat word counts add up to 841, and `split_by` reads `human`.
10. Every new table refuses a read when the person is not staff. Proved by a test.

**The link closes**
11. Chris clicks "This is the script" on one video and the link row appears, carrying
    `video_source`.
12. All new read endpoints are in the route list, and `src/http/routes.test.mjs` passes.

**The rewrite works**
13. `src/creative/rules-loader.mjs` exists and `src/creative/providers/copy.mjs` gets its
    rules from it — **both** `systemPrompt` (`:89-112`) and `userPrompt` (`:116-125`), not
    just the six fixed lines at `:91-98`.
14. `src/creative/providers/copy.mjs` calls `checkOneScript` and will not hand back a
    script that failed, until three tries are used.
15. A script that still fails after three tries is stored with its failures recorded.
16. `scripts/ads/check-script.mjs` now fails a VSL missing the refusal, fails one missing a
    beat, and applies the 700-900 band when `TYPE vsl` is present with no RUNTIME line.
    Three new tests in `scripts/ads/check-script.test.mjs`.
17. A rewrite changes exactly one beat. The other fifteen are identical to the parent, and
    a test proves it.
18. The rewrite endpoint builds the RUNTIME line itself, and a test proves a script comes
    back with one even when the model omits it.

**Chris can see it**
19. The "Video performance" card shows the Fundhub-hosted section, and shows a dash or "not
    enough views" rather than a zero when there is no answer.
20. Clicking a video row opens the panel and shows where people leave, as a real second for
    a self-hosted file.
21. The panel says in plain words that the beat is a guess, **or hides the beat entirely
    while the speaking rate is unmeasured.** One or the other. Never a guess shown as a
    fact.
22. No new page, no new tab, no new menu row anywhere.
23. All four states — loading, empty, error, full — work on the new section and the new
    panel.

**The gates** (`CLAUDE.md` §6)
24. `npm run lint` clean.
25. `npx tsc --noEmit` clean.
26. Full test suite green against a real database, zero skips, and where it was measured
    written down.
27. Playwright check on the changed screen.
28. `docs/journeys/ad-script-flow.md` updated in the **same commit** as the code, and one
    line appended to `docs/journeys/CHANGELOG.md`.
29. Every screenshot shown to Chris has red boxes on the exact thing being discussed,
    numbered, with a caption legend (`CLAUDE.md` §8).

**The real test**
30. Somebody who did not build it opens the screen cold and can say, without asking a
    question, **where people are quitting the funnel VSL.** Not a YouTube video. The one on
    the funnel page.

**What passing all thirty does NOT prove:** that any rewrite helped. That needs the
two-curve comparison, which is not in this build.

---

## Where this file and the truth file disagree

`docs/specs/marketing-e2e/vsl-measurement-truth.md` and this file now agree on every
measured fact: the file, its size, its 207-second length, that nothing measures it, that
self-hosted beats YouTube for this job, and that the beacon needs cross-site permission.

**One thing is unsettled between them, and it is not a disagreement about code.**

- `docs/specs/marketing-e2e/vsl-measurement-truth.md:32` says the player lives on a
  ClickFunnels page, reasoning from the file's own CSS, which targets ClickFunnels elements
  like `[data-page-element="SectionContainer/V1"]`.
- `public/_headers:62` carries a comment from whoever set the file up: **"VSL on
  apply.fundhub.ai/vsl."** That is a different address, on Fundhub's own domain.

`vsl-measurement-truth.md:206-209` flags this honestly as unknown. **This file now carries
that unknown too.** It matters because the measuring script has to be pasted into a page,
and getting the page wrong means installing it somewhere nobody watches. Listed as UNKNOWN
item 3.

---

## UNKNOWN — blocked or unverifiable

| # | What | Why it is unknown |
|---|---|---|
| 1 | **Is `public/funnel/vsl.mp4` the Founder VSL?** | It is 207.215 seconds. The Founder VSL is 841 words (`docs/ads/CONTROLS.md:335-403`, `docs/ads/RULES.md:434`). If it is that script the real speaking rate is 243 a minute, not the 150 at `docs/ads/RULES.md:208-215`, and **every timestamp this design produces is 60% wrong.** If it is not, then a different, shorter script was filmed and exists nowhere on disk, and the written 5-6 minute band does not describe what we ship. **Somebody watching the file for four minutes settles this.** Nothing else in this lane matters more |
| 2 | **DECISION: where does the VSL live from now on — our own site, YouTube, or both?** | Today it is a file on our own site (`docs/workflows/cf-vsl-watch-html-step1.html:118-119`, `public/funnel/vsl.mp4`) and **no YouTube number describes it.** Note obstacle 13: uploading it to YouTube measures a different audience, so this is not a free choice |
| 3 | **Which page the VSL player is actually on** | `docs/specs/marketing-e2e/vsl-measurement-truth.md:32` says ClickFunnels, from the file's CSS. `public/_headers:62` says `apply.fundhub.ai/vsl`. Both are in the repo, they do not agree, and the measuring script has to be pasted into whichever is live |
| 4 | **The three SLO video files** | `slo-vsl.mp4`, `slo-vsl2-funding.mp4` and `slo-vsl3-repair.mp4` do not exist. `public/funnel/` holds one file. `TODO.md:196-197` says they come out of the shoot. The pages are already written and live |
| 5 | **The threshold numbers** — how big a fall counts as a cliff, over how many seconds, and how few viewers is too few | All PROPOSED. Chris has never set any of them. **No views floor exists anywhere in the database**, contrary to an earlier draft. They go in `src/creative/retention-thresholds.mjs` |
| 6 | **How many people watch the VSL today** | Nothing is counting. This is the whole point. It could be eleven |
| 7 | **YouTube client id, client secret and refresh token** | Chris has not supplied them. The three boxes at `public/app/creative-factory.html:600-611` are empty, no connection row exists, and nothing here has ever run against real data |
| 8 | Which permission the existing refresh token carries | **No YouTube permission string appears anywhere in this repository.** Google permission strings for Drive, Gmail and Calendar do exist (`src/company-brain/config.mjs:10`, `src/gmail/config.mjs:12`, `src/hiring/calendar-freebusy.mjs:10`), so the pattern is used here — just never for YouTube. `src/analytics/youtube.mjs:95-128` posts the token and uses whatever comes back. The one needed is `yt-analytics.readonly` (`youtube-api-ground-truth.md:211`) |
| 9 | Whether Chris's channel holds any video at all | Needs a live call |
| 10 | Whether YouTube hides retention below some number of views | Not stated in `docs/specs/marketing-e2e/youtube-api-ground-truth.md`. See obstacle 5 |
| 11 | Whether the four-number summary report accepts a per-video filter | `src/analytics/youtube.mjs:33-40` says no such filter exists. The ground-truth file proves the **retention** report requires one (`youtube-api-ground-truth.md:72`), so the comment is wrong at least for that report. Not settled for the summary report |
| 12 | Whether captions could supply real timings | No captions address is called anywhere in `src/analytics/youtube.mjs`. For a self-hosted file we could make our own from `clickfunnels-fragments/assets/VSL.mov`; nobody has |
| 13 | The YouTube Analytics daily request allowance | `docs/specs/marketing-e2e/youtube-api-ground-truth.md:220` records that Google's `reports.query` page states no quota figures. Matters because retention is one request per video |
| 14 | Whether the uploads list includes private and unlisted videos | Not stated in Google's own page. If it does not, an unlisted video would sync with a blank title (`api/analytics/youtube-sync.mjs:130`) |
| 15 | **DECISION: is the snapshot date the shape Chris wants?** | `api/analytics/youtube-sync.mjs:11-17` asks this in the code and it has never been answered. It decides whether rows may be added together, and `src/ops/weekly-brief.mjs:88-95` adds them today |
| 16 | **Whether Meta reports video drop-off at all, and under what field names** | `src/adplatforms/meta.mjs:132-133` asks for none of them, `ad_metrics_daily` has no columns for them (`db/migrations/046_ad_platforms.sql:432-457`), and this lane verified nothing against Meta's own reference. **Do not build on remembered names** |
| 17 | **Meta ad account connection** | No connection row exists (`docs/workflows/marketing-e2e.md:269`) |
| 18 | **DECISION: does a repeat visit count once or three times?** | Nobody has decided. It changes every percentage on the screen. Obstacle 14 |
| 19 | **DECISION: may a rewrite ever change more than one beat?** | `docs/ads/RULES.md:540-541` states the one-change-at-a-time principle but writes it inside the evergreen section. Whether it binds VSLs is written nowhere. One beat is the recommendation; Chris decides |
| 20 | **Microsoft Clarity project ID** | `public/js/clarity.js:27` is empty by design and Chris has not supplied one. It is also not on the VSL page, and not deployed at all (`docs/specs/marketing-e2e/vsl-measurement-truth.md:180-182`) |
| 21 | **ClickFunnels API key** | Not supplied. No ClickFunnels number has ever been fetched live |
| 22 | **DECISION: does ClickFunnels "conversions" mean opt-ins or sales?** | `src/analytics/clickfunnels.mjs:255` counts opt-ins today. Owner's call. Not touched |

---

## Corrections to earlier drafts, so nobody repeats them

Three reviewers checked the previous version of this file. These are the errors they found,
each one re-verified against the real file on 2026-09-08.

1. **Every anchor into `youtube-api-ground-truth.md` was wrong** — all nine, short by about
   seventeen lines. Line 55 is a pointer to a database file; line 194 reads "This list is
   real and it is not empty"; line 203 is about retention before September 2013. The real
   lines are `:64-73` (the request), `:72` and `:75-78` (one video only), `:80-88` (the five
   metrics), `:95-96` (100 points), `:104-109` (seconds per point), `:111-114` (a section,
   not a sentence), `:196-201` (what cannot be had), `:211` (the permission), `:220` (no
   quota figures). **A reader who followed any of the old ones landed on unrelated text and
   would have concluded the research was made up. It was not.**
2. **"Routed so it answers" was false.** The three route lines are real, but measured
   2026-09-08: `/api/read/video-stats`, `/api/analytics/youtube-connect` and
   `/api/analytics/youtube-sync` all return 404 on the live site while routed endpoints
   return 401. **The deployed build predates these files.**
3. **The "Video performance" card was described as something Chris can open.** The live
   page is 142,484 bytes with zero mentions of it; the repo copy is 153,066 bytes and has
   it. **The section was headed "What exists today", which made the error load-bearing.**
4. **"The only YouTube addresses are the three at `src/analytics/youtube.mjs:42-44`."**
   There is a fourth, hard-coded at `api/analytics/youtube-connect.mjs:45` — inside one of
   the two folders the sentence claimed to have searched.
5. **"Four hard-coded sentences at `src/creative/providers/copy.mjs:90-98`."** Wrong twice.
   The array at `:91-98` holds six strings, and it is not the whole instruction: a
   credit-repair block at `:99-107`, a brand-voice line at `:108-110`, and a completely
   separate `userPrompt` at `:116-125` all reach the model too (`:36-40`).
6. **`docs/ads/RULES.md:466` was cited for the safety close.** Line 466 is beat 16, the
   CTA. Beat 14 is `:462`. Beat 15, the refusal, is `:463-465`, with its rule at `:473-477`.
   **This anchor sat inside the one rule that says which beats may never be rewritten.**
7. **`.cursor/skills/fundhub-ad-writer/SKILL.md:38-39` was cited for the no-new-page rule.**
   It is `:37-38`. Line 39 begins the swappable-loader rule, which is `:39-49`.
8. **A views floor was called "the rule already written into the database."** It is not
   written anywhere. `db/migrations/302_analytics_connections.sql:110-113` says only that
   NULL must never be shown as zero.
9. **"Two of the three SLO files are still to be made."** All three are missing, plus the
   poster. `public/funnel/` holds one file.
10. **`db/migrations/301_creative_copy_text.sql:48-60` was cited twice** for the
    nothing-known versus nothing-found rule. That reasoning is at `:37-45`. Lines 48-60 are
    a separate argument about why no CHECK constraint was added.
11. **The speaking rate was listed as unmeasurable** — "one filmed ad, one stopwatch."
    **The filmed ad is in the repo and the stopwatch already ran: 207.215 seconds.** The
    document gave the file's byte size and never its length, and never put the two halves
    of the sum next to each other.
12. **"Exactly two things" mention VSL in the checker.** Three:
    `scripts/ads/check-script.mjs:108`, `:396` and `:397`.
13. **"No permission string appears anywhere in this repository."** Three Google ones do.
    None is a YouTube one.
14. **"Wistia / Vimeo / Mux — not present."** Vimeo and Wistia appear as Notion import
    tooling (`package.json:34`, `:36`; `scripts/notion-legacy-transcribe.mjs:37-38`). No
    player from any of the three is used on any page.
15. **"Thirteen lines" of unmute script.** The block is `:128-141` (fourteen lines); the
    code inside is `:129-140` (twelve).
16. **Three anchors off by one line.** Use `db/migrations/302_analytics_connections.sql:142-143`,
    `docs/ads/RULES.md:540-541`, `src/adplatforms/meta.mjs:132-133`.
17. **"A VSL written as plain paragraphs is never length-checked"** contradicted the bullet
    above it. It is never checked **against the 700-900 band**; the 135-word floor still
    applies (`scripts/ads/check-script.mjs:382-386`, `:483`).
18. **Migration numbers.** `docs/workflows/marketing-e2e.md:215` says 303. An earlier
    pass said 366. Both wrong. Counted 2026-09-08: 242 files, highest
    `db/migrations/376_checkout_expiry_and_escalation_fk.sql`.
19. **The whole design was built for YouTube when the VSL is not on YouTube.** That is the
    biggest change in this version: the self-hosted half now comes first, has its own
    tables, its own endpoint and its own done-items, and the YouTube half is marked as the
    secondary path it is.
