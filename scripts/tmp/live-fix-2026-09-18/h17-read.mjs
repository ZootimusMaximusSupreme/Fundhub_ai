// HOLE 17 — read-only look at file #13 Thirteen-NoBook on the live database.
// BEGIN READ ONLY, then ROLLBACK. No SET. Never prints a secret, a full phone
// or a full email (last 4 of the address only).
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h17-read.mjs
import pg from "pg";

const CLIENT = process.argv[2] || "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  show("client", (await c.query(
    `SELECT id, org_id, first_name, last_name, tags,
            custom_fields->>'employee_next_action' AS next_action,
            custom_fields->>'doc_01_request_sent_at' AS doc01_lock,
            custom_fields->>'inquiry_docs_missing' AS inquiry_docs_missing
       FROM clients WHERE id = $1`, [CLIENT])).rows);

  show("documents", (await c.query(
    `SELECT id, kind, subtype, title, current_version, created_at,
            metadata->'label' AS label, metadata->'uploaded_by'->>'kind' AS by
       FROM documents WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("inquiry cases", (await c.query(
    `SELECT id, case_status::text AS status, created_at, updated_at
       FROM inquiry_removal_cases WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("messages", (await c.query(
    `SELECT created_at, direction, channel, template_key, status,
            right(to_address, 4) AS to_last4
       FROM messages WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("docs.received events", (await c.query(
    `SELECT id, created_at, payload->>'kind' AS kind, payload->>'subtype' AS subtype
       FROM events WHERE client_id = $1 AND name = 'docs.received' ORDER BY created_at`, [CLIENT])).rows);

  show("owner avatar (is one set?)", (await c.query(
    `SELECT (avatar_key IS NOT NULL) AS has_avatar, updated_at
       FROM staff WHERE lower(email) = 'chris@fundhub.ai'`)).rows);

  show("outbound switch", (await c.query(
    `SELECT org_id, outbound_enabled FROM messaging_settings`)).rows);
} catch (e) {
  console.log("ERR", e.message);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
