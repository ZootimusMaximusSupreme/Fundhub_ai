# Lane A — CRO: the funnel and the landing pages

Written 2026-09-08 on `main` at `fe864840`. Read-only pass. Rewritten the same day
after two reviews. Every claim below names the file and line it came from. Where a
line could not be checked from this repository it says **UNKNOWN** and why.

**One word used a lot below.** *sessionStorage* is the browser remembering a small
note only until the tab is closed. Close the tab, the note is gone.

---

## What Chris gets when this is done

You will be able to see, for one ad number, how many people landed, how many
booked a call, and where the rest fell out. Right now you can see the first
number and the last number and nothing in between. You will also be able to
change a headline and find out if it made things better or worse. And the
screen recordings that would show you people getting stuck are built but
switched off, waiting on one ID from you.

---

## What exists today

### The pages, and which one an ad points at

There are two separate websites, and **both** of them end at a booked call.

**Website 1 — ClickFunnels. The paid funnel.**
Four pages, in this order:

| Order | Page | Evidence |
|---|---|---|
| 1 | `apply.fundhub.ai/watch` — video sales letter | `clickfunnels-fragments/CURSOR-PROMPT.md:6` |
| 2 | `apply.fundhub.ai/apply` — the survey | same line |
| 3 | `apply.fundhub.ai/funding-book-call` — the calendar | same line |
| 4 | `apply.fundhub.ai/thank-you` | same line |

`docs/workflows/manual-walkthrough-2026-09-03.md:33` says the same thing in one
sentence: "Front door is a 4-page CF funnel: /watch → /apply (9-question survey,
branches at 'Do you have a business?') → /funding-book-call → /thank-you."

**The page an ad points at is `/watch`, page 1.** The live ad link, written out in
full with all five tags, is at `docs/workflows/manual-walkthrough-runbook.html:128`:

```
https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=funding600&utm_content=42-ringlights&utm_term=sun
```

A second one, a different lane and a different ad number, is on the next line
(`:129`, `utm_campaign=sorting`, `utm_content=43`).

**Those four live pages are edited inside ClickFunnels, not here.** What lives here
is the **paint** for them — blocks of HTML and CSS pasted into a ClickFunnels
"Custom HTML" box. There are also machine-made local copies of the four finished
pages under `clickfunnels-fragments/harness/`, built by a script, not hand-edited
(`clickfunnels-fragments/harness/build.mjs:16` writes `watch.html` straight from
`01-vsl.html`). See "The test rig that already exists" below.

| File | What it paints | Lines |
|---|---|---|
| `clickfunnels-fragments/01-vsl.html` (45,582 bytes) | the `/watch` page | headline `:129`, video `:135`, button `:159` |
| `docs/workflows/cf-vsl-watch-html-step1.html` | the `/watch` page, a **second copy** | headline `:113`, video `:119`, button `:143` |
| `clickfunnels-fragments/02a-apply-top.html` (81 lines) | top half of `/apply` | headline "Let's See What You Qualify For" `:81` |
| `clickfunnels-fragments/02b-apply-bottom.html` (84 lines) | bottom half of `/apply` | scrolling strip and footer `:84` |
| `clickfunnels-fragments/04a-book-top.html` (139 lines) | top half of `/funding-book-call` | headline "You Are Qualified." `:83` |
| `clickfunnels-fragments/04b-book-bottom.html` (84 lines) | bottom half of `/funding-book-call` | scrolling strip and footer `:84` |
| `clickfunnels-fragments/05-thank-you.html` (314 lines) | the `/thank-you` page | headline "You're All Set." `:143` |
| `clickfunnels-fragments/06-utm-hidden-fields.html` (84 lines) | invisible. Carries the ad number into the form. | reads the tags `:38`–`:59`, writes them into forms `:61`–`:78` |

The video itself is a real file in this repo: `public/funnel/vsl.mp4`. Both
`/watch` skins point at it by full address
(`clickfunnels-fragments/01-vsl.html:135` and
`docs/workflows/cf-vsl-watch-html-step1.html:119`, both
`https://fundhub.ai/funnel/vsl.mp4`).

**Website 2 — fundhub.ai. This repo. Also ends at a booked call.**

| File | What a person sees | Key lines |
|---|---|---|
| `public/index.html` (785 lines) | the marketing homepage, with its **own** 12-step survey | form `:610`, survey script `:782` |
| `public/js/homepage-survey.js` (442 lines) | the 12 steps of that survey | steps `:8`–`:142`, submit `:380` |
| `public/optimize.html` (581 lines) | the SmartCredit referral page. Own form, own money path, own calendar. | form `:174`, SmartCredit button `:250`, book button `:281`, config call `:348` |
| `public/start.html` (69 lines) | an affiliate link catcher. Records the click, then bounces to `apply.fundhub.ai/watch` | destination `:32`, rebuilt link `:43`, click record `:52` |
| `public/crm.html` (23 lines) | not a page. It redirects straight to `/app/` | `:16` |
| `public/progress.html` | the client's own progress page, **after** they have bought | title `:4` |
| `public/contract.html` | the document signing page, **after** the call | title `:4` |
| `public/careers.html` `:7`, `public/login.html` `:4`, `public/portal-login.html` `:4`, `public/reset-password.html` `:4`, `public/unsubscribe.html` `:4`, `public/404.html` `:7` | their own `<title>` tags name them: Careers, Sign in, Client portal sign-in, Reset password, Unsubscribe, Not found. None is a funnel page. | as listed |
| `public/education/index.html:7`, `public/affiliates/index.html:7`, `public/partner/index.html:6` | their own `<title>` tags name them: Fundhub Education, Partners (Affiliate & White-Label), Partner With FundHub. Side doors, not the paid funnel. | as listed |

### The `/watch` skin you asked me to work out

`docs/workflows/cf-vsl-watch-html-step1.html` belongs to **page 1, `/watch`**.
Three things prove it:

1. It loads the same video file the canonical `/watch` skin loads —
   `https://fundhub.ai/funnel/vsl.mp4` (`:119`).
2. Its one button goes to `/apply`, which is page 2 (`:143`).
3. `clickfunnels-fragments/CURSOR-PROMPT.md:19` names `01-vsl.html` as "full VSL
   page fragment … CURRENT/CANONICAL", and the file in `docs/workflows/` is a
   near-copy of it.

