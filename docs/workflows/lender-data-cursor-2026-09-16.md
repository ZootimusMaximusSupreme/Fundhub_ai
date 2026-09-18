# Lender data Cursor batch — 2026-09-16

| Task | Owner | Status | Notes |
|---|---|---|---|
| A | Clean inquiry CSV | done | No separate file rewrite — `readInquiries()` in `lenders-extract-bureaus.mjs` normalises bureau typos at read time |
| B | Bureau + match | done | **2026-09-18:** all 4 Notion `FULL.md` present; book bureaus 3 → 46, DB bureau 82 → 102. See **Pipeline run — 2026-09-18**. **2026-09-17:** `--confirm` from legacy-strong only (4 Notion `FULL.md` still missing — skipped). Book bureaus **3 → 34**; merge/import kept DB at **81** (CRM backfill). Review `docs/workflows/lender-list-2026-09-05.md`. |
| C | Personal split | done | **2026-09-18:** all 5 personal dirs pulled; 21 rows extracted and imported (15 PersonalCC, 6 PersonalLoans). **2026-09-17:** pull auth failed — 5 personal dirs still **PAGE NOT FOUND**; dry/`--confirm` **0 rows**. |
| D | Import + ship | done | **2026-09-16:** `scripts/lenders-merge-crm-into-csv.mjs` → `credentials/lenders-audit/lenders-audited-merged-for-import.csv`. Clearing **172 → 0** (import guard; 457 CRM cells backfilled incl. logos). **Confirmed import:** 306 updated, 0 inserted. **DB after:** 307 banks, **287** logos (+2), **216** apply URLs (+1), 81 bureau, 37 ranking. Ship skipped (DB-only; logo PNGs already on disk). |
| E | Apply links + logos audit | done | Manifest `credentials/lenders-audit/manifest.json` · report `credentials/lenders-audit/AUDIT-REPORT.md` · apply → `lenders-audited.csv` (2026-09-16 run: 152 complete, 90 needs_research, ~17 min) |
| F | Logo fetch (bank sites) | done | Missing-only run 2026-09-16 ~21:46 PT — see **Task F report** below |
| G | Notion re-scrape | done | **2026-09-18 (verify):** `token_v2` OK; pull **exit 1** on `Bank-Phone-Database` (navigation destroyed context); **425** folders on disk; organize OK → all **9** extract paths. Transcribe skipped (no ffmpeg). **2026-09-18:** pull finished — **425** folders, organize wrote 425 `FULL.md`. All 9 extract paths on disk. **2026-09-17:** Profile + Cookies present after `notion:login`. Pull hits **“Sign in to see this page in Legacy Strong”** (headless + `NOTION_HEADFUL=1`); **0** sidebar seeds; only junk folder `notion--8f2a819d` (login interstitial). `start-url.txt` written (Vault). Pull script now uses `channel: "chrome"`. **Fix:** re-run `npm run notion:login`, open Legacy Strong sidebar, Enter; then `npm run notion:pull` → `npm run notion:organize` (skip transcribe if no ffmpeg). |

## Scrape locate — 2026-09-16 (subagent)

Chris: Notion was already scraped. Agents blocked by looking only at `credentials/notion-scrape/profile/` and `credentials/notion-scrape/output/*/FULL.md`.

### Where data actually lives on this Mac

| Location | What | Status |
|---|---|---|
| `docs/legacy-strong/` | 2026-09-05 rescrape via `notion-rescrape-datapoints.mjs` — `bank-datapoints-active-banks.md` (26), `inquiry-master-database.csv` (5,472), `state-funding-boards.md`, `bankers-rms.md`, `lenders-legacy-strong.csv` (313), `full-inquiry-database.csv` | **Present** (tracked in git) |
| `credentials/notion-scrape/output/` | Expected home for page trees (`FULL.md`, `page.md`, `meta.json`, `INDEX.md`) per `scripts/notion-scrape/lib.mjs` | **Only** seed copy `lenders-legacy-strong.csv` (132K). **No** `profile/`, **no** subfolders, **no** `FULL.md`, **no** `page.md` |
| `fundhub-docs/` | Not a Notion dump — 3 files under `sources/` (Airtable, SMS, email templates) | Unrelated |
| `docs/legacy-strong/README.md` | Documents gitignored scrape dirs that **should** sit under `credentials/notion-scrape/output/` (`bank-datapoints--0f247723/`, etc.) | Those dirs **not on disk** |

