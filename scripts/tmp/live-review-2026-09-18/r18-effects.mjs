// Hole 18 reviewer — read only. Effects of processing each receipt. BEGIN READ ONLY.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
async function q(label, sql, params = []) {
  try { const r = await c.query(sql, params); console.log(`\n## ${label} (${r.rowCount})`); for (const row of r.rows) console.log(JSON.stringify(row)); return r.rows; }
  catch (e) { console.log(`\n## ${label} ERROR ${e.message}`); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); return []; }
}
const inbox = (await c.query(`SELECT id, payment_id, raw_body, processed_at FROM commas_inbox WHERE received_at >= '2026-09-17' ORDER BY received_at`)).rows;
const refs = inbox.map(r => { const b = JSON.parse(r.raw_body); return { inbox: r.id.slice(0,8), pid: r.payment_id, processed: r.processed_at, ref: b?.data?.api_metadata?.data?.link_ref, client: b?.data?.api_metadata?.data?.client_id, amt: b?.data?.amount, title: b?.data?.product?.title }; });
for (const x of refs) {
  console.log(`\n========== inbox ${x.inbox} ${x.pid} $${x.amt} "${x.title}" processed ${x.processed?.toISOString()}`);
  await q("client", `SELECT id, first_name, left(coalesce(last_name,''),20) last_name, client_code, funded FROM clients WHERE id=$1`, [x.client]);
  await q("pay link", `SELECT link_ref, status, amount_cents, paid_amount_cents, purpose, sale_id IS NOT NULL has_sale, invoice_id, paid_at, updated_at FROM payment_links WHERE link_ref=$1`, [x.ref]);
  await q("sale_payments on this link", `SELECT sp.kind, sp.amount, sp.paid_at, sp.created_at, p.name product FROM sale_payments sp LEFT JOIN products p ON p.id=sp.product_id WHERE sp.payment_link_id=(SELECT id FROM payment_links WHERE link_ref=$1)`, [x.ref]);
  await q("sales for client", `SELECT p.name product, s.agreed_price, s.status, s.created_at FROM sales s LEFT JOIN products p ON p.id=s.product_id WHERE s.client_id=$1 ORDER BY s.created_at`, [x.client]);
  await q("rounds for client", `SELECT round_number, status, product, funded_amount, created_at FROM funding_rounds WHERE client_id=$1 ORDER BY created_at`, [x.client]);
  await q("events for client since 15:13 today", `SELECT name, created_at FROM events WHERE client_id=$1 AND created_at >= '2026-09-18 15:13:00+00' ORDER BY created_at`, [x.client]);
  await q("messages for client since 15:13 today", `SELECT template_key, channel, status, created_at FROM messages WHERE client_id=$1 AND created_at >= '2026-09-18 15:13:00+00' ORDER BY created_at`, [x.client]);
}
await q("invoice INV-B4B9C768 (by external_ref / notes / id prefix)", `SELECT id, client_id, invoice_type, status, amount_due, paid_at, external_ref, updated_at FROM invoices WHERE external_ref ILIKE '%B4B9C768%' OR upper(replace(id::text,'-','')) LIKE 'B4B9C768%' OR notes ILIKE '%B4B9C768%'`);
await q("invoice balance view for it", `SELECT * FROM v_invoice_balance WHERE upper(replace(invoice_id::text,'-','')) LIKE 'B4B9C768%'`);
await q("invoice_payments for it", `SELECT ip.* FROM invoice_payments ip WHERE upper(replace(ip.invoice_id::text,'-','')) LIKE 'B4B9C768%'`);
await c.query("ROLLBACK"); await c.end();
