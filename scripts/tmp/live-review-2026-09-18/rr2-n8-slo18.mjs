// N8 reviewer — the fresh file after enrolment + controls. BEGIN READ ONLY, ROLLBACK. No SET.
// (Re-created 20:12 UTC after the worktree lost its untracked files.)
// Prints no full email/phone; ids in provider_ref cut to 8 chars.
import pg from "pg";
import { writeFileSync } from "node:fs";
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N8/review";
const TAG = process.argv[2] || "slo18";
const ID = "0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0";
const CONTROL8 = ["567c12ce", "be3dcfd7", "22103bca", "4cd0dbd1", "9b03c7f2"]; // Combo, Nine, Ten, Walk2, Walk3
const safe = (s) => (s || "").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => m.slice(0, 8));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = { at: new Date().toISOString() };
const show = (label, rows) => { out[label] = rows; console.log(`\n== ${label} (${rows.length})`); for (const r of rows) console.log(JSON.stringify(r)); };
try {
  await c.query("BEGIN READ ONLY");
  show("events (Sim SloEighteen)", (await c.query(
    `SELECT created_at, name, idempotency_key FROM events WHERE client_id=$1 ORDER BY created_at`, [ID])).rows
    .map((r) => ({ ...r, idempotency_key: safe(r.idempotency_key) })));
  show("messages (Sim SloEighteen)", (await c.query(
    `SELECT created_at, updated_at, channel, template_key, status, provider, provider_ref, provider_message_id IS NOT NULL AS has_provider_id,
            subject, attempts, last_error, blocked_reason, split_part(to_address,'@',2) AS to_domain, position('+' in to_address) > 0 AS to_plus_tag
       FROM messages WHERE client_id=$1 ORDER BY created_at`, [ID])).rows
    .map((r) => ({ ...r, provider_ref: safe(r.provider_ref) })));
  show("client row (Sim SloEighteen)", (await c.query(
    `SELECT custom_fields->>'doc_01_request_sent_at' AS doc01_lock, coalesce(phone,'') = '' AS no_phone, dnd_email, is_demo FROM clients WHERE id=$1`, [ID])).rows);
  show("repair program (Sim SloEighteen)", (await c.query(
    `SELECT program, rounds_cap, price_total, amount_paid, status, created_at FROM repair_programs WHERE client_id=$1`, [ID])).rows);
  show("documents (Sim SloEighteen)", (await c.query(
    `SELECT kind, subtype, created_at FROM documents WHERE client_id=$1`, [ID])).rows);
  show("DOC-01 rows created after the ship (19:47:05 UTC), any client", (await c.query(
    `SELECT m.created_at, m.channel, m.template_key, m.status, cl.first_name || ' ' || cl.last_name AS who
       FROM messages m JOIN clients cl ON cl.id = m.client_id
      WHERE m.created_at >= '2026-09-18T19:47:05Z' AND m.template_key ILIKE '%DOC-01%' ORDER BY m.created_at`)).rows);
  show("DOC-01 rows per control file (all time)", (await c.query(
    `SELECT cl.first_name || ' ' || cl.last_name AS who, m.channel, count(*)::int AS n, max(m.created_at) AS last
       FROM messages m JOIN clients cl ON cl.id = m.client_id
      WHERE m.template_key ILIKE '%DOC-01%' AND left(m.client_id::text,8) = ANY($1)
      GROUP BY 1,2 ORDER BY 1,2`, [CONTROL8])).rows);
  show("repair.* / docs events after the ship, any client", (await c.query(
    `SELECT e.created_at, e.name, cl.first_name || ' ' || cl.last_name AS who FROM events e LEFT JOIN clients cl ON cl.id=e.client_id
      WHERE e.created_at >= '2026-09-18T19:47:05Z' AND (e.name LIKE 'repair.%' OR e.name LIKE '%docs%') ORDER BY e.created_at`)).rows);
  show("message delivery events for Sim SloEighteen's messages", (await c.query(
    `SELECT e.created_at, e.name, left(e.payload::text, 140) AS payload FROM events e
      WHERE e.created_at >= '2026-09-18T20:05:00Z' AND e.name ILIKE 'message.%' AND e.name <> 'message.queued'
        AND (e.client_id = $1 OR e.payload::text LIKE '%' || $1 || '%') ORDER BY e.created_at`, [ID])).rows
    .map((r) => ({ ...r, payload: safe(r.payload).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[email]") })));
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
writeFileSync(`${EVID}/rr2-${TAG}-db.json`, JSON.stringify(out, null, 1));
