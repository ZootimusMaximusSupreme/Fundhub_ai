# Lane B — Ad script generation

**Batch:** `marketing-e2e` · **Phase 1 of 3** — spec only, no app code changed.
**Written:** 2026-09-08, on `main` at `fe864840`. Read-only pass.
**Corrected:** 2026-09-08 after two reviews. Every number below was measured with a
command on this machine, not typed from memory.

Every claim points at a file and a line. Where a thing could not be checked from this
machine it says **UNKNOWN** instead of guessing.

**Two words used a lot below.** An **endpoint** is a web address the screen calls to
fetch or save something — for example `/api/creative/generate`. A **slug** is a short
lower-case name with underscores instead of spaces, like `denial_angle`.

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
| `docs/ads/RULES.md` | The SOP. **608 lines** (`wc -l`). Hard no's, word counts, hook test, three ad shapes | `docs/ads/RULES.md:29`, `:197`, `:304`, `:553` |
| `docs/ads/rules-data.mjs` | The same rules as a list a program can read | `docs/ads/rules-data.mjs:29-193` |
| `docs/ads/VOICE.md` | Before/after line pairs. **Read the warning in section 1a below — the pairs are half invented** | `docs/ads/VOICE.md:1-15`, and the warning at `:17-24` |
| `docs/ads/CONTROLS.md` | The filmed, running ads. Locked. Never rewritten | `docs/ads/CONTROLS.md:1` (`# LIVE — DO NOT EDIT`) |
| `docs/ads/CONCEPTS.md` | 48 hooks to pick from, written as prose. **A generated file — see 1b** | `docs/ads/CONCEPTS.md:1`; 48 `### ` headings, counted |
| `docs/ads/build/concepts.data.json` | **The same 48 hooks as data a program can read** | An array of 48. Every one of the 48 carries all 14 fields `n, title, hook, angle, who, gate, door, enemy, mech, shape, aware, run, bet, rec` — parsed and counted on this machine, 2026-09-08 |
| `docs/ads/ANGLE-GENERATOR.md` | The recipe: one enemy × one mechanism × one audience | `docs/ads/ANGLE-GENERATOR.md:11-16` |
| `docs/ads/ASSET-BANK.md` | The offer, prices, mechanisms, the two proof points | `docs/ads/ASSET-BANK.md:1-5` |
| `docs/ads/registry.json` | 24 ad numbers and what each one was filed under | `docs/ads/registry.json:19-49` |
| `docs/ads/NEXT.md` | What Chris asked for next: 10 wide-net ads | `docs/ads/NEXT.md:11-38` |
| `docs/ads/POST-BOOKING-15.md` | Ads for people who already booked a call | `docs/ads/POST-BOOKING-15.md:6` |
| `docs/ads/sms-copy-2026-09.md` | Text-message wording. Held, not live | `docs/ads/sms-copy-2026-09.md:5-7` |
| `docs/ads/ascension-ads.md` | Ads for the $10,000 white-label offer. Different funnel | `docs/ads/ascension-ads.md:1-3` |
| `docs/ads/apify-scrape-pipeline.md` | Competitor-ad scraping. Deferred by decision | `docs/ads/apify-scrape-pipeline.md:3` |
| `docs/ads/README.md` | The index and the workflow picture | `docs/ads/README.md:1-40` |

**`docs/ads/scripts/` holds one file: `README.md`.** No script has ever been saved there.
The README says the scripts "live in the Claude chat outputs … until Chris drops them
here" (`docs/ads/scripts/README.md:1`). Those chat files are gone and are not wanted.

### 1a. The voice file is a stub, and it says so itself

This matters more than anything else in the list above, because voice is the one thing
only Chris can judge.

`docs/ads/VOICE.md:17-24` says in its own words that the pairs in it today are **seed
examples**. The "Chris wrote" half of each pair is a real quote lifted out of
`docs/ads/CONTROLS.md`. The "Model wrote" half is **invented for the file** to show what
a generic draft sounds like. Its exact sentence: no agent sat down, wrote a draft, and
watched Chris rewrite it.

**So there are zero real correction pairs.** The rule for adding new ones is written down
and is strict — every pair added from now on must come from Chris's own rewrite of a
real generated draft (`docs/ads/VOICE.md:26-31`). Nothing has ever been added under that
rule, because no generated draft has ever been produced by a screen for Chris to correct.

### 1b. `docs/ads/build/` — four files, and two of them are half broken

| File | State | Proof |
|---|---|---|
| `concepts.data.json` | 57 KB. The 48 concepts as data. Good | verified on disk; 48 items, 14 fields each |
| `concepts.html` | 74 KB. **A published web page at a fixed address** — `https://claude.ai/code/artifact/025023f1-…` | `docs/ads/build/README.md:2-4` |
| `build-sheet.py` | **Cannot run today.** It reads `batch1.json`, `batch2.json` and `batch3.json`, and none of those three files is on disk | `docs/ads/build/build-sheet.py:5`; `ls docs/ads/build/` shows only the four files above |
| `README.md` | Says `build-sheet.py` "regenerates the markdown version at `../CONCEPTS.md`" | `docs/ads/build/README.md:12` |

Two things follow.

**`docs/ads/CONCEPTS.md` is a generated file whose inputs are gone.** Nobody can rebuild
it. Editing it by hand is now the only way to change it.

**Have the two drifted? No — checked, not assumed.** On 2026-09-08 the 48 titles in
`concepts.data.json` were compared against the 48 `### ` headings in `docs/ads/CONCEPTS.md`.
All 48 match, in the same order. The only difference is punctuation: the data file says
`1 Who Takes Them Off` and the page says `1. Who Takes Them Off`. **So a screen serving
angles out of the data file would show Chris exactly what he reads on the page.**

**An angle picker already exists, and it throws the pick away.** `concepts.html` is a
live page where a person picks angles. `docs/ads/build/README.md:14-15` says the picks
are stored in the viewer's own browser and "never reach the repo". So the work in front
of Chris is not "build a picker from nothing" — it is "make the pick land somewhere the
system can see". That is a smaller job.

### 2. A checker that works

