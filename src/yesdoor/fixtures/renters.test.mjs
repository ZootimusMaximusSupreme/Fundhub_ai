import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FIXTURE_NOW, SAMPLE_NOTICE, SAMPLE_RENTERS, fixtureByEmail, fixtureByKey } from "./renters.mjs";
import { lane, riskTier } from "../match/match.mjs";
import { yearsBack } from "../util.mjs";

const NOW = new Date(FIXTURE_NOW);
const verified = (r) => ({ status: "verified", monthly_income_cents: r.income.monthly_income_cents });

test("at least six samples, covering every tier and the no-match case", () => {
  assert.ok(SAMPLE_RENTERS.length >= 6);
  const tiers = SAMPLE_RENTERS.map((r) => r.expectedTier);
  assert.equal(tiers.filter((t) => t === "A").length, 2);
  assert.ok(tiers.includes("B") && tiers.includes("C") && tiers.includes("D"));
  assert.equal(SAMPLE_RENTERS.filter((r) => r.noMatchUntilDob).length, 1);
  assert.ok(SAMPLE_RENTERS.some((r) => r.expectedTier === "C" && r.credit.eviction_count === 1
    && new Date(r.credit.eviction_last_at) < yearsBack(NOW, 5)), "a tier C file with an old eviction");
});

test("every fixture is clearly a sample", () => {
  assert.match(SAMPLE_NOTICE, /Sample renter/);
  for (const r of SAMPLE_RENTERS) {
    assert.equal(r.isSample, true, r.key);
    assert.match(r.email, /@sample\.yesdoor\.test$/, r.key);
    assert.match(r.lastName, /-Sample$/, r.key);
    assert.ok(r.story.length > 20, r.key);
  }
});

test("keys and emails are unique, and lookups find them", () => {
  assert.equal(new Set(SAMPLE_RENTERS.map((r) => r.key)).size, SAMPLE_RENTERS.length);
  assert.equal(new Set(SAMPLE_RENTERS.map((r) => r.email)).size, SAMPLE_RENTERS.length);
  for (const r of SAMPLE_RENTERS) {
    assert.equal(fixtureByEmail(r.email), r);
    assert.equal(fixtureByEmail(`  ${r.email.toUpperCase()} `), r);
    assert.equal(fixtureByKey(r.key), r);
  }
  assert.equal(fixtureByEmail("nobody@example.com"), null);
  assert.equal(fixtureByEmail(null), null);
  assert.equal(fixtureByKey("nope"), null);
});

test("fixtures cannot be changed", () => {
  assert.throws(() => { SAMPLE_RENTERS[0].credit.credit_score = 850; }, TypeError);
  assert.throws(() => { SAMPLE_RENTERS.push({}); }, TypeError);
});

describe("each renter is one consistent person", () => {
  for (const r of SAMPLE_RENTERS) {
    describe(r.key, () => {
      const c = r.credit;

      test("the tier the engine prints is the tier the fixture claims", () => {
        assert.equal(riskTier({ screening: c, income: verified(r), now: NOW }), r.expectedTier);
        assert.equal(lane(r.expectedTier), r.expectedLane);
      });

      test("evictions and their date agree", () => {
        if (c.eviction_count === 0) assert.equal(c.eviction_last_at, null);
        else {
          assert.match(c.eviction_last_at, /^\d{4}-\d{2}-\d{2}$/);
          assert.ok(new Date(c.eviction_last_at) < NOW, "an eviction date is in the past");
        }
      });

      test("criminal flags are well formed and in the past", () => {
        assert.ok(Array.isArray(c.criminal_flags));
        for (const f of c.criminal_flags) {
          assert.match(f.category, /^[a-z_]+$/);
          assert.ok(Number.isInteger(f.years_ago) && f.years_ago >= 0 && f.years_ago < 60);
        }
      });

      test("income adds up: its sources sum to the monthly figure, all whole cents", () => {
        const sum = r.income.sources.reduce((t, s) => t + s.monthly_cents, 0);
        assert.equal(sum, r.income.monthly_income_cents);
        assert.ok(Number.isInteger(r.income.monthly_income_cents) && r.income.monthly_income_cents > 0);
      });

      test("the negatives line up with the score", () => {
        const negatives = c.collections_count + c.eviction_count * 2 + c.criminal_flags.length;
        if (r.expectedTier === "A") {
          assert.ok(c.credit_score >= 700);
          assert.equal(negatives, 0, "a prime file has nothing negative");
        }
        if (r.expectedTier === "D") {
          assert.ok(c.credit_score < 580, "tier D scores below the C line");
          assert.ok(negatives >= 4, "tier D has several negatives");
        }
        if (c.credit_score >= 740) assert.equal(negatives, 0);
        if (c.collections_count >= 3 || c.eviction_count >= 2) assert.ok(c.credit_score < 640);
        assert.ok(c.credit_score >= 300 && c.credit_score <= 850);
      });

      test("income is believable for the score (no 540 score on a $15,000 month, no 780 on $1,500)", () => {
        const monthly = r.income.monthly_income_cents / 100;
        assert.ok(monthly >= 2500 && monthly <= 9000);
        if (r.expectedTier === "D") assert.ok(monthly < 3500);
        if (r.expectedTier === "A") assert.ok(monthly >= 5000);
      });
    });
  }

  test("only the no-match file carries a date of birth, and the bureau needs it", () => {
    for (const r of SAMPLE_RENTERS) {
      assert.equal(Boolean(r.noMatchUntilDob), Boolean(r.dob), r.key);
      if (r.dob) assert.match(r.dob, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
