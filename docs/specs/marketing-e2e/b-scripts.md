# Lane B — Ad script generation

**Batch:** `marketing-e2e` · **Phase 1 of 3** — spec only, no app code changed.
**Written:** 2026-09-08, on `main` at `fe864840`. Read-only pass.

Every claim below points at a file and a line. Where a thing could not be checked from
this machine it says **UNKNOWN** instead of guessing.

---

## What Chris gets when this is done

Chris opens the Creative Factory page he already has. He picks an angle from a list of
48 that are already written down. He presses one button. A finished ad script comes
back, in the shoot format, already passed through the word checker. Nobody has to be in
a chat window for it to happen.

---

## What exists today

### 1. A written-down rulebook. It is real and it is good.

| File | What it holds | Proof |
|---|---|---|
| `docs/ads/RULES.md` | The SOP. 603 lines. Hard no's, word counts, hook test, three ad shapes | `docs/ads/RULES.md:29`, `:197`, `:304`, `:553` |
| `docs/ads/rules-data.mjs` | The same rules as a list a program can read | `docs/ads/rules-data.mjs:29-193` |
| `docs/ads/VOICE.md` | Before/after line pairs, so a writer can match how Chris talks | `docs/ads/VOICE.md:1-40` |
| `docs/ads/CONTROLS.md` | The filmed, running ads. Locked. Never rewritten | `docs/ads/CONTROLS.md:1` (`# LIVE — DO NOT EDIT`) |
| `docs/ads/CONCEPTS.md` | 48 hooks to pick from, written as prose | `docs/ads/CONCEPTS.md:1` |
| `docs/ads/build/concepts.data.json` | **The same 48 hooks as data a program can read** | array of 48, fields `n, title, hook, angle, who, gate, door, enemy, mech, shape, aware, run, bet, rec` |
| `docs/ads/ANGLE-GENERATOR.md` | The recipe: one enemy × one mechanism × one audience | `docs/ads/ANGLE-GENERATOR.md:11-16` |
| `docs/ads/ASSET-BANK.md` | The offer, prices, mechanisms, the two proof points | `docs/ads/ASSET-BANK.md:1-5` |
| `docs/ads/registry.json` | 24 ad numbers and what each one was filed under | `docs/ads/registry.json:19-49` |
| `docs/ads/NEXT.md` | What Chris asked for next: 10 wide-net ads | `docs/ads/NEXT.md:11-38` |
| `docs/ads/POST-BOOKING-15.md` | Ads for people who already booked a call | `docs/ads/POST-BOOKING-15.md:6` |
| `docs/ads/sms-copy-2026-09.md` | Text-message wording. Held, not live | `docs/ads/sms-copy-2026-09.md:5-7` |
| `docs/ads/ascension-ads.md` | Ads for the $10,000 white-label offer. Different funnel | `docs/ads/ascension-ads.md:1-3` |
| `docs/ads/apify-scrape-pipeline.md` | Competitor-ad scraping. Deferred by decision | `docs/ads/apify-scrape-pipeline.md:3` |
| `docs/ads/README.md` | The index and the workflow picture | `docs/ads/README.md:1-40` |

**`docs/ads/build/` holds four files:** `README.md`, `build-sheet.py`, `concepts.data.json`
(57 KB, the 48 concepts as data), `concepts.html` (74 KB, a published page).

**`docs/ads/scripts/` holds one file: `README.md`.** No script has ever been saved there.
The README says the scripts "live in the Claude chat outputs … until Chris drops them
here" (`docs/ads/scripts/README.md:1`). Those chat files are gone and are not wanted.

### 2. A checker that works

`scripts/ads/check-script.mjs`, 576 lines. It reads its rules from one place,
`docs/ads/rules-data.mjs` (`scripts/ads/check-script.mjs:41-46`). It has 16 tests at
`scripts/ads/check-script.test.mjs`, and those tests DO run inside `npm test`, because
the suite walks `scripts/` (`scripts/run-suite.mjs:50`).

### 3. A written instruction sheet for an agent

`.cursor/skills/fundhub-ad-writer/SKILL.md`, 130 lines. It tells an agent what to read
(`:51-72`), what shape to write in (`:76-88`), to run the checker (`:92`), and where to
save (`:111`).

