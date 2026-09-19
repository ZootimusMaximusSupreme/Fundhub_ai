// HOLE N4 VERIFY — read-only look at the document-reader retry queue on live.
// BEGIN READ ONLY, then ROLLBACK. No SET. Prints no secret, phone, email or name.
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  show("now", (await c.query(`SELECT now() AS db_now, current_user AS role`)).rows);

  show("failed_events doc-check (all)", (await c.query(
    `SELECT id, org_id, client_id, event_id, status, attempts, max_attempts,
            first_seen_at, last_seen_at, next_attempt_at, resolved_at,
            left(error_message, 200) AS error_message, left(resolution_note, 120) AS note,
            payload->>'document_id' AS document_id, payload->>'subtype' AS subtype
       FROM failed_events WHERE handler_name = 'doc-check' ORDER BY first_seen_at`)).rows);

  show("failed_events by handler/status", (await c.query(
    `SELECT handler_name, status, count(*)::int AS n, max(last_seen_at) AS last_seen
       FROM failed_events GROUP BY 1,2 ORDER BY 1,2`)).rows);

  show("recent DOC-CHECK runs (all clients)", (await c.query(
    `SELECT created_at, client_id, trigger_event, event_id IS NULL AS no_event_id, mode, outcome,
            left(detail, 200) AS detail
       FROM agent_runs WHERE agent_code = 'DOC-CHECK' ORDER BY created_at DESC LIMIT 25`)).rows);

  await c.query("ROLLBACK");
} finally {
  await c.end();
}
