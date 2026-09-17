# Lender data Cursor batch — 2026-09-16

| Task | Owner | Status | Notes |
|---|---|---|---|
| A | Clean inquiry CSV | done | No separate file rewrite — `readInquiries()` in `lenders-extract-bureaus.mjs` normalises bureau typos at read time |
| B | Bureau + match | blocked | Needs 4× `FULL.md` under `credentials/notion-scrape/output/` — none on Mac; dry-run ENOENT on first file |
| C | Personal split | blocked | Needs 5 personal page dirs + `page.md` — all missing; blocked on G |
| D | Import + ship | done | **2026-09-16:** `scripts/lenders-merge-crm-into-csv.mjs` → `credentials/lenders-audit/lenders-audited-merged-for-import.csv`. Clearing **172 → 0** (import guard; 457 CRM cells backfilled incl. logos). **Confirmed import:** 306 updated, 0 inserted. **DB after:** 307 banks, **287** logos (+2), **216** apply URLs (+1), 81 bureau, 37 ranking. Ship skipped (DB-only; logo PNGs already on disk). |
| E | Apply links + logos audit | done | Manifest `credentials/lenders-audit/manifest.json` · report `credentials/lenders-audit/AUDIT-REPORT.md` · apply → `lenders-audited.csv` (2026-09-16 run: 152 complete, 90 needs_research, ~17 min) |
| F | Logo fetch (bank sites) | done | Missing-only run 2026-09-16 ~21:46 PT — see **Task F report** below |
| G | Notion re-scrape | blocked | No `credentials/notion-scrape/profile/` (Playwright persistent context); scrape not attempted — would not be logged in |

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
