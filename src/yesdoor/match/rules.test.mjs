import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CLOSE, CRIMINAL_CATEGORIES, FAIL, PASS, UNKNOWN, evaluateCriminal, evaluateEvictions, evaluateFreshness, evaluateIncome,
  evaluateScore, evaluateSecondChance, evictionsInside, requiredIncomeCents, rulesAreFresh, worstResult
} from "./rules.mjs";
import { YD_DEFAULTS } from "../config.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const verified = (cents) => ({ status: "verified", monthly_income_cents: cents });

describe("score", () => {
  const run = (score, minScore = 640) => evaluateScore({ score, minScore });

  test("pass at min + 20 exactly, close one point under, close at min, fail one under min", () => {
    assert.equal(run(660).result, PASS);
    assert.equal(run(659).result, CLOSE);
    assert.equal(run(640).result, CLOSE);
    assert.equal(run(639).result, FAIL);
  });
  test("reasons name the numbers in plain English", () => {
    assert.match(run(700).reason, /700.*640.*room to spare/);
    assert.match(run(645).reason, /not with room to spare.*660/);
    assert.match(run(600).reason, /600 is below.*640/);
  });
  test("unknown when the score or the building's minimum is missing", () => {
    assert.equal(run(null).result, UNKNOWN);
    assert.equal(run(undefined).result, UNKNOWN);
    assert.equal(run(700, null).result, UNKNOWN);
    assert.equal(run(700, "").result, UNKNOWN);
  });
  test("accepts a numeric string minimum (Postgres numeric)", () => {
    assert.equal(run(700, "640").result, PASS);
  });
  test("the margin comes from the defaults passed in", () => {
    const defaults = { ...YD_DEFAULTS, margins: { ...YD_DEFAULTS.margins, score: 50 } };
    assert.equal(evaluateScore({ score: 680, minScore: 640, defaults }).result, CLOSE);
    assert.equal(evaluateScore({ score: 690, minScore: 640, defaults }).result, PASS);
  });
  test("a score of zero is a score, not missing", () => {
    assert.equal(run(0).result, FAIL);
  });
});

