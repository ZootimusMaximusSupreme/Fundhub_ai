// The join between database rows and the pure matcher. Pure: no database.
// computeMatches takes the rows loadCandidates would read, so every rule here is
// proved without a Postgres.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeMatches, renterAnswer, renterResultView } from "./matching.mjs";
import { buildingView } from "../match/match.mjs";
import { FIXTURE_NOW, fixtureByKey } from "../fixtures/renters.mjs";

const NOW = new Date(FIXTURE_NOW);
const fresh = new Date("2026-10-01T00:00:00Z");
const stale = new Date("2026-08-01T00:00:00Z");

const prime = fixtureByKey("prime-1");
const screening = (f) => ({ status: "complete", ...f.credit });
const income = (f) => ({ status: "verified", monthly_income_cents: f.income.monthly_income_cents });

let seq = 0;
const id = (p) => `${p}-${String(++seq).padStart(4, "0")}`;

/** One candidate row, as loadCandidates returns it. */
const row = (o = {}) => ({
  building_id: o.building ?? id("b"), building_name: o.name ?? "Test Building", address: "1 Test Way",
  city: o.city ?? "Phoenix", state: o.state ?? "AZ", is_sample: o.sample ?? false, status: o.status ?? "live",
  lat: o.lat ?? null, lng: o.lng ?? null,
  rules_id: o.rules ?? id("r"), version: 1, min_score: o.minScore ?? 600, income_multiple: o.multiple ?? "3.00",
  max_evictions: 0, eviction_lookback_years: 5, criminal_policy: {}, confirmed_at: o.confirmed ?? fresh,
  listing_id: o.listing ?? id("l"), unit_label: o.unit ?? "101", beds: 1, rent_cents: String(o.rent ?? 150000)
});

describe("one match per building: the best listing", () => {
  test("with income unknown every listing is likely, and the cheapest is shown", () => {
    const b = id("b");
    const rows = { areaRows: [row({ building: b, rent: 200000 }), row({ building: b, rent: 140000 }), row({ building: b, rent: 170000 })], poolRows: [], extraRows: [] };
    const out = computeMatches({ screening: screening(prime), income: null, rows, now: NOW });
    assert.equal(out.area.length, 1);
    assert.equal(out.area[0].result, "likely");
    assert.equal(out.area[0].listingRentCents, 140000);
    assert.equal(out.approvedMaxRentCents, null, "nothing is approved before income is verified");
  });

  test("a listing the renter clears beats one they do not", () => {
    // income 4,000 a month: a $1,000 unit needs 3,300 with room to spare, a $3,000 unit needs 9,000
    const b = id("b");
    const rows = { areaRows: [row({ building: b, rent: 300000 }), row({ building: b, rent: 100000 })], poolRows: [], extraRows: [] };
    const out = computeMatches({ screening: screening(prime), income: { status: "verified", monthly_income_cents: 400000 }, rows, now: NOW });
    assert.equal(out.area.length, 1);
    assert.equal(out.area[0].result, "approved");
    assert.equal(out.area[0].listingRentCents, 100000);
    assert.equal(out.area[0].maxRentCents, 133333);
  });

  test("when no listing is cleared the answer is no, at the cheapest", () => {
    const b = id("b");
    const rows = { areaRows: [row({ building: b, rent: 500000 }), row({ building: b, rent: 450000 })], poolRows: [], extraRows: [] };
    const out = computeMatches({ screening: screening(prime), income: { status: "verified", monthly_income_cents: 400000 }, rows, now: NOW });
    assert.equal(out.area[0].result, "no");
    assert.equal(out.area[0].listingRentCents, 450000);
  });

  test("approved up to is the highest max rent among approved results in the searched area only", () => {
    const rows = {
      areaRows: [row({ rent: 150000, multiple: "3.00" }), row({ rent: 150000, multiple: "2.50" })],
      poolRows: [row({ city: "Mesa", rent: 150000, multiple: "2.00" })],
      extraRows: [row({ city: "Gilbert", rent: 150000, multiple: "1.00" })]
    };
    const out = computeMatches({ screening: screening(prime), income: income(prime), rows, now: NOW });
    // 7,200 / 2.5 = 2,880 is the best area answer; the pool's 3,600 and the extra's 7,200 do not count
    assert.equal(out.approvedMaxRentCents, 288000);
  });
});

