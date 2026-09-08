# The VSL: what we can measure, and what we measure today

**Measured:** 2026-09-08, from this Mac, against the real files and the real live site.
Every claim carries a file and a line, or a live request that returned it.

Chris asked: *"make sure we can get vsl watch info all meta data etc."*

This file is the honest answer.

---

## The answer in four lines

1. **The VSL is a plain video file on our own server. It is not on YouTube.**
2. **Nothing measures it. Not one number is being collected. Today we know nothing.**
3. **That is fixable, and the fix gives us MORE than YouTube ever could** — down to the
   second, per person, including replays and skips, which YouTube cannot report at all.
4. **It needs a small piece of code on the page and somewhere to put the numbers.**
   Neither exists yet.

---

## What the VSL actually is

| Fact | Value | Proof |
|---|---|---|
| The file | `public/funnel/vsl.mp4` | on disk, in the repo |
| Size | 22,212,001 bytes (22.2 MB) | live `content-length` header |
| Live address | `https://fundhub.ai/funnel/vsl.mp4` | returns **200**, `content-type: video/mp4` |
| **Length** | **207.22 seconds — 3 minutes 27 seconds** | read from the file's own header |
| How it plays | a plain HTML `<video>` tag | `docs/workflows/cf-vsl-watch-html-step1.html:118-119` |
| Where the page lives | ClickFunnels, using our HTML as pasted custom code | the file's own CSS targets ClickFunnels elements like `[data-page-element="SectionContainer/V1"]` |

The player markup, in full, at `docs/workflows/cf-vsl-watch-html-step1.html:118-119`:

```html
<video id="fh-vsl" autoplay muted playsinline preload="auto"
  src="https://fundhub.ai/funnel/vsl.mp4">
```

It starts muted and auto-plays. A "Tap for sound" button unmutes it, restarts it from
zero, and turns on the normal video controls
(`docs/workflows/cf-vsl-watch-html-step1.html:128-142`).

---

## Nothing is being measured. Here is the proof.

The only script attached to that video is 13 lines long
(`docs/workflows/cf-vsl-watch-html-step1.html:129-142`). It does exactly three things:
unmute, rewind to zero, show the controls.

**It does not send anything anywhere.** There is no counter, no beacon, no call to our
site, no analytics tag. I searched the whole repo for anything watching this video —
`fh-vsl`, `vsl.mp4`, `timeupdate`, `video_watch`, `watch_event`, `videoProgress` —
across `public/`, `src/` and `api/`. Nothing touches it.

So the truthful status is: **zero VSL watch data exists, and none is being collected
right now.** Not "a little". None.

---

## Why YouTube's numbers do not apply

I researched what YouTube can give (written up in
`docs/specs/marketing-e2e/youtube-api-ground-truth.md`) before finding out where the
VSL actually lives. That research still stands, but it applies to **YouTube videos**.
This VSL is not one.

- Our YouTube code (`src/analytics/youtube.mjs`) reads videos from a YouTube channel's
  uploads playlist (`src/analytics/youtube.mjs:151-175`). A file sitting on our own
  server is not in any playlist. It will never appear.
- ClickFunnels reports page views, opt-ins and sales
  (`docs/specs/marketing-e2e/clickfunnels-api-ground-truth.md`). It reports **nothing**
  about what happens inside a video on the page.

**So both integrations we just built are pointed at things that are not the VSL.** They
are still useful — YouTube for anything published on the channel, ClickFunnels for page
and opt-in numbers — but neither one answers the question Chris asked.

---

## The good news: self-hosted is better for this

Because we own the player, we can measure things YouTube flatly refuses to report.

| What we want to know | YouTube | Our own player |
|---|---|---|
| Share still watching at each moment | Yes, but only **100 points** across the whole video | **Every second.** 207 points on this VSL if we want them |
| Exactly where someone quit | Nearest 1% of the video | The exact second |
| Replays | **Impossible.** No such metric exists | Yes |
| Rewinds | **Impossible** | Yes |
| Skips forward | **Impossible** | Yes |
| Did they turn the sound on | Not reported | Yes — the unmute click is already in our code |
| Did this person go on to book a call | No | **Yes** — same visitor, same site, same attribution we already have |

That last row is the one worth the most. YouTube can tell you a stranger stopped
watching. Our own player can tell you *the person who booked a call watched to 2:14 and
the twelve who left all quit around 0:48.*

On a 3:27 VSL, YouTube's 100 points would be one every **2.07 seconds**. Our own player
can do better than that, and can do it tied to a real person.

---

## What has to be built

Nothing below exists. All of it is **PROPOSED**.

