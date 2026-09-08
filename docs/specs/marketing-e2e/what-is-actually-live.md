# What is actually live on fundhub.ai right now

**Measured:** 2026-09-08, 16:36 UTC, from this Mac against the real public site.
Not read from code. Not assumed. Every number below came back from a live request.

---

## The headline

**The marketing analytics work is merged into `main` but it is NOT on the live site.**

Nothing that talks to YouTube or ClickFunnels is running in production. The screens
that would show video watch data cannot load, because the pages behind them are not
there yet.

The fix is one command. It is not a bug and nothing is broken. The code simply has not
been deployed since it landed.

---

## The site is healthy

```
https://fundhub.ai/            200   0.37s
https://fundhub.ai/api/health  200
```

```json
{"ok":true,"db":"up","state":"up","migrations":270,"expected":267,
 "pending":0,"error":null,"checkedAt":"2026-09-08T16:36:09.931Z"}
```

Site up. Database up. Nothing pending. All four marketing pages load:

| Page | Status |
|---|---|
| `/app/creative-factory.html` | 200 |
| `/app/campaign-manager.html` | 200 |
| `/optimize.html` | 200 |
| `/start.html` | 200 |

---

## How I proved the deploy is behind

Our API answers **401** ("you are not logged in") for a page that exists, and **404**
("no such page") for one that does not. That difference is the test.

Control, to prove the test works:

| Address | Answer | Meaning |
|---|---|---|
| `/api/health` | 200 | exists, no login needed |
| `/api/nonsense/route` | 404 | does not exist |

Now the real check:

| Address | Answer | Live? |
|---|---|---|
| `/api/read/ad-books` | 401 | **yes** |
| `/api/creative/library` | 401 | **yes** |
| `/api/campaigns/list` | 401 | **yes** |
| `/api/read/ad-attribution` | 401 | **yes** |
| `/api/analytics/clickfunnels-connect` | **404** | **NO** |
| `/api/analytics/youtube-connect` | **404** | **NO** |
| `/api/read/video-stats` | **404** | **NO** |

Three of these are on `main` right now. The live site has never seen them.

So the deployed build sits somewhere between the ad-books work and the analytics work —
it is older than `main` at `fe864840`.

---

## What this means, in plain words

1. **You cannot connect YouTube or ClickFunnels today**, even with the keys in hand.
   The button's endpoint is not there. Handing over the API keys will not change that
   until a deploy goes out.
2. **The Creative Factory page loads, but part of it is broken in a way you can see.**
   The page asks the site for `read/video-stats` and gets "no such page" back. Whatever
   that panel is meant to show, it cannot show it.
3. **The three analytics tables are probably not in the production database.**
   `analytics_connections`, `funnel_page_stats` and `video_watch_stats` are created by
   `db/migrations/302_analytics_connections.sql`, and migrations only run on a
   production deploy (`CLAUDE.md` §11). No deploy has carried migration 302 out.

   **UNKNOWN — and worth one look before building:** health reports **270** migrations
   applied against an **expected 267**. Three extra are in the database that the
   deployed build does not know about. Whether those three are 301, 302 and 303 cannot
   be told from outside. It does not change the plan either way — the routes are absent
   regardless — but somebody should check the database directly before assuming those
   tables are missing.

4. **"Merged" and "live" are different things here.** The thread that started this work
   said 0 pending migrations, and that is true — but only against the older code that
   is deployed. It is not evidence that the new tables exist.

---

## What unblocks it

One deploy, from this Mac. GitHub is not in the path:

```
netlify deploy --build --prod
```

That single deploy carries the routes out **and** runs the pending migrations, because
`[context.production]` is the only context that migrates (`CLAUDE.md` §11).

**Not doing that now.** Phase 1 is a written spec and changes nothing. This is recorded
so the plan is built on what is real.

---

## One thing to decide before that deploy

A production deploy applies **every** unapplied migration in the repo, not only the
marketing ones. The repo currently holds migration files numbered up to **376**, well
past the 302-303 range this work needs. What else rides along on that deploy has not
been reviewed here and is outside this lane.