### 4. A back-end plan already agreed

`docs/journeys/ad-script-flow.md` — the states a script passes through, all of them
already in the database (`:16-20`), and the one column that was needed, `copy_text`,
which shipped in `db/migrations/301_creative_copy_text.sql:67`.

### 5. A screen that can already ask for written copy

`public/app/creative-factory.html` is in the Marketing menu today (`public/app/shell.js:25`).
Its form has four boxes: kind, what is being sold, a free-text prompt, and a batch name
(`public/app/creative-factory.html:2504-2507`). Press the button and it posts to
`/api/creative/generate` (`:2517-2535`). That route exists
(`netlify/functions/api.mjs:747`). A cron picks the job up every two minutes
(`netlify.toml:141-142`). The words that come back are saved and shown
(`public/app/creative-factory.html:1545-1546`, `:2063-2064`).

---

## Answers to the seven questions

### 1. How a script gets written today, step by step

There are **two** paths and they share nothing.

**Path A — the chat path. This is the one that has actually produced ads.**

| Step | Who does it | Proof |
|---|---|---|
| 1. Chris opens a chat session and asks for scripts | **Chris. A human.** | `.cursor/skills/fundhub-ad-writer/SKILL.md:4-8` |
| 2. The agent opens six files and reads them | **An agent.** | `SKILL.md:51-72` |
| 3. The agent asks Chris which of the three shapes he wants | **Chris answers.** | `SKILL.md:76` — "Ask Chris which one he wants" |
| 4. The agent writes the script in the locked format | An agent | `docs/ads/RULES.md:335-348` |
| 5. The agent **remembers** to run the checker | **An agent, from memory** | `SKILL.md:92` |
| 6. The agent fixes what the checker names, runs it again | An agent | `SKILL.md:94-96` |
| 7. The agent saves to `docs/ads/scripts/<date>.md` | An agent | `SKILL.md:111-112` |
| 8. Chris reads it and judges voice, mechanism and proof | **Chris. A human. Cannot be automated** | `docs/ads/RULES.md:581-602` |
| 9. Chris rewrites a line; the agent adds the pair to VOICE.md | Both | `SKILL.md:114-119` |

**A human is required in the loop at steps 1, 3, 8 and 9. An agent is required at every
other step.** There is no path that runs without both.

**Path B — the screen path. It exists, and it does not know the rules.**

Chris fills in the Creative Factory form and presses the button
(`public/app/creative-factory.html:2504-2535`). The job is saved. Two minutes later the
cron runs it (`netlify.toml:141-142`) and it lands in `src/creative/providers/copy.mjs`.

That file writes ad copy from **four hardcoded sentences** (`src/creative/providers/copy.mjs:92-97`)
and four generic angle names (`:117-119`). It has never heard of the FundHub rules.
Proof: search every application folder for the rule files and nothing comes back —
nothing under `src/`, `api/` or `public/` reads `RULES.md`, `VOICE.md`, `CONTROLS.md`
or `rules-data.mjs`. The only files that mention them are the checker, the checker's
test, and documentation.

It also does not produce the shoot format. It splits its answer on a line of three
dashes (`src/creative/providers/copy.mjs:127-132`). It never writes `HOOK`, `BODY`,
`CTA`, `CLOSE`, `RUNTIME` or `TAG`, so the checker's main reading mode could not even
find the parts.

**So: the screen path produces text nobody would film, and the chat path produces
scripts a person had to sit and drive.**

### 2. What the checker actually blocks

Read out of the code, not the doc. Each family, with its line.

