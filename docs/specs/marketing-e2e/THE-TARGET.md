# The target, in Chris's words

**Owner-set 2026-09-08. This replaces any earlier framing. Read this before the rest.**

> "I wanna be able to snap my fingers and have the funnel done, the copy done, the ads
> ready to go, the VSLs ready to go. And then from there track it all. How well is the
> ad performing? How well is the VSL performing? Where are people falling off inside the
> VSL, inside the ad? Every little piece of data you can possibly think of needs to be
> tracked and saved. Because we can't learn shit if we don't track it."

**Two halves. That is the whole thing.**

1. **Make.** Scripts, ads, VSLs, landing page copy — on demand.
2. **Measure.** Everything. Then feed it back into the making.

**What this is NOT:**
- Not a recursive learning system. Not yet. Chris said so plainly.
- Not fulfillment. This is front-end only.
- Not complicated. "Try not to overcomplicate it, but definitely make it good."

---

# Answer 1: Yes, we can push pages to ClickFunnels

Chris asked. Checked against ClickFunnels' own developer docs, 2026-09-08.

| What | Endpoint |
|---|---|
| Make a page | `POST /api/v2/workspaces/{workspace_id}/pages` |
| Change a page | `PATCH /api/v2/pages/{id}` |
| Read a page back | `GET /api/v2/pages/{id}` with `expand[]=markup` |

Page content goes in a field called **`markup`**. Bad markup gets rejected with a 400
rather than half-applied, which is the behaviour you want.

**The one catch, stated plainly:** it is not raw HTML. It is **PML**, ClickFunnels' own
markup language, and their docs say it covers **only a subset** of what their visual
editor can build. So "we write the landing page in the repo and push it" is real, but
how much of our existing design survives the trip is **UNKNOWN until we try it with the
API key.**

**Two rules from their docs we should follow:**
- If a page was last edited by hand in their editor, get Chris's OK before overwriting
  it. Otherwise we silently destroy work he did.
- Publish state is not controlled by these endpoints. Something still has to publish.

**What this means for the goal:** landing page copy joins the list of things the machine
can produce and push. It is not a separate manual job. **Confidence: high on the
mechanism, unknown on how much design survives.**

---

# Answer 2: Ad drop-off is already free. No build needed.

This is the part that was being over-thought.

**Meta already tells us where people fall off inside an ad.** Straight from the
Marketing API, no instrumentation, no beacon, no pixel work:

| Field | What it means in plain words |
|---|---|
| `video_3sec_watched_actions` | got past the first 3 seconds |
| `video_p25_watched_actions` | reached a quarter of the way |
| `video_p50_watched_actions` | reached halfway |
| `video_p75_watched_actions` | reached three quarters |
| `video_p95_watched_actions` | nearly finished |
| `video_p100_watched_actions` | finished it |
| ThruPlay | watched 15 seconds, or all of it if shorter |

**That is a five-point drop-off curve for every single ad.** Two numbers everyone in
paid media actually uses fall straight out of it:

- **Hook rate** = 3-second views ÷ impressions → *did the first 3 seconds stop them*
- **Hold rate** = p75 ÷ 3-second views → *did the middle keep them*

**So "where do people fall off inside the ad" needs zero new code on our side.** It
needs the Meta ad account connected. That is it.

---

# Answer 3: The VSL is the only thing that needs building

Because it is a file on our own server on a ClickFunnels page, **no API can see inside
it.** Not Meta's, not ClickFunnels', not YouTube's.

That is also why it is the best data we will have: we own the player, so we can record
every second, plus rewinds, replays and skips — none of which any ad platform reports.

**This is the one real build in the measuring half.** Everything else is a connection.

---

# Answer 4: The thing that makes it all learnable

Chris said: *"We track the angles. We track the hooks. We track everything, so we know
what works."*

**Right now angles and hooks are prose.** They live as words inside `docs/ads/CONCEPTS.md`
(48 hooks) and `docs/ads/ANGLE-GENERATOR.md`. Prose cannot be grouped, sorted, or
counted.

**To answer "which hook books calls cheapest", the hook has to be a field, not a
sentence.** Same for the angle, the lane, the offer, the format.

So every script carries labels, and **those labels ride all the way down the chain:**

```
script  (angle, hook, lane, offer, format)
   │  labels inherited
   ▼
creative asset  (many per script)
   │  labels inherited
   ▼
ad  (many per creative — our number + Meta's id)
   │
   ▼
spend, hook rate, hold rate, leads, booked calls, VSL drop-off
```

**Then every question Chris actually wants to ask becomes one query:**

- Which hook has the cheapest booked call?
- Do "cause-first" angles hold people longer than "proof-first"?
- Which lane converts best on cold traffic?
- Does the VSL lose more people when the ad promised X?

**None of that needs a learning system.** It needs labels on rows. That is the whole
trick, and it is why the associations Chris asked for matter more than the numbering.

---

# So the build is four things

| # | The work | Size |
|---|---|---|
| 1 | **Labels on everything, inherited down the chain.** Angle, hook, lane, offer, format — as fields. Plus our ad number and Meta's ad id at the bottom. | the important one |
| 2 | **Connect the platforms.** Meta, ClickFunnels, YouTube, Clarity. Ad drop-off arrives for free with Meta. | keys + a deploy |
| 3 | **The VSL beacon.** The only real build. Every second, plus rewinds and skips. | one script, one endpoint, two tables |
| 4 | **The making side.** Point the writer at the real rules, put the checker in front of every draft, and add landing page copy now that pages can be pushed. | medium |

**The brain that reads all of it already exists** — `src/ops/weekly-brief.mjs`,
`src/ops/meta-marketing.mjs`, `src/dashboard/kpis.mjs`. It is wired to these tables
already and they are empty. Nothing new has to be built to analyse the data. It has to
be given some.

---

# What stays out, on purpose

- Recursive self-improvement. Chris said no.
- Anything touching fulfillment.
- Deciding what a "conversion" is. Store the raw numbers, let the AI read them.
- Naming ads before anything can proceed. A number is enough.
