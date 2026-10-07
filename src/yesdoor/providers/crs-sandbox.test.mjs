import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER, SANDBOX, generatedFile, screen } from "./crs-sandbox.mjs";
import { SAMPLE_RENTERS, fixtureByKey } from "../fixtures/renters.mjs";

const CREDIT_FIELDS = ["credit_score", "collections_count", "eviction_count", "eviction_last_at", "criminal_flags"];

test("it is a sandbox provider", () => {
  assert.equal(PROVIDER, "crs_sandbox");
  assert.equal(SANDBOX, true);
});

describe("known sample renters", () => {
  for (const r of SAMPLE_RENTERS.filter((x) => !x.noMatchUntilDob)) {
    test(`${r.key}: returns exactly their file`, async () => {
      const out = await screen({ firstName: r.firstName, lastName: r.lastName, email: r.email, address: r.address });
      assert.equal(out.status, "complete");
      assert.equal(out.provider, "crs_sandbox");
      assert.equal(out.sandbox, true);
      for (const f of CREDIT_FIELDS) assert.deepEqual(out[f], r.credit[f], f);
      assert.match(out.raw_ref, /^crs-sandbox:[0-9a-f]{12}$/);
    });
  }
  test("email matching ignores case and spaces", async () => {
    const r = fixtureByKey("prime-1");
    const out = await screen({ email: `  ${r.email.toUpperCase()}  ` });
    assert.equal(out.credit_score, r.credit.credit_score);
  });
  test("a date of birth on a renter who did not need one changes nothing", async () => {
    const r = fixtureByKey("tier-b");
    const a = await screen({ email: r.email });
    const b = await screen({ email: r.email, dob: "1980-01-01" });
    for (const f of CREDIT_FIELDS) assert.deepEqual(b[f], a[f]);
  });
});

describe("no match until a date of birth is given", () => {
  const leah = fixtureByKey("no-match");

  test("the no-match sample returns no_match with every credit field null", async () => {
    const out = await screen({ email: leah.email });
    assert.equal(out.status, "no_match");
    for (const f of CREDIT_FIELDS) assert.equal(out[f], null, f);
    assert.equal(out.raw.needs, "date_of_birth");
  });
  test("with a date of birth it resolves to her file", async () => {
    const out = await screen({ email: leah.email, dob: leah.dob });
    assert.equal(out.status, "complete");
    assert.equal(out.credit_score, leah.credit.credit_score);
  });
  test("an unknown email is no_match too", async () => {
    const out = await screen({ email: "stranger@example.com" });
    assert.equal(out.status, "no_match");
    assert.equal(out.credit_score, null);
  });
  test("a malformed date of birth does not count", async () => {
    for (const dob of ["", "05/17/1994", "1994-13-40", "tomorrow", 19940517, null]) {
      assert.equal((await screen({ email: leah.email, dob })).status, "no_match", String(dob));
    }
  });
});

describe("generated mid-tier file for an unknown renter with a date of birth", () => {
  test("is complete, mid-tier, clean of evictions and criminal flags", async () => {
    for (const email of ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "e@example.com"]) {
      const out = await screen({ email, dob: "1990-02-03" });
      assert.equal(out.status, "complete");
      assert.ok(out.credit_score >= 620 && out.credit_score <= 679, `score ${out.credit_score}`);
      assert.ok([0, 1, 2].includes(out.collections_count));
      assert.equal(out.eviction_count, 0);
      assert.equal(out.eviction_last_at, null);
      assert.deepEqual(out.criminal_flags, []);
    }
  });
  test("is deterministic, and differs by person", async () => {
    const a1 = await screen({ email: "a@example.com", dob: "1990-02-03" });
    const a2 = await screen({ email: "A@example.com", dob: "1990-02-03" });
    assert.deepEqual(a1, a2);
    const scores = new Set();
    for (let i = 0; i < 20; i++) scores.add((await screen({ email: `p${i}@example.com`, dob: "1990-02-03" })).credit_score);
    assert.ok(scores.size > 5, "different people get different files");
    assert.deepEqual(generatedFile("x@example.com", "1990-02-03"), generatedFile("x@example.com", "1990-02-03"));
  });
  test("a different date of birth gives a different reference", async () => {
    const a = await screen({ email: "a@example.com", dob: "1990-02-03" });
    const b = await screen({ email: "a@example.com", dob: "1991-02-03" });
    assert.notEqual(a.raw_ref, b.raw_ref);
  });
});

describe("determinism and safety", () => {
  test("the same input gives the same output, every time", async () => {
    const r = fixtureByKey("tier-d");
    assert.deepEqual(await screen({ email: r.email }), await screen({ email: r.email }));
  });
  test("results are copies: changing one never changes the fixture", async () => {
    const r = fixtureByKey("tier-d");
    const out = await screen({ email: r.email });
    out.criminal_flags[0].category = "changed";
    assert.equal(fixtureByKey("tier-d").credit.criminal_flags[0].category, "felony_property");
  });
  test("the raw payload carries no date of birth, SSN or full report", async () => {
    const leah = fixtureByKey("no-match");
    const out = await screen({ email: leah.email, dob: leah.dob, firstName: "Leah", lastName: "Brandt-Sample" });
    const text = JSON.stringify(out.raw);
    assert.equal(text.includes(leah.dob), false);
    assert.doesNotMatch(text, /ssn|dob/i);
    assert.equal(out.raw.sandbox, true);
  });
  test("an email is required", async () => {
    await assert.rejects(() => screen({}), /needs an email/);
    await assert.rejects(() => screen({ email: "  " }), /needs an email/);
  });
});