describe("income", () => {
  const run = (monthly, rent, multiple = 3, extra = {}) =>
    evaluateIncome({ income: verified(monthly), rentCents: rent, incomeMultiple: multiple, ...extra });

  test("rent $1,500 at 3x: need $4,500, comfortable $4,950", () => {
    assert.equal(requiredIncomeCents({ rentCents: 150000, multiple: 3 }), 450000);
    assert.equal(requiredIncomeCents({ rentCents: 150000, multiple: 3, margin: 0.1 }), 495000);
  });
  test("pass at exactly 10% over, close one cent under, close at exactly the multiple, fail one cent under", () => {
    assert.equal(run(495000, 150000).result, PASS);
    assert.equal(run(494999, 150000).result, CLOSE);
    assert.equal(run(450000, 150000).result, CLOSE);
    assert.equal(run(449999, 150000).result, FAIL);
  });
  test("no float drift at the boundary for awkward rents", () => {
    // 3 x $1,333.33 x 1.10 = $4,399.989, which rounds up to $4,399.99 (439999 cents)
    assert.equal(requiredIncomeCents({ rentCents: 133333, multiple: 3, margin: 0.1 }), 439999);
    assert.equal(run(439999, 133333).result, PASS);
    assert.equal(run(439998, 133333).result, CLOSE);
  });
  test("fractional multiples work (2.5x, 3.33x)", () => {
    assert.equal(requiredIncomeCents({ rentCents: 200000, multiple: 2.5 }), 500000);
    assert.equal(requiredIncomeCents({ rentCents: 100000, multiple: 3.33 }), 333000);
  });
  test("a building that states no multiple gets the default 3, and the reason says so", () => {
    for (const none of [null, undefined, "", 0]) {
      const r = evaluateIncome({ income: verified(495000), rentCents: 150000, incomeMultiple: none });
      assert.equal(r.result, PASS);
      assert.match(r.reason, /did not state a multiple/);
    }
    assert.equal(run(450000, 150000, null).result, CLOSE);
    assert.equal(run(449999, 150000, null).result, FAIL);
  });
  test("a stated multiple wins over the default", () => {
    assert.equal(run(400000, 100000, 4).result, CLOSE);
    assert.equal(run(399999, 100000, 4).result, FAIL);
  });
  test("a numeric-string multiple is read as a number", () => {
    assert.equal(run(495000, 150000, "3.0").result, PASS);
  });
  test("unknown unless income is verified", () => {
    for (const status of ["pending", "failed", "review"]) {
      assert.equal(evaluateIncome({ income: { status, monthly_income_cents: 900000 }, rentCents: 150000, incomeMultiple: 3 }).result, UNKNOWN);
    }
    assert.equal(evaluateIncome({ income: null, rentCents: 150000, incomeMultiple: 3 }).result, UNKNOWN);
    assert.equal(evaluateIncome({ income: { status: "verified", monthly_income_cents: null }, rentCents: 150000, incomeMultiple: 3 }).result, UNKNOWN);
  });
  test("unknown when there is no rent to check", () => {
    assert.equal(run(900000, null).result, UNKNOWN);
  });
  test("the margin comes from the defaults passed in", () => {
    const defaults = { ...YD_DEFAULTS, margins: { ...YD_DEFAULTS.margins, income: 0.25 } };
    assert.equal(run(500000, 150000, 3, { defaults }).result, CLOSE);
    assert.equal(run(562500, 150000, 3, { defaults }).result, PASS);
  });
  test("the reason shows dollars", () => {
    assert.match(run(300000, 150000).reason, /\$3,000 a month is below.*\$4,500/);
  });
});

describe("evictions", () => {
  const run = (over = {}) => evaluateEvictions({ count: 1, lastAt: "2024-01-01", maxEvictions: 0, lookbackYears: 5, now: NOW, ...over });

  test("no evictions passes whatever the building says", () => {
    assert.equal(run({ count: 0, lastAt: null }).result, PASS);
  });
  test("an eviction inside the lookback above the max fails", () => {
    assert.equal(run().result, FAIL);
    assert.match(run().reason, /1 eviction in the last 5 years.*allows 0/);
  });
  test("an eviction OLDER than the lookback does not count", () => {
    const r = run({ lastAt: "2020-10-06" });
    assert.equal(r.result, PASS);
    assert.match(r.reason, /none in the last 5 years/);
  });
  test("lookback edge: exactly 5 years old is outside; one day newer is inside", () => {
    assert.equal(run({ lastAt: "2021-10-07" }).result, PASS);
    assert.equal(run({ lastAt: "2021-10-08" }).result, FAIL);
  });
  test("at or under the max passes", () => {
    assert.equal(run({ count: 1, maxEvictions: 1 }).result, PASS);
    assert.equal(run({ count: 2, maxEvictions: 1 }).result, FAIL);
    assert.equal(run({ count: 2, maxEvictions: 2 }).result, PASS);
  });
  test("no lookback means any age counts", () => {
    assert.equal(run({ lookbackYears: null, lastAt: "2005-01-01" }).result, FAIL);
    assert.match(run({ lookbackYears: null, lastAt: "2005-01-01" }).reason, /ever/);
  });
  test("an eviction with no date counts, on the safe side, and the reason says so", () => {
    const r = run({ lastAt: null });
    assert.equal(r.result, FAIL);
    assert.match(r.reason, /date is missing/);
  });
  test("unknown when the count or the building's max is missing", () => {
    assert.equal(run({ count: null }).result, UNKNOWN);
    assert.equal(run({ maxEvictions: null }).result, UNKNOWN);
  });
  test("evictionsInside returns null for an unknown count and 0 for none", () => {
    assert.equal(evictionsInside({ count: null, lastAt: null, lookbackYears: 5, now: NOW }), null);
    assert.equal(evictionsInside({ count: 0, lastAt: "2026-01-01", lookbackYears: 5, now: NOW }), 0);
    assert.equal(evictionsInside({ count: 3, lastAt: "2026-01-01", lookbackYears: 5, now: NOW }), 3);
  });
});

