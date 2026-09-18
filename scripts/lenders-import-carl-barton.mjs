#!/usr/bin/env node
/**
 * Build ONE bank book out of the book we already have plus the Carl Barton
 * 0% APR business-card database.
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR, in plain words.
 *
 * We have two lists of banks. The one the CRM screens read today, and a second
 * one a partner sent over — 921 card offers across 867 banks, with the apply
 * link and the credit bureau for each. Chris wants one list, not two.
 *
 * This writes that one list to a file. It does NOT touch the database. The
 * loading is still done by scripts/lenders-import-alec.mjs, which has the
 * guards on it.
 *
 * ---------------------------------------------------------------------------
 * THE RULES IT FOLLOWS.
 *
 *   1. NOTHING ALREADY IN THE DATABASE IS LOST. Every bank the CRM holds today
 *      starts in the file exactly as the database has it — all 328, personal
 *      cards and loans included, not just the ones Carl mentions. That is also
 *      what makes the loader's "would this blank anything out" check come back
 *      at zero.
 *   2. CARL ONLY FILLS EMPTY CELLS. Where the database already holds a value,
 *      it wins. Where it holds nothing and Carl has something — an apply link,
 *      a bureau, the states — Carl's value goes in.
 *   3. A BANK CARL HAS AND WE DO NOT IS ADDED. New row, its own id.
 *   4. NAMES ARE MATCHED THE ONE ALLOWED WAY. scripts/lenders-alias-map.json,
 *      whole cleaned name only. No fuzzy matching — "Prosper" is inside
 *      "Prosperity Bank" and they are different companies.
 *
 * ---------------------------------------------------------------------------
 * HOW TO RUN IT.
 *
 *   node --env-file=.env scripts/lenders-import-carl-barton.mjs
 *       Writes the merged file and prints what it did.
 *
 *   --out <path>   somewhere other than the default
 *   --org <slug>   a different company (default: DEFAULT_ORG_SLUG)
 *
 * Then load it:
 *   node --env-file=.env scripts/lenders-import-alec.mjs --file <that file>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, close } from "../src/db.mjs";
import { serializeLenderCsv } from "../src/lenders/csv.mjs";
import { LENDER_CSV_COLUMNS } from "../src/lenders/tables.mjs";
import { slugFromName, normalizeName } from "../src/lenders/tips.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CARL_JSON = path.join(ROOT, "credentials/carl-barton-2026-09-18/carl-barton-database-full.json");
const ALIAS_MAP = path.join(ROOT, "scripts/lenders-alias-map.json");
const DEFAULT_OUT = path.join(ROOT, "credentials/lenders-audit/lenders-unified-carl-merged.csv");

const SOURCE_NOTE = "Source: Carl Barton 0% APR business card database (2026-09-18)";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}
const SLUG = arg("--org") || process.env.DEFAULT_ORG_SLUG || "fundhub";

const isBlank = (v) => v == null || String(v).trim() === "";

/* ── names ────────────────────────────────────────────────────────────── */

const ALIAS = JSON.parse(fs.readFileSync(ALIAS_MAP, "utf8"));
const LOOKUP = ALIAS.lookup;

/** how_to_use step_1, character for character. */
function clean(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The alias map's institution when it knows the name, else the cleaned name. */
function key(raw) {
  const c = clean(raw);
  const inst = LOOKUP[c];
  return inst ? `inst:${inst}` : `raw:${c}`;
}

/* ── states ───────────────────────────────────────────────────────────── */

const STATE_CODES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ " +
   "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP").split(" ")
);

/* The source cells were typed by hand and carry a few mangled tokens. These two
   are corrections Chris named; everything else that is not a state code is
   dropped rather than guessed at. */
const STATE_FIXES = { DEPA: "PA", "M I": "MI" };

/**
 * "Nationwide" becomes the house word "All States" — that is what the rest of
 * the book says. Anything that is not a real state code is thrown away.
 */
function normalizeStates(raw) {
  const parts = String(raw ?? "").split(",");
  let nationwide = false;
  const codes = [];
  const dropped = [];
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    if (/^nationwide$/i.test(t) || /^all states$/i.test(t)) { nationwide = true; continue; }
    const fixed = STATE_FIXES[t.toUpperCase()] || t.toUpperCase().replace(/\s+/g, "");
    if (STATE_CODES.has(fixed)) {
      if (!codes.includes(fixed)) codes.push(fixed);
    } else {
      dropped.push(t);
    }
  }
  return { nationwide, codes, dropped };
}

