import { test } from "node:test";
import assert from "node:assert";
import { handle, EMAIL_TEMPLATE_KEY, SMS_TEMPLATE_KEY, EMAIL_NOSHOW_02, SMS_NOSHOW_02 } from "./s-05a-no-show-recovery.mjs";
import { pgFake, fakeStep as pgStep, ev } from "./test-support.mjs";

function fakeStep() {
  return { run: (_id, fn) => fn(), sleep: async () => {}, sleepUntil: async () => {} };
}

function fakeDb({ clientId = "cl-1" } = {}) {
  const tags = [];
  const tasks = [];
  const messages = [];
  return {
    tags, tasks, messages,
    query(sql, params) {
      if (/FROM clients/i.test(sql) && /email/i.test(sql)) {
        return { rows: clientId ? [{ id: clientId }] : [] };
      }
      if (/INSERT INTO clients/i.test(sql)) return { rows: [{ id: clientId }] };
      if (/UPDATE clients SET tags/i.test(sql) || /custom_fields/i.test(sql)) {
        if (Array.isArray(params?.[1])) tags.push(...params[1]);
        return { rows: [] };
      }
      if (/INSERT INTO tasks/i.test(sql)) {
        const row = { id: `task-${tasks.length + 1}` };
        tasks.push(row);
        return { rows: [row] };
      }
      if (/SELECT id FROM tasks/i.test(sql)) return { rows: [] };
      if (/message_templates|INSERT INTO messages/i.test(sql)) {
        messages.push(params);
        return { rows: [{ id: `msg-${messages.length}` }] };
      }
      return { rows: [] };
    }
  };
}

test("s-05a: no client → done false", async () => {
  const db = fakeDb({ clientId: null });
  db.query = async () => ({ rows: [] });
  const res = await handle({
    event: { id: "e1", orgId: "org-1", payload: { email: "missing@x.com" } },
    db,
    step: fakeStep()
  });
  assert.equal(res.done, false);
});

test("s-05a: tags, templates keys, recovery task", async () => {
  const db = fakeDb();
  const res = await handle({
    event: { id: "e2", orgId: "org-1", clientId: "cl-1", payload: { bookingUid: "b1" } },
    db,
    step: fakeStep()
  });
  assert.equal(res.done, true);
  assert.equal(EMAIL_TEMPLATE_KEY, "EMAIL-S05A-NOSHOW-RECOVERY");
  assert.equal(SMS_TEMPLATE_KEY, "SMS-S05A-NOSHOW-RECOVERY");
  assert.ok(res.task);
});

test("s-05a: four touches when they never rebook", async () => {
  const db = pgFake({
    clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: {} }],
    templates: [
      { org_id: "org-1", template_key: EMAIL_TEMPLATE_KEY, channel: "email", body: "t1e", compliance_passed: true },
      { org_id: "org-1", template_key: SMS_TEMPLATE_KEY, channel: "sms", body: "t1s", compliance_passed: true },
      { org_id: "org-1", template_key: EMAIL_NOSHOW_02, channel: "email", body: "t2e", compliance_passed: true },
      { org_id: "org-1", template_key: SMS_NOSHOW_02, channel: "sms", body: "t2s", compliance_passed: true },
      { org_id: "org-1", template_key: "EMAIL-S05A-NOSHOW-03", channel: "email", body: "t3e", compliance_passed: true },
      { org_id: "org-1", template_key: "SMS-S05A-NOSHOW-03", channel: "sms", body: "t3s", compliance_passed: true },
      { org_id: "org-1", template_key: "EMAIL-S05A-NOSHOW-04", channel: "email", body: "t4e", compliance_passed: true },
      { org_id: "org-1", template_key: "SMS-S05A-NOSHOW-04", channel: "sms", body: "t4s", compliance_passed: true }
    ]
  });
  const res = await handle({
    event: ev("booking.noshow", { bookingUid: "b1" }, { clientId: "cl-1" }),
    db, step: pgStep()
  });
  assert.equal(res.done, true);
  assert.equal(db.messages.length, 8);
  assert.equal(db.tasks.length, 1);
});

test("s-05a: stops before touch 2 if they rebook", async () => {
  const db = pgFake({
    clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: {} }],
    templates: [
      { org_id: "org-1", template_key: EMAIL_TEMPLATE_KEY, channel: "email", body: "t1e", compliance_passed: true },
      { org_id: "org-1", template_key: SMS_TEMPLATE_KEY, channel: "sms", body: "t1s", compliance_passed: true }
    ]
  });
  const step = {
    run: async (id, fn) => {
      const out = await fn();
      if (id === "send-touch-1") db.events.push({ client_id: "cl-1", name: "booking.created" });
      return out;
    },
    sleep: async () => {}
  };
  const res = await handle({
    event: ev("booking.noshow", {}, { clientId: "cl-1" }),
    db, step
  });
  assert.equal(res.stoppedAt, "before-touch-2");
  assert.equal(db.messages.length, 2);
});

