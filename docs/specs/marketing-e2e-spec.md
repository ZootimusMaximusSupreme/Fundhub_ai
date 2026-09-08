# Marketing, end to end — the build spec

**Written:** 2026-09-08. **Phase 1 of 3.** Nothing here changed any app code.

Built from five parallel research lanes plus live checks against the real site and the
real platform documentation. Every claim traces to a file and a line, or to a request
that came back. Where something could not be checked, it says **UNKNOWN** instead of
guessing.

Detail behind every section lives in `docs/specs/marketing-e2e/`.

---

# Decisions — locked by Chris, 2026-09-08. Do not re-open.

1. **Ad numbering: both, plus the associations.** Our own number AND Meta's ad id.
   One piece of copy can have many assets, and many ads. Store the links at every
   step — `script → creatives → ads → Meta's id` — so the AI can reason across them.
   The associations are the point, not the numbering.
2. **Do not define "conversion".** Store every raw number the platforms give and name
   none of them "the" conversion. A conversion means different things depending on
   what is being tested. Chris reads the data, and the AI analyses it.
3. **An ad click always lands on a VSL.** Never straight to the application.
4. **The five ClickFunnels boxes do not exist.** Creating them is item one, before
   anything else is built.
5. **Chris's own ads get a house partner row.** Everything else in the database keeps
   working unchanged.
6. **No fixed VSL length.** It depends on the VSL. The writer takes a target per job.
7. **No stopwatch exercise.** The ad platforms report watch time directly. Use that.
8. **The goal is data and dashboards, plus an AI that reads them.** Not a system that
   decides what a conversion is. Marketing numbers and staff numbers land in the same
   place and get read together.

---

# The thing that changes the plan: the brain is already built

Chris asked to tie marketing numbers to employee numbers, feed an AI, and get a
dashboard and a report. **Most of that already exists in this repo and nobody is
feeding it.**

| Already built | Where | What it does |
|---|---|---|
| Cost per booked call | `src/ops/meta-marketing.mjs` | Computes it — and **refuses to invent a number when the sample is too small**. Returns `INSUFFICIENT` with "Do not invent a cost." |
| Company KPIs | `src/dashboard/kpis.mjs` | Money chain, events, spend, over a chosen window. NULL means nothing happened, never a made-up sample |
| The weekly report | `src/ops/weekly-brief.mjs:60-90` | **Already reads `analytics_connections`, `funnel_page_stats` and `video_watch_stats`** |
| Staff and role numbers | `src/ops/role-unit-times.mjs`, `pods.mjs`, `measure-minutes.mjs`, `csuite-tasks.mjs` | The employee KPI side |
| The pulse | `src/pulse/registry.mjs` | Under separate investigation |

**So the AI ops brain is wired to read the marketing tables already.** The tables are
empty, and the numbers that would fill them never get collected. That is the whole
job — not building a brain, but feeding the one that exists.

This also means the discipline Chris wants is already enforced in code: these modules
refuse to show a number they cannot stand behind. Nothing new has to be built to make
the AI honest.

---

# The one-paragraph answer

You have far more built than you think, and almost none of it is connected. Four
machines exist — the funnel, the script rules, the video page, the Creative Factory —
and each one works alone. **What is missing is the wiring between them, and one number:
the ad number.** A script never gets one. An approved creative never gets one. Three of
your doors throw it away. Without that number nothing can be measured end to end, which
means nothing can be improved on purpose. On top of that, three specific things are
quietly broken in ways that look fine: the script checker passes files it never read,
the Creative Factory fails on every job for want of one database row, and the analytics
work you just merged is not deployed. None of these is a big build. All of them are
load-bearing.

---

# How the whole thing is meant to work

One sentence: **money goes in at one end, and you find out which words caused it.**

```
   You write a script  ──►  it becomes an ad  ──►  the ad gets a NUMBER
                                                          │
                                        ┌─────────────────┴──────────────────┐
                                        ▼                                    ▼
                              someone clicks it                    you spend money on it
                                        │                                    │
                              lands on the funnel page                       │
                                        │                                    │
                              watches the video ──► we record where they quit│
                                        │                                    │
                              fills the survey                               │
                                        │                                    │
                              books a call ──────► the number rides along ───┘
                                        │
                                        ▼
                        "Ad 43 cost $34 a call. Ad 51 cost $180.
                         People quit ad 43's video at 0:48."
                                        │
                                        ▼
                      you rewrite the bit that loses them, and go again
```

Everything below is one piece of that loop. The loop is currently broken in four places,
marked as we go.

