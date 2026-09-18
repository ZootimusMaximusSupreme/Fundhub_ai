// N8 — look only. Every repair program on live: which stage its card sits on,
// whether an ID + proof of address is on file, and whether anything has ever
// asked the client for them (DOC-01 message or the shared one-shot lock).
// BEGIN READ ONLY, then ROLLBACK. No SET. Names only for Sim/Walk files;
// real clients shown as "real" + first 8 of id.
import pg from "pg";
import { writeFileSync } from "node:fs";

const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N8";
const TAG = process.argv[2] || "programs";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let rows = [];
try {
  await c.query("BEGIN READ ONLY");
  rows = (await c.query(
    `SELECT rp.client_id, rp.program, rp.status AS program_status, rp.created_at AS enrolled_at,
            cl.is_demo,
            CASE WHEN cl.first_name ILIKE 'sim%' OR cl.first_name ILIKE 'walk%' OR cl.is_demo
                 THEN cl.first_name || ' ' || cl.last_name ELSE 'real' END AS who,
            (SELECT ps.key FROM cards cd JOIN pipeline_stages ps ON ps.id = cd.stage_id
               JOIN pipelines p ON p.id = cd.pipeline_id
              WHERE cd.client_id = rp.client_id AND p.key = 'optimization'
              ORDER BY cd.updated_at DESC LIMIT 1) AS repair_stage,
            (SELECT count(*)::int FROM documents d WHERE d.client_id = rp.client_id
                AND d.subtype IN ('id_document','proof_of_address')) AS id_proof_docs,
            (SELECT string_agg(DISTINCT m.template_key, ',') FROM messages m
              WHERE m.client_id = rp.client_id
                AND m.template_key IN ('EMAIL-DOC-01-REQUEST','SMS-DOC-01-REQUEST')) AS doc01_sent,
            cl.custom_fields->>'doc_01_request_sent_at' AS doc01_lock,
            (SELECT count(*)::int FROM events e WHERE e.client_id = rp.client_id
                AND e.name = 'repair.docs.needed') AS docs_needed_events
       FROM repair_programs rp JOIN clients cl ON cl.id = rp.client_id
      ORDER BY rp.created_at`)).rows.map((r) => ({
        ...r,
        client_id: r.who === "real" ? r.client_id.slice(0, 8) : r.client_id
      }));
  for (const r of rows) console.log(JSON.stringify(r));
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
writeFileSync(`${EVID}/${TAG}.json`, JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
