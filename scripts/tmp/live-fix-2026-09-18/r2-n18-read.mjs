// N18 — look only. Every client with a funded round vs what its client row says.
// Runs inside BEGIN READ ONLY and rolls back. Prints ids, flags and amounts only —
// no names beyond the Walk1 test file, no phones, emails or secrets.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n18-read.mjs [tag]
import { mkdirSync, writeFileSync } from "node:fs";
import { pool } from "../../../src/db.mjs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N18";
mkdirSync(OUT, { recursive: true });
const TAG = process.argv[2] || "read";
const WALK1 = "ab277630-8309-4c02-b187-f244e7e369e8";
const out = { at: new Date().toISOString(), tag: TAG };

const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  // Same rule as SQL_SYNC_CLIENT_FUNDED in src/handlers/money-chain.mjs.
  out.fundedClients = (await c.query(`
    SELECT c.id, c.org_id, c.is_demo, c.funded, c.funded_amount,
           s.funded_rounds, s.expected_total,
           (c.funded IS TRUE AND c.funded_amount IS NOT DISTINCT FROM s.expected_total) AS matches
      FROM clients c
      JOIN (SELECT fr.client_id, fr.org_id, count(*)::int AS funded_rounds,
                   CASE WHEN bool_and(fr.funded_amount IS NOT NULL) THEN SUM(fr.funded_amount) END AS expected_total
              FROM funding_rounds fr
             WHERE fr.status = 'funded'
             GROUP BY fr.client_id, fr.org_id) s
        ON s.client_id = c.id AND s.org_id = c.org_id
     ORDER BY matches, c.id`)).rows;
  // Funded rounds whose org differs from their client's org (the sync keys on both).
  out.orgMismatchRounds = (await c.query(`
    SELECT fr.id, fr.client_id FROM funding_rounds fr JOIN clients c ON c.id = fr.client_id
     WHERE fr.status = 'funded' AND fr.org_id IS DISTINCT FROM c.org_id`)).rows;
  out.fundedRoundsNoClient = (await c.query(`
    SELECT count(*)::int AS n FROM funding_rounds WHERE status = 'funded' AND client_id IS NULL`)).rows[0];
  out.clientsFundedTrueNoFundedRound = (await c.query(`
    SELECT c.id, c.is_demo, c.funded_amount FROM clients c
     WHERE c.funded IS TRUE
       AND NOT EXISTS (SELECT 1 FROM funding_rounds fr WHERE fr.client_id = c.id AND fr.status = 'funded')`)).rows;
  out.walk1 = {
    client: (await c.query(
      `SELECT id, org_id, first_name, is_demo, funded, funded_amount, updated_at FROM clients WHERE id = $1`, [WALK1])).rows[0],
    rounds: (await c.query(
      `SELECT id, org_id, round_number, status, product, approved_amount, funded_amount, created_at, updated_at
         FROM funding_rounds WHERE client_id = $1 ORDER BY round_number`, [WALK1])).rows
  };
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool().end();
}
out.summary = {
  clientsWithFundedRound: out.fundedClients.length,
  mismatched: out.fundedClients.filter((r) => !r.matches).length
};
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