---

# 1. CRO — the funnel and the landing pages

### The use case

You spend money to send a stranger to a page. You want to know which page turns the most
strangers into booked calls, and you want to be able to change a headline and *prove*
whether it helped. Right now you can change a headline, but you can never prove anything,
because you cannot compare.

### How it should work

1. An ad carries a number in its link — `utm_content=43`.
2. The landing page catches that number and hides it in the form.
3. The person answers the survey. The number travels with the answers.
4. If they qualify, they see a calendar. If not, they do not.
5. They book. The number lands in the database next to that booking.
6. A screen shows: this ad, this many leads, this many calls, this much spent, this cost
   per call.
7. To test a headline, half the traffic sees version A and half sees version B, and each
   version gets its own booked-call rate.

### What exists

Most of it. The funnel is real and lives partly in this repo as the HTML you paste into
ClickFunnels — `clickfunnels-fragments/`, with the video page, the apply page, the
booking page, the thank-you page, and a tag-catcher that grabs the ad number
(`clickfunnels-fragments/06-utm-hidden-fields.html`).

The database side is real too: `client_ad_attribution`
(`db/migrations/286_client_ad_attribution.sql:95`) and a function `fundhub_ad_id()` that
reads the number out of the link. The number can carry a name on the end — `43-cold-hook`
— and the name is ignored. **`utm_content=43` works with no name at all.** Naming an ad
is never a blocker.

### What is missing — worst first

1. **Three setup jobs inside ClickFunnels may never have been done, and everything
   downstream is dead without them.** The five boxes that hold the ad number may not
   exist. Every survey question may still be saving into nothing. The webhook may only
   fire when the survey is submitted and not when a call is booked. Two setup documents
   in the repo contradict each other and neither records an answer. **This is the single
   cheapest thing to check and the most expensive thing to get wrong** — if the boxes
   were never made, the Ad Performance screen stays empty forever no matter what gets
   built.
2. **There is no A/B test. At all.** Nothing in the system can tell two versions of a
   page apart. Eight places mention it; none of them splits traffic. So "change the
   headline and see" is currently impossible.
3. **Three doors throw the ad number away.** The fundhub.ai homepage, the affiliate
   catcher at `/start`, and the Optimize page. All three can end in a booked call. None
   of them carries the number. The homepage is effectively a second, complete funnel
   that books calls anonymously.
4. **Page counts cannot be split by ad.** `funnel_page_stats`
   (`db/migrations/302_analytics_connections.sql:99`) has no ad column. You can ask how
   many people saw the video page. You cannot ask how many of *ad 43's* people saw it.
5. **The booked rate can read over 100%.** It divides calls by people, and one person
   who books twice counts twice (`src/ads/store.mjs:64`). One-word fix.

### Done means

You click a live ad, land on the page, book a call, and see that ad's number next to
your booking on the closer's screen — then see it again on Ad Performance with 1 lead
and 1 call. And you can change a headline on half the traffic and read two separate
numbers.

---

# 2. Script generation

### The use case

You have five ads filmed and running at $32–36 a booked call. You want more like them,
without writing each one from scratch and without an agent in the loop. You press a
button, pick an angle, and get a finished script that already obeys your rules and
sounds like you.

### How it should work

1. A screen offers the angles you have not used yet.
2. You pick one and press write.
3. The writer reads three things: your rules, your voice examples, and your five running
   ads as the seed.
4. It writes a script in the right format and the right length.
5. **The checker runs before you ever see it.** If it breaks a rule, it goes back and
   gets rewritten. You only see drafts that passed.
6. You approve it. It gets an ad number. That number is what ties it to money later.

### What exists

More than expected. `docs/ads/RULES.md` is a real 608-line SOP with hard rules, word
bands and formats. `docs/ads/rules-data.mjs` is the same rules in a form a machine can
read. `docs/ads/CONTROLS.md` holds the five running ads and is marked
**LIVE — DO NOT EDIT**. `scripts/ads/check-script.mjs` is a 28KB checker with its own
tests. There is a writer skill at `.cursor/skills/fundhub-ad-writer/SKILL.md`.

**A VSL format already exists in writing** — `docs/ads/RULES.md:431-481`: sixteen beats
in a fixed order, none skippable, 700–900 words, aimed at 5–6 minutes.

### What is missing — worst first

