// Hole 22 reviewer — something wrote to Combo around 15:13 UTC during review pass 2. What? Read only.
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const SINCE = process.argv[2] || "2026-09-18T14:40:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const q = async (sql, p = []) => { await c.query("SAVEPOINT s"); try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 150) }]; } };
try {
  const ev = await q(`select created_at, name, payload->>'source' source, (select array_agg(k) from jsonb_object_keys(payload) k) keys,
                             payload->>'staffId' staff, payload->>'actor' actor, payload->>'via' via, payload->>'product' product, payload->>'productKey' product_key
                        from events where client_id=$1 and created_at > $2 order by created_at`, [COMBO, SINCE]);
  for (const e of ev) console.log("EVENT", e.created_at?.toISOString?.() ?? e.created_at, e.name, "| source:", e.source, "| staff:", e.staff, "| actor:", e.actor, "| product:", e.product || e.product_key, "| keys:", (e.keys || []).join(","));
  const m = await q(`select created_at, channel, template_key, status from messages where client_id=$1 and created_at > $2 order by created_at`, [COMBO, SINCE]);
  for (const x of m) console.log("MSG", x.created_at?.toISOString?.(), x.channel, x.template_key, x.status);
  const w = await q(`select to_jsonb(w) - 'body' - 'payload' - 'headers' - 'raw' j from webhook_captures w where to_jsonb(w)::text ilike $1 order by (to_jsonb(w)->>'created_at') desc limit 4`, [`%${COMBO}%`]);
  for (const x of w) console.log("WEBHOOK", JSON.stringify(Object.fromEntries(Object.entries(x.j || x).filter(([k]) => !/secret|token|sig|key/i.test(k)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 80) : v]))));
  const s = await q(`select to_jsonb(s) j from sales s where client_id=$1`, [COMBO]);
  for (const x of s) console.log("SALE", JSON.stringify(Object.fromEntries(Object.entries(x.j).filter(([k]) => /at$|status|product|amount|source|method|created_by|staff|id$/i.test(k)))));
  const t = await q(`select title, source_workflow, created_at from tasks where client_id=$1 order by created_at`, [COMBO]);
  for (const x of t) console.log("TASK", x.created_at?.toISOString?.(), x.source_workflow, "|", x.title);
  const f = await q(`select event_name, handler_name, status, left(error_message, 200) err, first_seen_at from failed_events where client_id=$1 order by first_seen_at`, [COMBO]);
  for (const x of f) console.log("FAILED", x.first_seen_at?.toISOString?.(), x.event_name, x.handler_name, x.status, "|", x.err);
  const pl = await q(`select to_jsonb(p) j from payment_links p where client_id=$1`, [COMBO]);
  for (const x of pl) console.log("PAYLINK", JSON.stringify(Object.fromEntries(Object.entries(x.j).filter(([k]) => /at$|status|product|amount|paid/i.test(k)))));
  const au = await q(`select table_name from information_schema.tables where table_schema='public' and table_name ilike '%audit%'`);
  console.log("audit tables:", au.map((r) => r.table_name).join(","));
} finally { await c.query("ROLLBACK"); await c.end(); }
