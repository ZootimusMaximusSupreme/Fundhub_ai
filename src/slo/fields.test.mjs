// Field checks for the /roadmap widget's identity step (src/slo/fields.mjs).
// Pure. Every refusal names its field.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkAddress,
  checkDob,
  checkFirstName,
  checkLastName,
  checkMiddleName,
  checkSsn,
  checkSuffix,
  isPoBox
} from "./fields.mjs";

const NOW = new Date("2026-09-22T12:00:00Z");

test("first and last name are required, letters only, with the field named", () => {
  assert.deepEqual(checkFirstName("  Ada  "), { value: "Ada" });
  assert.equal(checkFirstName("").error.field, "first_name");
  assert.equal(checkFirstName("").error.code, "first_name_required");
  assert.equal(checkLastName("Byr0n").error.code, "last_name_invalid");
  assert.equal(checkLastName("O'Neil-Smith").value, "O'Neil-Smith");
  assert.equal(checkFirstName("José").value, "José");
  assert.equal(checkFirstName("A".repeat(21)).error.code, "first_name_too_long");
});

test("middle name is optional; a blank is null, not an error", () => {
  assert.deepEqual(checkMiddleName(""), { value: null });
  assert.deepEqual(checkMiddleName(null), { value: null });
  assert.equal(checkMiddleName("J.").value, "J");
  assert.equal(checkMiddleName("A".repeat(16)).error.field, "middle_name");
});

test("suffix: JR SR II III IV only, dots and case forgiven, blank is null", () => {
  assert.deepEqual(checkSuffix("Jr."), { value: "JR" });
  assert.deepEqual(checkSuffix("sr"), { value: "SR" });
  assert.deepEqual(checkSuffix("III"), { value: "III" });
  assert.deepEqual(checkSuffix("iv"), { value: "IV" });
  assert.deepEqual(checkSuffix(""), { value: null });
  assert.equal(checkSuffix("V").error.field, "suffix");
  assert.equal(checkSuffix("Esq").error.code, "suffix_invalid");
});

test("date of birth: a real date, 1900 or later, not in the future, two typed formats", () => {
  assert.deepEqual(checkDob("1990-01-02", { now: NOW }), { value: "1990-01-02" });
  assert.deepEqual(checkDob("01/02/1990", { now: NOW }), { value: "1990-01-02" });
  assert.equal(checkDob("", { now: NOW }).error.code, "dob_required");
  assert.equal(checkDob("1990-02-31", { now: NOW }).error.code, "dob_invalid");
  assert.equal(checkDob("2030-01-01", { now: NOW }).error.code, "dob_invalid");
  assert.equal(checkDob("2026-09-23", { now: NOW }).error.code, "dob_invalid", "tomorrow is the future");
  assert.equal(checkDob("1899-12-31", { now: NOW }).error.code, "dob_invalid");
  assert.equal(checkDob("1899-12-31", { now: NOW }).error.field, "dob");
  assert.deepEqual(checkDob("1900-01-01", { now: NOW }), { value: "1900-01-01" });
});

test("date of birth: NO age rule (owner-set 2026-09-22) — under 18 and today both pass", () => {
  assert.deepEqual(checkDob("2008-09-23", { now: NOW }), { value: "2008-09-23" });
  assert.deepEqual(checkDob("2020-05-05", { now: NOW }), { value: "2020-05-05" });
  assert.deepEqual(checkDob("2026-09-22", { now: NOW }), { value: "2026-09-22" });
  for (const d of ["2008-09-23", "2020-05-05", "2026-09-22"]) {
    assert.notEqual(checkDob(d, { now: NOW }).error?.code, "dob_under_18");
  }
});

test("SSN: 9 digits, dashes ok, 666 NOT blocked (every CRS sandbox person is 666)", () => {
  assert.deepEqual(checkSsn("987-65-4321"), { value: "987654321" });
  assert.deepEqual(checkSsn("666455730"), { value: "666455730" });
  assert.equal(checkSsn("").error.code, "ssn_required");
  assert.equal(checkSsn("12345678").error.code, "ssn_invalid");
  assert.equal(checkSsn("000123456").error.code, "ssn_invalid");
  assert.equal(checkSsn("123004567").error.code, "ssn_invalid");
  assert.equal(checkSsn("123450000").error.code, "ssn_invalid");
  assert.equal(checkSsn("1").error.field, "ssn");
});

