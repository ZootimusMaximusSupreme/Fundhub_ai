# Ad label spine flow — how a script's labels reach an ad

Required by `CLAUDE.md` §3a step 4 and §4. Written 2026-09-08, traced from the code, not
from the plan.

This page is the back end for `db/migrations/377_marketing_label_spine.sql`. It answers one
question: **when Chris writes a script and tags it with an angle and a hook, what has to
happen before those tags show up next to that ad's spend?**

---

## The short version

A script carries five labels. The labels never get copied onto anything. They are read back
through one view, `v_ad_label_spine`, which walks **ad → creative → script** and picks the
labels up off the script at the far end.

So the whole thing is a chain of three links. **All three can be made today** — the
middle one only since 2026-09-08. None of it has been run against a database yet.

| # | The link | Can it be made today? |
|---|---|---|
| 1 | script → its labels | **Yes.** `POST /api/scripts/write` |
| 2 | script → creative | **Yes.** `POST /api/creative/generate` with `script_id` |
| 3 | creative → ad, and our ad number | **Yes.** `POST /api/campaigns/link-asset` |

**Link 2 was the break, and it is closed.** `creative_assets.script_id` was added by 377
(`db/migrations/377_marketing_label_spine.sql:395-396`) and for a few hours nothing wrote
it — the only writers were three test files, so the chain reached the creative and
stopped.

It now has a real writer. `api/creative/generate.mjs` accepts a `script_id` and folds it
into the job's spec, and `src/creative/generate.mjs:238` writes it onto every asset that
job produces. No new column was needed: `generation_jobs` already carries a jsonb `spec`
(`db/migrations/045_creative_factory.sql:295`) and this code already tucks `assetKind`
into it the same way.

**It is optional and stays NULL when nobody names a script.** An asset with no script is
a real thing, not a zero. The trigger from 377 refuses a creative and a script owned by
different partners, so a wrong id fails loudly at the moment of writing rather than
quietly mislabelling an ad weeks later.

**UNPROVEN.** This has never run against a database — there is no Postgres on the machine
it was written on. See the note at the foot of this page.

---

## The flow

```mermaid
flowchart TD
    A["Chris writes a script<br/>and tags it"] -->|POST /api/scripts/write| B["ad_scripts row<br/>version = 1<br/>five labels on the same row<br/>api/scripts/write.mjs:254"]
    B -->|same transaction| C["ad_labels learns the words<br/>a name Chris typed is never overwritten<br/>api/scripts/write.mjs:277"]

    B -->|"POST /api/creative/generate<br/>with script_id"| D["creative_assets row<br/>script_id points at the script<br/>src/creative/generate.mjs:238"]

    E["Paul builds the ad in Meta"] -->|"a person presses Sync on<br/>public/app/campaign-manager.html"| F["POST /api/campaigns/sync<br/>ads row created<br/>external_id = META'S id<br/>api/campaigns/sync.mjs:128"]

    F --> G{"A person opens the ad<br/>and picks the creative"}
    D --> G
    G -->|POST /api/campaigns/link-asset| H["ads.asset_id = the creative<br/>ads.fundhub_ad_number = OUR number<br/>api/campaigns/link-asset.mjs:210"]

    H --> I["v_ad_label_spine now returns<br/>the angle, hook, lane, offer<br/>and script type for this ad<br/>377:619"]
    F --> I

    I -->|GET /api/read/ad-spine| J["The list, or one row per angle<br/>api/read/ad-spine.mjs:299"]

    I -->|"GET /api/read/ad-spine?group_by=hook and days=30"| M["One row per hook, with money on it:<br/>spend, clicks, people, people booked,<br/>cost per booked person,<br/>hook rate and hold rate<br/>api/read/ad-spine.mjs:443"]
    K -->|"joined on the ad, day by day,<br/>inside the days asked for"| M
    K -->|"3-second and p75 views summed<br/>over the same days<br/>api/read/ad-spine.mjs:353"| Q["hook rate = 3-second ÷ impressions<br/>hold rate = p75 ÷ 3-second<br/>ONE definition, watchRate()<br/>src/ops/meta-marketing.mjs:89"]
    Q --> M
    M -->|"a person opens Campaigns and picks angle, hook, lane,<br/>offer or script type"| S["THE PANEL<br/>Which angle and which hook are working<br/>public/app/campaign-manager.html:416<br/>a dash where the answer is unknown,<br/>a 0 only where it was really zero"]
    N["A person clicks the ad link<br/>utm_content = OUR number"] --> O["client_ad_attribution row<br/>src/ads/store.mjs:21"]
    O -->|"joined on OUR number,<br/>042 and 42 are the same ad"| M
    O --> P["bookings row, not cancelled<br/>db/migrations/225_bookings.sql"]
    P -->|"counted as PEOPLE, not calls"| M

    F -->|same sync call| K["ad_metrics_daily<br/>spend, impressions, clicks, ctr, roas<br/>+ where people stopped watching:<br/>3sec, p25, p50, p75, p95, p100, ThruPlay<br/>api/campaigns/sync.mjs:151"]

    B -->|"POST /api/scripts/write<br/>with parent_script_id"| L["a NEW ad_scripts row<br/>version = parent + 1<br/>parent_script_id points back<br/>api/scripts/write.mjs:251"]
    L --> B

```

