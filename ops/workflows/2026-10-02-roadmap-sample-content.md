# /roadmap "See a sample" — strategic previews (2026-10-02)

Chris's spec: each preview shows the most compelling real part of that document, blurred at a logical break so it looks intentional. Data from the real UnderwriteIQ engine run on the SIMULATED test file (never a real client). Lender list: 12 legit banks with logos, bureau info blurred. Marked draft first; push live only when Chris says.

| Unit | Owner | Status |
|---|---|---|
| W1 — sample data from UnderwriteIQ engine (sim file) | Sonnet agent | done (first pass); one-file sandbox re-run blocked, see W1 follow-up |
| W2 — 12 banks with logos | Sonnet agent | done |
| W3 — rebuild 6 previews, marked draft, push on OK | main session (Opus) | claimed |

## W1

Full data: `ops/workflows/2026-10-02-roadmap-sample-content/w1-samples.json` (valid JSON, about 79 KB). Every value is copied from engine output, nothing typed or rounded by hand. Not committed.

**Command run (repo root, no API key, no network):**
`env -u ANTHROPIC_BASE_URL node scripts/tmp/w1-roadmap-samples-2026-10-02.mjs`
The script is scratch and uncommitted. It calls the same code the app calls: `runTierEngineFromCrsResult` (src/finance/crs-tier.mjs, which loads vendor/underwriteiq-full/api/lite/crs/engine.js), `buildLetterPack({ pack: "funding" })` (src/underwrite/letter-pack.mjs, makes the 4 HTML documents and the vendor letters), `violationsByBureauFromMergedCrs` plus `buildDiyPackage` (src/metro2/diy, the in-app Dispute Letter Pack).

**Consumer.** Name in the sim file: **Sim Five-Academy**. The sim file has no address on any bureau, so the address is the repo's own sim fixture (`SIM_PERSONAL` in scripts/black-reports/regen-w10-pack.mjs): 100 Test Ave, Denton, TX 76205. The sim file's email is left out.

**What came from the sim file (clean file: scores 762 / 770 / 758, 4 accounts, 0 negative items):**
- **Qualification.** The engine calls this document "Capital Readiness Snapshot" (kicker "FUNDING SNAPSHOT"). Today **$199,350**, optimized **$221,500**, gap line "$22,150 left on the table". Cover, numbers table, waterfall chart labels, breakdown, "What Is Costing You Money", the 10 "After Optimization" lenders with ranges, and "Your Next Step" are all in the JSON.
- **Credit analysis.** Bureau Health Summary, Score Breakdown, the Utilization table (Chase Sapphire Preferred 18%, Amex Blue Business Cash 19%, Capital One Spark 12%, with target balances), and the Bottom Line. The sim file has no negatives, so its "costly items" are those three cards.
- **Roadmap.** 6 months. Month 1 (Launch) and Month 2 (Results) text plus checklist items, exact. Later titles: Month 3 Results, Month 4 Final push, Month 5 Business, Month 6 Reveal (section headings: "Months 2-3 - Results", "Month 4 - Final Push", "Month 5 - Business Milestone", "Month 6 - The Reveal"). On the sim file Month 1 Steps 2 and 3 read "No Experian negatives..." because the file is clean.