1. **The checker says "all clean" on files it never read.** It only inspects a block if
   that block has a HOOK label or a heading like "Ad 1", "Script 7", or one containing
   "VSL" (`scripts/ads/check-script.mjs:106-110`, `:545-548`, `:567`). Run on four real
   ad files — `POST-BOOKING-15.md`, `ascension-ads.md`, `CONCEPTS.md`,
   `sms-copy-2026-09.md` — **all four came back green with nothing checked.** A
   generated script headed "Angle 12" would be handed to you as passing when nothing
   was looked at. This is the most dangerous single finding in the whole spec, because
   it fails silently and in your favour.
2. **No path writes a script without a person driving it.** There are three half-built
   writers: the chat path needs you and an agent; the screen path runs alone but has
   never seen your rules (`src/creative/providers/copy.mjs:89-125`); the flywheel path
   writes general copy with the right word lists pointed at the wrong job.
3. **The checker cannot be plugged into the server as it stands.** The only usable
   function needs a script that is already cut into pieces
   (`scripts/ads/check-script.mjs:406`), and the two functions that do the cutting and
   the reading are not shared. The test file had to copy one by hand.
4. **A finished script never gets an ad number.** Nothing anywhere assigns
   `utm_content`. The only link runs backwards, from the ad account to the script. **This
   is the break that stops the whole loop closing** — and lanes B, D and E all hit it
   independently.
5. **`docs/ads/VOICE.md` has no real correction pairs.** The file says so itself at
   lines 17-24: the pairs are seed examples and the "Model wrote" half of each one is
   invented. Voice is the one thing only you can judge, and the file built to teach it
   is half made up.

### Done means

You open a screen, pick an angle, get a script that a checker actually read and passed,
and it carries a number from the moment you approve it.

---

# 3. VSL — the video, and what it can tell you

### The use case

The video is the thing doing the selling. You want to see the exact moment people stop
watching, so you can rewrite that bit instead of guessing at the whole script.

### What is actually true today — read this first

**The VSL is not on YouTube.** It is a plain movie file on your own server:
`public/funnel/vsl.mp4`, 22.2 MB, **3 minutes 27 seconds long**, played by a basic
`<video>` tag on a ClickFunnels page
(`docs/workflows/cf-vsl-watch-html-step1.html:118-119`). It is live and serving.

**Nothing is counting it.** The only script attached to that player is thirteen lines
that turn the sound on when you tap. It sends nothing anywhere. There is no play count,
no quit point, no beacon.

So the honest answer to "how far into my VSL do people get?" is: **nobody knows, and
nobody is finding out.** Not "a little data" — none.

**And both analytics integrations you just merged are pointed at things that are not
this video.** YouTube reads a YouTube channel. ClickFunnels reports page views and
opt-ins and cannot see inside a video.

### The good news

Because you own the player, you can measure more than YouTube would ever give you.

| What you want to know | If it were on YouTube | On your own player |
|---|---|---|
| Share still watching, moment by moment | 100 points across the whole video | every second — 207 of them |
| Exactly where someone quit | nearest 1% | the exact second |
| Replays | **impossible** | yes |
| Rewinds | **impossible** | yes |
| Skips forward | **impossible** | yes |
| Did they turn the sound on | not reported | yes — already detected in the page |
| **Did this person then book a call** | **no** | **yes** |

That last row is worth more than all the others. YouTube can tell you a stranger left.
Your own player can tell you *the person who booked watched to 2:14, and the twelve who
left all quit around 0:48.*

### How it should work

1. A small script on the funnel page watches the video and reports: played, paused,
   position, rewound, skipped, replayed, unmuted, and how far they got before leaving.
2. It posts that to a new endpoint on fundhub.ai.
3. Two new tables store it: one row per viewing, plus the position samples that draw the
   curve.
4. A screen draws the curve. You see the cliff.
5. You click the cliff. It shows the part of the script being spoken at that moment.
6. You press rewrite. **Only that part** is rewritten — the rest stays word for word. It
   goes through the checker before you see it.

### Where the page actually is — confirmed live

**`https://apply.fundhub.ai/watch`.** `apply.fundhub.ai/vsl` redirects there. It is a
ClickFunnels page on a custom domain — the address was in a comment at
`public/_headers:62` the whole time.

I fetched the live page. Our player really is pasted in and running. **There is no
tracking on it and no Clarity on it** — that is checked on the live page, not guessed
from the repo.

**One consequence for the build:** the measuring script has to be pasted into that page
by hand inside ClickFunnels. It cannot be deployed from this repo. That is a manual step
and it belongs on the checklist now, not discovered later.

### What is missing

Everything in that list. None of it exists. Specifically: no tracking script, no beacon
endpoint, no table that can hold a curve (`video_watch_stats` holds four summary numbers
per video per day and is built around a YouTube video id), and no stored link between a
moment in the video and a line in the script.

