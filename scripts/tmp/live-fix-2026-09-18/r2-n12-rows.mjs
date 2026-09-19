// HOLE N12 — READ ONLY. Where #13's Prequal and the Colin control's figures
// came from: decision events (simulated stamp), custom fields that feed the
// screen. BEGIN READ ONLY ... COMMIT only. No SET, no writes. No PII printed.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n12-rows.mjs
import { pool, close } from "../../../src/db.mjs";
const IDS = { "13": "7ccbeb76-df98-4125-8c14-0d1c9f5e3042", colin: "e42c11e8-ec33-40b7-ac5a-99f733d18a3f" };
const out = {};
const c = await pool().connect();
async function opt(name, sql, params) {
  await c.query("SAVEPOINT sp");
  try { const r = await c.query(sql, params); await c.query("RELEASE SAVEPOINT sp"); out[name] = r.rows; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT sp"); out[name] = { err: e.message }; }
}
try {
  await c.query("BEGIN READ ONLY");
  for (const [k, id] of Object.entries(IDS)) {
    await opt(`${k}_decisions`, `SELECT name, created_at, payload->>'fundingEstimate' AS est,
                                         payload->>'simulated' AS simulated, payload->>'crsResultId' AS crs
                                    FROM events WHERE client_id = $1 AND name IN ('decision.rendered','analysis.completed')
                                   ORDER BY created_at`, [id]);
    await opt(`${k}_cf`, `SELECT custom_fields->>'total_funding_estimate' AS tfe,
                                 custom_fields->>'analyzer_prequal_amount' AS apa,
                                 custom_fields->>'utilization' AS util,
                                 custom_fields->>'crs_inquiries_ex' AS inq_ex
                            FROM clients WHERE id = $1`, [id]);
  }
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.log("error", e.message);
} finally {
  c.release();
  await close();
}
console.log(JSON.stringify(out, null, 2));
