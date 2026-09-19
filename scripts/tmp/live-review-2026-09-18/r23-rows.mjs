// Hole 23 reviewer — #13's consent rows, soft-pull requests, credit reports. READ ONLY, ROLLBACK.
import pg from "pg";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const out = {};
try {
  await c.query("BEGIN READ ONLY");
  const q = async (sql, p) => { await c.query("SAVEPOINT s"); try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return { error: e.message.slice(0, 200) }; } };
  out.now = (await q("SELECT now()"))[0].now;
  out.client = await q("SELECT id, first_name, last_name, created_at FROM clients WHERE id=$1", [ID]);
  out.consents_all = await q("SELECT id, kind, capture_method, granted_by_kind, granted_at, expires_at, revoked_at, consent_version FROM client_consents WHERE client_id=$1 ORDER BY created_at", [ID]);
  out.soft_pulls = await q("SELECT id, status, state_reason, provider, reason, crs_result_id, requested_at, resolved_at FROM soft_pull_requests WHERE client_id=$1 ORDER BY created_at", [ID]);
  const crs = await q("SELECT id, outcome_tier, is_demo, provider, provider_result_id, created_at, updated_at, result FROM crs_results WHERE client_id=$1 ORDER BY created_at", [ID]);
  out.crs_results = Array.isArray(crs) ? crs.map((r) => {
    const res = r.result || {};
    const flat = JSON.stringify(res);
    const hits = {};
    for (const k of ["simulated", "environment", "note", "notes", "source", "mode", "sandbox", "is_demo"]) if (k in res) hits[k] = res[k];
    const reqIds = [...new Set((flat.match(/"[a-zA-Z_]*request_?id"\s*:\s*"[^"]+"/gi) || []))].slice(0, 10);
    const scoreKeys = [...new Set((flat.match(/"(score|fico|vantage|vantagescore)[a-z_]*"\s*:\s*\d+/gi) || []))].slice(0, 12);
    return { id: r.id, outcome_tier: r.outcome_tier, is_demo: r.is_demo, provider: r.provider, provider_result_id: r.provider_result_id, created_at: r.created_at, topKeys: Object.keys(res), topLevelMarkers: hits, requestIds: reqIds, scoreHits: scoreKeys, simulatedMentions: (flat.match(/simulat/gi) || []).length, len: flat.length };
  }) : crs;
  // also any tradelines rows with source crs for this client
  out.tradelines = await q("SELECT source, is_demo, count(*)::int n FROM tradelines WHERE client_id=$1 GROUP BY 1,2", [ID]);
  await c.query("ROLLBACK");
} finally { await c.end(); }
console.log(JSON.stringify(out, null, 2));
