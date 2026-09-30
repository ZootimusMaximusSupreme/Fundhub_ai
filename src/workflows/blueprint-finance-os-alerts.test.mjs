import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  sweep,
  PROMO_TRACKING_SKIP_REASON,
  paymentTimingHints
} from "./blueprint-finance-os-alerts.mjs";

describe("blueprint-finance-os-alerts sweep", () => {
  test("promo stub no-ops with documented reason", async () => {
    const db = {
      query: async (text) => {
        if (/FROM subscriptions/.test(text)) return { rows: [] };
        throw new Error(text);
      }
    };
    const tally = await sweep(db, { now: new Date("2026-09-15T12:00:00.000Z") });
    assert.equal(tally.checked, 0);
    assert.equal(tally.promo.skipped, true);
    assert.equal(tally.promo.reason, PROMO_TRACKING_SKIP_REASON);
  });
});

describe("paymentTimingHints", () => {
  test("computes next due from cycle rows", async () => {
    const db = {
      query: async () => ({
        rows: [{ payment_due_day: 15, statement_close_day: 10 }]
      })
    };
    const hints = await paymentTimingHints(db, {
      orgId: "11111111-1111-1111-1111-111111111111",
      clientId: "22222222-2222-2222-2222-222222222222",
      todayIso: "2026-09-01"
    });
    assert.equal(hints.length, 1);
    assert.equal(hints[0].nextDueOn, "2026-09-15");
  });
});