describe("criminal", () => {
  const flag = (category, years_ago) => ({ category, years_ago });

  test("no flags passes", () => {
    assert.equal(evaluateCriminal({ flags: [], policy: {} }).result, PASS);
    assert.equal(evaluateCriminal({ flags: [], policy: null }).result, PASS);
  });
  test("flags that were not returned are unknown", () => {
    assert.equal(evaluateCriminal({ flags: null, policy: {} }).result, UNKNOWN);
    assert.equal(evaluateCriminal({ flags: undefined, policy: {} }).result, UNKNOWN);
  });
  test("numeric policy: newer than the window fails, exactly the window or older passes", () => {
    const policy = { misdemeanor: 7 };
    assert.equal(evaluateCriminal({ flags: [flag("misdemeanor", 6)], policy }).result, FAIL);
    assert.equal(evaluateCriminal({ flags: [flag("misdemeanor", 7)], policy }).result, PASS);
    assert.equal(evaluateCriminal({ flags: [flag("misdemeanor", 12)], policy }).result, PASS);
  });
  test("policy 'never' fails at any age", () => {
    assert.equal(evaluateCriminal({ flags: [flag("felony_violent", 30)], policy: { felony_violent: "never" } }).result, FAIL);
  });
  test("policy 'case_by_case' is close", () => {
    const r = evaluateCriminal({ flags: [flag("felony_property", 3)], policy: { felony_property: "case_by_case" } });
    assert.equal(r.result, CLOSE);
    assert.match(r.reason, /felony property records one by one/);
  });
  test("a category the building never mentioned is unknown", () => {
    assert.equal(evaluateCriminal({ flags: [flag("dui", 2)], policy: { felony_violent: "never" } }).result, UNKNOWN);
    assert.equal(evaluateCriminal({ flags: [flag("dui", 2)], policy: null }).result, UNKNOWN);
    assert.equal(evaluateCriminal({ flags: [flag("dui", 2)], policy: "never" }).result, UNKNOWN);
  });
  test("a numeric policy with a flag that has no age is unknown", () => {
    assert.equal(evaluateCriminal({ flags: [flag("dui", null)], policy: { dui: 5 } }).result, UNKNOWN);
  });
  test("an unreadable policy value is unknown", () => {
    assert.equal(evaluateCriminal({ flags: [flag("dui", 2)], policy: { dui: "sometimes" } }).result, UNKNOWN);
  });
  test("a policy of zero years ignores everything numeric (nothing is newer than 0)", () => {
    assert.equal(evaluateCriminal({ flags: [flag("dui", 0)], policy: { dui: 0 } }).result, PASS);
  });
  test("several flags: the worst one decides, and the reason names it", () => {
    const policy = { dui: 5, felony_violent: "never", misdemeanor: "case_by_case" };
    const r = evaluateCriminal({ flags: [flag("dui", 9), flag("misdemeanor", 1), flag("felony_violent", 20)], policy });
    assert.equal(r.result, FAIL);
    assert.match(r.reason, /felony violent/);
    assert.doesNotMatch(r.reason, /dui/);
    assert.equal(evaluateCriminal({ flags: [flag("dui", 9), flag("misdemeanor", 1)], policy }).result, CLOSE);
  });
  test("unknown outranks close when both appear", () => {
    const r = evaluateCriminal({ flags: [flag("a", 1), flag("b", 1)], policy: { a: "case_by_case" } });
    assert.equal(r.result, UNKNOWN);
  });
  test("a flag with no category is unknown, never a crash", () => {
    assert.equal(evaluateCriminal({ flags: [{}], policy: { dui: 5 } }).result, UNKNOWN);
    assert.equal(evaluateCriminal({ flags: [null], policy: { dui: 5 } }).result, UNKNOWN);
  });
});