test("s-05a: original booking.created does not count as a rebook", async () => {
  const db = pgFake({
    clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: {} }],
    events: [{ client_id: "cl-1", name: "booking.created" }],
    templates: [
      { org_id: "org-1", template_key: EMAIL_TEMPLATE_KEY, channel: "email", body: "t1e", compliance_passed: true },
      { org_id: "org-1", template_key: SMS_TEMPLATE_KEY, channel: "sms", body: "t1s", compliance_passed: true },
      { org_id: "org-1", template_key: EMAIL_NOSHOW_02, channel: "email", body: "t2e", compliance_passed: true },
      { org_id: "org-1", template_key: SMS_NOSHOW_02, channel: "sms", body: "t2s", compliance_passed: true },
      { org_id: "org-1", template_key: "EMAIL-S05A-NOSHOW-03", channel: "email", body: "t3e", compliance_passed: true },
      { org_id: "org-1", template_key: "SMS-S05A-NOSHOW-03", channel: "sms", body: "t3s", compliance_passed: true },
      { org_id: "org-1", template_key: "EMAIL-S05A-NOSHOW-04", channel: "email", body: "t4e", compliance_passed: true },
      { org_id: "org-1", template_key: "SMS-S05A-NOSHOW-04", channel: "sms", body: "t4s", compliance_passed: true }
    ]
  });
  const res = await handle({
    event: ev("booking.noshow", { bookingUid: "b1" }, { clientId: "cl-1" }),
    db, step: pgStep()
  });
  assert.equal(res.done, true);
  assert.equal(res.stoppedAt, undefined);
  assert.equal(db.messages.length, 8);
});

// --- a closer logs, late, that they showed (owner-set 2026-10-05) -----------

const allTemplates = () => [
  { org_id: "org-1", template_key: EMAIL_TEMPLATE_KEY, channel: "email", body: "t1e", compliance_passed: true },
  { org_id: "org-1", template_key: SMS_TEMPLATE_KEY, channel: "sms", body: "t1s", compliance_passed: true },
  { org_id: "org-1", template_key: EMAIL_NOSHOW_02, channel: "email", body: "t2e", compliance_passed: true },
  { org_id: "org-1", template_key: SMS_NOSHOW_02, channel: "sms", body: "t2s", compliance_passed: true },
  { org_id: "org-1", template_key: "EMAIL-S05A-NOSHOW-03", channel: "email", body: "t3e", compliance_passed: true },
  { org_id: "org-1", template_key: "SMS-S05A-NOSHOW-03", channel: "sms", body: "t3s", compliance_passed: true },
  { org_id: "org-1", template_key: "EMAIL-S05A-NOSHOW-04", channel: "email", body: "t4e", compliance_passed: true },
  { org_id: "org-1", template_key: "SMS-S05A-NOSHOW-04", channel: "sms", body: "t4s", compliance_passed: true }
];
const START = "2026-10-05T18:00:00.000Z";

for (const [label, outcome, stopped] of [
  ["a late Deposit stops touches 2 to 4", "deposit", true],
  ["a late Not a fit stops touches 2 to 4", "not_a_fit", true],
  ["a closer's No show does not stop them", "no_show", false]
]) {
  test(`s-05a: ${label}`, async () => {
    const db = pgFake({ clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: {} }], templates: allTemplates() });
    const step = {
      run: async (id, fn) => {
        const out = await fn();
        // The closer logs 40 minutes after the missed call's start, after touch 1 went.
        if (id === "send-touch-1") db.callOutcomes.push({ client_id: "cl-1", outcome, logged_at: "2026-10-05T18:40:00.000Z" });
        return out;
      },
      sleep: async () => {}
    };
    const res = await handle({ event: ev("booking.noshow", { startTime: START, bookingUid: "b1" }, { clientId: "cl-1" }), db, step });
    if (stopped) {
      assert.equal(res.stoppedAt, "before-touch-2");
      assert.equal(res.reason, "closer_logged_showed");
      assert.equal(db.messages.length, 2, "only touch 1 (email + text) went out");
    } else {
      assert.equal(res.stoppedAt, undefined);
      assert.equal(db.messages.length, 8);
    }
  });
}

test("s-05a: a held call from before the missed one does not stop the texts", async () => {
  const db = pgFake({
    clients: [{ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields: {} }],
    templates: allTemplates(),
    callOutcomes: [{ client_id: "cl-1", outcome: "callback", logged_at: "2026-10-01T18:40:00.000Z" }]
  });
  const res = await handle({ event: ev("booking.noshow", { startTime: START, bookingUid: "b1" }, { clientId: "cl-1" }), db, step: pgStep() });
  assert.equal(res.stoppedAt, undefined);
  assert.equal(db.messages.length, 8);
});


