// The state machine, and in particular the one rule it exists to enforce:
// nothing but a person moves a take to approved or rejected.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  AD_VIDEO_STATES,
  DECIDABLE_STATE,
  DECISIONS,
  canTransition,
  decisionTransition,
  normaliseDecision,
  isAdVideoState,
  isAwaitingPerson
} from "./ad-video.mjs";

describe("the list of states", () => {
  test("holds every state the plan names, and nothing else", () => {
    // docs/video-pipeline-plan.md §2. If this list changes, the plan's table
    // and 389's CHECK constraint have to change with it.
    assert.deepEqual([...AD_VIDEO_STATES], [
      "scripted", "filming", "raw_landed", "staged", "transcribed", "matched",
      "editing", "rendered", "awaiting_approval", "approved", "delivered",
      "rejected", "failed"
    ]);
  });

  test("isAdVideoState refuses anything not on it", () => {
    assert.equal(isAdVideoState("approved"), true);
    assert.equal(isAdVideoState("Approved"), false, "case is not forgiven for a stored value");
    assert.equal(isAdVideoState("done"), false);
    assert.equal(isAdVideoState(""), false);
    assert.equal(isAdVideoState(null), false);
  });
});

describe("worker transitions", () => {
  test("walk the conveyor belt the plan draws", () => {
    const belt = [
      ["scripted", "filming"], ["filming", "raw_landed"], ["raw_landed", "staged"],
      ["staged", "transcribed"], ["transcribed", "matched"], ["matched", "editing"],
      ["editing", "rendered"], ["rendered", "awaiting_approval"],
      ["approved", "delivered"]
    ];
    for (const [from, to] of belt) {
      assert.equal(canTransition(from, to), true, `${from} → ${to} should be allowed`);
    }
  });

  test("a step cannot be skipped", () => {
    assert.equal(canTransition("scripted", "rendered"), false);
    assert.equal(canTransition("raw_landed", "editing"), false);
    assert.equal(canTransition("delivered", "approved"), false);
  });

  test("failed retries from staged, as the diagram says", () => {
    assert.equal(canTransition("failed", "staged"), true);
  });

  test("a rejected take is never revived in place", () => {
    // The plan's §4 naming depends on take numbers never being reused, so a
    // re-film is a NEW row, not this one moving backwards.
    for (const s of AD_VIDEO_STATES) {
      assert.equal(canTransition("rejected", s), false, `rejected → ${s} must be refused`);
    }
  });

  test("*** NO WORKER MOVE EVER REACHES approved OR rejected ***", () => {
    // The single most important assertion in this file. The plan says "Chris.
    // Only a person may do this", and canTransition() is what a worker asks.
    for (const from of AD_VIDEO_STATES) {
      assert.equal(canTransition(from, "approved"), false,
        `${from} → approved must be impossible for a worker`);
      assert.equal(canTransition(from, "rejected"), false,
        `${from} → rejected must be impossible for a worker`);
    }
  });

  test("junk is refused, not guessed at", () => {
    assert.equal(canTransition("scripted", "banana"), false);
    assert.equal(canTransition(undefined, "staged"), false);
    assert.equal(canTransition("staged", null), false);
  });
});

describe("normaliseDecision", () => {
  test("forgives case and padding", () => {
    assert.equal(normaliseDecision("approve"), "approve");
    assert.equal(normaliseDecision("  REJECT "), "reject");
  });

  test("refuses a state name, so decision=delivered cannot be written through", () => {
    assert.equal(normaliseDecision("delivered"), null);
    assert.equal(normaliseDecision("approved"), null);
    assert.equal(normaliseDecision("yes"), null);
    assert.equal(normaliseDecision(""), null);
    assert.equal(normaliseDecision(null), null);
  });

  test("is not fooled by a prototype key", () => {
    assert.equal(normaliseDecision("constructor"), null);
    assert.equal(normaliseDecision("toString"), null);
    assert.equal(normaliseDecision("__proto__"), null);
  });
});

describe("decisionTransition — the person-only half", () => {
  test("approve from awaiting_approval lands on approved", () => {
    assert.deepEqual(decisionTransition("awaiting_approval", "approve"), { ok: true, next: "approved" });
  });

  test("reject from awaiting_approval lands on rejected", () => {
    assert.deepEqual(decisionTransition("awaiting_approval", "reject"), { ok: true, next: "rejected" });
  });

  test("refuses from every other state", () => {
    for (const from of AD_VIDEO_STATES.filter((s) => s !== DECIDABLE_STATE)) {
      for (const d of Object.keys(DECISIONS)) {
        const out = decisionTransition(from, d);
        assert.equal(out.ok, false, `${from} + ${d} must be refused`);
        assert.ok(out.reason, "a refusal carries a reason for the log");
      }
    }
  });

  test("a second decision on an already-approved take is refused", () => {
    // This is the state-machine half of the replay guard. The atomic half is
    // the conditional UPDATE in decision-store.mjs.
    assert.equal(decisionTransition("approved", "reject").ok, false);
    assert.equal(decisionTransition("rejected", "approve").ok, false);
  });

  test("refuses a decision word it does not know", () => {
    assert.equal(decisionTransition("awaiting_approval", "delivered").ok, false);
    assert.equal(decisionTransition("awaiting_approval", "").ok, false);
  });

  test("refuses an unknown from-state", () => {
    assert.equal(decisionTransition("banana", "approve").ok, false);
  });
});

test("isAwaitingPerson is true only for the one state", () => {
  assert.equal(isAwaitingPerson("awaiting_approval"), true);
  assert.equal(isAwaitingPerson("rendered"), false);
  assert.equal(isAwaitingPerson("approved"), false);
});
