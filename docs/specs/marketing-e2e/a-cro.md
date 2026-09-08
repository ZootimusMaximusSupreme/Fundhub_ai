# Lane A — CRO: the funnel and the landing pages

Written 2026-09-08 on `main` at `fe864840`. Read-only pass. Every claim below
names the file and line it came from. Where a line could not be checked from
this repository it says **UNKNOWN** and why.

---

## What Chris gets when this is done

You will be able to see, for one ad number, how many people landed, how many
booked a call, and where the rest fell out. Right now you can see the first
number and the last number but nothing in between. You will also be able to
change a headline and find out if it made things better or worse, which today
is impossible because nothing in the system can tell two versions of a page
apart. And the screen recordings that would show you people getting stuck are
built but switched off, waiting on one ID from you.

---

## What exists today

### The pages, and which one an ad points at

There are two separate websites.

**Website 1 — ClickFunnels. This is where paid traffic goes.**
The paid funnel is four pages, in this order:

| Order | Page | Evidence |
|---|---|---|
| 1 | `apply.fundhub.ai/watch` — video sales letter | `clickfunnels-fragments/CURSOR-PROMPT.md:6` |
| 2 | `apply.fundhub.ai/apply` — the survey | same line |
| 3 | `apply.fundhub.ai/funding-book-call` — the calendar | same line |
| 4 | `apply.fundhub.ai/thank-you` | same line |

`docs/workflows/manual-walkthrough-2026-09-03.md:33` says the same thing in one
sentence: "Front door is a 4-page CF funnel: /watch → /apply (9-question survey,
branches at 'Do you have a business?') → /funding-book-call → /thank-you."

**The page an ad actually points at is `/watch`, page 1.** The live ad link,
written out in full with all five tags, is at
`docs/workflows/manual-walkthrough-runbook.html:128`:

```
https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=funding600&utm_content=42-ringlights&utm_term=sun
```

A second one, a different lane and a different ad number, is on the next line
(`:129`, `utm_campaign=sorting`, `utm_content=43`).

None of those four pages lives in this repository. What lives here is the
**paint** for them — big blocks of HTML and CSS that get pasted into a
ClickFunnels "Custom HTML" box:

| File | What it paints | Lines |
|---|---|---|
| `clickfunnels-fragments/01-vsl.html` | the `/watch` page | headline at `:129`, video at `:135`, button at `:159` |
| `docs/workflows/cf-vsl-watch-html-step1.html` | the `/watch` page, a **second copy** | headline at `:113`, video at `:119`, button at `:143` |
| `clickfunnels-fragments/02a-apply-top.html`, `02b-apply-bottom.html` | the `/apply` page | — |
| `clickfunnels-fragments/04a-book-top.html`, `04b-book-bottom.html` | the `/funding-book-call` page | — |
| `clickfunnels-fragments/05-thank-you.html` | the `/thank-you` page | — |
| `clickfunnels-fragments/06-utm-hidden-fields.html` | invisible. Carries the ad number into the form. | — |

The video itself is a real file in this repo: `public/funnel/vsl.mp4`. Both
`/watch` skins point at it by full address
(`clickfunnels-fragments/01-vsl.html:135` and
`docs/workflows/cf-vsl-watch-html-step1.html:119`, both
`https://fundhub.ai/funnel/vsl.mp4`).

**Website 2 — fundhub.ai. This repo. Not where paid traffic goes.**

| File | What a person sees | Key lines |
|---|---|---|
| `public/index.html` (785 lines) | the marketing homepage, with its **own** 12-step survey | form at `:610`, survey script at `:782` |
| `public/js/homepage-survey.js` (443 lines) | the 12 steps of that survey | steps `:8`–`:142`, submit `:380` |
| `public/optimize.html` (581 lines) | a separate credit-report page (SmartCredit) | headline `:168`, form `:174`, book button `:309` |
| `public/start.html` (69 lines) | an affiliate link catcher. Records the click, then bounces to `apply.fundhub.ai/watch` | destination `:32`, click record `:52` |
| `public/crm.html` (23 lines) | not a page. It redirects straight to `/app/` | `:16` |
| `public/progress.html` | the client's own progress page, **after** they have bought | title `:4` |
| `public/contract.html` | the document signing page, **after** the call | title `:4` |
| `public/careers.html`, `login.html`, `portal-login.html`, `reset-password.html`, `unsubscribe.html`, `404.html` | not funnel pages | — |
| `public/education/index.html`, `public/affiliates/index.html`, `public/partner/index.html`, `public/privacy/`, `public/terms/` | side doors | — |

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

