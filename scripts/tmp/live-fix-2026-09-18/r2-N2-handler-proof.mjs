// N2 PROOF (pre-ship, nothing kept) — runs the old and the new "mark the pay
// link paid" step against the LIVE table, for one open Sim link, inside one
// transaction that is always ROLLED BACK. The live unique index
// payment_links_commas_session is the judge.
//
// Link: #10 Ten-Trial, repair $1,000, pl_e60ab0743f07687351c1d5ff (status sent,
// never paid). Its product (credit repair, 0e4087cf…) is already held as a
// "Commas id" by an older paid link, which is exactly the live N2 shape.
//
// Payload is the shape src/adapters/commas.mjs processCommasInboxRow emits for
// a receipt with a link_ref and no item id (what scripts/sim/push-payment.mjs
// sends): ref, amount in dollars, productId = OUR product id, providerRef.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N2-handler-proof.mjs
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { onPaymentReceivedForLink } from "../../../src/handlers/payment-links.mjs";
import { markPaid, markPaidBySession } from "../../../src/payment-links/index.mjs";
import { toCents } from "../../../src/commissions/money.mjs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N2";
mkdirSync(OUT, { recursive: true });
const REF = "pl_e60ab0743f07687351c1d5ff";
const TEN = "22103bca-0ec9-4491-bb75-5d1b6528f116";

// The handler as it is on main today (one line differs: p.productId is in the chain).
async function oldHandler(event, db) {
  const p = event.payload || {};
  const paidAmountCents = p.amount != null ? toCents(p.amount) : null;
  const sessionId = p.itemId || p.productId || p.commasSessionId || null;
  if (p.ref) {
    const byRef = await markPaid(db, { linkRef: p.ref, commasSessionId: sessionId || p.providerRef || null, paidAmountCents });
    if (byRef) return;
  }
  if (sessionId) await markPaidBySession(db, { commasSessionId: sessionId, paidAmountCents });
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = { at: new Date().toISOString(), kept: false, link_ref: REF };
try {
  await c.query("BEGIN");
  const link = (await c.query(
    `SELECT id, client_id, purpose, amount_cents, status, product_id, commas_session_id FROM payment_links WHERE link_ref = $1`, [REF])).rows[0];
  if (!link || link.client_id !== TEN || !["created", "sent"].includes(link.status)) throw new Error("proof link is not the open #10 link");
  out.before = { purpose: link.purpose, amount_cents: link.amount_cents, status: link.status };
  out.product_id_already_held_by = (await c.query(
    `SELECT id FROM payment_links WHERE commas_session_id = $1`, [String(link.product_id)])).rows.map((r) => r.id);

  const payload = { ref: REF, amount: Number(link.amount_cents) / 100, productId: String(link.product_id),
    providerRef: `sim-pay-n2-proof-${Date.now()}`, itemId: null, purpose: link.purpose, source: "commas" };

  await c.query("SAVEPOINT old_code");
  try {
    await oldHandler({ payload }, c);
    out.old_code = { threw: false, row: (await c.query(`SELECT status, commas_session_id FROM payment_links WHERE link_ref = $1`, [REF])).rows[0] };
  } catch (e) {
    out.old_code = { threw: true, error: String(e.message) };
  }
  await c.query("ROLLBACK TO SAVEPOINT old_code");

  try {
    await onPaymentReceivedForLink({ payload }, c);
    const r = (await c.query(
      `SELECT status, paid_amount_cents, paid_at, commas_session_id FROM payment_links WHERE link_ref = $1`, [REF])).rows[0];
    out.new_code = { threw: false, row: r, commas_id_is_payment_ref: r.commas_session_id === payload.providerRef };
  } catch (e) {
    out.new_code = { threw: true, error: String(e.message) };
  }
} finally {
  await c.query("ROLLBACK").catch(() => {});
  out.after_rollback = (await c.query(`SELECT status, paid_at FROM payment_links WHERE link_ref = $1`, [REF])).rows[0];
  await c.end();
}
writeFileSync(`${OUT}/handler-proof-rolled-back.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
