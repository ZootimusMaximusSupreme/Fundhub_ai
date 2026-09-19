// HOLE N4 — prove the new close-the-wait SQL against the LIVE schema without
// writing anything. BEGIN READ ONLY, then ROLLBACK. No SET.
//  1. Runs the real closeAnsweredWaits() with every statement turned into an
//     EXPLAIN — Postgres plans it (so every table, column and type is checked)
//     but never executes it, and a read-only transaction refuses any write.
//  2. Runs the same WHERE as a SELECT to list exactly which open tasks the first
//     pass after the ship will close. Titles and ids only — no client names.
import pg from "pg";
import { closeAnsweredWaits } from "../../../src/workflows/doc-check-retry-sweeper.mjs";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  let captured = null;
  const explainDb = {
    async query(sql, params) {
      captured = { sql, params };
      return c.query(`EXPLAIN ${sql}`, params);
    }
  };
  const planned = await closeAnsweredWaits(explainDb);
  console.log("EXPLAIN of the real UPDATE:", planned.error ? `FAILED: ${planned.error}` : "planned OK (nothing executed)");

  const select = captured.sql
    .replace(/UPDATE tasks t\s+SET done = true, updated_at = now\(\)\s+FROM failed_events f/,
      "SELECT t.id, t.client_id, t.title, t.created_at, f.id AS queue_row, f.resolved_at FROM tasks t, failed_events f")
    .replace(/RETURNING t\.id/, "ORDER BY t.created_at");
  const targets = await c.query(select, captured.params);
  console.log(`\nopen tasks the next pass would close (${targets.rows.length}):`);
  for (const r of targets.rows) console.log(JSON.stringify(r));

  const stillOpen = await c.query(
    `SELECT count(*)::int AS n FROM tasks
      WHERE source_workflow = 'doc-check' AND done = false AND title LIKE $1`,
    [captured.params[2]]);
  console.log("\nall open 'Waiting on the document reader' tasks on live:", stillOpen.rows[0].n);
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