**Is it live? UNKNOWN.** Both copies were committed on the same day,
2026-08-17 (`git log`: `36382c6f` for the `docs/workflows/` copy, `b3c46711`
for `clickfunnels-fragments/01-vsl.html`). Their headlines differ:

- `clickfunnels-fragments/01-vsl.html:129` — "Get **Up to** $50,000 to $1,000,000…"
- `docs/workflows/cf-vsl-watch-html-step1.html:113` — "Get $50,000 to $1,000,000…"

Nothing in this repo says which one is pasted into ClickFunnels right now. There
is no way to check without opening the ClickFunnels editor.

### The tracking plumbing that already works

| Piece | Where | What it does |
|---|---|---|
| Ad tags → hidden form boxes | `clickfunnels-fragments/06-utm-hidden-fields.html:39`–`:83` | Reads the five tags off the web address, keeps them for the visit, and writes them into every form on the page. First one wins. |
| Ad number rule | `db/migrations/286_client_ad_attribution.sql:81`–`:84` | `fundhub_ad_id()`. Leading digits only. `16-phase` → `16`. `16` → `16`. Anything else → blank, never a guess. |
| Lane rule | same file, `:67`–`:77` | `funding600`, `premium`, `sorting`, `uwiq`, `wl`, else `unknown`. Never blank. |
| Version rule | same file, `:87`–`:93` | lowercases whatever was in `utm_term`. |
| The table | same file, `:95`–`:120` | One row per client. `lane`, `ad_id`, `variant` are worked out by the database itself, not by any program. |
| First touch wins | `src/ads/store.mjs:26`–`:32` | A second visit fills in blanks. It never overwrites what is already there. |
| The roll-up | `src/ads/store.mjs:57`–`:78` | Counts leads and booked calls per group. A cancelled booking does not count. |
| ClickFunnels page numbers | `src/analytics/clickfunnels.mjs:230`–`:257` | Asks ClickFunnels for views and opt-ins for one page. |
| Where those numbers land | `api/analytics/clickfunnels-sync.mjs:91`–`:108` | Writes them into `funnel_page_stats`. |

### The screens that already show this

| Screen | Panel | Lines |
|---|---|---|
| `public/app/campaign-manager.html` | **CM-09 Ad Performance — which ad booked a call**. Group, Leads, Booked calls, Booked rate, First booked, Last booked. | panel `:374`–`:394`, read `:2120`–`:2130` |
| `public/app/campaign-manager.html` | **CM-10 Funnel Pages**. Funnel, Page, Date, Views, Conversions, plus a **Sync now** button. | panel `:404`–`:420`, read `:1229`–`:1240`, button `:2312` |
| `public/app/campaign-manager.html` | **CM-07 Connections**. Where the ClickFunnels API key and subdomain get typed in. | `:512`, inputs `:560`–`:566`, save `:2334` |
| `public/app/closer-dashboard.html` | four lines under the client's name: Gate, Entry, Primary, Secondary | `:565`–`:570`, painted by `public/app/closer-call.js:213`–`:229` |
| `public/app/pipeline.html` | the same four lines in the client drawer | `:2226` |

All the doors these screens knock on are wired up in the routing table:
`netlify/functions/api.mjs:580` (`read/ad-attribution`), `:581` (`read/ad-books`),
`:582` (`read/funnel-pages`), `:584`–`:585` (the two ClickFunnels endpoints).

---

## What is missing, worst first

**1. A lead from the fundhub.ai homepage gets no ad tags at all. Ever.**
The homepage survey sends the full web address it was on
(`public/js/homepage-survey.js:392`, `page_url: location.href`). The receiving
code never looks at it. `parseSurveySubmitBody` at
`api/public/survey-submit.mjs:51`–`:91` reads name, email, phone, business,
source, consent and answers. It does not read `page_url` and it does not read
any `utm_` value. The lead record it then builds
(`api/public/survey-submit.mjs:135`–`:142`) has no `attribution` in it. The
writer that would save the ad number bails out immediately when there is nothing
to save (`src/ads/store.mjs:18` — returns nothing if `attribution` is missing).
So: **if you ever point an ad at fundhub.ai instead of apply.fundhub.ai, that
spend is invisible.** Today all paid traffic goes to ClickFunnels, so nothing is
being lost right now. But it is a live trap.

