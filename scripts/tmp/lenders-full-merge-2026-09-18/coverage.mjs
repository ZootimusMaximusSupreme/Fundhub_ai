#!/usr/bin/env node
/* Which rows in each lender source file are NOT in the live CRM yet?
   Matches on external_row_id first (what the loader uses), then on cleaned name. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, close } from "../../../src/db.mjs";
import { parseLenderCsv } from "../../../src/lenders/csv.mjs";
import { LENDER_CSV_COLUMNS } from "../../../src/lenders/tables.mjs";
import { isTipRow } from "../../../src/lenders/tips.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ALIAS = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/lenders-alias-map.json"), "utf8"));

const clean = (raw) => String(raw ?? "").toLowerCase()
  .replace(/[’`]/g, "'").replace(/&/g, " and ")
  .replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const key = (raw) => { const c = clean(raw); const i = ALIAS.lookup[c]; return i ? `inst:${i}` : `raw:${c}`; };
const isBlank = (v) => v == null || String(v).trim() === "";

const FILES = [
  "credentials/lenders-audit/lenders-audited-with-bureaus.csv",
  "credentials/lenders-audit/lenders-personal.csv",
  "credentials/lenders-audit/lenders-personal-loans-web.csv",
  "credentials/lenders-audit/lenders-unified-carl-merged.csv",
  "docs/legacy-strong/lenders-legacy-strong.csv"
];

const slug = process.env.DEFAULT_ORG_SLUG || "fundhub";
const org = await db.query(`SELECT id FROM orgs WHERE slug=$1 LIMIT 1`, [slug]);
const orgId = org.rows[0].id;
const existing = await db.query(
  `SELECT ${LENDER_CSV_COLUMNS.join(", ")} FROM lenders WHERE org_id=$1::uuid`, [orgId]);
const byId = new Map(existing.rows.filter(r => !isBlank(r.external_row_id)).map(r => [r.external_row_id, r]));
const byName = new Set(existing.rows.map(r => key(r.name)));

const report = {};
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { report[rel] = { error: "not on disk" }; continue; }
  const { rows } = parseLenderCsv(fs.readFileSync(abs, "utf8"));
  const banks = rows.filter(r => !isTipRow(r.name));
  const missingId = [], missingName = [], gaps = [];
  for (const b of banks) {
    const hit = b.external_row_id ? byId.get(b.external_row_id) : null;
    if (!hit) {
      (byName.has(key(b.name)) ? missingId : missingName).push(b.name);
      continue;
    }
    // row is in CRM — does the file hold a value the CRM is missing?
    const fills = LENDER_CSV_COLUMNS.filter(c =>
      c !== "lender_table" && c !== "name" && c !== "logo_path" &&
      !isBlank(b[c]) && isBlank(hit[c]));
    if (fills.length) gaps.push({ name: b.name, fills });
  }
  const byCol = {};
  for (const g of gaps) for (const c of g.fills) byCol[c] = (byCol[c] || 0) + 1;
  report[rel] = {
    banks: banks.length,
    in_crm: banks.length - missingId.length - missingName.length,
    not_in_crm_by_name: missingName.length,
    not_in_crm_names: missingName.slice(0, 40),
    id_mismatch_name_exists: missingId.length,
    id_mismatch_names: missingId.slice(0, 40),
    rows_with_a_value_crm_lacks: gaps.length,
    cells_crm_lacks_by_column: byCol
  };
}
console.log(JSON.stringify(report, null, 2));
await close();