| # | What it stops | Where the test lives | Where the list lives |
|---|---|---|---|
| 1 | **34 banned words**, in any form — "optimize", "optimized", "optimizing" all count | `check-script.mjs:190-199` | `rules-data.mjs:29-36` |
| 2 | **20 banned phrases**, also in any form — "moved the needle" is caught by "move the needle" | `check-script.mjs:201-209` | `rules-data.mjs:38-45` |
| 3 | **8 worn-out phrases** the market has ruined | `check-script.mjs:210-221` | `rules-data.mjs:61-70` |
| 4 | 13 phrases that are **explicitly safe** and may never be flagged | guard at `check-script.mjs:211` | `rules-data.mjs:75-81` |
| 5 | **11 banned openers** — the hook may not start this way | `check-script.mjs:225-232` | `rules-data.mjs:47-52` |
| 6 | **Em dashes** and " -- ". Nobody says one out loud | `check-script.mjs:234-242` | — |
| 7 | The **"it's not X, it's Y"** shape. A robot tell | `check-script.mjs:244-259` | — |
| 8 | **19 never-say lines**, two of them a shape rather than a quote (a dollar amount a bank *will* give; a bad item that *will* come off) | `check-script.mjs:281-300` | `rules-data.mjs:97-125` |
| 9 | **15 vendor names.** Never the tech by name | `check-script.mjs:302-309` | `rules-data.mjs:189-193` |
| 10 | **Hook rules.** First sentence may not be a question; first sentence may not ask for anything | `check-script.mjs:316-338` | — |
| 11 | **The close must carry two promises** — no hard pull, and nothing moves without their say-so. Wording may vary | `check-script.mjs:340-347` | `rules-data.mjs:157-160` |
| 12 | **Evergreen only: nothing that expires** — a year, a month, a season, "right now", "limited spots", a growing dollar figure. Only runs when the script says `TYPE evergreen` | `check-script.mjs:355-378`, switched on at `:460` | — |
| 13 | **Too short.** 135 words is the floor, always, no exceptions | `check-script.mjs:380-385` | `rules-data.mjs:181` |
| 14 | **Wrong length for the stated runtime** — four bands, 60-90s / 90-120s / 2min+ / VSL | `check-script.mjs:386-399` | `rules-data.mjs:172-177` |
| 15 | **No HOOK section at all** | `check-script.mjs:436-438` | — |
| 16 | **No TAG, or a TAG that is not a real slug** like `denial_angle` | `check-script.mjs:451-457` | — |

**It reads two shapes of file.** The labelled shoot format, and plain paragraphs, which
is how `CONTROLS.md` is actually written (`check-script.mjs:56-68`). For plain
paragraphs it does not enforce a length ceiling, because no runtime was stated
(`check-script.mjs:386`).

**What it deliberately does NOT do:** it never runs the twelve rules that decide whether
an ad may run. Those need a live database and happen later, inside
`src/creative/generate.mjs` (`check-script.mjs:19-26`). And it cannot judge whether a
script sounds like Chris (`docs/ads/RULES.md:581-602`).

### 3. Does the checker run on its own? **No.**

**Proof, three ways:**

1. **It is not in the build.** Searching the whole repository for `check-script` returns
   hits in exactly three kinds of place: `package.json:17` (a command a person types),
   `.cursor/skills/fundhub-ad-writer/SKILL.md:92` (an instruction to an agent), and
   documentation. No file under `src/`, `api/` or `netlify/` calls it.
2. **It is not in CI.** `.github/workflows/tests.yml` has no step that mentions ads or
   the checker (searched; no match). `scripts/lint.mjs` has none either.
3. **It is not in the generate path.** `src/creative/generate.mjs` never imports it, so
   the screen path writes copy that has never been checked.

What DOES run on its own is the checker's own test file
(`scripts/ads/check-script.test.mjs`), inside `npm test`. But that test only proves the
checker is not broken. It pins five named blocks in `CONTROLS.md` (`:42-48`) and asserts
they pass clean (`:50-65`).

**A thing worth Chris knowing, measured today:** running the checker by hand on the
locked file right now —

```
node scripts/ads/check-script.mjs docs/ads/CONTROLS.md
```

— reports **8 scripts checked, 3 need work**, and exits 1. The three are
"Script 7 — Insider Access", "Script 8 — Stop Before You Apply Again" and
"Script 9 — Why I Built This" (`docs/ads/CONTROLS.md:236`, `:268`, `:299`). All three are
under the 135-word floor and none has the two-promise close. The test does not cover
them, because the test's list names only Ad 1-4 and the Founder VSL. Whether those three
are ads Chris is actually running is **UNKNOWN** — the file's own header says everything
in it is running (`docs/ads/CONTROLS.md:2`).

### 4. `rules-data.mjs` vs `RULES.md` — in sync? Which wins?

