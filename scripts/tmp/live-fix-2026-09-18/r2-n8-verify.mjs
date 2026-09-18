// N8 VERIFY — look only. Repair files waiting on photo ID + proof of address:
// did any message ask them for the documents?
// BEGIN READ ONLY, then ROLLBACK. No SET. Never prints a secret; phone/email
// shown as last 4 / domain only.
import pg from "pg";
import { writeFileSync } from "node:fs";

const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N8";
const TAG = process.argv[2] || "verify";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = {};
const show = (label, rows) => {
  out[label] = rows;
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  const evs = (await c.query(
    `SELECT e.client_id, cl.first_name, cl.last_name, cl.is_demo, e.name, e.created_at,
            left(e.payload::text, 160) AS payload
       FROM events e JOIN clients cl ON cl.id = e.client_id
      WHERE e.name IN ('repair.docs.needed','repair.docs.complete','repair.enrolled')
      ORDER BY e.created_at`)).rows;
  show("repair doc events", evs);
  const ids = [...new Set(evs.filter((e) => e.name === "repair.docs.needed").map((e) => e.client_id))];
  for (const id of ids) {
    const name = evs.find((e) => e.client_id === id);
    show(`messages for ${name.first_name} ${name.last_name} (${id.slice(0, 8)})`, (await c.query(
      `SELECT created_at, direction, channel, template_key, status, provider,
              right(to_address, 4) AS to_last4
         FROM messages WHERE client_id = $1 ORDER BY created_at`, [id])).rows);
    show(`docs for ${id.slice(0, 8)}`, (await c.query(
      `SELECT created_at, kind, subtype FROM documents WHERE client_id = $1 ORDER BY created_at`, [id])).rows);
  }
  show("templates that could ask for ID/proof", (await c.query(
    `SELECT template_key, channel, compliance_passed, left(coalesce(subject,''),80) AS subject
       FROM message_templates
      WHERE template_key ILIKE '%DOC-01%' OR template_key ILIKE '%REPAIR%' OR template_key ILIKE '%ID-PORTAL%'
      ORDER BY template_key`)).rows);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
writeFileSync(`${EVID}/${TAG}-db.json`, JSON.stringify({ at: new Date().toISOString(), ...out }, null, 1));
