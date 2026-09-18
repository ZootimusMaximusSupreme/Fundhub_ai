// N10 (round b) — were the #13 and Combo practice pulls made by THIS tool
// (scripts/sim/push-credit.mjs), and what did its run leave behind?
//
// READ ONLY on live (BEGIN READ ONLY, rolled back). Prints ids, times, counts
// and booleans only — no street, ZIP, SSN, DOB, email or phone.
//
// The tool's own marks: requestId "sim-walkthrough:<crs id>" on the
// analysis.completed event, and the idempotency key
// "crs-result:<crs id>:analysis.completed:v1".
//
// Usage: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//          scripts/tmp/live-fix-2026-09-18/r2-N10b-origin.mjs
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N10";
mkdirSync(OUT, { recursive: true });
const CLIENTS = [
  ["Sim Thirteen-NoBook #13", "7ccbeb76-df98-4125-8c14-0d1c9f5e3042"],
  ["Sim Combo-20260918", "567c12ce-64de-4043-aa98-d842434bd267"],
];

const out = { at: new Date().toISOString(), clients: [] };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  for (const [label, id] of CLIENTS) {
    const pulls = (await c.query(
      `SELECT cr.id, cr.created_at, cr.outcome_tier,
              cr.result->>'environment' AS environment,
              (cr.result->>'simulated')::text AS simulated
         FROM crs_results cr WHERE cr.client_id = $1 ORDER BY cr.created_at`, [id])).rows;
    const events = (await c.query(
      `SELECT id, name, created_at, idempotency_key,
              payload->>'requestId' AS request_id, payload->>'outcomeTier' AS outcome_tier
         FROM events WHERE client_id = $1 AND name IN ('analysis.completed','decision.rendered')
        ORDER BY created_at`, [id])).rows;
    const identity = (await c.query(
      `SELECT created_at, updated_at, ssn_enc IS NOT NULL AS has_ssn, dob IS NOT NULL AS has_dob,
              jsonb_array_length(COALESCE(addresses,'[]'::jsonb)) AS n_addresses
         FROM pii_identity WHERE client_id = $1`, [id])).rows[0] || null;
    const consent = (await c.query(
      `SELECT count(*)::int AS n FROM client_consents WHERE client_id = $1 AND kind = 'soft_pull_consent'`, [id])).rows[0].n;
    const docs = (await c.query(
      `SELECT kind, generated_by, count(*)::int AS n, min(created_at) AS first_at
         FROM documents WHERE client_id = $1 GROUP BY kind, generated_by ORDER BY 4`, [id])).rows;
    const stamp = (await c.query(
      `SELECT custom_fields->>'funding_letters_delivered_event_id' AS stamp FROM clients WHERE id = $1`, [id])).rows[0]?.stamp || null;
    out.clients.push({
      label, client_id: id,
      pulls,
      events: events.map((e) => ({
        ...e,
        made_by_push_credit_tool: String(e.request_id || "").startsWith("sim-walkthrough:"),
      })),
      identity_row: identity,
      soft_pull_form_consents: consent,
      documents_by_writer: docs,
      funding_letters_stamp: stamp,
    });
  }
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
writeFileSync(`${OUT}/origin-live.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
