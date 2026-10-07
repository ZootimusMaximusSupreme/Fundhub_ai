// Pure tests for the stage arrows. No database. The pg test
// (src/http/yesdoor-placements.pg.test.mjs) compares this table to the database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ARROWS, stageMoveOk, OPEN_STAGES, BUILDING_STAGES, badMoveMessage } from "./stages.mjs";

const ALL = ["booked", "registered", "toured", "no_show", "applied", "approved", "denied", "lease_signed",
  "moved_in", "invoiced", "paid", "safe", "refunded", "cancelled"];

test("stages: exactly the arrows, in one direction", () => {
  for (const from of ALL) {
    for (const to of ALL) {
      const listed = ARROWS.some(([a, b]) => a === from && b === to);
      assert.equal(stageMoveOk(from, to), listed, `${from} -> ${to}`);
    }
  }
  assert.equal(ARROWS.length, 15);
});

test("stages: nothing moves backward and the finals have no way out", () => {
  for (const [a, b] of ARROWS) assert.equal(stageMoveOk(b, a), false, `${b} -> ${a}`);
  for (const final of ["no_show", "denied", "safe", "refunded", "cancelled"]) {
    for (const to of ALL) assert.equal(stageMoveOk(final, to), false, `${final} -> ${to}`);
  }
});

test("stages: the open ones are the ones that count toward the cap of 3", () => {
  assert.deepEqual([...OPEN_STAGES], ["booked", "registered", "toured", "applied", "approved", "lease_signed"]);
  for (const s of OPEN_STAGES) assert.ok(ALL.includes(s));
});

test("stages: a building can set only the stages that belong to it", () => {
  assert.deepEqual([...BUILDING_STAGES].sort(),
    ["applied", "approved", "denied", "lease_signed", "moved_in", "no_show", "refunded", "toured"]);
  for (const s of ["booked", "registered", "invoiced", "paid", "safe", "cancelled"]) {
    assert.ok(!BUILDING_STAGES.includes(s), `${s} is not the building's to set`);
  }
});

test("stages: the refusal reads like a sentence", () => {
  assert.equal(badMoveMessage("toured", "moved_in"), 'A renter cannot move from "toured" to "moved in".');
});