The two `Survey/V1` and `AppointmentScheduler/V1` names in it (`:26`–`:31`) are
not widgets this file adds. They are ClickFunnels' own building blocks, and
those lines are CSS that makes the box **around** them see-through so the grid
background shows. Plain words: it is a styling rule, not a feature.

**Which one is live? UNKNOWN — but two out of three copies agree.** There are
three copies of that headline in this repo, not two:

- `clickfunnels-fragments/01-vsl.html:129` — "Get **Up to** $50,000 to $1,000,000…"
- `clickfunnels-fragments/harness/watch.html:142` — "Get **Up to** $50,000 to $1,000,000…"
- `docs/workflows/cf-vsl-watch-html-step1.html:113` — "Get $50,000 to $1,000,000…"

The harness copy is machine-built from `01-vsl.html`
(`clickfunnels-fragments/harness/build.mjs:16`), so it is not an independent vote —
it is a photocopy. Two files, one of them a photocopy of the other, say "Up to".
The `docs/workflows/` copy does not. Nothing in this repo says which text is pasted
into ClickFunnels right now.

### The tracking plumbing that already works

| Piece | Where | What it does |
|---|---|---|
| Ad tags → hidden form boxes | `clickfunnels-fragments/06-utm-hidden-fields.html:39`–`:83` | Reads the five tags off the web address, keeps them for the visit, and writes them into every form on the page. First one wins. |
| Ad number rule | `db/migrations/286_client_ad_attribution.sql:81`–`:84` | `fundhub_ad_id()`. Leading digits only. `16-phase` → `16`. `16` → `16`. Anything else → blank, never a guess. |
| Lane rule | same file, `:67`–`:77` | `funding600`, `premium`, `sorting`, `uwiq`, `wl`, else `unknown`. Never blank. |
| Version rule | same file, `:87`–`:93` | lowercases whatever was in `utm_term`. |
| The table | same file, `:95`–`:120` | One row per client. `lane`, `ad_id`, `variant` are worked out by the database itself, not by any program. |
| First touch wins | `src/ads/store.mjs:26`–`:32` | A second visit fills in blanks. It never overwrites what is already there. |
| The roll-up | `src/ads/store.mjs:57`–`:78` | Counts leads and booked calls per group. A cancelled booking does not count (`:70`). |
| ClickFunnels page numbers | `src/analytics/clickfunnels.mjs:230`–`:257` | Asks ClickFunnels for views and opt-ins for one page. |
| Where those numbers land | `api/analytics/clickfunnels-sync.mjs:91`–`:108` | Writes them into `funnel_page_stats`. |

### The screens that already show this

| Screen | Panel | Lines |
|---|---|---|
| `public/app/campaign-manager.html` | **CM-09 Ad Performance — which ad booked a call**. Group, Leads, Booked calls, Booked rate, First booked, Last booked. | panel `:374`–`:394`, read `:2120`–`:2130` |
| `public/app/campaign-manager.html` | **CM-10 Funnel Pages**. Funnel, Page, Date, Views, Conversions, plus a **Sync now** button. | card opens `:403`, button `:407`, status line `:409`, column headers `:413`, dash note `:420`, read `:1229`–`:1240`, Sync handler `:2312` |
| `public/app/campaign-manager.html` | **CM-07 Connections**. Where the ClickFunnels API key and subdomain get typed in. | `:512`, inputs `:560`–`:566`, Connect handler `:2334` |
| `public/app/closer-dashboard.html` | four lines under the client's name: Gate, Entry, Primary, Secondary | `:565`–`:570`, painted by `public/app/closer-call.js:213`–`:229` |
| `public/app/pipeline.html` | the same four lines in the client drawer | `:2226` |

All the doors these screens knock on are wired up in the routing table:
`netlify/functions/api.mjs:580` (`read/ad-attribution`), `:581` (`read/ad-books`),
`:582` (`read/funnel-pages`), `:584`–`:585` (the two ClickFunnels endpoints).

### The gate that decides who is allowed to book

This is the biggest single lever in the whole funnel and it is worth reading twice.

Two answers decide whether a person is sent to the calendar at all
(`src/config/survey-qualification.mjs:63`–`:70`):

1. Their credit band must be **700-749** or **750+** (`:28`).
2. The answer to "any negatives on your credit report?" must be **No** (`:48`–`:55`).

- Fail either one → **DOWNSELL** (`:67`).
- Pass both → **PASS** (`:69`).
- Answer missing or a word the code does not recognise → **MANUAL REVIEW** (`:68`).
  A human looks. That person never sees a calendar automatically. The file explains
  why on purpose at `:10`–`:15`: guessing "pass" sends unqualified people to a
  funding call, guessing "fail" sends good people to the downsell, and both are
  worse than a person looking.

Where each answer sends them (`src/config/homepage-survey-steps.mjs:22`–`:26`):

| Result | Where they go |
|---|---|
| PASS | `https://apply.fundhub.ai/funding-book-call` — the same calendar the paid funnel uses (`:23`) |
| DOWNSELL | `https://apply.fundhub.ai/thank-you` (`:24`) |
| MANUAL REVIEW | `https://apply.fundhub.ai/thank-you` (`:25`) |

**And here is the problem.** `docs/clickfunnels/cf-survey-ground-truth.md:9` says
plainly: the homepage asks the negatives question; **ClickFunnels `/apply` still has
no negatives question.** `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:34` goes
further and instructs the opposite — "**Do not create / do not map:**
`cf_svy_has_negatives` — owner removed that question from the current survey spec
(2026-08-12)."

So on the paid funnel the second gate has nothing to read. What that means for a
paid lead is **UNKNOWN** and it is the most important unknown in this section — see
the UNKNOWN table.

### The test rig that already exists

You can already see all four funnel pages on a laptop, before anything is pasted
into ClickFunnels.

- `clickfunnels-fragments/harness/` holds `watch.html`, `apply.html`, `book.html`
  and `thank-you.html`, plus a menu page (`harness/index.html`) and a tiny local web
  server (`harness/static-server.mjs:7`, port 4177).
- `clickfunnels-fragments/harness/build.mjs:16`–`:28` builds those four files from
  the fragments. Change a headline in a fragment, run the build, look at the page.
- `clickfunnels-fragments/playwright.config.mjs` points a browser-robot at that
  local server.
