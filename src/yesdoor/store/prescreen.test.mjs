// The pre-screen's input rules. Pure: no database. Everything here runs before
// anything is written, so a bad request leaves no trace.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseAddress, parseConsent, parseDob, parseSearch } from "./prescreen.mjs";
import { YdError } from "../http.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const refuses = (fn, code) => assert.throws(fn, (e) => e instanceof YdError && e.code === code && e.status === 400, `expected 400 ${code}`);

describe("consent", () => {
  const good = { text: "I agree to a soft credit and background check, now and for repeat checks.", version: "v1", checked: true };

  test("a ticked box with the text and version that were shown is accepted", () => {
    assert.deepEqual(parseConsent(good), { text: good.text, version: "v1", method: "checkbox" });
  });
  test("typed consent is kept as typed; anything else is a checkbox", () => {
    assert.equal(parseConsent({ ...good, method: "typed" }).method, "typed");
    assert.equal(parseConsent({ ...good, method: "whatever" }).method, "checkbox");
  });
  test("no consent, an unticked box, or a truthy non-true value is refused", () => {
    refuses(() => parseConsent(undefined), "consent_required");
    refuses(() => parseConsent(null), "consent_required");
    refuses(() => parseConsent("yes"), "consent_required");
    refuses(() => parseConsent({ ...good, checked: false }), "consent_required");
    refuses(() => parseConsent({ ...good, checked: "true" }), "consent_required");
    refuses(() => parseConsent({ ...good, checked: 1 }), "consent_required");
    const { checked, ...noBox } = good;
    refuses(() => parseConsent(noBox), "consent_required");
  });
  test("the text and the version are both required, and bounded", () => {
    refuses(() => parseConsent({ ...good, text: "   " }), "consent_required");
    refuses(() => parseConsent({ ...good, text: undefined }), "consent_required");
    refuses(() => parseConsent({ ...good, version: "" }), "consent_required");
    refuses(() => parseConsent({ ...good, text: "x".repeat(4001) }), "consent_required");
    refuses(() => parseConsent({ ...good, version: "v".repeat(65) }), "consent_required");
    assert.equal(parseConsent({ ...good, text: "x".repeat(4000) }).text.length, 4000);
  });
});

describe("date of birth", () => {
  test("absent means null (the first try has none)", () => {
    for (const v of [undefined, null, ""]) assert.equal(parseDob(v, NOW), null);
  });
  test("a real adult date is accepted as given", () => {
    assert.equal(parseDob("1994-05-17", NOW), "1994-05-17");
    assert.equal(parseDob(" 1994-05-17 ", NOW), "1994-05-17");
  });
  test("not a date, not that shape, or not a real day is refused", () => {
    for (const v of ["05/17/1994", "1994-5-17", "1994-13-01", "1994-02-30", "yesterday", 19940517, {}, "1899-12-31"]) {
      refuses(() => parseDob(v, NOW), "invalid_dob");
    }
  });
  test("a future date is refused", () => {
    refuses(() => parseDob("2026-10-08", NOW), "invalid_dob");
    refuses(() => parseDob("2031-01-01", NOW), "invalid_dob");
  });
  test("under 18 is refused, exactly 18 today is accepted", () => {
    refuses(() => parseDob("2008-10-08", NOW), "invalid_dob");
    refuses(() => parseDob("2015-01-01", NOW), "invalid_dob");
    assert.equal(parseDob("2008-10-07", NOW), "2008-10-07");
    assert.equal(parseDob("2008-10-06", NOW), "2008-10-06");
  });
});

describe("address", () => {
  test("keeps the five fields, clipped, with the state upper-cased", () => {
    assert.deepEqual(
      parseAddress({ line1: " 4410 N Example Way ", line2: "Apt 2", city: "Scottsdale", state: "az", zip: "85251", extra: "dropped" }),
      { line1: "4410 N Example Way", line2: "Apt 2", city: "Scottsdale", state: "AZ", zip: "85251" });
  });
  test("a bare string is the street line", () => {
    assert.deepEqual(parseAddress("12 Example St"), { line1: "12 Example St" });
  });
  test("empty, wrong-typed or unusable input is null, never a throw", () => {
    for (const v of [undefined, null, "", "  ", [], 5, {}, { state: "Arizona" }, { city: "  " }]) assert.equal(parseAddress(v), null);
  });
});

describe("search", () => {
  test("the city comes from the search, else the address; one of them is required", () => {
    assert.equal(parseSearch({ city: "Tempe" }, { city: "Phoenix" }).city, "Tempe");
    assert.equal(parseSearch({}, { city: "Phoenix" }).city, "Phoenix");
    assert.equal(parseSearch(undefined, { city: "Phoenix", state: "AZ" }).state, "AZ");
    refuses(() => parseSearch({}, null), "city_required");
    refuses(() => parseSearch(undefined, undefined), "city_required");
    refuses(() => parseSearch({ city: "  " }, { line1: "x" }), "city_required");
  });
  test("beds is an exact whole number from 0 (a studio) to 10", () => {
    assert.equal(parseSearch({ city: "A", beds: 0 }).beds, 0);
    assert.equal(parseSearch({ city: "A", beds: "2" }).beds, 2);
    assert.equal(parseSearch({ city: "A" }).beds, null);
    for (const beds of [-1, 11, 1.5, "two"]) {
      assert.throws(() => parseSearch({ city: "A", beds }), (e) => e.code === "invalid_parameter");
    }
  });
  test("maxRent is WHOLE DOLLARS and becomes integer cents", () => {
    assert.equal(parseSearch({ city: "A", maxRent: 1800 }).maxRentCents, 180000);
    assert.equal(parseSearch({ city: "A", maxRent: "1650.50" }).maxRentCents, 165050);
    assert.equal(parseSearch({ city: "A" }).maxRentCents, null);
    for (const maxRent of [0, -5, "lots"]) {
      assert.throws(() => parseSearch({ city: "A", maxRent }), (e) => e.code === "invalid_parameter");
    }
  });
});
