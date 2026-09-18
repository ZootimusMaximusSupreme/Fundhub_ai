// N18 — run db/migrations/386_backfill_clients_funded_from_rounds.sql, exactly as
// written, on real Postgres against FIXTURE rows only. Two TEMP tables named
// clients and funding_rounds are created inside one transaction; Postgres looks in
// the session's temp schema first, so the file's unqualified names hit the temp
// tables and never the real ones (checked below with to_regclass before the file
// runs — it aborts if either name resolves anywhere else). The transaction is
// always rolled back. No real row is read or written. No SET statement is issued.
// These are the same five cases as src/handlers/clients-funded-backfill.pg.test.mjs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pool } from "../../../src/db.mjs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N18";
mkdirSync(OUT, { recursive: true });
const SQL = readFileSync(new URL("../../../db/migrations/386_backfill_clients_funded_from_rounds.sql", import.meta.url), "utf8");
const ORG = "00000000-0000-0000-0000-0000000000aa";
const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;

const out = { at: new Date().toISOString(), mode: "temp tables only, always rolled back" };
const c = await pool().connect();
try {
  await c.query("BEGIN");
  await c.query(`CREATE TEMP TABLE clients (id uuid PRIMARY KEY, org_id uuid NOT NULL, label text,
                   funded boolean NOT NULL DEFAULT false, funded_amount numeric(14,2)) ON COMMIT DROP`);
  await c.query(`CREATE TEMP TABLE funding_rounds (client_id uuid, org_id uuid NOT NULL, round_number int,
                   status text NOT NULL, funded_amount numeric(14,2)) ON COMMIT DROP`);
  out.resolves = (await c.query(
    `SELECT (SELECT n.nspname FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace
              WHERE k.oid = to_regclass('clients')) AS clients,
            (SELECT n.nspname FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace
              WHERE k.oid = to_regclass('funding_rounds')) AS funding_rounds`)).rows[0];
  if (!/^pg_temp/.test(out.resolves.clients) || !/^pg_temp/.test(out.resolves.funding_rounds)) {
    throw new Error("names do not resolve to the temp tables — refusing to run the file");
  }
  const cl = [
    [1, "walk1", false, null], [2, "two", false, null], [3, "unknown", true, 99999],
    [4, "started", false, null], [5, "keeper", true, 12345], [6, "otherorg", false, null]
  ];
  for (const [n, label, funded, amt] of cl) {
    await c.query(`INSERT INTO clients VALUES ($1,$2,$3,$4,$5)`, [id(n), ORG, label, funded, amt]);
  }
  const rounds = [
    [1, 1, "funded", 45000], [1, 2, "started", null],
    [2, 1, "funded", 25000], [2, 2, "funded", 25000],
    [3, 1, "funded", null], [3, 2, "funded", 10000],
    [4, 1, "started", null]
  ];
  for (const [n, rn, st, amt] of rounds) {
    await c.query(`INSERT INTO funding_rounds VALUES ($1,$2,$3,$4,$5)`, [id(n), ORG, rn, st, amt]);
  }
  // A funded round filed under a DIFFERENT org must not fund the client (keyed on both).
  await c.query(`INSERT INTO funding_rounds VALUES ($1,$2,1,'funded',7000)`, [id(6), "00000000-0000-0000-0000-0000000000bb"]);

  out.firstRunRowsChanged = (await c.query(SQL)).rowCount;
  out.after = (await c.query(`SELECT label, funded, funded_amount FROM clients ORDER BY id`)).rows;
  out.secondRunRowsChanged = (await c.query(SQL)).rowCount;
  const want = {
    walk1: [true, "45000.00"], two: [true, "50000.00"], unknown: [true, null],
    started: [false, null], keeper: [true, "12345.00"], otherorg: [false, null]
  };
  out.checks = out.after.map((r) => ({
    label: r.label,
    ok: r.funded === want[r.label][0] && r.funded_amount === want[r.label][1]
  }));
  out.allPass = out.checks.every((x) => x.ok) && out.firstRunRowsChanged === 3 && out.secondRunRowsChanged === 0;
} catch (e) {
  out.error = e.message;
  out.allPass = false;
} finally {
  await c.query("ROLLBACK").catch(() => {});
  out.rolledBack = true;
  c.release();
  await pool().end();
}
writeFileSync(`${OUT}/cases.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
