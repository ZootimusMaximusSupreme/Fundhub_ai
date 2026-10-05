/* The two maps of this pipeline must agree.
 *
 * There are two, in two files, and on 2026-09-23 they disagreed:
 *
 *   src/ad-videos/pipeline.mjs  NEXT_STEP    — which step runs at which state
 *   src/ad-videos/states.mjs    TRANSITIONS  — which move that step is allowed
 *
 * TRANSITIONS was written from the original plan and never matched the pipeline
 * that got built. It said a take went staged -> transcribed -> matched ->
 * editing; the code goes staged -> editing -> transcribed -> matched. Nothing
 * noticed for as long as nothing ran end to end.
 *
 * Then the first real take ran. The upload worked, Submagic returned a project
 * id, and the pipeline threw `cannot go staged -> editing` while writing the
 * result down. The project was paid for and its id was thrown away, and the
 * take sat at `staged` looking like a vendor problem.
 *
 * This test is what makes that impossible to repeat: every status a step writes
 * must be a move the state machine allows from the state that step runs at.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NEXT_STEP } from "./pipeline.mjs";
import { TRANSITIONS, STATES } from "./states.mjs";

/* What each step actually writes, read off pipeline.mjs. Kept by hand on
   purpose: a list that regenerates itself from the thing it is checking proves
   nothing. Add a step, add its line here. */
/* REBUILT 2026-10-05 for the marketing-machine order (spec §9.1). The steps
   later parts of the spec build (prepare, transcribe, planCut, buildMaster,
   animate) are listed with what they WILL write, so the table already holds
   them to the machine the day they land. */
const STEP_WRITES = Object.freeze({
  prepare: ["prepared"],
  transcribe: ["transcribed"],
  matchAndRename: ["matched"],
  // a new master is cut; a later take of an ad that has one is merged into it
  planCut: ["cut", "merged"],
  // the master is built; or coverage under 50% sends it back to be matched again
  buildMaster: ["staged", "transcribed"],
  submagicCreate: ["editing"],
  captionAndExport: ["rendered"],
  animate: ["animated"],
  saveFinishedAndNotify: ["awaiting_approval"],
  deliverToPaul: ["delivered"]
});

describe("every step's result is a move the state machine allows", () => {
  for (const [state, step] of Object.entries(NEXT_STEP)) {
    test(`${state} runs ${step}, and every status it writes is legal from ${state}`, () => {
      const allowed = TRANSITIONS[state];
      assert.ok(allowed, `TRANSITIONS has no row for "${state}", but NEXT_STEP runs a step there`);

      const writes = STEP_WRITES[step];
      assert.ok(writes, `STEP_WRITES has no line for "${step}" — add it when you add a step`);

      for (const status of writes) {
        assert.ok(allowed.includes(status),
          `${step} runs at "${state}" and writes "${status}", but TRANSITIONS.${state} only allows ` +
          `${allowed.join(", ")}. This is the exact shape of the bug that lost a paid-for ` +
          `Submagic project on 2026-09-23.`);
      }

      assert.ok(allowed.includes("failed"),
        `a state a worker acts on must be able to fail, and "${state}" cannot`);
    });
  }

  test("every state a step writes is a real state", () => {
    for (const writes of Object.values(STEP_WRITES)) {
      for (const status of writes) {
        assert.ok(STATES.includes(status), `"${status}" is not a state`);
      }
    }
  });
});
