// HOLE N12 (attempt b) — READ ONLY. The stored credit report rows on #13 and on
// the Colin control, and the decision events that set Prequal / Tier: row
// stamps, keys and counts only. BEGIN READ ONLY ... COMMIT. No SET, no PII.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n12b-crs.mjs
import { pool, close } from "../../../src/db.mjs";
const IDS = { "13": "7ccbeb76-df98-4125-8c14-0d1c9f5e3042", colin: "e42c11e8-ec33-40b7-ac5a-99f733d18a3f" };
const out = {};
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  for (const [k, id] of Object.entries(IDS)) {
    const crs = await c.query(
      `SELECT id, outcome_tier, created_at, result->>'environment' AS env, result->>'simulated' AS sim,
              result->>'fundingEstimate' AS fe, (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(result) k) AS keys
         FROM crs_results WHERE client_id = $1 ORDER BY created_at DESC`, [id]);
    const cl = await c.query(
      `SELECT outcome_tier, custom_fields->>'total_funding_estimate' AS tfe, custom_fields->>'analyzer_prequal_amount' AS apa,
              custom_fields->>'analyzer_path' AS ap, custom_fields->>'product_path' AS pp, tags
         FROM clients WHERE id = $1`, [id]);
    const ev = await c.query(
      `SELECT name, created_at, payload->>'crsResultId' AS crs, payload->>'simulated' AS sim,
              payload->>'fundingEstimate' AS fe, payload->>'outcomeTier' AS tier
         FROM events WHERE client_id = $1 AND name = 'decision.rendered' ORDER BY created_at`, [id]);
    out[k] = { crs: crs.rows, client: cl.rows, decisions: ev.rows };
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
