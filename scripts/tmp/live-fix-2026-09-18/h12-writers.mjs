// HOLE 12 — read-only: which workflow wrote #8's stored next action last?
// Reads the round/deposit event payload keys (no personal data) and the
// template keys of #8's queued messages, which show which workflows ran.
import { pool, close } from "../../../src/db.mjs";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const ev = (await c.query(
    `SELECT name, created_at,
            payload->>'roundNumber' AS round_number, payload->>'round_number' AS round_number2,
            (SELECT array_agg(k) FROM jsonb_object_keys(payload) k) AS keys
       FROM events
      WHERE client_id = $1
        AND name IN ('round.started','round.submitted','round.funded','round.closeout','deposit.paid','inquiry.removed','analysis.completed','inquiry.docs.needed')
      ORDER BY created_at`, [EIGHT])).rows;
  const msgCols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='messages' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
  const tk = msgCols.includes("template_key") ? "template_key" : "NULL";
  const msgs = (await c.query(
    `SELECT ${tk} AS template_key, channel, status, created_at FROM messages WHERE client_id = $1 ORDER BY created_at`, [EIGHT])).rows;
  const cf = (await c.query(
    `SELECT custom_fields->>'product_path' AS product_path,
            custom_fields->>'doc_gate_closed_at' AS doc_gate_closed_at,
            custom_fields->>'doc_01_request_sent_at' AS doc_01_request_sent_at,
            custom_fields->>'lifecycle_status' AS lifecycle_status,
            custom_fields->>'pod_name' AS pod_name
       FROM clients WHERE id = $1`, [EIGHT])).rows[0];
  await c.query("COMMIT");
  console.log(JSON.stringify({ ev, msgs, cf }, null, 1));
} finally { c.release(); await close(); }