`scripts/ads/check-script.mjs`, **575 lines** (`wc -l`). It reads its rules from one
place, `docs/ads/rules-data.mjs` (`scripts/ads/check-script.mjs:41-46`). It has **25
tests** at `scripts/ads/check-script.test.mjs` (`grep -c '^test('`; last one at `:313`),
and those tests DO run inside `npm test`, because the suite walks `scripts/`
(`scripts/run-suite.mjs:50`).

### 3. A written instruction sheet for an agent

`.cursor/skills/fundhub-ad-writer/SKILL.md`, 130 lines. It tells an agent what to read
(`:51-72`), what shape to write in (`:76-88`), to run the checker (`:92`), and where to
save (`:111`).

### 4. A back-end plan already agreed — and one part of it is not true

`docs/journeys/ad-script-flow.md` — the states a script passes through, all of them
already in the database (`:16-20`), and the one column that was needed, `copy_text`,
which shipped in `db/migrations/301_creative_copy_text.sql:67`.

**But that page describes a thing that does not happen.** Its picture sends a failing
script back to be rewritten (`docs/journeys/ad-script-flow.md:34`) and its table says the
checker is what moves a job from `running` to `succeeded` (`:57-58`). **No code does
that.** `src/creative/generate.mjs` never imports the checker (searched; no match). So
anyone reading that page today believes the checking already happens. It does not. Per
`CLAUDE.md` §4 that gap is a finding, written here rather than quietly patched.

### 5. A screen that can already ask for written copy

`public/app/creative-factory.html` is in the Marketing menu today (`public/app/shell.js:25`).
Its form has four boxes: kind, what is being sold, a free-text prompt, and a batch name
(`public/app/creative-factory.html:2504-2507`). Press the button and it posts to
`/api/creative/generate` (`:2517-2535`). That address exists in the route map
(`netlify/functions/api.mjs:747`). A cron picks the job up every two minutes
(`netlify.toml:141-142`). The words that come back are saved and shown
(`public/app/creative-factory.html:1545-1546`, `:2063-2064`).

---

## Answers to the seven questions

### 1. How a script gets written today, step by step

There are **three** paths, and they share nothing but a word list.

**Path A — the chat path. This is the one that has actually produced ads.**

| Step | Who does it | Proof |
|---|---|---|
| 1. Chris opens a chat session and asks for scripts | **Chris. A human.** | `.cursor/skills/fundhub-ad-writer/SKILL.md:4-8` |
| 2. The agent opens six files and reads them | **An agent.** | `SKILL.md:51-72` |
| 3. The agent picks one of the three shapes | Usually the agent | `SKILL.md:76-77` — "Ask Chris which one he wants, **or read it off what he's already asked for**" |
| 4. The agent writes the script in the locked format | An agent | `docs/ads/RULES.md:335-348` |
| 5. The agent **remembers** to run the checker | **An agent, from memory** | `SKILL.md:92` |
| 6. The agent fixes what the checker names, runs it again | An agent | `SKILL.md:94-96` |
| 7. The agent saves to `docs/ads/scripts/<date>.md` | An agent | `SKILL.md:111-112` |
| 8. Chris reads it and makes **six** judgement calls | **Chris. A human. Cannot be automated** | `docs/ads/RULES.md:583-602` — the six are listed in answer 2 below |
| 9. Chris rewrites a line; the agent adds the pair to VOICE.md | Both | `SKILL.md:114-119` |

**A human is required at steps 1, 8 and 9. Step 3 is a soft gate** — the sheet lets the
agent decide the shape from what Chris already said (`SKILL.md:77`), so it does not stop
the work the way steps 1, 8 and 9 do. An agent is required at every other step. There is
no path that runs without both.

**Path B — the screen path. It exists, and it barely knows the rules.**

Chris fills in the Creative Factory form and presses the button
(`public/app/creative-factory.html:2504-2535`). The job is saved. Two minutes later the
cron runs it (`netlify.toml:141-142`) and it lands in `src/creative/providers/copy.mjs`.

That file's instructions to the model are three pieces, and only three:

1. **Six fixed sentences** (`src/creative/providers/copy.mjs:92-97`) — one about who the
   advertiser is, one heading, and four "Never…" rules.
2. **Five more sentences, only for credit repair** (`:99-106`), added when the request
   says `offerType` is `credit_repair`.
3. **One brand-voice line** (`:107-109`), added when the request carries a tone value.

Plus four generic angle names when none are supplied (`:117-119`).

**It has never heard of the FundHub rules.** No file under `src/`, `api/` or `public/`
opens `RULES.md`, `VOICE.md`, `CONTROLS.md` or `rules-data.mjs` (searched all three
folders; no match). One file *names* `RULES.md` in a comment
(`api/creative/generate.mjs:97`) but does not read it, and `RULES.md:599` points back at
`rules-data.mjs` the same way.

It also does not produce the shoot format. It splits its answer on a line of three
dashes (`src/creative/providers/copy.mjs:127-132`). It never writes `HOOK`, `BODY`,
`CTA`, `CLOSE`, `RUNTIME` or `TAG`, so the checker's main reading mode could not even
find the parts.

**Path C — the `/flywheel` copy tool. A third writer nobody counted.**

`.claude/commands/flywheel.md` runs a five-stage marketing sequence — avatar, ad
research, offer, copy, ad strategy — with its own shared board at
`docs/workflows/flywheel-partner.md` (`.claude/commands/flywheel.md:26-30`). Its stage 4
is a **separate ad-writing path** with its own mechanical word scanner at
`.claude/workflows/copy.js:54-70`. That scanner checks banned words, banned phrases,
banned openers, em dashes, the "it's not X, it's Y" shape, and stacked short sentences
(`:59-76`).

**It uses the exact same three word lists as the FundHub checker.** Verified by diff on
2026-09-08 — see answer 4. It is a general ad-and-email writer, not a FundHub ad-script
writer: it knows nothing of the shoot format, the runtime bands, the never-say lines or
the required close.

**So: the screen path produces text nobody would film, the chat path produces scripts a
person had to sit and drive, and a third writer already exists with the right word lists
pointed at the wrong job.**

### 2. What the checker actually blocks

