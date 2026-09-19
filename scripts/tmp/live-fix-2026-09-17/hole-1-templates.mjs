// read-only: contract templates state, and which template each hole-1 contract used
import { pool, close } from "../../../src/db.mjs";
const ALL = ["d682c13b-11f3-4bd5-a0c5-232b6a7875c4","be3dcfd7-faae-4001-b97f-9bc30875bbcd","029964c5-4d8e-47ed-88c9-53ac13863fd4"];
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const t = await c.query(`SELECT org_id, template_key, name, active, is_demo, length(body) len,
      (body LIKE '%THIS IS NOT THE REAL AGREEMENT TEXT%') placeholder, updated_at
    FROM contract_templates ORDER BY template_key, org_id`);
  for (const r of t.rows) console.log(r.template_key, "|", r.name, "| active", r.active, "| demo", r.is_demo, "| len", r.len, "| PLACEHOLDER", r.placeholder, "| org", String(r.org_id).slice(0,8), "|", r.updated_at?.toISOString?.());
  const k = await c.query(`SELECT client_id, template_key, source_kind, created_by, staff_id, created_at FROM contracts WHERE client_id = ANY($1::uuid[]) ORDER BY created_at`, [ALL]);
  console.log(k.rows.map(r => `${r.client_id.slice(0,8)} ${r.template_key} src=${r.source_kind} by=${String(r.created_by).slice(0,8)} ${r.created_at.toISOString()}`).join("\n"));
  const tx = await c.query(`SELECT client_id, product_name, amount, status, created_at FROM transactions WHERE client_id = ANY($1::uuid[]) ORDER BY created_at`, [ALL]).catch(e => ({ rows: [{ err: e.message }] }));
  console.log(JSON.stringify(tx.rows));
  const m = await c.query(`SELECT count(*)::int n FROM schema_migrations WHERE filename ILIKE '%287_%' OR filename ILIKE '%288_%'`).catch(e => ({ rows: [{ err: e.message }] }));
  console.log("mig", JSON.stringify(m.rows));
  await c.query("COMMIT");
} finally { c.release(); await close(); }