- `clickfunnels-fragments/tests/layout.spec.mjs:10`–`:20` checks **4 pages × 9
  screen widths × 3 sharpness settings × 6 zoom levels** for layout breaks.

Half of "change a headline and see what happens" is therefore already built. What it
cannot do is send real people to two different versions — see finding 3.

---

## What is missing, worst first

**1. The live `/apply` page may still be storing none of the survey answers.**
`docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:41` says, about the live survey:
"Today every question shows **Contact Attribute = None**. Fix that." Part A of that
same file (`:19`–`:31`) lists the ten `cf_svy_*` boxes that have to be created in
ClickFunnels first. Line 8 of that file lists this as "**Still on you in
ClickFunnels**". Nothing in this repo records that it was ever done. If it was not,
every survey answer from the paid funnel is dropped on the floor.

**2. The five ad-number boxes may never have been created in ClickFunnels either,
and the two setup documents disagree about them.**
`clickfunnels-fragments/06-utm-hidden-fields.html:26`–`:31` says seven boxes must be
created once in the ClickFunnels workspace or the hidden fields post nothing:
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, and two more,
`landing_path` and `referrer_domain`. The owner checklist
(`docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:19`–`:31`) lists ten boxes and
**none of them is a `utm_` box**. Two setup documents, two different lists, and the
one Chris was handed is the one missing the ad numbers. If those boxes do not exist,
the Ad Performance screen stays empty forever no matter what else is fixed.

**3. There is no way to serve two versions of a page and compare them.**
The search turns up a handful of hits and none of them splits traffic. Most are a
font setting (`public/progress.html:91`, `public/partner/funnel.css:185`,
`public/partner/trial/live/index.html:72`,
`public/partner/board/live/index.html:68`). One is a comment about the `utm_term`
tag (`clickfunnels-fragments/06-utm-hidden-fields.html:18`). One is a chip on the
partner ad board that counts how many versions of a Meta ad ran
(`public/partner/board/live/index.html:316`). Two are a picture-comparison test for
a background grid, where a person eyeballs two screenshots
(`clickfunnels-fragments/fixes-v2.md:80` and `:83` — the second says "Chris picks —
do not auto-choose"). **Nothing serves two versions of a page to real visitors and
nothing measures one against the other.**

`utm_term` (`sun`, `nosun`, `sedona`) is a **label you type into the ad link by
hand**, not a test. It is stored (`286:111`) and you can group by it
(`api/read/ad-books.mjs:27`). But the page each version lands on is the same page.
So today "variant" tells you which **ad creative** ran, not which **headline** ran.

**4. A lead from the fundhub.ai homepage gets no ad tags at all. Ever — and it still
books a call.**
The homepage survey sends the full web address it was on
(`public/js/homepage-survey.js:392`, `page_url: location.href`). The receiving code
never looks at it. `parseSurveySubmitBody` at `api/public/survey-submit.mjs:51`–`:91`
reads name (`:54`, also accepts `full_name`), email (`:55`), phone (`:56`, also
accepts `mobile`), business (`:58`, also accepts `business_name`), source (`:59`),
consent (`:88`), answers (`:60`) and answers-by-id (`:61`–`:62`). It does not read
`page_url` and it does not read any `utm_` value — a search of that whole file for
`utm`, `page_url` and `attribution` returns nothing outside the one line that throws
`page_url` away. The lead record it then builds (`:135`–`:142`) has no `attribution`
in it. The writer that would save the ad number bails out immediately when there is
nothing to save (`src/ads/store.mjs:18`).

And this is not a dead end. A homepage lead that passes the gate is sent to
`https://apply.fundhub.ai/funding-book-call` — **the same calendar the paid funnel
uses** (`src/config/homepage-survey-steps.mjs:23`, redirect handed back at
`api/public/survey-submit.mjs:123` and `:164`, browser follows it at
`public/js/homepage-survey.js:419`). So bookings are already arriving with no ad row
attached, the booked-call count on the Ad Performance screen will never match the
real booking count, and nothing on that screen says why.

The hand-off link is also a bare web address with no tags on it
(`src/config/homepage-survey-steps.mjs:23`). Even if the homepage started catching ad
tags tomorrow, they would still be lost at that step.

**5. The affiliate catcher page throws every ad tag away.**
`public/start.html:43` rebuilds the destination as
`https://apply.fundhub.ai/watch` + `"?a1=" + ref + "&ref=" + ref`. It keeps the
affiliate code and **nothing else**. Every `utm_` value on the incoming link is
dropped. Any ad or affiliate link routed through `fundhub.ai/start` arrives at the
video page with no ad number on it. Same hole as finding 4, second location.

That file's own comment at `:29`–`:31` is also the best written evidence in the repo
about finding 8 below: "Bare `apply.fundhub.ai/` can 302 to the wrong CF theme;
`/apply` headless-bot-skips and drops query params; `/watch` keeps a1/ref." In plain
words: somebody already found that `/apply` loses the extra bits on the end of a web
address, and `/watch` does not.

**6. "Booked rate" on the Ad Performance screen can read over 100%, and nothing says
so.**
`src/ads/store.mjs:61` counts leads as `count(DISTINCT a.client_id)` — different
**people**. `src/ads/store.mjs:64` counts books as `count(b.id)` — different
**bookings**. The file's own comment (`:55`–`:56`) only promises the de-duplicating
for leads. So one person who books a call, cancels nothing, and books a second time
counts as **1 lead and 2 books**, and the screen divides one by the other
(`public/app/campaign-manager.html:391`–`:393`). Fix: change `count(b.id)` to
`count(DISTINCT b.client_id)` at `src/ads/store.mjs:64`. That is a one-word change in
Phase 2, not now.

**7. Everything between "landed" and "booked" cannot be split by ad number.**
`funnel_page_stats` does hold views and opt-ins for each ClickFunnels page
(`db/migrations/302_analytics_connections.sql:99`–`:121`). What it does **not** hold
is any ad column — there is no `ad_id`, no `utm_content`, nothing (read the whole
table definition at `:99`–`:121`). So you can ask "how many people saw the video
page" but never "how many people who came from ad 42 saw the video page", which is
the number you actually need to compare two ads.

Separately, some pages will always show a dash no matter what:
`src/analytics/clickfunnels.mjs:248`–`:252` returns "not available" for any page
ClickFunnels does not consider part of a funnel step, and says so in its own words —
"page is not reached via a funnel step".

**8. The ad link on `/watch` may drop the tags on the way to `/apply`.**
The button on the video page is a bare link with no tags on it:
`<a class="btn" href="/apply">` (`clickfunnels-fragments/01-vsl.html:159` and
`docs/workflows/cf-vsl-watch-html-step1.html:143`). The tag-catcher script is
supposed to hold the tags for the visit so they survive that click — its own header
says it "keeps them in sessionStorage so they survive the click from the VSL page to
the form" (`clickfunnels-fragments/06-utm-hidden-fields.html:8`). But the same
header's paste instruction says to put it on "the **APPLICATION** page (the one with
the form)" (`:2`–`:3`), and its example ad link points at `/apply`, not `/watch`
(`:21`). If it is only pasted on `/apply`, the tags are gone by the time it runs.
`public/start.html:29`–`:31` is written evidence that `/apply` does drop the extra
bits of a web address while `/watch` keeps them, which makes this worse, not better.
**Whether it is pasted on `/watch` in the live workspace is UNKNOWN.**