Read out of the code, not the doc. Each family, with its line.

| # | What it stops | Where the test lives | Where the list lives |
|---|---|---|---|
| 1 | **34 banned words**, in any form — "optimize", "optimized", "optimizing" all count | `check-script.mjs:190-199` | `rules-data.mjs:29-36` |
| 2 | **20 banned phrases**, also in any form — "moved the needle" is caught by "move the needle" | `check-script.mjs:201-209` | `rules-data.mjs:38-45` |
| 3 | **8 worn-out phrases** the market has ruined | `check-script.mjs:210-221` | `rules-data.mjs:61-70` |
| 4a | **13 "explicitly safe" phrases that protect nothing.** This list is compared against the worn-out list, never against the words of an ad. The code's own note calls it "never possible, but a hard guard against list mistakes" | `check-script.mjs:211` | `rules-data.mjs:75-81` |
| 4b | **6 phrases that ARE a real shield.** The required close wording — "no hard inquiry", "soft pull only", "no obligation" and three more — is cut out of the text **before** the never-say check runs, so a legal close can never be mistaken for a banned promise | `check-script.mjs:273-279` (`stripAllowed`), used at `:283` | `rules-data.mjs:132-139` |
| 5 | **11 banned openers.** Tested against the opening of whatever the **first spoken section** turns out to be — `HOOK` normally, and then `BODY`, `CTA`, `CLOSE` in that order if there is no `HOOK` (`check-script.mjs:431-439`). In the plain-paragraph shape it is the **first two lines** (`:478-479`). The test is `startsWith` on that first line, not on a parsed sentence (`:227-229`) | `check-script.mjs:225-232`, `:431-439`, `:478-479`; proven by the test at `check-script.test.mjs:232` | `rules-data.mjs:47-52` |
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

**A hole big enough to matter — measured, not guessed.** The checker only treats a block
of text as a script when the block has a `HOOK` line, **or** its heading starts "Ad 1" /
"Script 7", **or** its heading contains "VSL" (`scripts/ads/check-script.mjs:106-110`).
Anything else is skipped. When nothing in a file qualifies, the tool prints "no scripts
found", never sets its failure flag, and **exits with a success code**
(`check-script.mjs:545-548`, `:567`).

Run on this machine, 2026-09-08:

```
node scripts/ads/check-script.mjs docs/ads/POST-BOOKING-15.md ; echo $?
```

`docs/ads/POST-BOOKING-15.md` (30 pieces of copy), `docs/ads/ascension-ads.md`,
`docs/ads/CONCEPTS.md` and `docs/ads/sms-copy-2026-09.md` **all four** print "no scripts
found" and exit **0**.

**Why that is the biggest risk in this whole lane.** The promise being made to Chris is
"a script that already passed the checker". A generated script headed "Angle 12 — the
denial door", with no `HOOK` label, would be waved straight through with a green result
and nothing would have been read. Chris would be told it passed when it was never
checked.

**What it deliberately does NOT do:** it never runs the twelve rules that decide whether
an ad may run. Those need a live database and happen later, inside
`src/creative/generate.mjs` (`check-script.mjs:19-26`).

**And six things it can never judge.** `docs/ads/RULES.md:583-602` names all six, not one:

1. Is the thing the ad names as the cause **actually** the cause (`:585`).
1a. Is the opening subject someone other than us. Listed as built in an older draft; the
    file corrects itself and says it is **not** built (`docs/ads/RULES.md:565-567`, `:586-588`).
2. The mechanism test — could a competitor run this same ad (`:589`).
3. Does it sound like Chris (`:590`).
4. Does the angle repeat another concept's argument (`:591`).
5. Is the proof one we actually have in writing (`:592`).
6. A banned word hiding behind an irregular verb — "took" for "take" (`:593-602`).

### 3. Does the checker run on its own? **No.**

**Proof, three ways:**

1. **It is not in the build.** Searching the whole repository for `check-script` returns
   hits in exactly three kinds of place: `package.json:17` (a command a person types),
   `.cursor/skills/fundhub-ad-writer/SKILL.md:92` (an instruction to an agent), and
   documentation. No file under `src/`, `api/` or `netlify/` calls it.
2. **It is not in CI.** `.github/workflows/tests.yml` has no step that mentions ads or
   the checker (searched; no match). `scripts/lint.mjs` has none either. These two are
   searches that came back empty, so there is no line to point at — that is what the
   claim is.
3. **It is not in the generate path.** `src/creative/generate.mjs` never imports it
   (searched; no match), so the screen path writes copy that has never been checked.

What DOES run on its own is the checker's own test file
(`scripts/ads/check-script.test.mjs`), inside `npm test`. But that test only proves the
checker is not broken. It pins five named blocks in `CONTROLS.md` (`:42-48`) and asserts
they pass clean (`:50-65`).

**A thing worth Chris knowing, measured today:** running the checker by hand on the
locked file right now —

```
node scripts/ads/check-script.mjs docs/ads/CONTROLS.md
```

— reports **8 scripts checked, 3 need work**, and exits **1** (confirmed on this
machine). The three are "Script 7 — Insider Access", "Script 8 — Stop Before You Apply
Again" and "Script 9 — Why I Built This" (`docs/ads/CONTROLS.md:236`, `:268`, `:299`).
All three are under the 135-word floor and none has the two-promise close. The test does
not cover them, because the test's list names only Ad 1-4 and the Founder VSL. Whether
those three are ads Chris is actually running is **UNKNOWN** — the file's own header
says everything in it is running (`docs/ads/CONTROLS.md:2`).

### 4. `rules-data.mjs` vs `RULES.md` — in sync? Which wins?

**`rules-data.mjs` wins.** It says so on its own first line: it is "the one
machine-readable source for ad-copy rules", and `RULES.md` "is the page a person reads"
(`docs/ads/rules-data.mjs:1`, `:3`). It is also the checker's **only** source of rules —
one import, six lists, nothing else (`scripts/ads/check-script.mjs:41-46`). The order to
change the data file first and the prose second is written at `docs/ads/rules-data.mjs:10-11`.

