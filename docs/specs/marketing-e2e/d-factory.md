# Lane D — Creative Factory, working in a browser

Read on 2026-09-08, on `main` at `fe864840`. Code read only. No app file was changed.

Also covers the screen next door, **Campaign Manager**, and its "which ad booked a
call" panel — that panel is where a finished ad is finally measured.

---

## What Chris gets when this is done

He opens one page, picks himself from a list, types what the ad should be about, and
presses one button. A few minutes later the written ad is on the same page and he can
read every word of it. He presses Approve or Reject and the job is finished. He never
opens a chat window and never asks an agent for anything.

---

## What exists today

### The page itself

`public/app/creative-factory.html`, 2,705 lines. It is built, styled, wired, and
reachable.

A live browser test is **written** for this screen:
`e2e/live-creative-factory-marketing-menu.spec.mjs:28-56`. It checks two things — that
Creative Factory shows in the left menu under **Marketing**, and that the screen loads
with no error. **Whether it has ever actually been run and passed is UNKNOWN.** A test
file sitting on disk is not a passing run. Its own note at `:3` says it only runs
against the live website, never on a laptop, and nothing in this repository records a
result. The same note at `:4-5` also says the database change this screen needs
(`copy_text`) had not been applied to the live site when the test was written.

The page is in the left menu under **Marketing** (`creative-factory.html:351`) and the
shell allows it for owner, admin and partner sign-ins (`public/app/shell.js:39`, `:156`,
`:431`).

### Every control on the page, top to bottom