**What could NOT come from the sim file, and where it came from instead:**
- **Dispute letters.** The sim file has 0 derogatory accounts, so the engine writes no dispute letter for it (funding pack: none; repair pack: empty; Metro 2 violations: none). The one complete letter in the JSON is a Round 1 Experian letter (SIGNET BANK/VIRGINIA, 3 dispute items, full text) from the vendor sandbox accounts (`vendor/underwriteiq-full/api/lite/crs/sandbox/{tu,exp,efx}.json`), written for the sim consumer's name and address. A second, longer Round 1 letter from the in-app pack is also in the JSON. Rounds 1 to 6 with titles: R1 Round 1 Metro 2 dispute, R2 Round 2 FCRA / method of verification, R3 Round 3 final notice, R4 CFPB complaint, R5 State attorney general complaint, R6 Final notice, reissued (reuses the Round 3 letter). The in-app pack files are listed too: Start here, Decision tree, Round 1, Round 2 and 3 (conditional), the two complaints plus cover sheet, Round tracker.
- **Credit analysis negative items.** Same sandbox run: Experian 1 negative, Equifax 7, TransUnion clean; first four items SIGNET BANK/VIRGINIA ChargeOff $4,798, CONNECTICUT CHILD SU Late60Days $17,148, SALLIE MAE STUDENT L AsAgreed $1,853, VERMONT OFFICE OF CH AsAgreed $521. That run prints outcome MANUAL_REVIEW and a $0 pre-approval (the sandbox's own name and address clash with the sim consumer), so use only its bureau summary and negative items. The "Why it matters" column prints blank, and some rows print raw codes such as "AsAgreed".
- **Business Duplication Map: MISSING.** No code in src/, vendor/, scripts/, db/ or docs/ generates it. Only sales-page HTML, ClickFunnels snapshots, the tracking allow-list and docs that say it is "promised on sales page" mention it. The page's "Rivera Supply LLC" sample was hand-written. The JSON says so and lists only real nearby content (the 5-step funding walk, the engine's business-age multiplier 0.5 / 1.0 / 2.0 at under 12 / under 24 / 24+ months, the roadmap's Month 5 business section), labeled as not the map.

**Wording.** The engine prints the brand as "FundHub" in a few lines ("at FundHub", "your FundHub advisor") and "fundhub confidential" on covers. Left exactly as printed. Letters carry today's date (October 2, 2026) because the letter writer stamps the run day; the sim pull date is September 4, 2026.

### W1 follow-up — one-file "consistent" re-run on the vendor sandbox: BLOCKED, stopped (2026-10-02)

Asked for: the whole engine on the sandbox bureau files, using the sandbox file's own identity, written to `w1-samples-consistent.json`. **Not written.** The file still prints MANUAL_REVIEW and $0 / $0 today, so I stopped as told. `w1-samples.json` above is unchanged and still valid.

**Command run (diagnosis only, writes nothing):** `env -u ANTHROPIC_BASE_URL node scripts/tmp/w1-probe-own-identity.mjs` (scratch, uncommitted). It calls `runCRSEngine` from vendor/underwriteiq-full/api/lite/crs/engine.js on the three sandbox files with the Experian file's own name and address.

**Exactly why:**
1. **The three files are three different people, not one file.** `tu.json` is a consumer in Denton TX 76201, `exp.json` is a consumer in San Antonio TX 78201, `efx.json` is a consumer in Wahiawa HI 96786. There is no single "own identity" for the set. Using the Experian consumer's own name and address removes the name clash (NAME_MISMATCH is gone). The three different ZIPs still raise ADDRESS_CONFLICT, but that one does not block (the gate passes it with lower confidence, identity-fraud-gate.js).
2. **The block is the report age.** The engine rule is: if no bureau report is 30 days old or newer, the file goes to MANUAL_REVIEW (`MAX_REPORT_AGE_DAYS = 30`, vendor/underwriteiq-full/api/lite/crs/identity-fraud-gate.js line 11; reason `ALL_REPORTS_STALE`). All three sandbox pulls are dated 2026-03-11 (`responseDetail.dateRequested`), so they are 205 days old on 2026-10-02. Result: outcome MANUAL_REVIEW ("Under Review"), `suppressedByOutcome: true`, current pre-approval $0, projected $0. No amount of identity matching fixes this; only the file's date does.
3. **Not a sample to show.** The app never passes a fixed date to the engine, and I did not make one up to force a different answer.

**Diagnosis only, not written to any sample file:** the engine does have a test option that sets "today" (`referenceDate`). With it set to 2026-03-12 the same input gives FUNDING_PLUS_REPAIR ("Conditionally Approved"), current $7,936, projected $19,841, no MANUAL_REVIEW. So the file does produce real amounts when it is fresh, and it would show these negatives. Using that option is a decision for the coordinator; it is not how the live app runs the engine.

**Raw codes do have engine labels.** The Credit Analysis negative-items table prints raw codes ("ChargeOff", "Late60Days", "AsAgreed") with a blank "Why it matters" column. The engine's own plain words for them are in `plainRating()` in `src/deliverables/derive.mjs`: AsAgreed = "Paying on time", ChargeOff = "Charge-off", CollectionOrChargeOff = "Collection or charge-off", BankruptcyOrWageEarnerPlan = "Bankruptcy or wage earner plan", TooNew = "Too new", NoDataAvailable = "No data available", LateNDays = "N days late" (Late60Days = "60 days late"). The roadmap's Month 1 steps already print those words for the same items. (A first note here said no label existed; that was wrong.)

## W2

Full data: `ops/workflows/2026-10-02-roadmap-sample-content/w2-lenders.json`. Names are as written in our book. All 12 are business credit card rows (online or in-branch table). All 12 logo files return HTTP 200 on fundhub.ai. EX = Experian, EQ = Equifax, TU = TransUnion.

The book has no dollar limits for any of these 12 in its limit columns. Only KeyBank has limits, and they sit in the advisor tips text. Everything else shows "none in book". Navy Federal is in the book only as a personal loan, so it is not on the list.

| # | Name (book) | Product in book | Limit / range in book | Bureau in book | Logo file | Pixels | Background | Quality |
|---|---|---|---|---|---|---|---|---|
| 1 | Chase | Business Ink Cash / Ink Unlimited / Ink Preferred | none | EX/EQ/TU | public/assets/lenders/chase.png | 128x128 | white (JPEG inside a .png name) | good |
| 2 | American Express | Business Gold / Blue Business Cash / Blue Business Plus | none | EX | public/assets/lenders/american-express.png | 32x32 | solid blue square | weak, pixelated, cropped |
| 3 | Bank of America | business credit card (no card name in book) | none | EX/EQ/TU | public/assets/lenders/bank-of-america.png | 128x128 | white | good |
| 4 | Capital One | business credit card (no card name in book) | none | EX/EQ/TU | public/assets/lenders/capital-one.png | 128x128 | white | ok, swoosh cropped, no wordmark |
| 5 | Citi | business credit card (no card name in book) | none | EQ | public/assets/lenders/citi.png | 128x128 | transparent | good |
| 6 | US Bank | Business Platinum / Business Leverage | none | EQ/TU | public/assets/lenders/us-bank.png | 64x64 | transparent corners | weak, plain red shield, soft |
| 7 | Wells Fargo | business credit card (no card name in book) | none | EX/EQ/TU | public/assets/lenders/wells-fargo.png | 128x128 | solid red tile (no transparency) | good |
| 8 | PNC Bank | business credit card (no card name in book) | none | EX/EQ | public/assets/lenders/pnc-bank.png | 128x128 | transparent | good |
| 9 | Truist | Business Cards (in-branch row) | none | EQ | public/assets/lenders/truist.png | 32x32 | transparent, dark lines | weak, pixelated, needs a light background |
| 10 | KeyBank | business credit card + unsecured business line of credit | Business Visa up to $25k and/or line of credit up to $50k (tips text) | EQ | public/assets/lenders/keybank.png | 128x128 | white | ok, key cropped, no wordmark |
| 11 | Fifth Third | business credit card (no card name in book) | none | EX | public/assets/lenders/fifth-third.png | 128x128 | white | good |
| 12 | Huntington Bank | business credit card (no card name in book) | none | EQ/TU | public/assets/lenders/huntington-bank.png | 128x128 | transparent | good |

Weak logos (every file in `public/assets/lenders/` is 16 to 192 px, mostly site icons): American Express, US Bank, Truist. Show them at or below native size. Swap-in alternates with good logos, also in the json: M&T Bank (128, white, TU), Synovus Bank (192, solid red, TU/EQ). Citizens Bank is in the book with "$15k card / $50k line of credit" but its logo is 16x16, so it is unusable.

Source of the book facts: `credentials/lenders-audit/lenders-unified-carl-merged.csv` (local, gitignored), checked against the live `lenders` table with a read-only SELECT. All 12 names are also in `docs/legacy-strong/lenders-legacy-strong.csv`, which carries bureaus for only 3 rows.

## W3 — manifest

(pending)

## W3 — manifest

- Page (not live): `marketing/landing-pages/slo/slo-01-sales.html` — sample dictionary `P` rebuilt: snapshot, analysis, roadmap, pack, lenders from w1-samples.json (sim file: $199,350 today → $221,500, $22,150 left on the table; scores 758/762/770; 3 cards; Month 1 + Month 2 exact) and w2-lenders.json (12 banks, logos, bureau blurred). Dispute pack: one complete Round 1 engine letter (sandbox account, shown as Sample Client) + R1–R6 list with locks; old 8-tab pack removed. Duplication: old hand-written sample kept, renamed Sample Client — waiting on Chris (keep or remove link). Name on all samples: Sample Client. New CSS: .sp-unlock, .sp-cut/.sp-blur (blur at section break), .sk bars, .sp-rounds, .sp-lenders; watermark fixed to gray inside the viewer.
- Copy (not live): "One payment, no contract" removed from checkout prose and total label; total label now "Get approved for the most funding".
- Draft: `marketing/landing-pages/slo/preview/samples-draft-build.mjs` → `samples-draft-share.html` (green new, amber Chris's call, red removed; Hide marks button).
- Proof: 390px Chromium, all six open, no script errors, 12 logos load, lint clean.
- Note: one-file engine re-run on the vendor sandbox is blocked (three different people, reports 205 days old → MANUAL_REVIEW, $0).

## Business Duplication Map

**Result: NOT FOUND. No code anywhere makes a Business Duplication Map. Nothing was built or wired.** (Agent, 2026-10-02.) Per the task, I did not build one from scratch.

**"RDIQ".** The word is not in the repo, git history, Claude memory, or past Claude or Cursor chats (the only hits are random letters inside base64 images). Read as UnderwriteIQ.

**What I searched.**
- Working tree, all of it, including `.cursor/`, `.claude/`, `ops/`, `marketing/`, `docs/`, `credentials/` (file names plus text files), and 1,084 gitignored text files. `apps/` and `content/` do not exist.
- Words: "Duplication Map", "duplication", `business_duplication`, `dup-map`, `duplicationMap`, "companies #2", "one to two aged", "Experian Business", "RDIQ", "aged compan", "shell LLC".
- Git: 1 local branch, 26 remote branches, 1 tag, `git log --all -S` for "Duplication", `duplication_map`, `business_duplication`, `RDIQ`, `dup-map`; 0 stashes; `git fsck --lost-found` (125 dangling commits, each one's own tree and its untracked-files tree searched).
- `~/.claude/projects/-Users-chrisstanbridge-Developer-fundhub-platform/memory/` and past Claude and Cursor chats for this repo.

**What the search found.**
- Every hit for the map is sales copy or tracking. Examples: the page and its drafts (`marketing/landing-pages/slo/`), ClickFunnels snapshots, the preview allow-list (`src/funnel/track.mjs`, `business_duplication_map`), `docs/tracking/tracking-spec.md`, and `docs/finance/capital-blueprint-next-2026-09-29.md`. That doc says: "Promised on sales page / Not listed in `UWIQ_DELIVERABLES_CONTENTS`".
- Git history: the map first shows up in `3a5b326a` ("Roadmap draft: add the Business Duplication Map as document six"), then `8b8995c8` ("free Business Duplication Map bonus"). Both are page commits. The page's "Rivera Supply LLC" sample was written by hand.
- The 2026-09-29 chat where Chris named it (Claude session `09c81e74`). Agent: "I won't build anything until I understand how you do it today." Chris: "ADD IT TO THE FUNNEL BRO." It was then added to the page only. Memory note `roadmap-offer-owner-calls.md` says "Not designed yet."
- UnderwriteIQ makes 4 HTML documents (`DELIVERABLE_DOCS` in `src/deliverables/index.mjs`) plus the letter pack. There is no sixth document. `UWIQ_DELIVERABLES_CONTENTS` (`src/config/offers.mjs`) does not list the map.

**Closest real parts (built, but none of them makes the map):**
1. `src/underwrite/company-audit.mjs` (on main since `7edde860`). It checks each company's name for risky words, checks its NAICS code against the low-risk list, and holds the shell-LLC rule (owner-set 2026-09-27): "Keep at least two. Open one new shell LLC each quarter". It also has the website and LinkedIn lines. **Nothing calls it.** Only its own test imports it.
2. `src/underwrite/funding-sequence.mjs` (on main since `7edde860`). The walk order is prime personal → personal funding → companies → lender list → apply forever. **Nothing calls it either.**
3. **Lost wiring for both, held only in a dangling stash.** Stash `187c17f020d0ddd12cd40d4b81769097fac5a56e` (2026-09-27 23:04, "hold unrelated work while shipping first-text split"). Nine earlier stashes from that day hold copies too. It changed these files:
   - `api/read/underwrite.mjs` and `src/underwrite/report.mjs` return `fundingSequence` and `companyAudit` on every UnderwriteIQ read.
   - `src/underwrite/black-report-client.mjs` adds `company_suggestions`.
   - `src/deliverables/roadmap.mjs` prints the website, LinkedIn and shell-LLC lines under "Step 5: Form Your LLC".
   - `src/slo/businesses.mjs` saves `naics`.
   
   The 2026-10-01 stash merge (`7edde860`) kept main's version of those files ("Stale stash code conflicts kept current main"), so this wiring is not on main. A dangling commit can be deleted at the next git cleanup.
4. `src/underwrite/business-funding.mjs`: stacked business funding per company by age, up to 20 companies. Age bands are 0.5× under 12 months, 1× under 24 months, 2× at 24+ months. Used by the read, the cockpit and closer-ready.
5. Experian Business pull: one report per saved company (`src/finance/crs-pull.mjs:281`, `orderBusinessReport` in `src/finance/crs-client.mjs`). Signals come from `vendor/underwriteiq-full/api/lite/crs/derive-business-signals.js` (Intelliscore, risk class, recommended limit, fraud shield).
6. `src/deliverables/roadmap.mjs` Month 5 "Business Milestone". It still prints DUNS and net-30 steps, which the owner calls rule out.

**Left for Chris.** Pick one:
- **(a)** Bring back the 2026-09-27 stash wiring (item 3). That puts the company audit lines in the roadmap and on the read. It is not a separate map document.
- **(b)** Build the map as a new sixth document from parts 1, 2, 4 and 5. That is new work, so it starts with the workflow questions in CLAUDE.md §3a.

No code changed. No tests run.

## Shipped — website (2026-10-02)

- Ship 44095339 (server, incl. queued buy box v2 slo-pull change): live, 330 db changes, 0 pending.
- ClickFunnels API push slo-297-sales (page 25516164) ok. Live https://apply.fundhub.ai/roadmap (cache-busted): new samples (11 unlock cards, Sample Client), 26 bank logos all load, "Get approved for the most funding", no "no contract"/"One payment", guarantee back, roadmap plan-length line.
- Live click test 390px: all six samples open with unlock card, 0 broken logos, checkout fields render, 0 page errors.
- Next: Business Duplication Map as real UnderwriteIQ document (agent building) → ship after.

## Business Duplication Map — build

**Status: done (agent, 2026-10-02). Committed locally, not shipped. The main session ships.**

What it is: the real document the /roadmap sample shows. It is the fifth hosted page of the UnderwriteIQ funding pack, next to the four analysis pages, and it is saved as its own document, so the client portal lists it with the others. Every number comes from the client's file and the engine. Anything missing prints as "not on the file".

Sections (same as the sample): 01 both files (personal decision, personal funding, card funding, business funding), 02 the Experian Business check per saved company (score, blemishes, balances, NAICS, name, each with its fix, and the engine's own business dollars for that company), 03 what a company gets by age, 04 an eight-quarter plan (one new company a quarter, plus each company's 12- and 24-month marks), 05 set up every company the same way (owner-set rules from company-audit.mjs). Experian Business only. No DUNS, no net-30, no vendor accounts.

Reused from the 2026-09-27 stash (187c17f0): company-audit.mjs (name and NAICS checks, website/LinkedIn/shell-LLC rules) and funding-sequence.mjs (the order). Its roadmap Step 5, black-report-client and read-endpoint edits were not applied: they change other documents.

**Change manifest**
- New `src/deliverables/business-duplication-map.mjs` — `duplicationMapFacts`, `buildBusinessDuplicationMap`, `renderBusinessDuplicationMapHtml`, `BUSINESS_DUPLICATION_MAP_DOC`, `AGE_BANDS`, `PLAN_QUARTERS`, helpers. Pure: no database, no engine call.
- `src/deliverables/index.mjs` — exports the map. `DELIVERABLE_DOCS` stays the four.
- `src/underwrite/letter-pack.mjs` — new exports `scoreCompanyReports` (the tier engine scores each stored Experian Business report, `crs_results.result.businessReports`) and `companiesFromRows`. `readBusinessOnFile` also returns `companies` (name, state, start date, NAICS from `entity_data`). `uiqDeliverablePdfs` adds the map after the four. A map failure never costs the four. New return field `duplicationMapSkip`. New `buildLetterPack` option `scoreCompanyReportsFn` (test seam). `deliverableCount` is now 5 on a full funding pack.
- `src/underwrite/funding-letter-pdf.mjs` — the saver knows `business_duplication_map` (subtype `business_duplication_map`, title "Business Duplication Map", text/html).
- `src/documents/kinds.mjs` — `business_duplication_map` added to the deliverable subtype list and titles.
- Wired for every caller of `buildLetterPackForClient(pack: "funding")`: the $297 SLO pack (`src/slo/deliver.mjs`), C-06, the closer deck, the Blueprint monthly pull. The portal's What You Own lists every deliverable row on file, so it shows with no portal change. No route, no migration, no env var.
- Tests: new `src/deliverables/business-duplication-map.test.mjs` (45: clean file with no business, clean file with two companies including blemishes and flagged name and NAICS, damaged REPAIR_ONLY file, missing data, plan, escaping) and `src/underwrite/letter-pack-duplication-map.test.mjs` (10: the pack carries it, the saver stores it, no-company and no-report cases, map failure keeps the four, repair pack has none). Updated counts in `letter-pack.test.mjs`, `funding-letter-pdf.test.mjs`, `output-baseline.test.mjs` (the map row is recorded) and `funding-letter-pdf.pg.test.mjs`.
- Proof run on this Mac, no database: lint clean, `npx tsc --noEmit` 0, new tests 55/55, `npm test` 11865 tests with the same 26 failures as clean HEAD ea65870f (failure names diffed: identical, none new). Chromium render at 390px and 1280px: no sideways scroll, no page errors.
- Journeys: `docs/journeys/business-duplication-map-flow.md` (new), `deliverables-actual.md`, `slo-offer-actual.md`, `CHANGELOG.md`. `client-actual.md` is generated from the route table; this adds no route, so it does not change.

## Business Duplication Map — open questions

1. **NAICS code on the pull form.** Nothing saves a NAICS code today (the $297 pull form saves name, address, state, EIN, start date). So every company's NAICS row prints "NOT ON FILE" with the low-risk list. Should the pull form ask for the NAICS code? Yes or no.
2. **Capital Blueprint contents.** The same funding pack goes to $5,000 Capital Blueprint buyers, so they get the map too. The closer deck's contents list (`UWIQ_DELIVERABLES_CONTENTS` in `src/config/offers.mjs`) does not name it. Should it? Yes or no.

## Business Duplication Map — leftovers (not fixed, not verified)

- `src/underwrite/output-baseline.test.mjs` "funding pack: same documents, same order" was already red on HEAD ea65870f: it records `.pdf` names and the pack makes `.html` pages. The map row is recorded; the old names are not touched.
- `src/underwrite/funding-letter-pdf.pg.test.mjs` was updated for the map but never run here: this Mac has no Postgres (no psql, no brew, no docker) and the agent cannot read `.env`. Run it against a scratch database before trusting it.
- `docs/journeys/` generated pages (client-actual and 8 more) were already stale on HEAD from other route changes. Not regenerated here.
- The funding delivery email (`src/messaging/templates/u02-funding-delivery.html`) lists five items and does not name the map.

## Step bar (not live)

- Owner ask 2026-10-02: drop the "Step 1 of 3" words; blue progress bar like the /apply survey (track #E4E4E7, fill #188bf6), a third per step; aria-valuetext keeps "Step n of 3" for screen readers. Test updated in src/http/slo-sales-widget-html.test.mjs. Draft section 7 on the shared link.
- Leftover card (not fixed, not this ask): `item 8: the lander never offers done-for-you` in src/http/slo-sales-widget-html.test.mjs fails on HEAD too — it expects old FAQ wording ("No. This is do-it-yourself...") that a copy round changed.