**9. The live `/apply` page has confirmed broken styling, and nothing records
whether it was ever fixed.**
`clickfunnels-fragments/CURSOR-PROMPT.md:30`–`:35` lists BUG 1 as **CONFIRMED** on
the `/apply` bottom fragment: two animation blocks are never closed, which "swallow
all following CSS **including the media query**" — the media query is the rule that
makes the page work on a phone — plus six colour and font settings that are used but
never defined, so "borders, mono font, gradient dividers all silently fail".
`clickfunnels-fragments/CURSOR-PROMPT.md:20` says
`clickfunnels-fragments/originals/02b-apply-bottom-BROKEN.html` is that fragment "AS
CURRENTLY LIVE, with all four Bug-1 defects intact", and that file is on disk right
now. Three rounds of fixes were written (`fixes.md`, `fixes-v2.md`, `fixes-v3.md`),
and `fixes-v3.md:4` claims the V2 replacements are live on `apply.fundhub.ai`.
**Nothing in this repo proves the fixed versions were ever pasted into
ClickFunnels.** The survey page is where people quit, so if the live one is broken on
phones, that outranks every other CRO idea in this section.

**10. Nothing syncs the ClickFunnels page numbers on its own.**
There is no scheduled job. `src/pulse/registry.mjs:20` deliberately excludes
`analytics/clickfunnels-sync` from the health checker so it does not fire a real sync
by accident. A human has to press **Sync now**
(`public/app/campaign-manager.html:407`, handler `:2312`).

**11. ClickFunnels page numbers cannot be trusted as a trend line.**
`api/analytics/clickfunnels-sync.mjs:9`–`:21` says it plainly in its own header:
ClickFunnels hands back **one total for a whole date range**, not a number per day.
So the sync writes one row stamped with **today's date** holding a rolling 7-day
total. Re-run it today and it overwrites today. A chart drawn from these rows is a
chart of overlapping totals, not daily numbers.

**12. There is no Meta Pixel on fundhub.ai at all.**
A pixel is the small piece of code that tells Meta an ad worked. A search of the
whole `public/` folder for `fbq`, `gtag` and `googletagmanager` returns **zero
hits**. So Meta can never learn from anything that happens on fundhub.ai, and could
never optimise an ad pointed there.

On the ClickFunnels side there are two pixel events written into the thank-you page
— `clickfunnels-fragments/05-thank-you.html:181` fires `AddToCalendar` and `:268`
fires `OpenInboxConfirm` — but **both are wrapped in a check for whether a pixel
exists** (`typeof fbq!=='undefined'`). If no pixel is installed on that
ClickFunnels page, both lines do nothing, silently.
`clickfunnels-fragments/fixes-v3.md:37` records the same guard. **Whether a pixel is
actually installed on the four ClickFunnels pages is UNKNOWN** — it can only be seen
inside ClickFunnels or Meta Events Manager.

**13. Cost per booked call cannot be shown.**
The roll-up counts leads and books (`src/ads/store.mjs:57`–`:78`). It never joins to
any spend figure. And per `docs/workflows/marketing-e2e.md:269`, no Meta ad account
is connected at all.

**14. Nothing measures how fast the ClickFunnels pages load.**
There **is** a speed rulebook in this repo: `docs/PERF-STANDARDS.md:10` sets a budget
for "Funnel (VSL, apply, book)" of under 2.0 seconds to show the main content, under
300KB of code, under 1.5MB total, "measured on **mobile, Slow 4G, 4x CPU throttle**"
(`:14`), and says why (`:16`): "every 1s of load costs roughly 7-10% of
conversions". What is missing is any measuring. A search of `scripts/` and
`.github/workflows/` for a page-speed run against `apply.fundhub.ai` returns
nothing. The rulebook exists; nobody is holding the ClickFunnels pages to it, and no
agent can — those pages are not served from this repo.

---

## The data model

### `client_ad_attribution` — which ad brought this person
`db/migrations/286_client_ad_attribution.sql:95`–`:120`. One row per client.

| Column | Plain meaning |
|---|---|
| `client_id` | who this is |
| `org_id` | which company owns the row |
| `utm_source` | where the click came from, e.g. `fb` |
| `utm_medium` | how, e.g. `paid` |
| `utm_campaign` | the lane it was filed under |
| `utm_content` | the ad number, possibly with a name after it |
| `utm_term` | the label you typed for this version of the creative |
| `landing_path` | the page they first landed on |
| `referrer_domain` | the site they came from |
| `lane` | worked out by the database from `utm_campaign`. Never blank — an unrecognised one is `unknown`. (`:109`) |
| `ad_id` | worked out from `utm_content`. Leading digits only. Blank when the value is not that shape. (`:110`) |
| `variant` | worked out from `utm_term`, lowercased. (`:111`) |
| `captured_at`, `updated_at` | when |

### `funnel_page_stats` — how a ClickFunnels page performed
`db/migrations/302_analytics_connections.sql:99`–`:121`.

| Column | Plain meaning |
|---|---|
| `clickfunnels_funnel_id`, `clickfunnels_page_id` | which page (`:104`–`:105`) |
| `funnel_name`, `page_name` | its names, for reading (`:106`–`:107`) |
| `stat_date` | the day the sync ran, **not** the day the traffic happened (`:109`) |
| `views` | how many looked at it. **Blank means ClickFunnels did not answer. It never means zero.** (`:110`–`:114`) |
| `conversions` | today this counts **opt-ins** — someone handing over an email (`src/analytics/clickfunnels.mjs:255`). See UNKNOWN below. |
| `captured_at` | when the row was written (`:118`) |

