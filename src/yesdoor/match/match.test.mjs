import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MATCHABLE_BUILDING_STATUSES, buildingIsMatchable, buildingView, lane, matchBuilding, matchCandidates,
  rankBackups, riskTier
} from "./match.mjs";
import { YD_DEFAULTS } from "../config.mjs";
import { fixtureByKey } from "../fixtures/renters.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const verified = (monthlyCents) => ({ status: "verified", monthly_income_cents: monthlyCents });

const RULES = Object.freeze({
  version: 3,
  min_score: 640,
  income_multiple: 3,
  max_evictions: 0,
  eviction_lookback_years: 5,
  criminal_policy: Object.freeze({ felony_violent: "never", misdemeanor_nonviolent: 7, felony_property: "case_by_case" }),
  accepts_second_chance: false,
  confirmed_at: "2026-10-01T00:00:00Z"
});

const screeningOf = (key) => ({ ...fixtureByKey(key).credit, status: "complete" });
const incomeOf = (key) => verified(fixtureByKey(key).income.monthly_income_cents);

const clean = (over = {}) => ({
  status: "complete", credit_score: 720, collections_count: 0, eviction_count: 0, eviction_last_at: null,
  criminal_flags: [], ...over
});

describe("matchBuilding results", () => {
  test("approved: every rule passes and the rules are fresh", () => {
    const m = matchBuilding({
      screening: screeningOf("prime-1"), income: incomeOf("prime-1"), rules: RULES,
      listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "approved");
    assert.deepEqual(m.reasons.map((r) => r.rule), ["score", "income", "evictions", "criminal", "rules_freshness"]);
    assert.ok(m.reasons.every((r) => r.result === "pass" && r.reason.length > 10));
    assert.equal(m.maxRentCents, 240000); // $7,200 / 3
    assert.equal(m.riskTier, "A");
    assert.equal(m.lane, "verified");
    assert.equal(m.rulesVersion, 3);
    assert.equal(m.rulesConfirmedAt, "2026-10-01");
    assert.equal(m.rulesStale, false);
  });

  test("no: any failing rule", () => {
    const m = matchBuilding({
      screening: clean({ credit_score: 600 }), income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "no");
    assert.equal(m.reasons.find((r) => r.rule === "score").result, "fail");
  });

  test("no: a fail beats an unknown (income unverified) elsewhere", () => {
    const m = matchBuilding({ screening: clean({ credit_score: 600 }), income: null, rules: RULES, listingRentCents: 150000, now: NOW });
    assert.equal(m.result, "no");
  });

  test("no: eviction inside the lookback above the max", () => {
    const m = matchBuilding({
      screening: clean({ eviction_count: 1, eviction_last_at: "2025-03-01" }), income: verified(900000),
      rules: RULES, listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "no");
    assert.equal(m.reasons.find((r) => r.rule === "evictions").result, "fail");
  });

  test("no: criminal policy never", () => {
    const m = matchBuilding({
      screening: clean({ criminal_flags: [{ category: "felony_violent", years_ago: 25 }] }),
      income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "no");
  });

  test("likely: a close score", () => {
    const m = matchBuilding({ screening: clean({ credit_score: 645 }), income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW });
    assert.equal(m.result, "likely");
  });

  test("likely: a close income", () => {
    const m = matchBuilding({ screening: clean(), income: verified(460000), rules: RULES, listingRentCents: 150000, now: NOW });
    assert.equal(m.result, "likely");
    assert.equal(m.reasons.find((r) => r.rule === "income").result, "close");
  });

  test("likely: criminal case_by_case", () => {
    const m = matchBuilding({
      screening: clean({ criminal_flags: [{ category: "felony_property", years_ago: 3 }] }),
      income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "likely");
  });

  test("likely: income not verified, and max rent is unknown (null, never 0)", () => {
    const m = matchBuilding({ screening: clean(), income: null, rules: RULES, listingRentCents: 150000, now: NOW });
    assert.equal(m.result, "likely");
    assert.equal(m.maxRentCents, null);
    const pending = matchBuilding({
      screening: clean(), income: { status: "pending", monthly_income_cents: 900000 }, rules: RULES, listingRentCents: 150000, now: NOW
    });
    assert.equal(pending.maxRentCents, null);
  });

  test("likely: no listing rent to check income against", () => {
    const m = matchBuilding({ screening: clean(), income: verified(900000), rules: RULES, listingRentCents: null, now: NOW });
    assert.equal(m.result, "likely");
    assert.equal(m.maxRentCents, 300000);
  });

  test("stale rules cap an otherwise perfect match at likely", () => {
    const m = matchBuilding({
      screening: clean(), income: verified(900000),
      rules: { ...RULES, confirmed_at: "2026-08-01T00:00:00Z" }, listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "likely");
    assert.equal(m.rulesStale, true);
    assert.equal(m.reasons.find((r) => r.rule === "rules_freshness").result, "close");
  });

  test("rules never confirmed cap at likely", () => {
    const m = matchBuilding({
      screening: clean(), income: verified(900000), rules: { ...RULES, confirmed_at: null }, listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "likely");
    assert.equal(m.rulesStale, true);
    assert.equal(m.rulesConfirmedAt, null);
  });

  test("stale rules do not rescue a fail", () => {
    const m = matchBuilding({
      screening: clean({ credit_score: 500 }), income: verified(900000),
      rules: { ...RULES, confirmed_at: "2026-08-01T00:00:00Z" }, listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "no");
  });

  test("a building with unstated rules (nulls) cannot approve, only likely", () => {
    const m = matchBuilding({
      screening: clean(), income: verified(900000),
      rules: { version: 1, min_score: null, income_multiple: null, max_evictions: null, eviction_lookback_years: null, criminal_policy: null, confirmed_at: "2026-10-01" },
      listingRentCents: 150000, now: NOW
    });
    assert.equal(m.result, "likely");
  });

  test("the sample second-chance renter with an old eviction is approved where the rules allow it", () => {
    const rules = { ...RULES, min_score: 580, max_evictions: 0, eviction_lookback_years: 5 };
    const m = matchBuilding({
      screening: screeningOf("tier-c-old-eviction"), income: incomeOf("tier-c-old-eviction"), rules, listingRentCents: 110000, now: NOW
    });
    assert.equal(m.result, "approved");
    assert.equal(m.riskTier, "C");
    assert.equal(m.lane, "second_chance");
    // The same renter at a building that looks back 10 years is a no.
    const strict = matchBuilding({
      screening: screeningOf("tier-c-old-eviction"), income: incomeOf("tier-c-old-eviction"),
      rules: { ...rules, eviction_lookback_years: 10 }, listingRentCents: 110000, now: NOW
    });
    assert.equal(strict.result, "no");
  });

  test("without a completed screening the answer is no, with a plain reason", () => {
    for (const screening of [null, undefined, { status: "queued" }, { status: "no_match" }, { status: "failed", credit_score: 800 }]) {
      const m = matchBuilding({ screening, income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW });
      assert.equal(m.result, "no");
      assert.equal(m.reasons[0].rule, "screening");
      assert.match(m.reasons[0].reason, /no finished/);
    }
  });

  test("without rules the answer is no", () => {
    const m = matchBuilding({ screening: clean(), income: verified(900000), rules: null, listingRentCents: 150000, now: NOW });
    assert.equal(m.result, "no");
    assert.equal(m.reasons[0].rule, "rules");
  });
});

describe("max rent", () => {
  test("income divided by the stated multiple, rounded down", () => {
    const m = matchBuilding({
      screening: clean(), income: verified(500001), rules: { ...RULES, income_multiple: 2.5 }, listingRentCents: 100000, now: NOW
    });
    assert.equal(m.maxRentCents, 200000);
  });
  test("a building that states no multiple uses the default 3", () => {
    for (const none of [null, undefined, "", 0]) {
      const m = matchBuilding({
        screening: clean(), income: verified(750000), rules: { ...RULES, income_multiple: none }, listingRentCents: 100000, now: NOW
      });
      assert.equal(m.maxRentCents, 250000);
    }
  });
  test("a numeric-string multiple from Postgres works", () => {
    const m = matchBuilding({
      screening: clean(), income: verified(600000), rules: { ...RULES, income_multiple: "3.0" }, listingRentCents: 100000, now: NOW
    });
    assert.equal(m.maxRentCents, 200000);
  });
});

describe("state rules and notices", () => {
  test("accepts a map or yd_state_rules rows", () => {
    const screening = clean({ criminal_flags: [{ category: "misdemeanor_nonviolent", years_ago: 9 }] });
    const base = { screening, income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW };
    const asMap = matchBuilding({ ...base, stateRules: { background_check_notice_required: true, screening_fee_cap_cents: 6600 } });
    const asRows = matchBuilding({
      ...base, stateRules: [{ key: "background_check_notice_required", value: true }, { key: "screening_fee_cap_cents", value: 6600 }]
    });
    assert.deepEqual(asMap.notices.map((n) => n.key), ["background_check_notice_required", "screening_fee_cap_cents"]);
    assert.deepEqual(asRows.notices, asMap.notices);
    assert.equal(asMap.notices[1].capCents, 6600);
  });
  test("the background notice shows only when there is a record to notify about, and never changes the answer", () => {
    const base = { income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW, stateRules: { background_check_notice_required: true } };
    const none = matchBuilding({ ...base, screening: clean() });
    assert.deepEqual(none.notices, []);
    const withNone = matchBuilding({ ...base, screening: clean(), stateRules: null });
    assert.equal(none.result, withNone.result);
  });
  test("Arizona (no rules) gives no notices", () => {
    assert.deepEqual(matchBuilding({ screening: clean(), income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW, stateRules: {} }).notices, []);
  });
});

test("matchBuilding does not change its inputs", () => {
  const screening = Object.freeze({ ...clean(), criminal_flags: Object.freeze([]) });
  const income = Object.freeze(verified(900000));
  assert.doesNotThrow(() => matchBuilding({ screening, income, rules: RULES, listingRentCents: 150000, now: NOW }));
});

test("the same inputs always give the same answer", () => {
  const args = { screening: clean(), income: verified(900000), rules: RULES, listingRentCents: 150000, now: NOW };
  assert.deepEqual(matchBuilding(args), matchBuilding(args));
});

describe("buildingView: what a building may see", () => {
  const CREDIT_WORDS = ["credit_score", "creditScore", "eviction_count", "evictionCount", "criminal_flags", "criminalFlags",
    "collections_count", "collectionsCount", "raw", "reasons", "dob"];

  test("only the answer, income verified, tier and max rent", () => {
    const income = verified(900000);
    const m = matchBuilding({
      screening: clean({ criminal_flags: [{ category: "dui", years_ago: 9 }] }), income, rules: { ...RULES, criminal_policy: { dui: 5 } },
      listingRentCents: 150000, now: NOW
    });
    const view = buildingView(m, income);
    assert.deepEqual(Object.keys(view).sort(),
      ["incomeVerified", "maxRentCents", "result", "riskTier", "rulesConfirmedAt", "rulesVersion"]);
    assert.equal(view.incomeVerified, true);
    assert.equal(view.result, "approved");
    const text = JSON.stringify(view);
    for (const word of CREDIT_WORDS) assert.equal(text.includes(word), false, `leaked ${word}`);
    assert.doesNotMatch(text, /720|dui/);
  });
  test("incomeVerified is false until income is verified", () => {
    const m = matchBuilding({ screening: clean(), income: null, rules: RULES, listingRentCents: 150000, now: NOW });
    assert.equal(buildingView(m, null).incomeVerified, false);
    assert.equal(buildingView(m, { status: "review", monthly_income_cents: 5 }).incomeVerified, false);
  });
});

describe("riskTier", () => {
  const tier = (screening, income = verified(600000)) => riskTier({ screening: clean(screening), income, now: NOW });

  test("A needs score >= 700 (699 drops to B)", () => {
    assert.equal(tier({ credit_score: 700 }), "A");
    assert.equal(tier({ credit_score: 699 }), "B");
  });
  test("A needs verified income", () => {
    assert.equal(tier({ credit_score: 780 }, null), "B");
    assert.equal(tier({ credit_score: 780 }, { status: "review", monthly_income_cents: 600000 }), "B");
    assert.equal(tier({ credit_score: 780 }, verified(0)), "B");
  });
  test("A needs no criminal flags, and unknown flags are not 'none'", () => {
    assert.equal(tier({ credit_score: 780, criminal_flags: [{ category: "dui", years_ago: 15 }] }), "B");
    assert.equal(tier({ credit_score: 780, criminal_flags: null }), "B");
  });
  test("A needs no evictions in 7 years: 7 years exactly is outside, a day newer is inside", () => {
    assert.equal(tier({ credit_score: 780, eviction_count: 1, eviction_last_at: "2019-10-07" }), "A");
    assert.equal(tier({ credit_score: 780, eviction_count: 1, eviction_last_at: "2019-10-08" }), "B");
  });
  test("B needs score >= 640 (639 drops to C)", () => {
    assert.equal(tier({ credit_score: 640 }), "B");
    assert.equal(tier({ credit_score: 639 }), "C");
  });
  test("B needs no evictions in 5 years: a recent eviction makes a 650 file a C", () => {
    assert.equal(tier({ credit_score: 650, eviction_count: 1, eviction_last_at: "2023-01-01" }), "C");
    assert.equal(tier({ credit_score: 650, eviction_count: 1, eviction_last_at: "2021-10-07" }), "B");
  });
  test("B does not mind a criminal record (the buildings do)", () => {
    assert.equal(tier({ credit_score: 700, criminal_flags: [{ category: "dui", years_ago: 2 }] }), "B");
  });
  test("C needs score >= 580 (579 is D)", () => {
    assert.equal(tier({ credit_score: 580 }), "C");
    assert.equal(tier({ credit_score: 579 }), "D");
  });
  test("two evictions is D even with a decent score", () => {
    assert.equal(tier({ credit_score: 620, eviction_count: 2, eviction_last_at: "2025-01-01" }), "D");
  });
  test("one older eviction is C whatever the score; a recent one with a low score is D", () => {
    assert.equal(tier({ credit_score: 520, eviction_count: 1, eviction_last_at: "2020-01-01" }), "C");
    assert.equal(tier({ credit_score: 520, eviction_count: 1, eviction_last_at: "2024-01-01" }), "D");
    assert.equal(tier({ credit_score: 520, eviction_count: 2, eviction_last_at: "2015-01-01" }), "D");
  });
  test("a missing score or eviction count is D (unknown is never good news)", () => {
    assert.equal(tier({ credit_score: null }), "D");
    assert.equal(tier({ eviction_count: null }), "D");
    assert.equal(riskTier({ screening: null, income: null, now: NOW }), "D");
  });
  test("tier thresholds come from the defaults passed in", () => {
    const defaults = { ...YD_DEFAULTS, tiers: { ...YD_DEFAULTS.tiers, A: { ...YD_DEFAULTS.tiers.A, minScore: 750 } } };
    assert.equal(riskTier({ screening: clean({ credit_score: 720 }), income: verified(600000), now: NOW, defaults }), "B");
  });
});

test("lane: A and B are verified, C and D are second chance", () => {
  assert.equal(lane("A"), "verified");
  assert.equal(lane("B"), "verified");
  assert.equal(lane("C"), "second_chance");
  assert.equal(lane("D"), "second_chance");
  assert.equal(lane(null), null);
  assert.equal(lane("E"), null);
});

test("only signed or live buildings are matchable", () => {
  assert.deepEqual([...MATCHABLE_BUILDING_STATUSES], ["signed", "live"]);
  for (const ok of ["signed", "live"]) assert.equal(buildingIsMatchable(ok), true);
  for (const no of ["target", "pitched", "agreement_sent", "paused", "churned", undefined, null]) {
    assert.equal(buildingIsMatchable(no), false);
  }
});

describe("rankBackups", () => {
  const m = (buildingId, rent, over = {}) => ({
    buildingId, listingId: `L-${buildingId}-${rent}`, result: "approved", maxRentCents: 200000, listingRentCents: rent, ...over
  });

  test("only approved buildings, never the one the renter picked", () => {
    const out = rankBackups([m("a", 190000), m("b", 190000, { result: "likely" }), m("c", 190000, { result: "no" }), m("d", 190000)], { excludeBuildingId: "a" });
    assert.deepEqual(out.map((x) => x.buildingId), ["d"]);
  });
  test("ranked by rent fit: the rent closest to the renter's max comes first", () => {
    const out = rankBackups([m("far", 120000), m("near", 195000), m("mid", 170000)]);
    assert.deepEqual(out.map((x) => x.buildingId), ["near", "mid", "far"]);
  });
  test("a tie on rent fit goes to the better payer", () => {
    const out = rankBackups([m("a", 180000), m("b", 180000), m("c", 180000)], { payerScore: { a: 70, b: 95, c: 80 } });
    assert.deepEqual(out.map((x) => x.buildingId), ["b", "c", "a"]);
  });
  test("then to the nearer building", () => {
    const out = rankBackups([m("a", 180000), m("b", 180000), m("c", 180000)], { payerScore: { a: 90, b: 90, c: 90 }, distance: { a: 9, b: 2, c: 5 } });
    assert.deepEqual(out.map((x) => x.buildingId), ["b", "c", "a"]);
  });
  test("then by id, so input order never matters", () => {
    const a = rankBackups([m("b", 180000), m("a", 180000)]).map((x) => x.buildingId);
    const b = rankBackups([m("a", 180000), m("b", 180000)]).map((x) => x.buildingId);
    assert.deepEqual(a, ["a", "b"]);
    assert.deepEqual(a, b);
  });
  test("missing numbers sort last", () => {
    const out = rankBackups([
      m("norent", null), m("fit", 190000),
      m("nopay", 180000), m("pay", 180000),
      m("far", 150000), m("close", 150000)
    ], { payerScore: { pay: 50, norent: 100, fit: 100, far: 80, close: 80 }, distance: { close: 3 }, maxBackups: 10 });
    assert.deepEqual(out.map((x) => x.buildingId), ["fit", "pay", "nopay", "close", "far", "norent"]);
  });
  test("keeps the top 5 by default and marks them as backups with a rank", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => m(id, 199000 - i * 1000));
    const out = rankBackups(many);
    assert.equal(out.length, 5);
    assert.deepEqual(out.map((x) => x.buildingId), ["a", "b", "c", "d", "e"]);
    assert.ok(out.every((x) => x.isBackup === true));
    assert.deepEqual(out.map((x) => x.backupRank), [1, 2, 3, 4, 5]);
  });
  test("maxBackups can be changed", () => {
    assert.equal(rankBackups([m("a", 1), m("b", 2), m("c", 3)], { maxBackups: 2 }).length, 2);
    assert.equal(rankBackups([m("a", 1)], { maxBackups: 0 }).length, 0);
  });
  test("one backup per building: its best listing", () => {
    const out = rankBackups([m("a", 120000), m("a", 199000), m("b", 150000)]);
    assert.deepEqual(out.map((x) => [x.buildingId, x.listingRentCents]), [["a", 199000], ["b", 150000]]);
  });
  test("does not change the matches it is given", () => {
    const input = [m("a", 190000)];
    rankBackups(input);
    assert.equal(input[0].isBackup, undefined);
  });
  test("empty and missing input give no backups", () => {
    assert.deepEqual(rankBackups([]), []);
    assert.deepEqual(rankBackups(undefined), []);
  });
});

describe("matchCandidates", () => {
  const screening = clean();
  const income = verified(900000);
  const cand = (buildingId, over = {}) => ({
    buildingId, listingId: `L-${buildingId}`, status: "live", rules: RULES, listingRentCents: 250000, ...over
  });

  test("matches every signed or live building and skips the rest", () => {
    const { matches, skipped } = matchCandidates({
      screening, income, now: NOW,
      candidates: [cand("a"), cand("b", { status: "paused" }), cand("c", { status: "signed" }), cand("d", { status: "pitched" })]
    });
    assert.deepEqual(matches.map((x) => x.buildingId), ["a", "c"]);
    assert.deepEqual(skipped.map((x) => x.buildingId), ["b", "d"]);
    assert.match(skipped[0].reason, /paused/);
    assert.ok(matches.every((x) => x.result === "approved" && x.isBackup === false));
  });

  test("backups are the other approved buildings, best fit first, never the picked one", () => {
    const { backups } = matchCandidates({
      screening, income, now: NOW, picked: "a",
      candidates: [
        cand("a", { listingRentCents: 290000 }),
        cand("b", { listingRentCents: 270000 }),
        cand("c", { listingRentCents: 200000 }),
        cand("d", { listingRentCents: 270000, rules: { ...RULES, min_score: 790 } }) // renter fails this one
      ]
    });
    assert.deepEqual(backups.map((x) => x.buildingId), ["b", "c"]);
  });

  test("payer score and distance on the candidates break ties", () => {
    const { backups } = matchCandidates({
      screening, income, now: NOW,
      candidates: [cand("a", { payerScore: 60, distance: 1 }), cand("b", { payerScore: 90, distance: 8 })]
    });
    assert.deepEqual(backups.map((x) => x.buildingId), ["b", "a"]);
  });

  test("a renter who clears nothing gets no backups", () => {
    const { matches, backups } = matchCandidates({ screening: clean({ credit_score: 500 }), income, now: NOW, candidates: [cand("a"), cand("b")] });
    assert.ok(matches.every((x) => x.result === "no"));
    assert.deepEqual(backups, []);
  });
});
