// Hole 18 reviewer — read only look at live rows. BEGIN READ ONLY; nothing written.
// Prints no emails, phones, tokens, or raw bodies.
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
async function q(label, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    console.log(`\n## ${label} (${r.rowCount})`);
    for (const row of r.rows) console.log(JSON.stringify(row));
    return r.rows;
  } catch (e) {
    console.log(`\n## ${label} ERROR ${e.message}`);
    await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY");
    return [];
  }
}
await q("now", "SELECT now() AS db_now");
if (process.argv[2] === "adhoc") { await q("adhoc", process.argv[3], process.argv.slice(4)); await c.query("ROLLBACK"); await c.end(); process.exit(0); }
await q("inbox: combo row 85034105", `SELECT id, status, attempts, payment_id, event_type, source, received_at, claimed_at, processed_at, left(coalesce(last_error,''),200) err FROM commas_inbox WHERE id='85034105-824c-4b48-8b06-95d756e4f468'`);
const older = await q("inbox: all rows received 2026-09-17 and 2026-09-18 (not by status)", `SELECT id, status, attempts, payment_id, event_type, source, received_at, claimed_at, processed_at, left(coalesce(last_error,''),200) err FROM commas_inbox WHERE received_at >= '2026-09-17' ORDER BY received_at`);
await q("inbox: anything not done right now", `SELECT id, status, attempts, payment_id, received_at, processed_at, left(coalesce(last_error,''),200) err FROM commas_inbox WHERE status <> 'done' ORDER BY received_at DESC LIMIT 30`);
await q("inbox: status counts", `SELECT status, count(*) FROM commas_inbox GROUP BY status`);
await q("pay links: combo", `SELECT id, link_ref, status, amount_cents, paid_amount_cents, purpose, product_id, sale_id, invoice_id, created_at, sent_at, paid_at, updated_at FROM payment_links WHERE client_id=$1 ORDER BY created_at`, [COMBO]);
await q("pay link pl_bd696468da1b9126a2afc9cc", `SELECT id, client_id, status, amount_cents, paid_amount_cents, paid_at, updated_at FROM payment_links WHERE link_ref='pl_bd696468da1b9126a2afc9cc'`);
await q("sales: combo", `SELECT s.id, p.name product, p.code, s.agreed_price, s.status, s.sold_at, s.sale_motion, s.created_at FROM sales s LEFT JOIN products p ON p.id=s.product_id WHERE s.client_id=$1`, [COMBO]);
await q("sale_payments: combo", `SELECT sp.id, sp.kind, sp.amount, sp.paid_at, sp.payment_link_id, sp.source_event_id, sp.created_at FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id WHERE s.client_id=$1`, [COMBO]);
await q("funding_rounds: combo", `SELECT id, round_number, status, product, submitted_amount, approved_amount, funded_amount, created_at, source_event_id FROM funding_rounds WHERE client_id=$1`, [COMBO]);
await q("funding_round_sales: combo", `SELECT frs.* FROM funding_round_sales frs JOIN funding_rounds fr ON fr.id=frs.funding_round_id WHERE fr.client_id=$1`, [COMBO]);
await q("invoices: combo", `SELECT id, invoice_type, status, amount_due, sale_id, funding_round_id, paid_at, created_at, source FROM invoices WHERE client_id=$1`, [COMBO]);
await q("events: combo since 2026-09-18 00:00", `SELECT id, name, created_at FROM events WHERE client_id=$1 AND created_at >= '2026-09-18' ORDER BY created_at`, [COMBO]);
await q("messages: combo since 15:20 UTC", `SELECT template_key, channel, status, direction, created_at FROM messages WHERE client_id=$1 AND created_at >= '2026-09-18 15:20:00+00' ORDER BY created_at`, [COMBO]);
// Clients behind the older receipts: find pay links / payments mentioned in the older rows by payment_id.
const pids = older.filter(r => r.id !== '85034105-824c-4b48-8b06-95d756e4f468').map(r => r.payment_id);
console.log("\nolder payment_ids:", JSON.stringify(pids));
await c.query("ROLLBACK"); await c.end();
