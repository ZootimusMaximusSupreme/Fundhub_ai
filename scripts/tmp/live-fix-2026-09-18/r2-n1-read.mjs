// N1 — read only. Late receipts double-count on #8 / #9. Everything inside BEGIN READ ONLY.
// Usage: node --env-file=<.env> r2-n1-read.mjs [client-id ...]
//        node --env-file=<.env> r2-n1-read.mjs "<sql>" [params...]
import pg from "pg";
const C8 = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const C9 = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
async function q(label, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    console.log(`\n## ${label} (${r.rowCount})`);
    for (const row of r.rows) console.log(JSON.stringify(row));
  } catch (e) {
    console.log(`\n## ${label} ERROR ${e.message}`);
    await c.query("ROLLBACK");
    await c.query("BEGIN READ ONLY");
  }
}
const extra = process.argv.slice(2);
if (extra[0] && extra[0].includes(" ")) {
  await q("adhoc", extra[0], extra.slice(1));
} else {
  const ids = extra.length ? extra : [C8, C9];
  for (const id of ids) {
    console.log(`\n\n######## CLIENT ${id}`);
    await q("sales", `SELECT s.id, pr.code, s.agreed_price, s.status, s.sold_at, s.sale_motion, s.external_ref, s.notes FROM sales s JOIN products pr ON pr.id=s.product_id WHERE s.client_id = $1 ORDER BY s.sold_at`, [id]);
    await q("sale_payments", `SELECT sp.id, sp.sale_id, sp.kind, sp.amount, sp.paid_at, sp.payment_link_id, sp.transaction_id, sp.source_event_id, sp.notes, sp.created_at FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE s.client_id = $1 ORDER BY sp.created_at`, [id]);
    await q("transactions", `SELECT * FROM transactions WHERE client_id = $1 ORDER BY created_at`, [id]);
    await q("invoices", `SELECT * FROM invoices WHERE client_id = $1 ORDER BY created_at`, [id]);
    await q("payment_links", `SELECT id, link_ref, status, amount_cents, paid_amount_cents, purpose, sale_id, invoice_id, commas_session_id, created_at, paid_at FROM payment_links WHERE client_id = $1 ORDER BY created_at`, [id]);
    await q("events (money)", `SELECT id, name, created_at, idempotency_key, payload->>'amount' amt, payload->>'product' product, payload->>'providerRef' pref, payload->>'paymentId' pid, payload->>'invoiceId' inv, payload->>'saleId' sale, payload->>'paymentLinkId' link FROM events WHERE client_id = $1 AND name IN ('payment.received','deposit.paid','sale.closed','diagnostic.paid','invoice.paid','round.funded','round.started') ORDER BY created_at`, [id]);
  }
}
await c.query("ROLLBACK");
await c.end();
