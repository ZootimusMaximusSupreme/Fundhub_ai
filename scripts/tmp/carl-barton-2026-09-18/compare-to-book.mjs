#!/usr/bin/env node
// Compare the Carl Barton 0% APR database against the existing lender book.
// Name matching follows scripts/lenders-alias-map.json how_to_use exactly:
// clean, whole-name lookup, no fuzzy matching.
//
// Baseline is the live CRM `lenders` table plus both book CSVs.
//
// Writes:
//   docs/legacy-strong/carl-barton-book-match.csv     (one row per bank, tracked)
//   credentials/lenders-audit/carl-barton-vs-book.csv (same report, gitignored copy)

import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const ALIAS = JSON.parse(readFileSync("scripts/lenders-alias-map.json", "utf8"));
const LOOKUP = ALIAS.lookup;

function clean(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonical(raw) {
  const c = clean(raw);
  return LOOKUP[c] || null;
}

/** Key a bank by its alias-map institution when known, else by its cleaned name. */
function key(raw) {
  const c = clean(raw);
  const inst = LOOKUP[c];
  return inst ? `inst:${inst}` : `raw:${c}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

const carl = JSON.parse(readFileSync("credentials/carl-barton-2026-09-18/carl-barton-database-full.json", "utf8"));
const book = parseCsv(readFileSync("credentials/lenders-audit/lenders-audited.csv", "utf8"));
const legacy = parseCsv(readFileSync("docs/legacy-strong/lenders-legacy-strong.csv", "utf8"));

// Live CRM names — read-only.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const crm = (await client.query("SELECT name FROM lenders WHERE name IS NOT NULL")).rows;
await client.end();

const bookKeys = new Map();
for (const r of [...book, ...legacy, ...crm]) {
  if (!r.name) continue;
  if (!bookKeys.has(key(r.name))) bookKeys.set(key(r.name), r.name);
}

const seen = new Map();
for (const r of carl) {
  const name = r["Bank Name"];
  if (!name) continue;
  const k = key(name);
  if (!seen.has(k)) seen.set(k, { key: k, name, canonical: canonical(name), rows: [] });
  seen.get(k).rows.push(r);
}

const dupes = [];
const news = [];
for (const entry of seen.values()) {
  if (bookKeys.has(entry.key)) dupes.push({ ...entry, bookName: bookKeys.get(entry.key) });
  else news.push(entry);
}

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
// Source cells carry stray newlines and padding; flatten to one line per row.
const tidy = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// Match report — one row per bank, not a second copy of the 921 offers.
const REP = ["status", "carl_name", "canonical_name", "book_name", "offer_rows", "bureaus", "has_url"];
const repRows = [
  ...dupes.map((d) => ({ status: "duplicate", entry: d, book_name: d.bookName })),
  ...news.map((d) => ({ status: "new", entry: d, book_name: "" }))
].map(({ status, entry, book_name }) => ({
  status,
  carl_name: tidy(entry.name),
  canonical_name: entry.canonical || "",
  book_name,
  offer_rows: entry.rows.length,
  bureaus: [...new Set(entry.rows.map((x) => x["Bureau Pulled"]).filter(Boolean))].join(" / "),
  has_url: entry.rows.some((x) => x.Link) ? "yes" : "no"
}));
repRows.sort((a, b) => (a.status + a.carl_name).localeCompare(b.status + b.carl_name));
const reportCsv = `${[REP.join(","), ...repRows.map((r) => REP.map((c) => q(r[c])).join(","))].join("\n")}\n`;
writeFileSync("docs/legacy-strong/carl-barton-book-match.csv", reportCsv);
writeFileSync("credentials/lenders-audit/carl-barton-vs-book.csv", reportCsv);

const bureauCounts = {};
for (const r of carl) {
  const b = r["Bureau Pulled"] || "(blank)";
  bureauCounts[b] = (bureauCounts[b] || 0) + 1;
}

console.log(JSON.stringify({
  carl_offer_rows: carl.length,
  carl_unique_banks: seen.size,
  book_unique_banks: bookKeys.size,
  duplicate_banks: dupes.length,
  new_banks: news.length,
  resolved_by_alias_map: [...seen.values()].filter((e) => e.canonical).length,
  rows_with_application_url: carl.filter((r) => r.Link).length,
  bureau_spread: bureauCounts,
  sample_new: news.slice(0, 15).map((n) => n.name),
  sample_duplicate: dupes.slice(0, 15).map((d) => `${d.name} => ${d.bookName}`)
}, null, 2));