**Are they in sync today? Yes, checked by hand.** `RULES.md:76-102` lists 34 words, 20
phrases and 11 openers, and `rules-data.mjs:29-52` holds 34, 20 and 11. The
avoid-list at `RULES.md:105-124` has nine bullets against eight machine entries
(`rules-data.mjs:61-70`); the ninth bullet — "anything that hints several companies will
phone them" — is a judgement, not a phrase, so it has no machine version by design.

**The third copy — checked, because the file asks for it by name.**
`docs/ads/rules-data.mjs:12-17` says the same three lists also live in
`.claude/workflows/copy.js`, "byte-for-byte identical as of 2026-09-07; diff them before
trusting that claim again later."

**Diffed on 2026-09-08. Still clean.** `.claude/workflows/copy.js:34-48` against
`docs/ads/rules-data.mjs:29-52`: 34 words, 20 phrases, 11 openers, same entries, same
order, nothing in either that is missing from the other. **This item is closed, not
carried.**

**Is there a test that fails when they drift? Partly, and here is the gap.**

- There **is** a drift test, and it covers the copy.js copy only
  (`scripts/ads/check-script.test.mjs:151-154`).
- That test only runs one way: it fails if a word is in `rules-data.mjs` and missing
  from `copy.js`. A word added to `copy.js` alone would pass silently.
- It also pins the three counts at 34 / 20 / 11 (`:146-148`), so adding a rule to
  `rules-data.mjs` fails the test until someone updates the number. That is a speed bump,
  not a sync check.
- **Nothing anywhere compares `rules-data.mjs` to `RULES.md`** (searched; no match). If
  someone edits the word list in the prose file and not in the data file, the checker
  keeps enforcing the old list and every test stays green. That is a habit, not a guard.

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
| `ads[].id` | **the ad number.** This is the identity. It is the leading digits of `utm_content` | `:20`; the database does the same in `fundhub_ad_id()` at `db/migrations/286_client_ad_attribution.sql:81`, used to fill the stored `ad_id` column at `:110` |
| `ads[].title` | a nickname. Optional. `null` for 21 of 24 | `:23` and on |
| `ads[].lane` | which of five buckets the ad was filed under | `:6` |
| `ads[].gate` | the credit score door: 600, 720, 780, or none | `:7` |
| `ads[].entry` | does it go straight to the offer, or to the sorting call | `:8` |
| `ads[].primary_offer` / `secondary_offers` | what the ad is selling, and what else may be offered | `:9` |
| `ads[].variants` | which shoot version: `sun`, `nosun`, `sedona` | `:10` |
| `ads[].group` | an optional batch name, e.g. `slam`, `sedona`, `objection` | `:29`, `:41`, `:47` |

**How a script becomes a registry row: it does not.** Nothing writes this file. It is
typed by hand. Searching `src/`, `api/`, `scripts/` and `public/` for `registry.json`
returns readers only — `src/ads/registry.mjs:22`, `src/ads/registry.test.mjs:19`,
`api/read/ad-books.mjs:6`, `public/app/closer-dashboard.html:562`,
`public/app/campaign-manager.html:373`, and `scripts/ads/check-registry-titles.mjs:19`.
The search for a writer came back empty, so there is no line to point at — that is the
claim.

An unknown number falls back to the widest door — gate none, entry sorting
(`src/ads/registry.mjs:32-42`) — and the warning is printed once per number, not once per
call, proven by the test at `src/ads/registry.test.mjs:65-72`. So a missing row is safe,
not broken.

**The untitled check IS automatic, and it is stricter than it looks.** The standalone
script `scripts/ads/check-registry-titles.mjs` has no npm command and no CI step
(searched `package.json` and `.github/workflows/tests.yml`; no match). **But the same
check also runs inside `npm test`**, at `src/ads/registry.test.mjs:97-111`, because that
file sits under `src/` and the suite walks `src/` (`scripts/run-suite.mjs:50`).

It does **not** treat today's 21 untitled ads as defects — they sit on a hand-written
allow-list at `src/ads/registry.test.mjs:91-96`. It fires in two cases:

- a **new** ad arrives in `registry.json` with no title (`:100-105`), or
- one of the 21 **gets** a title and nobody deletes it from the list (`:106-110`).

**Chris needs to know this before any screen writes a registry row.** The moment
anything adds a new ad number to `registry.json`, the whole test suite goes red until a
person hand-edits a list inside a test file. The instruction to do that edit is written
at `scripts/ads/check-registry-titles.mjs:17-18`. Naming an ad is still not required —
but adding one now costs a code edit.

**And nobody has said who assigns the number.** A finished script has no ad number and
no way to get one. The only link that exists runs the other way and needs a person: when
Paul builds the ad in the ad account, the `ads` row carries `asset_id` pointing back at
the script (`db/migrations/046_ad_platforms.sql:291`; `docs/journeys/ad-script-flow.md:65`).
Nothing decides the `utm_content` number, at any moment, in any file. This is the same
disconnect the journey page already records — "Meta's ad id and Chris's ad number never
meet" (`docs/journeys/ad-script-flow.md:130`). Every other lane in this batch is built on
that number. **UNKNOWN: who assigns it and when.**

### 6. What is missing so Chris can open a screen and get a finished script

Named precisely. Every one of these does not exist today.

**a. There is no list of angles a program can serve.** The 48 concepts exist as data at
`docs/ads/build/concepts.data.json` with every field a picker needs. Nothing under
`src/`, `api/` or `public/` reads that file (searched; no match). **Missing address:
`GET /api/ads/angles`.**

The route map today has **two** ad-reading addresses —
`"read/ad-attribution"` (`netlify/functions/api.mjs:580`, the one the closer reads on the
call screen, per the note at `:574-575`) and `"read/ad-books"` (`:581`) — plus the seven
`creative/*` addresses (`:747-753`). **No address in the map begins with `ads/`.** So
`GET /api/ads/angles` would be the first, and `read/ad-attribution` is the working
example of how an ads address gets added to that map.