Every solid line is a step something in the code really performs. None of it has
been run against a database — see the note at the foot of this page.

---

## Every move, and what fires it

| From | To | What fires it | Where it happens | Works today? |
|---|---|---|---|---|
| nothing | an `ad_scripts` row, `version = 1`, labels on it | somebody posts the words and the tags | `api/scripts/write.mjs:254` | **yes** |
| a script | a creative carrying that script id | generating with `script_id` | `src/creative/generate.mjs:238` | **yes** |
| a label key | a row in `ad_labels` | the same write, in the same transaction | `api/scripts/write.mjs:277` | **yes** |
| an ad in Meta | an `ads` row with Meta's id | a person presses Sync on the Campaign Manager screen | `api/campaigns/sync.mjs:128` | **yes** |
| an `ads` row | `asset_id` set, `fundhub_ad_number` set | a person picks the creative and types our number | `api/campaigns/link-asset.mjs:210` | **yes** |
| an `ads` row | a day of spend, clicks, and how far into the video people got | the same Sync press | `api/campaigns/sync.mjs:159` | **yes** |
| all of the above | labels readable next to the ad | the view joins them; nothing is copied | `377:619-652` | **yes, once the row above is set** |
| a script | a rewrite of it | posting again with `parent_script_id` | `api/scripts/write.mjs:251` | **yes** |
| labels + spend + people | what each label cost and what it brought | asking for a group and a number of days | `api/read/ad-spine.mjs:443` | **yes** |
| a day of video views | hook rate and hold rate for a label | the same call, same days | `src/ops/meta-marketing.mjs:89` | **yes** |

---

## Five things that are easy to get wrong

**1. The ad exists before the creative is attached, not after.**
The only `INSERT INTO ads` in the whole tree outside tests is the Meta pull
(`api/campaigns/sync.mjs:128`). So an ad row always starts life with no creative and no
number on it, and a person fills both in afterwards. Anything drawn the other way round —
"our creative becomes an ad" — is not what the code does.

**2. Linking the creative to the ad is a person, on purpose.**
`api/campaigns/link-asset.mjs:11-32` sets out why: the Meta pull never even asks for a
creative (`api/campaigns/sync.mjs:260` requests `id,name,status,adset_id`), our
`creative_assets.provider_asset_id` is the generation vendor's id and Meta has never seen
one, and nothing has ever pushed one of our creatives to Meta. The two sides share no
identifier at all. A guess here makes every label answer silently wrong.

**3. Our ad number is typed by a human and nothing can check it.**
`ads.fundhub_ad_number` is ours; `ads.external_id` is Meta's. They are separate columns
(377:557, 046:293). Nothing computes ours — Meta does not know it. The database stops two
ads claiming the **same** number; nothing stops one ad claiming the **wrong** one.

One thing it no longer gets wrong: **a link that says `042` and a box that says `42`.** The
link keeps the leading zero and the typed number usually does not, so a plain text
comparison would find nothing and report no leads with no error at all. `/api/read/ad-spine`
compares the two as numbers instead, in exactly one place
(`AD_NUMBER_MATCH`, `api/read/ad-spine.mjs:205`), so the two are the same ad. The flip side,
said out loud: two ads could be numbered `042` and `42` and would now be treated as one.

