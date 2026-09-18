// HOLE 16 VERIFY — read-only look at file #9 Nine-Repair on the live database.
// BEGIN READ ONLY, then ROLLBACK. No SET. Never prints a secret, phone or email
// in full (phone is shown as last 4 only).
import pg from "pg";

const CLIENT = process.argv[2] || "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  const cl = await c.query(
    `SELECT id, org_id, first_name, last_name, right(phone, 4) AS phone_last4,
            dnd_sms, dnd_email, consent_sms, tags,
            custom_fields->>'doc_agent_message' AS doc_agent_message,
            custom_fields->>'employee_next_action' AS next_action,
            custom_fields->>'round_hold_reason' AS round_hold_reason
       FROM clients WHERE id = $1`, [CLIENT]);
  show("client", cl.rows);

  show("documents", (await c.query(
    `SELECT id, kind, subtype, title, current_version, created_at, updated_at, source_event_id
       FROM documents WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("DOC-CHECK agent_runs", (await c.query(
    `SELECT created_at, trigger_event, event_id, mode, outcome, left(detail, 260) AS detail
       FROM agent_runs WHERE client_id = $1 AND agent_code = 'DOC-CHECK' ORDER BY created_at`, [CLIENT])).rows);

  show("failed_events doc-check", (await c.query(
    `SELECT id, event_id, handler_name, status, attempts, max_attempts, first_seen_at, last_seen_at,
            next_attempt_at, resolved_at, left(error_message, 220) AS error_message,
            payload->>'document_id' AS document_id, payload->>'subtype' AS subtype, payload->>'kind' AS kind
       FROM failed_events WHERE client_id = $1 ORDER BY first_seen_at`, [CLIENT])).rows);

  show("tasks", (await c.query(
    `SELECT created_at, source_workflow, done, title, left(body, 240) AS body
       FROM tasks WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("messages", (await c.query(
    `SELECT created_at, direction, channel, template_key, status, provider, right(to_address, 4) AS to_last4,
            left(coalesce(last_error, blocked_reason, ''), 160) AS err
       FROM messages WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("pii_identity verified", (await c.query(
    `SELECT verified_by, verified_at, (verified_legal_name IS NOT NULL) AS has_name,
            (verified_address IS NOT NULL) AS has_addr, (verified_dob IS NOT NULL) AS has_dob
       FROM pii_identity WHERE client_id = $1`, [CLIENT])).rows);

  show("DOC-CHECK agent row", (await c.query(
    `SELECT code, status, updated_at FROM agents WHERE code = 'DOC-CHECK'`)).rows);

  show("doc templates", (await c.query(
    `SELECT template_key, channel, compliance_passed, approved_at IS NOT NULL AS approved, left(body, 200) AS body
       FROM message_templates WHERE template_key LIKE '%DOC-0%' ORDER BY template_key`)).rows);

  // Last 15 DOC-CHECK runs anywhere — is the reader still out of credit right now?
  show("recent DOC-CHECK runs (all clients)", (await c.query(
    `SELECT created_at, client_id, mode, outcome, left(detail, 160) AS detail
       FROM agent_runs WHERE agent_code = 'DOC-CHECK' ORDER BY created_at DESC LIMIT 15`)).rows);

  await c.query("ROLLBACK");
} finally {
  await c.end();
}
