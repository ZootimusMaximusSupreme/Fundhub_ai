// N13 — what #12 owns and what has happened on its file, straight from the
// rows. BEGIN READ ONLY, then ROLLBACK. Writes nothing. Prints no secrets and
// no personal fields — ids, codes, statuses and timestamps only.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n13-read.mjs
import { pool } from "../../../src/db.mjs";

const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const c = await pool().connect();
const out = {};
async function q(label, sql, args) {
  try {
    await c.query("SAVEPOINT s");
    const r = await c.query(sql, args);
    await c.query("RELEASE SAVEPOINT s");
    return r.rows;
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT s");
    return { error: `${label}: ${e.message}` };
  }
}
try {
  await c.query("BEGIN READ ONLY");
  for (const [name, id] of [["twelve", TWELVE], ["eleven", ELEVEN]]) {
    const o = {};
    o.entitlements = await q("ent", `SELECT entitlement_code, grant_reason, granted_at, revoked_at, expires_at
         FROM entitlements WHERE client_id = $1 ORDER BY granted_at`, [id]);
    o.documents = await q("docs", `SELECT kind, subtype, title, generated_at, created_at
         FROM documents WHERE client_id = $1 ORDER BY created_at`, [id]);
    o.funding_rounds = await q("fr", `SELECT * FROM funding_rounds WHERE client_id = $1 ORDER BY created_at`, [id]);
    o.decision_log = await q("rdl", `SELECT decision, created_at FROM repair_decision_log WHERE client_id = $1 ORDER BY created_at`, [id]);
    o.cards = await q("cards", `SELECT p.key AS pipeline, s.key AS stage, c.entered_at, c.created_at
         FROM cards c JOIN pipelines p ON p.id = c.pipeline_id LEFT JOIN stages s ON s.id = c.stage_id
        WHERE c.client_id = $1`, [id]);
    o.transactions = await q("tx", `SELECT product_name, status, created_at FROM transactions WHERE client_id = $1 ORDER BY created_at`, [id]);
    out[name] = o;
  }
  await c.query("ROLLBACK");
  console.log(JSON.stringify(out, (k, v) => v, 2));
} finally {
  c.release();
  await pool().end();
}
