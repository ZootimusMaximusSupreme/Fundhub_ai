// Hole 22 reviewer — is the credit-pull address one and the same everywhere? What did the survey ask? Read only, values not printed.
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const r = (await c.query(`select result from crs_results where client_id=$1`, [COMBO])).rows[0].result;
  const norm = (a) => a && [a.addressLine1, a.addressLine2, a.city, a.state, a.postalCode].map((x) => (x || "").toUpperCase().trim()).join("|");
  const set = new Set();
  for (const [b, v] of Object.entries(r.bureaus)) {
    const rq = norm(v.requestData?.addresses?.[0]); const cf = norm(v.creditFiles?.[0]?.addresses?.[0]);
    set.add(rq); set.add(cf);
    console.log(b, "request==file:", rq === cf, "| has line1:", Boolean(v.requestData?.addresses?.[0]?.addressLine1), "| zip 5 digits:", /^\d{5}$/.test(v.requestData?.addresses?.[0]?.postalCode || ""));
  }
  console.log("distinct addresses across 3 bureaus (request + file):", set.size);
  console.log("pulledAt:", r.pulledAt, "| environment:", r.environment, "| simulated:", r.simulated, "| simulatedNotice present:", Boolean(r.simulatedNotice));
  const sv = (await c.query(`select payload->'answers' a, payload->'business' b from events where client_id=$1 and name='survey.submitted'`, [COMBO])).rows[0];
  console.log("survey answer keys:", Object.keys(sv?.a || {}).join(","));
  console.log("survey business keys:", Object.keys(sv?.b || {}).join(","));
  const ev0 = (await c.query(`select payload from events where client_id=$1 and name='analysis.completed'`, [COMBO])).rows[0]?.payload;
  const evAddr = norm(ev0?.bureaus?.EQ?.requestData?.addresses?.[0]);
  console.log("analysis.completed event carries same address:", set.has(evAddr));
  const pii = (await c.query(`select count(*)::int n from pii_identity where client_id=$1`, [COMBO])).rows[0].n;
  const cf = (await c.query(`select business_street_address, business_city, business_postal_code from client_custom_fields where client_id=$1`, [COMBO])).rows[0];
  console.log("pii_identity rows:", pii, "| custom business street/city/zip filled:", Object.values(cf || {}).map((v) => Boolean(v)));
  const cl = (await c.query(`select to_jsonb(c) j from clients c where id=$1`, [COMBO])).rows[0].j;
  console.log("clients columns:", Object.keys(cl).join(","));
} finally { await c.query("ROLLBACK"); await c.end(); }
