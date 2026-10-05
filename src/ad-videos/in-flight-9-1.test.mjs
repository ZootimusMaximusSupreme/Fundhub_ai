// The one-off move for takes caught mid-pipeline when the order changed
// (spec §9.1 "Rows already in flight"). Pure: rows in, plan out.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planRow, planMoves, MASTER_STATES } from "./in-flight-9-1.mjs";
import { STATES } from "./states.mjs";

describe("rows already in flight", () => {
  test("editing and transcribed go back to raw_landed, with the old project kept in the note", () => {
    for (const status of ["editing", "transcribed"]) {
      const p = planRow({ id: "a", status, submagic_project_id: "proj-1" });
      assert.equal(p.to, "raw_landed");
      assert.match(p.note, /proj-1/);
    }
  });

  test("staged and matched with no export go back to raw_landed", () => {
    for (const status of ["staged", "matched"]) {
      assert.equal(planRow({ id: "a", status }).to, "raw_landed");
    }
  });

  test("matched WITH an export goes to editing, so the paid export is polled", () => {
    const p = planRow({ id: "a", status: "matched", exported_at: "2026-09-24T00:00:00Z" });
    assert.equal(p.to, "editing");
  });

  test("a row that already holds a render is left for a person", () => {
    const p = planRow({ id: "a", status: "editing", rendered_at: "2026-09-24T00:00:00Z" });
    assert.equal(p.to, null);
    assert.match(p.note, /person/);
  });

  test("every other state is left alone", () => {
    for (const status of ["raw_landed", "failed", "rendered", "awaiting_approval", "approved", "delivered", "rejected"]) {
      assert.equal(planRow({ id: "a", status }), null, status);
    }
  });

  test("two takes of one ad in a master state are reported, never chosen between", () => {
    const { moves, doubleMasters } = planMoves([
      { id: "a", org_id: "o", ad_id: "84", take_no: 1, status: "awaiting_approval" },
      { id: "b", org_id: "o", ad_id: "84", take_no: 2, status: "awaiting_approval" },
      { id: "c", org_id: "o", ad_id: "85", take_no: 1, status: "awaiting_approval" },
      { id: "d", org_id: "o", ad_id: null, status: "editing" }
    ]);
    assert.equal(moves.length, 1);
    assert.deepEqual(doubleMasters.map((d) => d.ad_id), ["84"]);
    assert.equal(doubleMasters[0].takes.length, 2);
  });

  test("every state named here is a real state", () => {
    for (const s of MASTER_STATES) assert.ok(STATES.includes(s), s);
  });
});