**`rules-data.mjs` wins.** It is the only thing the checker reads
(`scripts/ads/check-script.mjs:41-46`). `RULES.md` is the page a person reads and it
carries no force of its own (`docs/ads/rules-data.mjs:3-5`).

**Are they in sync today? Yes, checked by hand.** `RULES.md:76-102` lists 34 words, 20
phrases and 11 openers, and `rules-data.mjs:29-52` holds 34, 20 and 11. The
avoid-list at `RULES.md:105-124` has nine bullets against eight machine entries
(`rules-data.mjs:61-70`); the ninth bullet — "anything that hints several companies will
phone them" — is a judgement, not a phrase, so it has no machine version by design.

**Is there a test that fails when they drift? No, and this is the gap.**

- There **is** a drift test, but it points somewhere else. It compares
  `rules-data.mjs`'s banned words against `.claude/workflows/copy.js`
  (`scripts/ads/check-script.test.mjs:151-154`) — a different system, the `/flywheel`
  copy tool.
- That test only runs one way: it fails if a word is in `rules-data.mjs` and missing
  from `copy.js`. A word added to `copy.js` alone would pass silently.
- It also pins the three counts at 34 / 20 / 11 (`:146-148`), so adding a rule to
  `rules-data.mjs` fails the test until someone updates the number. That is a speed bump,
  not a sync check.
- **Nothing anywhere compares `rules-data.mjs` to `RULES.md`.** If someone edits the word
  list in the prose file and not in the data file, the checker keeps enforcing the old
  list and every test stays green. `rules-data.mjs:10-13` says to change the data file
  first and then the prose by hand. That is a habit, not a guard.

### 5. `registry.json` — what is in it, and how a row gets made

**24 ads.** 3 have a title (`16: phase`, `26: underwriter`, `42: ringlights`), 21 do not.
Per Chris's own rule, an untitled ad is not a defect — the number is the identity.

**The fields, in plain words:**

| Field | What it means | Where |
|---|---|---|
| `version`, `updated` | which shape the file is in, and when it last changed | `registry.json:2-3` |
| `source` | a written note saying where these came from and what was missing | `:4` |
| `vocabulary` | the only allowed values for lane, gate, entry, offer and variant | `:5-11` |
| `rules` | the default settings for each of the five lanes | `:12-18` |
| `ads[].id` | **the ad number.** This is the identity. It is the leading digits of `utm_content` | `:20`; the database does the same at `db/migrations/286_client_ad_attribution.sql` |
| `ads[].title` | a nickname. Optional. `null` for 21 of 24 | `:23` and on |
| `ads[].lane` | which of five buckets the ad was filed under | `:6` |
| `ads[].gate` | the credit score door: 600, 720, 780, or none | `:7` |
| `ads[].entry` | does it go straight to the offer, or to the sorting call | `:8` |
| `ads[].primary_offer` / `secondary_offers` | what the ad is selling, and what else may be offered | `:9` |
| `ads[].variants` | which shoot version: `sun`, `nosun`, `sedona` | `:10` |
| `ads[].group` | an optional batch name, e.g. `slam`, `sedona`, `objection` | `:29`, `:41`, `:47` |

**How a script becomes a registry row: it does not.** Nothing writes this file. It is
typed by hand. Proof: searching `src/`, `api/`, `scripts/` and `public/` for
`registry.json` returns only readers and one checker — `src/ads/registry.mjs:22`,
`api/read/ad-books.mjs:6`, `public/app/closer-dashboard.html:562`,
`public/app/campaign-manager.html:373`, and `scripts/ads/check-registry-titles.mjs`.
There is no writer anywhere.

An unknown number falls back to the widest door — gate none, entry sorting — and is
logged once (`src/ads/registry.mjs:32-42`). So a missing row is safe, not broken.

`scripts/ads/check-registry-titles.mjs` exists but **has no npm command and no CI step**
(searched `package.json` and `.github/workflows/tests.yml`; no match). Somebody has to
remember to run it, and per Chris's rule there is no reason to.

### 6. What is missing so Chris can open a screen and get a finished script

Named precisely. Every one of these does not exist today.