### Machine-wide search (2026-09-16)

- `mdfind` / `find` under `/Users/chrisstanbridge`: **0** files named `FULL.md`; **0** dirs `*--29ac3aa7`, `*--26a2ec40`, or `nov-datapoint-drop*`; **0** `page.md` in a notion-scrape tree.
- Only `notion-scrape` dirs on machine: `scripts/notion-scrape/` (code) and `credentials/notion-scrape/` (csv only).

### Exact paths required by extract scripts

**`scripts/notion-scrape/lib.mjs`:** `PROFILE_DIR` = `credentials/notion-scrape/profile`; `OUTPUT_DIR` = `credentials/notion-scrape/output`; folders = `<slug>--<first 8 hex of page id>/`.

**`scripts/lenders-extract-bureaus.mjs` `SOURCES` (besides book + legacy-strong files):**

1. `credentials/notion-scrape/output/nov-datapoint-drop-cca-network--29ac3aa7/FULL.md`
2. `credentials/notion-scrape/output/the-perfect-funding-sequence--2edc3aa7/FULL.md`
3. `credentials/notion-scrape/output/details-aged-corp--1b8c3aa7/FULL.md`
4. `credentials/notion-scrape/output/crafting-the-perfect-funding-sequence--acf9a724/FULL.md`

Also reads: `docs/legacy-strong/bank-datapoints-active-banks.md`, `inquiry-master-database.csv`, `state-funding-boards.md`; book = `credentials/lenders-audit/lenders-audited.csv`.

**`scripts/lenders-extract-personal.mjs`:** each dir under `credentials/notion-scrape/output/` with `page.md`:

1. `alec-s-favorite-personal-cards--26a2ec40`
2. `high-limit-personal-cards--9cafa36e`
3. `best-balance-transfer-cards--f9e698f9`
4. `personal-loans--677b0a52`
5. `balance-transfers--6aaef26e`

### Copy / symlink

**Not done** — no source tree found to copy or symlink without deleting anything. Prior successful bureau run (2026-09-05, `docs/workflows/lender-list-2026-09-05.md`) implies those files existed on **some** machine then; they are not on this laptop now.

### Extract runs (2026-09-16)

| Script | Result |
|---|---|
| `node scripts/lenders-extract-bureaus.mjs` (dry) | **FAIL** — ENOENT first Notion file (`nov-datapoint-drop-cca-network--29ac3aa7/FULL.md`) |
| `node scripts/lenders-extract-personal.mjs` (dry) | **PASS** (no write) — all 5 pages **PAGE NOT FOUND**; **0 rows** would add |
| `--confirm` for either | **Not run** (blocked) |

**Import / ship:** skipped (no extract outputs).

## G attempt — 2026-09-16 (Cursor subagent)

**Profile / login (`scripts/notion-scrape/lib.mjs`):**

- `PROFILE_DIR` = `credentials/notion-scrape/profile` (persistent Chrome via Playwright `channel: "chrome"`, headless).
- `OUTPUT_DIR` = `credentials/notion-scrape/output`.
- Rescrape script writes `page.md` + `database-table.*` per target hub — **not** the child-page `FULL.md` trees bureau extract needs.

**Scrape:** **FAIL / not run** — `PROFILE_MISSING` on this Mac. Only `credentials/notion-scrape/output/lenders-legacy-strong.csv` exists (seed copy).

