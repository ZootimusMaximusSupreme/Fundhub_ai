import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideMismatch } from "./mismatch.mjs";
import { YD_DEFAULTS } from "../config.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const building = (over = {}) => ({ id: "b1", status: "live", appFeeCents: 5000, appFeeWaived: false, ...over });
const backup = (buildingId, over = {}) => ({ buildingId, result: "approved", ...over });
const decide = (over = {}) => decideMismatch({
  building: building(), denial: { reason: "Income could not be confirmed by the property manager." },
  ourMatch: { result: "approved" }, priorMismatchAt: [], backups: [], now: NOW, ...over
});

describe("count and pause", () => {
  test("an approved match that was denied is a mismatch", () => {
    const d = decide();
    assert.equal(d.incrementMismatch, true);
    assert.equal(d.mismatchesInWindow, 1);
    assert.equal(d.pauseBuilding, false);
  });
  test("a likely or no match that was denied is not a mismatch (we never promised)", () => {
    for (const result of ["likely", "no"]) {
      const d = decide({ ourMatch: { result }, priorMismatchAt: [daysAgo(1), daysAgo(2)] });
      assert.equal(d.incrementMismatch, false);
      assert.equal(d.pauseBuilding, false);
      assert.equal(d.refundOwedCents, 0);
    }
  });
  test("the third mismatch inside 90 days pauses the building and opens a rules review", () => {
    const d = decide({ priorMismatchAt: [daysAgo(10), daysAgo(40)] });
    assert.equal(d.mismatchesInWindow, 3);
    assert.equal(d.pauseBuilding, true);
    assert.equal(d.rulesReviewTask, true);
  });
  test("two mismatches do not pause", () => {
    const d = decide({ priorMismatchAt: [daysAgo(10)] });
    assert.equal(d.pauseBuilding, false);
    assert.equal(d.rulesReviewTask, false);
  });
  test("a mismatch older than 90 days does not count toward the pause", () => {
    const d = decide({ priorMismatchAt: [daysAgo(91), daysAgo(120), daysAgo(10)] });
    assert.equal(d.mismatchesInWindow, 2);
    assert.equal(d.pauseBuilding, false);
  });
  test("90 days back is the edge: exactly 90 days old is outside, 89 is inside", () => {
    assert.equal(decide({ priorMismatchAt: [daysAgo(90), daysAgo(89)] }).mismatchesInWindow, 2);
    assert.equal(decide({ priorMismatchAt: [daysAgo(90), daysAgo(90)] }).mismatchesInWindow, 1);
  });
  test("future-dated or invalid prior dates are ignored", () => {
    const d = decide({ priorMismatchAt: [new Date(NOW.getTime() + 86_400_000).toISOString(), "garbage", null] });
    assert.equal(d.mismatchesInWindow, 1);
  });
  test("an already paused or churned building is not paused again", () => {
    for (const status of ["paused", "churned", "pitched"]) {
      const d = decide({ building: building({ status }), priorMismatchAt: [daysAgo(1), daysAgo(2), daysAgo(3)] });
      assert.equal(d.pauseBuilding, false);
    }
    assert.equal(decide({ building: building({ status: "signed" }), priorMismatchAt: [daysAgo(1), daysAgo(2)] }).pauseBuilding, true);
  });
  test("the window is measured from the denial date when one is given", () => {
    const deniedAt = daysAgo(200);
    const d = decide({ denial: { reason: "x", deniedAt }, priorMismatchAt: [daysAgo(250), daysAgo(260)] });
    assert.equal(d.mismatchesInWindow, 3);
    assert.equal(d.pauseBuilding, true);
  });
  test("the pause threshold and window come from the defaults", () => {
    const defaults = { ...YD_DEFAULTS, mismatchPause: 2, mismatchWindowDays: 30 };
    assert.equal(decide({ defaults, priorMismatchAt: [daysAgo(10)] }).pauseBuilding, true);
    assert.equal(decide({ defaults, priorMismatchAt: [daysAgo(40)] }).pauseBuilding, false);
  });
});

describe("refund", () => {
  test("owed in full when the building did not waive the application fee", () => {
    assert.equal(decide({ building: building({ appFeeCents: 5000, appFeeWaived: false }) }).refundOwedCents, 5000);
    assert.equal(decide({ building: building({ appFeeCents: 6600 }) }).refundOwedCents, 6600);
  });
  test("nothing owed when the building waived the fee, whatever the amount on file", () => {
    assert.equal(decide({ building: building({ appFeeCents: 5000, appFeeWaived: true }) }).refundOwedCents, 0);
    assert.equal(decide({ building: building({ appFeeCents: null, appFeeWaived: true }) }).refundOwedCents, 0);
  });
  test("owed but the amount is unknown: null, never 0", () => {
    const d = decide({ building: building({ appFeeCents: null, appFeeWaived: false }) });
    assert.equal(d.refundOwedCents, null);
  });
  test("a fee of $0 on file means $0 owed", () => {
    assert.equal(decide({ building: building({ appFeeCents: 0 }) }).refundOwedCents, 0);
  });
});

describe("backups", () => {
  test("offers the approved backups at other buildings, in the order given", () => {
    const d = decide({ backups: [backup("b2"), backup("b3"), backup("b1"), backup("b4", { result: "likely" })] });
    assert.deepEqual(d.backupsToOffer.map((b) => b.buildingId), ["b2", "b3"]);
  });
  test("offers at most maxBackups", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((id) => backup(id));
    assert.equal(decide({ backups: many }).backupsToOffer.length, 5);
  });
  test("with no backups the renter still gets the other decisions", () => {
    const d = decide({ backups: [] });
    assert.deepEqual(d.backupsToOffer, []);
    assert.equal(d.incrementMismatch, true);
  });
  test("backups are offered even when the denial was not our mismatch", () => {
    assert.equal(decide({ ourMatch: { result: "likely" }, backups: [backup("b2")] }).backupsToOffer.length, 1);
  });
});

describe("the denial reason", () => {
  test("is stored for staff, trimmed", () => {
    assert.equal(decide({ denial: { reason: "  Evictions in the last 7 years.  " } }).denialReason, "Evictions in the last 7 years.");
  });
  test("a denial without a reason is refused", () => {
    for (const denial of [{}, { reason: "" }, { reason: "   " }, null, undefined]) {
      assert.throws(() => decide({ denial }), /needs a reason/);
    }
  });
  test("a missing building is refused", () => {
    assert.throws(() => decide({ building: null }), /needs the building/);
  });
});