**b. There is no rule loader in the application.** The rules are in the repository as
documents, and the app cannot see them. **Missing file: `src/ads/rule-pack.mjs`** — one
small piece of code whose only job is to hand back the rules and the voice examples as
plain text. Today `docs/ads/rules-data.mjs` is importable (the checker imports it at
`scripts/ads/check-script.mjs:41-46`), but `RULES.md`, `VOICE.md` and `CONTROLS.md` are
read by nothing.

**c. The generator does not know the format.** `src/creative/providers/copy.mjs:89-125`
builds its instructions from six fixed sentences, a conditional five-line block, one
voice line and generic angle names. It does not know about `HOOK`, `BODY`, `CTA`,
`CLOSE`, `RUNTIME`, `SHOOT`, `TAG`, `TYPE` (`docs/ads/RULES.md:335-348`), the word bands
(`rules-data.mjs:172-177`), the two close promises (`rules-data.mjs:157-160`), or the 48
angles. **Missing: an ad-script mode in that provider that is handed the rule text and
the chosen angle.**

**d. The checker cannot be called by the server as it stands.** This is bigger than it
first looked.

`scripts/ads/check-script.mjs` exports exactly three things: `checkOneScript` (`:406`),
`loadRules` (`:492`) and `main` (`:524`). **`checkOneScript` does not take the words of a
script.** It takes an already-cut-up object shaped `{title, startLine, lines:[{n,text}]}`.
The function that does the cutting up, `splitBlocks` (`:89`), and the one that reads a
file, `checkFile` (`:503`), are **not exported**. The test file had to hand-copy
`splitBlocks` to reach it (`scripts/ads/check-script.test.mjs:23-40`).

**So the reusable part is not finished.** Either the checker gains a new exported "check
this block of text" function, or the server copy-pastes the splitter the way the test
did — and `CLAUDE.md` §8 calls two copies of the same function a bug that takes months to
surface. **Missing: one new export on the checker, then a check-then-retry step inside
the job runner.**

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

**g. Four switches can stop the button working, not two.** Two are the ones already
known. Two were missed and both are real.

| # | The switch | What Chris would see | Where |
|---|---|---|---|
| 1 | **The partner's marketing suite is off.** Checked before the job is even saved, and again inside the writer | "this partner's marketing suite is off" | `api/creative/generate.mjs:131`; `src/creative/providers/copy.mjs:31-33`; the message at `src/brand/meter.mjs:48-56` |
| 2 | **This month's writing budget is used up.** A monthly word allowance, counted per partner | "this partner has used this month's writing budget" | `src/creative/providers/copy.mjs:31-33`; the message and the count at `src/brand/meter.mjs:81-90` |
| 3 | **No ad-making service is switched on.** No migration or seed file inserts a `creative_providers` row. The migration says so itself, in words: "NOT SEEDED WITH AN ACTIVE ROW" | "no ad-making service is switched on for this account" | `db/migrations/048_campaign_config.sql:35-38`; the message at `api/creative/generate.mjs:57-59` |
| 4 | **The model key.** The writer refuses to run without `ANTHROPIC_API_KEY` | an error, not copy | `src/creative/providers/copy.mjs:26-28` |

**The budget one bites twice.** The plan in this spec writes each script, checks it, and
rewrites it until it passes. **Every retry spends that budget.** Nobody has decided how
many retries are allowed or what they cost. That decision has to be made before the
retry loop is built. **UNKNOWN.**

### 7. "The rule loader is swappable, the generator is not" — in plain words

Think of it as a cook and a recipe card.

**The cook is the generator.** It knows how to make an ad: hook first, then the body,
then the ask, then the close with its two promises. That never changes.

**The recipe card is the loader.** It is the piece that fetches today's rules and hands
them to the cook. The cook never goes looking for the card itself.

**Today the card is two files on disk** — `docs/ads/RULES.md` and `docs/ads/VOICE.md`
(`.cursor/skills/fundhub-ad-writer/SKILL.md:40-49`). `VOICE.md` says the same thing in
its own words at `docs/ads/VOICE.md:9-15`: a small loader hands the generator the text in
the file; today it reads a markdown file; later it might read a row out of a database.

**Later the card is a row in the `brand_kits` table.** That table already exists
(`db/migrations/045_creative_factory.sql:86-113`). One row per customer, and it already
has a `voice_profile` column holding free-form data (`:103`).

**The seam is PARTLY BUILT ALREADY. Two pieces are wired and running today.**

1. **The writer already reads a brand's voice setting.** `src/creative/providers/copy.mjs:108-109`
   adds a "Brand voice: …" line to its instructions, taken from
   `spec.brandKit.voice_profile.tone` — the exact shape of the `brand_kits` column.
2. **The button already accepts a brand kit and remembers it.** The address takes
   `brand_kit_id` (`api/creative/generate.mjs:135`), it is carried into the saved job
   (`src/creative/generate.mjs:42`, `:87`, `:93`) and stamped onto the finished asset
   (`:218-223`).

**One honest gap between those two pieces.** Nothing loads the `brand_kits` row from the
database and puts it into `spec.brandKit`. Searched `src/` and `api/` for `brandKit`: the
only writes are the providers reading it (`src/creative/providers/copy.mjs:108`,
`static.mjs:77`, `product-video.mjs:36-37`), and the job hands the provider whatever spec
was saved (`src/creative/generate.mjs:148`, `:166`). So today the tone only arrives if
the caller typed it into the request body. **The wire is run; the plug is not in.**

**What is actually left.** Not "build the seam from zero" — that is the wrong size. What
is missing is everything except tone: the banned lists, the locked format, the word
bands, the close promises, and the voice pairs.

1. **Write the loader.** One small file, `src/ads/rule-pack.mjs`, with one job: given a
   brand, return the rules text, the voice examples, the locked format, and the safe and
   banned lists.
2. **Give it two ways to fetch.** From the repository files (what Chris uses), or from a
   `brand_kits` row (what a partner would use). Same answer shape either way.
3. **Fill in the missing plug** — load the `brand_kits` row and put it into
   `spec.brandKit` before the writer runs, so the tone line at
   `src/creative/providers/copy.mjs:108-109` fires on its own instead of only when a
   caller typed it.
4. **Make the copy provider ask the loader instead of using its six fixed sentences**
   (`src/creative/providers/copy.mjs:92-97`).