**a. There is no list of angles a program can serve.** The 48 concepts exist as data at
`docs/ads/build/concepts.data.json` with every field a picker needs (`hook`, `angle`,
`who`, `gate`, `door`, `enemy`, `mech`, `shape`, `aware`, `run`, `rec`). Nothing under
`src/`, `api/` or `public/` reads that file. **Missing endpoint: `GET /api/ads/angles`.**
There is no `ads/*` route in the route map at all — the map has `read/ad-books`
(`netlify/functions/api.mjs:581`) and the seven `creative/*` routes (`:747-753`), and
nothing else touching ads.

**b. There is no rule loader in the application.** The rules are in the repository as
documents, and the app cannot see them. **Missing file: `src/ads/rule-pack.mjs`** — one
small piece of code whose only job is to hand back the rules and the voice examples as
plain text. Today `docs/ads/rules-data.mjs` is importable (the checker imports it at
`scripts/ads/check-script.mjs:41-46`), but `RULES.md`, `VOICE.md` and `CONTROLS.md` are
read by nothing.

**c. The generator does not know the format.** `src/creative/providers/copy.mjs:89-125`
builds a prompt from four hardcoded sentences and generic angle names. It does not know
about `HOOK`, `BODY`, `CTA`, `CLOSE`, `RUNTIME`, `SHOOT`, `TAG`, `TYPE`
(`docs/ads/RULES.md:335-348`), the word bands (`rules-data.mjs:172-177`), the two close
promises (`rules-data.mjs:157-160`), or the 48 angles. **Missing: an ad-script mode in
that provider that is handed the rule text and the chosen angle.**

**d. The checker is never called by the server.** `scripts/ads/check-script.mjs` already
exports `checkOneScript` (`:406`), so it can be imported and used — the hard part is
done. But `src/creative/generate.mjs` does not import it, so nothing checks a generated
script before it is saved. **Missing: a check-then-retry step inside the job runner**, so
a script that fails is rewritten by the machine and not by Chris.

**e. The screen has no ad-script panel.** `public/app/creative-factory.html:2504-2507`
collects four things: kind, offer, free-text prompt, batch name. There is no angle
picker, no ad-type picker (cold / VSL / evergreen), no lane picker, no runtime picker.
**Missing: a panel on that page.** Not a new page and not a new menu row — the standing
rule forbids both (`.cursor/skills/fundhub-ad-writer/SKILL.md:38`) and Creative Factory
is already in the Marketing menu (`public/app/shell.js:25`).

**f. The request cannot carry an angle.** `POST /api/creative/generate` demands
`idempotency_key` and `offer_type` (`api/creative/generate.mjs:88-119`) and passes
`body.spec` straight through (`:139-146`). The copy provider does read `spec.angles`
(`src/creative/providers/copy.mjs:117`), so there is a hook to hang this on — but nothing
sets it and there is no field for an angle number, an ad type, a lane, or a runtime band.

**g. No ad-making service is switched on.** Searching every migration and seed file for
an insert into `creative_providers` returns nothing. With no row, the endpoint's own
readiness check says so in plain words: "no ad-making service is switched on for this
account" (`api/creative/generate.mjs:57-59`). Whether one exists in the live database is
**UNKNOWN** — not checkable from here.

**h. The model key.** `src/creative/providers/copy.mjs:26-28` refuses to run without
`ANTHROPIC_API_KEY`. Whether it is set on the live site is **UNKNOWN** — the Netlify API
is blocked from this environment (`CLAUDE.md` §11, Egress).

### 7. "The rule loader is swappable, the generator is not" — in plain words

Think of it as a cook and a recipe card.

**The cook is the generator.** It knows how to make an ad: hook first, then the body,
then the ask, then the close with its two promises. That never changes.

**The recipe card is the loader.** It is the piece that fetches today's rules and hands
them to the cook. The cook never goes looking for the card itself.

**Today the card is two files on disk** — `docs/ads/RULES.md` and `docs/ads/VOICE.md`
(`.cursor/skills/fundhub-ad-writer/SKILL.md:40-49`). `VOICE.md` says the same thing in
its own words: "A small loader piece of code hands the generator the text inside this
file. Today that loader reads this one markdown file. Later it might read a row out of a
database instead" (`docs/ads/VOICE.md:9-15`).

**Later the card is a row in the `brand_kits` table.** That table already exists
(`db/migrations/045_creative_factory.sql:86-113`). One row per customer, and it already
has a `voice_profile` column holding free-form data (`:103`). That is where another
company's rules and voice would live. The cook does not change. The card does.