**2. There is no A/B or variant mechanism anywhere. None.**
I searched every page in `public/`, every file in `public/js/`, and every
ClickFunnels fragment for "variant", "a/b", "split test" and "experiment". The
only hits are `public/progress.html:91` (a font setting, `font-variant-numeric`)
and `clickfunnels-fragments/06-utm-hidden-fields.html:18` (a comment describing
the `utm_term` tag). Nothing serves two versions of a page. Nothing splits
traffic. Nothing measures one against the other.

`utm_term` (`sun`, `nosun`, `sedona`) is a **label you type into the ad link by
hand**, not a test. It is stored (`286:111`) and you can group by it
(`api/read/ad-books.mjs:27`). But the page each version lands on is the same
page. So today "variant" tells you which **ad creative** ran, not which
**headline** ran.

**3. Everything between "landed" and "booked" is dark.**
The roll-up (`src/ads/store.mjs:57`–`:78`) joins `client_ad_attribution` to
`bookings`. It gives you two numbers per ad: leads and booked calls. There is no
count of people who saw the video page, no count who reached the survey, no
count who started the survey and quit, no count who reached the calendar and did
not pick a time. If an ad's booked rate drops you cannot tell whether the video
lost them, the survey lost them, or the calendar lost them.

**4. ClickFunnels page numbers exist but cannot be trusted as a trend line.**
`api/analytics/clickfunnels-sync.mjs:9`–`:21` says it plainly in its own header:
ClickFunnels hands back **one total for a whole date range**, not a number per
day. So the sync writes one row stamped with **today's date** holding a rolling
7-day total. Re-run it today and it overwrites today. A chart drawn from these
rows is a chart of overlapping totals, not daily numbers.

**5. Nothing syncs those numbers on its own.**
There is no scheduled job. `src/pulse/registry.mjs:20` deliberately excludes
`analytics/clickfunnels-sync` from the health checker so it does not fire a real
sync by accident. A human has to press **Sync now** on the Campaign Manager
screen (`public/app/campaign-manager.html:2312`).

**6. The two `/watch` skins have drifted.**
Two files paint the same page with two different headlines (see above). Whichever
is live, the other is wrong. Nothing in the repo records which.

**7. The ad link on `/watch` may drop the tags on the way to `/apply`.**
The button on the video page is a bare link with no tags on it:
`<a class="btn" href="/apply">` (`clickfunnels-fragments/01-vsl.html:159` and
`docs/workflows/cf-vsl-watch-html-step1.html:143`). The tag-catcher script is
supposed to save the tags for the visit so they survive that click — its own
header says it "keeps them in sessionStorage so they survive the click from the
VSL page to the form" (`clickfunnels-fragments/06-utm-hidden-fields.html`, header
comment). But the same header's paste instruction says to put it on **"the
APPLICATION page (the one with the form)"**, and its example ad link points at
`/apply`, not `/watch`. If it is only pasted on `/apply`, the tags are gone by
the time it runs. **Whether it is pasted on `/watch` in the live workspace is
UNKNOWN** — it can only be checked inside ClickFunnels.

**8. Cost per booked call cannot be shown.**
The roll-up counts leads and books. It never joins to any spend figure. And per
`docs/workflows/marketing-e2e.md:270`, no Meta ad account is connected at all.

**9. No page-speed number for any funnel page.**
Nothing in the repo measures how fast `/watch` or `/apply` load. A slow video
page loses people before the first word.

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
| `clickfunnels_funnel_id`, `clickfunnels_page_id` | which page |
| `funnel_name`, `page_name` | its names, for reading |
| `stat_date` | the day the sync ran, **not** the day the traffic happened |
| `views` | how many looked at it. **Blank means ClickFunnels did not answer. It never means zero.** (`:110`–`:113`) |
| `conversions` | today this counts **opt-ins** — someone handing over an email. See UNKNOWN below. |
| `captured_at` | when the row was written |

### `analytics_connections` — the ClickFunnels login
`db/migrations/302_analytics_connections.sql:43`. One row per platform. The key
is stored scrambled. Only staff can read it.