test("street: required, 3-48 characters, and a digit somewhere (not only first)", () => {
  const bad = checkAddress({ address: "Main St", city: "Denton", state: "TX", zip: "76205" });
  assert.equal(bad.errors.length, 1);
  assert.deepEqual(
    { field: bad.errors[0].field, code: bad.errors[0].code },
    { field: "address", code: "street_number" }
  );
  assert.equal(checkAddress({ address: "", city: "Denton", state: "TX", zip: "76205" }).errors[0].code, "street_required");
  assert.equal(checkAddress({ address: "1A", city: "Denton", state: "TX", zip: "76205" }).errors[0].code, "street_too_short");
  assert.equal(checkAddress({ address: `1 ${"A".repeat(47)}`, city: "Denton", state: "TX", zip: "76205" }).errors[0].code, "street_too_long");
  assert.equal(checkAddress({ address: "1 A", city: "Denton", state: "TX", zip: "76205" }).errors.length, 0, "3 characters is enough");
  const ok = checkAddress({ address: "100 Main St", apt: "4b", city: "Denton", state: "tx", zip: "76205-1234" });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.value.addressLine2, "4B");
  assert.equal(ok.value.state, "TX");
  assert.equal(ok.value.postalCode, "762051234");
});

test("street: military, Puerto Rico and Wisconsin grid addresses pass with no error and no warning", () => {
  const cases = [
    { address: "PSC 1234 Box 5678", city: "APO", state: "AE", zip: "09012" },
    { address: "Unit 2050 Box 4190", city: "APO", state: "AP", zip: "96278" },
    { address: "CMR 480 Box 123", city: "APO", state: "AE", zip: "09128" },
    { address: "Calle Luna 55", city: "San Juan", state: "PR", zip: "00901" },
    { address: "Urb Las Gladiolas 150 Calle A", city: "San Juan", state: "PR", zip: "00926" },
    { address: "N7450 Aanstad Rd", city: "Iola", state: "WI", zip: "54945" },
    { address: "RR 2 Box 15", city: "Denton", state: "TX", zip: "76205" }
  ];
  for (const input of cases) {
    const out = checkAddress(input);
    assert.deepEqual(out.errors, [], input.address);
    assert.deepEqual(out.warnings, [], input.address);
    assert.equal(out.value.addressLine1, input.address);
  }
});

test("apartment: periods and # are normalized, then the 10-character cap applies", () => {
  const base = { address: "100 Main St", city: "Denton", state: "TX", zip: "76205" };
  const want = { "Apt. 4B": "APT 4B", "Ste. 200": "STE 200", "#12": "#12", "# 12": "#12", "apt #3": "APT #3", "Unit 7-C": "UNIT 7-C" };
  for (const [typed, stored] of Object.entries(want)) {
    const out = checkAddress({ ...base, apt: typed });
    assert.deepEqual(out.errors, [], typed);
    assert.equal(out.value.addressLine2, stored, typed);
  }
  const long = checkAddress({ ...base, apt: "Apartment 12B" });
  assert.equal(long.errors[0].field, "apt");
  assert.equal(long.errors[0].code, "apt_invalid");
  assert.match(long.errors[0].message, /10 characters or fewer/);
  const odd = checkAddress({ ...base, apt: "4B!" });
  assert.equal(odd.errors[0].code, "apt_invalid");
  assert.match(odd.errors[0].message, /letters, numbers, spaces, # or -/);
  assert.doesNotMatch(odd.errors[0].message, /10/, "a bad character is not reported as a length problem");
});

test("a P.O. box is a WARNING and never blocks (and it has its number)", () => {
  assert.equal(isPoBox("P.O. Box 12"), true);
  const po = checkAddress({ address: "PO Box 12", city: "Denton", state: "TX", zip: "76205" });
  assert.equal(po.errors.length, 0);
  assert.equal(po.warnings.length, 1);
  assert.equal(po.warnings[0].code, "po_box");
  assert.equal(po.warnings[0].field, "address");
});

test("every address box is named with the prefix, and state / ZIP are checked", () => {
  const out = checkAddress({ address: "", city: "", state: "ZZ", zip: "123" }, { prefix: "prev_" });
  const fields = out.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ["prev_address", "prev_city", "prev_state", "prev_zip"]);
  for (const e of out.errors) assert.equal(typeof e.message, "string");
});
