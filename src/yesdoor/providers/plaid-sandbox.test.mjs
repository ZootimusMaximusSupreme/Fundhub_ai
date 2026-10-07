import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER, SANDBOX, publicTokenFor, submitStatements, verifyIncome } from "./plaid-sandbox.mjs";
import { SAMPLE_RENTERS, fixtureByKey } from "../fixtures/renters.mjs";

test("it is a sandbox provider", () => {
  assert.equal(PROVIDER, "plaid_sandbox");
  assert.equal(SANDBOX, true);
});

describe("verifyIncome", () => {
  for (const r of SAMPLE_RENTERS) {
    test(`${r.key}: the sandbox token returns that renter's verified income`, async () => {
      const out = await verifyIncome({ renterId: "uuid-1", publicToken: publicTokenFor(r.key) });
      assert.equal(out.status, "verified");
      assert.equal(out.method, "plaid");
      assert.equal(out.monthly_income_cents, r.income.monthly_income_cents);
      assert.deepEqual(out.sources, r.income.sources);
      assert.equal(out.sources.reduce((t, s) => t + s.monthly_cents, 0), out.monthly_income_cents);
    });
  }
  test("falls back to the renter's email when the token is not a sample token", async () => {
    const r = fixtureByKey("tier-b");
    const out = await verifyIncome({ renterId: "uuid-1", publicToken: "public-anything", email: r.email });
    assert.equal(out.monthly_income_cents, r.income.monthly_income_cents);
  });
  test("an unknown token gets a generated income, in whole dollars, stable per renter and token", async () => {
    const a = await verifyIncome({ renterId: "uuid-9", publicToken: "public-sandbox-unknown" });
    const b = await verifyIncome({ renterId: "uuid-9", publicToken: "public-sandbox-unknown" });
    assert.deepEqual(a, b);
    assert.equal(a.status, "verified");
    assert.ok(a.monthly_income_cents >= 250000 && a.monthly_income_cents < 700000);
    assert.equal(a.monthly_income_cents % 100, 0);
    assert.equal(a.sources.length, 1);
    assert.equal(a.sources[0].monthly_cents, a.monthly_income_cents);
    const other = new Set();
    for (let i = 0; i < 20; i++) other.add((await verifyIncome({ renterId: `u${i}`, publicToken: "t" })).monthly_income_cents);
    assert.ok(other.size > 5);
  });
  test("results are copies of the fixture", async () => {
    const out = await verifyIncome({ renterId: "u", publicToken: publicTokenFor("prime-2") });
    out.sources[0].monthly_cents = 1;
    assert.equal(fixtureByKey("prime-2").income.sources[0].monthly_cents, 510000);
  });
  test("a renter id and a token are required", async () => {
    await assert.rejects(() => verifyIncome({ publicToken: "t" }), /renterId/);
    await assert.rejects(() => verifyIncome({ renterId: "u" }), /publicToken/);
  });
});

describe("submitStatements", () => {
  test("is never verified automatically: it goes to staff review with no income number", async () => {
    const out = await submitStatements({ renterId: "u", files: [{ name: "jan.pdf" }, { name: "feb.pdf" }] });
    assert.equal(out.status, "review");
    assert.equal(out.method, "statements");
    assert.equal(out.monthly_income_cents, null);
    assert.deepEqual(out.sources, []);
    assert.match(out.note, /2 statement file/);
  });
  test("needs a renter id", async () => {
    await assert.rejects(() => submitStatements({}), /renterId/);
  });
});
