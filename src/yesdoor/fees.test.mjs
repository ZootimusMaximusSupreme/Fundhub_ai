// Pure tests for the placement-fee arithmetic. No database.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  placementFeeCents, brokerShareCents, feeSafeAt, refundWindowOpen, invoiceDueAt, reversalCents
} from "./fees.mjs";

test("fee: percent of the first month, in whole cents", () => {
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", feePercent: 100, rentCents: 162500 }), 162500);
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", feePercent: 75, rentCents: 150000 }), 112500);
  // pg hands numeric back as text
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", feePercent: "100.00", rentCents: 139500 }), 139500);
  // 33.33% of $1,234.56 is 41147.88 cents: rounded to a whole cent, never a fraction
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", feePercent: 33.33, rentCents: 123456 }), 41148);
});

test("fee: a flat fee ignores the rent", () => {
  assert.equal(placementFeeCents({ feeKind: "flat", feeFlatCents: 100000, rentCents: 999999 }), 100000);
  assert.equal(placementFeeCents({ feeKind: "flat", feeFlatCents: 100000 }), 100000);
});

test("fee: unknown stays unknown (null), never 0", () => {
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", feePercent: 100 }), null);        // no rent
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", feePercent: 100, rentCents: 0 }), null);
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", rentCents: 150000 }), null);     // no percent
  assert.equal(placementFeeCents({ feeKind: "flat" }), null);
  assert.equal(placementFeeCents({ feeKind: "nonsense", rentCents: 150000 }), null);
  assert.equal(placementFeeCents({}), null);
});

test("fee: a 0% deal is a real 0, not unknown", () => {
  assert.equal(placementFeeCents({ feeKind: "percent_first_month", feePercent: 0, rentCents: 150000 }), 0);
});

test("broker share: a licensed split partner earns the split of the fee", () => {
  assert.equal(brokerShareCents({ feeCents: 162500, splitPercent: 25 }), 40625);
  assert.equal(brokerShareCents({ feeCents: 100001, splitPercent: "25.00" }), 25000);   // 25000.25 rounds down
  assert.equal(brokerShareCents({ feeCents: 100002, splitPercent: 25 }), 25001);        // 25000.5 rounds half up
});

test("broker share: software partners, no fee, no split earn nothing; never more than the fee", () => {
  assert.equal(brokerShareCents({ feeCents: 162500, splitPercent: 25, plan: "software" }), 0);
  assert.equal(brokerShareCents({ feeCents: 0, splitPercent: 25 }), 0);
  assert.equal(brokerShareCents({ feeCents: null, splitPercent: 25 }), 0);
  assert.equal(brokerShareCents({ feeCents: 162500, splitPercent: 0 }), 0);
  assert.equal(brokerShareCents({ feeCents: 162500, splitPercent: 250 }), 162500);
});

test("safe at: paid plus the refund days (60 by default)", () => {
  assert.equal(feeSafeAt({ paidAt: "2026-01-01T00:00:00Z" }).toISOString(), "2026-03-02T00:00:00.000Z");
  assert.equal(feeSafeAt({ paidAt: "2026-01-01T00:00:00Z", refundDays: 30 }).toISOString(), "2026-01-31T00:00:00.000Z");
  assert.equal(feeSafeAt({ paidAt: null }), null);
});

test("refund window: open until the 60th day, closed on it", () => {
  const paidAt = "2026-01-01T00:00:00Z";
  assert.equal(refundWindowOpen({ paidAt, now: "2026-03-01T23:59:59Z" }), true);
  assert.equal(refundWindowOpen({ paidAt, now: "2026-03-02T00:00:00Z" }), false);
  assert.equal(refundWindowOpen({ paidAt: null, now: "2026-03-01T00:00:00Z" }), false);
});

test("invoice due: issued plus the building's payment terms", () => {
  assert.equal(invoiceDueAt({ issuedAt: "2026-01-01T00:00:00Z", termsDays: 30 }).toISOString(), "2026-01-31T00:00:00.000Z");
  assert.equal(invoiceDueAt({ issuedAt: "2026-01-01T00:00:00Z", termsDays: 0 }).toISOString(), "2026-01-01T00:00:00.000Z");
});

test("reversal: the same cents, the other sign; only a positive fee reverses", () => {
  assert.equal(reversalCents(162500), -162500);
  assert.throws(() => reversalCents(0));
  assert.throws(() => reversalCents(-5));
  assert.throws(() => reversalCents(null));
});