**Why it matters to Chris:** the tool that writes his own ads tonight and the feature he
could sell to a partner later are the same build. Nobody has to write it twice.

**What would have to change to make the seam real.** Right now the seam is a good idea in
two documents and nothing else — no code in the app reads any rule file.

1. **Write the loader.** One small file, `src/ads/rule-pack.mjs`, with one job: given a
   brand, return the rules text, the voice examples, the locked format, and the safe and
   banned lists.
2. **Give it two ways to fetch.** From the repository files (what Chris uses), or from a
   `brand_kits` row (what a partner would use). Same answer shape either way.
3. **Make the copy provider ask the loader instead of using its own four sentences**
   (`src/creative/providers/copy.mjs:89-112`).
4. **Make the checker take its lists from the loader too**, not only from
   `docs/ads/rules-data.mjs` (`scripts/ads/check-script.mjs:41-46`). Otherwise a partner's
   ad would be written to their rules and then checked against Chris's.
5. **Decide where a partner's banned words are stored.** `brand_kits.voice_profile` is
   free-form, so the shape has to be pinned down and guarded. That decision has not been
   made. **UNKNOWN.**

---

## What is missing — worst first

1. **Nothing writes a script without a person driving it.** Both paths need someone. The
   chat path needs Chris and an agent (`SKILL.md:76`, `:92`). The screen path can run
   alone but produces copy that has never seen the rules
   (`src/creative/providers/copy.mjs:89-125`).
2. **The checker never runs by itself.** Not in CI, not in lint, not in the generate path.
   Somebody has to remember. Proof in answer 3 above.
3. **The application cannot read the rules at all.** No file under `src/`, `api/` or
   `public/` opens `RULES.md`, `VOICE.md`, `CONTROLS.md` or `rules-data.mjs`.
4. **No angle endpoint and no angle picker.** The 48 concepts sit in
   `docs/ads/build/concepts.data.json` and no code reads them.
5. **The generated copy is not in the shoot format.** Split on three dashes
   (`src/creative/providers/copy.mjs:127-132`), so the checker's main mode cannot even
   parse it.
6. **No test catches the prose rules drifting from the machine rules.** Answer 4 above.
7. **Zero scripts have ever been saved.** `docs/ads/scripts/` holds only a README.
8. **Three blocks in the locked control file fail the checker today** and no test covers
   them (answer 3 above).
9. **Two files the README tells you to read do not exist:** `docs/ads/20-ads.md` and
   `docs/ads/SHOOT-PLAN.md` are both listed at `docs/ads/README.md:10-15` and neither is
   on disk.
10. **No ad-making service row and possibly no model key.** Points (g) and (h) above,
    both **UNKNOWN** from here.
11. **The registry is typed by hand.** A finished script never becomes a registry row on
    its own, so the link from "the script I wrote" to "the number in the ad account" is a
    person retyping.

---

## The data model

**Nothing new is needed.** Every state already exists, and the one missing column
already shipped. This restates `docs/journeys/ad-script-flow.md:12-24` and is grounded in
the migrations.

| Table | Column | Plain-word meaning | Where |
|---|---|---|---|
| `generation_jobs` | `status` | Where the writing job is up to: `queued`, `running`, `succeeded`, `failed` | `db/migrations/045_creative_factory.sql:312` |
| `generation_jobs` | `spec` | What was asked for. Free-form. **This is where an angle number, an ad type and a runtime band would go** | passed through at `api/creative/generate.mjs:139-146` |
| `generation_jobs` | `idempotency_key` | The batch name. Stops a double press double-billing | `api/creative/generate.mjs:88-95` |
| `creative_assets` | `kind` | `static` (a picture), `video`, or `copy` (words). A script is `copy` | `docs/journeys/ad-script-flow.md:22-23` |
| `creative_assets` | `copy_text` | **The words of the ad.** Empty for pictures and videos. Saved even when blocked, because a blocked script is the one Chris has to rewrite | `db/migrations/301_creative_copy_text.sql:67`, `:80-81` |
| `creative_assets` | `compliance_state` | `pending`, `passed`, `blocked`, `approved`. Only a person sets `approved` | `db/migrations/045_creative_factory.sql:201` |
| `creative_assets` | `blocked_reasons` | Why it was stopped, in the engine's own words | read at `api/creative/approvals.mjs:16-19` |
| `ads` | `asset_id` | Points from a live ad back at the script it came from. **This is how "was it filmed" is answered without anyone ticking a box** | `db/migrations/046_ad_platforms.sql:291` |
| `ads` | `approval_state` | `draft`, `awaiting_approval`, `approved`, `live`, `paused`, `archived` | `db/migrations/046_ad_platforms.sql:311` |
| `brand_kits` | `voice_profile` | Free-form settings for one brand's voice. **The future home of the swappable rule pack** | `db/migrations/045_creative_factory.sql:103` |
| `client_ad_attribution` | (the whole table) | Joins an ad number to a booked call | `db/migrations/286_client_ad_attribution.sql` |

