// Unit tests for src/handlers/payment-links.mjs — the payment.received
// reaction that settles a payment_links row via link_ref or Commas session id.
import { test, describe } from "node:test";
import assert from "node:assert";
import { onPaymentReceivedForLink } from "./payment-links.mjs";

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      const text = String(sql);
      if (/link_ref = \$1/i.test(text)) {
        const [link_ref, , commas_session_id, paid_amount_cents, openStatuses] = params;
        const row = rows.find((r) => r.link_ref === link_ref && openStatuses.includes(r.status));
        if (!row) return { rows: [] };
        // The live unique index payment_links_commas_session (119), so a
        // fake cannot pass a write the real table refuses.
        const next = commas_session_id ?? row.commas_session_id;
        if (next != null && rows.some((r) => r !== row && r.commas_session_id === next)) {
          throw new Error('duplicate key value violates unique constraint "payment_links_commas_session"');
        }
        row.status = "paid";
        row.commas_session_id = commas_session_id ?? row.commas_session_id;
        row.paid_amount_cents = paid_amount_cents;
        return { rows: [row] };
      }
      if (/commas_session_id = \$1/i.test(text)) {
        const [session_id, , paid_amount_cents, openStatuses] = params;
        const row = rows.find((r) => r.commas_session_id === session_id && openStatuses.includes(r.status));
        if (!row) return { rows: [] };
        row.status = "paid";
        row.paid_amount_cents = paid_amount_cents;
        return { rows: [row] };
      }
      return { rows: [] };
    }
  };
}

describe("onPaymentReceivedForLink", () => {
  test("no ref and no itemId: does nothing", async () => {
    const db = fakeDb([]);
    await onPaymentReceivedForLink({ payload: { amount: 50, providerRef: "txn_1" } }, db);
    assert.equal(db.calls.length, 0);
  });

  test("a matching ref settles the link with the processor's own session id, amount converted to cents", async () => {
    const rows = [{ link_ref: "pl_1", status: "created" }];
    const db = fakeDb(rows);
    await onPaymentReceivedForLink({ payload: { ref: "pl_1", amount: 32, providerRef: "txn_abc" } }, db);
    assert.equal(rows[0].status, "paid");
    assert.equal(rows[0].commas_session_id, "txn_abc");
    assert.equal(rows[0].paid_amount_cents, 3200);
  });

  test("itemId settles when link_ref is missing", async () => {
    const rows = [{ link_ref: "pl_wrong", commas_session_id: "8YZPo", status: "sent" }];
    const db = fakeDb(rows);
    await onPaymentReceivedForLink({ payload: { amount: 1, itemId: "8YZPo" } }, db);
    assert.equal(rows[0].status, "paid");
    assert.equal(rows[0].paid_amount_cents, 100);
  });

  test("no amount on the event records an unknown paid amount, not zero", async () => {
    const rows = [{ link_ref: "pl_1", status: "sent" }];
    const db = fakeDb(rows);
    await onPaymentReceivedForLink({ payload: { ref: "pl_1", providerRef: "txn_abc" } }, db);
    assert.equal(rows[0].paid_amount_cents, null);
  });

  /* N2 (live 2026-09-18): the inbox copies OUR products.id onto the event as
     productId. The handler wrote it into commas_session_id, so the first
     deposit ever paid kept the deposit product's id, and every later deposit
     hit the unique index and stayed unpaid. These two rows are the live shape. */
  test("a second payment on the same product settles its own link — our product id is never stored as the Commas id", async () => {
    const PRODUCT = "c087bdd2-0314-46b7-88f6-dc5c54b46a63";
    const rows = [
      { link_ref: "pl_first", status: "paid", commas_session_id: PRODUCT },
      { link_ref: "pl_second", status: "sent", commas_session_id: "nPGj5" }
    ];
    const db = fakeDb(rows);
    await onPaymentReceivedForLink(
      { payload: { ref: "pl_second", amount: 3000, productId: PRODUCT, providerRef: "sim-pay-1" } }, db);
    assert.equal(rows[1].status, "paid");
    assert.equal(rows[1].paid_amount_cents, 300000);
    assert.equal(rows[1].commas_session_id, "sim-pay-1");
    assert.equal(rows[0].commas_session_id, PRODUCT);
  });

  test("our product id alone (no ref, no itemId) settles nothing — it is not a Commas id", async () => {
    const PRODUCT = "0e4087cf-4a2f-4af4-b1a9-ce2f6319bdaa";
    const rows = [{ link_ref: "pl_other", status: "sent", commas_session_id: PRODUCT }];
    const db = fakeDb(rows);
    await onPaymentReceivedForLink({ payload: { amount: 1000, productId: PRODUCT, providerRef: "txn_9" } }, db);
    assert.equal(rows[0].status, "sent");
    assert.equal(db.calls.length, 0);
  });

  test("a ref matching nothing is a safe no-op when no itemId", async () => {
    const rows = [{ link_ref: "pl_other", status: "created" }];
    const db = fakeDb(rows);
    await onPaymentReceivedForLink({ payload: { ref: "pl_missing", amount: 10 } }, db);
    assert.equal(rows[0].status, "created");
  });
});
