import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eligibleForGenuineM1,
  handleM1,
  handleReply,
  SMS_M1_KEY,
  EMAIL_M1_KEY,
  SMS_M2_KEY,
  EMAIL_M2_KEY,
  SMS_DIG_KEY,
  LOCK_M1,
  LOCK_M2
} from "./slo-genuine-followup.mjs";
import { pgFake, fakeStep, ev } from "./test-support.mjs";

function templates() {
  return [
    { org_id: "org-1", template_key: SMS_M1_KEY, channel: "sms", body: "m1 sms", compliance_passed: true },
    { org_id: "org-1", template_key: EMAIL_M1_KEY, channel: "email", subject: "What almost stopped you?", body: "m1 email", compliance_passed: true },
    { org_id: "org-1", template_key: SMS_M2_KEY, channel: "sms", body: "m2 sms", compliance_passed: true },
    { org_id: "org-1", template_key: EMAIL_M2_KEY, channel: "email", subject: "One more question", body: "m2 email", compliance_passed: true }
  ];
}

/** pgFake plus the paid-diagnostic and resolveClient reads this workflow uses. */
function genuineDb(seed = {}) {
  const base = pgFake(seed);
  const paid = seed.paidDiagnostic || false;
  return {
    ...base,
    async query(sql, params = []) {
      if (/FROM payment_links pl/.test(sql) && /JOIN clients c/.test(sql)) {
        return { rows: paid ? [{ "?column?": 1 }] : [] };
      }
      if (/custom_fields->>\$2 AS m1/.test(sql)) {
        const c = base.clients.find((row) => row.id === params[0]);
        if (!c) return { rows: [] };
        const cf = c.custom_fields || {};
        return { rows: [{ m1: cf[params[1]] || null, m2: cf[params[2]] || null }] };
      }
      if (/SELECT id, ghl_contact_id FROM clients WHERE org_id/.test(sql)) {
        const c = base.clients.find(
          (row) => row.org_id === params[0]
            && String(row.email || "").toLowerCase() === String(params[1] || "").toLowerCase()
        );
        return { rows: c ? [{ id: c.id, ghl_contact_id: c.ghl_contact_id || null }] : [] };
      }
      if (/SELECT id, ghl_contact_id, email, phone, first_name, last_name/.test(sql)) {
        const c = base.clients.find((row) => row.id === params[0] && row.org_id === params[1]);
        return {
          rows: c
            ? [{
              id: c.id,
              ghl_contact_id: c.ghl_contact_id || "ghl-test",
              email: c.email || null,
              phone: c.phone || null,
              first_name: c.first_name || null,
              last_name: c.last_name || null
            }]
            : []
        };
      }
      if (/UPDATE clients SET\s+phone = COALESCE/.test(sql)) {
        const c = base.clients.find((row) => row.id === params[0]);
        if (c) {
          if (!c.phone && params[1]) c.phone = params[1];
          if (!c.first_name && params[2]) c.first_name = params[2];
          if (!c.last_name && params[3]) c.last_name = params[3];
        }
        return { rows: [] };
      }
      return base.query(sql, params);
    }
  };
}

const personPayload = {
  actor: "person",
  email: "pat@gmail.com",
  phone: "+14155550134",
  name: "Pat Lee"
};

test("eligibleForGenuineM1: person with phone and email passes", () => {
  assert.equal(eligibleForGenuineM1(personPayload).ok, true);
});

test("eligibleForGenuineM1: agent is skipped (no real customer text)", () => {
  assert.equal(eligibleForGenuineM1({ ...personPayload, actor: "agent" }).ok, false);
  assert.equal(eligibleForGenuineM1({ ...personPayload, email: "sam@fundhub.ai" }).ok, false);
  assert.equal(eligibleForGenuineM1({ ...personPayload, email: "e2e+sim@gmail.com" }).ok, false);
  assert.equal(eligibleForGenuineM1({ ...personPayload, email: "x@example.com" }).ok, false);
});

test("eligibleForGenuineM1: no phone is skipped", () => {
  assert.equal(eligibleForGenuineM1({ ...personPayload, phone: null }).reason, "no_phone");
});