**There is no ad column on this table** (whole definition, `:99`–`:121`). That is
finding 7.

### `analytics_connections` — the ClickFunnels login
`db/migrations/302_analytics_connections.sql:43`. One row per platform.

- The key is stored scrambled, as one encrypted blob, never as a readable
  side-by-side copy — the table's own comment says so at `:53`–`:55`
  (`encrypted_credentials`, "One JSON object, encrypted whole. Never a plaintext
  sibling column").
- Only staff can read it. The file turns on row-level locking and writes a
  staff-only rule at `:163`–`:167` (`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL
  SECURITY`, then a policy `USING (fundhub_is_staff())`).
- `external_account_id` holds the ClickFunnels workspace subdomain — the X in
  X.myclickfunnels.com (`:49`–`:51`).
- `connection_state` is one of `pending`, `active`, `expired`, `revoked`, `error`
  (`:58`–`:63`).

### `bookings` — a booked call
`db/migrations/225_bookings.sql:43`–`:74`. `starts_at` and `ends_at` are allowed to
be blank on purpose (`:63`–`:64`): a booking whose provider sent no time is real,
and inventing a time "would show a call nobody scheduled" — the reasoning runs at
`:34`–`:42`. `source` records the true origin (`:58`–`:60`), `'clickfunnels'` for
this funnel. An earlier version of the system labelled every booking `'calcom'`,
which was simply wrong: measured on the live database 2026-08-18, of 31
`booking.created` events, 27 were clickfunnels, 2 gauntlet-all, 1 gauntlet, 1 sim,
and **none** calcom (`:17`–`:30`).

### What the numbers on the Ad Performance screen mean
`src/ads/store.mjs:57`–`:78`. Grouped by lane, ad number and version:

- **leads** — how many different **people** that ad brought in
  (`count(DISTINCT a.client_id)`, `:61`)
- **books** — how many **booked calls** that ad produced, counting a call and not a
  person. One person who books twice adds two. (`count(b.id)`, `:64`.) A cancelled
  booking does not count (`:70`).
- **first / last** — the first and last dates (`:62`–`:63`, `:65`–`:66`)

Because leads counts people and books counts calls, booked rate can read over 100%.
See finding 6.

---

## The screens

### Campaign Manager — `public/app/campaign-manager.html`
Staff only.

**Ad Performance — which ad booked a call** (`:374`).
You see a table: Group, Leads, Booked calls, Booked rate, First booked, Last booked.
A dropdown changes what "Group" means — you can slice by lane, by ad number, by
version, by credit gate, by entry type, or by which offer the ad led with. Those
seven choices are fixed at `api/read/ad-books.mjs:27`. Booked rate is booked calls
divided by leads, blank when there are no leads (`:391`–`:393`) — and it counts
calls on top and people on the bottom, so it can go over 100% (finding 6).

**Funnel Pages** (card opens `:403`).
You see: Funnel, Page, Date, Views, Conversions (column headers `:413`). One button,
**Sync now** (`:407`). Pressing it calls ClickFunnels and refills the table
(`:2312`–`:2332`). Under the button a line says either "Not connected yet — see
Connections below" or "Connected · last synced …" (the element is `:409`, filled in
at `:1205`–`:1213`). A dash in the Conversions column means ClickFunnels did not
answer — never a zero it did not report (`:420`).

**Connections** (`:512`).
Two boxes: **API key** (`:561`) and **Subdomain** (`:566`), and a Connect button
(`:2334`). What actually happens when you press Connect, read from the code and not
from the screen (`api/analytics/clickfunnels-connect.mjs`):

1. Only staff can do it (`:46`–`:48`).
2. The subdomain must be a plain word — letters, numbers and dashes, up to 63
   characters (`:38`). Anything else is refused with the message "subdomain must
   look like the X in X.myclickfunnels.com" (`:58`–`:64`).
3. **The key is tested against ClickFunnels before anything is saved** (`:70`–`:78`).
   If ClickFunnels refuses it, **nothing is written** and the screen shows
   ClickFunnels' own words back, unchanged (`:73`–`:77`). The file explains why at
   `:9`–`:13`: a broken key saved as "active" would fail every future sync silently
   against a row that looks connected.
4. Only then is the key stored, scrambled, and the row marked `active`
   (`:66`, `:81`–`:93`).
5. **The key is never handed back**, not even scrambled (`:15`–`:19`).

**Why the Subdomain box exists at all, and why the answer matters.**
`src/analytics/clickfunnels.mjs:10`–`:25` says a ClickFunnels API key is issued per
**team**, and one team can hold more than one workspace. So the key alone does not
say which workspace to look at. The code walks the teams and matches on the
subdomain you typed (`:16`–`:20`). If Chris types the wrong subdomain, the connect
can succeed against the **wrong workspace** and every number afterwards will be the
wrong funnel's numbers. Chris needs to know the right subdomain before he presses
Connect.

### Closer Dashboard — `public/app/closer-dashboard.html`
When a call opens, four lines appear under the client's name (`:565`–`:570`):

- **Gate** — `600+`, `720+`, `780+`, or `No FICO gate`
- **Entry** — `Direct · sell what they were promised`, or `Sorting · every road is open`
- **Primary** — the offer that ad led with
- **Secondary** — the other offers, or `All`, or `None`

They stay hidden until the read answers, so nothing on that screen is ever a guess
(`public/app/closer-call.js:213`–`:229`). The same four lines appear in the Pipeline
drawer (`public/app/pipeline.html:2226`).

### The Optimize page — `public/optimize.html`
A whole second landing page with its own money path. It is a third route to a booked
call.

- The main button, "Get My Credit Report", is an affiliate link to
  `https://smartcredit.com/cblp/?PID=29056` (`:250`). `PID=29056` is Fundhub's
  partner number. `api/public/optimize.mjs:37` records that this exact address is
  the one ConsumerDirect said is "for link tracking or integration", and that the
  older bare form "does not track".
- It has its own form — first name, last name, phone (`:174` onward, phone at
  `:192`).