**4. Leaving a field out and sending it blank are different instructions.**
On `link-asset`, an absent key means "leave it alone" and a present key that is blank or
null means "clear it" (`api/campaigns/link-asset.mjs:36-55`). Clearing `asset_id` turns that
ad's labels back off with no error anywhere. A screen with an empty box must send nothing,
not `""`.

**5. Labels are never copied down. They are looked up.**
Nothing writes `angle_key` onto a creative or onto an ad. The view is the only place the
inheritance happens (377:603-606). Correct a script's angle and every ad made from it reads
the corrected one immediately.

---

## What works today, plainly

**Works:**

- Writing a script with its five labels, and the dictionary learning the new words.
- Writing a rewrite that points back at what it replaced, without touching the original.
- Pulling ads and daily spend in from Meta — and, since 2026-09-09, how far into each
  video ad people got before they left. `api/campaigns/sync.mjs:277-281` asks Meta for
  seven extra fields and `api/campaigns/sync.mjs:159` writes them into seven new columns
  on `ad_metrics_daily` (`db/migrations/378_ad_video_metrics.sql`). It costs nothing
  extra: seven more words on a request the app already sends every Sync.
- Saying which creative runs on an ad, and what our number for it is.
- Reading the whole chain back, either as a list or grouped by angle, hook, lane, offer or
  script type.
- **Asking which hook books a call for the least money.** Grouped mode on
  `/api/read/ad-spine` now carries what each label cost and what it brought:
  `?group_by=hook&days=30` returns spend, impressions, clicks, how many people arrived from
  those ads, how many of them booked, and the cost of one booked person.

  Five things about it are worth knowing before anybody reads a number off it:

  - **Blank spend and zero spend are different answers.** A label with no reported day at
    all comes back blank, because "nobody told us" is not "we spent nothing".
    `ad_days_reported` says how many days the total was built from.
  - **The ad count and the money cover different stretches of time.** `ads` is every ad
    that label ever had, for all time. The money is only the days you asked for. So
    `ads_reported_in_window` sits beside them and says how many of those ads actually
    reported anything inside the window. "50 ads, 3 of them reported, spend 3000" cannot
    be misread the way "50 ads, spend 3000" can.
  - **A zero for people can be checked instead of trusted.** People are counted the
    opposite way round from money: a row is written when somebody arrives, so no row is
    meant to mean nobody arrived. But that writer can fail quietly
    (`src/handlers/client-lifecycle.mjs:273` only warns), and then "0 people booked" would
    really mean "we stopped recording". So the answer also carries
    `people_rows_in_window`: how many people arrived company-wide in those days, ad or no
    ad. If that is 0 while the phone was ringing, every people number below it is
    meaningless.
  - **It refuses to divide on a tiny sample.** Under ten booked people there is no cost
    per booked person — just a line saying how many are needed and how many there are.
    That threshold is `MIN_N_RATE` in `src/ops/discoveries.mjs:9` and the refusal is
    `costPerBooked()` in `src/ops/meta-marketing.mjs:17`, both already used elsewhere. It
    is one rule in one place, not a second opinion.
  - **A booked person is not a booked call.** Someone who books, cancels and rebooks is one
    person. The field is called `people_booked` for that reason. The older rollup at
    `src/ads/store.mjs:64` counts calls, which is why a rate built on that one can read
    over 100%.

- **Asking which ad idea stops people, and which one keeps them.** The same grouped call
  also carries the two numbers everybody who buys ads reads:

  - **hook rate** — of the people the ad was put in front of, how many got past the first
    three seconds. 3-second views divided by impressions.
  - **hold rate** — of the people who got past three seconds, how many got three quarters of
    the way in. p75 views divided by 3-second views.

  Both are worked out in one function and one function only, `watchRate()` at
  `src/ops/meta-marketing.mjs:89`. Three things about them:

  - **A photo ad has no hook rate, and it is blank, not zero.** There is no video, so there
    is no such number and there never will be. Printing 0 there would make a perfectly good
    photo ad look like the worst one in the account, with no error anywhere saying so. The
    seven columns behind this are nullable with no default for exactly that reason
    (`db/migrations/378_ad_video_metrics.sql`).
  - **It refuses the same tiny samples the cost does.** Under ten impressions there is no
    hook rate; under ten 3-second views there is no hold rate. That is `MIN_N_RATE` in
    `src/ops/discoveries.mjs:9` — the same one number that governs cost per booked person.
    There is no second threshold anywhere in this system.
  - **A rate above 100% is not a bug.** Meta estimates and later restates these counts, so
    on one day p75 can land above the 3-second count. It is passed through as it arrives
    rather than squashed, because hiding a Meta restatement behind a tidy number is worse
    than showing an odd one.