**After check — dirs present under `output/`:** none of the 9 required folders (4 bureau `FULL.md` paths + 5 personal `page.md` dirs).

**Bureau dry-run:** **not run** — `node scripts/lenders-extract-bureaus.mjs` exits ENOENT on `nov-datapoint-drop-cca-network--29ac3aa7/FULL.md`.

**Personal extract:** **not run** (blocked on G).

**Unblock G (pick one):**

1. Copy `credentials/notion-scrape/` (profile + `output/*` with `FULL.md` / personal `page.md`) from a machine that already pulled Legacy Strong Notion.
2. On this Mac: `npm run notion:login` (one interactive Chrome login), then `npm run notion:pull` → `npm run notion:organize` (writes `credentials/notion-scrape/output/<folder>/FULL.md` — **not** `notion-rescrape-datapoints.mjs` alone). Then bureau `--confirm` and personal `--confirm`.

**After G unblocks:** Re-run [Notion rescrape](b046bcab-7e40-485f-b552-729f10a214d4) lane or this chat for tasks B + C only.

## Pipeline run — 2026-09-17 (Cursor subagent)

| Step | Result |
|---|---|
| Profile check | `credentials/notion-scrape/profile/Default/Cookies` present |
| `npm run notion:all` | **FAIL auth** — pull saved login wall only; transcribe skipped (no ffmpeg / no pages) |
| `lenders-extract-bureaus.mjs --confirm` | **PASS** — skipped 4 missing Notion files; wrote `lenders-audited-with-bureaus.csv` + review md |
| `lenders-extract-personal.mjs --confirm` | **Not run** (0 rows; pages missing) |
| merge CRM | **338** cells filled; clearing **0** |
| import `--confirm` | **306 updated**, 0 inserted; DB **81** bureau, **287** logo, **37** ranking |
| Ship | Pending commit (pull script + review md); DB-only import may no-op ship |

**Notion output folders:** none of the 9 required (`4× FULL.md` + `5× personal page.md`). Only `notion--8f2a819d` (failed auth scrape).

## Seeded (2026-09-16)

- `credentials/notion-scrape/output/lenders-legacy-strong.csv` ← copy of `docs/legacy-strong/`
- `credentials/lenders-audit/lenders-audited.csv` ← same (starting book until audit apply)

## Script map (logos + apply links)

| Command | What |
|---|---|
| `npm run lenders:audit` | `scripts/lenders-audit/run.mjs` — verify/discover apply URLs, download logos (Clearbit/favicon; known bug on shared card sites) |
| `npm run lenders:audit:apply` | Writes `lenders-audited.csv` + `logo-path-by-external-id.json` from manifest |
| `node scripts/lenders-logos/fetch-logos.mjs` | Better logos from bank websites (missing/wrong) |
| `node scripts/lenders-extract-bureaus.mjs --confirm` | Fills bureaus on full 45-col book |
| `node scripts/lenders-extract-personal.mjs --confirm` | Personal rows from Notion pages |
| `node --env-file=.env scripts/lenders-merge-crm-into-csv.mjs` | Backfill empty audit CSV cells from CRM (avoids clearing guard) |
| `node --env-file=.env scripts/lenders-import-alec.mjs --confirm` | Load into DB |
| `npm run ship` | Deploy + migrate (owner law — end of session if main changed) |

## Task F report (2026-09-16)

**Pre-check**

| Check | Value |
|---|---|
| PNG count `public/assets/lenders/` (before) | **244** |
| `targets.mjs` `MISSING` list | **33** rows (+ `NOT_A_BANK`: local-bank-options) |
| Dry run | 33 targets; sandbox had no network → all `site_unreachable` (not representative) |

**Run:** `node scripts/lenders-logos/fetch-logos.mjs` (missing only, no `--all`)