- It has its own "Or book a call first" button pointing at
  `https://apply.fundhub.ai/schedule/phonecall` (`:281`), and the click handler
  sends the person there (`:341`–`:344`).
- On load it asks the server where to send people (`:348`, `GET
  /api/public/optimize`), and the server can override that calendar address
  (`:351`). The default lives at `api/public/optimize.mjs:26`.
- **It catches no ad tags.** A search of the whole file for `utm` and `attribution`
  returns nothing but a phone input and an unrelated comment. Same hole as findings
  4 and 5, third location.

There are already two written journey files for this page —
`docs/journeys/optimize-intended.md` and `docs/journeys/optimize-actual.md`. The
intended one settles a question this section previously left open:
`docs/journeys/optimize-intended.md:38` says that calendar is "the Fundhub phonecall
calendar … (Meeting with Chris, 30 min, One-on-One). **Not the funding survey
calendar.**" So it is a different calendar on purpose, not a mistake.

### What the client sees — one click, end to end

**Hop 1.** Person clicks a Meta ad. The link is
`apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=funding600&utm_content=42-ringlights&utm_term=sun`
(`docs/workflows/manual-walkthrough-runbook.html:128`).

**Hop 2.** The video page loads. They see the headline, the video, and one button
that says "Get Started"
(`docs/workflows/cf-vsl-watch-html-step1.html:113`, `:119`, `:143`).

**Hop 3 — UNVERIFIED.** The tag-catcher script saves the five tags for the visit
(`clickfunnels-fragments/06-utm-hidden-fields.html:45`–`:59`). Whether this script is
pasted onto `/watch` in the live ClickFunnels workspace cannot be checked from this
repo. Its own paste instruction names the application page, not the video page
(`:2`–`:3`). If it is not on `/watch`, everything after this hop still happens — but
with no ad number attached.

**Hop 4.** They click through to `/apply` and answer the survey. The script writes
the five tags into invisible boxes on the form
(`clickfunnels-fragments/06-utm-hidden-fields.html:61`–`:79`).

**Hop 4a — UNVERIFIED.** Whether the survey answers are stored at all. See finding 1
(`docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:41`).

**Hop 5.** They submit. ClickFunnels sends a message to
`https://fundhub.ai/api/webhooks/clickfunnels`
(`docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:63`). That address is a real, wired
door: `api/webhooks/[provider].mjs:5` lists it, `:38`–`:57` reads the exact bytes
ClickFunnels sent and hands them to `handleWebhook`
(`api/webhooks/[provider].mjs:50`), and `src/http/router.mjs:69`–`:73` is where
`clickfunnels` is registered, together with the signature header it checks and the
secret it checks against (`CLICKFUNNELS_WEBHOOK_SECRET`). The exact bytes matter:
`api/webhooks/[provider].mjs:28`–`:31` explains that re-typing the message would
break the signature check "in a way that looks like an attack rather than a bug".

**Hop 5a — a one-line setup check that can silently zero the whole screen.**
`docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:66` says ClickFunnels must be set to
fire on "contact / survey submit **and** appointment booked". If only survey submit
is switched on, every booking is invisible to us — the booked-call column stays at
zero while calls actually happen.

**Hop 6.** The message is unpacked. `pickVisitAttribution`
(`src/adapters/clickfunnels.mjs:170`–`:196`) looks for the tags in three places in
order of trust: an explicit block, then the hidden form boxes (`custom_attributes`,
then `custom_fields`), then ClickFunnels' own record of their first visit
(`:176`–`:181`).

**Hop 6a — UNVERIFIED.** Which of `custom_attributes` and `custom_fields` the live
ClickFunnels workspace actually uses. The code reads both. Only the first is proved
by a test (`docs/journeys/ad-attribution-flow.md:56`).

**Hop 7.** An `entry.captured` message goes onto the internal bus carrying the tags
(`src/adapters/clickfunnels.mjs:344`, `:362`).

**Hop 8.** `onEntryCaptured` saves the row
(`src/handlers/client-lifecycle.mjs:273`–`:274`). The database itself works out the
lane, ad number and version (`286:109`–`:111`). A second visit fills blanks only —
the ad that brought them keeps the credit (`src/ads/store.mjs:26`–`:32`). If this row
is refused for any reason, it is logged and **the lead is still created**
(`src/handlers/client-lifecycle.mjs:277`).

**Hop 8a — UNKNOWN.** Whether anything on the paid funnel applies the credit-band and
negatives gate described above, or whether ClickFunnels routes everyone to the
calendar. `src/config/survey-qualification.mjs:63`–`:70` is the only gate in this
repo, and it reads answers off the client record. On the paid funnel one of its two
questions does not exist (`docs/clickfunnels/cf-survey-ground-truth.md:9`).

**Hop 9.** They land on `/funding-book-call` and pick a time. ClickFunnels sends an
appointment message. The adapter listens for `appointments/scheduled_event.created`
(`src/adapters/clickfunnels.mjs:64`) and turns it into `booking.created`
(`:519`). A calendar form post that carries a start time becomes the same thing
(`:511`).

**Hop 10.** `onBookingCreated` (`src/handlers/comms.mjs:454`–`:490`) finds the
client, makes a follow-up job for the closer, stores the booking, and moves their
card on the sales board to **Booked**. All the actual booking database work lives in
one file, `src/bookings/store.mjs` (its own header, `:1`–`:8`, says so). That file
never writes the word `calcom` (`:10`–`:15`), and it finds a booking by the
provider's own booking id without caring what label was written on it
(`:17`–`:24`) — because when it did care, a reschedule created a second row and one
call showed on the calendar twice.

**Hop 11.** The closer opens the call screen. It asks
`GET /api/read/ad-attribution?client_id=…` (`api/read/ad-attribution.mjs:40`–`:71`).

**Hop 12.** The ad number is looked up in `docs/ads/registry.json`. A number the list
does not know resolves to the widest door — no gate, sorting entry, no primary, all
secondary — and is logged once (`src/ads/registry.mjs:8`–`:11`).

**Hop 13.** The four lines paint under the client's name
(`public/app/closer-call.js:221`–`:229`).

**Hop 14.** For the roll-up, `GET /api/read/ad-books?group_by=…` counts leads and
non-cancelled bookings per group (`src/ads/store.mjs:57`–`:78`) and the Campaign
Manager table draws it (`public/app/campaign-manager.html:2120`–`:2130`).

