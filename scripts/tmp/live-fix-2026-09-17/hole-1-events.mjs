// read-only: events, custom_fields, tags for hole 1 clients
import { pool, close } from "../../../src/db.mjs";
const ALL = ["d682c13b-11f3-4bd5-a0c5-232b6a7875c4","be3dcfd7-faae-4001-b97f-9bc30875bbcd","029964c5-4d8e-47ed-88c9-53ac13863fd4"];
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const cols = async (t) => (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t])).rows.map(r=>r.column_name);
  const ccols = await cols("clients");
  console.log("clients cols has:", ccols.filter(x=>/tier|tag|name|custom|product|path/.test(x)).join(","));
  const cl = await c.query(`SELECT * FROM clients WHERE id = ANY($1::uuid[])`, [ALL]);
  for (const r of cl.rows) {
    const cf = r.custom_fields || {};
    const keep = Object.fromEntries(Object.entries(cf).filter(([k]) => /pack|deliver|letter|funding|slo|path|tier|product|uwiq|underwrite|analysis|stage|purchase/i.test(k)));
    console.log(JSON.stringify({ id: r.id, first: r.first_name, outcome_tier: r.outcome_tier, tags: r.tags, cf: keep }));
  }
  const tagT = (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%tag%'`)).rows.map(r=>r.table_name);
  console.log("tag tables", tagT);
  const ev = await c.query(`SELECT client_id, name, created_at, payload->>'source' src, left(payload::text, 160) p FROM events WHERE client_id = ANY($1::uuid[]) AND (name ILIKE 'analysis%' OR name ILIKE 'decision%' OR name ILIKE '%crs%' OR name ILIKE '%pull%' OR name ILIKE '%deliver%' OR name ILIKE '%pack%' OR name ILIKE '%payment%' OR name ILIKE '%purchase%' OR name ILIKE '%entitle%') ORDER BY created_at`, [ALL]);
  for (const r of ev.rows) console.log(r.client_id.slice(0,8), r.created_at.toISOString().slice(0,19), r.name, r.src, r.p);
  await c.query("COMMIT");
} finally { c.release(); await close(); }
