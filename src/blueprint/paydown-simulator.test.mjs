import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  allocateCashToCards,
  projectedApprovalAfterCash,
  simulatePaydownFromClientDict
} from "./paydown-simulator.mjs";

describe("allocateCashToCards", () => {
  test("refuses negative cash", () => {
    const r = allocateCashToCards([], -1);
    assert.equal(r.ok, false);
  });

  test("splits cash across cards by paydown need", () => {
    const rows = [
      ["High Util", "Experian", 5000, 500, "90%", "$500"],
      ["Low Util", "Experian", 200, 100, "50%", "$100"]
    ];
    const r = allocateCashToCards(rows, 1000);
    assert.equal(r.ok, true);
    assert.equal(r.cashApplied, 1000);
    assert.ok(r.allocations.length >= 1);
  });
});

describe("projectedApprovalAfterCash", () => {
  test("full paydown reaches preapproval_after", () => {
    assert.equal(
      projectedApprovalAfterCash({
        preapprovalNow: 5000,
        preapprovalAfter: 9000,
        cashApplied: 500,
        totalPaydownNeeded: 500
      }),
      9000
    );
  });

  test("half paydown interpolates", () => {
    assert.equal(
      projectedApprovalAfterCash({
        preapprovalNow: 0,
        preapprovalAfter: 10000,
        cashApplied: 250,
        totalPaydownNeeded: 500
      }),
      5000
    );
  });
});

describe("simulatePaydownFromClientDict", () => {
  test("returns before and projected approval", () => {
    const client = {
      preapproval_now: 4000,
      preapproval_after: 8000,
      revolving: [
        ["Card A", "Experian", 3000, 300, "80%", "$300"]
      ]
    };
    const r = simulatePaydownFromClientDict(client, 500);
    assert.equal(r.ok, true);
    assert.equal(r.preapprovalBefore, 4000);
    assert.ok(r.preapprovalProjected >= 4000);
  });
});
