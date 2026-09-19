// N8 — look only. Which allowed test files could carry the live proof?
// BEGIN READ ONLY, then ROLLBACK. Names only for Sim/Walk files.
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(
    `SELECT cl.id, cl.first_name || ' ' || cl.last_name AS who, cl.is_demo, cl.outcome_tier,
            split_part(cl.email, '@', 2) AS email_domain, right(cl.phone, 4) AS phone_last4,
            (SELECT count(*)::int FROM repair_programs rp WHERE rp.client_id = cl.id) AS repair_programs,
            (SELECT count(*)::int FROM documents d WHERE d.client_id = cl.id
               AND d.subtype IN ('id_document','proof_of_address')) AS id_proof_docs,
            (SELECT string_agg(DISTINCT m.template_key, ',') FROM messages m WHERE m.client_id = cl.id
               AND m.template_key IN ('EMAIL-DOC-01-REQUEST','SMS-DOC-01-REQUEST')) AS doc01,
            cl.custom_fields->>'doc_01_request_sent_at' AS doc01_lock
       FROM clients cl
      WHERE cl.first_name ILIKE 'walk%' OR cl.first_name ILIKE 'sim%'
      ORDER BY cl.created_at`);
  for (const row of r.rows) console.log(JSON.stringify(row));
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
