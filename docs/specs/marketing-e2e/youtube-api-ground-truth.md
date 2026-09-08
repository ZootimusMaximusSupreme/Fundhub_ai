# What YouTube will actually tell us about a VSL

**Written:** 2026-09-08. **Source:** Google's own published API documentation, fetched
and read on that date. Every line below is quoted from or directly grounded in the
pages listed at the bottom. Nothing here is from memory.

**Why this file exists.** Chris asked to make sure we can get VSL watch information and
all the metadata. Our own code can only tell us what we *currently ask for*. This file
records what YouTube is *willing to give*, so the gap between the two is visible.

---

## The short version

**Yes. We can get the drop-off curve.** YouTube publishes a report that says what share
of viewers are still watching at every point in the video. We do not ask for it today.

Three sentences of detail:

1. The curve comes back as **100 points per video** — one for every 1% of its length.
2. You must ask for **one video at a time**. There is no way to ask for a list.
3. There is **no replay, rewind, or skip number**. That does not exist. Anyone who says
   otherwise is guessing.

---

## What we ask for today, versus what exists

Today `src/analytics/youtube.mjs:195` asks for exactly four numbers:

```
views, estimatedMinutesWatched, averageViewDuration, averageViewPercentage
```

with `dimensions=video` at `src/analytics/youtube.mjs:201`.

Those four are stored in `video_watch_stats`
(`db/migrations/302_analytics_connections.sql:130`), one row per video per day.

That is a summary. "People watched 43% on average" is a summary. It does not tell you
**where** they left. The retention report does.

---

## The retention report — the exact call

**Endpoint:** `GET https://youtubeanalytics.googleapis.com/v2/reports`

| Part of the request | Value | Notes |
|---|---|---|
| `ids` | `channel==MINE` | or a channel id |
| `startDate` / `endDate` | `YYYY-MM-DD` | required |
| `dimensions` | `elapsedVideoTimeRatio` | **required** for this report |
| `metrics` | at least one of the five below | |
| `filters` | `video==<ONE video id>` | **required, and a single id only** |
| `filters` (optional) | `audienceType`, `subscribedStatus`, `youtubeProduct` | |

**The single-video rule is the important one.** Google's documentation states this
report "does not support the ability to specify a comma-separated list" of video ids.
So syncing retention for 30 VSLs is 30 separate requests. That is a real design
constraint on any sync job we build, not a detail.

### The five retention metrics

| Metric | What it tells you, in plain words |
|---|---|
| `audienceWatchRatio` | The share of viewers still watching at that point in the video. **This is the drop-off curve.** |
| `relativeRetentionPerformance` | How this video holds people compared with other videos of similar length. Scored 0 to 1. Above 0.5 means it beats the typical video. |
| `startedWatching` | How many times this chunk was the **first** chunk somebody saw. Catches people who skip ahead and start in the middle. |
| `stoppedWatching` | How many times this chunk was the **last** chunk somebody saw. **This is literally where people quit.** |
| `totalSegmentImpressions` | How many times this chunk was viewed at all. |

`stoppedWatching` is the one that answers "where do we lose them" most directly.
`audienceWatchRatio` draws the shape of the whole thing.

### How fine-grained the curve is

`elapsedVideoTimeRatio` returns **100 data points per video**, valued `0.01` through
`1.0`. A value of `0.4` means "40% of the way through the video."

The points are evenly spaced, so **how many seconds each point covers depends on how
long the video is.** Google's own examples: points are 1.2 seconds apart on a 2-minute
video, and 72 seconds apart on a 2-hour video.

What that means for a VSL:

| VSL length | Seconds per data point |
|---|---|
| 2 minutes | 1.2 s |
| 10 minutes | 6 s |
| 20 minutes | 12 s |
| 30 minutes | 18 s |

**This is the honest limit on "half of them quit at 0:42."** On a 20-minute VSL the
curve can only tell us they quit somewhere in a 12-second window. It is precise enough
to find the section that is losing people. It is not precise enough to blame one
sentence. Any design that claims per-line precision from this data is wrong.

### Splitting paid from organic

`audienceType` is an optional filter with exactly three values:

- `ORGANIC` — someone searched, clicked a suggestion, or otherwise chose it
- `AD_INSTREAM` — a YouTube TrueView in-stream ad
- `AD_INDISPLAY` — a YouTube TrueView in-display ad

Data for this filter starts **25 September 2013**; earlier dates return nothing.

**A caution worth stating plainly.** `AD_INSTREAM` and `AD_INDISPLAY` mean *YouTube's
own* ad formats. Traffic driven from Meta to a funnel page with an embedded player is
not either of those. To separate "people who came from our funnel" from "people who
found us on YouTube", the tool is the playback-location report, not `audienceType` —
see the next section. **UNKNOWN:** exactly which bucket embedded funnel traffic lands
in has not been tested against our own channel, because no YouTube connection exists
yet (the OAuth credentials are blocked on Chris).

---

## Everything else YouTube will give us

