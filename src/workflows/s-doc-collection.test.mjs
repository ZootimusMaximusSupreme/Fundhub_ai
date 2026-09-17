import { test } from "node:test";
import assert from "node:assert";
import { handle, EMAIL_TEMPLATE_KEY, SMS_TEMPLATE_KEY } from "./s-doc-collection.mjs";
import { pgFake, fakeStep, ev } from "./test-support.mjs";
import { FUNDING_DOC_HOLD } from "../inquiry-ops/doc-gate.mjs";

const templates = () => [
  { org_id: "org-1", template_key: EMAIL_TEMPLATE_KEY, channel: "email", body: "docs", compliance_passed: true },
  { org_id: "org-1", template_key: SMS_TEMPLATE_KEY, channel: "sms", body: "docs sms", compliance_passed: true }
];

test("doc collection: deposit.paid sends request and closes the gate", async () => {
  const db = pgFake({
    clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: {} }],
    templates: templates()
  });
  const res = await handle({
    event: ev("deposit.paid", {}, { clientId: "cl-1" }),
    db, step: fakeStep()
  });
  assert.equal(res.done, true);
  assert.equal(db.clients[0].custom_fields.round_hold_reason, FUNDING_DOC_HOLD);
  assert.equal(db.clients[0].custom_fields.employee_next_action, "Collect Documents");
  assert.deepEqual(db.clients[0].tags, ["docs:missing"]);
  assert.deepEqual(db.messages.map((m) => m.template_key), [EMAIL_TEMPLATE_KEY, SMS_TEMPLATE_KEY]);
});

test("doc collection: second deposit.paid does not send again", async () => {
  const db = pgFake({
    clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: {} }],
    templates: templates()
  });
  const first = await handle({
    event: ev("deposit.paid", {}, { id: "evt-1", clientId: "cl-1" }),
    db, step: fakeStep()
  });
  const second = await handle({
    event: ev("deposit.paid", {}, { id: "evt-2", clientId: "cl-1" }),
    db, step: fakeStep()
  });
  assert.equal(first.done, true);
  assert.equal(second.done, false);
  assert.equal(second.reason, "already_locked");
  assert.equal(db.messages.length, 2);
});

/* GAP 20, live walk 2026-09-16. src/handlers/inquiry-docs.mjs sends the same
   DOC-01 message on inquiry.docs.needed and claims the SAME send lock, but it
   does not close the funding gate. When it won the race, this workflow returned
   early and clients.custom_fields never got a round_hold_reason — so "On Hold
   Because" on the Client Control Panel read a dash on a client who was on hold.
   The message must still only go once; the gate must close regardless. */
test("doc collection: the gate closes even when the other path already sent the message", async () => {
  const db = pgFake({
    clients: [{
      id: "cl-1", org_id: "org-1", email: "a@b.com",
      custom_fields: { doc_01_request_sent_at: "2026-09-16T17:46:53.619Z" }
    }],
    templates: templates()
  });

  const res = await handle({
    event: ev("deposit.paid", {}, { clientId: "cl-1" }),
    db, step: fakeStep()
  });

  assert.equal(res.done, false);
  assert.equal(res.reason, "already_locked", "the client is not asked for documents twice");
  assert.equal(db.messages.length, 0, "and no second message is written");

  assert.equal(db.clients[0].custom_fields.round_hold_reason, FUNDING_DOC_HOLD,
    "the funding gate must close even though this path lost the send race");
  assert.deepEqual(db.clients[0].tags, ["docs:missing"]);
});

test("doc collection: a replay does not re-close a gate that was already cleared", async () => {
  const db = pgFake({
    clients: [{
      id: "cl-1", org_id: "org-1", email: "a@b.com",
      custom_fields: {
        doc_01_request_sent_at: "2026-09-16T17:46:53.619Z",
        doc_gate_closed_at: "2026-09-16T17:46:53.619Z",
        round_hold_reason: null
      }
    }],
    templates: templates()
  });

  await handle({ event: ev("deposit.paid", {}, { clientId: "cl-1" }), db, step: fakeStep() });

  assert.equal(db.clients[0].custom_fields.round_hold_reason, null,
    "doc-check cleared this hold; a replayed deposit.paid must not put it back");
});
