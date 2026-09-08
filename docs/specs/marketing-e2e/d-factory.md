# Lane D — Creative Factory, working in a browser

Read on 2026-09-08, on `main` at `fe864840`. Code read only. No app file was changed.

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
reachable. A live browser test already proves it opens with no errors:
`e2e/live-creative-factory-marketing-menu.spec.mjs:29-56`.

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
| 14 | Generate | **Enqueue generation** `#genBtn` (`:464`) | Saves a job | Works. `POST /api/creative/generate` (`:2518`). Switched off until the allowance loads and is on (`:1175-1203`) |
| 15 | Generate | **Run queued jobs now** `#runJobsBtn` (`:465`) | Starts the queue straight away | Works. `POST /api/creative/run` (`:2579`) |
| 16 | Generate | Message line `#genMsg` (`:466`) | Says what happened | Label only |
| 17 | Decide | **Creative** dropdown `#actAsset` (`:476`) | Pick one creative | Works. Built from rows already read (`:1600-1614`) |
| 18 | Decide | **Approve** (`:478`) | Marks it approved | Works. `POST /api/creative/actions` (`:2612`), asks to confirm first (`:2610`) |
| 19 | Decide | **Reject** (`:480`) | Marks it blocked | Works. Same endpoint, same confirm |
| 20 | Decide | **Archive** (`:481`) | Hides it from the library | Works. Same endpoint, same confirm |
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
| 38 | Review queue | **Reason for sending it back** box (`:1811`) | Text for a brand rejection | Works. Owner/admin only (`:1802`) |
| 39 | Review queue | **Approve this brand** (`:1821`) | Approves a partner's brand | Works. `POST /api/brand/review` (`:2674`) |
| 40 | Review queue | **Send it back** (`:1823`) | Returns it to draft | Works. Refuses with no reason typed (`:2660`) |
| 41 | Review queue | prev / next `#apprPager` (`:562`) | Page the queue | Works |
| 42 | Brand kits | State buttons `#kitRail` (`:571`) | all / draft / active / archived | Works (`:1936`) |
| 43 | Brand kits | A kit card (`:1958`) | Opens the side panel | Works (`:1976`, `:2135`) |
| 44 | Brand kits | prev / next `#kitPager` (`:574`) | Page the kits | Works |
| 45 | Video performance | **Sync now** `#vidSyncBtn` (`:587`) | Pulls YouTube numbers | Works as code. `POST /api/analytics/youtube-sync` (`:2457`). Cannot succeed until Connect is done |
| 46 | Video performance | **Client ID** `#ytClientId` (`:602`) | Google sign-in detail | Works |
| 47 | Video performance | **Client secret** `#ytClientSecret` (`:605`) | Google sign-in detail | Works |
| 48 | Video performance | **Refresh token** `#ytRefreshToken` (`:608`) | Google sign-in detail | Works |
| 49 | Video performance | **Connect** `#ytConnectBtn` (`:610`) | Saves the three values | Works as code. `POST /api/analytics/youtube-connect` (`:2430`). Blocked — Chris does not have the three values |
| 50 | Reference | "What each job state means" (`:633`) | Opens a panel | Works |
| 51 | Reference | The five tiles inside it (`:1471`) | Queued / Retrying / Running / Succeeded / Failed | **BROKEN.** They are `<button>` elements with a hover highlight (`:131`) and **no click handler anywhere in the file**. Pressing one does nothing |
| 52 | Reference | "How the AI labels are decided" (`:640`) | Opens a table | Works. Table is a fixed list in the page (`:879`) |
| 53 | Reference | "Why creative gets stopped" (`:651`) | Opens a table of 29 reasons | Works. Fixed list in the page (`:780`) |
| 54 | Reference | "Settings the creative engine ships with" (`:666`) | Opens a table | Works. Fixed list in the page (`:893`) |
| 55 | Side panel | Close ✕ `#dwClose` (`:700`) | Closes it | Works (`:2173`) |
| 56 | Side panel | Grey backdrop `#scrim` (`:693`) | Closes it | Works (`:2174`) |
| 57 | Side panel | Escape key | Closes it | Works (`:2175`) |

