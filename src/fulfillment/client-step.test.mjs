/* The control panel's step, worked out in one place (hole 12, 2026-09-18).
 *
 * src/fulfillment/client-step.mjs is what both the control panel's own read
 * (api/dashboard/client.mjs) and the saved step (mergeCustomFields and the
 * catch-up job) ask. These tests prove shownStepLabel() gives the words the
 * panel paints, and gives nothing — never a blank, never a guess — when the
 * panel could not work its step out.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shownStepLabel } from "./client-step.mjs";
import { pgFake, withPanelReads } from "../workflows/test-support.mjs";

const ID = "11111111-2222-3333-4444-555555555555";
const ORG = "org-1";
const OPEN_CASE = { client_id: ID, case_status: "Queued", fraud_alert_after: null };

/* #8 on 2026-09-18: a funding client, report paid for and pulled, permission
   on file, inquiry cases still open. The panel said Remove Inquiries. */
const eight = (over = {}) => ({
  id: ID, org_id: ORG, outcome_tier: "FULL_FUNDING", tags: [],
  custom_fields: { crs_paid: true, employee_next_action: "Pull CRS" }, ...over
});

test("gives the panel's step: open inquiry case on a pulled, consented funding file → Remove Inquiries", async () => {
  const db = withPanelReads(pgFake({ clients: [eight()] }), () => ({ realCrs: 1, inquiryCases: [OPEN_CASE] }));
  assert.equal(await shownStepLabel(db, ID), "Remove Inquiries");
});

test("gives the panel's step: funding card on Apply Now → Apply for Funding", async () => {
  const db = withPanelReads(pgFake({ clients: [eight()] }), () => ({
    realCrs: 1, card: { pipeline_key: "funding_card_stacking", stage_key: "apply_now" }
  }));
  assert.equal(await shownStepLabel(db, ID), "Apply for Funding");
});

test("a patch is laid over the saved fields first, the way custom_fields || patch lands", async () => {
  const db = withPanelReads(pgFake({ clients: [eight()] }), () => ({ realCrs: 1, inquiryCases: [OPEN_CASE] }));
  assert.equal(
    await shownStepLabel(db, ID, { customFieldsPatch: { round_hold_reason: "Fraud Alert" } }),
    "Clear Fraud Alert",
    "a hold saved in the same write must count toward the step"
  );
  assert.equal(await shownStepLabel(db, ID), "Remove Inquiries", "the patch is not written anywhere");
});

test("null when the panel could not work it out (degraded) — never a blank", async () => {
  const db = withPanelReads(pgFake({ clients: [eight({ custom_fields: {} })] }), () => ({ consent: "throws" }));
  assert.equal(await shownStepLabel(db, ID), null);
});

test("null when the file is not there, and when the database throws — never throws itself", async () => {
  const empty = withPanelReads(pgFake({ clients: [] }));
  assert.equal(await shownStepLabel(empty, ID), null);
  const broken = { query: async () => { throw new Error("connection reset"); } };
  assert.equal(await shownStepLabel(broken, ID), null);
  assert.equal(await shownStepLabel(null, ID), null);
  assert.equal(await shownStepLabel(broken, ""), null);
});

test("it only reads: no statement it runs writes, inserts or deletes", async () => {
  const inner = pgFake({ clients: [eight()] });
  const seen = [];
  const db = withPanelReads(inner, () => ({ realCrs: 1, inquiryCases: [OPEN_CASE] }));
  const query = db.query;
  db.query = async (sql, params) => { seen.push(String(sql)); return query(sql, params); };
  await shownStepLabel(db, ID);
  assert.ok(seen.length > 0);
  for (const s of seen) assert.doesNotMatch(s, /\b(INSERT|UPDATE|DELETE)\b/i, s);
});

test("ONE TRUTH: the control panel's read works its step out through this file, not its own copy", () => {
  const handler = readFileSync(new URL("../../api/dashboard/client.mjs", import.meta.url), "utf8");
  assert.match(handler, /from "\.\.\/\.\.\/src\/fulfillment\/client-step\.mjs"/);
  assert.match(handler, /workOutClientStep\(/);
  assert.match(handler, /readClientStepRows\(/);
  assert.doesNotMatch(handler, /deriveNextAction\(/, "the handler must not work the step out itself");
  assert.doesNotMatch(handler, /gatherDetailSignals\(/, "the handler must not gather the step's signals itself");
  assert.doesNotMatch(handler, /FROM clients WHERE id = \$1 AND org_id = \$2/,
    "the client row the step reads must be read by the shared piece");
});
