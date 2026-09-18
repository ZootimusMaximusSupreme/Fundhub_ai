// N18 — DRY RUN of db/migrations/386_backfill_clients_funded_from_rounds.sql on the
// live database. The file's SQL runs inside one transaction, the result is read
// back inside that same transaction, and then it is ROLLED BACK — always. Nothing
// is kept and no schema_migrations row is written; ship applies it for real.
// No SET statement is issued. Prints ids, flags and amounts only. No secrets.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n18-dryrun.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pool } from "../../../src/db.mjs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N18";
mkdirSync(OUT, { recursive: true });
const SQL = readFileSync(new URL("../../../db/migrations/386_backfill_clients_funded_from_rounds.sql", import.meta.url), "utf8");

const STATE = `
  SELECT c.id, c.is_demo, c.funded, c.funded_amount, c.updated_at,
         s.expected_total,
         (c.funded IS TRUE AND c.funded_amount IS NOT DISTINCT FROM s.expected_total) AS matches
    FROM clients c
    JOIN (SELECT fr.client_id, fr.org_id,
                 CASE WHEN bool_and(fr.funded_amount IS NOT NULL) THEN SUM(fr.funded_amount) END AS expected_total
            FROM funding_rounds fr WHERE fr.status = 'funded' GROUP BY fr.client_id, fr.org_id) s
      ON s.client_id = c.id AND s.org_id = c.org_id
   ORDER BY c.id`;

const out = { at: new Date().toISOString(), mode: "dry run — always rolled back" };
const c = await pool().connect();
try {
  await c.query("BEGIN");
  out.before = (await c.query(STATE)).rows;
  out.fundedTrueCountBefore = (await c.query(`SELECT count(*)::int AS n FROM clients WHERE funded IS TRUE`)).rows[0].n;
  const first = await c.query(SQL);
  out.firstRunRowsChanged = first.rowCount;
  out.after = (await c.query(STATE)).rows;
  out.fundedTrueCountAfter = (await c.query(`SELECT count(*)::int AS n FROM clients WHERE funded IS TRUE`)).rows[0].n;
  const second = await c.query(SQL);
  out.secondRunRowsChanged = second.rowCount;
} catch (e) {
  out.error = e.message;
} finally {
  await c.query("ROLLBACK").catch(() => {});
  out.rolledBack = true;
  c.release();
}
// Confirm nothing was kept.
{
  const k = await pool().connect();
  try {
    await k.query("BEGIN READ ONLY");
    out.afterRollback = (await k.query(STATE)).rows;
    await k.query("ROLLBACK");
  } finally {
    k.release();
    await pool().end();
  }
}
writeFileSync(`${OUT}/dryrun.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