Three pieces of code on the page are dead and paint nothing:

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
| `GET /api/creative/library` | `:2301` | `api.mjs:749` | routed |
| `GET /api/creative/brand-kits` | `:2305` | `api.mjs:749`* | routed (`api.mjs:749` is `creative/brand-kits`) |
| `GET /api/creative/approvals` | `:2309` | `api.mjs:751` | routed |
| `POST /api/creative/generate` | `:2518` | `api.mjs:747` | routed |
| `POST /api/creative/run` | `:2579` | `api.mjs:753` | routed |
| `POST /api/creative/actions` | `:2612` | `api.mjs:752` | routed |
| `POST /api/brand/review` | `:2674` | `api.mjs:661` | routed |
| `GET /api/read/video-stats` | `:2417` | `api.mjs:583` | routed |
| `POST /api/analytics/youtube-connect` | `:2430` | `api.mjs:586` | routed |
| `POST /api/analytics/youtube-sync` | `:2443`, `:2457` | `api.mjs:587` | routed |

\* exact key list: `creative/generate` `:747`, `creative/library` `:748`,
`creative/brand-kits` `:749`, `creative/jobs` `:750`, `creative/approvals` `:751`,
`creative/actions` `:752`, `creative/run` `:753`.

**Nothing is missing. The trap is not firing for this page.** The ground brief's claim
is confirmed, endpoint by endpoint.

The guard is still in place and still real: `src/http/routes.test.mjs:100-112` walks
every `.mjs` file under `api/` and fails if one is neither in the list, prefix-routed,
nor written down as deliberately unreachable. `:114-123` catches the mirror problem — a
typo in the list that still imports fine. `:146-158` proves both web address shapes
reduce to the same key. The allow-list of deliberately-unreachable files (`:73-82`) holds
three shelved decline-autopsy files and nothing from this lane.

I also spot-checked the neighbouring screen, `public/app/campaign-manager.html`. All
twelve endpoints it calls are in the list too.

### The providers — what each one makes, and whether it is real

`src/creative/providers/` holds five little modules. `index.mjs:30-36` maps them by name.
Which one runs is decided by a row in the database, never by code (`index.mjs:45-69`).

| File | What it makes | Calls an outside service? | Real or a stub? |
|---|---|---|---|
| `copy.mjs` | The written words of an ad | Yes — Anthropic, through `src/agents/model.mjs` (`copy.mjs:36-43`) | **REAL.** The address is a real one and the code path is complete. With no key it comes back in "shadow" mode and is thrown as a failure (`copy.mjs:61-63`) |
| `static.mjs` | A picture | Yes | **STUB.** The address is `https://api.example-image-provider.com/v1/images` (`static.mjs:35`). That is not a real company |
| `ugc-video.mjs` | A video of a fake person reading a script | Yes | **STUB.** `https://api.example-ugc-provider.com/v1/videos` (`ugc-video.mjs:30`) |
| `product-video.mjs` | A video of a product, no person | Yes | **STUB.** `https://api.example-product-video.com/v1/render` (`product-video.mjs:28`) |
| `resize.mjs` | The same creative in a different shape | Yes | **STUB.** `https://api.example-resize.com/v1/derive` (`resize.mjs:36`) |
| `_http.mjs` | Not a provider — shared plumbing: one web call, key loading, and wiping secrets out of error messages (`_http.mjs:77-85`) | n/a | Real |

All four stub files carry the same warning at the top: "⚠️ CONFIRM BEFORE THIS RUNS
LIVE. Payload shape unverified against a real account."

`providers.test.mjs` (17 tests) proves the shapes and the safety rules without a network
— for example a fake person is always labelled as one (`:103`, `:113`) and a key never
escapes in an error (`:55`, `:64`).

### The owner's decision on pictures and video

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

### The text path, end to end

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
   it (`:234`, and migration `301_creative_copy_text.sql`).
9. The library then shows the words on the card (`creative-factory.html:1546`) and in
   full in the side panel (`:2062-2066`).

