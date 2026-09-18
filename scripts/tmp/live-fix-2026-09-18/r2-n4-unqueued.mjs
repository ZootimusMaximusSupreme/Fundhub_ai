// HOLE N4 — read-only: documents whose read failed but that have NO retry-queue
// row (so no clock will ever come back for them). BEGIN READ ONLY, ROLLBACK.
// No SET. No names, addresses, phones or emails printed.
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  // Per client: failed DOC-CHECK runs (no verdict), successful runs, queue rows,
  // open "check by hand" tasks, and whether a document-verified identity exists.
  show("clients with a failed document read", (await c.query(
    `WITH runs AS (
       SELECT client_id,
              count(*) FILTER (WHERE outcome NOT IN ('accept','request_more','hold'))::int AS failed_reads,
              count(*) FILTER (WHERE outcome IN ('accept','request_more','hold'))::int AS answered_reads,
              max(created_at) FILTER (WHERE outcome NOT IN ('accept','request_more','hold')) AS last_failed,
              max(created_at) FILTER (WHERE outcome IN ('accept','request_more','hold')) AS last_answered
         FROM agent_runs WHERE agent_code = 'DOC-CHECK' GROUP BY client_id)
     SELECT r.client_id, r.failed_reads, r.answered_reads, r.last_failed, r.last_answered,
            (SELECT count(*)::int FROM failed_events f WHERE f.client_id = r.client_id AND f.handler_name = 'doc-check') AS queue_rows,
            (SELECT count(*)::int FROM tasks t WHERE t.client_id = r.client_id AND t.source_workflow = 'doc-check' AND NOT t.done) AS open_hand_tasks,
            (SELECT p.verified_at IS NOT NULL FROM pii_identity p WHERE p.client_id = r.client_id) AS identity_verified
       FROM runs r WHERE r.failed_reads > 0 ORDER BY r.last_failed`)).rows);
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
