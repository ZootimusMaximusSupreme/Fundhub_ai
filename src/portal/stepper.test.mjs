// Portal 8-tick facts — booked is a booking, diagnostic is the assessment pay.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildPortalStepper, EMPTY_STEPPER, readPortalStepper } from "./stepper.mjs";

describe("buildPortalStepper", () => {
  test("empty input is all false and funding-shaped", () => {
    const s = buildPortalStepper({});
    assert.deepEqual(s, { ...EMPTY_STEPPER });
  });

  test("repair kind does not copy funding ticks into letter ticks", () => {
    const s = buildPortalStepper({
      kind: "repair",
      booked: true,
      diagnostic_paid: true,
      docs_received: true,
      letter_round: true,
      ready_to_send: true,
      round_funded: true
    });
    assert.equal(s.kind, "repair");
    assert.equal(s.letter_round, true);
    assert.equal(s.ready_to_send, true);
    assert.equal(s.round_funded, true, "raw flags stay; the screen hides capital-round ticks");
  });

  test("unknown kind falls back to funding", () => {
    assert.equal(buildPortalStepper({ kind: "combo" }).kind, "funding");
  });
});

describe("readPortalStepper", () => {
  test("missing db or ids returns empty, not booked", async () => {
    assert.deepEqual(await readPortalStepper(null, {}), { ...EMPTY_STEPPER });
    assert.deepEqual(await readPortalStepper({ query: async () => ({ rows: [{}] }) }, {}), {
      ...EMPTY_STEPPER
    });
  });

  test("a random succeeded payment does not light diagnostic_paid", async () => {
    const sql = [];
    const db = {
      query: async (q) => {
        sql.push(q);
        return {
          rows: [{
            booked_row: false,
            booked_event: false,
            sales_booked: false,
            diagnostic_event: false,
            sales_diagnostic: false,
            diagnostic_link: false,
            diagnostic_named_tx: false,
            docs_event: false,
            docs_upload: false,
            round_started_event: false,
            round_submitted_event: false,
            round_approved_event: false,
            round_funded_event: false,
            round_closeout_event: false,
            funding_round_status: null,
            funding_funded_amount: null,
            funding_stage: null,
            repair_stage: null,
            funding_entitlement: false,
            dispute_open: false,
            repair_letter_event: false
          }]
        };
      }
    };
    const s = await readPortalStepper(db, { orgId: "org", clientId: "cl", repairPath: false });
    assert.equal(s.booked, false);
    assert.equal(s.diagnostic_paid, false);
    assert.equal(s.kind, "funding");
    assert.match(sql[0], /business financial assessment/);
    assert.match(sql[0], /consulting services assessment/);
    assert.doesNotMatch(sql[0], /status = 'succeeded' LIMIT 1/);
  });

  test("funding round funded lights ticks 3–8 from stored round status", async () => {
    const db = {
      query: async () => ({
        rows: [{
          booked_row: true,
          booked_event: false,
          sales_booked: false,
          diagnostic_event: true,
          sales_diagnostic: false,
          diagnostic_link: false,
          diagnostic_named_tx: false,
          docs_event: true,
          docs_upload: false,
          round_started_event: false,
          round_submitted_event: false,
          round_approved_event: false,
          round_funded_event: false,
          round_closeout_event: true,
          funding_round_status: "funded",
          funding_funded_amount: "50000.00",
          funding_stage: "apply_now",
          repair_stage: null,
          funding_entitlement: true,
          dispute_open: false,
          repair_letter_event: false
        }]
      })
    };
    const s = await readPortalStepper(db, { orgId: "org", clientId: "cl", repairPath: false });
    assert.equal(s.kind, "funding");
    assert.equal(s.booked, true);
    assert.equal(s.diagnostic_paid, true);
    assert.equal(s.docs_received, true);
    assert.equal(s.round_started, true);
    assert.equal(s.round_submitted, true);
    assert.equal(s.round_approved, true);
    assert.equal(s.round_funded, true);
    assert.equal(s.file_finalized, true);
  });

  test("repair-only uses letter round and ready to send, not capital closeout", async () => {
    const db = {
      query: async () => ({
        rows: [{
          booked_row: true,
          booked_event: true,
          sales_booked: false,
          diagnostic_event: true,
          sales_diagnostic: false,
          diagnostic_link: false,
          diagnostic_named_tx: false,
          docs_event: true,
          docs_upload: false,
          round_started_event: false,
          round_submitted_event: false,
          round_approved_event: false,
          round_funded_event: false,
          round_closeout_event: false,
          funding_round_status: null,
          funding_funded_amount: null,
          funding_stage: null,
          repair_stage: "ready_to_send",
          funding_entitlement: false,
          dispute_open: true,
          repair_letter_event: false
        }]
      })
    };
    const s = await readPortalStepper(db, { orgId: "org", clientId: "cl", repairPath: true });
    assert.equal(s.kind, "repair");
    assert.equal(s.letter_round, true);
    assert.equal(s.ready_to_send, true);
    assert.equal(s.file_finalized, false);
    assert.equal(s.round_funded, false);
  });

  test("repair file finalized follows the optimization card", async () => {
    const db = {
      query: async () => ({
        rows: [{
          booked_row: true,
          diagnostic_event: true,
          docs_event: true,
          repair_stage: "program_complete",
          funding_entitlement: false,
          dispute_open: true,
          repair_letter_event: false
        }]
      })
    };
    const s = await readPortalStepper(db, { orgId: "org", clientId: "cl", repairPath: true });
    assert.equal(s.kind, "repair");
    assert.equal(s.file_finalized, true);
    assert.equal(s.ready_to_send, true);
  });

  test("a failed read is empty, not booked", async () => {
    const db = { query: async () => { throw new Error("boom"); } };
    const s = await readPortalStepper(db, { orgId: "org", clientId: "cl" });
    assert.deepEqual(s, { ...EMPTY_STEPPER });
    assert.equal(s.booked, false);
  });
});