### The honest limits — stated now so nothing overpromises later

- **A curve needs traffic.** A drop-off line drawn from eleven viewers is noise, not a
  finding. Nobody is counting today, so how much traffic this video gets is **UNKNOWN**.
- **The video auto-plays muted, and unmuting restarts it from zero**
  (`docs/workflows/cf-vsl-watch-html-step1.html:132-133`). So "started watching" and
  "chose to watch" are different things, and the design has to handle that or every
  number will be wrong.
- **The page is on ClickFunnels and the beacon posts to fundhub.ai.** That is a
  cross-site request and has to be designed in, not discovered later.
- **A rewrite improving results is a hypothesis, not a fact.** The system can tell you
  where people leave. It cannot tell you the new words are better until you run them.

### The hard problem — and it changes the best feature

Two measured numbers: the video is **207 seconds**. The Founder VSL script is **844
words**. That is **244 words a minute**.

Your rules assume **150** (`docs/ads/RULES.md:208-215`, which already admits nobody
timed it). At 150, a 207-second video would hold 518 words. The real one holds 844.
**The assumption is off by about 63%.**

Why that matters: the obvious way to turn "they quit at 0:48" into "you were saying
*this*" is to count words through the script. **That method would have pointed at the
wrong paragraph every single time** — by more than half a minute on a three-minute
video. You would have rewritten lines that were never the problem.

**So the click-the-cliff-and-see-the-words feature ships switched off.** Version one
shows you the moment and the whole script and says honestly that it is not pointing at
an exact line. The fix is cheap and it is not code: **somebody watches one filmed ad
with a stopwatch and writes down where each section starts.** One afternoon. After that
the feature switches on properly, measured instead of assumed.

### And this answers your rules question

`docs/ads/RULES.md:438-441` says a VSL is 700–900 words **and** 5–6 minutes. At your
real speaking rate those cannot both be true — 844 words comes out at 3:27, which is
exactly the live video. **The word band looks right and the minute estimate looks
wrong.** Only you can confirm which you meant.

### Done means

You open a screen, see a line showing where people drop, click the drop, read the words
being said there, press one button, and get a rewritten section that passed the checker.

---

# 4. Creative Factory

### The use case

One screen where an ad gets made — the words, the picture, the sizes — reviewed,
approved, and sent out. No agent involved.

### How it should work

You pick a kind of creative, a brand kit and how many you want. You press generate. A
job runs. Drafts land in a library. You approve or reject. Approved ones get an ad number
and go live, and their results come back to the same place.

### What exists

The screen is fully built and every button is wired — `public/app/creative-factory.html`,
2,705 lines, with the generate form, the job list, the library, the approvals queue and
brand kits. All seven endpoints behind it exist and **all seven are correctly in the
routes map**, so the classic 404 trap in this repo is not firing here.

### What is missing — worst first

1. **Nothing says which service writes the copy, so every job fails on the first try.**
   The provider list is empty and there is no row for it anywhere except inside a test
   (`src/creative/generate.pg.test.mjs:50`). **One database row fixes this.** The
   database already knows — there is a built-in view that reports "generation cannot
   run" — and no screen reads it.
2. **An approved ad can never be measured.** Nothing connects a finished creative to an
   ad number or to `docs/ads/registry.json`. It can never appear on the Ad Performance
   card next door. Same break as the script lane.
3. **The ads do not sound like you.** The writer uses six hard-typed lines
   (`src/creative/providers/copy.mjs:91-98`). Nothing under `src/creative/` or
   `api/creative/` reads `RULES.md`, `VOICE.md`, `CONTROLS.md`, `CONCEPTS.md` or
   `rules-data.mjs`. Your rules and this screen have never met.
4. **The brand kit never reaches the writer, and you cannot ask for more than one ad at
   a time.** Both are missing form fields, not missing plumbing — the endpoint already
   accepts all three.
5. **Nothing can create a brand kit.** The screen reads them and will show an empty list
   forever. The only place in the repo that writes one is a test.

### Done means

You press generate and get drafts. You approve one. It has a number. Its results come
back to the same screen.

---

# The five things that block everything

These cut across all four pieces. Fix these and the rest is ordinary work.