| Metric | Count |
|---|---|
| PNG count (after) | **244** (14 slugs written/refreshed; net file count unchanged — those slugs likely already had PNGs from audit) |
| Saved, confirmed | **14** |
| Saved, needs eye | **0** |
| Refused (wrong company / M&A redirect) | **4** (3 unique banks) |
| Still no logo | **15** (13 unique slugs; Blue Valley + Evergreen dup rows) |
| Skipped not a bank | **1** |

**Saved (confirmed):** associated-bank, desert-financial-cu, evertrust-bank, first-bank-alaska, first-national-bank-texas, local-first-bank, new-field-national-bank-0, northwest-savings-bank, sabine-state-bank, synovus-bank, the-farmers-bank, trustmark-national-bank, valley-national-bank, washington-state-bank

**Refused:** Evergreen Bank Group ×2 → oldsecond.com; First Midwest Bank → oldnational.com; TCF Bank → huntington.com

**Still no logo:** Bank of Blue Valley ×2, Bank of Utah, Citywide Banks, Columbia State Bank, Community Trust Bank, Cornerstone Bank, Dubuque Bank and Trust, East Boston Savings Bank, Hilltop Bank, Illinois Bank and Trust, Minnesota Bank and Trust, Rocky Mountain Bank, The First Bank, Wisconsin Bank and Trust

**Artifact:** `scripts/lenders-logos/last-run.json` (`ran_at`: 2026-09-17T04:46:34.082Z)

**Not run:** ship, DB import, WRONG list (22 banks — separate pass with `--wrong` or extend targets)

## Task D dry run (2026-09-16)

**Command:** `node --env-file=.env scripts/lenders-import-alec.mjs --file credentials/lenders-audit/lenders-audited.csv`

| | DB (before) | File |
|---|---:|---:|
| Banks | 307 | 306 (+ 7 tip rows skipped) |
| With logo | 285 | 287 |
| With `application_url` | 215 | 212 |
| With bureau | 81 | 3 |
| With ranking | 37 | 0 |

**Clearing guard:** **172** values across **84** banks — import **not** confirmed.

**After:** unchanged (no write).

**Ship:** skipped until import passes or owner chooses logo-only commit without DB load.

## Task D merge + import (2026-09-16)

**Merge:** `node --env-file=.env scripts/lenders-merge-crm-into-csv.mjs`

| Metric | Value |
|---|---:|
| Cells filled from CRM | 457 |
| Import would-clear (audit file alone) | 172 |
| Import would-clear (merged file) | 0 |

**Filled by column (CRM → CSV):** `logo_path` 285, `bureaus_pulled` 78, `priority_tier` 37, `minimum_deposit` 35, `requires_account_opening` 18, `application_url` 4 (kept DB URL only where audit cell was empty).

**Import:** `--file credentials/lenders-audit/lenders-audited-merged-for-import.csv --confirm`

| | Before | After |
|---|---:|---:|
| Banks | 307 | 307 |
| With logo | 285 | **287** |
| With `application_url` | 215 | **216** |
| With bureau | 81 | 81 |
| With ranking | 37 | 37 |

**Import stats:** `updated` 306, `imported` 0, errors 0.

**Ship:** not run (no tracked asset change required for DB load).

## Status 2026-09-18

- **David sent-mail docs (checked):** Sent **Fwd: ISO Onboarding** (2026-09-08) — four Accord ISO PDFs in `credentials/david-email-docs-2026-09-18/`. **Not duplicate** of lender book / Notion / legacy-strong. **Skip re-ingest** for lender pipeline.
- **Gmail:** Token minted 2026-09-18 (`~/.config/fundhub/google-token.json`). Probe OK (oauth via path). **7 sent** threads to `daramirez10171@gmail.com` (e.g. Fwd ISO Onboarding Sep 2026, Carl Barton list Dec 2025, Fwd BAG Aug 2025). Netlify `GOOGLE_GMAIL_OAUTH_TOKEN_JSON` **set** (secret, production + deploy-preview + branch-deploy) from the token file; live refresh + `users/me/profile` 200 before setting. `GOOGLE_DRIVE_OAUTH_TOKEN_JSON` left untouched.
- **Notion pull:** **finished.** **425** output folders, `npm run notion:organize` written → **425** `FULL.md` + `INDEX.md`. All **9** paths the extracts need are now on disk (4 bureau `FULL.md`, 5 personal `page.md`).
- **Lenders:** pipeline finished on the completed pull — see **Pipeline run — 2026-09-18** below.

