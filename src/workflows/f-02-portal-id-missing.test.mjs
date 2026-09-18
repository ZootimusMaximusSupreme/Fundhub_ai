import { test } from "node:test";
import assert from "node:assert";
import { handle, EMAIL_TEMPLATE_KEY, SMS_TEMPLATE_KEY, EMAIL_FOLLOWUP_TEMPLATE_KEY } from "./f-02-portal-id-missing.mjs";
import { pgFake, fakeStep, ev } from "./test-support.mjs";

const withTemplates = () => [
  { org_id: "org-1", template_key: EMAIL_TEMPLATE_KEY, channel: "email", body: "id needed", compliance_passed: true },
  { org_id: "org-1", template_key: SMS_TEMPLATE_KEY, channel: "sms", body: "id needed sms", compliance_passed: true },
  { org_id: "org-1", template_key: EMAIL_FOLLOWUP_TEMPLATE_KEY, channel: "email", body: "still missing", compliance_passed: true }
];

test("happy path: still missing at both checks — nudge + follow-up sent, tagged", async () => {
  const db = pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: false } }], templates: withTemplates() });
  const res = await handle({ event: ev("round.started", {}, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.resolved, false);
  assert.equal(res.email1.sent, true);
  assert.equal(res.sms1.sent, true);
  assert.equal(res.email2.sent, true);
  assert.deepEqual(db.clients[0].tags, ["docs:missing"]);
  assert.equal(db.messages.length, 3);
});

test("branch: already complete at the first check — no send, no tag", async () => {
  const db = pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: true, portal_onboarding_status: "Complete" } }], templates: withTemplates() });
  const res = await handle({ event: ev("round.started", {}, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.resolved, true);
  assert.equal(res.atCheck, 1);
  assert.equal(db.messages.length, 0);
});

test("branch: uploaded between the first nudge and the follow-up — tag cleared, no follow-up sent", async () => {
  const clients = [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: false } }];
  const db = pgFake({ clients, templates: withTemplates() });
  // fakeStep's sleep is a no-op, so simulate "docs arrived mid-wait" by flipping the
  // fake's own state right before the handler's post-first-wait steps run — a custom
  // step fake that mutates state exactly once, between the two sleeps.
  let flips = 0;
  const step = {
    run: (_id, fn) => fn(),
    sleep: async () => { flips += 1; if (flips === 2) { clients[0].custom_fields.id_uploaded = true; clients[0].custom_fields.portal_onboarding_status = "Complete"; } }
  };
  const res = await handle({ event: ev("round.started", {}, { clientId: "cl-1" }), db, step });
  assert.equal(res.resolved, true);
  assert.equal(res.atCheck, 2);
  assert.equal(db.clients[0].custom_fields.last_progress_action, "docs_uploaded");
  assert.equal(db.clients[0].tags.includes("docs:missing"), false);
});

// The source is: trigger on F1 Funding Intake -> wait 2-4h -> gate -> send ->
// wait 2 DAYS -> recheck -> follow-up if still missing. The second wait and its
// recheck are the part most easily lost in a port (they sit after the first send,
// which looks like the end of the workflow), so the structure is pinned here
// rather than left to be re-derived by reading.
test("structure: both waits are present, in order, with the second at 2 days", async () => {
  const db = pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: false } }], templates: withTemplates() });
  const sleeps = [];
  const runs = [];
  const step = {
    run: (id, fn) => { runs.push(id); return fn(); },
    sleep: async (id, duration) => { sleeps.push({ id, duration }); }
  };
  await handle({ event: ev("round.started", {}, { clientId: "cl-1" }), db, step });

  assert.deepEqual(sleeps, [
    { id: "wait-initial", duration: "3h" },   // the 2-4h range, midpoint
    { id: "wait-followup", duration: "2d" }   // the second wait — must not go missing
  ]);

  // A recheck on each side of the second wait, and the follow-up after it.
  assert.ok(runs.indexOf("check-missing-1") < runs.indexOf("check-missing-2"), "two distinct rechecks");
  assert.ok(runs.indexOf("send-email-1") < runs.indexOf("check-missing-2"), "the recheck follows the first send");
  assert.ok(runs.indexOf("check-missing-2") < runs.indexOf("send-followup-email"), "the follow-up is gated on the recheck");
});

test("structure: the follow-up uses its own template, never a repeat of the first touch", async () => {
  const db = pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: false } }], templates: withTemplates() });
  await handle({ event: ev("round.started", {}, { clientId: "cl-1" }), db, step: fakeStep() });
  const emails = db.messages.filter((m) => m.channel === "email").map((m) => m.template_key);
  assert.deepEqual(emails, [EMAIL_TEMPLATE_KEY, EMAIL_FOLLOWUP_TEMPLATE_KEY]);
});

// Hole 12 (2026-09-18). On #8 this step wrote "Collect Documents" while three
// inquiry-removal cases were still open, so the saved line disagreed with the
// control panel's "Remove Inquiries". The fake answers the same active-case
// lookup the panel's own read uses.
function withInquiryCases(db, cases) {
  const base = db.query.bind(db);
  db.query = async (sql, params = []) => {
    if (/FROM inquiry_removal_cases/.test(sql)) {
      const [, clientId, active] = params;
      return { rows: cases.filter((c) => c.client_id === clientId && active.includes(c.case_status)) };
    }
    return base(sql, params);
  };
  return db;
}

test("saved next action: an open inquiry case keeps Remove Inquiries, not Collect Documents", async () => {
  const db = withInquiryCases(
    pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: false } }], templates: withTemplates() }),
    [{ id: "case-1", client_id: "cl-1", case_status: "Queued" }]
  );
  await handle({ event: ev("round.started", {}, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(db.clients[0].custom_fields.employee_next_action, "Remove Inquiries");
  assert.deepEqual(db.clients[0].tags, ["docs:missing"], "the paperwork tag is still set");
  assert.equal(db.messages.length, 3, "the nudge still goes out");
});

test("saved next action: no open inquiry case still says Collect Documents", async () => {
  const db = withInquiryCases(
    pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: false } }], templates: withTemplates() }),
    [{ id: "case-1", client_id: "cl-1", case_status: "Completed" }]
  );
  await handle({ event: ev("round.started", {}, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(db.clients[0].custom_fields.employee_next_action, "Collect Documents");
});

test("duplicate delivery: replaying the same event does not double-send", async () => {
  const db = pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: { id_uploaded: false } }], templates: withTemplates() });
  const event = ev("round.started", {}, { id: "evt-dup-f02", clientId: "cl-1" });
  await handle({ event, db, step: fakeStep() });
  await handle({ event, db, step: fakeStep() });
  assert.equal(db.messages.length, 3);
});