| # | The break | Why it matters | Size |
|---|---|---|---|
| 1 | **A script or creative never gets an ad number** | This is the join. Without it, words and money never meet, and nothing can be improved on purpose | small — one column, one decision |
| 2 | **Your own ads have nowhere to live** | Every ad table demands a partner. Your five running ads belong to no partner. Two database guards stop you working around it | medium |
| 3 | **The checker passes files it never read** | It fails silently and in your favour, which is the worst way to fail | small |
| 4 | **No provider row** | Creative Factory fails every job. One row | tiny |
| 5 | **The analytics work is merged but not deployed** | `/api/analytics/clickfunnels-connect`, `/api/analytics/youtube-connect` and `/api/read/video-stats` all return 404 live. Handing over API keys changes nothing until a deploy goes out | one command |

**On #5:** the endpoints that ARE live return 401. These three return 404 — that is the
difference between "you are not logged in" and "no such page". The live build is older
than main. One `netlify deploy --build --prod` fixes it, and that same deploy applies the
pending database changes. Note that it applies **every** pending change in the repo, not
only the marketing ones — the repo now holds migration files up to 376.

---

# What I need from you

### Two decisions

1. **ClickFunnels "conversions" — opt-ins or sales?** The code counts opt-ins today
   (`src/analytics/clickfunnels.mjs:255`). The platform actually hands us thirteen
   numbers per funnel step and we keep two. **My recommendation:** keep opt-ins as the
   headline and store `views_unique`, `optin_rate` and `sales_count` alongside, so
   nothing needs rebuilding the day you sell something on a funnel page. Your call.
2. **May `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected?** It still instructs the
   Google Workspace method you banned.

### Four keys

- ClickFunnels API key — **and which workspace subdomain.** A key belongs to a whole
  team, and a team can hold more than one workspace. The wrong one connects to the wrong
  funnel and every number after that is wrong.
- YouTube OAuth: client id, client secret, refresh token
- Microsoft Clarity project ID — and set Masking to **Strict** on Clarity's own website.
  No code can set that second one. Clarity is currently off twice over: no ID
  (`public/js/clarity.js:27`) and the file is not deployed (404 live).
- Meta ad account connection — no row exists, so cost per booked call is impossible today

### Three questions only you can answer

- **Were the five ad-number boxes ever created in ClickFunnels?** Two setup documents
  disagree. This one gates the entire CRO lane and takes two minutes to check.
- **Your rules say a VSL is 5–6 minutes AND 700–900 words. Those disagree at your real
  speaking rate.** The evidence says the word band is right and the minutes are wrong.
  Confirm which you meant.
- **Will you sit with a stopwatch through one filmed ad?** One afternoon, and it turns
  the best VSL feature from "roughly here" into "exactly here". Nothing else unlocks it.
- **Where does a click land — the video page, or straight to the application?** Open at
  `docs/ads/NEXT.md:45-46`. It changes the call to action in every ad.

---

# Suggested order

Build order follows the repo's own rule: back end proven first, screens last.

**Round 1 — unblock (small, and everything else waits on it)**
Deploy what is merged. Add the provider row. Fix the checker so it cannot pass what it
did not read. Fix the booked-rate divide.

**Round 2 — the number**
Decide who assigns an ad number and when. Add the column. Sort out where your own ads
live. Stop the three doors throwing the number away.

**Round 3 — measure the video**
Tracking script, beacon endpoint, two tables, the curve on a screen.

**Round 4 — write from what you learn**
Point the writer at your real rules. Wire the checker in front of every draft. Build the
click-the-drop-and-rewrite loop.

**Round 5 — CRO**
The A/B split. This is last because without rounds 1 and 2 you cannot read the result.

---

# Where the detail lives

| File | What is in it |
|---|---|
| `docs/specs/marketing-e2e/a-cro.md` | The funnel, every page, the click traced end to end |
| `docs/specs/marketing-e2e/b-scripts.md` | The rules, the checker, every check it does and does not do |
| `docs/specs/marketing-e2e/c-vsl.md` | The VSL: the data, the tables, the rewrite loop |
| `docs/specs/marketing-e2e/d-factory.md` | Creative Factory, every control, working or not |
| `docs/specs/marketing-e2e/e-data.md` | Every table, every join, what is missing |
| `docs/specs/marketing-e2e/vsl-measurement-truth.md` | What we can measure about the video and what we cannot |
| `docs/specs/marketing-e2e/what-is-actually-live.md` | Measured against the live site |
| `docs/specs/marketing-e2e/youtube-api-ground-truth.md` | What YouTube would give, if it were on YouTube |
| `docs/specs/marketing-e2e/clickfunnels-api-ground-truth.md` | The thirteen numbers, of which we keep two |
| `docs/workflows/marketing-e2e.md` | The shared board for this batch |