/* ── bureaus ──────────────────────────────────────────────────────────── */

/* The book writes bureaus short — TU, EX, EQ, EX/EQ/TU. Carl writes them long.
   Dun & Bradstreet and SBFE are business bureaus, not consumer ones, so they
   go in the business column instead of being mixed in with the other three. */
const CONSUMER = { TransUnion: "TU", Experian: "EX", Equifax: "EQ" };
const ORDER = ["EX", "EQ", "TU"];

function normalizeBureaus(values) {
  const consumer = new Set();
  let business = false;
  for (const raw of values) {
    for (const part of String(raw ?? "").split(",")) {
      const t = part.trim();
      if (!t) continue;
      if (/^all 3$/i.test(t)) { ORDER.forEach((b) => consumer.add(b)); continue; }
      if (/dun|bradstreet|sbfe/i.test(t)) { business = true; continue; }
      const short = CONSUMER[t];
      if (short) consumer.add(short);
    }
  }
  return {
    bureaus_pulled: ORDER.filter((b) => consumer.has(b)).join("/") || null,
    business_bureau_pulled: business ? "D&B/SBFE" : null
  };
}

/* ── the merge ────────────────────────────────────────────────────────── */

/** One bank's worth of Carl rows folded into the book's column names. */
function carlFields(rows) {
  const first = (k) => {
    for (const r of rows) {
      const v = String(r[k] ?? "").trim();
      if (v) return v;
    }
    return null;
  };

  const { bureaus_pulled, business_bureau_pulled } = normalizeBureaus(rows.map((r) => r["Bureau Pulled"]));

  let nationwide = false;
  const codes = [];
  for (const r of rows) {
    const s = normalizeStates(r["Eligible States"]);
    if (s.nationwide) nationwide = true;
    for (const c of s.codes) if (!codes.includes(c)) codes.push(c);
  }
  const eligible_states = nationwide ? "All States" : (codes.join(",") || null);

  const intro = first("Intro APR Length");
  const underwriter = first("Underwriter");
  const doubleDip = rows.some((r) => /^yes$/i.test(String(r["Double Dip"] ?? "").trim()))
    ? "Yes"
    : (rows.some((r) => /^no$/i.test(String(r["Double Dip"] ?? "").trim())) ? "No" : null);

  return {
    application_url: first("Link"),
    bureaus_pulled,
    business_bureau_pulled,
    eligible_states,
    double_pull: doubleDip,
    intro_offers: intro ? `0% intro APR — ${intro}` : null,
    underwriter_interaction: underwriter ? `Underwritten by ${underwriter}` : null
  };
}

/** The columns Carl is allowed to fill. */
const CARL_COLS = [
  "application_url",
  "bureaus_pulled",
  "business_bureau_pulled",
  "eligible_states",
  "double_pull",
  "intro_offers",
  "underwriter_interaction"
];

function externalRowId(name) {
  return `CARL-ONLINEBIZCC-${slugFromName(name).toUpperCase()}`;
}