test("handleM1: after the wait, queues SMS and email for an unpaid person", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: {}
    }],
    templates: templates()
  });
  const sleeps = [];
  const step = {
    run: (_id, fn) => fn(),
    sleep: async (id) => { sleeps.push(id); }
  };
  const res = await handleM1({
    event: ev("slo.contact_started", personPayload, { id: "evt-m1" }),
    db,
    step
  });
  assert.equal(res.sent, true);
  assert.deepEqual(sleeps, ["wait-15-min"]);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_M1_KEY, SMS_M1_KEY].sort()
  );
  assert.ok(db.clients[0].custom_fields[LOCK_M1]);
});

test("handleM1: agent emit is a no-op (prove path without texting a customer)", async () => {
  const db = genuineDb({ templates: templates() });
  const res = await handleM1({
    event: ev("slo.contact_started", {
      actor: "agent",
      actor_reason: "company_email",
      email: "agent@fundhub.ai",
      phone: "+14155550199"
    }),
    db,
    step: fakeStep()
  });
  assert.equal(res.done, false);
  assert.equal(res.reason, "not_person");
  assert.equal(db.messages.length, 0);
});

test("handleM1: paid diagnostic skips the send", async () => {
  const db = genuineDb({
    paidDiagnostic: true,
    clients: [{ id: "cl-1", org_id: "org-1", email: "pat@gmail.com", custom_fields: {} }],
    templates: templates()
  });
  const res = await handleM1({
    event: ev("slo.contact_started", personPayload, { id: "evt-paid" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, false);
  assert.equal(res.reason, "already_paid");
  assert.equal(db.messages.length, 0);
});

test("handleReply: does not send message 2 until message 1 was sent", async () => {
  const db = genuineDb({
    clients: [{ id: "cl-1", org_id: "org-1", email: "pat@gmail.com", phone: "+14155550134", custom_fields: {} }],
    templates: templates()
  });
  const res = await handleReply({
    event: ev("message.inbound", { from: "+14155550134", body: "price felt high", channel: "sms" }, { clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.reason, "not_awaiting_m2");
  assert.equal(db.messages.length, 0);
});

test("handleReply: after a real answer, queues SMS and email 2", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z" }
    }],
    templates: templates()
  });
  const res = await handleReply({
    event: ev("message.inbound", {
      from: "+14155550134",
      body: "I was worried about getting burned",
      channel: "sms"
    }, { id: "evt-reply", clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_M2_KEY, SMS_M2_KEY].sort()
  );
  assert.ok(db.clients[0].custom_fields[LOCK_M2]);
});

test("handleReply: STOP does not schedule message 2", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z" }
    }],
    templates: templates()
  });
  const res = await handleReply({
    event: ev("message.inbound", { from: "+14155550134", body: "STOP", channel: "sms" }, { clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.reason, "opt_out");
  assert.equal(db.messages.length, 0);
});

test("handleReply: first five get the dig text, not the customer question", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z", slo_text_slot: "1" }
    }],
    templates: [
      ...templates(),
      { org_id: "org-1", template_key: SMS_DIG_KEY, channel: "sms", body: "dig", compliance_passed: true }
    ]
  });
  const res = await handleReply({
    event: ev("message.inbound", {
      from: "+14155550134",
      body: "I was worried about getting burned",
      channel: "sms"
    }, { id: "evt-dig", clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.lane, "dig");
  assert.deepEqual(db.messages.map((m) => m.template_key), [SMS_DIG_KEY]);
});

test("handleReply: a yes after the dig books the free roadmap interview", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: {
        [LOCK_M1]: "2026-09-27T18:20:00.000Z",
        slo_text_slot: "1",
        slo_dig_sent_at: "2026-09-27T19:00:00.000Z"
      }
    }],
    templates: templates()
  });
  const res = await handleReply({
    event: ev("message.inbound", {
      from: "+14155550134",
      body: "Yes I want the roadmap",
      channel: "sms"
    }, { id: "evt-yes", clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.lane, "free_roadmap");
  assert.equal(db.messages.length, 0);
  assert.equal(db.tasks.length, 1);
  assert.equal(db.tasks[0].assignee_role, "csm");
});
