// Hole 22 reviewer — the credit pull on record for Combo carries addresses. Whose, and from where?
// Read only. Street values are masked (digits -> #, letters after the first -> *).
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const mask = (s) => (typeof s === "string" ? s.replace(/\d/g, "#").replace(/([A-Za-z])([A-Za-z]+)/g, (m, a, b) => a + "*".repeat(b.length)) : s);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const r = (await c.query(`select id, created_at, to_jsonb(r) - 'result' meta, result from crs_results r where client_id=$1`, [COMBO])).rows;
  for (const x of r) {
    console.log("crs row", x.id, x.created_at, JSON.stringify(Object.fromEntries(Object.entries(x.meta).filter(([k]) => !/token|secret|ssn/i.test(k)).map(([k, v]) => [k, typeof v === "object" ? (v ? "{obj}" : null) : v]))));
    console.log(" top keys", Object.keys(x.result || {}));
    console.log(" environment", x.result?.environment, "source", x.result?.source, "provider", x.result?.provider);
    for (const [b, v] of Object.entries(x.result?.bureaus || {})) {
      const rq = v.requestData || {};
      const cf = (v.creditFiles || [])[0] || {};
      const nm = (o) => o && [o.firstName, o.middleName, o.lastName].filter(Boolean).join(" ");
      console.log(` ${b} request name:`, nm(rq) || JSON.stringify(Object.keys(rq)), "| request addr:", JSON.stringify((rq.addresses || []).map((a) => ({ line1: mask(a.addressLine1), city: a.city, state: a.state, zip: mask(a.postalCode) }))));
      console.log(` ${b} file names:`, JSON.stringify((cf.names || cf.borrowers || []).slice(0, 2).map((n) => nm(n) || Object.keys(n))), "| file addr:", JSON.stringify((cf.addresses || []).map((a) => ({ line1: mask(a.addressLine1), city: a.city, state: a.state, zip: mask(a.postalCode), type: a.addressType || a.type || null }))));
      console.log(` ${b} request keys:`, Object.keys(rq).join(","));
    }
  }
  const ev = (await c.query(`select name, created_at, payload->'present' present, payload->>'source' source, (select array_agg(k) from jsonb_object_keys(payload) k) keys from events where client_id=$1 order by created_at`, [COMBO])).rows;
  for (const e of ev) console.log("event", e.created_at.toISOString(), e.name, "source=", e.source, "present=", JSON.stringify(e.present), "keys=", (e.keys || []).slice(0, 12).join(","));
  const biz = (await c.query(`select name, entity_data->>'city' city, entity_data->>'state' state, (select array_agg(k) from jsonb_object_keys(coalesce(entity_data,'{}'::jsonb)) k) keys from businesses where client_id=$1`, [COMBO])).rows;
  for (const b of biz) console.log("business", b.name, "| city:", b.city, "| state:", b.state, "| keys:", (b.keys || []).join(","));
} finally { await c.query("ROLLBACK"); await c.end(); }