describe("criminal categories", () => {
  test("the categories a policy may use are the ones the screenings speak", () => {
    assert.deepEqual([...CRIMINAL_CATEGORIES], ["felony_violent", "felony_property", "misdemeanor_nonviolent"]);
    assert.ok(Object.isFrozen(CRIMINAL_CATEGORIES));
  });
  test("every category is matched by a policy that names it, and an old seed key is not", () => {
    for (const category of CRIMINAL_CATEGORIES) {
      const known = evaluateCriminal({ flags: [{ category, years_ago: 20 }], policy: { [category]: 7 } });
      assert.equal(known.result, PASS, category);
    }
    // The pre-I2 seed keys never matched anything: the flag came back unknown.
    const old = evaluateCriminal({ flags: [{ category: "felony_property", years_ago: 20 }], policy: { felony: 7 } });
    assert.equal(old.result, UNKNOWN);
  });
});

describe("second chance", () => {
  test("applies only to a Second Chance renter at a building that said false", () => {
    const r = evaluateSecondChance({ lane: "second_chance", acceptsSecondChance: false });
    assert.equal(r.rule, "second_chance");
    assert.equal(r.result, CLOSE);
    assert.match(r.reason, /Second Chance/);
  });
  test("does not apply to the Verified lane, to a building that accepts, or to an unstated flag", () => {
    assert.equal(evaluateSecondChance({ lane: "verified", acceptsSecondChance: false }), null);
    assert.equal(evaluateSecondChance({ lane: "second_chance", acceptsSecondChance: true }), null);
    assert.equal(evaluateSecondChance({ lane: "second_chance", acceptsSecondChance: null }), null);
    assert.equal(evaluateSecondChance({ lane: "second_chance" }), null);
    assert.equal(evaluateSecondChance({ lane: null, acceptsSecondChance: false }), null);
    assert.equal(evaluateSecondChance(), null);
  });
});

describe("rules freshness", () => {
  test("fresh within 30 days, including day 30", () => {
    assert.equal(evaluateFreshness({ confirmedAt: "2026-09-07T12:00:00Z", now: NOW }).result, PASS);
    assert.equal(rulesAreFresh({ confirmedAt: "2026-09-07T12:00:00Z", now: NOW }), true);
  });
  test("stale from day 31: close, and the reason says the best answer is likely", () => {
    const r = evaluateFreshness({ confirmedAt: "2026-09-06T11:00:00Z", now: NOW });
    assert.equal(r.result, CLOSE);
    assert.match(r.reason, /2026-09-06.*more than 30 days.*likely/);
    assert.equal(rulesAreFresh({ confirmedAt: "2026-09-06T11:00:00Z", now: NOW }), false);
  });
  test("never confirmed is unknown, and not fresh", () => {
    assert.equal(evaluateFreshness({ confirmedAt: null, now: NOW }).result, UNKNOWN);
    assert.equal(rulesAreFresh({ confirmedAt: null, now: NOW }), false);
  });
  test("a custom stale window is honored", () => {
    const defaults = { ...YD_DEFAULTS, rulesStaleDays: 7 };
    assert.equal(evaluateFreshness({ confirmedAt: "2026-09-25", now: NOW, defaults }).result, CLOSE);
  });
});

test("worstResult orders fail > unknown > close > pass", () => {
  assert.equal(worstResult([PASS, PASS]), PASS);
  assert.equal(worstResult([PASS, CLOSE]), CLOSE);
  assert.equal(worstResult([CLOSE, UNKNOWN]), UNKNOWN);
  assert.equal(worstResult([UNKNOWN, FAIL, PASS]), FAIL);
  assert.equal(worstResult([]), PASS);
});