5. **Make the checker take its lists from the loader too**, not only from
   `docs/ads/rules-data.mjs` (`scripts/ads/check-script.mjs:41-46`). Otherwise a partner's
   ad would be written to their rules and then checked against Chris's.
6. **Decide where a partner's banned words are stored.** `brand_kits.voice_profile` is
   free-form, so the shape has to be pinned down and guarded. That decision has not been
   made. **UNKNOWN.**

**Why it matters to Chris:** the tool that writes his own ads tonight and the feature he
could sell to a partner later are the same build. Nobody has to write it twice.

---

## What is missing — worst first

1. **The checker says "all clean" on files it never read.** A block only counts as a
   script if it has a `HOOK` line or a heading like "Ad 1" / "Script 7" / anything with
   "VSL" in it (`scripts/ads/check-script.mjs:106-110`). Anything else is skipped and the
   tool exits with a success code (`:545-548`, `:567`). Measured on four real files —
   `POST-BOOKING-15.md`, `ascension-ads.md`, `CONCEPTS.md`, `sms-copy-2026-09.md` — all
   four report "no scripts found" and exit 0. **A generated script with the wrong heading
   would be reported as passing when nothing was checked.**
2. **Nothing writes a script without a person driving it.** All three paths need someone.
   The chat path needs Chris and an agent (`SKILL.md:76-77`, `:92`). The screen path can
   run alone but produces copy that has never seen the rules
   (`src/creative/providers/copy.mjs:89-125`). The flywheel path writes general copy, not
   FundHub scripts (`.claude/workflows/copy.js:54-70`).
3. **The checker never runs by itself.** Not in CI, not in lint, not in the generate path.
   Somebody has to remember. Proof in answer 3 above.
4. **The checker cannot be plugged into the server as it stands.** `checkOneScript`
   (`scripts/ads/check-script.mjs:406`) needs a pre-cut block, and the two functions that
   do the cutting and the file reading are not exported (`:89`, `:503`). The test file had
   to copy one of them by hand (`scripts/ads/check-script.test.mjs:23-40`).
5. **The application cannot read the rules at all.** No file under `src/`, `api/` or
   `public/` opens `RULES.md`, `VOICE.md`, `CONTROLS.md` or `rules-data.mjs`. One comment
   names `RULES.md` (`api/creative/generate.mjs:97`) but reads nothing.
6. **The voice file has zero real correction pairs.** Its "Model wrote" lines are
   invented (`docs/ads/VOICE.md:17-24`). The one thing only Chris can judge has no real
   training material yet.
7. **No angle address and no angle picker in the app.** The 48 concepts sit in
   `docs/ads/build/concepts.data.json` and no code reads them. A picker page does exist
   outside the app and throws the pick away (`docs/ads/build/README.md:14-15`).
8. **A finished script never gets an ad number.** Nothing assigns `utm_content`. The only
   link runs backwards, from the ad account to the script
   (`db/migrations/046_ad_platforms.sql:291`). Named as an open disconnect at
   `docs/journeys/ad-script-flow.md:130`.
9. **The generated copy is not in the shoot format.** Split on three dashes
   (`src/creative/providers/copy.mjs:127-132`), so the checker's main mode cannot even
   parse it.
10. **The written journey describes checking that does not happen.**
    `docs/journeys/ad-script-flow.md:34` and `:57-58` put the checker inside the writing
    loop. No code does that. Reported here per `CLAUDE.md` §4, not silently patched.
11. **Adding an ad number turns the whole test suite red** until a person hand-edits a
    list inside `src/ads/registry.test.mjs:91-96`. Instruction at
    `scripts/ads/check-registry-titles.mjs:17-18`.
12. **No test catches the prose rules drifting from the machine rules.** Answer 4 above.
    (The third copy in `.claude/workflows/copy.js` was diffed on 2026-09-08 and is clean —
    that item is closed.)
13. **Zero scripts have ever been saved.** `docs/ads/scripts/` holds only a README.
14. **Three blocks in the locked control file fail the checker today** and no test covers
    them (answer 3 above).
15. **`docs/ads/CONCEPTS.md` cannot be regenerated.** `build-sheet.py:5` reads three
    `batch*.json` files that are not on disk. (The 48 titles in `concepts.data.json` and
    `CONCEPTS.md` were compared on 2026-09-08 and match, so nothing has drifted yet.)
16. **Two files the README tells you to read do not exist:** `docs/ads/20-ads.md` and
    `docs/ads/SHOOT-PLAN.md` are both listed at `docs/ads/README.md:10-15` and neither is
    on disk.
17. **Four switches can stop the button, and two of them are invisible today.** Answer 6g
    above. The monthly writing budget in particular has never been sized against a
    retry loop.
18. **The registry is typed by hand.** A finished script never becomes a registry row on
    its own.

---

## The data model

**Nothing new is needed.** Every state already exists, and the one missing column
already shipped. This restates `docs/journeys/ad-script-flow.md:12-24` and is grounded in
the migrations.

