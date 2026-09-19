// Hole 18 reviewer — read only. What processing the receipts changed. BEGIN READ ONLY.
// Prints only safe fields of the raw body (ids, amounts, refs) — never emails/phones.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
async function q(label, sql, params = []) {
  try { const r = await c.query(sql, params); console.log(`\n## ${label} (${r.rowCount})`); for (const row of r.rows) console.log(JSON.stringify(row)); return r.rows; }
  catch (e) { console.log(`\n## ${label} ERROR ${e.message}`); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); return []; }
}
const rows = (await c.query(`SELECT id, payment_id, raw_body, received_at, processed_at FROM commas_inbox WHERE received_at >= '2026-09-17 18:00' ORDER BY received_at`)).rows;
const SAFE = /^(id|payment_id|paymentId|amount|amount_cents|amountCents|currency|status|type|event|event_type|link_ref|linkRef|payment_link|payment_link_id|reference|client_id|clientId|product|product_id|metadata|data|object|session_id|checkout_session_id|invoice_id|sale_id|purpose|title|name|description)$/i;
function pick(o, depth = 0) {
  if (o === null || typeof o !== "object" || depth > 4) return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (/email|phone|name$|address|token|secret|card|last4/i.test(k) && !/^(product_?name|title)$/i.test(k)) { out[k] = "[hidden]"; continue; }
    out[k] = typeof v === "object" ? pick(v, depth + 1) : v;
  }
  return out;
}
for (const r of rows) {
  let b; try { b = JSON.parse(r.raw_body); } catch { b = { unparsable: true }; }
  console.log("\n### inbox", r.id.slice(0, 8), r.payment_id, "recv", r.received_at.toISOString(), "processed", r.processed_at?.toISOString());
  console.log(JSON.stringify(pick(b)).slice(0, 900));
}
await c.query("ROLLBACK"); await c.end();
