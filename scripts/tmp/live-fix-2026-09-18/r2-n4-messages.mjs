// HOLE N4 — read-only: the messages the 17:20 retry reads queued for #9, and
// the document read state. BEGIN READ ONLY, then ROLLBACK. No SET.
// Prints last 4 of a phone only, and no email address.
import pg from "pg";

const CLIENT = process.argv[2] || "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const SINCE = process.argv[3] || "2026-09-18T15:00:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  show("messages since", (await c.query(
    `SELECT created_at, updated_at, channel, template_key, status, provider_ref,
            CASE WHEN channel = 'sms' THEN right(to_address, 4) ELSE '(email)' END AS to_hint
       FROM messages WHERE client_id = $1 AND created_at >= $2 ORDER BY created_at`, [CLIENT, SINCE])).rows);
  show("documents", (await c.query(
    `SELECT id, kind, subtype, created_at, source_event_id
       FROM documents WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);
  show("unchecked-document tasks", (await c.query(
    `SELECT created_at, updated_at, done, title, substring(body from 'Document: ([0-9a-f-]+)') AS document_id
       FROM tasks WHERE client_id = $1 AND source_workflow = 'doc-check' ORDER BY created_at`, [CLIENT])).rows);
  show("client is a sim/test file", (await c.query(
    `SELECT id, first_name, tags FROM clients WHERE id = $1`, [CLIENT])).rows);
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
