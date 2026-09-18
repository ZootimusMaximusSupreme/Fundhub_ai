// HOLE 23 — READ ONLY. #13 Thirteen-NoBook: consent rows, credit result rows
// (where they came from), soft-pull ledger rows, and the old CRM consent
// fields. BEGIN READ ONLY ... COMMIT only. No SET, no writes.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h23-rows.mjs
import { pool, close } from "../../../src/db.mjs";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const out = {};
const c = await pool().connect();
async function opt(name, sql, params) {
  await c.query("SAVEPOINT sp");
  try { const r = await c.query(sql, params); await c.query("RELEASE SAVEPOINT sp"); out[name] = r.rows; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT sp"); out[name] = { err: e.message }; }
}
try {
  await c.query("BEGIN READ ONLY");
  await opt("client", `SELECT id, first_name, last_name, is_demo, created_at, outcome_tier
                         FROM clients WHERE id = $1`, [ID]);
  await opt("consents", `SELECT * FROM client_consents WHERE client_id = $1 ORDER BY created_at`, [ID]);
  await opt("crs", `SELECT id, is_demo, provider, provider_result_id, outcome_tier, created_at, updated_at,
                           result->>'source' AS result_source, result->'scores' AS scores,
                           (SELECT array_agg(k) FROM jsonb_object_keys(result) k) AS result_keys
                      FROM crs_results WHERE client_id = $1 ORDER BY created_at`, [ID]);
  await opt("crs_meta", `SELECT id, result->'meta' AS meta, result->'_meta' AS _meta, result->'sample' AS sample,
                                result->'simulated' AS simulated, result->'loaded_by' AS loaded_by,
                                result->'provenance' AS provenance, result->'note' AS note,
                                result->'simulatedNotice' AS simulated_notice, result->'environment' AS environment,
                                result->'product' AS product, result->'pulledAt' AS pulled_at, result->'requestIds' AS request_ids
                           FROM crs_results WHERE client_id = $1`, [ID]);
  await opt("soft_pulls", `SELECT * FROM soft_pull_requests WHERE client_id = $1 ORDER BY created_at`, [ID]);
  await opt("custom_fields", `SELECT * FROM client_custom_fields WHERE client_id = $1`, [ID]);
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.log("error", e.message);
} finally {
  c.release();
  await close();
}
console.log(JSON.stringify(out, null, 2));
