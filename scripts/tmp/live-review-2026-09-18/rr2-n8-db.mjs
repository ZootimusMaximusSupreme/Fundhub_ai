// N8 reviewer — live DB look before the enrolment (produced rr2-look1-db.json at ~19:5x UTC).
// Re-created 20:14 UTC after the worktree lost its untracked files. BEGIN READ ONLY, ROLLBACK. No SET.
// Prints phone last 4 and email domain + plus-tag flag only.
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N8/review";
mkdirSync(EVID, { recursive: true });
const TAG = process.argv[2] || "look";
const SINCE = process.argv[3] || "2026-09-18T19:40:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = { at: new Date().toISOString(), since: SINCE };
const show = (label, rows) => { out[label] = rows; console.log(`\n== ${label} (${rows.length})`); for (const r of rows) console.log(JSON.stringify(r)); };
const safeRef = (s) => (s || "").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => m.slice(0, 8));
try {
  await c.query("BEGIN READ ONLY");
  const needed = (await c.query(
    `SELECT e.client_id, cl.first_name, cl.last_name, cl.is_demo, min(e.created_at) AS first_docs_needed, count(*) AS n
       FROM events e JOIN clients cl ON cl.id = e.client_id
      WHERE e.name = 'repair.docs.needed' GROUP BY 1,2,3,4 ORDER BY 5`)).rows;
  show("clients with repair.docs.needed", needed.map((r) => ({ ...r, client_id: r.client_id.slice(0, 8) })));
  for (const r of needed) {
    const m = (await c.query(
      `SELECT created_at, channel, template_key, status, provider, provider_ref, subject
         FROM messages WHERE client_id = $1 AND template_key ILIKE '%DOC-01%' ORDER BY created_at`, [r.client_id])).rows;
    const cf = (await c.query(`SELECT custom_fields->>'doc_01_request_sent_at' AS lock FROM clients WHERE id=$1`, [r.client_id])).rows[0];
    show(`DOC-01 rows for ${r.first_name} ${r.last_name} (${r.client_id.slice(0, 8)}) lock=${cf?.lock ?? "none"}`,
      m.map((x) => ({ ...x, provider_ref: safeRef(x.provider_ref) })));
  }
  show(`repair events since ${SINCE}`, (await c.query(
    `SELECT e.created_at, e.name, left(e.client_id::text,8) AS client, cl.first_name, cl.last_name
       FROM events e LEFT JOIN clients cl ON cl.id = e.client_id
      WHERE e.created_at >= $1 AND (e.name LIKE 'repair.%' OR e.name LIKE '%docs%') ORDER BY e.created_at`, [SINCE])).rows);
  show(`DOC-01 messages anywhere since ${SINCE}`, (await c.query(
    `SELECT m.created_at, m.channel, m.template_key, m.status, left(m.client_id::text,8) AS client, m.provider_ref
       FROM messages m WHERE m.created_at >= $1 AND m.template_key ILIKE '%DOC-01%' ORDER BY m.created_at`, [SINCE])).rows
      .map((x) => ({ ...x, provider_ref: safeRef(x.provider_ref) })));
  const cands = (await c.query(
    `SELECT cl.id, cl.first_name, cl.last_name, cl.is_demo, cl.created_at,
            right(regexp_replace(coalesce(cl.phone,''),'\\D','','g'),4) AS phone4,
            split_part(cl.email,'@',2) AS email_domain, position('+' in cl.email) > 0 AS plus_tag,
            cl.custom_fields->>'doc_01_request_sent_at' AS lock, cl.dnd_email,
            EXISTS (SELECT 1 FROM repair_programs rp WHERE rp.client_id = cl.id) AS in_repair,
            (SELECT count(*) FROM messages m WHERE m.client_id = cl.id AND m.template_key ILIKE '%DOC-01%')::int AS doc01_msgs,
            (SELECT count(*) FROM messages m WHERE m.client_id = cl.id)::int AS msgs,
            (SELECT string_agg(coalesce(d.subtype, d.kind), ',') FROM documents d WHERE d.client_id = cl.id) AS docs
       FROM clients cl
      WHERE (cl.first_name ILIKE 'sim%' OR cl.last_name ILIKE 'sim%' OR cl.email ILIKE '%+%')
      ORDER BY cl.created_at DESC LIMIT 60`)).rows;
  show("sim-like clients", cands.map((r) => ({ ...r, id: r.id.slice(0, 8) })));
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
writeFileSync(`${EVID}/rr2-${TAG}-db.json`, JSON.stringify(out, null, 1));