---

## Definition of done

A human can tick each of these. Steps 1 to 4 happen inside ClickFunnels and nothing
downstream works until they are done.

1. **In ClickFunnels, create the five ad-number boxes.** Contacts → Settings →
   Custom attributes. Exact names: `utm_source`, `utm_medium`, `utm_campaign`,
   `utm_content`, `utm_term`, plus `landing_path` and `referrer_domain`
   (`clickfunnels-fragments/06-utm-hidden-fields.html:26`–`:31`). Then correct
   `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md` Part A, which does not list them.
2. **In ClickFunnels, map every survey question to its `cf_svy_*` box.** Part B of
   `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:43`–`:54` is the exact list. That
   file says today every question shows "Contact Attribute = None" (`:41`). Confirm
   that is no longer true.
3. **In ClickFunnels, confirm the webhook fires on appointment booked as well as
   survey submit** (`docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:66`). Send one
   test booking. It must appear as a booked call.
4. **Confirm whether `clickfunnels-fragments/06-utm-hidden-fields.html` is pasted on
   the `/watch` page as well as the `/apply` page.** Write the answer down. If it is
   only on `/apply`, move it to `/watch` too.
5. Open Campaign Manager → **Connections**. Type the ClickFunnels API key and the
   correct workspace subdomain. Press Connect. The message says "Connected and
   synced." If it says anything else, the words are ClickFunnels' own
   (`api/analytics/clickfunnels-connect.mjs:73`–`:77`).
6. Scroll to **Funnel Pages**. Rows appear for `/watch`, `/apply`,
   `/funding-book-call` and `/thank-you`, and Views is a number, not a dash. **A dash
   here may be correct, not broken:** `src/analytics/clickfunnels.mjs:248`–`:252`
   returns nothing for any page ClickFunnels does not count as a funnel step. Write
   down which pages show a dash and which reason the screen gives.
7. Decide what "Conversions" should mean — people who gave an email, or people who
   paid — and record the decision. Today the code counts emails
   (`src/analytics/clickfunnels.mjs:255`).
8. Confirm which of the two `/watch` skins is live, and delete or mark the other one.
   Two of the three copies in the repo say "Get Up to"
   (`clickfunnels-fragments/01-vsl.html:129` and the machine-built
   `clickfunnels-fragments/harness/watch.html:142`); one does not
   (`docs/workflows/cf-vsl-watch-html-step1.html:113`).
9. Confirm whether the fixed `/apply` bottom fragment was ever pasted into
   ClickFunnels, or whether the broken one recorded at
   `clickfunnels-fragments/CURSOR-PROMPT.md:20` is still live. Open
   `apply.fundhub.ai/apply` on a phone and look at it.
10. Confirm whether a Meta Pixel is installed on the four ClickFunnels pages. If it
    is not, the two events at `clickfunnels-fragments/05-thank-you.html:181` and
    `:268` are doing nothing.
11. Click one live ad link end to end. Open the resulting client on the closer
    screen. The four ad lines show the right gate, entry, primary and secondary for
    that ad number.
12. Open Campaign Manager → **Ad Performance**, set Group to "ad_id". That ad number
    appears with 1 lead and 1 booked call.
13. Paste a Microsoft Clarity project ID into `public/js/clarity.js:27` and set
    Masking to **Strict** in the Clarity dashboard. Load fundhub.ai. A session
    appears in Clarity.
14. Every funnel step has a count **and every count can be split by ad number.** The
    second half needs a new column: `funnel_page_stats` has no ad column today
    (`db/migrations/302_analytics_connections.sql:99`–`:121`). That is Phase 2 work,
    not a box Chris can tick by looking.
15. Booked rate can no longer read over 100%: `src/ads/store.mjs:64` counts distinct
    people, not calls.
16. A headline can be changed on one version of a page while the other version stays
    as it is, traffic splits between them, and the Ad Performance screen shows a
    separate booked rate for each. **Half of this is already built** —
    `clickfunnels-fragments/harness/build.mjs` plus
    `clickfunnels-fragments/tests/layout.spec.mjs` already let a headline be changed
    and all four pages checked locally. What is missing is serving two versions to
    real people.
17. Cost per booked call appears next to booked calls on the Ad Performance screen.
    Blocked on a Meta ad account connection (`docs/workflows/marketing-e2e.md:269`).

---

## UNKNOWN — blocked or unverifiable