async function main() {
  const outPath = arg("--out")
    ? (path.isAbsolute(arg("--out")) ? arg("--out") : path.join(ROOT, arg("--out")))
    : DEFAULT_OUT;

  if (!fs.existsSync(CARL_JSON)) {
    console.error("Carl's database is not there:", CARL_JSON);
    process.exit(1);
  }

  const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [SLUG]);
  const orgId = org.rows[0]?.id;
  if (!orgId) {
    console.error("No company with the short name", SLUG);
    process.exit(1);
  }

  /* RULE 1 — the database is the base. Every bank it holds, every column. */
  const existing = await db.query(
    `SELECT ${LENDER_CSV_COLUMNS.join(", ")} FROM lenders WHERE org_id = $1::uuid ORDER BY name`,
    [orgId]
  );
  /* A bank with no external_row_id cannot be matched by the loader, so writing
     it into the file would add a SECOND copy of it rather than update the one
     we have. Leave those where they are. */
  const held = existing.rows.map((r) => ({ ...r }));
  const base = held.filter((r) => !isBlank(r.external_row_id));
  const unmatchable = held.filter((r) => isBlank(r.external_row_id)).map((r) => r.name);

  /* Keyed over everything we hold, including the rows left out of the file —
     otherwise Carl would add a fresh copy of a bank we already have. */
  const byKey = new Map();
  for (const row of held) {
    const k = key(row.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(row);
  }

  /* Carl, one entry per bank rather than one per card offer. */
  const carl = JSON.parse(fs.readFileSync(CARL_JSON, "utf8"));
  const banks = new Map();
  let droppedStateTokens = 0;
  for (const r of carl) {
    const name = String(r["Bank Name"] ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const k = key(name);
    if (!banks.has(k)) banks.set(k, { key: k, name, rows: [] });
    banks.get(k).rows.push(r);
    droppedStateTokens += normalizeStates(r["Eligible States"]).dropped.length;
  }

  const added = [];
  let matchedBanks = 0;
  let updatedRows = 0;
  let cellsFilled = 0;
  const filledByColumn = {};
  const conflictsKept = {};

  for (const bank of banks.values()) {
    const fields = carlFields(bank.rows);
    const targets = byKey.get(bank.key);

    if (targets) {
      /* RULE 2 — fill the empty cells, never overwrite what we hold. */
      matchedBanks++;
      for (const row of targets) {
        let touched = false;
        for (const col of CARL_COLS) {
          if (isBlank(fields[col])) continue;
          if (isBlank(row[col])) {
            row[col] = fields[col];
            cellsFilled++;
            filledByColumn[col] = (filledByColumn[col] || 0) + 1;
            touched = true;
          } else if (String(row[col]).trim() !== String(fields[col]).trim()) {
            conflictsKept[col] = (conflictsKept[col] || 0) + 1;
          }
        }
        if (touched) updatedRows++;
      }
      continue;
    }

    /* RULE 3 — a bank we do not have yet. */
    const display = normalizeName(bank.name) || bank.name;
    const top = bank.rows.find((r) => String(r["Top Banks"] ?? "").trim());
    const row = {};
    for (const col of LENDER_CSV_COLUMNS) row[col] = null;
    row.lender_table = "OnlineBizCC";
    row.name = display;
    row.active = true;
    row.external_row_id = externalRowId(display);
    row.notes = top
      ? `${SOURCE_NOTE}; Top bank: ${String(top["Top Banks"]).trim()}`
      : SOURCE_NOTE;
    for (const col of CARL_COLS) row[col] = fields[col];
    added.push(row);
  }

  /* Two Carl banks can slug down to the same id. Keep the first, note the rest —
     a duplicate external_row_id would have the second silently overwrite the
     first inside the loader. */
  const seenIds = new Set(base.map((r) => r.external_row_id).filter(Boolean));
  const idCollisions = [];
  const newRows = [];
  for (const row of added) {
    if (seenIds.has(row.external_row_id)) {
      idCollisions.push({ name: row.name, id: row.external_row_id });
      continue;
    }
    seenIds.add(row.external_row_id);
    newRows.push(row);
  }

  const all = [...base, ...newRows];
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serializeLenderCsv(all), "utf8");

  const filled = (col) => all.filter((r) => !isBlank(r[col])).length;

  console.log(JSON.stringify({
    out: path.relative(ROOT, outPath),
    org: SLUG,
    carl_offer_rows: carl.length,
    carl_unique_banks: banks.size,
    book_rows_in_db: held.length,
    book_rows_in_file: base.length,
    left_out_no_external_row_id: unmatchable,
    matched_banks: matchedBanks,
    book_rows_updated: updatedRows,
    cells_filled: cellsFilled,
    filled_by_column: filledByColumn,
    conflicts_where_book_won: conflictsKept,
    new_banks_added: newRows.length,
    id_collisions_skipped: idCollisions,
    dropped_junk_state_tokens: droppedStateTokens,
    book_rows_after: all.length,
    after_filled: Object.fromEntries(
      ["application_url", "bureaus_pulled", "business_bureau_pulled", "eligible_states",
       "double_pull", "intro_offers", "underwriter_interaction", "logo_path"]
        .map((c) => [c, filled(c)])
    ),
    next: `node --env-file=.env scripts/lenders-import-alec.mjs --file ${path.relative(ROOT, outPath)}`
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => close());