## Pipeline run — 2026-09-18 (Cursor subagent)

Ran only after `notion-legacy-pull.mjs --pull` exited. Task **G unblocked**, which unblocked **B** and **C**.

| Step | Result |
|---|---|
| `npm run notion:organize` | **PASS** — 425 pages organized; the 2 bureau `FULL.md` that were missing (`details-aged-corp`, `crafting-the-perfect-funding-sequence`) now written |
| `lenders-extract-bureaus.mjs` (dry) | Book bureaus **3 → 46** (last run was 3 → 34; the 2 new Notion pages added 12). Ranking 0 → 37, deposit 0 → 35, open-account 41 → 59. Safety check passed, all 46 columns kept |
| `lenders-extract-bureaus.mjs --confirm` | **PASS** — wrote `lenders-audited-with-bureaus.csv` + `docs/workflows/lender-list-2026-09-05.md` |
| `lenders-extract-personal.mjs` (dry) | **21 rows** (15 PersonalCC, 6 PersonalLoans), 20 with a bureau — was **0 rows** while the pages were missing |
| `lenders-extract-personal.mjs --confirm` | **PASS** — wrote `lenders-personal.csv` |
| merge CRM (bureaus file) | **327** cells filled; would-clear **327 → 0**. No `--allow-clearing` |
| import merged book `--confirm` | 306 updated, 0 inserted, 0 errors |
| import `lenders-personal.csv` `--confirm` | **21 inserted**, 0 updated, 0 errors. Dry run first: nothing blanked |

**DB after:** **328** banks (307 → 328), **102** with a bureau (82 → 102), **303** with a logo (287 → 303), 37 ranking.

**Left for Chris to name (not written — no bank-name match):** `BestEgg`, `We Florida Financial in South Florida`, and one stray `Page ID: 9cafa36e…` line on High limit personal cards. 3 business cards on the balance-transfer page were left alone on purpose (already business rows).

**Task status now:** B **done** · C **done** (was blocked) · G **done** (was blocked auth).

## Pipeline run — 2026-09-18 (verify session dd5618df)

Chris off phone; Legacy Strong auth confirmed (`token_v2`).

| Step | Result |
|---|---|
| `npm run notion:pull` | **exit 1** once — `page.evaluate: Execution context was destroyed` on Bank-Phone-Database (~38 min in). **425** output folders on disk. Token/auth not the blocker. |
| `npm run notion:organize` | **PASS** — 425 pages → `INDEX.md` + `FULL.md` |
| 9 required paths | **9/9** — 4 bureau `FULL.md` + 5 personal `page.md` |
| `lenders-extract-bureaus.mjs --confirm` | Book bureaus **3 → 46** (same as prior run) |
| `lenders-extract-personal.mjs --confirm` | **21 rows** (15 PersonalCC, 6 PersonalLoans) |
| merge CRM (with-bureaus) | **327** cells; would-clear **327 → 0** |
| import merged book `--confirm` | **306 updated**, 0 inserted |
| import personal `--confirm` | **21 updated**, 0 inserted (rows already in DB) |
| `npm run ship` | **done** later same day — **`2dc9f1b8`** board + **`816d193d`** inventory; live **`a416303f`** (`/api/health` pending **0**) |

**DB after (live):** **328** banks · **102** with bureau · **303** logos · **37** ranking.

## Notion scrape inventory 2026-09-18

