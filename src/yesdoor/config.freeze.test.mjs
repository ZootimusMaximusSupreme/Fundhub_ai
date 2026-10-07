import { test } from "node:test";
import assert from "node:assert/strict";
import { YD_DEFAULTS } from "./config.mjs";

test("YD_DEFAULTS holds exactly the spec §9 values", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(YD_DEFAULTS)), {
    maxOpenApplications: 3,
    maxBackups: 5,
    margins: { score: 20, income: 0.1 },
    defaultIncomeMultiple: 3,
    rulesStaleDays: 30,
    recheckDays: 30,
    leaseEndRecheckDays: 90,
    refundDays: 60,
    disputeDays: 14,
    mismatchPause: 3,
    mismatchWindowDays: 90,
    registrationValidDays: 90,
    knownProspectDays: 3,
    brokerSplitPercent: 25,
    tiers: {
      A: { minScore: 700, evictionYears: 7, criminal: false },
      B: { minScore: 640, evictionYears: 5 },
      C: { minScore: 580 }
    }
  });
});

test("YD_DEFAULTS is frozen all the way down", () => {
  const frozen = (o) => Object.isFrozen(o) && Object.values(o).every((v) => typeof v !== "object" || v === null || frozen(v));
  assert.equal(frozen(YD_DEFAULTS), true);
  assert.throws(() => { "use strict"; YD_DEFAULTS.margins.score = 0; }, TypeError);
  assert.throws(() => { "use strict"; YD_DEFAULTS.tiers.A.minScore = 0; }, TypeError);
});
