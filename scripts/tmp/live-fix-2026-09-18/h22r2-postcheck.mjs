// Hole 22 round 2 — after the identity write: did anything else move for Combo?
// Counts rows written for Combo since the write (messages, events, documents,
// failed steps, dispute cases, identity rows). READ ONLY. No values printed.
import pg from "pg";
import { writeFileSync } from "node:fs";

const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const SINCE = process.argv[2] || "2026-09-18T15:43:00Z";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/round2";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const out = { at: new Date().toISOString(), since: SINCE };
try {
  const n = async (label, sql) => {
    await c.query("SAVEPOINT s");
    try { out[label] = (await c.query(sql, [COMBO, SINCE])).rows[0].n; await c.query("RELEASE SAVEPOINT s"); }
    catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); out[label] = `error: ${e.message}`; }
  };
  await n("messages_since", `SELECT count(*)::int n FROM messages WHERE client_id = $1 AND created_at >= $2`);
  await n("events_since", `SELECT count(*)::int n FROM events WHERE client_id = $1 AND created_at >= $2`);
  await n("documents_since", `SELECT count(*)::int n FROM documents WHERE client_id = $1 AND created_at >= $2`);
  await n("failed_events_since", `SELECT count(*)::int n FROM failed_events WHERE client_id = $1 AND first_seen_at >= $2`);
  await n("dispute_cases_since", `SELECT count(*)::int n FROM dispute_cases WHERE client_id = $1 AND created_at >= $2`);
  await n("identity_rows_total", `SELECT count(*)::int n FROM pii_identity WHERE client_id = $1 AND $2::text IS NOT NULL`);
  await n("identity_rows_updated_since", `SELECT count(*)::int n FROM pii_identity WHERE client_id = $1 AND updated_at >= $2`);
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
writeFileSync(`${OUT}/postcheck.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