**Pull script scope (`notion-legacy-pull.mjs`):** Starts from saved Legacy Strong URL (The Vault). Collects **every** `/p/legacystrong/` link visible in the sidebar **plus** every in-page child link, BFS until the queue is empty — **not** Vault-only. Does **not** use the Notion API. Hub database tables may be thin in `page.md` unless `notion-rescrape-datapoints.mjs` is run (Load more + row extract).

**On disk:** `credentials/notion-scrape/output/` — **425** page folders (each: `page.md`, `meta.json`, `FULL.md` after organize). Index: `INDEX.md`, `manifest.json` (425 pages, 208 video embeds, 0 transcripts). Rescrape log: `rescrape-datapoints-log.json` (Deep State **50** table rows; Bank Datapoints / Bankers / State Boards **0** rows this run — full text still in crawl folders).

| Bucket | Folder(s) | In CRM lenders DB? |
|---|---|---|
| Deep State Datapoints | `deep-state-datapoints--253c3aa7/` (~1.7K `FULL.md` + rescrape `database-table.*`) | **No** — narrative/datapoint hub; not an import source |
| Perfect Funding Sequence | `the-perfect-funding-sequence--2edc3aa7/`, `the-perfect-funding-sequence-aged-corps--2edc3aa7/`, `crafting-the-perfect-funding-sequence--acf9a724/` | **Partial** — bureau extract reads crafting + aged-corp + sequence `FULL.md` for **bank bureau** fields only; sequence copy stays on disk |
| Application strategy / tips | `application-tips--24f78953/`, `submitting-applications--1e5c3aa7/`, `multiple-partner-llc-applications--7f178633/`, plus dispute/BBB pages in INDEX | **No** — no import script for strategy prose |
| NOV datapoint drop | `nov-datapoint-drop-cca-network--29ac3aa7/` (~10K `FULL.md`) | **Yes (bureau only)** — used by `lenders-extract-bureaus.mjs` |
| Bank datapoints hub | `bank-datapoints--0f247723/` | **Yes (legacy)** — git copy also in `docs/legacy-strong/bank-datapoints-active-banks.md` |
| Personal 5 (extract script) | `alec-s-favorite-personal-cards--26a2ec40`, `high-limit-personal-cards--9cafa36e`, `best-balance-transfer-cards--f9e698f9`, `personal-loans--677b0a52`, `balance-transfers--6aaef26e` | **Yes** — `lenders-personal.csv` → **21** personal product rows loaded |
| State boards / RMs / Bankers | `state-funding-boards--409f6157`, `rms--d42db2db`, `bankers--58819778` | **Partial** — boards/inquiries via `docs/legacy-strong/` + bureau extract; hub pages on disk for staff reference |

**Everything else (~400 folders):** credit repair courses, ads/SOPs, client portals, funding forum, marketing funnels, etc. — **disk + INDEX only**; intentionally not modeled in CRM unless a future import is added.

**Lenders DB after this scrape + import:** **328** banks · **102** with `bureaus_pulled` · **303** logos · **37** ranking. Business book import: **306 updated**. Personal import: **21 updated** (same slug rows; no new bank count).

## Where comprehensive materials live (2026-09-18)

| Source | What it actually holds |
|---|---|
| **Notion scrape** (`credentials/notion-scrape/output/`, **425** pages) | Full Legacy Strong workspace capture: bank bureau hubs, NOV drop, Deep State, funding sequences, application strategy/tips, personal 5, plus ~400 reference pages (disk; strategy prose not in CRM). |
| **`docs/legacy-strong/`** (git) | 313-row business book CSV, inquiry master (**5,472** rows — bureau hints, not 5k CRM banks), **`carl-barton-0apr-business-cards.csv`** (**921** rows / **865** unique names), bank-datapoints markdown, state boards. |
| **Live CRM `lenders`** | **328** structured products (business + personal), **102** with bureau — the operational book, not every Notion paragraph. |
| **David sent mail** | **2026-09-08:** Accord ISO PDFs only (not the bank book). **2025-12-01:** Carl Barton list — PDF link → public Notion DB (see **Carl Barton source** below). |
| **Carl Barton (gitignored raw)** | `credentials/carl-barton-2026-09-18/` — email, PDF, full JSON/CSV, 10 intel `.xlsx`. Organized copy in git: `docs/legacy-strong/carl-barton-0apr-business-cards.csv`. |

