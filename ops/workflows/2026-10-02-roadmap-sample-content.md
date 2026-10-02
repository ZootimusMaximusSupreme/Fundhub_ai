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
