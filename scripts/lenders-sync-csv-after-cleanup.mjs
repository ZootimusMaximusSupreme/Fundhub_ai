#!/usr/bin/env node
/**
 * Patch spreadsheet sources to match what scripts/lenders-cleanup-dedupe.mjs
 * already did on the live database — so re-import will not bring back Verify
 * Bank, re-split Elan, or put the fourteen consumer-link banks back on
 * OnlineBizCC.
 *
 *   node scripts/lenders-sync-csv-after-cleanup.mjs           # dry run
 *   node scripts/lenders-sync-csv-after-cleanup.mjs --write   # rewrite files
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLenderCsv, serializeLenderCsv } from "../src/lenders/csv.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

const LEGACY_CSV = path.join(ROOT, "docs/legacy-strong/lenders-legacy-strong.csv");
const CARL_CSV = path.join(ROOT, "credentials/lenders-audit/lenders-unified-carl-merged.csv");
const AUDITED_CSV = path.join(ROOT, "credentials/lenders-audit/lenders-audited.csv");
const AUDITED_BUREAUS_CSV = path.join(
  ROOT,
  "credentials/lenders-audit/lenders-audited-with-bureaus.csv"
);

const PLACEHOLDER_NAME = "Verify Bank";
const CONSUMER_LINK = /(consumer-platinum|consumer-credit|consumer\/web-visa|#consumer|consumer-products)/i;

const ELAN_KEEP = "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL";
const ELAN_FOLD = new Set([
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-0",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-0-FOR-20-MONTHS",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-BANKS-0-FOR-20-MONTHS",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-ISSUED-CARDS-20-MONTHS-0",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-ISSUERS",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-NETWORK",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-PARTNER-BANKS"
]);

const ELAN_NAME = "Elan Financial";
const ELAN_PRODUCT = "0% for 20 Months — No Business Checking Required";
const ELAN_STATES =
  "AL, AR, AZ, CA, CO, CT, DE, FL, GA, IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, RI, SC, TN, UT, VA, VT, WA, WI, WV, WY";

function splitStates(text) {
  return String(text || "")
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function unionStates(values) {
  const seen = new Map();
  for (const value of values) {
    for (const state of splitStates(value)) {
      const key = state.toUpperCase();
      if (!seen.has(key)) seen.set(key, state.length === 2 ? key : state);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b)).join(", ");
}

function patchRows(rows, label) {
  const stats = {
    verifyRemoved: 0,
    elanFoldRemoved: 0,
    elanKeepUpdated: false,
    personalRefiled: 0,
    businessBureauCleared: 0
  };

  const elanRows = rows.filter((r) => {
    const id = r.external_row_id;
    return id === ELAN_KEEP || ELAN_FOLD.has(id);
  });
  const mergedStates = unionStates(elanRows.map((r) => r.eligible_states));

  const out = [];
  for (const row of rows) {
    if (row.name === PLACEHOLDER_NAME && !row.external_row_id) {
      stats.verifyRemoved++;
      continue;
    }

    const id = row.external_row_id;
    if (id && ELAN_FOLD.has(id)) {
      stats.elanFoldRemoved++;
      continue;
    }

    if (id === ELAN_KEEP) {
      row.name = ELAN_NAME;
      row.product_name = ELAN_PRODUCT;
      row.eligible_states = mergedStates || ELAN_STATES;
      stats.elanKeepUpdated = true;
    }

    const url = row.application_url || "";
    if (
      row.lender_table === "OnlineBizCC" &&
      String(id || "").startsWith("CARL-") &&
      CONSUMER_LINK.test(url)
    ) {
      row.lender_table = "PersonalCC";
      stats.personalRefiled++;
    }

    if (
      row.lender_table === "PersonalCC" &&
      row.business_bureau_pulled &&
      /D&B|SBFE/i.test(String(row.business_bureau_pulled))
    ) {
      row.business_bureau_pulled = "";
      stats.businessBureauCleared++;
    }

    out.push(row);
  }

  console.log(`\n${label}`);
  console.log(JSON.stringify(stats, null, 2));
  return { rows: out, stats };
}

function load(path) {
  if (!fs.existsSync(path)) {
    console.error("Missing:", path);
    process.exit(1);
  }
  const { rows, errors } = parseLenderCsv(fs.readFileSync(path, "utf8"));
  if (errors.length) console.warn(path, errors.join("; "));
  return rows;
}

function save(path, rows) {
  fs.writeFileSync(path, serializeLenderCsv(rows), "utf8");
}

const legacyIn = load(LEGACY_CSV);
const carlIn = load(CARL_CSV);
const auditedIn = load(AUDITED_CSV);
const auditedBureausIn = load(AUDITED_BUREAUS_CSV);

const legacy = patchRows(legacyIn, "legacy-strong");
const carl = patchRows(carlIn, "carl-merged");
const audited = patchRows(auditedIn, "lenders-audited");
const auditedBureaus = patchRows(auditedBureausIn, "lenders-audited-with-bureaus");

if (WRITE) {
  save(LEGACY_CSV, legacy.rows);
  save(CARL_CSV, carl.rows);
  save(AUDITED_CSV, audited.rows);
  save(AUDITED_BUREAUS_CSV, auditedBureaus.rows);
  console.log("\nWrote legacy, carl-merged, lenders-audited, lenders-audited-with-bureaus.");
} else {
  console.log("\nDry run only — pass --write to save.");
}
