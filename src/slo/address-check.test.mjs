// src/slo/address-check.mjs — the $297 pull form's "does this address exist?"
// check (owner-set 2026-09-22). The geocoder is stubbed: match, no match,
// error, and slow. Pure unit test, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADDRESS_UNVERIFIED_MESSAGE,
  addressQuery,
  checkSloAddresses
} from "./address-check.mjs";

const HOME = { residency: "current", addressLine1: "100 Main St", addressLine2: "APT 4B", city: "Denton", state: "TX", postalCode: "76205" };
const PREV = { residency: "previous", addressLine1: "9 Old Rd", city: "Austin", state: "TX", postalCode: "73301" };

test("the geocoder is asked for street, city, state and ZIP — never the apartment", () => {
  assert.equal(addressQuery(HOME), "100 Main St, Denton, TX 76205");
});

test("match: no warning", async () => {
  const asked = [];
  const out = await checkSloAddresses([HOME, PREV], { verify: async (q) => { asked.push(q); return "match"; } });
  assert.deepEqual(out, []);
  assert.deepEqual(asked, ["100 Main St, Denton, TX 76205", "9 Old Rd, Austin, TX 73301"]);
});

test("no match: a WARNING on the street box, with the owner's words", async () => {
  const out = await checkSloAddresses([HOME], { verify: async () => "no_match" });
  assert.deepEqual(out, [{ field: "address", code: "address_unverified", message: ADDRESS_UNVERIFIED_MESSAGE }]);
  assert.equal(
    ADDRESS_UNVERIFIED_MESSAGE,
    "We couldn't find that address. Check the street and ZIP, or tap Pay again to use it as typed."
  );
});

test("no match on the previous address names prev_address", async () => {
  const out = await checkSloAddresses([HOME, PREV], {
    verify: async (q) => (q.startsWith("9 Old Rd") ? "no_match" : "match")
  });
  assert.deepEqual(out.map((w) => w.field), ["prev_address"]);
});

test("geocoder down: 'unavailable' or a throw never blocks", async () => {
  assert.deepEqual(await checkSloAddresses([HOME], { verify: async () => "unavailable" }), []);
  assert.deepEqual(await checkSloAddresses([HOME], { verify: async () => { throw new Error("ECONNRESET"); } }), []);
  assert.deepEqual(await checkSloAddresses([HOME], { verify: () => { throw new Error("sync boom"); } }), []);
});

test("geocoder slow: past the cap it counts as down, not as a miss", async () => {
  const started = Date.now();
  const out = await checkSloAddresses([HOME], { verify: () => new Promise(() => {}), capMs: 30 });
  assert.deepEqual(out, []);
  assert.ok(Date.now() - started < 1000);
});

test("military mail (AA, AE, AP) is not looked up", async () => {
  let asked = 0;
  const out = await checkSloAddresses(
    [{ residency: "current", addressLine1: "PSC 1234 Box 5678", city: "APO", state: "AE", postalCode: "09012" }],
    { verify: async () => { asked += 1; return "no_match"; } }
  );
  assert.deepEqual(out, []);
  assert.equal(asked, 0);
});
