import { test } from "node:test";
import assert from "node:assert/strict";
import { combinedPrequalAmount } from "./credit-partner.mjs";
import { parseReadyDate } from "./next-funding-sequence.mjs";

test("combinedPrequalAmount sums both files", () => {
  assert.equal(
    combinedPrequalAmount(
      { analyzer_prequal_amount: 40000 },
      { total_funding_estimate: 25000 }
    ),
    65000
  );
});

test("combinedPrequalAmount uses one side when the other is unknown", () => {
  assert.equal(combinedPrequalAmount({ total_funding_estimate: 30000 }, {}), 30000);
  assert.equal(combinedPrequalAmount({}, { analyzer_prequal_amount: 12000 }), 12000);
});

test("combinedPrequalAmount is null when both unknown", () => {
  assert.equal(combinedPrequalAmount({}, {}), null);
});

test("parseReadyDate accepts ISO calendar dates", () => {
  assert.equal(parseReadyDate("2026-10-01"), "2026-10-01");
  assert.equal(parseReadyDate("not-a-date"), null);
});