"Works" means: the button is wired, it calls a real endpoint, and the endpoint is
reachable. It does **not** mean the whole thing produces a picture today — see
[What is missing](#what-is-missing).

| # | Where on the page | Control | What it is | State |
|---|---|---|---|---|
| 1 | Left rail | Collapse arrow `#burger` (`:308`) | Shrinks the menu | Works (shell) |
| 2 | Left rail | Menu links (`:311-366`) | Go to other screens | Works (shell) |
| 3 | Top bar | "one partner" chip `#scopeChip` (`:376`) | Shows who is selected | Label only, not a control |
| 4 | Top bar | "Read only / Writes on" chip (`:377`) | Says whether buttons are live | Label only, set at `:1181` |
| 5 | Partner scope | **Partner** dropdown `#partnerSel` (`:396`) | Picks whose book you are looking at | Works. Filled from `/api/read/partners` at `:1081`. Changing it re-reads everything (`:2471-2483`) |
| 6 | Partner scope | Partner name line `#scopePid` (`:398`) | Shows the chosen name | Label only (`:1054`) |
| 7 | Monthly allowance | Badge `#cfUseBadge` (`:413`) | on / off / error | Label only (`:1155`) |
| 8 | Monthly allowance | Four number tiles (`:1157-1162`) | On?, Used, Left, Monthly limit | Works. From `/api/partner-marketing/usage` (`:1133`) |
| 9 | Monthly allowance | "Brand Studio" link (`:1163`) | Where the owner switches this partner on | Works. Only drawn when the switch is off |
| 10 | Generate | **Kind** dropdown `#genKind` (`:445`) | static / copy / video | Works. Goes into the job as `assetKind` (`:2534`) |
| 11 | Generate | **What is being sold** `#genOffer` (`:451`) | Funding / Credit cards / Credit repair | Works. Required (`:2514`), goes in as `offerType` (`:2534`) |
| 12 | Generate | **What to make** `#genPrompt` (`:459`) | Free text | Works. Sent as `prompt` (`:2534`) |
| 13 | Generate | **Name this batch** `#genIdem` (`:462`) | Stops double-billing | Works. Required (`:2509`) |
| 14 | Generate | **Enqueue generation** `#genBtn` (`:464`) | Saves a job | Works. `POST /api/creative/generate` (`:2518`). Goes grey until the allowance loads and is on (`:1175-1178`) |
| 15 | Generate | **Run queued jobs now** `#runJobsBtn` (`:465`) | Starts the queue straight away | Works. `POST /api/creative/run` (`:2579`). Also goes grey (`:1175-1178`) |
| 16 | Generate | Message line `#genMsg` (`:466`) | Says what happened | Label only |
| 17 | Decide | **Creative** dropdown `#actAsset` (`:476`) | Pick one creative | Works. Built from rows already read (`:1600-1614`) |
| 18 | Decide | **Approve** (`:478`) | Marks it approved | Works. `POST /api/creative/actions` (`:2612`). Asks you to confirm first, and the confirm box names the result (`:1617`, shown at `:2610`) |
| 19 | Decide | **Reject** (`:480`) | Marks it blocked | Works. Same endpoint. Confirm text at `:1618` |
| 20 | Decide | **Archive** (`:481`) | Hides it from the library | Works. Same endpoint. Confirm text at `:1619` |
| 21 | Decide | Message line `#actMsg` (`:482`) | Says what happened | Label only |
| 22 | Jobs | State buttons `#jobRail` (`:503`, built `:1288`) | all / queued / running / succeeded / failed | Works. Filters rows already in the browser (`:1317`) |
| 23 | Jobs | **show** dropdown `#jobLimit` (`:505`) | 5 / 10 / 25 / 50 / 200 per page | Works (`:2182`) |
| 24 | Jobs | Any job row (`:1332`) | Opens a detail strip under it | Works. Mouse and keyboard (`:1416-1443`) |
| 25 | Jobs | prev / next `#jobPager` (`:516`) | Page through jobs | Works, but pages inside the 200 rows already fetched (`:941`, `:2297`) — it never asks the server for page two |
| 26 | Library | State buttons `#libStateRail` (`:528`) | all / pending / passed / blocked / approved | Works (`:1504`) |
| 27 | Library | Kind buttons `#libKindRail` (`:529`) | any / static / video / copy | Works (`:1509`) |
| 28 | Library | Shape buttons `#libFormatRail` (`:530`) | any / 1x1 / 4x5 / 9x16 / 16x9 | Works (`:1514`) |
| 29 | Library | **Brand kit** dropdown `#libKit` (`:532`) | Filter by kit | Works (`:2191`) |
| 30 | Library | **Include archived** `#libArch` (`:534`) | Yes / No | Works (`:2194`) |
| 31 | Library | **show** dropdown `#libLimit` (`:536`) | 6 / 12 / 50 / 200 | Works (`:2185`) |
| 32 | Library | A creative tile (`:1559`) | Opens the side panel | Works (`:1586`, `:2044`) |
| 33 | Library | prev / next `#libPager` (`:540`) | Page the grid | Works, same 200-row limit as #25 |
| 34 | Review queue | State buttons `#apprRail` (`:549`) | all / blocked / pending / awaiting_approval | Works (`:1678`) |
| 35 | Review queue | **show** dropdown `#apprLimit` (`:551`) | 5 / 10 / 50 | Works (`:2188`) |
| 36 | Review queue | Any row (`:1714`) | Opens a detail strip | Works |
| 37 | Review queue | **Open the full creative** (`:1873`) | Opens the side panel | Works (`:2177-2180`) |
| 38 | Review queue | **Reason for sending it back** box (`:1811`) | Text for a brand rejection | Works. Only drawn for an owner or admin sign-in (`:1802`) |
| 39 | Review queue | **Approve this brand** (`:1821`) | Approves a partner's brand | Works. `POST /api/brand/review` (`:2674`). **Never goes grey** — see the note under this table |
| 40 | Review queue | **Send it back** (`:1823`) | Returns it to draft | Works. Refuses with no reason typed (`:2660`). Never goes grey either |
| 41 | Review queue | prev / next `#apprPager` (`:562`) | Page the queue | Works |
| 42 | Brand kits | State buttons `#kitRail` (`:571`) | all / draft / active / archived | Works (`:1936`) |
| 43 | Brand kits | A kit card (`:1958`) | Opens the side panel | Works (`:1976`, `:2135`) |
| 44 | Brand kits | prev / next `#kitPager` (`:574`) | Page the kits | Works |
| 45 | Video performance | **Sync now** `#vidSyncBtn` (`:587`) | Pulls YouTube numbers | Works as code. `POST /api/analytics/youtube-sync` (`:2457`). Cannot succeed until Connect is done |
| 46 | Video performance | **Client ID** `#ytClientId` (`:602`) | Google sign-in detail | Works |
| 47 | Video performance | **Client secret** `#ytClientSecret` (`:605`) | Google sign-in detail | Works |
| 48 | Video performance | **Refresh token** `#ytRefreshToken` (`:608`) | Google sign-in detail | Works |
| 49 | Video performance | **Connect** `#ytConnectBtn` (`:610`) | Saves the three values | Works as code. `POST /api/analytics/youtube-connect` (`:2430`). **Never goes grey.** Blocked — Chris does not have the three values |
| 50 | Reference | "What each job state means" (`:633`) | Opens a panel | Works |
| 51 | Reference | The five tiles inside it (`:1470-1476`) | Queued / Retrying / Running / Succeeded / Failed | **BROKEN.** They are `<button>` elements with a hover highlight (`:130-131`) and **no click handler anywhere in the file**. Pressing one does nothing |
| 52 | Reference | "How the AI labels are decided" (`:640`) | Opens a table | Works. Table is a fixed list in the page (`:879`) |
| 53 | Reference | "Why creative gets stopped" (`:651`) | Opens a table of 29 reasons | Works. Fixed list in the page (`:780`) |
| 54 | Reference | "Settings the creative engine ships with" (`:666`) | Opens a table | Works. Fixed list in the page (`:893`) |
| 55 | Side panel | Close ✕ `#dwClose` (`:700`) | Closes it | Works (`:2173`) |
| 56 | Side panel | Grey backdrop `#scrim` (`:693`) | Closes it | Works (`:2174`) |
| 57 | Side panel | Escape key | Closes it | Works (`:2175`) |

**Which buttons the "writes off" switch actually turns off.** The page has one switch
that greys buttons out: `setWriteControls()` at `:1175-1178`. It turns off exactly
three things — **Enqueue generation**, **Run queued jobs now**, and the three
Approve / Reject / Archive buttons (they all carry `data-cact`, listed at `:478`,
`:480`, `:481`).

It does **not** touch three other buttons that also write:

- **Connect** for YouTube (`:610`). Nothing anywhere in the file ever greys it out.
  I checked: `ytConnectBtn` appears at only two places in 2,705 lines, `:610` where it
  is drawn and `:2423` where it is wired.
- **Approve this brand** (`:1821`) and **Send it back** (`:1823`). These are hidden or
  shown by a different rule — the page checks whether you are signed in as an owner or
  admin (`:1802`). That is a separate switch from the marketing one.

So with the marketing suite off for a partner, three write buttons on this page are
still live.

Four pieces of code on the page are dead and paint nothing:

- **A permanently blank box in the Partner scope card.** `#scopeOffers` is drawn at
  `:399` and emptied at `:1056`. Nothing ever puts anything in it. Those are the only
  two places the name appears in the file.
- The "rates" table (`:920-925` builds the data, `:2007-2015` looks for `#ratesBody`).
  There is no element with that id anywhere in the file. Harmless, guarded by an `if`.
- `.card-hd .t` (`:60`) — no element in the file uses `class="t"`.
- The fallback that builds the review queue out of library rows (`:1654-1675`). It only
  runs when the queue read succeeded *and* returned nothing, and in that case the code
  above it already returned. It can never run.

### The routes trap — checked one by one

CLAUDE.md §12 warns that a handler file is not a route. `netlify/functions/api.mjs`
holds a hand-typed list starting at line 278, and a handler missing from it answers 404
both on a laptop and on the live site.

Every endpoint this page calls, verified by hand:

| Endpoint the page calls | Called at | In the list at | Verdict |
|---|---|---|---|
| `GET /api/read/partners` | `data.js` via `:1081` | `api.mjs:414` | routed |
| `GET /api/partner-marketing/usage` | `:1133` | `api.mjs:677` | routed |
| `GET /api/creative/jobs` | `:2297` | `api.mjs:750` | routed |
| `GET /api/creative/library` | `:2301` | `api.mjs:748` | routed |
| `GET /api/creative/brand-kits` | `:2305` | `api.mjs:749` | routed |
| `GET /api/creative/approvals` | `:2309` | `api.mjs:751` | routed |
| `POST /api/creative/generate` | `:2518` | `api.mjs:747` | routed |
| `POST /api/creative/run` | `:2579` | `api.mjs:753` | routed |
| `POST /api/creative/actions` | `:2612` | `api.mjs:752` | routed |
| `POST /api/brand/review` | `:2674` | `api.mjs:661` | routed |
| `GET /api/read/video-stats` | `:2417` | `api.mjs:583` | routed |
| `POST /api/analytics/youtube-connect` | `:2430` | `api.mjs:586` | routed |
| `POST /api/analytics/youtube-sync` | `:2443`, `:2457` | `api.mjs:587` | routed |

**Nothing is missing. The trap is not firing for this page.** The ground brief's claim
is confirmed, endpoint by endpoint.

The guard is still in place and still real: `src/http/routes.test.mjs:99-112` walks
every `.mjs` file under `api/` and fails if one is neither in the list, prefix-routed,
nor written down as deliberately unreachable (the empty-list check is at `:107`).
`:114-123` catches the mirror problem — a typo in the list that still imports fine.
`:146-158` proves both web address shapes reduce to the same key. The allow-list of
deliberately-unreachable files (`:73-82`) holds three shelved decline-autopsy files and
nothing from this lane.

---

### The screen next door — Campaign Manager, and where an ad is finally measured

`public/app/campaign-manager.html`, 2,459 lines. It is in the same **Marketing** menu.
This lane covers one card on it, because it is the card that answers the only question
Chris said he cares about: **which ad booked a call.**

#### The Ad Performance card

**Where it is on the page.** `campaign-manager.html:374`, the card with the id
`secAdBooks`. Its heading reads "AD PERFORMANCE — WHICH AD BOOKED A CALL" (`:376`).
The card's own note explaining it is at `:367-373`.

**What a person sees.** A table with six columns (`:382-385`):

| Column | Plain meaning |
|---|---|
| Group | The thing the rows are added up by — for example one ad number |
| Leads | How many people came in from that group |
| Booked calls | How many of them booked a call |
| Booked rate | Booked calls divided by leads, as a percent. Blank when there are no leads (`:1169`) |
| First booked | The first booking in that group |
| Last booked | The most recent booking |

Above the table is a row of buttons (`:378`, built at `:1163`). They change what the
rows are added up by. There are seven choices, listed at `:835`:

- **lane** — which campaign family the ad belongs to
- **ad_id** — the ad's number. This is the one that answers "which ad booked a call"
- **variant** — which cut of the ad
- **gate** — the credit-score gate the ad speaks to (600 / 720 / 780 / none)
- **entry** — how the person came in (straight to the offer, or through a sorting step)
- **primary_offer** — the main thing the ad sells
- **secondary_offer** — anything else that ad also sells

**Under the table** is a plain-words caption (`:390-392`) saying booked rate is booked
calls divided by leads, and that a cancelled booking does not count. Under that is a
second line (`:394`) that appears only when some ad numbers have no name yet
(`:1189-1192`). It says, for example, "3 ad ids have never been named." **That is not a
defect and it is not a blocker.** Ads are found by number.

#### The endpoint behind it

`api/read/ad-books.mjs`. The whole contract is written in its own header at `:1-18`.

- The web address is `GET /api/read/ad-books?group_by=…` (`:1`). The seven allowed
  values are frozen in a list at `:27`, and a value that is not one of them is refused
  with a plain message (`:100`).
- You may also pass a date window, `from` and `to` (`:14-16`). `from` counts, `to` does
  not. The dates filter **when the lead first arrived**, not when they booked.
- Three of the seven groupings — lane, ad number, and variant — come straight out of the
  database (`:3-4`), from the table added by migration 286.
- The other four — gate, entry, primary offer, secondary offer — are worked out by
  looking each ad number up in `docs/ads/registry.json` (`:4-7`).
- An ad number that is not in that file is not dropped and not guessed at. It lands in
  the safe default group and its number is listed separately under `unknown_ad_ids`
  (`:7-9`), so nobody mistakes an unfiled ad for a filed one.
- Only staff can read it, and it always covers the whole company, never one partner
  (`:18`, enforced at `:93`).
- Counts are whole numbers. A missing date stays missing rather than becoming a zero
  (`:16-17`).

**One honest catch, written into the page itself** (`:1156-1160`): the "some ads have
never been named" line only means anything under the four registry groupings. Under
lane, ad number and variant the endpoint never looks anything up, so an empty list there
means "not checked", not "everything is named". The page prints nothing at all in that
case rather than claim a zero.

**It is staff only, on purpose** (`:2164-2170`): a partner sign-in used to fire this
read and get refused, which showed a message saying "you are not signed in", which was
false. Now it simply does not fire for a partner.

#### Campaign Manager's routes — all fourteen checked

The page calls **fourteen** different web addresses, counted from the file, not from
memory. Every one is in the hand-typed list:

| Address | Called at | In the list at |
|---|---|---|
| `/api/campaigns/spend` | `:324` | `api.mjs:647` |
| `/api/read/ad-books` | `:368` | `api.mjs:581` |
| `/api/read/funnel-pages` | `:398` | `api.mjs:582` |
| `/api/campaigns/connections` | `:694` | `api.mjs:649` |
| `/api/campaigns/list` | `:695` | `api.mjs:645` |
| `/api/campaigns/fatigue` | `:698` | `api.mjs:648` |
| `/api/campaigns/action-log` | `:699` | `api.mjs:650` |
| `/api/campaigns/detail` | `:1426` | `api.mjs:646` |
| `/api/campaigns/write` | `:1761` | `api.mjs:652` |
| `/api/read/partners` | `:1929` | `api.mjs:414` |
| `/api/analytics/clickfunnels-sync` | `:2318` | `api.mjs:585` |
| `/api/analytics/clickfunnels-connect` | `:2343` | `api.mjs:584` |
| `/api/campaigns/sync` | `:2381` | `api.mjs:651` |
| `/api/campaigns/meta-agency` | `:2424` | `api.mjs:653` |

Fourteen out of fourteen routed. Nothing missing.

#### The join that does not exist

Campaign Manager measures ads by **number**. Creative Factory makes ads and gives each
one a long internal id. **Nothing connects the two.**

I checked every file that touches the creative table: `api/creative/actions.mjs`,
`api/creative/approvals.mjs`, `api/creative/brand-kits.mjs`, `api/creative/library.mjs`,
`src/partners/scope.mjs`, `src/creative/generate.mjs`,
`src/creative/providers/copy.mjs`, and the tests. **Not one of them writes, reads, or
mentions an ad number.** `docs/ads/registry.json` has no field for a creative id either
— its ad entries carry id, title, lane, gate, entry, offers and variants and nothing
else (`registry.json:20-30`).

So today, an approved ad in Creative Factory can never appear in the Ad Performance
card. Somebody has to file it into `docs/ads/registry.json` by hand and put its number
into the ad's link, by hand. That is a real gap and it is in the Definition of Done
below.

---

#### The providers — what each one makes, and whether it is real

`src/creative/providers/` holds five little modules. `index.mjs:30-36` maps them by name.
Which one runs is decided by a row in the database, never by code (`index.mjs:45-69`).

| File | What it makes | Calls an outside service? | Real or a stub? |
|---|---|---|---|
| `copy.mjs` | The written words of an ad | Yes — Anthropic, through `src/agents/model.mjs` (`copy.mjs:36-43`) | **REAL.** The address is a real one and the code path is complete. With no key it comes back in "shadow" mode and is thrown as a failure (`copy.mjs:61-63`) |
| `static.mjs` | A picture | Yes | **STUB.** Falls back to `https://api.example-image-provider.com/v1/images` (`static.mjs:35`). That is not a real company |
| `ugc-video.mjs` | A video of a fake person reading a script | Yes | **STUB.** Falls back to `https://api.example-ugc-provider.com/v1/videos` (`ugc-video.mjs:30`) |
| `product-video.mjs` | A video of a product, no person | Yes | **STUB.** Falls back to `https://api.example-product-video.com/v1/render` (`product-video.mjs:28`) |
| `resize.mjs` | The same creative in a different shape | Yes | **STUB.** Falls back to `https://api.example-resize.com/v1/derive` (`resize.mjs:36`) |
| `_http.mjs` | Not a provider — shared plumbing: one web call, key loading, and wiping secrets out of error messages (`_http.mjs:77-85`) | n/a | Real |

**"Falls back to" is exact and it matters.** All four of those lines read
`ctx.config?.endpoint || "https://api.example-…"`. So the fake address is only what gets
used when the settings row does not name a real one. Today no such row exists anywhere
(see gap 1), so today the fake address is what would be used. But the code is not
hard-wired to it.

All four stub files carry the same warning at the top: "⚠️ CONFIRM BEFORE THIS RUNS
LIVE. Payload shape unverified against a real account."

`providers.test.mjs` (17 tests) proves the shapes and the safety rules without a network
— for example a fake person is always labelled as one (`:103`, `:113`) and a key never
escapes in an error (`:55`, `:64`).

#### The owner's decision on pictures and video

Commit `48b886e6`, 7 September 2026, title: *"Image/video generation: off the list, owner
decision, not a to-do"*. It changed one file, adding six lines to
`docs/ops/2026-09-06-self-analysis.md`:

> Owner decision, 2026-09-07: image and video generation is off the list. Not blocked —
> not wanted. Chris films himself, "super old school", and wants it that way until he
> decides otherwise… No agent should propose building the vendor row, the file upload,
> or the picture preview unless Chris asks for it by name.

**In plain words: the four stub providers are not a problem to fix. Chris films his own
ads.** So "done" for this lane means **the written-word path works end to end**. The
Kind dropdown's "static" and "video" options exist and are honest about failing, and
that is fine. Nothing below asks for a picture vendor.

---

#### The text path, end to end

1. Chris presses **Enqueue generation** (`creative-factory.html:2518`).
2. `api/creative/generate.mjs` checks he is signed in (`:76`), works out the partner
   (`:80`), refuses without a batch name (`:89`) and without an offer type (`:106`),
   then checks the owner has switched this partner on (`:131`) and saves the job row
   (`:132`).
3. Straight after saving, it asks whether anything could actually run the job
   (`:165`, `checkProvider` at `:49-68`) and returns that answer as a plain sentence.
   The screen shows it as-is (`creative-factory.html:2547`).
4. **The job then waits.** Two things can pick it up:
   - **A clock.** `netlify/functions/creative-job-runner.mjs` runs every two minutes.
     `SWEEP_CRON = "*/2 * * * *"` (`:7`) and `netlify.toml:141-142` sets the same
     schedule. `src/creative/runner-cron.test.mjs:10-16` fails if those two ever drift
     apart.
   - **The button.** "Run queued jobs now" calls `POST /api/creative/run`, which does the
     same work immediately (`api/creative/run.mjs:67-75`).
5. Either way `src/creative/runner.mjs:26-56` finds partners with waiting work and
   `src/creative/generate.mjs` `claim()` (`:115`) takes one job, then `run()` (`:147`)
   executes it.
6. `run()` looks up which service makes this kind of thing (`:153`). **If there is no
   row saying which service to use, the job is marked failed on the spot and retrying
   will not help** (`:157`).
7. If a service is found, it is called up to three times with a growing wait between
   tries (`:164-178`).
8. Each returned piece of writing is saved (`storeAsset`, `:215`), then checked against
   the ad rules (`:252`). A blocked piece **keeps its words** so Chris can read and fix
   it (`:234`, and migration `301_creative_copy_text.sql:67`).
9. The library then shows the words on the card (`creative-factory.html:1546`) and in
   full in the side panel (`:2062-2066`).

#### The bug in the clock that was already found and fixed

There is a test whose name says it outright:
`src/creative/runner.pg.test.mjs:34` — *"runDue(): the real bug — a plain unscoped db
connection must still find a queued job."*

**What was wrong, in plain words.** The clock woke up every two minutes, looked for
waiting jobs, and always found none — no matter how many were sitting there. It then
reported success. It did this forever. The reason is written in the code's own note at
`src/creative/runner.mjs:10-18`: the database only shows rows to a connection that has
said who it is, and this one had not, so the database showed it nothing.

**Is it fixed?** Yes, in code. `runner.mjs:27` now wraps the search in `asStaff()`, which
is the standard "see every partner" way used everywhere else in this codebase for a
background job. The note at `:9` dates the fix to 2026-09-07.

**Does the two-minute clock use the fixed shape?** Yes.
`netlify/functions/creative-job-runner.mjs:11` calls the same `runDue()` function, and
`runner.mjs:20-25` says the connection it hands over is now ignored on purpose, so both
callers — the clock and the **Run queued jobs now** button — get the fix without either
of them changing.

**Why no test caught it before:** the note at `runner.mjs:15-17` says no test ever ran
this function against a real locked-down connection with nobody signed in. That test now
exists, at `runner.pg.test.mjs:34`.

#### One more thing about the clock

On 2026-09-06 every scheduled job on the site died at start-up because a piece of shared
code was left out of the deploy bundle — `netlify.toml:104-116` records it. That was
fixed by commit `c36eb77e` ("Bundle the vendor tree into the functions, so the site has
working cron again"). The two-minute clock should be alive again. I did not run it, so
whether it is actually ticking on the live site right now is **UNKNOWN**.

---

#### The tests that prove the buttons

Two test files, 33 KB between them, cover the endpoints this screen calls. CLAUDE.md §12
says endpoint tests live at exactly this path, and they do.

#### `src/http/creative-generate.pg.test.mjs` — nine tests on the Enqueue button

| Line | What it proves |
|---|---|
| `:132` | An owner pressing Enqueue is accepted, and the job records the owner as the person who asked |
| `:156` | A partner pressing Enqueue records the partner, not a staff id |
| `:171` | The database itself refuses a mismatched requester |
| `:183` | A job with nobody attached is still allowed, because the clock creates those |
| `:195` | Typing the same batch name twice makes one job, not two |
| `:210` | The sentence beside the button matches the truth |
| `:245` | Nobody signed in is refused before anything is written |
| `:253` | A batch with no name is refused |
| `:269` | A request with no "what is being sold" is refused before anything is written |

**The no-provider case is already written down as expected behaviour.** The test at
`:231` says: if the answer is "it cannot run", the sentence must say "cannot run yet".
Its own comment at `:232-233` says plainly *"there is no creative_providers row in any
migration or seed."* And `:242` covers a third answer — "we could not check" — which is
not the same as "it cannot run" and must not be worded like it.

#### `src/http/creative-endpoints.pg.test.mjs` — eleven tests on the reading endpoints

| Line | What it proves |
|---|---|
| `:74`, `:82` | Every listed endpoint's database query actually runs, and returns nothing to a partner who owns none of it |
| `:91`, `:107` | Campaign detail is scoped and needs an id |
| `:114` | The library never even asks the database for the file location |
| `:127` | The library returns the ad's words for both a passed and a blocked piece |
| `:161` | Connection records never carry a scrambled password, before or after cleaning |
| `:174` | A blocked creative reaches the review queue carrying its reasons |
| `:184`, `:202` | A brand sent for review reaches the right queue and never another partner's |
| `:216` | Job rows show the failure reason but never what the vendor charged |

---

#### Where a finished creative goes

1. **Saved** into `creative_assets` with the state `pending` (`generate.mjs:221`).
2. **Checked** by the rules engine. It becomes `passed` or `blocked` (`:272`). A record
   of the check is written to `compliance_screenings` (`:278`).
3. **Shows up in two places at once** — the Creative library grid (`:1573`) and the
   Review queue (`api/creative/approvals.mjs:39-47`), because the queue lists anything
   that is `pending` or `blocked`.
4. **Chris decides.** Approve, Reject or Archive (`api/creative/actions.mjs:50-87`).
   Approve sets the state to `approved` and clears the reasons (`:68`). Reject sets it
   to `blocked` with the reason "Rejected by reviewer" (`:78`). Archive stamps a date on
   it (`:52`) and it drops out of the library unless "Include archived" is set to Yes.
5. **And then it stops. There is no next step.** I checked this rather than taking the
   page's word for it. The word `approved` is written in exactly one place in the whole
   system, `api/creative/actions.mjs:68`. The only files that read the creative table at
   all are `src/partners/scope.mjs`, `src/creative/generate.mjs`,
   `src/creative/providers/copy.mjs` and the four handlers under `api/creative/`. **None
   of them does anything with an approved row.** Nothing copies it onto a campaign, into
   an ad account, into a file, or into the ad register.

For the one kind Chris cares about — written words — that is enough to read them on
screen. It is not enough to ever measure them. See the join gap above.

---

## What is missing

Ranked worst first. Each is what stops Chris finishing the job alone.

1. **Nothing tells the system which service writes the copy. The job fails every
   time.** `resolve()` (`providers/index.mjs:45-60`) reads a row from the
   `creative_providers` table. I searched the whole repository: **there is no such row in
   any migration, any seed file, or any script.** The only `INSERT INTO
   creative_providers` in the codebase is inside a test
   (`src/creative/generate.pg.test.mjs:50`). So today the very first thing every job
   does is fail with "no active provider configured", which the code treats as permanent
   — retrying will never help (`generate.mjs:157`). This is the single blocker. One
   database row fixes it.

   **The database already says this, out loud.** There is a ready-made database view
   called `v_creative_config_gaps` (`db/migrations/052_config_defaults.sql:290`) whose
   whole job is to list what a human still has to decide. One of its lines reads
   *"UNSET — generation cannot run"* whenever no service is switched on
   (`052_config_defaults.sql:300-303`). **Nothing reads that view.** I grepped `api/`,
   `src/`, `public/`, `db/`, `scripts/` and `netlify/` — the only place it is read is one
   test, `src/social/social.pg.test.mjs:364`. So the system already knows its own number
   one blocker and has no way to say so on a screen.

2. **A finished ad can never be measured.** See "The join that does not exist" above.
   Approve a creative and there is no way to give it an ad number, so it can never
   appear in Campaign Manager's Ad Performance card.

3. **The brand kit never reaches the writer — and this is a form problem, not a
   plumbing problem.** The Enqueue endpoint already accepts a brand kit:
   `api/creative/generate.mjs:135` reads `brand_kit_id` straight off the request. The
   copy writer is already built to use a brand's tone of voice
   (`providers/copy.mjs:108-110`).

   Two things are missing, and only two:
   - The form never sends one. The Enqueue button builds its request at
     `creative-factory.html:2525-2535` with no brand kit in it.
   - Nothing turns a brand kit id into the actual brand kit. `src/creative/generate.mjs`
     stores the id (`:87`, `:93`) and copies it onto the finished creative (`:218-223`)
     and that is all it ever does with it. The writer looks for
     `spec.brandKit.voice_profile.tone` and nobody ever puts that there.

   So this is one form field plus one small loader, not a rebuild.

4. **The generator cannot read Chris's own ad rules.** I grepped every file under
   `src/creative/` and `api/creative/` for `RULES.md`, `VOICE.md`, `CONTROLS.md`,
   `CONCEPTS.md` and `rules-data`. **There is exactly one hit and it is a passing mention
   inside a comment** (`api/creative/generate.mjs:97`). Nothing loads any of them.

   What the writer uses instead is a short fixed list typed into the code
   (`providers/copy.mjs:91-98`). That is **six lines** every ad gets. If the ad is a
   credit-repair ad, five more are added (`:101-105`, switched on at `:99`) — so eleven
   lines for credit repair, six for funding or credit cards.

   **The seam to plug the real rules into already exists.** `copy.mjs:117-120` reads
   `spec.angles` — a list of hooks the caller may supply — and only falls back to four
   generic ones when nobody supplies any. `docs/ads/CONCEPTS.md:1` holds 48 hooks. And
   `docs/ads/rules-data.mjs` is already the one machine-readable copy of the banned words
   and phrases (its own note at `:1-8` says that is exactly why it exists;
   `BANNED_WORDS` at `:29`, `NEVER_SAY` at `:97`, `CLOSE_PROMISES` at `:157`). Nothing in
   the creative folder imports it.

5. **You cannot say how many, or what shape — also a form problem.** The endpoint already
   accepts both: `api/creative/generate.mjs:143` reads `formats` and `:144` reads
   `variants`. The form never sends either, so it always defaults to one variant in a 1×1
   shape (`creative-factory.html:2534`). For written copy the shape means nothing, but
   "one at a time" does — the writer is built to produce several different angles in one
   go (`copy.mjs:116-125`) and the page never asks for more than one. This is one more
   form field.

6. **The screen is not told who asked for a creative, but the database knows.** The page
   says at `:492-493` "This screen is never told who asked for or approved a creative."
   That is true of the screen and false of the system.

   The database records it three ways: `requested_by_kind` (staff or partner),
   `requested_by_staff_id`, and `requested_by_account_id`, all added by
   `db/migrations/241_generation_jobs_requested_by.sql:42-45`. Tests prove they are
   written correctly for an owner (`src/http/creative-generate.pg.test.mjs:147-149`) and
   for a partner (`:166-168`). The older single `requested_by` column
   (`045_creative_factory.sql:293`) is retired and never written again — the migration
   says so at `241:54` and the test asserts it stays empty at `:153`.

   **The endpoint simply does not ask for those three columns.** Its column list is at
   `api/creative/jobs.mjs:26-32`. Adding them is a few words.

7. **The five tiles under "What each job state means" are dead buttons.** They look
   pressable, they highlight when you point at them (`:130-131`), and nothing happens
   (`:1470-1476`, no listener anywhere). UI-STANDARDS §5 forbids this outright.

8. **The library cannot tell you whether a file was saved, and an endpoint's own note
   says the opposite.** This is a small, real, fixable defect.

   `api/creative/library.mjs:47` deliberately asks the database a yes/no question —
   *does this creative have a file?* — and calls the answer `has_storage_key`. The
   endpoint's own note at `:9-11` says "The screens get `has_storage_key` instead, which
   is all they need to decide whether to render a thumbnail."

   **That note is untrue.** The cleaning step at `src/http/read-api.mjs:18` throws away
   any field whose name contains `storage_key` anywhere in it — and `has_storage_key`
   contains it. The short list of exceptions at `:22` holds two names and neither is this
   one. So the answer is computed, then silently binned.

   The page has already worked this out and says so at `creative-factory.html:1536-1538`.
   That is why the library shows the grey line "no preview available / no file on this
   screen" at `:1547` for every picture and video, always.

   Left alone, a future agent reads the endpoint's note, trusts it, and builds on a lie.

9. **No journey diagram.** CLAUDE.md §4 says every flow gets a pair of Mermaid diagrams
   in `docs/journeys/`. I listed the whole folder: there is **no** `creative-factory-*.md`
   in it. The only place the words "creative-factory" appear anywhere under
   `docs/journeys/` is one passing sentence inside an old entry at
   `docs/journeys/CHANGELOG.md:179`, about a sideways-scrolling bug. The nearest real
   diagram, `docs/journeys/ad-script-flow.md`, is a different flow.

10. **The pagers lie a little.** Four panels each read a fixed 200 rows —
    jobs (`creative-factory.html:2297`), library (`:2301`), brand kits (`:2305`) and
    approvals (`:2309`) — and then page inside them in the browser (`page()` at `:941`).
    Past 200 jobs or 200 creatives, "next ›" goes grey and there is no way to see the
    rest. The fifth panel, Video performance, is not part of that block — it reads on its
    own at `:2417`.

11. **No way to get a creative out.** No download, no copy-to-clipboard, no "send to
    campaign". Chris has to select the text on screen with a mouse.

---

## The data model

Plain-word meaning of each table this lane touches.

**`creative_assets`** — one row per finished piece of creative.
`db/migrations/045_creative_factory.sql:163`, plus `301_creative_copy_text.sql:67`.

| Column | What it means |
|---|---|
| `kind` | picture, video, or written words (`static` / `video` / `copy`) |
| `format` | the shape: `1x1`, `4x5`, `9x16`, `16x9` |
| `provider` | which service made it |
| `storage_key` | where the file lives. Empty for written words |
| `copy_text` | **the actual words of the ad.** Empty for a picture. Added by migration 301 |
| `ai_generated` | was a machine involved |
| `synthetic_performer` | is there a fake person on screen |
| `compliance_state` | `pending` (not checked yet), `passed` (cleared), `blocked` (stopped), `approved` (a human said yes) |
| `blocked_reasons` | the list of why it was stopped |
| `parent_asset_id` | if this is a re-shaped copy of another one, which one |
| `archived_at` | the date it was hidden. Empty means still visible |

`storage_key` never leaves the server, on purpose — `api/creative/library.mjs:47` does
not even select it. What it does select is the yes/no `has_storage_key`, and that gets
thrown away too. See gap 8.

Why the words survive even when an ad is blocked: migration 301's own note at `:14-21`
walks through what used to happen and ends with the line **"The words are thrown away."**
That is what 301 fixed.

**`generation_jobs`** — one row per batch Chris asks for.
`db/migrations/045_creative_factory.sql:286`.

| Column | What it means |
|---|---|
| `spec` | what was asked for: the words to work from, the shape, how many |
| `status` | `queued`, `running`, `succeeded`, `failed` |
| `attempt` | how many tries so far. Three is the limit (`generate.mjs:31`) |
| `error` | why it stopped, in an engineer's words. The page translates three of them into plain English (`creative-factory.html:1388-1397`) |
| `idempotency_key` | the batch name. Typing the same one twice does not bill twice |
| `cost_cents` | what the vendor charged. Never shown on screen (`api/creative/jobs.mjs:11-12`) |
| `provider` | which service ran it |
| `requested_by_kind` | was it an employee or a partner who asked. Empty means the clock did it (`241:42-43`) |
| `requested_by_staff_id` | which employee (`241:44`) |
| `requested_by_account_id` | which partner account (`241:45`) |
| `requested_by` | retired. Never written to again (`241:54`) |

**`generation_job_assets`** — joins a job to the creatives it produced. `045:337`.

**`creative_providers`** — which outside service makes each kind of thing.
`db/migrations/048_campaign_config.sql:45-74`. Allowed kinds: `static`, `video`, `copy`,
`resize` (`:59-60`). Allowed services: `static`, `ugc-video`, `product-video`, `copy`,
`resize` (`:61-62`).
**This table is empty. That is the number one blocker.**

**`compliance_rules`** — the reasons a piece of copy can be stopped, kept as editable
rows rather than code. `db/migrations/047_compliance_rules.sql:204`. The file's own note
at `:16-21` explains why: the wording changes, and a wording change should be a row edit,
not a new release.

**`v_creative_config_gaps`** — not a table, a saved question. It answers "what has a
human still not decided?" First written in `048_campaign_config.sql:262`, rewritten with
a plain-words status column in `052_config_defaults.sql:290`. **Nothing reads it except
one test.**

**`brand_kits`** — a partner's colours, fonts, voice and products. `045:86`. Read-only on
this page (`creative-factory.html:575`). Never used when generating (see gap 3).

**`partner_module_settings`** — the switches per partner.

| Column | What it means | Where |
|---|---|---|
| `marketing_suite_enabled` | is this partner allowed to generate at all. Starts as **off** | `172_wl_marketing.sql:8` |
| `ai_token_cap_monthly` | how much writing a month, default 250,000 | `172_wl_marketing.sql:11` |
| `max_concurrent_jobs` | how many jobs at once, default 3 | `046_ad_platforms.sql:658` |
| `approve_before_launch` | must a human say yes, default yes | `046_ad_platforms.sql:647` |

**`partner_ai_usage`** — the running total of writing used this month
(`src/brand/meter.mjs:58-66`).

**`compliance_screenings`** — a record of every check, kept as evidence
(`generate.mjs:278`).

**`partner_brand`** and **`campaigns`** — two other things that show up in the same
Review queue (`api/creative/approvals.mjs:49-71`).

**`client_ad_attribution`** — one row per person who arrived from an ad, carrying the ad
number they came from. Added by `db/migrations/286_client_ad_attribution.sql`, along with
the `fundhub_ad_id()` function that pulls the number out of a link. This is what Campaign
Manager's Ad Performance card counts. Nothing in Creative Factory writes to it.

**`analytics_connections`** and **`video_watch_stats`** — the YouTube panel at the bottom
(`db/migrations/302_analytics_connections.sql`, read by `api/read/video-stats.mjs`).

---

## The screens

**Page:** `/app/creative-factory.html`. One partner at a time.

**Order down the page** (this is the order it renders, `:380-682`): five headline
numbers → Partner scope → Monthly writing allowance → **Generate and decide** →
Generation jobs → Creative library → Review queue → Brand kits → Video performance →
Reference (closed).

**The one thing Chris will do, in eight steps:**

1. **Partner** dropdown (`:396`) — choose Fundhub.
2. **What is being sold** (`:451`) — choose Funding.
3. **What to make** (`:459`) — type the idea, e.g. "working capital for owners".
4. **Name this batch** (`:462`) — type anything he has not used before.
5. Press **Enqueue generation** (`:464`). The line beside it says whether the job can
   actually run.
6. Press **Run queued jobs now** (`:465`), or wait two minutes for the clock.
7. Scroll to **Creative library**. A card appears. The first four lines of the ad are on
   the card. Click it — the whole ad is in the side panel under "The words" (`:2062`).
8. Scroll back up to **Decide on one creative**, pick it in the dropdown (`:476`), press
   **Approve** (`:478`). Confirm.

**What breaks that walk today:** step 6 fails at the first attempt, because no row says
which service writes copy. Chris sees "Tried 1 job: 0 worked, 1 did not." followed by
"No ad-making service is switched on for this account, so there is nothing to make the
work." (`api/creative/run.mjs:24`, joined onto the line at `creative-factory.html:2596`).

**Second page:** `/app/campaign-manager.html`, the **Ad Performance** card (`:374`).
Chris presses one of the seven grouping buttons above the table (`:378`) and reads which
ad number booked the most calls. This card needs nothing from Chris to work — but it can
only ever show ads that were filed by number into `docs/ads/registry.json`.

---

## What breaks the UI-STANDARDS rules

`docs/UI-STANDARDS.md` is law for anything under `public/app/`. Six real breaks.

### 1. §5 — "Every visible control works. No buttons wired to nothing."

`creative-factory.html:1470-1476` builds five `<button type="button">` tiles inside the
job-state legend. `:130-131` gives them a pointer cursor and a hover colour. No click
handler exists for them anywhere in the file.

**The page's own author wrote the rule down and then broke it further down the same
file.** At `:1262-1263`, inside the code that draws the five headline number tiles, the
comment reads: *"Plain tiles, not buttons: … §5 does not allow a control that does
nothing."* Two hundred and eight lines later, at `:1470-1476`, the legend builds five
buttons that do nothing.

### 2. §1 — "One primary action per screen. Exactly one filled/prominent button."

Three filled dark buttons: **Enqueue generation** (`:464`), **Connect** for YouTube
(`:610`), **Approve this brand** (`:1821`). Two of those three are on the page at the
same time for any owner sign-in.

### 3. §12.7 — the type trap: text sizes the browser throws away

**What this rule is, in one paragraph.** There is one shared style file for the whole
app. To stop every screen inventing its own text sizes, it forces every piece of text
inside a screen to be the same size as the thing it sits in — unless the text carries one
of a short list of approved names. `docs/UI-STANDARDS.md:180-216` explains it and lists
the approved names. The list is in the file itself at
`public/app/fundhub-brand.css:187-204`: headings `h1` and `h2` get big text; a handful of
names like `.sv`, `.kpi .vl` get the huge-number size; and about twenty names like
`.chip`, `.eyebrow`, `.note`, `.mono`, `label` and `th` get the small caption size.

**What goes wrong.** This screen writes 27 of its own text sizes on names that are not on
that list. The browser silently bins all 27. The screen looks flat, and nothing in a code
review shows it.

Here is what a person actually sees. Everything in this list is meant to be a size other
than ordinary body text, and comes out as ordinary body text instead:

**The biggest one — a number that should be huge and is not:**

- The big count on each of the five job-state tiles ("3 Queued", "1 Failed"). Meant to be
  the large 32-pixel number. `:132`.

**Small print that is meant to be small and is not.** All of these render at full body
size, which makes the page look like a wall:

- The grey line under the page title in the top bar — `:47`
- The label under each of the five job-state tiles — `:134`
- The small buttons anywhere on the page — `:68`
- The grey summary line at the bottom of every card — `:99`
- Any short bit of code shown inside a note — `:107`
- The filter buttons above every table ("all / queued / running") — `:115`
- The word "State" that sits in front of those filter buttons — `:120`
- The little arrow that opens a table row — `:156`
- The label above each fact in an opened table row — `:161`
- The "prev / next" strip under every table — `:167`
- The code, the question and the detail lines in the block-reasons table — `:175`,
  `:177`, `:178`
- The shape tag ("1x1") in the corner of a creative tile — `:193`
- The length tag ("30s") in the other corner — `:194`
- The grey "no preview available" line inside an empty tile — `:196`
- The state word under a creative tile, and the line under it — `:198`, `:199`
- The small labels on a creative, like "AI-generated" — `:201`
- The small print under a brand kit card — `:214`
- The heading of the yellow "not wired up" warning box — `:219`
- Every heading inside the slide-out side panel — `:236`. UI-STANDARDS names this exact
  case: an `h3` heading is not on the approved list
- The label above each fact in the side panel — `:238`
- The four-line preview of an ad on a library card — `:246`

**Two that are meant to be big and are not:**

- The name on a brand kit card. Meant to be title size — `:211`
- A card heading that no longer exists on the page anyway — `:60`

UI-STANDARDS §12.7 allows exactly **one** rule per screen to force these back on, with
the reason written above it. It names two screens that already do it correctly:
`client-control-panel.html:100-106` and `closer-dashboard.html:223-228`. This screen has
none.

**The 27 is a hand count**, made by checking each of this screen's style rules against
the approved list at `fundhub-brand.css:187-204`. A browser would settle it exactly. See
UNKNOWN #11.

### 4. §2 — the spacing scale

"8px spacing scale only: 8 / 16 / 24 / 32 / 48 / 64. No 10px, no 14px, no eyeballing."
Broken all over the top of the file: `.topbar{gap:14px}` (`:45`),
`.content{padding:22px 24px 40px}` (`:55`), `.card+.card{margin-top:14px}` (`:58`),
`.card-hd{padding:13px 16px 12px}` (`:59`), `.stats{gap:12px}` (`:93`),
`.stat{padding:14px 16px}` (`:94`), `.pager{padding:11px 16px}` (`:167`).

### 5. §7 — "Every metric has a comparison."

The five headline tiles (`:1252-1261`) show a number and a breakdown of that same number
("2 running · 3 queued"). None of them compares to yesterday, to last week, or to a
target.

### 6. §6 — "NEVER fake sample data presented as real." — and why the obvious fix is wrong

Four reference tables are typed into the page by hand: the 29 block reasons (`:780`), the
AI-label rules (`:879`), the engine settings (`:893`), and the rates (`:920`).

**But the numbers in them are not made up.** I checked where they came from, and they are
copies of things that really exist in the database:

- The page says so itself. The comment right above the engine-settings table, at `:892`,
  reads *"v_creative_config_gaps — status strings verbatim (048 / 052)"*. That is the
  name of a real saved question in the database
  (`db/migrations/052_config_defaults.sql:290`), and the wording matches: the page's
  "Not set — generation cannot run" (`:895-896`) is the view's "UNSET — generation cannot
  run" (`052:300-303`).
- Every row of the 29-reason table carries `src:'seeded'` (`:781` onward). That is the
  same word the database uses for a rule that shipped with the product
  (`db/migrations/047_compliance_rules.sql:204`).

**So the break is real but it is a copying break, not an inventing break.** The table
prints "3 rows set" and "0 rows set" (`:894`, `:897`) as facts, and nothing looked them
up. If the real numbers change, the page keeps showing the old ones and nobody finds out.

**The fix is not to delete the numbers.** Deleting them throws away true information —
including the line that says this whole lane is blocked. The fix is one small reading
endpoint over the saved question that already exists. Nothing anywhere reads it today
(checked across `api/`, `src/`, `public/`, `db/`, `scripts/` and `netlify/` — only one
test, `src/social/social.pg.test.mjs:364`).

There is an honest warning above the table at `:668-669`, which is why this is last on
the list rather than first.

**Not a break, but wrong on the page:** the comment at `:49-54` says "max-width:1280px on
`.fh-maxw` still caps it". That has not been true since 2026-08-27 —
`public/app/fundhub-brand.css:164` reads `.fh-maxw{max-width:none;margin-inline:0;width:100%}`.
The layout is correct and fluid, as §1 requires. Only the comment is stale.

---

## Definition of done

Tick every line. Nothing here asks for picture or video generation — commit `48b886e6`
took that off the list.

**Make it run at all**

1. [ ] A row exists in `creative_providers` for `asset_kind = 'copy'` with
       `provider_key = 'copy'` and `active = true`, applied by a migration or a seed
       file, not by hand in a console. Proof: `POST /api/creative/generate` answers
       `provider_ready: true`, and the sentence beside the button stops saying "cannot
       run yet" (the wording is already tested at
       `src/http/creative-generate.pg.test.mjs:231`).
2. [ ] `ANTHROPIC_API_KEY` is set in Netlify for production. Proof: a job for kind
       `copy` moves from `queued` to `succeeded` and a row appears in
       `creative_assets` with words in `copy_text`.
3. [ ] The two-minute clock is proven alive on the live site: a job left alone for
       four minutes changes state on its own, with no button pressed. The bug that used
       to stop this is fixed in code at `src/creative/runner.mjs:27` and guarded by
       `src/creative/runner.pg.test.mjs:34`, but it has not been watched working on the
       live site.

**Make the ads sound like Chris's ads — three form fields and one loader**

4. [ ] The generate form sends a brand kit. One dropdown on the form. The endpoint
       already takes it at `api/creative/generate.mjs:135`.
5. [ ] Something turns that brand kit id into the actual brand kit and puts it where the
       writer looks — `spec.brandKit`. Today `src/creative/generate.mjs:218-223` only
       stores the id and never opens the kit. Proof: the words that come back use the
       tone written in that kit (`brand_kits.voice_profile.tone`).
6. [ ] The form lets Chris ask for more than one at a time, and pick a shape. Both are
       already accepted at `api/creative/generate.mjs:143-144`. Proof: asking for four
       gives four separate cards with four different angles.
7. [ ] The writer reads Chris's own rules instead of the six hard-typed lines at
       `providers/copy.mjs:91-98`. The three sources are `docs/ads/rules-data.mjs` (the
       banned words, already machine-readable), `docs/ads/CONCEPTS.md` (48 hooks, which
       fit the `spec.angles` list the writer already reads at `copy.mjs:117-120`), and
       `docs/ads/CONTROLS.md` (the five filmed, running ads — the voice seed). Proof:
       change one line in the rules source, regenerate, and the output moves.

**Make a finished ad measurable**

8. [ ] Decide and build the step that turns an approved creative into an ad with a
       number. Today there is none — nothing in the system connects `creative_assets.id`
       to an entry in `docs/ads/registry.json` or to a `utm_content` number. Proof: an ad
       approved in Creative Factory shows up as its own row in Campaign Manager's Ad
       Performance card (`campaign-manager.html:374`) once it has run.

**Fix what is wrong on the screens**

9. [ ] The library can say whether a picture or video has a file. Either let
       `has_storage_key` through the cleaning step at `src/http/read-api.mjs:22`, or
       correct the endpoint's note at `api/creative/library.mjs:9-11` so it stops
       claiming the screens get it. One or the other — not neither.
10. [ ] The jobs list shows who asked. The columns exist
        (`db/migrations/241_generation_jobs_requested_by.sql:42-45`) and are proven
        written (`src/http/creative-generate.pg.test.mjs:147-149`, `:166-168`). Add them
        to the column list at `api/creative/jobs.mjs:26-32` and take the "this screen is
        never told who asked" line off the page at `creative-factory.html:492`.
11. [ ] The five dead tiles at `creative-factory.html:1470-1476` either do something when
        clicked, or stop being buttons. §5.
12. [ ] The empty box `#scopeOffers` (`creative-factory.html:399`, emptied at `:1056`)
        either shows something or is deleted.
13. [ ] The engine-settings table reads the saved question
        `v_creative_config_gaps` through a new reading endpoint, instead of printing
        hand-typed counts at `:894` and `:897`. Do **not** simply delete the numbers —
        one of those rows is this lane's number one blocker.
14. [ ] The screen carries **one** `!important` text-size rule with the reason written
        above it, so its own sizes actually paint. §12.7. Copy the shape from
        `client-control-panel.html:100-106`. Proof: the five job-state counts measure
        32px in a browser, not 16px.
15. [ ] Only one filled dark button is visible at a time. §1.
16. [ ] Every spacing number in the screen's own `<style>` is 8, 16, 24, 32, 48 or 64.
        §2.

**Prove it**

17. [ ] `docs/journeys/creative-factory-intended.md` and
        `docs/journeys/creative-factory-actual.md` both exist, and one line is appended
        to `docs/journeys/CHANGELOG.md`. CLAUDE.md §4.
18. [ ] `npm run lint` and `npx tsc --noEmit` pass. The test suite is green against a
        real `DATABASE_URL`, with no test skipped, deleted or weakened. CLAUDE.md §6.
19. [ ] `src/http/routes.test.mjs` still passes, and every new endpoint (if any) is in
        the list at `netlify/functions/api.mjs:278`.
20. [ ] `e2e/live-creative-factory-marketing-menu.spec.mjs` is actually run against the
        live site and passes, and the result is written down. Today it has never been
        recorded as run.
21. [ ] A human — Chris — opens the page, does the eight steps in **The screens** above,
        and reads a finished ad on screen without asking an agent for anything.

---

## UNKNOWN — blocked or unverifiable

| # | What | Why it is UNKNOWN |
|---|---|---|
| 1 | Is `ANTHROPIC_API_KEY` set on the live site? | I did not read the local `.env` and cannot reach Netlify from here. Without it `copy.mjs:26-28` throws before anything is written. |
| 2 | Is the two-minute clock actually running on the live site right now? | `netlify.toml:141-142` and `creative-job-runner.mjs:7` agree, and `runner-cron.test.mjs` guards that. The bug that made it find nothing is fixed at `runner.mjs:27`. But the 2026-09-06 bundling failure (`netlify.toml:104-116`) killed every scheduled job silently, and I cannot invoke one from a code read. Commit `c36eb77e` claims the fix. Unproven here. |
| 3 | Has `e2e/live-creative-factory-marketing-menu.spec.mjs` ever been run and passed? | The file exists and asserts two things (`:28-56`). Its own note at `:3` says it only runs against the deployed site, and nothing in the repository records a run or a result. Reading a test cannot prove a page loaded. |
| 4 | Is `marketing_suite_enabled` true for any partner today? | It lives in `partner_module_settings` (`172_wl_marketing.sql:8`) and starts as **off**. Until it is on for Fundhub's own partner row, three buttons on this page go grey: Enqueue, Run queued jobs now, and the three Approve/Reject/Archive buttons (`creative-factory.html:1175-1178`). The YouTube **Connect** button (`:610`) and the two brand-review buttons (`:1821`, `:1823`) stay live either way — they are controlled by your role, not by this switch. I cannot read the database. |
| 5 | Does a `partners` row for Fundhub itself exist? | The whole page is partner-scoped and shows nothing without one (`:2285-2295`). Not checkable from code. |
| 6 | Is `creative_providers` truly empty on the live database? | I proved no migration, seed or script inserts a row — the only insert in the whole repository is in a test (`src/creative/generate.pg.test.mjs:50`). A row put in by hand in a console would not appear in any file. The saved question `v_creative_config_gaps` (`052_config_defaults.sql:298-303`) would answer this instantly, but nothing reads it. |
| 7 | YouTube: client id, client secret, refresh token | Blocked on Chris. The Connect form (`:601-610`) and Sync now (`:587`) are wired and reachable, and cannot work until he supplies these. |
| 8 | Microsoft Clarity project ID | Blocked on Chris. Nothing on this page uses it. |
| 9 | Meta ad account connection | Blocked on Chris. No `ad_platform_connections` row. Not on this page's path, but it is what an approved creative would eventually flow to. |
| 10 | ClickFunnels: is a "conversion" an opt-in or a sale? | Blocked on Chris. `src/analytics/clickfunnels.mjs:255` counts opt-ins. Not this page's panel — recorded because it changes what "done" means next door. |
| 11 | May `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected? | Blocked on Chris. Untouched. |
| 12 | Does the page fit above the fold on a 13" laptop (900px)? | §1 says the screen's job must be doable without scrolling. **Generate and decide** is the fourth block down (`:428`), below the five tiles (`:383`), Partner scope (`:386`) and Monthly allowance (`:409`). It looks likely to fall below the fold, but I was told not to open a browser, so I did not measure it. |
| 13 | The exact number of dead text-size rules | I hand-counted 27 against the approved list at `fundhub-brand.css:187-204`. The list itself I read and confirmed — none of the names this screen uses (`.an`, `.kn`, `.ak`, `.flag`, `.np`, `.kk`, `.rl`, `h3`) is on it. A browser would settle the exact count. Not opened. |
| 14 | Whether any live `creative_assets` row has words in `copy_text` | Migration 301 exists on `main`, but §11 of CLAUDE.md says a migration is not live until the branch is merged **and** the production deploy runs it. `e2e/live-creative-factory-marketing-menu.spec.mjs:4-5` says as of that test being written it "has not been applied anywhere in production yet". Whether it has landed since is not readable from here. |
| 15 | How many ad numbers in `docs/ads/registry.json` are already booking calls | The Ad Performance card counts real rows in `client_ad_attribution` (migration 286). I cannot read the database, so I do not know whether that card shows anything today. |