| Table | Column | Plain-word meaning | Where |
|---|---|---|---|
| `generation_jobs` | `status` | Where the writing job is up to: `queued`, `running`, `succeeded`, `failed` | `db/migrations/045_creative_factory.sql:312` |
| `generation_jobs` | `spec` | What was asked for. Free-form. **This is where an angle number, an ad type and a runtime band would go** | written at `src/creative/generate.mjs:95`, read back at `:148` and handed to the writer at `:166`; passed through from the request at `api/creative/generate.mjs:139-146` |
| `generation_jobs` | `brand_kit_id` | Which brand's settings this job belongs to. **Already accepted and already saved** | `api/creative/generate.mjs:135`; `src/creative/generate.mjs:42`, `:87`, `:93` |
| `generation_jobs` | `idempotency_key` | The batch name. Stops a double press double-billing | `api/creative/generate.mjs:88-95` |
| `creative_assets` | `kind` | `static` (a picture), `video`, or `copy` (words). A script is `copy` | `docs/journeys/ad-script-flow.md:22-23` |
| `creative_assets` | `copy_text` | **The words of the ad.** Empty for pictures and videos. Saved even when blocked, because a blocked script is the one Chris has to rewrite | `db/migrations/301_creative_copy_text.sql:67`, `:80-81`; written at `src/creative/generate.mjs:218-223`; returned to the screen at `api/creative/library.mjs:44` |
| `creative_assets` | `compliance_state` | `pending`, `passed`, `blocked`, `approved`. Only a person sets `approved` | `db/migrations/045_creative_factory.sql:201` |
| `creative_assets` | `blocked_reasons` | Why it was stopped, in the engine's own words | returned to the screen at `api/creative/library.mjs:46`; why it is never dropped, at `api/creative/approvals.mjs:16-19` |
| `creative_assets` | `brand_kit_id` | Which brand's settings wrote it. Stamped on at save time | `src/creative/generate.mjs:218-223` |
| `ads` | `asset_id` | Points from a live ad back at the script it came from. **This is how "was it filmed" is answered without anyone ticking a box** | `db/migrations/046_ad_platforms.sql:291` |
| `ads` | `approval_state` | `draft`, `awaiting_approval`, `approved`, `live`, `paused`, `archived` | `db/migrations/046_ad_platforms.sql:311` |
| `brand_kits` | `voice_profile` | Free-form settings for one brand's voice. **Partly wired already** — the writer reads `voice_profile.tone` out of the request at `src/creative/providers/copy.mjs:108-109`. What is missing is loading the row from the database into the request, and everything beyond tone | `db/migrations/045_creative_factory.sql:103` |
| `creative_providers` | (the whole table) | Which ad-making service is switched on. **Deliberately has no row** — the migration says "NOT SEEDED WITH AN ACTIVE ROW" | `db/migrations/048_campaign_config.sql:35-38` |
| `partner_ai_usage` | `input_tokens`, `output_tokens` | How much writing a partner has done this month, counted against their allowance | summed at `src/brand/meter.mjs:58-68`; the limit enforced at `:81-90` |
| `client_ad_attribution` | (the whole table) | Joins an ad number to a booked call. The number is cut out of `utm_content` by `fundhub_ad_id()` | `db/migrations/286_client_ad_attribution.sql:81` (the function), `:110` (the stored column) |

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
| A line of text under the button | Reads it | Says whether it can actually run. It must name **all four** switches from answer 6g — suite off, budget used up, no service switched on, no model key. The address already answers the first and third honestly (`api/creative/generate.mjs:50-67`, `:131`); the budget one is not surfaced anywhere today (`src/brand/meter.mjs:81-90`) |

**The finished script must be laid out to read to camera.** This is already decided and
costs nothing: the words Chris speaks stay clean and unbroken, and everything not spoken
— the runtime band, the outfit and location note, the origin_angle tag — sits in its own
block, clearly separated, never inside the script body
(`docs/journeys/ad-script-flow.md:116-124`). That decision also settled that there is no
teleprompter app to connect to; the format **is** the connection.

**Existing panel: the library.** Already shows the words of a written ad
(`public/app/creative-factory.html:1545-1546`, `:2063-2064`), already shows a blocked one
on purpose (`:2058-2064`). A script would appear here with no change.

**What Chris must still do himself, and always will:** the six judgement calls at
`docs/ads/RULES.md:583-602`, listed in answer 2 above. A machine cannot make any of them.
When he rewrites a line, that pair goes into `docs/ads/VOICE.md` (`SKILL.md:114-119`) —
and it would be the **first real pair in that file** (`docs/ads/VOICE.md:17-24`).

### Web addresses the screen calls

| Address | Exists? | What it would do |
|---|---|---|
| `GET /api/ads/angles` | **No.** Would be the first address in the map beginning with `ads/` | Hand the screen the 48 angles from `docs/ads/build/concepts.data.json`. Copy how `read/ad-attribution` was registered (`netlify/functions/api.mjs:580`) |
| `POST /api/creative/generate` | **Yes** (`netlify/functions/api.mjs:747`) | Already takes a free-form `spec` and a `brand_kit_id` (`api/creative/generate.mjs:135`). Needs the angle, type, runtime and lane fields added |
| `GET /api/creative/library` | **Yes** (`:748`) | Already returns `copy_text` (`api/creative/library.mjs:44`) and `blocked_reasons` (`:46`) |
| `POST /api/creative/run` | **Yes** (`:753`) | The "run queued jobs now" button |

---

## Definition of done

A human can tick these one at a time.

1. `GET /api/ads/angles` returns 48 angles, each with its hook, who it is for, and its
   number, read from `docs/ads/build/concepts.data.json`.
2. That address is in the map in `netlify/functions/api.mjs` — a handler file that is not
   in the map returns "not found" both locally and live (`CLAUDE.md` §12). Follow the
   pattern at `netlify/functions/api.mjs:580`.
3. `src/ads/rule-pack.mjs` exists and hands back, as plain text: the SOP, the voice
   pairs, the locked format, the banned lists, the safe lists, the close promises, and the
   word bands.
4. `src/creative/providers/copy.mjs` builds its instructions from the rule pack, not from
   the six fixed sentences at `:92-97`.
5. **The checker gains one new exported function that takes plain text**, so the server
   can call it without copying `splitBlocks` (`scripts/ads/check-script.mjs:89`) the way
   the test had to (`scripts/ads/check-script.test.mjs:23-40`).
6. **The checker never reports "clean" on text it did not read.** The new function
   returns "I found nothing to check" as a **failure**, not a pass. Proven by a test that
   feeds it a script headed "Angle 12 — the denial door" with no `HOOK` label and expects
   a failure, not a green result. This closes the hole at
   `scripts/ads/check-script.mjs:106-110` and `:545-548`.
7. A generated script comes back in the locked format — `HOOK`, `BODY`, `CTA`, `CLOSE`,
   `RUNTIME`, `WORDS`, `SHOOT`, `TAG`, `TYPE` (`docs/ads/RULES.md:335-348`).
8. **The script is laid out so Chris can paste it into a teleprompter and read it.**
   Spoken words unbroken; runtime, outfit, location and tag in their own block, never
   inside the script body (`docs/journeys/ad-script-flow.md:116-124`).