describe("which buildings count", () => {
  test("a sample building (status target) is matched: the database already called it matchable", () => {
    const rows = { areaRows: [row({ status: "target", sample: true })], poolRows: [], extraRows: [] };
    const out = computeMatches({ screening: screening(prime), income: null, rows, now: NOW });
    assert.equal(out.area.length, 1);
    assert.equal(out.area[0].info.building.isSample, true);
  });

  test("stale rules cap the answer at likely, even for a perfect file", () => {
    const rows = { areaRows: [row({ confirmed: stale })], poolRows: [], extraRows: [] };
    const out = computeMatches({ screening: screening(prime), income: income(prime), rows, now: NOW });
    assert.equal(out.area[0].result, "likely");
    assert.equal(out.area[0].rulesStale, true);
    assert.equal(out.approvedMaxRentCents, null);
  });

  test("a failing rule is a no with the reason in plain words", () => {
    const rows = { areaRows: [row({ minScore: 800 })], poolRows: [], extraRows: [] };
    const out = computeMatches({ screening: screening(prime), income: income(prime), rows, now: NOW });
    assert.equal(out.area[0].result, "no");
    assert.match(out.area[0].reasons.find((r) => r.rule === "score").reason, /below the building's minimum of 800/);
  });

  test("state rules ride along as notices, and never change the answer", () => {
    const rows = { areaRows: [row({ state: "CA" })], poolRows: [], extraRows: [] };
    const plain = computeMatches({ screening: screening(prime), income: income(prime), rows, now: NOW });
    const withRules = computeMatches({
      screening: screening(prime), income: income(prime), rows, now: NOW,
      stateRules: { CA: { screening_fee_cap_cents: 6600 } }
    });
    assert.deepEqual(plain.area[0].notices, []);
    assert.equal(withRules.area[0].notices[0].capCents, 6600);
    assert.equal(withRules.area[0].result, plain.area[0].result);
  });

  test("the renter's tier and lane come from the file and the verified income", () => {
    const rows = { areaRows: [row()], poolRows: [], extraRows: [] };
    const before = computeMatches({ screening: screening(prime), income: null, rows, now: NOW });
    assert.equal(before.tier, "B", "a prime file with no verified income is B");
    assert.equal(before.lane, "verified");
    const after = computeMatches({ screening: screening(prime), income: income(prime), rows, now: NOW });
    assert.equal(after.tier, "A");
    const d = fixtureByKey("tier-d");
    const worst = computeMatches({ screening: screening(d), income: income(d), rows, now: NOW });
    assert.equal(worst.tier, "D");
    assert.equal(worst.lane, "second_chance");
  });
});

describe("backups", () => {
  const point = (lat, lng) => ({ lat, lng });

  test("come from outside the searched city only, and only where the renter is approved", () => {
    const inCity = row({ city: "Phoenix" });
    const approvedFar = row({ city: "Mesa", building: "far-approved" });
    const failFar = row({ city: "Tempe", building: "far-no", minScore: 800 });
    const out = computeMatches({
      screening: screening(prime), income: income(prime), now: NOW,
      rows: { areaRows: [inCity], poolRows: [approvedFar, failFar], extraRows: [] }
    });
    assert.deepEqual(out.backups.map((b) => b.buildingId), ["far-approved"]);
    assert.ok(out.backups.every((b) => b.isBackup === true && b.result === "approved"));
    assert.ok(!out.backups.some((b) => b.buildingId === inCity.building_id), "the searched city's own buildings are results, not backups");
  });

  test("with income unknown nothing is approved, so there are no backups", () => {
    const out = computeMatches({
      screening: screening(prime), income: null, now: NOW,
      rows: { areaRows: [row()], poolRows: [row({ city: "Mesa" })], extraRows: [] }
    });
    assert.deepEqual(out.backups, []);
  });

  test("at most five, ordered by rent fit and then distance", () => {
    const areaRows = [row({ lat: 33.4484, lng: -112.074 })];
    // Renter's max rent is 7,200 / 3 = 2,400. Closer to 2,400 wins (2,180 is the most a 7,200 income clears with room to spare); the same rent falls back to distance.
    const poolRows = [
      row({ building: "p-1700", city: "Mesa", rent: 170000, lat: 33.41, lng: -111.83 }),
      row({ building: "p-2180-near", city: "Tempe", rent: 218000, lat: 33.4255, lng: -111.94 }),
      row({ building: "p-2180-far", city: "Mesa", rent: 218000, lat: 33.62, lng: -111.7 }),
      row({ building: "p-2000", city: "Gilbert", rent: 200000, lat: 33.35, lng: -111.78 }),
      row({ building: "p-1500", city: "Mesa", rent: 150000, lat: 33.4, lng: -111.8 }),
      row({ building: "p-1200", city: "Mesa", rent: 120000, lat: 33.4, lng: -111.81 }),
      row({ building: "p-1000", city: "Mesa", rent: 100000, lat: 33.4, lng: -111.82 })
    ];
    const out = computeMatches({ screening: screening(prime), income: income(prime), rows: { areaRows, poolRows, extraRows: [] }, now: NOW });
    assert.equal(out.backups.length, 5);
    assert.deepEqual(out.backups.map((b) => b.buildingId),
      ["p-2180-near", "p-2180-far", "p-2000", "p-1700", "p-1500"]);
    assert.deepEqual(out.backups.map((b) => b.backupRank), [1, 2, 3, 4, 5]);
  });

  test("a building with no coordinates sorts after one with coordinates at the same rent", () => {
    const areaRows = [row({ lat: 33.4484, lng: -112.074 })];
    const poolRows = [
      row({ building: "no-coords", city: "Mesa", rent: 200000 }),
      row({ building: "has-coords", city: "Tempe", rent: 200000, lat: 33.4255, lng: -111.94 })
    ];
    const out = computeMatches({ screening: screening(prime), income: income(prime), rows: { areaRows, poolRows, extraRows: [] }, now: NOW });
    assert.deepEqual(out.backups.map((b) => b.buildingId), ["has-coords", "no-coords"]);
  });

  test("extra buildings (an open application's) are re-matched but never become backups", () => {
    const extra = row({ city: "Gilbert", building: "booked-here" });
    const out = computeMatches({
      screening: screening(prime), income: income(prime), now: NOW,
      rows: { areaRows: [row()], poolRows: [], extraRows: [extra] }
    });
    assert.ok(out.area.some((m) => m.buildingId === "booked-here"), "the booked building is re-matched");
    assert.deepEqual(out.backups, []);
  });
});

describe("an open application's building with no live unit", () => {
  test("is still matched (rent unknown, so at best likely) and shows no unit", () => {
    const noUnit = { ...row({ building: "booked-no-unit" }), listing_id: null, unit_label: null, beds: null, rent_cents: null };
    const out = computeMatches({
      screening: screening(prime), income: income(prime), now: NOW,
      rows: { areaRows: [row()], poolRows: [], extraRows: [noUnit] }
    });
    const m = out.area.find((x) => x.buildingId === "booked-no-unit");
    assert.ok(m, "the booked building is still re-matched");
    assert.equal(m.result, "likely");
    assert.equal(m.listingId, null);
    assert.equal(m.info.listing, null);
    assert.equal(renterResultView(m).listing, null);
    assert.equal(m.reasons.find((r) => r.rule === "income").result, "unknown");
  });
});

describe("the renter's view is not a building's view", () => {
  const rows = { areaRows: [row({ name: "Alder Row Lofts" })], poolRows: [row({ city: "Mesa" })], extraRows: [] };
  const out = computeMatches({ screening: screening(prime), income: income(prime), rows, now: NOW });

  test("the renter sees the answer, their reasons, and the date of the rules used", () => {
    const v = renterResultView(out.area[0]);
    assert.equal(v.result, "approved");
    assert.ok(v.reasons.length >= 5);
    assert.deepEqual(Object.keys(v.reasons[0]).sort(), ["reason", "result", "rule"]);
    assert.equal(v.rulesConfirmedAt, "2026-10-01");
    assert.equal(v.building.name, "Alder Row Lofts");
    assert.equal(v.listing.unit, "101");
  });

  test("a building user gets the answer, tier, income flag and max rent, and nothing else", () => {
    const v = buildingView(out.area[0], income(prime));
    assert.deepEqual(Object.keys(v).sort(),
      ["incomeVerified", "maxRentCents", "result", "riskTier", "rulesConfirmedAt", "rulesVersion"]);
    assert.equal(JSON.stringify(v).includes("reason"), false);
    assert.equal(JSON.stringify(v).includes(String(prime.credit.credit_score)), false);
  });

  test("the whole renter answer has no raw report and no credit-field keys", () => {
    const run = {
      renter: { stage: "matched", lane: "verified", risk_tier: "A", approved_max_rent_cents: "240000", income_verified: true },
      search: { city: "Phoenix", state: "AZ", beds: null, maxRentCents: null },
      results: out.area, backups: out.backups
    };
    const answer = renterAnswer(run);
    assert.equal(answer.renter.approvedMaxRentCents, 240000, "pg bigint strings become numbers");
    assert.equal(answer.nextStep, null);
    const keys = [];
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.push(k.toLowerCase()); walk(x); }
    };
    walk(answer);
    for (const bad of ["credit_score", "creditscore", "eviction_count", "evictioncount", "criminal_flags", "criminalflags", "collections_count", "raw", "rawref", "raw_ref"]) {
      assert.ok(!keys.includes(bad), `answer carries key ${bad}`);
    }
    // backups do not repeat reasons
    assert.ok(answer.backups.every((b) => !("reasons" in b)));
  });

  test("income not verified yet points the renter at the next step", () => {
    const run = {
      renter: { stage: "matched", lane: "verified", risk_tier: "B", approved_max_rent_cents: null, income_verified: false },
      search: { city: "Phoenix", state: null, beds: null, maxRentCents: null }, results: [], backups: []
    };
    assert.equal(renterAnswer(run).nextStep, "verify_income");
    assert.equal(renterAnswer(run).renter.approvedMaxRentCents, null);
  });
});