### 1. A small script on the funnel page

Added to `docs/workflows/cf-vsl-watch-html-step1.html`, which is the HTML Chris pastes
into ClickFunnels. It listens to the video and reports:

- `play`, `pause`, `ended`
- `timeupdate` — the running position, sampled (not every tick; the browser fires it
  ~4 times a second)
- a jump backwards = a **rewind**; a jump forwards = a **skip**; a return to 0 after
  ending = a **replay**
- the unmute click, which the page already detects
  (`docs/workflows/cf-vsl-watch-html-step1.html:137`)
- how far they got before leaving, sent on page-hide

**Reuse note:** the repo already uses this exact idiom. `public/app/client-portal.html`
attaches a `timeupdate` listener to a real `<video>` at line 1303, and the comment at
line 1240 states the rule plainly: *"NO TIMER. The clock is the browser's own timeupdate
event on a real `<video>`."* Follow that. A test bans repeating timers in that file
outright and scans the comments too, so do not introduce one.

**A real obstacle to solve:** the funnel page is served by ClickFunnels, and the beacon
would post to `fundhub.ai`. That is a cross-site request and needs the receiving
endpoint to allow it. Not hard, but it must be designed in, not discovered later.

### 2. Somewhere to put the numbers

`video_watch_stats` (`db/migrations/302_analytics_connections.sql:130`) cannot hold
this. It stores one row per video per day with four summary numbers, and it is built
around a YouTube video id and a connection to a YouTube account. A per-second curve for
a self-hosted file does not fit it.

Two new tables are needed. Exact shape is Lane C's and Lane E's to specify, but the
shape of the problem is:

- one row per **viewing session** — who, when, which video, how far they got, did they
  unmute, did they replay
- one row per **position sample** — or a compact per-session array, so the drop-off
  curve can be drawn

Follow the rule the repo already sets in migration 302: **NULL means "we do not know".
It never means zero.**

### 3. An endpoint to receive it

There is no beacon endpoint anywhere in `api/`. A new one is needed, and it must be
added to the hardcoded `ROUTES` map in `netlify/functions/api.mjs` — a handler that is
not in that map returns "no such page" both locally and live (`CLAUDE.md` §12).

It has to accept traffic from someone who is not logged in, because a visitor watching
a VSL has no account yet. That makes it the one marketing endpoint that is open to the
public, so it needs a sane size limit and rate limit.

### 4. A screen

Chris looks at a curve and sees where people leave. It belongs on a page that already
exists — the ad-writer skill's standing rule is **never add a page, tab, or menu row**
(`.cursor/skills/fundhub-ad-writer/SKILL.md`, rule 4). `creative-factory.html` already
has a video-stats panel that currently calls a dead endpoint.

---

## While we are here: Microsoft Clarity would show this too, and it is off

`public/js/clarity.js` records sessions and builds heatmaps on the funnel pages. It is
**completely inert right now**, deliberately:

- `public/js/clarity.js:27` — `var CLARITY_PROJECT_ID = "";`
- `public/js/clarity.js:30-33` — with no ID it returns immediately. No network call, no
  globals, nothing.

It is also **not deployed**. `https://fundhub.ai/js/clarity.js` returns **404**, and the
live homepage contains no reference to Clarity at all. So it is off twice over.

Turning it on takes two things, and only Chris can do the first:

1. the real Clarity project ID, pasted into that file
2. in the Clarity dashboard, set masking to **Strict** before real traffic arrives —
   this is a dashboard setting, and `public/js/clarity.js:9-15` records that there is no
   JavaScript call that can set it. An earlier version of that file pretended there was.

Clarity would give session replays and heatmaps of the whole page. It is not a
substitute for measuring the video — it is a different, useful thing.

---

## Blocked on Chris

- **Microsoft Clarity project ID.** Without it, Clarity stays off.
- **Nothing else here is blocked.** The VSL measurement work needs no outside key, no
  API access, and no permission from any platform. It is our video, on our server, on
  our page. That is the whole reason it is worth doing.

---

## UNKNOWN — stated, not guessed

- **Whether this ClickFunnels page is live and taking traffic.**
  `docs/workflows/cf-vsl-watch-html-step1.html` is a file in our repo, and its name
  says "step1". The video it points at is definitely live. Whether the page itself is
  published, and at what address, cannot be told from inside this repo.
- **Whether the VSL is also on a YouTube channel Chris owns.** No YouTube connection
  exists, so this cannot be checked. If it is, the YouTube numbers become useful as
  well — but for a different audience than the funnel's.
- **How many people watch it today.** Nothing is counting. This is the point.