**Closed on 2026-09-08, and worth recording because the page said otherwise for a few
hours:** a script can now become a creative. `api/creative/generate.mjs` takes a
`script_id` and `src/creative/generate.mjs:238` writes it onto every asset the job makes.

It stays NULL when nobody names a script, which is right — an asset with no script is a
real thing, not a zero. What follows from that: an ad whose creative carries no script
still reads with blank labels, and blank looks exactly like "no data yet" rather than
like a fault. That is the failure worth watching for on any screen built on this.

**Does not exist yet:**
- **Two of the three endpoints still have no screen.** Searched `public/` on 2026-09-09: no
  page mentions `scripts/write` or `campaigns/link-asset`. They answer, but only to something
  posting to them directly.

  **`read/ad-spine` now has one.** `public/app/campaign-manager.html:416` is a panel on the
  Campaigns screen called *Which angle and which hook are working*. It is a panel on a page
  that already existed — no new page, tab or menu row. It calls
  `GET /api/read/ad-spine?group_by=…&days=…&limit=200`, org-wide and staff-only like the two
  panels above it, and it draws one row per label with the ads, the spend, the people who
  arrived, the people who booked, the cost of one booked person, and the two watch rates.

  Three things about it are the point of it:

  - **A dash is not a zero, and they do not look alike.** A grey dash means the read said
    "unknown"; a black `0` means it counted and the answer really was zero. Hovering the dash
    prints the endpoint's own sentence saying which kind of unknown it was — no spend day
    reported, no ad number to match anybody to, or no video to measure.
  - **The refusal is printed, not hidden.** When the sample is too small to divide, the cell
    shows the words `costPerBooked()` returned — how many are needed and how many there are —
    instead of a blank or an invented number.
  - **The empty state says why it is empty.** Today it will read *"No ads on file yet, so
    there is nothing to group"* and then say what makes ads and labels appear. Two more lines
    appear only when they are true: that no spend was reported for the window, and that nobody
    was recorded arriving from any ad — the sanity check that says whether a zero in the people
    columns can be believed at all.

  **Never run against a live answer.** The panel was checked in a browser by handing
  `renderAdSpine()` a made-up response shaped exactly like the endpoint's, to prove the dash
  and the zero paint differently and that all four states draw. No real row has ever reached
  it, because no Meta account is connected and no ad has been labelled.
- **No real Meta numbers have ever arrived.** `ad_platform_connections` has no row, so
  nothing has ever been pulled. Every spend, impression and video number described above is
  a column waiting to be filled. The moment Chris connects a Meta account and somebody
  presses Sync, they fill.
- **The Meta pull is not on a clock.** Nothing in `src/workflows/index.mjs` registers it. It
  runs when a person presses Sync on `public/app/campaign-manager.html`.

**UNVERIFIED — never executed:** every `.pg.test.mjs` covering this chain skips with no
`DATABASE_URL`, and there is no Postgres on the machine this was traced on. The paths above
are read from the code, not observed running.

**Two parts are checked on every push, though.** Neither file has `.pg.` in its name, so
both run whether or not a database exists. Measured 2026-09-09 on this machine:

- `src/http/ad-spine.test.mjs` — **32 tests, all passing.** They cover the part that decides
  what a blank means: that an unknown spend stays blank, that a reported spend of zero stays
  zero, that a group nobody could be matched to says "cannot tell" instead of "nobody came",
  that a photo ad gets no hook rate rather than a hook rate of zero, and that the date window
  sits on the join rather than the filter, which is the mistake that would silently hide
  every ad that spent nothing.
- `src/ops/meta-marketing.test.mjs` — **15 tests, all passing.** The arithmetic of the two
  rates, including that a real zero survives, that a tiny sample is refused, and that a
  missing number never becomes one.

There is also a test that fails if the two rates are ever worked out anywhere but
`watchRate()`. That is the drift this whole shape exists to prevent.
