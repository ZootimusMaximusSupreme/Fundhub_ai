import { test } from "node:test";
import assert from "node:assert/strict";
import { looksHostileOrBrushOff, earnsCoupon } from "./reply-gate.mjs";

test("looksHostileOrBrushOff: fuck off and variants", () => {
  assert.equal(looksHostileOrBrushOff("fuck off"), true);
  assert.equal(looksHostileOrBrushOff("Nah go fuck yourself"), true);
  assert.equal(looksHostileOrBrushOff("go fuck yourself"), true);
  assert.equal(looksHostileOrBrushOff("leave me alone"), true);
  assert.equal(looksHostileOrBrushOff("not interested"), true);
  assert.equal(looksHostileOrBrushOff("stop texting me"), true);
  assert.equal(looksHostileOrBrushOff("nah"), true);
  assert.equal(looksHostileOrBrushOff("whatever"), true);
});

test("looksHostileOrBrushOff: a real concern is not a brush-off", () => {
  assert.equal(looksHostileOrBrushOff("I was worried about getting burned"), false);
  assert.equal(looksHostileOrBrushOff("price felt high"), false);
  assert.equal(looksHostileOrBrushOff("What's included?"), false);
});

test("earnsCoupon: fuck off / nah go fuck yourself do not earn", async () => {
  assert.equal(await earnsCoupon("fuck off"), false);
  assert.equal(await earnsCoupon("Nah go fuck yourself"), false);
});

test("earnsCoupon: a normal answer earns", async () => {
  assert.equal(await earnsCoupon("I was worried about getting burned"), true);
  assert.equal(await earnsCoupon("price felt high"), true);
});

test("earnsCoupon: ambiguous short leftover uses the model when provided", async () => {
  let called = 0;
  const block = await earnsCoupon("meh", {
    callModelFn: async () => {
      called += 1;
      return { mode: "live", text: "BLOCK" };
    }
  });
  assert.equal(block, false);
  assert.equal(called, 1);

  const allow = await earnsCoupon("fees", {
    callModelFn: async () => ({ mode: "live", text: "ALLOW" })
  });
  // "fees" hits CONCERN_RE — no model needed
  assert.equal(allow, true);
});
