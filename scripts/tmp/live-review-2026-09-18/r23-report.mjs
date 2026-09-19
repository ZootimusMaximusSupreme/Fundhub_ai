// Hole 23 reviewer — #13's credit report markers + scores. Also finds control files
// (credit report NOT simulated). READ ONLY, ROLLBACK. Prints no personal data beyond names/ids.
import pg from "pg";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const out = {};
try {
  await c.query("BEGIN READ ONLY");
  const r = (await c.query(`SELECT result->'scores' scores, result->'requestIds' request_ids, result->'simulatedNotice' notice,
     result->'pulledAt' pulled_at, result->'bureausPulled' bureaus_pulled, result->'environment' env, result->'simulated' sim, result->'source' src, result->'product' product
     FROM crs_results WHERE client_id=$1`, [ID])).rows;
  out.thirteen = r;
  out.all_crs_summary = (await c.query(`SELECT coalesce(result->>'environment','(none)') env, coalesce(result->>'simulated','(none)') sim, is_demo, count(*)::int n, count(DISTINCT client_id)::int clients
     FROM crs_results GROUP BY 1,2,3 ORDER BY 4 DESC`)).rows;
  out.control_candidates = (await c.query(`SELECT r.client_id, cl.first_name, cl.last_name, r.is_demo, r.result->>'environment' env, r.result->>'simulated' sim,
      r.result->'scores' scores, r.result->>'pulledAt' pulled_at, r.created_at,
      (SELECT count(*)::int FROM client_consents cc WHERE cc.client_id=r.client_id AND cc.revoked_at IS NULL) consents,
      (SELECT count(*)::int FROM crs_results r2 WHERE r2.client_id=r.client_id) reports,
      (SELECT count(*)::int FROM crs_results r2 WHERE r2.client_id=r.client_id AND (r2.result->>'simulated'='true' OR r2.result->>'environment'='simulated')) sim_reports
     FROM crs_results r JOIN clients cl ON cl.id=r.client_id
     WHERE coalesce(r.result->>'simulated','false') <> 'true' AND coalesce(r.result->>'environment','') <> 'simulated'
     ORDER BY r.created_at DESC LIMIT 15`)).rows;
  await c.query("ROLLBACK");
} finally { await c.end(); }
console.log(JSON.stringify(out, null, 2));
