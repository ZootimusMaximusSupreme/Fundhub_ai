// HOLE N4 — read-only: is anything on a timer still running on live right now?
// Looks at the dispatch clock (queued -> sent lag) and the doc-check queue.
// BEGIN READ ONLY, then ROLLBACK. No SET. No addresses printed.
import pg from "pg";

const SINCE = process.argv[2] || "2026-09-18T17:00:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  show("now", (await c.query(`SELECT now() AS db_now`)).rows);
  show("messages created since (all clients, no addresses)", (await c.query(
    `SELECT created_at, updated_at, channel, template_key, status, client_id
       FROM messages WHERE created_at >= $1 ORDER BY created_at`, [SINCE])).rows);
  show("doc-check queue: pending, and overdue by more than 25 minutes", (await c.query(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'pending' AND next_attempt_at < now() - interval '25 minutes')::int AS overdue
       FROM failed_events WHERE handler_name = 'doc-check'`)).rows);
  show("agent_runs by hour since (all agents) — any timer-driven work", (await c.query(
    `SELECT date_trunc('hour', created_at) AS hour, agent_code, count(*)::int AS n
       FROM agent_runs WHERE created_at >= $1 GROUP BY 1,2 ORDER BY 1,2`, [SINCE])).rows);
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
