import test from "node:test";
import assert from "node:assert/strict";
import { scrubSensitive, scrubText, isSensitiveKey, WITHHELD } from "./scrub.mjs";

test("sensitive keys are matched word by word, in snake or camel case", () => {
  for (const k of ["ssn", "ssns", "social_security_number", "accountIdentifier", "account_number",
    "date_of_birth", "dob", "dobs", "password", "api_key", "access_token", "card_number", "tin", "ein"]) {
    assert.equal(isSensitiveKey(k), true, k);
  }
  for (const k of ["waiting", "editing", "adobe_id", "account_last4", "ssn_present", "first_name",
    "phone", "email", "route_status", "tokenize_note"]) {
    assert.equal(isSensitiveKey(k), false, k);
  }
});

test("scrubSensitive withholds by key and records the path", () => {
  const withheld = [];
  const out = scrubSensitive({ a: { ssn: "123456789", name: "Jane" }, list: [{ password: "x" }] }, { withheld });
  assert.equal(out.a.ssn, WITHHELD);
  assert.equal(out.a.name, "Jane");
  assert.equal(out.list[0].password, WITHHELD);
  assert.deepEqual(withheld, ["a.ssn", "list[0].password"]);
});

test("scrubText removes SSNs, card numbers and tokens and keeps the rest", () => {
  const t = scrubText("ssn 123-45-6789, 123 45 6789, card 4111-1111-1111-1111, key sk-abcdefghijklmnopqrstuvwxyz, ok");
  assert.ok(!/123-45-6789|123 45 6789|4111-1111-1111-1111|sk-abcdef/.test(t), t);
  assert.match(t, /^ssn \[ssn withheld\]/);
  assert.match(t, /, ok$/);
});

test("scrubText leaves phone numbers, dates, amounts and uuids alone", () => {
  const keep = "call +15551234567 or (555) 123-4567 on 2026-10-05 for $12,500.00 ref 550e8400-e29b-41d4-a716-446655440000";
  assert.equal(scrubText(keep), keep);
});