### `bookings` — a booked call
`db/migrations/225_bookings.sql:42`–`:75`. `starts_at` and `ends_at` are allowed
to be blank on purpose: a booking whose provider sent no time is real, and
inventing a time would put a meeting on a calendar nobody scheduled
(`:33`–`:40`). `source` records the true origin, `'clickfunnels'` for this
funnel — an earlier version of the system labelled every booking `'calcom'`,
which was simply wrong (`:17`–`:30`).

### What the numbers on the Ad Performance screen mean
`src/ads/store.mjs:57`–`:78`. Grouped by lane, ad number and version:

- **leads** — how many different people that ad brought in
- **books** — how many of those booked a call that was not later cancelled
- **first / last** — the first and last dates

---

## The screens

### Campaign Manager — `public/app/campaign-manager.html`
Staff only.

**Ad Performance — which ad booked a call** (`:374`).
You see a table: Group, Leads, Booked calls, Booked rate, First booked, Last
booked. A dropdown changes what "Group" means — you can slice by lane, by ad
number, by version, by credit gate, by entry type, or by which offer the ad led
with. Those seven choices are fixed at `api/read/ad-books.mjs:27`. Booked rate
is booked calls divided by leads, blank when there are no leads
(`public/app/campaign-manager.html:391`–`:393`).

**Funnel Pages** (`:404`).
You see: Funnel, Page, Date, Views, Conversions. One button, **Sync now**
(`:409`). Pressing it calls ClickFunnels and refills the table
(`:2312`–`:2332`). Above the table a line says either "Not connected yet — see
Connections below" or "Connected · last synced …" (`:1205`–`:1213`). A dash in
the Conversions column means ClickFunnels did not answer — never a zero it did
not report (`:420`).

**Connections** (`:512`).
Two boxes: **API key** (`:561`) and **Subdomain** (`:566`), and a Connect
button. Pressing Connect saves the key and immediately runs one sync
(`:2334`–`:2369`). If ClickFunnels refuses, the screen shows ClickFunnels' own
words back, unchanged (`:2350`–`:2352`).

### Closer Dashboard — `public/app/closer-dashboard.html`
When a call opens, four lines appear under the client's name (`:565`–`:570`):

- **Gate** — `600+`, `720+`, `780+`, or `No FICO gate`
- **Entry** — `Direct · sell what they were promised`, or `Sorting · every road is open`
- **Primary** — the offer that ad led with
- **Secondary** — the other offers, or `All`, or `None`

They stay hidden until the read answers, so nothing on that screen is ever a
guess (`public/app/closer-call.js:213`–`:229`). The same four lines appear in
the Pipeline drawer (`public/app/pipeline.html:2226`).

### What the client sees — one click, end to end

**Hop 1.** Person clicks a Meta ad. The link is
`apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=funding600&utm_content=42-ringlights&utm_term=sun`
(`docs/workflows/manual-walkthrough-runbook.html:128`).

**Hop 2.** The video page loads. They see the headline, the video, and one
button that says "Get Started"
(`docs/workflows/cf-vsl-watch-html-step1.html:113`, `:119`, `:143`).

**Hop 3 — UNVERIFIED.** The tag-catcher script saves the five tags for the
visit (`clickfunnels-fragments/06-utm-hidden-fields.html:45`–`:63`). Whether
this script is actually pasted onto `/watch` in the live ClickFunnels workspace
cannot be checked from this repo. Its own paste instruction names the
application page, not the video page. If it is not on `/watch`, everything after
this hop still happens — but with no ad number attached.

**Hop 4.** They click through to `/apply` and answer the survey. The script
writes the five tags into invisible boxes on the form
(`clickfunnels-fragments/06-utm-hidden-fields.html:66`–`:78`).

**Hop 5.** They submit. ClickFunnels sends us a message. Its signature is
checked; a bad signature means nothing is stored
(`docs/journeys/ad-attribution-flow.md:15`–`:17`).

**Hop 6.** The message is unpacked. `pickVisitAttribution`
(`src/adapters/clickfunnels.mjs:170`–`:196`) looks for the tags in three places
in order of trust: an explicit block, then the hidden form boxes
(`custom_attributes`, then `custom_fields`), then ClickFunnels' own record of
their first visit (`:176`–`:181`).

**Hop 6a — UNVERIFIED.** Which of `custom_attributes` and `custom_fields` the
live ClickFunnels workspace actually uses. The code reads both. Only the first
is proved by a test (`docs/journeys/ad-attribution-flow.md:56`).