**One thing that is a file and not a table:** `docs/ads/registry.json`. It maps an ad
number to its lane, gate, entry and offer. It stays a file. Nothing writes it
(answer 5 above).

---

## The screens

**No new page. No new menu row.** That is a standing rule
(`.cursor/skills/fundhub-ad-writer/SKILL.md:38`). Everything below is a panel on a page
Chris already has, which is already in the Marketing menu (`public/app/shell.js:25`).

### Page: Creative Factory (`public/app/creative-factory.html`)

**New panel: "Write an ad script".**

| What Chris sees | What he does | What happens |
|---|---|---|
| A dropdown of **48 angles**, each showing its hook line and who it is for | Picks one | The angle number is remembered |
| A **type** picker: cold ad, VSL, evergreen | Picks one | Decides which of the three shapes gets written (`docs/ads/RULES.md:304-552`) and whether the no-expiry rule runs (`check-script.mjs:460`) |
| A **runtime** picker: 60-90s, 90-120s, 2min+, VSL | Picks one | Sets the word band (`rules-data.mjs:172-177`) |
| A **lane** picker: the five real values | Picks one | Comes from `docs/ads/registry.json:6` |
| A **how many** box | Types a number | One script per number |
| One button: **Write these** | Presses it | Posts to `/api/creative/generate` with the angle inside `spec` |
| A line of text under the button | Reads it | Says whether it can actually run — the endpoint already answers this honestly (`api/creative/generate.mjs:50-67`) |

**Existing panel: the library.** Already shows the words of a written ad
(`public/app/creative-factory.html:1545-1546`, `:2063-2064`), already shows a blocked one
on purpose (`:2058-2064`). A script would appear here with no change.

**What Chris must still do himself, and always will:** read it, and decide whether it
sounds like him. A machine cannot judge that (`docs/ads/RULES.md:581-602`). When he
rewrites a line, that pair goes into `docs/ads/VOICE.md` (`SKILL.md:114-119`).

### Endpoints

| Endpoint | Exists? | What it would do |
|---|---|---|
| `GET /api/ads/angles` | **No** | Hand the screen the 48 angles from `docs/ads/build/concepts.data.json` |
| `POST /api/creative/generate` | **Yes** (`netlify/functions/api.mjs:747`) | Already takes a free-form `spec`. Needs the angle, type, runtime and lane fields added to what it accepts |
| `GET /api/creative/library` | **Yes** (`:748`) | Already returns `copy_text` (`api/creative/library.mjs:13-17`) |
| `POST /api/creative/run` | **Yes** (`:753`) | The "run queued jobs now" button |

---

## Definition of done

A human can tick these one at a time.

1. `GET /api/ads/angles` returns 48 angles, each with its hook, who it is for, and its
   number, read from `docs/ads/build/concepts.data.json`.
2. That route is in the map in `netlify/functions/api.mjs` — a handler file that is not
   in the map returns "not found" both locally and live (`CLAUDE.md` §12).
3. `src/ads/rule-pack.mjs` exists and hands back, as plain text: the SOP, the voice
   pairs, the locked format, the banned lists, the safe lists, the close promises, and the
   word bands.
4. `src/creative/providers/copy.mjs` builds its instructions from the rule pack, not from
   the four hardcoded sentences at `:92-97`.
