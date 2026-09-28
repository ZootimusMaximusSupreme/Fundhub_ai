import { test } from "node:test";
import assert from "node:assert/strict";
import { dripTemplate, sloLane } from "../slo/drip-plan.mjs";

test("sloLane: paid is off, checkout is hot, a reply is warm", () => {
  assert.equal(sloLane({ paid: true, checkout: true }), null);
  assert.equal(sloLane({ checkout: true }), "hot");
  assert.equal(sloLane({ replied: true }), "warm");
  assert.equal(sloLane({ contact: true }), "warm");
  assert.equal(sloLane({}), "cold");
});

test("dripTemplate: seven emails, then it wraps", () => {
  assert.equal(dripTemplate("cold", 0), "EMAIL-SLO-DRIP-COLD-1");
  assert.equal(dripTemplate("cold", 7), "EMAIL-SLO-DRIP-COLD-1");
  assert.equal(dripTemplate("hot", 1), "EMAIL-SLO-DRIP-HOT-2");
  assert.equal(dripTemplate("nope", 0), null);
});

test("dripGapDays: hot and warm start daily, cold waits two days", async () => {
  const { dripGapDays } = await import("../slo/drip-plan.mjs");
  assert.equal(dripGapDays("hot", 0), 1);
  assert.equal(dripGapDays("hot", 4), 2);
  assert.equal(dripGapDays("warm", 0), 1);
  assert.equal(dripGapDays("warm", 3), 2);
  assert.equal(dripGapDays("cold", 0), 2);
});