## Carl Barton source (2026-09-18)

- **Link:** Sent PDF → `https://offers.calbartoncashback.com/Database-Download` → public Notion **0% APR Business Credit Card Database** (**921** rows).
- **Vs our book:** **98** name overlaps with live **328**; **~767** names not in CRM (mostly CUs / regionals). Not a duplicate of Legacy Strong Notion scrape (`calbarton` vs `legacystrong`).
- **Intel:** 10 public Google Sheets (Chase, Amex, WF, USB, BofA, CapOne, Truist, Citi, PNC, Citizens) saved as `.xlsx` under credentials (pattern/reference — not imported).
- **CRM import:** **not run** — needs name-match + state-field cleanup (`depa`-style typos) before merge/import. Next: map columns to `lenders` (`bureaus_pulled`, `application_url`, `eligible_states`, etc.) with merge guard clearing **0**.

## Carl Barton name match — 2026-09-18 (Cursor subagent)

Full pull re-run: the first scrape stopped at Notion's **500**-row page while `sizeHint` said **921**. Paginated `queryCollection` returns all **921** offer rows (**867** unique bank names after the alias-map clean).

**Match rule:** `scripts/lenders-alias-map.json` `how_to_use` exactly — clean, whole-name lookup, **no fuzzy matching**. Baseline = live CRM `lenders` + `lenders-legacy-strong.csv` + `lenders-audited.csv` (**273** unique names).

| | Count |
|---|---:|
| Offer rows | 921 |
| Unique bank names | 867 |
| **Already in the book (duplicate)** | **101** |
| **Not in the book (new)** | **766** |
| Resolved by alias map | 105 |
| Rows carrying an apply URL | 919 |
| “new” names that read as credit unions | 65 |

**Artifact:** `docs/legacy-strong/carl-barton-book-match.csv` (867 rows — `status` / `carl_name` / `canonical_name` / `book_name` / `offer_rows` / `bureaus` / `has_url`). Gitignored copy at `credentials/lenders-audit/carl-barton-vs-book.csv`.

**Data quality in the source:** 69 names padded with stray whitespace/newlines · 1 row has a URL sitting in the `Bureau Pulled` cell · 2 rows have no link · `Eligible States` holds the `depa` typo already noted above.

**DB import: NO.** `lenders-import-alec.mjs` matches only on `external_row_id`, and this source has none — every one of the **867** would land as a fresh INSERT, taking the book from 328 to ~1,100 rows of unvetted card offers. The merge guard would report clearing 0 only because nothing matches to clear, which is a false green, not a pass. The 766 also have no alias-map entry, and the map's own rule is “if it is not in `lookup`, stop — do not fuzzy-match and do not guess.”

**Recommended next step (needs Chris to name it):** treat the **101** duplicates as a *bureau + apply-URL + eligible_states backfill* onto existing rows only — join through `carl-barton-book-match.csv` `book_name` → `external_row_id`, fill empty cells, run the merge guard, import. Leave the **766** as a sourced prospect list in `docs/legacy-strong/` until he decides whether small CUs and regionals belong in the operational book.

**States + live filter (`src/lenders/match.mjs`):** Carl **`Eligible States`** pulled (**885**/921 rows filled). CRM already filters suggestions on **client home state + business state** vs each lender's `eligible_states` (empty = still show). Before backfill: normalize Carl → book (`depa`→PA; **`Nationwide`→`All States`** — matcher does not treat the word Nationwide as national-only). No second filter; same column once merged.
