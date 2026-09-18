# Lender data Cursor batch — 2026-09-16

| Task | Owner | Status | Notes |
|---|---|---|---|
| A | Clean inquiry CSV | done | No separate file rewrite — `readInquiries()` in `lenders-extract-bureaus.mjs` normalises bureau typos at read time |
| B | Bureau + match | partial | **2026-09-17:** `--confirm` from legacy-strong only (4 Notion `FULL.md` still missing — skipped). Book bureaus **3 → 34**; merge/import kept DB at **81** (CRM backfill). Review `docs/workflows/lender-list-2026-09-05.md`. |
| C | Personal split | blocked | **2026-09-17:** pull auth failed — 5 personal dirs still **PAGE NOT FOUND**; dry/`--confirm` **0 rows**. |
| D | Import + ship | done | **2026-09-16:** `scripts/lenders-merge-crm-into-csv.mjs` → `credentials/lenders-audit/lenders-audited-merged-for-import.csv`. Clearing **172 → 0** (import guard; 457 CRM cells backfilled incl. logos). **Confirmed import:** 306 updated, 0 inserted. **DB after:** 307 banks, **287** logos (+2), **216** apply URLs (+1), 81 bureau, 37 ranking. Ship skipped (DB-only; logo PNGs already on disk). |
| E | Apply links + logos audit | done | Manifest `credentials/lenders-audit/manifest.json` · report `credentials/lenders-audit/AUDIT-REPORT.md` · apply → `lenders-audited.csv` (2026-09-16 run: 152 complete, 90 needs_research, ~17 min) |
| F | Logo fetch (bank sites) | done | Missing-only run 2026-09-16 ~21:46 PT — see **Task F report** below |
| G | Notion re-scrape | blocked (auth) | **2026-09-17:** Profile + Cookies present after `notion:login`. Pull hits **“Sign in to see this page in Legacy Strong”** (headless + `NOTION_HEADFUL=1`); **0** sidebar seeds; only junk folder `notion--8f2a819d` (login interstitial). `start-url.txt` written (Vault). Pull script now uses `channel: "chrome"`. **Fix:** re-run `npm run notion:login`, open Legacy Strong sidebar, Enter; then `npm run notion:pull` → `npm run notion:organize` (skip transcribe if no ffmpeg). |

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

- **Gmail:** Token minted 2026-09-18 (`~/.config/fundhub/google-token.json`). Probe OK (oauth via path). **7 sent** threads to `daramirez10171@gmail.com` (e.g. Fwd ISO Onboarding Sep 2026, Carl Barton list Dec 2025, Fwd BAG Aug 2025). Netlify `GOOGLE_GMAIL_OAUTH_TOKEN_JSON` still masked — set from file + ship when owner wants live functions to read mail.
- **Notion pull:** `npm run notion:pull` still running (~180 output folders). Bureau hubs `nov-datapoint-drop`, `the-perfect-funding-sequence`, `details-aged-corp` on disk; `crafting-the-perfect-funding-sequence--acf9a724` and all five personal-card dirs **not** yet.
- **Lenders:** Task D import done (306 updated) — **no redo**.
