import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { feeEligible, knownProspectClaimValid } from "./attribution.mjs";
import { YD_DEFAULTS } from "../config.mjs";

const REG = "2026-01-10T15:00:00Z";
const after = (iso, days, extraMs = 0) => new Date(new Date(iso).getTime() + days * 86_400_000 + extraMs).toISOString();

describe("feeEligible", () => {
  test("a lease signed inside the registration window earns the fee", () => {
    const r = feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 20) });
    assert.equal(r.eligible, true);
    assert.equal(r.reason, "ok");
    assert.equal(r.daysAfterRegistration, 20);
    assert.equal(r.expiresAt, "2026-04-10T15:00:00.000Z");
  });
  test("day 90 exactly still counts; one second after does not", () => {
    assert.equal(feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 90) }).eligible, true);
    const late = feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 90, 1000) });
    assert.equal(late.eligible, false);
    assert.equal(late.reason, "expired");
  });
  test("signed long after: no fee unless the building re-registers", () => {
    assert.equal(feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 200) }).reason, "expired");
    // A re-registration is a new registration_sent_at, which starts a new window.
    const reReg = after(REG, 180);
    assert.equal(feeEligible({ registrationSentAt: reReg, leaseSignedAt: after(REG, 200) }).eligible, true);
  });
  test("an upheld known-prospect claim means no fee, even inside the window", () => {
    const r = feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 10), knownProspectAt: "2026-01-02T00:00:00Z" });
    assert.equal(r.eligible, false);
    assert.equal(r.reason, "known_prospect");
  });
  test("no claim, a null claim and an empty claim all leave the fee alone", () => {
    for (const none of [undefined, null, ""]) {
      assert.equal(feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 10), knownProspectAt: none }).eligible, true);
    }
  });
  test("no registration means no proof of referral, so no fee", () => {
    const r = feeEligible({ registrationSentAt: null, leaseSignedAt: after(REG, 10) });
    assert.equal(r.eligible, false);
    assert.equal(r.reason, "no_registration");
    assert.equal(r.expiresAt, null);
  });
  test("no lease yet is not eligible, and says why", () => {
    const r = feeEligible({ registrationSentAt: REG, leaseSignedAt: null });
    assert.equal(r.eligible, false);
    assert.equal(r.reason, "no_lease");
    assert.equal(r.daysAfterRegistration, null);
  });
  test("a lease signed before the registration (odd data) is not rejected as expired", () => {
    assert.equal(feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, -1) }).eligible, true);
  });
  test("the window comes from the defaults", () => {
    const defaults = { ...YD_DEFAULTS, registrationValidDays: 30 };
    assert.equal(feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 31), defaults }).reason, "expired");
    assert.equal(feeEligible({ registrationSentAt: REG, leaseSignedAt: after(REG, 30), defaults }).eligible, true);
  });
  test("accepts Date objects as well as strings", () => {
    assert.equal(feeEligible({ registrationSentAt: new Date(REG), leaseSignedAt: new Date(after(REG, 5)) }).eligible, true);
  });
});

describe("knownProspectClaimValid", () => {
  const claim = (over = {}) => knownProspectClaimValid({
    registrationSentAt: REG, claimedAt: after(REG, 2), evidenceAt: "2026-01-03T09:00:00Z", ...over
  });

  test("valid inside 3 days with earlier evidence", () => {
    assert.deepEqual(claim(), { valid: true, reason: "ok" });
  });
  test("day 3 exactly is in time; later is too late", () => {
    assert.equal(claim({ claimedAt: after(REG, 3) }).valid, true);
    assert.deepEqual(claim({ claimedAt: after(REG, 3, 1000) }), { valid: false, reason: "too_late" });
  });
  test("the building's own record must be earlier than the registration", () => {
    assert.equal(claim({ evidenceAt: REG }).reason, "evidence_not_earlier");
    assert.equal(claim({ evidenceAt: after(REG, 1) }).reason, "evidence_not_earlier");
  });
  test("evidence is required", () => {
    assert.equal(claim({ evidenceAt: null }).reason, "no_evidence");
  });
  test("a registration and a claim date are required", () => {
    assert.equal(claim({ registrationSentAt: null }).reason, "no_registration");
    assert.equal(claim({ claimedAt: null }).reason, "no_claim_date");
  });
  test("the window comes from the defaults", () => {
    const defaults = { ...YD_DEFAULTS, knownProspectDays: 7 };
    assert.equal(claim({ claimedAt: after(REG, 6), defaults }).valid, true);
    assert.equal(claim({ claimedAt: after(REG, 6) }).reason, "too_late");
  });
});
