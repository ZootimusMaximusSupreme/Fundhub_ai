// HOLE 16 — is the live AI account STILL out of credit? Read-only. Looks at the
// newest live model answers across every agent (not just the document reader):
// the last "no credits" and the last clean answer.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const last429 = await c.query(
    `SELECT max(created_at) AS at, count(*)::int AS n_24h
       FROM agent_runs
      WHERE (outcome ILIKE '%no credits remaining%' OR detail ILIKE '%no credits remaining%' OR detail ILIKE '%insufficient_quota%')
        AND created_at > now() - interval '24 hours'`);
  console.log("no-credit answers, last 24h:", JSON.stringify(last429.rows[0]));
  const recent = await c.query(
    `SELECT created_at, agent_code, mode, left(outcome, 60) AS outcome
       FROM agent_runs
      WHERE mode = 'live' AND created_at > now() - interval '24 hours'
      ORDER BY created_at DESC LIMIT 20`);
  for (const r of recent.rows) console.log(JSON.stringify(r));
  const sweeps = await c.query(
    `SELECT handler_name, status, count(*)::int AS n, max(attempts) AS max_attempts,
            min(next_attempt_at) AS oldest_due
       FROM failed_events WHERE handler_name = 'doc-check' GROUP BY 1, 2`);
  console.log("doc-check queue:", JSON.stringify(sweeps.rows));
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
