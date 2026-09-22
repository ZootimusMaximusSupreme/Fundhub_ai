// Every transition, named one at a time.
//
// A table-driven "for each state, for each state" loop would pass just as
// happily against a machine that allowed everything, because the expectation
// would be derived from the same table the code reads. So the legal moves are
// written out by hand below, from docs/video-pipeline-plan.md §5, and the
// illegal ones are checked as a set difference against them.
//
// PURE — no database. This file runs on a laptop with no Postgres, which is
// what makes it the only proof this unit actually has today.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  STATES, TRANSITIONS, TERMINAL_STATES, WORKING_STATES, HUMAN_ONLY, STATE_MEANING,
  isState, isTerminal, isHumanOnly, canTransition, nextStates,
  transition, AdVideoStateError
} from "./states.mjs";

/* THE DIAGRAM, TYPED OUT BY HAND. If this list and TRANSITIONS ever disagree,
   one of them is wrong and this file says which move it was. */
const LEGAL = [
  ["scripted", "filming"],
  ["filming", "raw_landed"],
  ["raw_landed", "staged"],
  ["staged", "transcribed"],
  ["transcribed", "matched"],
  ["matched", "editing"],
  ["editing", "rendered"],
  ["rendered", "awaiting_approval"],
  ["awaiting_approval", "approved"],
  ["awaiting_approval", "rejected"],
  ["approved", "delivered"],
  ["failed", "staged"],
  // "any worker error" — the plan's state table, not its diagram. See the
  // header of states.mjs, note 1.
  ["scripted", "failed"],
  ["filming", "failed"],
  ["raw_landed", "failed"],
  ["staged", "failed"],
  ["transcribed", "failed"],
  ["matched", "failed"],
  ["editing", "failed"],
  ["rendered", "failed"],
  ["awaiting_approval", "failed"],
  ["approved", "failed"]
];

const legalSet = new Set(LEGAL.map(([f, t]) => `${f}>${t}`));

describe("ad video states — the list itself", () => {
  test("there are exactly the thirteen states the plan names, in pipeline order", () => {
    assert.deepEqual(STATES, [
      "scripted", "filming", "raw_landed", "staged", "transcribed", "matched",
      "editing", "rendered", "awaiting_approval", "approved", "delivered",
      "rejected", "failed"
    ]);
  });

  test("every state carries a plain-language meaning and what fires it", () => {
    // Chris does not read code. "editing" on its own says nothing; the screen
    // renders these, so a state with no words is a state he cannot act on.
    for (const s of STATES) {
      assert.ok(STATE_MEANING[s], `${s} has no meaning`);
      assert.ok(STATE_MEANING[s].meaning.length > 5, `${s}'s meaning is too thin`);
      // Not a length rule. The plan's answer for `rejected` is the single word
      // "Chris", and that is a complete answer — a longer one would be padding.
      assert.ok(STATE_MEANING[s].firedBy.trim() !== "", `${s} does not say what fires it`);
    }
    assert.equal(Object.keys(STATE_MEANING).length, STATES.length);
  });

  test("every state has a transition entry, so none is a hole", () => {
    for (const s of STATES) {
      assert.ok(Array.isArray(TRANSITIONS[s]), `${s} has no transition list at all`);
    }
    assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...STATES].sort());
  });

  test("isState knows the thirteen and refuses everything else", () => {
    for (const s of STATES) assert.equal(isState(s), true, s);
    for (const junk of ["", null, undefined, "APPROVED", "done", "pending", "approved "]) {
      assert.equal(isState(junk), false, String(junk));
    }
  });
});

describe("ad video states — every legal move", () => {
  for (const [from, to] of LEGAL) {
    test(`${from} → ${to} is allowed`, () => {
      const by = HUMAN_ONLY.includes(to) ? "human" : "worker";
      assert.equal(canTransition(from, to), true);
      assert.equal(transition(from, to, { by }), to);
    });
  }

  test("the code allows no move the diagram does not", () => {
    const extra = [];
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) if (!legalSet.has(`${from}>${to}`)) extra.push(`${from} → ${to}`);
    }
    assert.deepEqual(extra, [],
      `these moves exist in code and not in docs/video-pipeline-plan.md §5: ${extra.join(", ")}`);
  });
});

describe("ad video states — every illegal move is refused", () => {
  test("every from/to pair not on the list throws, and says what IS allowed", () => {
    let checked = 0;
    for (const from of STATES) {
      for (const to of STATES) {
        if (from === to) continue;
        if (legalSet.has(`${from}>${to}`)) continue;
        checked += 1;
        assert.equal(canTransition(from, to), false, `${from} → ${to} should not be allowed`);
        assert.throws(
          () => transition(from, to, { by: "human" }),
          (err) => {
            assert.ok(err instanceof AdVideoStateError, `${from} → ${to} threw the wrong type`);
            assert.equal(err.code, "illegal_transition", `${from} → ${to}`);
            assert.equal(err.from, from);
            assert.equal(err.to, to);
            return true;
          },
          `${from} → ${to} was not refused`
        );
      }
    }
    // 13 states, 156 ordered pairs, 22 legal ones.
    assert.equal(checked, 13 * 12 - LEGAL.length);
    assert.equal(checked, 134);
  });

  test("the message names the moves that ARE possible, so the fix is in the error", () => {
    try {
      transition("staged", "delivered");
      assert.fail("should have thrown");
    } catch (err) {
      assert.match(err.message, /transcribed/);
      assert.match(err.message, /failed/);
      assert.deepEqual(err.allowed, ["transcribed", "failed"]);
    }
  });
});