9. The job runner runs the checker on every generated script and rewrites anything that
   fails, up to a fixed number of tries. **Chris has set that number and it is written
   down**, because every retry spends the monthly writing allowance
   (`src/brand/meter.mjs:81-90`).
10. A script that still fails after those tries is saved anyway, with the reasons visible,
    so Chris can see what went wrong. Nothing is silently thrown away.
11. `creative_assets.copy_text` holds the words of every script written, blocked or not
    (`db/migrations/301_creative_copy_text.sql:67`).
12. The Creative Factory page has a "Write an ad script" panel with an angle picker, a
    type picker, a runtime picker and a lane picker. **No new page. No new menu row.**
13. The line under the button names all four reasons it might not run: suite off, budget
    used up, no ad-making service, no model key (answer 6g).
14. Chris picks an angle, presses one button, and reads a finished script on that page,
    with no agent in a chat window at any point. **He still makes the six judgement calls
    at `docs/ads/RULES.md:583-602` on every script — that does not go away.**
15. A test proves the whole path: pick angle → generate → check → save → the words come
    back on the library screen.
16. A test fails if the word lists in `docs/ads/RULES.md` and `docs/ads/rules-data.mjs`
    stop matching.
17. **The code style check passes.** Run `npm run lint`; it prints no errors.
18. **The type check passes.** Run `npx tsc --noEmit`; it prints no errors. This catches
    a name or a field that does not exist before anyone clicks anything.
19. **All the automatic tests pass against a real database.** None skipped, deleted or
    weakened. Include `src/ads/registry.test.mjs` — if the build ever adds an ad number,
    that test goes red until the list at `:91-96` is edited by hand.
20. **A robot clicks through the new panel and it works.** That is the Playwright check:
    a script that drives a real browser through the steps a person would take.
21. `docs/journeys/ad-script-flow.md` is corrected so it matches the code — today its
    picture and table say the checker sits inside the writing loop (`:34`, `:57-58`) and
    no code does that — and `docs/journeys/CHANGELOG.md` has a line for the change.

---

## UNKNOWN — blocked or unverifiable

| # | The thing | Why it is unknown |
|---|---|---|
| 1 | Is `ANTHROPIC_API_KEY` set on the live site? | The writer refuses to run without it (`src/creative/providers/copy.mjs:26-28`). The Netlify API is blocked from this environment (`CLAUDE.md` §11, Egress). Not checkable here |
| 2 | Is there a `creative_providers` row in the live database? | No migration or seed file inserts one — the migration says so itself, "NOT SEEDED WITH AN ACTIVE ROW" (`db/migrations/048_campaign_config.sql:35-38`). Without a row the address says no service is switched on (`api/creative/generate.mjs:57-59`). Needs a live database read |
| 3 | Is the partner's marketing suite switched on, and how much writing budget is left? | Both are read from the live database (`src/brand/meter.mjs:48-56`, `:81-90`). Not checkable from here |
| 4 | **Decision needed:** how many rewrite tries per script, and what does that cost? | Every try spends the monthly writing allowance (`src/brand/meter.mjs:81-90`). Nobody has set a number. Blocks Definition of done item 9 |
| 5 | **Decision needed:** who assigns an ad's `utm_content` number, and when? | Nothing in the repo assigns one (searched `src/`, `api/`, `scripts/`, `public/`; no writer). The only link runs backwards from the ad account (`db/migrations/046_ad_platforms.sql:291`; `docs/journeys/ad-script-flow.md:65`). Named as an open disconnect at `docs/journeys/ad-script-flow.md:130`. Every other lane in this batch depends on that number |
| 6 | Are "Script 7", "Script 8" and "Script 9" in `CONTROLS.md` really running ads? | The file header says everything in it is running (`docs/ads/CONTROLS.md:2`), but the test only pins Ad 1-4 and the Founder VSL (`check-script.test.mjs:42-48`). All three fail the checker today. Only Chris can say |
| 7 | Where should a partner's own banned words be stored inside `brand_kits`? | `voice_profile` is free-form (`db/migrations/045_creative_factory.sql:103`). Only `tone` has a code path today (`src/creative/providers/copy.mjs:108-109`). No shape has been decided for the rest |
| 8 | Can repair ($1,000) and the trial ($200) be paid in instalments? | Two sources disagree. `src/config/offers.mjs:110` and `:121` both say `financing: true`. The closer pack says **Cash only** for both (`docs/workflows/fundhub-closer-pack-from-alec-2026-08-24.md:40-41`). Written down as an open question at `docs/ads/NEXT.md:42-44`. Every repair ad is written around it |
| 9 | Where does the click land — the VSL page, or straight to the application? | Open question at `docs/ads/NEXT.md:45-46`. It changes the CTA in every ad |
| 10 | Which live ad wins on cost per booked call? | Open question at `docs/ads/NEXT.md:47`. It decides what to make more of |
| 11 | Do `docs/ads/20-ads.md` and `docs/ads/SHOOT-PLAN.md` still matter? | Both are listed in the reading order at `docs/ads/README.md:10-15` and neither is on disk |
| 12 | Are the three `batch*.json` files that built `CONCEPTS.md` recoverable? | `docs/ads/build/build-sheet.py:5` reads them; none is in `docs/ads/build/`. Until they are back, `CONCEPTS.md` can only be edited by hand |
| 13 | ClickFunnels API key | Blocked on Chris (batch board, `docs/workflows/marketing-e2e.md:266`) |
| 14 | YouTube OAuth client id, client secret, refresh token | Blocked on Chris (`docs/workflows/marketing-e2e.md:267`) |
| 15 | Microsoft Clarity project ID | Blocked on Chris (`docs/workflows/marketing-e2e.md:268`) |
| 16 | Meta ad account connection | No `ad_platform_connections` row exists (`docs/workflows/marketing-e2e.md:269`). Until there is one, a script cannot be traced to spend |
| 17 | **Decision needed:** does ClickFunnels "conversions" mean opt-ins or sales? | The code counts opt-ins at `src/analytics/clickfunnels.mjs:255`. Chris's call |
| 18 | **Decision needed:** may `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected? | It still instructs a Google Workspace setup Chris banned |