| What | Why it is unknown |
|---|---|
| **ClickFunnels API key** | Listed as blocked on Chris at `docs/workflows/marketing-e2e.md:266`. Not in the repo. Without it, `funnel_page_stats` stays empty and Funnel Pages shows "Not connected yet". |
| **Which workspace subdomain to type** | `src/analytics/clickfunnels.mjs:10`–`:20`: a key belongs to a whole team, and a team can hold more than one workspace. The wrong subdomain connects to the wrong funnel and every number afterwards is wrong. Only Chris can say which. |
| **Were the five `utm_*` boxes ever created in ClickFunnels?** | `clickfunnels-fragments/06-utm-hidden-fields.html:26`–`:31` says they must be. `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:19`–`:31` does not list them. Nothing records the answer. |
| **Are the survey questions mapped to their boxes yet?** | `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:41`: "Today every question shows Contact Attribute = None. Fix that." Nothing records that it was fixed. |
| **Is the webhook set to fire on appointment booked?** | `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:66` asks for it. Only the ClickFunnels workspace can show whether it is on. |
| **On the paid funnel, is anything applying the booking gate?** | The gate needs two answers (`src/config/survey-qualification.mjs:63`–`:70`) and one of them does not exist on the ClickFunnels survey (`docs/clickfunnels/cf-survey-ground-truth.md:9`, and `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md:34` says do not add it). Whether ClickFunnels sends everyone to the calendar regardless can only be seen in the ClickFunnels editor. |
| **Does "conversions" mean opt-ins or sales?** | `src/analytics/clickfunnels.mjs:255` counts `step.optins` — people who gave an email. `step.sales_count` — people who paid — is the alternative. The file's own header says ClickFunnels has no field literally called "conversions" (`:31`–`:36`). Listed as Chris's decision at `docs/workflows/marketing-e2e.md:270`. Not guessed, not changed. |
| **Which `/watch` skin is live?** | Three copies, two headlines. `clickfunnels-fragments/01-vsl.html:129` and `clickfunnels-fragments/harness/watch.html:142` say "Get Up to"; `docs/workflows/cf-vsl-watch-html-step1.html:113` does not. The harness copy is machine-built from the first (`clickfunnels-fragments/harness/build.mjs:16`) so it is not an independent vote. Nothing records which is pasted into ClickFunnels. |
| **Is the tag-catcher pasted on `/watch`?** | `clickfunnels-fragments/06-utm-hidden-fields.html:2`–`:3` says paste it on the application page; `:8` says the tags must survive the click from the video page. Only the ClickFunnels editor can settle it. |
| **Is the broken `/apply` bottom fragment still live?** | `clickfunnels-fragments/CURSOR-PROMPT.md:20` says `originals/02b-apply-bottom-BROKEN.html` is the version "AS CURRENTLY LIVE". `clickfunnels-fragments/fixes-v3.md:4` claims the V2 replacements are live. The two disagree and nothing in the repo settles it. |
| **Is a Meta Pixel installed on the four ClickFunnels pages?** | `clickfunnels-fragments/05-thank-you.html:181` and `:268` only fire if one exists. A search of `public/` for `fbq`, `gtag` and `googletagmanager` returns zero hits, so fundhub.ai has none — but the ClickFunnels pages are not in this repo. |
| **Which key the live workspace sends hidden fields under** | `custom_attributes` or `custom_fields`. The adapter reads both (`src/adapters/clickfunnels.mjs:177`–`:180`). Only the first is test-proved (`docs/journeys/ad-attribution-flow.md:56`). |
| **Where paid traffic actually points today** | The only live ad links written down in this repo point at `apply.fundhub.ai/watch` (`docs/workflows/manual-walkthrough-runbook.html:128`–`:129`). Whether that is where every dollar is currently going can only be seen in Meta Ads Manager. So the fundhub.ai tag hole (finding 4) may already be losing money, and nothing here can say. |
| **Whether any `analytics_connections` row exists today** | Requires reading the live database. Not done in this read-only pass. |
| **Whether any `client_ad_attribution` rows exist today** | Same. |
| **Microsoft Clarity project ID** | Listed as blocked on Chris at `docs/workflows/marketing-e2e.md:268`. See the Clarity section below. |
| **Meta ad spend** | `docs/workflows/marketing-e2e.md:269` — no `ad_platform_connections` row exists. So no cost-per-booked-call is possible. |
| **How fast the ClickFunnels pages load** | There is a budget for them — `docs/PERF-STANDARDS.md:10` — and nothing measures it. A search of `scripts/` and `.github/workflows/` finds no page-speed run against `apply.fundhub.ai`. Those pages are not served from this repo, so no agent here can measure them. |
| **What Microsoft Clarity would actually show us** | See the Clarity section. What that product does is not written down anywhere in this repository. |
| **Whether `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` may be corrected** | Chris's decision, listed at `docs/workflows/marketing-e2e.md:271`. Not this lane's to make. |

---

## Microsoft Clarity — where it is, and whether it is on

**Where it is.** One file: `public/js/clarity.js`, **48 lines**. It is loaded by five
pages, and only these five:

- `public/index.html:783`
- `public/optimize.html:579`
- `public/start.html:67`
- `public/education/enroll/index.html:214`
- `public/affiliates/index.html:786`

**Is it gated off? Yes, completely.** `public/js/clarity.js:27` reads:

```js
var CLARITY_PROJECT_ID = "";
```

and the very next block (`:30`–`:33`) says: if there is no ID, do nothing — no
network call, no globals, no console noise. So today the file loads, checks the empty
ID, and stops. **Nothing is recorded. Nothing is sent to Microsoft.**

**To turn it on, two things, both required** (`public/js/clarity.js:5`–`:14`):

1. Paste the real project ID from clarity.microsoft.com → Settings → Setup into
   line 27.
2. In the Clarity dashboard, set Settings → Masking to **Strict**. That is a
   dashboard switch. There is no code that can set it. An earlier draft called
   `window.clarity("set", "maskTextContent", true)`, which is **not a real Clarity
   command** — it was removed because it did nothing while pretending to protect the
   site (`:11`–`:14`). Do not put it back.

**What is already hidden from it in code.** The whole homepage survey form carries
`data-clarity-mask="true"` (`public/index.html:610`). The comment above it
(`:602`–`:609`) explains why the whole form and not single questions: the survey
rewrites itself completely at every step, so a question added later would otherwise
ship unhidden without anyone noticing. Two of its steps ask for real dollar bands —
annual business revenue (`public/js/homepage-survey.js:75`–`:86`) and annual personal
income (`:100`–`:111`).

**What it would give us — UNKNOWN from this repository.** `public/js/clarity.js`
describes how to switch Clarity on and what to hide from it. It does not describe
what Clarity shows you once it is on, and neither does any other file here. Nothing
in this repo can be quoted for that, so this section does not claim it. Chris can
read the feature list on clarity.microsoft.com before deciding whether the project ID
is worth pasting in.

**What it definitely would NOT cover.** Clarity is loaded by five fundhub.ai pages and
no others. A search of every file in `clickfunnels-fragments/` for the word "clarity"
returns **zero hits**, so none of the four paid-funnel skins loads it. Even with the
ID pasted in, you would see the homepage and the Optimize page, and **nothing at all
of the paid funnel**, which is where the ad money goes. Adding it there means pasting
the loader into a ClickFunnels Custom HTML box on each of the four pages. That is not
something an agent can do from here.

---

## One thing worth saying once

The homepage at fundhub.ai and the ClickFunnels `/apply` page ask almost the same
questions, both create leads, and **both end at the same calendar** — but they are two
separate builds that can drift.

`docs/clickfunnels/cf-survey-ground-truth.md:9` records the drift that matters most:
the homepage asks "Any negatives on your credit report?" and ClickFunnels does not.
That is not a cosmetic difference. It is one half of the two-answer gate at
`src/config/survey-qualification.mjs:63`–`:70` that decides whether a person is ever
shown a calendar. On the homepage the gate has both answers. On the paid funnel it
has one.

The homepage version also loses ad tags entirely (finding 4), the affiliate catcher
loses them (finding 5), and the Optimize page never catches them (the Optimize
section above). Three doors into the same building, none of them carrying the ad
number.