**Hop 7.** An `entry.captured` message goes onto the internal bus carrying the
tags (`src/adapters/clickfunnels.mjs:344`, `:362`).

**Hop 8.** `onEntryCaptured` saves the row
(`src/handlers/client-lifecycle.mjs:273`–`:274`). The database itself works out
the lane, ad number and version (`286:109`–`:111`). A second visit fills blanks
only — the ad that brought them keeps the credit (`src/ads/store.mjs:26`–`:32`).
If this row is refused for any reason, it is logged and **the lead is still
created** (`src/handlers/client-lifecycle.mjs:277`).

**Hop 9.** They land on `/funding-book-call` and pick a time. ClickFunnels sends
an appointment message (`src/adapters/clickfunnels.mjs:64`, `:519`), which
becomes `booking.created`.

**Hop 10.** `onBookingCreated` (`src/handlers/comms.mjs:454`–`:490`) finds the
client, makes a follow-up job for the closer, stores the booking, and moves
their card on the sales board to **Booked**.

**Hop 11.** The closer opens the call screen. It asks
`GET /api/read/ad-attribution?client_id=…` (`api/read/ad-attribution.mjs:40`–`:71`).

**Hop 12.** The ad number is looked up in `docs/ads/registry.json`. A number the
list does not know resolves to the widest door — no gate, sorting entry, no
primary, all secondary — and is logged once (`src/ads/registry.mjs:8`–`:11`).

**Hop 13.** The four lines paint under the client's name
(`public/app/closer-call.js:221`–`:229`).

**Hop 14.** For the roll-up, `GET /api/read/ad-books?group_by=…` counts leads and
non-cancelled bookings per group (`src/ads/store.mjs:57`–`:78`) and the Campaign
Manager table draws it (`public/app/campaign-manager.html:2120`–`:2130`).

---

## Definition of done

A human can tick each of these.

1. Open Campaign Manager → **Connections**. Type the ClickFunnels API key and
   subdomain. Press Connect. The message says "Connected and synced."
2. Scroll to **Funnel Pages**. Rows appear for `/watch`, `/apply`,
   `/funding-book-call` and `/thank-you`. Views is a number, not a dash.
3. Decide what "Conversions" should mean — people who gave an email, or people
   who paid — and record the decision. Today the code counts emails
   (`src/analytics/clickfunnels.mjs:255`).
4. Confirm inside the ClickFunnels editor whether
   `clickfunnels-fragments/06-utm-hidden-fields.html` is pasted on the `/watch`
   page as well as the `/apply` page. Write the answer down.
5. Confirm which of the two `/watch` skins is live, and delete or mark the other
   one. Both currently claim to be the page and their headlines differ.
6. Click one live ad link end to end. Open the resulting client on the closer
   screen. The four ad lines show the right gate, entry, primary and secondary
   for that ad number.
7. Open Campaign Manager → **Ad Performance**, set Group to "ad_id". That ad
   number appears with 1 lead and 1 booked call.
8. Paste a Microsoft Clarity project ID into `public/js/clarity.js:27` and set
   Masking to **Strict** in the Clarity dashboard. Load fundhub.ai. A session
   appears in Clarity within a few minutes.
9. Every funnel step has a count. You can say what share of people who started
   the video reached the survey, what share of those reached the calendar, and
   what share of those booked.
10. A headline can be changed on one version of a page while the other version
    stays as it is, traffic splits between them, and the Ad Performance screen
    shows a separate booked rate for each.
11. Cost per booked call appears next to booked calls on the Ad Performance
    screen.

---

## UNKNOWN — blocked or unverifiable