describe("ad video states — the dead ends", () => {
  test("delivered and rejected are the only ones nothing leaves", () => {
    const dead = STATES.filter((s) => TRANSITIONS[s].length === 0);
    assert.deepEqual(dead.sort(), ["delivered", "rejected"]);
    assert.deepEqual([...TERMINAL_STATES].sort(), ["delivered", "rejected"]);
    for (const s of TERMINAL_STATES) assert.equal(isTerminal(s), true);
    assert.equal(isTerminal("failed"), false, "failed retries; it is not the end");
  });

  test("rejected does NOT move back to filming — a re-film is a new row", () => {
    // The plan's diagram draws rejected → filming. That arrow is store.mjs's
    // nextTake(), not this row moving backwards: one row is one take and
    // take_no is never renumbered (389's header). If somebody ever "fixes" the
    // machine to match the picture, this is the test that argues back.
    assert.equal(canTransition("rejected", "filming"), false);
    assert.throws(() => transition("rejected", "filming", { by: "human" }), (err) => {
      assert.equal(err.code, "illegal_transition");
      assert.match(err.message, /new row at the next take number/);
      return true;
    });
  });

  test("delivered is the end of the line and says so", () => {
    assert.throws(() => transition("delivered", "approved"), (err) => {
      assert.equal(err.code, "illegal_transition");
      assert.match(err.message, /end of the line/);
      return true;
    });
  });
});

describe("ad video states — failure and retry", () => {
  test("every state a worker acts on can fail", () => {
    for (const s of WORKING_STATES) {
      assert.equal(canTransition(s, "failed"), true, `${s} cannot record a failure`);
    }
  });

  test("a failure retries at staged, the last step whose input still exists", () => {
    assert.deepEqual(nextStates("failed"), ["staged"]);
    assert.equal(transition("failed", "staged"), "staged");
  });

  test("a failure cannot jump straight back to where it broke", () => {
    for (const s of ["transcribed", "matched", "editing", "rendered", "awaiting_approval"]) {
      assert.equal(canTransition("failed", s), false, `failed → ${s} must not be allowed`);
    }
  });
});

describe("ad video states — only a person approves", () => {
  test("approved and rejected are the human-only moves", () => {
    assert.deepEqual([...HUMAN_ONLY].sort(), ["approved", "rejected"]);
    for (const s of HUMAN_ONLY) assert.equal(isHumanOnly(s), true);
  });

  for (const to of ["approved", "rejected"]) {
    test(`a worker cannot move a take to ${to}`, () => {
      // The whole pipeline exists so Chris touches exactly two things. A worker
      // approving his own unwatched video is the one failure nobody would
      // notice until Paul had already run the ad.
      assert.throws(() => transition("awaiting_approval", to), (err) => {
        assert.equal(err.code, "human_only");
        assert.match(err.message, /only a person/);
        return true;
      });
      assert.throws(() => transition("awaiting_approval", to, { by: "worker" }), /only a person/);
      assert.equal(transition("awaiting_approval", to, { by: "human" }), to);
    });
  }

  test("a person may still cause an ordinary worker move", () => {
    // by:"human" narrows nothing else — it only unlocks the two above.
    assert.equal(transition("approved", "delivered", { by: "human" }), "delivered");
  });
});

describe("ad video states — the edges", () => {
  test("a state that does not exist is its own error, not an illegal move", () => {
    for (const [from, to] of [["nope", "filming"], ["filming", "nope"], [null, "filming"], ["filming", undefined]]) {
      assert.throws(() => transition(from, to), (err) => {
        assert.equal(err.code, "unknown_state", `${from} → ${to}`);
        return true;
      });
    }
  });

  test("moving to the state it is already in is refused, not quietly allowed", () => {
    // A worker re-running its own step should read the row, see it is already
    // there and stop. Rewriting the same state would move updated_at and make
    // the row claim something happened.
    for (const s of STATES) {
      assert.throws(() => transition(s, s, { by: "human" }), (err) => {
        assert.equal(err.code, "already_there", s);
        return true;
      });
    }
  });

  test("nextStates hands back a copy, so a caller cannot edit the machine", () => {
    const got = nextStates("staged");
    got.push("delivered");
    assert.deepEqual(nextStates("staged"), ["transcribed", "failed"]);
  });

  test("nextStates on an unknown state is empty rather than a throw", () => {
    assert.deepEqual(nextStates("nope"), []);
    assert.deepEqual(nextStates(undefined), []);
  });

  test("the exported lists are frozen", () => {
    assert.throws(() => { STATES.push("nope"); }, TypeError);
    assert.throws(() => { TRANSITIONS.staged = []; }, TypeError);
  });
});

describe("ad video states — the whole happy path, end to end", () => {
  test("a take walks scripted → delivered one legal move at a time", () => {
    const path = [
      "scripted", "filming", "raw_landed", "staged", "transcribed", "matched",
      "editing", "rendered", "awaiting_approval", "approved", "delivered"
    ];
    let at = path[0];
    for (const to of path.slice(1)) {
      at = transition(at, to, { by: isHumanOnly(to) ? "human" : "worker" });
    }
    assert.equal(at, "delivered");
    assert.equal(isTerminal(at), true);
  });

  test("a rejected take ends at rejected and goes no further", () => {
    let at = transition("rendered", "awaiting_approval");
    at = transition(at, "rejected", { by: "human" });
    assert.deepEqual(nextStates(at), []);
  });
});
