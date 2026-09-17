#!/usr/bin/env node
/**
 * Fill empty cells in a lender CSV from live CRM rows (matched on external_row_id).
 * Use before lenders-import-alec when the audit file is sparse but must not blank DB fields.
 *
 *   node --env-file=.env scripts/lenders-merge-crm-into-csv.mjs
 *   node --env-file=.env scripts/lenders-merge-crm-into-csv.mjs --in path.csv --out path-merged.csv
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, close } from "../src/db.mjs";
import { parseLenderCsv, serializeLenderCsv } from "../src/lenders/csv.mjs";
import { LENDER_CSV_COLUMNS } from "../src/lenders/tables.mjs";
import { isTipRow } from "../src/lenders/tips.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_IN = path.join(ROOT, "credentials/lenders-audit/lenders-audited.csv");
const DEFAULT_OUT = path.join(ROOT, "credentials/lenders-audit/lenders-audited-merged-for-import.csv");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}

const SLUG = arg("--org") || process.env.DEFAULT_ORG_SLUG || "fundhub";

function isBlank(v) {
  return v == null || String(v).trim() === "";
}

function hasValue(v) {
  return !isBlank(v);
}

/** Same columns import clearing checks (see lenders-import-alec.mjs wouldClear). */
const MERGE_COLS = LENDER_CSV_COLUMNS.filter((c) => c !== "lender_table" && c !== "name");

async function main() {
  const inPath = arg("--in")
    ? path.isAbsolute(arg("--in"))
      ? arg("--in")
      : path.join(ROOT, arg("--in"))
    : DEFAULT_IN;
  const outPath = arg("--out")
    ? path.isAbsolute(arg("--out"))
      ? arg("--out")
      : path.join(ROOT, arg("--out"))
    : DEFAULT_OUT;

  if (!fs.existsSync(inPath)) {
    console.error("Input file not found:", inPath);
    process.exit(1);
  }

  const text = fs.readFileSync(inPath, "utf8");
  const { rows, errors: parseErrors } = parseLenderCsv(text);
  const banks = rows.filter((r) => !isTipRow(r.name));

  const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [SLUG]);
  const orgId = org.rows[0]?.id;
  if (!orgId) {
    console.error("No company with slug", SLUG);
    process.exit(1);
  }

  const ids = banks.map((b) => b.external_row_id).filter(Boolean);
  const existing = await db.query(
    `SELECT external_row_id, name, ${MERGE_COLS.join(", ")}
       FROM lenders
      WHERE org_id = $1::uuid AND external_row_id = ANY($2::text[])`,
    [orgId, ids]
  );
  const byId = new Map(existing.rows.map((r) => [r.external_row_id, r]));

  let filledCells = 0;
  const filledByColumn = {};
  let wouldClearBefore = 0;
  let wouldClearAfter = 0;

  for (const bank of banks) {
    const current = bank.external_row_id ? byId.get(bank.external_row_id) : null;
    if (!current) continue;
    for (const col of MERGE_COLS) {
      const hasDb = hasValue(current[col]);
      const inFile = Object.prototype.hasOwnProperty.call(bank, col);
      const blankInFile = isBlank(bank[col]);
      if (hasDb && inFile && blankInFile) {
        wouldClearBefore++;
        bank[col] = current[col];
        filledCells++;
        filledByColumn[col] = (filledByColumn[col] || 0) + 1;
      }
    }
    for (const col of MERGE_COLS) {
      const hasDb = hasValue(current[col]);
      const inFile = Object.prototype.hasOwnProperty.call(bank, col);
      const blankInFile = isBlank(bank[col]);
      if (hasDb && inFile && blankInFile) wouldClearAfter++;
    }
  }

  const outRows = rows.map((r) => (isTipRow(r.name) ? r : banks.find((b) => b.external_row_id === r.external_row_id && b.name === r.name) || r));
  const merged = serializeLenderCsv(outRows.filter((r) => !isTipRow(r.name)));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, merged, "utf8");

  console.log(JSON.stringify({
    input: path.relative(ROOT, inPath),
    output: path.relative(ROOT, outPath),
    org: SLUG,
    banks: banks.length,
    matched_in_db: byId.size,
    parse_errors: parseErrors.length,
    cells_filled_from_db: filledCells,
    filled_by_column: filledByColumn,
    would_clear_cells_before_merge: wouldClearBefore,
    would_clear_cells_after_merge: wouldClearAfter
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => close());
