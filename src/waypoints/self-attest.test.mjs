// Which steps a client may tick — the pure half of src/waypoints/self-attest.mjs.
// No database. The endpoint's behaviour against a real Postgres is in
// src/http/waypoint-tick.pg.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tickRefusal, closedBy } from "./self-attest.mjs";

const row = (over) => ({ owner_kind: "client", verify_kind: null, ...over });

test("a client-owned step with no machine check is tickable", () => {
  for (const key of ["form_llc", "get_ein", "business_checking", "personal_loan"]) {
    assert.equal(tickRefusal(row({ key })), null, key);
    assert.equal(closedBy(row({ key })), "client", key);
  }
});

test("paydown closes on the credit report, never by hand", () => {
  assert.equal(tickRefusal(row({ verify_kind: "paydown" })), "closes_on_credit_report");
  assert.equal(closedBy(row({ verify_kind: "paydown" })), "credit_report");
});

test("no_new_credit is a rule, never ticked", () => {
  assert.equal(tickRefusal(row({ verify_kind: "no_new_credit" })), "ongoing_rule");
  assert.equal(closedBy(row({ verify_kind: "no_new_credit" })), "ongoing");
});

test("an unrecognised machine check is refused — the safe direction", () => {
  assert.equal(tickRefusal(row({ verify_kind: "future_check" })), "machine_checked");
  assert.equal(closedBy(row({ verify_kind: "future_check" })), "fundhub");
});

test("our own step is not the client's to tick", () => {
  assert.equal(tickRefusal(row({ owner_kind: "fundhub" })), "our_step");
  assert.equal(closedBy(row({ owner_kind: "fundhub" })), "fundhub");
});

test("no row is not_found", () => {
  assert.equal(tickRefusal(null), "not_found");
});
