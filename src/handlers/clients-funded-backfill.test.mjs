// Hole N18 — a client funded BEFORE hole 8 still read "not funded".
//
// Hole 8 made round.funded write clients.funded / clients.funded_amount from the
// rounds (SQL_SYNC_CLIENT_FUNDED in ./money-chain.mjs), but only for rounds funded
// from then on. Measured on live 2026-09-18: Walk1 Funding had round 1 funded for
// $45,000 and the Client Control Panel's Funded line read "No".
//
// db/migrations/386_backfill_clients_funded_from_rounds.sql brings every existing
// client in line using the same rule. These tests pin that the file exists, is in
// the manifest ship applies from, and says the same thing the sync says. The
// behaviour on real Postgres is proven in clients-funded-backfill.pg.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { SQL_SYNC_CLIENT_FUNDED } from "./money-chain.mjs";
import { EXPECTED_MIGRATIONS } from "../../db/expected-migrations.mjs";

const KEY = "migrations/386_backfill_clients_funded_from_rounds.sql";
const FILE = new URL(`../../db/${KEY}`, import.meta.url);

const sqlOnly = (text) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const load = () => {
  assert.ok(existsSync(FILE),
    "there is no backfill: clients funded before hole 8 (Walk1 Funding, $45,000) keep reading 'not funded'");
  return sqlOnly(readFileSync(FILE, "utf8"));
};

test("the backfill migration exists and ship will apply it", () => {
  load();
  assert.ok(EXPECTED_MIGRATIONS.includes(KEY),
    "db/expected-migrations.mjs does not list the backfill — run npm run migrations:manifest");
});

test("the backfill uses the same total as round.funded does", () => {
  const sql = load();
  const rule = (s) => sqlOnly(s).match(/CASE WHEN bool_and\(fr\.funded_amount IS NOT NULL\) THEN SUM\(fr\.funded_amount\) END/);
  assert.ok(rule(SQL_SYNC_CLIENT_FUNDED), "the live sync no longer states its total the way this test reads it");
  assert.ok(rule(sql),
    "the backfill must total funded rounds exactly as SQL_SYNC_CLIENT_FUNDED does — sum, or NULL if any amount is unknown");
});

test("only funded rounds count, matched on client and org", () => {
  const sql = load();
  assert.match(sql, /fr\.status = 'funded'/);
  assert.match(sql, /GROUP BY fr\.client_id, fr\.org_id/);
  assert.match(sql, /c\.id = s\.client_id/);
  assert.match(sql, /c\.org_id = s\.org_id/);
  assert.match(sql, /HAVING count\(\*\) > 0/, "a client with no funded round must not be marked funded");
});

test("it never un-funds a client and never turns unknown money into 0", () => {
  const sql = load();
  assert.match(sql, /SET funded = true, funded_amount = s\.total/);
  assert.doesNotMatch(sql, /funded\s*=\s*false/i, "the backfill must never un-fund a client");
  assert.doesNotMatch(sql, /COALESCE\([^)]*,\s*0\)/i, "unknown money must stay NULL, never 0");
  assert.doesNotMatch(sql, /\bDELETE\b/i);
});

test("it only writes clients that are out of step", () => {
  const sql = load();
  assert.match(sql, /c\.funded IS DISTINCT FROM true OR c\.funded_amount IS DISTINCT FROM s\.total/,
    "a client that already reads right must be left alone");
});
