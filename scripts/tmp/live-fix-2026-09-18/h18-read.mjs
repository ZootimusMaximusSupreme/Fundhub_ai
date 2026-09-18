// Hole 18 — read only. Combo's payment inbox row, pay link, payments, rounds.
// Every query runs inside BEGIN READ ONLY. Nothing is written.
// Usage: node --env-file=<.env> h18-read.mjs            (default look)
//        node --env-file=<.env> h18-read.mjs "<sql>" [params...]
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
  } catch (e) {
    console.log(`\n## ${label} ERROR ${e.message}`);
    await c.query("ROLLBACK");
    await c.query("BEGIN READ ONLY");
  }
}
const extra = process.argv.slice(2);
if (extra[0] === "combo") {
  await q("inbox combo row", `SELECT id, status, attempts, payment_id, event_type, received_at, claimed_at, processed_at, left(coalesce(last_error,''),300) err FROM commas_inbox WHERE payment_id = 'sim-pay-1789721627413'`);
  await q("pay link", `SELECT id, link_ref, client_id, status, amount_cents, paid_amount_cents, purpose, product_id, sale_id, invoice_id, created_at, sent_at, paid_at FROM payment_links WHERE client_id = $1 ORDER BY created_at`, [COMBO]);
  await q("sales", `SELECT id, product_id, agreed_price, status, sold_at, sale_motion FROM sales WHERE client_id = $1`, [COMBO]);
  await q("sale_payments", `SELECT sp.id, sp.kind, sp.amount, sp.paid_at, sp.payment_link_id, sp.source_event_id FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE s.client_id = $1`, [COMBO]);
  await q("funding rounds", `SELECT id, round_number, status, product, funded_amount, created_at, source_event_id FROM funding_rounds WHERE client_id = $1`, [COMBO]);
  await q("events", `SELECT name, created_at, left(payload::text, 160) p FROM events WHERE client_id = $1 ORDER BY created_at`, [COMBO]);
  await q("failed_events", `SELECT * FROM failed_events WHERE payload::text LIKE '%' || $1 || '%' LIMIT 10`, [COMBO]);
} else if (extra.length) {
  await q("adhoc", extra[0], extra.slice(1));
} else {
  await q("inbox all non-done", `SELECT id, status, attempts, payment_id, event_type, source, received_at, claimed_at, processed_at, left(coalesce(last_error,''),300) err FROM commas_inbox WHERE status <> 'done' ORDER BY received_at DESC LIMIT 30`);
  await q("inbox combo row", `SELECT id, status, attempts, payment_id, event_type, raw_body, received_at FROM commas_inbox WHERE payment_id = 'sim-pay-1789721627413'`);
  await q("inbox last done", `SELECT status, attempts, payment_id, received_at, processed_at FROM commas_inbox WHERE status='done' ORDER BY processed_at DESC NULLS LAST LIMIT 5`);
  await q("client", `SELECT id, first_name, last_name, email, status, created_at FROM clients WHERE id = $1`, [COMBO]);
}
await c.query("ROLLBACK");
await c.end();