**One important note about the clock.** On 2026-09-06 every scheduled job on the site
died at start-up because a piece of shared code was left out of the deploy bundle —
`netlify.toml:104-116` records it. That was fixed by commit `c36eb77e` ("Bundle the
vendor tree into the functions, so the site has working cron again"). The two-minute
clock should be alive again. I did not run it, so whether it is actually ticking on the
live site right now is **UNKNOWN**.

### Where a finished creative goes

1. **Saved** into `creative_assets` with the state `pending` (`generate.mjs:221`).
2. **Checked** by the rules engine. It becomes `passed` or `blocked` (`:272`). A record
   of the check is written to `compliance_screenings` (`:278`).
3. **Shows up in two places at once** — the Creative library grid (`:1573`) and the
   Review queue (`api/creative/approvals.mjs:39-47`), because the queue lists anything
   that is `pending` or `blocked`.
4. **Chris decides.** Approve, Reject or Archive (`api/creative/actions.mjs:50-87`).
   Approve sets the state to `approved` and clears the reasons. Reject sets it to
   `blocked` with the reason "Rejected by reviewer". Archive stamps a date on it and it
   drops out of the library unless "Include archived" is set to Yes.
5. **And then it stops.** There is no next step. Nothing copies an approved creative
   onto a campaign, into an ad account, or into a file Chris can download. The page says
   so itself at `:492-494`: "This screen is never told who asked for or approved a
   creative, and it is never told how an advert performed."

For the one kind Chris cares about — written words — that is enough: he can read the
words on screen and copy them. For anything else there is no way out of the system,
which is consistent with the owner decision above.

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

2. **The brand kit never reaches the writer.** The page has a whole Brand kits panel,
   and the copy writer is built to use a brand's tone of voice
   (`providers/copy.mjs:108-110`). But nothing ever puts a brand kit into the job. The
   Enqueue button sends no `brand_kit_id` (`creative-factory.html:2525-2535`), and no
   code anywhere loads a `brand_kits` row into the job's instructions — I grepped
   `brandKit` across `src/creative/` and `api/creative/` and the only writers are the
   provider files reading a key that is never filled. So Fundhub's voice, colours and
   fonts are decoration on this screen. Every ad is written in a generic voice.

3. **The generator cannot read Chris's own ad rules.** `docs/ads/RULES.md`,
   `docs/ads/VOICE.md` and `docs/ads/CONTROLS.md` (the five filmed, running ads) are not
   read by `providers/copy.mjs`. Its instructions to the model are eleven hard-typed
   lines (`copy.mjs:89-112`). So the ads it writes will not sound like Chris's ads.

4. **You cannot say how many, or what shape.** The form has no field for either. It
   always asks for one variant in a 1×1 shape (`creative-factory.html:2534`). For written
   copy the shape means nothing, but "one at a time" does — the writer is built to
   produce several different angles in one go (`copy.mjs:116-125`) and the page never
   asks for more than one.

5. **The five tiles under "What each job state means" are dead buttons.** They look
   pressable, they highlight when you point at them (`:131`), and nothing happens
   (`:1471`, no listener anywhere). UI-STANDARDS §5 forbids this outright.

6. **No journey diagram.** CLAUDE.md §4 says every flow gets a pair of Mermaid diagrams
   in `docs/journeys/`. There is no `creative-factory-*.md` in that folder. The nearest
   thing, `docs/journeys/ad-script-flow.md`, is a different flow.

7. **The pagers lie a little.** Every panel reads a fixed 200 rows
   (`creative-factory.html:2297-2311`) and then pages inside them in the browser
   (`page()` at `:941`). Past 200 jobs or 200 creatives, "next ›" goes grey and there is
   no way to see the rest.

8. **No way to get a creative out.** No download, no copy-to-clipboard, no "send to
   campaign". Chris has to select the text on screen with a mouse.

9. **Four of the five reference tables are typed into the page by hand** — the 29
   reasons (`:780`), the AI-label rules (`:879`), the engine settings (`:893`), and the
   rates (`:920`). They do not read the running system. The page admits this in one
   place (`:668-669`) but the "Settings the creative engine ships with" table still
   states counts as if it had looked (`rows_set: 3` at `:895`, `rows_set: 0` at `:898`).

---

## The data model

Plain-word meaning of each table this lane touches.

**`creative_assets`** — one row per finished piece of creative.
`db/migrations/045_creative_factory.sql:163`, plus `301_creative_copy_text.sql`.

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

`storage_key` is never sent to the screen — the read code strips out anything with
"storage_key" in the name (`src/http/read-api.mjs:18`). That is why the library shows a
grey placeholder instead of a picture, and why it cannot even tell you whether a file
was saved.

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

**`generation_job_assets`** — joins a job to the creatives it produced. `045:337`.

**`creative_providers`** — which outside service makes each kind of thing.
`db/migrations/048_campaign_config.sql:45-74`. Allowed kinds: `static`, `video`, `copy`,
`resize` (`:59-60`). Allowed services: `static`, `ugc-video`, `product-video`, `copy`,
`resize` (`:61-62`).
**This table is empty. That is the number one blocker.**

**`brand_kits`** — a partner's colours, fonts, voice and products. `045:86`. Read-only on
this page (`creative-factory.html:575`). Never used when generating (see gap 2).

**`partner_module_settings`** — the switches per partner.

| Column | What it means | Where |
|---|---|---|
| `marketing_suite_enabled` | is this partner allowed to generate at all | `172_wl_marketing.sql:8` |
| `ai_token_cap_monthly` | how much writing a month, default 250,000 | `172_wl_marketing.sql:11` |
| `max_concurrent_jobs` | how many jobs at once, default 3 | `046_ad_platforms.sql:658` |
| `approve_before_launch` | must a human say yes, default yes | `046_ad_platforms.sql:647` |

**`partner_ai_usage`** — the running total of writing used this month
(`src/brand/meter.mjs:58-66`).

**`compliance_screenings`** — a record of every check, kept as evidence
(`generate.mjs:278`).

**`partner_brand`** and **`campaigns`** — two other things that show up in the same
Review queue (`api/creative/approvals.mjs:49-71`).

**`analytics_connections`** and **`video_watch_stats`** — the YouTube panel at the bottom
(`db/migrations/302_analytics_connections.sql`, read by `api/read/video-stats.mjs`).

---

## The screens

**Page:** `/app/creative-factory.html`. One partner at a time.

**Order down the page** (this is the order it renders, `:380-682`): five headline
numbers → Partner scope → Monthly writing allowance → **Generate and decide** →
Generation jobs → Creative library → Review queue → Brand kits → Video performance →
Reference (closed).

**The one thing Chris will do, in six clicks:**

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
which service writes copy. Chris sees "Tried 1 job: 0 worked, 1 did not. No ad-making
service is switched on for this account" (`api/creative/run.mjs:24`, shown at `:2596`).

---

## What breaks the UI-STANDARDS rules

`docs/UI-STANDARDS.md` is law for anything under `public/app/`. Six real breaks.

1. **§5 — "Every visible control works. No buttons wired to nothing."**
   `creative-factory.html:1471` builds five `<button type="button">` tiles inside the
   job-state legend. `:130-131` gives them a pointer cursor and a hover colour. No click
   handler exists for them anywhere in the file. The page's own author knew the rule —
   `:1262-1263` says "Plain tiles, not buttons: … §5 does not allow a control that does
   nothing" — and then the legend twelve lines earlier does exactly that.

2. **§1 — "One primary action per screen. Exactly one filled/prominent button."**
   Three filled dark buttons: **Enqueue generation** (`:464`), **Connect** for YouTube
   (`:610`), **Approve this brand** (`:1821`). Two of those three are on the page at the
   same time for any owner sign-in.

3. **§12.7 — the type trap.** `fundhub-brand.css:184-186` forces every element inside
   the shell to inherit its parent's text size unless its class is on a short list.
   This screen writes about twenty of its own text sizes on classes that are **not** on
   that list, so the browser throws them away. The visible result:
   - `.attn button .an` (`:132`) asks for the big 32px number on the five legend tiles.
     `.an` is not on the list, so those counts render at ordinary body size. §3 says
     "numbers are the heroes"; here they are not.
   - `.kit .kn` (`:211`) asks for the title size on a brand-kit name. Not on the list —
     renders at body size.
   - `.dw-sec>h3` (`:236`) asks for the small caps label size on the side-panel section
     headings. §12.7 names this exact case: "an `h3` is not on the title whitelist".
   - Same for `.ameta .an` (`:198`), `.ameta .ak` (`:199`), `.flag` (`:201`),
     `.tile .fmt` (`:193`), `.tile .dur` (`:194`), `.tile.none .np` (`:196`),
     `.kit .kk` (`:214`), `.kv .k` (`:238`), `.rz .rzq` (`:177`), `.rz .rzd` (`:178`),
     `.copy-snippet` (`:246`), `.rail button` (`:115`), `.rail .rl` (`:120`),
     `.pager` (`:167`), `.foot` (`:99`), `.topbar .crumb` (`:47`),
     `.unwired .uh` (`:219`), `.unwired .ub` (`:220`), `.attn button .ad` (`:134`).
   §12.7 allows exactly one rule with `!important` to fix this. The screen has none.

4. **§2 — "8px spacing scale only: 8 / 16 / 24 / 32 / 48 / 64. No 10px, no 14px, no
   eyeballing."** Broken all over the top of the file: `.topbar{gap:14px}` (`:45`),
   `.content{padding:22px 24px 40px}` (`:55`), `.card+.card{margin-top:14px}` (`:58`),
   `.card-hd{padding:13px 16px 12px}` (`:59`), `.stats{gap:12px}` (`:93`),
   `.stat{padding:14px 16px}` (`:94`), `.pager{padding:11px 16px}` (`:167`).

5. **§7 — "Every metric has a comparison."** The five headline tiles (`:1252-1261`) show
   a number and a breakdown of that same number ("2 running · 3 queued"). None of them
   compares to yesterday, to last week, or to a target.

6. **§6 — "NEVER fake sample data presented as real."** Four reference tables are typed
   into the page by hand and rendered as if they described the running system: the 29
   block reasons (`:780`), the AI-label rules (`:879`), the engine settings (`:893`), the
   rates (`:920`). The engine-settings table states row counts — `rows_set: 3` (`:895`),
   `rows_set: 0` (`:898`) — that nothing looked up. There is an honest warning at
   `:668-669`, which is why this is last on the list rather than first, but a table of
   numbers with a disclaimer above it is still a table of numbers.

**Not a break, but wrong on the page:** the comment at `:49-54` says "max-width:1280px on
`.fh-maxw` still caps it". That has not been true since 2026-08-27 —
`public/app/fundhub-brand.css:164` reads `.fh-maxw{max-width:none;margin-inline:0;width:100%}`.
The layout is correct and fluid, as §1 requires. Only the comment is stale.

---

## Definition of done

Tick every line. Nothing here asks for picture or video generation — commit `48b886e6`
took that off the list.

1. [ ] A row exists in `creative_providers` for `asset_kind = 'copy'` with
       `provider_key = 'copy'` and `active = true`, applied by a migration or a seed
       file, not by hand in a console. Proof: `POST /api/creative/generate` answers
       `provider_ready: true`.
2. [ ] `ANTHROPIC_API_KEY` is set in Netlify for production. Proof: a job for kind
       `copy` moves from `queued` to `succeeded` and a row appears in
       `creative_assets` with words in `copy_text`.
3. [ ] The two-minute clock is proven alive on the live site: a job left alone for
       four minutes changes state on its own, with no button pressed.
4. [ ] The generate form sends a brand kit, and the writer receives it. Proof: the
       words that come back use the tone written in that kit
       (`brand_kits.voice_profile.tone`), and the new creative's `brand_kit_id` is not
       empty in the library card.
5. [ ] The writer reads Chris's own rules. `docs/ads/RULES.md`, `docs/ads/VOICE.md` and
       `docs/ads/CONTROLS.md` feed the instructions the model gets, replacing the eleven
       hard-typed lines at `providers/copy.mjs:89-112`. Proof: change one line in
       `VOICE.md`, regenerate, and the output moves.
6. [ ] The form lets Chris ask for more than one at a time — a "how many" field that
       reaches `spec.variants`. Proof: asking for four gives four separate cards with
       four different angles.
7. [ ] The five dead tiles at `creative-factory.html:1471` either do something when
       clicked, or stop being buttons. §5.
8. [ ] The screen carries **one** `!important` text-size rule with the reason written
       above it, so its own sizes actually paint. §12.7. Proof: the five job-state counts
       measure 32px in a browser, not 16px.
9. [ ] Only one filled dark button is visible at a time. §1.
10. [ ] Every spacing number in the screen's own `<style>` is 8, 16, 24, 32, 48 or 64.
        §2.
11. [ ] The four hand-typed reference tables either read the running system or stop
        stating counts. §6.
12. [ ] `docs/journeys/creative-factory-intended.md` and
        `docs/journeys/creative-factory-actual.md` both exist, and one line is appended
        to `docs/journeys/CHANGELOG.md`. CLAUDE.md §4.
13. [ ] `npm run lint` and `npx tsc --noEmit` pass. The test suite is green against a
        real `DATABASE_URL`, with no test skipped, deleted or weakened. CLAUDE.md §6.
14. [ ] `src/http/routes.test.mjs` still passes, and every new endpoint (if any) is in
        the list at `netlify/functions/api.mjs:278`.
15. [ ] A human — Chris — opens the page, does the eight steps in **The screens** above,
        and reads a finished ad on screen without asking an agent for anything.

---

## UNKNOWN — blocked or unverifiable

| # | What | Why it is UNKNOWN |
|---|---|---|
| 1 | Is `ANTHROPIC_API_KEY` set on the live site? | I did not read the local `.env` and cannot reach Netlify from here. Without it `copy.mjs:26-28` throws before anything is written. |
| 2 | Is the two-minute clock actually running on the live site right now? | `netlify.toml:141-142` and `creative-job-runner.mjs:7` agree, and `runner-cron.test.mjs` guards that. But the 2026-09-06 bundling failure (`netlify.toml:104-116`) killed every scheduled job silently, and I cannot invoke one from a code read. Commit `c36eb77e` claims the fix. Unproven here. |
| 3 | Is `marketing_suite_enabled` true for any partner today? | It lives in `partner_module_settings` (`172_wl_marketing.sql:8`) and defaults to **false**. Until it is true for Fundhub's own partner row, every write button on the page stays greyed out (`creative-factory.html:1063-1065`). I cannot read the database. |
| 4 | Does a `partners` row for Fundhub itself exist? | The whole page is partner-scoped and shows nothing without one (`:2285-2295`). Not checkable from code. |
| 5 | YouTube: client id, client secret, refresh token | Blocked on Chris. The Connect form (`:601-610`) and Sync now (`:587`) are wired and reachable, and cannot work until he supplies these. |
| 6 | Microsoft Clarity project ID | Blocked on Chris. Nothing on this page uses it. |
| 7 | Meta ad account connection | Blocked on Chris. No `ad_platform_connections` row. Not on this page's path, but it is what an approved creative would eventually flow to. |
| 8 | ClickFunnels: is a "conversion" an opt-in or a sale? | Blocked on Chris. `src/analytics/clickfunnels.mjs:255` counts opt-ins. Not this page's panel — recorded because it changes what "done" means next door. |
| 9 | May `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected? | Blocked on Chris. Untouched. |
| 10 | Does the page fit above the fold on a 13" laptop (900px)? | §1 says the screen's job must be doable without scrolling. **Generate and decide** is the fourth block down (`:428`), below the five tiles (`:383`), Partner scope (`:386`) and Monthly allowance (`:409`). It looks likely to fall below the fold, but I was told not to open a browser, so I did not measure it. |
| 11 | The exact number of dead text-size rules | I listed twenty-one by hand against the whitelist at `fundhub-brand.css:187-204`. A browser would settle it exactly. Not opened. |
| 12 | Whether any live `creative_assets` row has words in `copy_text` | Migration 301 exists on `main`, but §11 of CLAUDE.md says a migration is not live until the branch is merged **and** the production deploy runs it. `e2e/live-creative-factory-marketing-menu.spec.mjs:4-6` says as of that test being written it "has not been applied anywhere in production yet". Whether it has landed since is not readable from here. |