Verified against Google's metrics and dimensions reference. **We currently request none
of this beyond the four summary numbers.**

### Where the viewer came from

- `dimensions=insightTrafficSourceType` — the category (search, suggested, external,
  and so on)
- `dimensions=insightTrafficSourceDetail` — the detail, e.g. **which outside website
  sent them**. Requires `filters=insightTrafficSourceType==<type>`.

### Where the video was played

- `dimensions=insightPlaybackLocationType` — watch page, embedded, channel page, etc.
- `dimensions=insightPlaybackLocationDetail` — requires
  `filters=insightPlaybackLocationType==EMBEDDED`. **This is how we would see watches
  that happened on our funnel page specifically**, as opposed to on youtube.com.

### Who they are

- `dimensions=ageGroup` and/or `gender`, with `metrics=viewerPercentage` (that metric
  is required for this report)
- `dimensions=country`; `province` requires `filters=country==US`; also `city`, `dma`,
  `continent`, `subContinent`

### What they used

- `dimensions=deviceType`, `operatingSystem`

### How they behaved

- Engagement: `likes`, `dislikes`, `comments`, `shares`, `subscribersGained`,
  `subscribersLost`, `videosAddedToPlaylists`, `videosRemovedFromPlaylists`
- Cards and end screens: `cardImpressions`, `cardClicks`, `cardClickRate`,
  `cardTeaserImpressions`, `cardTeaserClicks`, `cardTeaserClickRate`
- Other playback dimensions: `subscribedStatus`, `liveOrOnDemand`, `youtubeProduct`,
  `sharingService`, `creatorContentType`

### Video metadata (a different API — YouTube Data API v3)

`snippet` (title, description, publishedAt, tags, categoryId, thumbnails,
defaultLanguage), `contentDetails` (**duration** — needed to turn a ratio into
seconds), `statistics` (viewCount, likeCount, commentCount), `status`, `player`,
`topicDetails`, `recordingDetails`, `liveStreamingDetails`.

We already touch this API at `src/analytics/youtube.mjs:151` and `:162`, but only for
`part=contentDetails` on the channel and `part=snippet` on playlist items — enough for
title and publish date, and **not** enough for video duration.

**Video duration matters more than it sounds.** Without it, a retention point of `0.4`
cannot be converted into "8 minutes 12 seconds." Chris cannot act on a percentage; he
can act on a timestamp.

---

## What YouTube will NOT give us

This list is real and it is not empty.

| Thing | Verdict |
|---|---|
| Replays | **Cannot get it.** No such metric exists. |
| Rewinds | **Cannot get it.** The docs describe rewinding as something that affects the numbers, but publish no metric for it. |
| Skips forward | **Cannot get it.** No such metric. `startedWatching` is the nearest thing and it only says where a viewing began. |
| Per-viewer playback history | **Cannot get it.** Everything is aggregate. |
| Retention for many videos in one call | **Cannot get it.** One video per request, by rule. |
| Retention before 25 Sept 2013 when split by `audienceType` | Not available. Irrelevant to us. |

---

## Access requirements

**OAuth scopes** listed for `reports.query`:

- `https://www.googleapis.com/auth/yt-analytics.readonly` ← the one we need
- `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` (money only)
- `https://www.googleapis.com/auth/youtube`
- `https://www.googleapis.com/auth/youtubepartner`

**Response shape:** `columnHeaders` (name, dataType, columnType) plus `rows`, an array
of arrays. Column order follows the requested `metrics` order — which is the same
contract `src/analytics/youtube.mjs` already relies on at line 210.

**Quota:** the `reports.query` reference page states no quota figures. **UNKNOWN.**
Given the one-request-per-video rule, quota is worth measuring before syncing a large
library.

**Ownership:** these are channel-owner reports. They work for videos on a channel we
control. **UNKNOWN:** whether the VSL currently lives on a channel Chris owns — no
connection exists to check.

---

## What this means for the build

1. **A new table is needed.** `video_watch_stats`
   (`db/migrations/302_analytics_connections.sql:130`) holds one row per video per day
   with four numbers. A curve is 100 rows per video. It cannot go in that table.
2. **Video duration must be fetched and stored**, or the curve stays as percentages and
   Chris cannot act on it.
3. **The sync job must loop one video at a time**, and must be built expecting that.
4. **Honest precision:** the curve locates a *section*, not a *sentence*. Roughly 6
   seconds of resolution on a 10-minute VSL, 12 on a 20-minute one.
5. **Nothing can be pulled at all until the YouTube OAuth credentials exist.** That is
   blocked on Chris: client id, client secret, refresh token.

---

## Sources

- [YouTube Analytics metrics reference](https://developers.google.com/youtube/analytics/metrics)
- [YouTube Analytics dimensions reference](https://developers.google.com/youtube/analytics/dimensions)
- [YouTube Analytics channel reports](https://developers.google.com/youtube/analytics/channel_reports)
- [reports.query method reference](https://developers.google.com/youtube/analytics/reference/reports/query)
