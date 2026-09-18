// N2 — read-only: what each failed payment-link step was carrying, which link
// its ref points at, and which link already holds the value it tried to write.
// Also every payment_links row whose commas_session_id is one of OUR product
// ids (uuid-shaped) — the collision source. BEGIN READ ONLY; ROLLBACK.
// Prints ids and amounts only — no email, phone, name or secret.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N2-payloads.mjs
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  const failed = (await c.query(
    `SELECT f.id AS failed_id, f.client_id, f.first_seen_at, f.event_id,
            f.payload->>'ref' AS ref, f.payload->>'itemId' AS item_id,
            f.payload->>'productId' AS product_id, f.payload->>'commasSessionId' AS commas_session_id,
            f.payload->>'providerRef' AS provider_ref, f.payload->>'amount' AS amount,
            f.payload->>'purpose' AS purpose, f.payload->>'paymentLinkId' AS payment_link_id,
            f.payload->>'source' AS source
       FROM failed_events f
      WHERE f.handler_name = 'onPaymentReceivedForLink'
      ORDER BY f.first_seen_at`)).rows;
  show("failed step payloads", failed);

  for (const f of failed) {
    const sessionTried = f.item_id || f.product_id || f.commas_session_id || f.provider_ref;
    const byRef = f.ref ? (await c.query(
      `SELECT id, client_id, purpose, status, amount_cents, commas_session_id FROM payment_links WHERE link_ref = $1`,
      [f.ref])).rows[0] || null : null;
    const holder = (await c.query(
      `SELECT id, client_id, purpose, status, commas_session_id, paid_at FROM payment_links
        WHERE provider = 'commas' AND commas_session_id = $1`, [sessionTried])).rows;
    console.log(JSON.stringify({ failed_id: f.failed_id, sessionTried, link_by_ref: byRef, already_held_by: holder }));
  }

  show("links whose commas_session_id is uuid-shaped (one of our own ids)", (await c.query(
    `SELECT pl.id, pl.client_id, pl.purpose, pl.status, pl.commas_session_id, pl.product_id,
            (pl.commas_session_id = pl.product_id::text) AS equals_own_product,
            EXISTS (SELECT 1 FROM products p WHERE p.id::text = pl.commas_session_id) AS is_a_products_id,
            pl.paid_at
       FROM payment_links pl
      WHERE pl.commas_session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ORDER BY pl.paid_at NULLS LAST`)).rows);

  show("payment.received events on the Sim files 2026-09-17/18 (key fields)", (await c.query(
    `SELECT e.id, e.client_id, e.created_at, e.payload->>'ref' AS ref, e.payload->>'itemId' AS item_id,
            e.payload->>'productId' AS product_id, e.payload->>'providerRef' AS provider_ref,
            e.payload->>'amount' AS amount, e.payload->>'purpose' AS purpose, e.payload->>'source' AS source
       FROM events e
      WHERE e.name = 'payment.received' AND e.created_at >= '2026-09-17'
      ORDER BY e.created_at`)).rows);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
