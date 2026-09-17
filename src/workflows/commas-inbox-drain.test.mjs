/* Tests for the Commas payment-inbox drain.
 *
 * The one that matters is the last one: that this is REGISTERED. The whole
 * reason the file exists is that the queue's only clock had silently stopped,
 * so six real payments sat pending with attempts=0 and nothing tried them.
 * A drain nothing serves is the defect it was written to close. */

import { test, describe } from "node:test";
import assert from "node:assert";

import { sweep, SWEEP_CRON, BATCH, commasInboxDrain } from "./commas-inbox-drain.mjs";

/* A queue with nothing waiting. claim() is an UPDATE ... RETURNING *, so an
   empty result is "nothing to do". */
const emptyDb = () => ({ query: async () => ({ rows: [] }) });

/* A queue holding `count` rows, handed out on the first claim and empty after —
   the shape of one real pass that finds a backlog and clears it. */
const queuedDb = (count, onClaim) => {
  let served = false;
  return {
    query: async (sql, params) => {
      if (/UPDATE commas_inbox\s+SET status = 'processing'/.test(sql)) {
        if (served) return { rows: [] };
        served = true;
        if (onClaim) onClaim(params);
        return {
          rows: Array.from({ length: count }, (_, i) => ({
            id: `row-${i}`,
            payment_id: `pay-${i}`,
            event_type: "payment.succeeded",
            attempts: 1
          }))
        };
      }
      return { rows: [] };
    }
  };
};

describe("the payment inbox drain", () => {
  test("an empty queue is a clean, quiet pass", async () => {
    const res = await sweep(emptyDb(), { process: async () => ({ ok: true }) });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.claimed, 0);
  });

  test("a pending payment is actually picked up and marked done", async () => {
    const seen = [];
    const res = await sweep(queuedDb(2), {
      process: async (row) => { seen.push(row.payment_id); return { ok: true }; }
    });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.claimed, 2);
    assert.strictEqual(res.counts.done, 2);
    assert.deepStrictEqual(seen, ["pay-0", "pay-1"]);
  });

  test("a pass is bounded by the batch size", async () => {
    let limit = null;
    await sweep(queuedDb(1, (params) => { limit = params[2]; }), {
      process: async () => ({ ok: true })
    });
    assert.strictEqual(limit, BATCH,
      "a pass must claim a bounded batch, not the whole backlog");
  });

  test("one bad payment does not stop the good ones behind it", async () => {
    const res = await sweep(queuedDb(3), {
      process: async (row) => {
        if (row.payment_id === "pay-1") throw new Error("bad payload");
        return { ok: true };
      }
    });
    assert.strictEqual(res.counts.done, 2);
    assert.strictEqual(res.counts.failed, 1);
  });

  test("a pass that blows up reports it instead of taking the schedule down", async () => {
    const brokenDb = { query: async () => { throw new Error("database is gone"); } };
    const res = await sweep(brokenDb, { process: async () => ({ ok: true }) });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /database is gone/);
  });

  test("it runs every minute — the money path, and a human feels this delay", () => {
    assert.strictEqual(SWEEP_CRON, "* * * * *");
  });

  /* THE POINT OF THE WHOLE FILE. GAP 5: a $2,500 receipt was accepted and its
     invoice never closed, because the only thing draining the queue was a
     Netlify cron that had stopped firing. This asserts the drain is on the
     scheduler that is running. */
  test("THE DRAIN IS SERVED — it is in the registered workflow set", async () => {
    const { functions } = await import("./index.mjs");
    const ids = functions.map((fn) => fn.id());
    assert.ok(ids.includes(commasInboxDrain.id()),
      "the payment inbox drain is not registered, so nothing drains the payment " +
      "queue on this clock and a client who paid stays unpaid on screen");
  });
});