| What | Why it is unknown |
|---|---|
| **ClickFunnels API key** | Not in the repo and not settable by an agent. Blocked on Chris. Without it, `funnel_page_stats` stays empty and Funnel Pages shows "Not connected yet". |
| **Does "conversions" mean opt-ins or sales?** | `src/analytics/clickfunnels.mjs:255` counts `step.optins` — people who gave an email. `step.sales_count` — people who paid — is the alternative. The file's own header says ClickFunnels has no field literally called "conversions" (`:31`–`:36`). **Chris's decision. Not guessed, not changed.** |
| **Is `docs/workflows/cf-vsl-watch-html-step1.html` the live `/watch` page, or is `clickfunnels-fragments/01-vsl.html`?** | Both committed 2026-08-17, both paint `/watch`, headlines differ (`:113` vs `:129`). Nothing in the repo records which is pasted into ClickFunnels. |
| **Is the tag-catcher pasted on `/watch`?** | `clickfunnels-fragments/06-utm-hidden-fields.html`'s header says paste it on the application page, but also says the tags must survive the click from the video page. Only the ClickFunnels editor can settle it. |
| **Which key the live workspace sends hidden fields under** | `custom_attributes` or `custom_fields`. The adapter reads both (`src/adapters/clickfunnels.mjs:177`–`:180`). Only the first is test-proved (`docs/journeys/ad-attribution-flow.md:56`). |
| **Whether any `analytics_connections` row exists today** | Requires reading the live database. Not done in this read-only pass. |
| **Whether any `client_ad_attribution` rows exist today** | Same. |
| **Microsoft Clarity project ID** | See the Clarity section below. Blocked on Chris. |
| **Meta ad spend** | `docs/workflows/marketing-e2e.md:270` — no `ad_platform_connections` row exists. So no cost-per-booked-call is possible. |
| **How fast the funnel pages load** | Nothing in this repo measures ClickFunnels page speed. |
| **Whether `apply.fundhub.ai/schedule/phonecall`** — the calendar the Optimize page books into (`public/optimize.html:309`) — **is the same calendar as `/funding-book-call`** | Two different addresses. Nothing in the repo links them. |
| **Whether `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` may be corrected** | Chris's decision. Not this lane's to make. |

---

## Microsoft Clarity — where it is, whether it is on, what it would give us

**Where it is.** One file: `public/js/clarity.js`, 49 lines. It is loaded by
five pages, and only these five:

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
network call, no globals, no console noise. So today the file loads, checks the
empty ID, and stops. **Nothing is recorded. Nothing is sent to Microsoft.**

**To turn it on, two things, both required** (`public/js/clarity.js:5`–`:14`):

1. Paste the real project ID from clarity.microsoft.com → Settings → Setup into
   line 27.
2. In the Clarity dashboard, set Settings → Masking to **Strict**. That is a
   dashboard switch. There is no code that can set it. An earlier draft called
   `window.clarity("set", "maskTextContent", true)`, which is **not a real
   Clarity command** — it was removed because it did nothing while pretending to
   protect the site (`:11`–`:14`). Do not put it back.

**What is already masked in code.** The whole homepage survey form carries
`data-clarity-mask="true"` (`public/index.html:610`). The comment above it
(`:602`–`:609`) explains why the whole form and not single questions: the survey
rewrites itself completely at every step, so a question added later would
otherwise ship unmasked without anyone noticing. Two of its steps ask for real
dollar bands — annual business revenue (`public/js/homepage-survey.js:75`–`:86`)
and annual personal income (`:100`–`:111`).

**What it would give us, in plain words.**

- **Session recordings** — a replay of one person's visit. You watch where they
  scrolled, what they clicked, where they stopped.
- **Heatmaps** — a coloured picture of where everyone clicked and how far down
  the page they got. This is the fastest way to find out that nobody ever
  reaches your best headline.
- **Rage clicks and dead clicks** — Clarity flags when people click the same
  thing over and over, or click something that is not a button. Both mean the
  page is confusing them.

**What it would NOT give us.** Clarity only loads on fundhub.ai pages in this
repo. It is **not** on any of the four ClickFunnels pages — those pages get
their HTML from the fragments listed above, and none of those fragments loads
`clarity.js`. So even with the ID pasted in, you would see recordings of the
homepage and the Optimize page, and **nothing at all of the paid funnel**, which
is where all the money goes. Adding it to the funnel means pasting the loader
into a ClickFunnels Custom HTML box on each of the four pages. That is not
something an agent can do from here.

---

## One thing worth saying once

The homepage at fundhub.ai and the ClickFunnels `/apply` page ask almost the
same questions and both create leads, but they are two separate builds that can
drift. `docs/clickfunnels/cf-survey-ground-truth.md:9` already records one place
they have drifted: the homepage asks "Any negatives on your credit report?" and
ClickFunnels does not. The homepage version also loses ad tags entirely (finding
1 above). If paid traffic ever moves to fundhub.ai, that is the thing to fix
first.