5. A generated script comes back in the locked format — `HOOK`, `BODY`, `CTA`, `CLOSE`,
   `RUNTIME`, `WORDS`, `SHOOT`, `TAG`, `TYPE` (`docs/ads/RULES.md:335-348`).
6. The job runner imports `checkOneScript` from `scripts/ads/check-script.mjs:406`, runs
   it on every generated script, and rewrites anything that fails, up to a fixed number of
   tries.
7. A script that still fails after those tries is saved anyway, with the reasons visible,
   so Chris can see what went wrong. Nothing is silently thrown away.
8. `creative_assets.copy_text` holds the words of every script written, blocked or not
   (`db/migrations/301_creative_copy_text.sql:67`).
9. The Creative Factory page has an "Write an ad script" panel with an angle picker, a
   type picker, a runtime picker and a lane picker. **No new page. No new menu row.**
10. Chris picks an angle, presses one button, and reads a finished script on that page,
    with no agent in a chat window at any point.
11. A test proves the whole path: pick angle → generate → check → save → the words come
    back on the library screen.
12. A test fails if the word lists in `docs/ads/RULES.md` and `docs/ads/rules-data.mjs`
    stop matching.
13. `npm run lint` passes.
14. `npx tsc --noEmit` passes.
15. The test suite is green with a real `DATABASE_URL`. No test skipped, deleted or
    weakened.
16. A Playwright check on the new panel.
17. `docs/journeys/ad-script-flow.md` still matches what the code does, and
    `docs/journeys/CHANGELOG.md` has a line for the change.

---

## UNKNOWN — blocked or unverifiable

| # | The thing | Why it is unknown |
|---|---|---|
| 1 | Is `ANTHROPIC_API_KEY` set on the live site? | The copy provider refuses to run without it (`src/creative/providers/copy.mjs:26-28`). The Netlify API is blocked from this environment (`CLAUDE.md` §11, Egress). Not checkable here |
| 2 | Is there a `creative_providers` row in the live database? | No migration or seed file inserts one (searched every `db/migrations/*.sql` and `db/seed`). Without one the endpoint says no service is switched on (`api/creative/generate.mjs:57-59`). Needs a live database read |
| 3 | Are "Script 7", "Script 8" and "Script 9" in `CONTROLS.md` really running ads? | The file header says everything in it is running (`docs/ads/CONTROLS.md:2`), but the test only pins Ad 1-4 and the Founder VSL (`check-script.test.mjs:42-48`). All three fail the checker today. Only Chris can say |
| 4 | Where should a partner's own banned words be stored inside `brand_kits`? | `voice_profile` is free-form (`db/migrations/045_creative_factory.sql:103`). No shape has been decided. Needed before the loader seam is real |
| 5 | Can repair ($1,000) and the trial ($200) be paid in instalments? | Two sources disagree — `src/config/offers.mjs` says yes, the closer objection pack says cash only. Written down as an open question at `docs/ads/NEXT.md:42-44`. Every repair ad is written around it |
| 6 | Where does the click land — the VSL page, or straight to the application? | Open question at `docs/ads/NEXT.md:45-46`. It changes the CTA in every ad |
| 7 | Which live ad wins on cost per booked call? | Open question at `docs/ads/NEXT.md:47`. It decides what to make more of |
| 8 | Do `docs/ads/20-ads.md` and `docs/ads/SHOOT-PLAN.md` still matter? | Both are listed in the reading order at `docs/ads/README.md:10-15` and neither exists on disk |
| 9 | ClickFunnels API key | Blocked on Chris (batch board, `docs/workflows/marketing-e2e.md:266`) |
| 10 | YouTube OAuth client id, client secret, refresh token | Blocked on Chris (`docs/workflows/marketing-e2e.md:267`) |
| 11 | Microsoft Clarity project ID | Blocked on Chris (`docs/workflows/marketing-e2e.md:268`) |
| 12 | Meta ad account connection | No `ad_platform_connections` row exists (`docs/workflows/marketing-e2e.md:269`). Until there is one, a script cannot be traced to spend |
| 13 | **Decision needed:** does ClickFunnels "conversions" mean opt-ins or sales? | The code counts opt-ins at `src/analytics/clickfunnels.mjs:255`. Chris's call |
| 14 | **Decision needed:** may `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected? | It still instructs a Google Workspace setup Chris banned |
