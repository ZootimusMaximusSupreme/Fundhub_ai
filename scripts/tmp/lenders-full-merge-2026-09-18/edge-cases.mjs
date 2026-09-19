#!/usr/bin/env node
/* The two rows the coverage pass could not match by id: the folded Elan keeper,
   and the two personal-loan rows the Notion extract ids differently. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, close } from "../../../src/db.mjs";
import { parseLenderCsv } from "../../../src/lenders/csv.mjs";
import { LENDER_CSV_COLUMNS } from "../../../src/lenders/tables.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const isBlank = (v) => v == null || String(v).trim() === "";
const slug = process.env.DEFAULT_ORG_SLUG || "fundhub";
const org = await db.query(`SELECT id FROM orgs WHERE slug=$1 LIMIT 1`, [slug]);
const orgId = org.rows[0].id;

const live = await db.query(
  `SELECT ${LENDER_CSV_COLUMNS.join(", ")} FROM lenders
    WHERE org_id=$1::uuid AND (name ILIKE '%elan%' OR name ILIKE '%best egg%' OR name ILIKE '%we florida%')
    ORDER BY name`, [orgId]);

const book = parseLenderCsv(fs.readFileSync(
  path.join(ROOT, "credentials/lenders-audit/lenders-audited-with-bureaus.csv"), "utf8")).rows;
const personal = parseLenderCsv(fs.readFileSync(
  path.join(ROOT, "credentials/lenders-audit/lenders-personal.csv"), "utf8")).rows;

const COLS = LENDER_CSV_COLUMNS.filter(c => c !== "logo_path");

function gapsAgainst(liveRow, fileRows, label) {
  const out = {};
  for (const f of fileRows) {
    for (const c of COLS) {
      if (isBlank(f[c]) || !isBlank(liveRow[c])) continue;
      (out[c] ||= []).push({ from: f.external_row_id || f.name, value: String(f[c]).slice(0, 120) });
    }
  }
  return { label, live_id: liveRow.external_row_id, live_name: liveRow.name, crm_missing: out };
}

const elanLive = live.rows.filter(r => /elan/i.test(r.name));
const elanFile = book.filter(r => /elan/i.test(r.name));
const out = { elan_live_rows: elanLive.length, elan_file_rows: elanFile.length, elan: [] };
for (const l of elanLive) out.elan.push(gapsAgainst(l, elanFile, "elan"));
out.elan_file_detail = elanFile.map(r => ({
  id: r.external_row_id, name: r.name, tier: r.priority_tier,
  bureau: r.bureaus_pulled, deposit: r.minimum_deposit, states: String(r.eligible_states || "").slice(0, 60)
}));
out.elan_live_detail = elanLive.map(r => ({
  id: r.external_row_id, name: r.name, tier: r.priority_tier,
  bureau: r.bureaus_pulled, deposit: r.minimum_deposit, states: String(r.eligible_states || "").slice(0, 60)
}));

out.personal = [];
for (const nm of ["Best Egg", "We Florida Financial"]) {
  const l = live.rows.find(r => r.name.toLowerCase() === nm.toLowerCase());
  const f = personal.filter(r => r.name.toLowerCase() === nm.toLowerCase());
  out.personal.push(l ? { ...gapsAgainst(l, f, nm), file_ids: f.map(x => x.external_row_id) }
                      : { label: nm, live: "NOT IN CRM" });
}

console.log(JSON.stringify(out, null, 2));
await close();
