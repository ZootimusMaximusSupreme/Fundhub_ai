// Hole 8 — the ONE live data change: bring Sim Eight-Funding's person row in line
// with its two funded rounds, using the SAME statement round.funded now runs
// (syncClientFunded in src/handlers/money-chain.mjs). One row, one client. Nothing
// deleted. Before and after are recorded. Rolls back unless the result is exactly
// funded = true, funded_amount = 50000.00. No SET statement is issued.
// Prints no secrets.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h8-data-fix.mjs [--dry]
import { mkdirSync, writeFileSync } from "node:fs";
import { pool } from "../../../src/db.mjs";
import { syncClientFunded } from "../../../src/handlers/money-chain.mjs";

const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-8";
mkdirSync(SHOTS, { recursive: true });
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const DRY = process.argv.includes("--dry");

const read = (c) => c.query(
  `SELECT id, first_name, last_name, funded, funded_amount, updated_at FROM clients WHERE id = $1`, [EIGHT]
).then((r) => r.rows[0]);

const out = { at: new Date().toISOString(), dry: DRY, client: EIGHT };
const c = await pool().connect();
try {
  await c.query("BEGIN");
  out.before = await read(c);
  out.rounds = (await c.query(
    `SELECT round_number, status, funded_amount FROM funding_rounds WHERE client_id = $1 ORDER BY round_number`, [EIGHT]
  )).rows;
  const orgId = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [EIGHT])).rows[0].org_id;
  out.returned = await syncClientFunded(c, { clientId: EIGHT, orgId });
  out.after = await read(c);
  const good = out.after && out.after.funded === true && out.after.funded_amount === "50000.00" && out.returned && out.returned.id === EIGHT;
  if (!good || DRY) {
    await c.query("ROLLBACK");
    out.result = good ? "dry run — rolled back" : "unexpected result — rolled back, nothing changed";
  } else {
    await c.query("COMMIT");
    out.result = "committed";
    out.afterCommit = await read(c);
  }
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  out.result = `error — rolled back: ${e.message}`;
} finally {
  c.release();
  await pool().end();
}
writeFileSync(`${SHOTS}/data-fix${DRY ? "-dry" : ""}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
