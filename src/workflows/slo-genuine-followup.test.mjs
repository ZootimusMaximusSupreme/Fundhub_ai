import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eligibleForGenuineM1,
  handleM1,
  handleReply,
  handleCheckoutM1Sms,
  SMS_FIRST5_KEY,
  EMAIL_FIRST5_KEY,
  SMS_GIFT_KEY,
  EMAIL_GIFT_KEY,
  SMS_COUPON_KEY,
  EMAIL_COUPON_KEY,
  SMS_FIRST5_REPLY_KEY,
  EMAIL_FIRST5_REPLY_KEY,
  LOCK_M1,
  LOCK_M2
} from "./slo-genuine-followup.mjs";
import { pgFake, fakeStep, ev } from "./test-support.mjs";

function templates() {
  return [
    { org_id: "org-1", template_key: SMS_FIRST5_KEY, channel: "sms", body: "first5 sms", compliance_passed: true },
    { org_id: "org-1", template_key: EMAIL_FIRST5_KEY, channel: "email", subject: "Free", body: "first5 email", compliance_passed: true },
    { org_id: "org-1", template_key: SMS_GIFT_KEY, channel: "sms", body: "gift sms", compliance_passed: true },
    { org_id: "org-1", template_key: EMAIL_GIFT_KEY, channel: "email", subject: "Gift", body: "gift email", compliance_passed: true },
    { org_id: "org-1", template_key: SMS_COUPON_KEY, channel: "sms", body: "coupon {{pay_url}}", compliance_passed: true },
    { org_id: "org-1", template_key: EMAIL_COUPON_KEY, channel: "email", subject: "33% off", body: "coupon email {{pay_url}}", compliance_passed: true },
    { org_id: "org-1", template_key: SMS_FIRST5_REPLY_KEY, channel: "sms", body: "you're in {{book_url}}", compliance_passed: true },
    { org_id: "org-1", template_key: EMAIL_FIRST5_REPLY_KEY, channel: "email", subject: "You're in", body: "you're in email {{book_url}}", compliance_passed: true }
  ];
}

/** pgFake plus the paid-diagnostic and resolveClient reads this workflow uses. */
function genuineDb(seed = {}) {
  const base = pgFake(seed);
  const paid = seed.paidDiagnostic || false;
  const bookings = seed.bookings || [];
  return {
    ...base,
    bookings,
    async query(sql, params = []) {
      if (/FROM payment_links pl/.test(sql) && /JOIN clients c/.test(sql)) {
        return { rows: paid ? [{ "?column?": 1 }] : [] };
      }
      // Cap = people who agreed (slo_roadmap_free_at) AND booked — not texts sent.
      if (/custom_fields->>\$2 IS NOT NULL/.test(sql) && /FROM bookings b/.test(sql) && /booking\.created/.test(sql)) {
        const orgId = params[0];
        const freeKey = params[1] || "slo_roadmap_free_at";
        const n = base.clients.filter((c) => {
          if (c.org_id !== orgId) return false;
          if (!(c.custom_fields && c.custom_fields[freeKey])) return false;
          const bookedRow = bookings.some((b) => b.client_id === c.id);
          const bookedEvent = (base.events || []).some(
            (e) => e.client_id === c.id && e.name === "booking.created"
          );
          return bookedRow || bookedEvent;
        }).length;
        return { rows: [{ n }] };
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
      if (/SELECT phone FROM clients WHERE id = \$1/.test(sql)) {
        const c = base.clients.find((row) => row.id === params[0]);
        return { rows: c ? [{ phone: c.phone || null }] : [] };
      }
      if (/FROM messages/.test(sql) && /template_key = ANY/.test(sql)) {
        const keys = params[1] || [];
        const hit = base.messages.some(
          (m) => m.client_id === params[0] && m.channel === "sms" && keys.includes(m.template_key)
        );
        return { rows: hit ? [{ "?column?": 1 }] : [] };
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

test("eligibleForGenuineM1: no phone still passes (email goes; SMS waits)", () => {
  const gate = eligibleForGenuineM1({ ...personPayload, phone: null });
  assert.equal(gate.ok, true);
  assert.equal(gate.phone, null);
  assert.equal(gate.email, "pat@gmail.com");
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
    [EMAIL_FIRST5_KEY, SMS_FIRST5_KEY].sort()
  );
  assert.ok(db.clients[0].custom_fields[LOCK_M1]);
});

test("handleM1: offered-but-unbooked free texts do not burn the first-five cap", async () => {
  const offered = Array.from({ length: 5 }, (_, i) => ({
    id: `cl-offered-${i}`,
    org_id: "org-1",
    email: `offered${i}@gmail.com`,
    custom_fields: { slo_text_slot: String(i + 1) }
  }));
  const db = genuineDb({
    clients: [
      ...offered,
      {
        id: "cl-1",
        org_id: "org-1",
        email: "pat@gmail.com",
        phone: "+14155550134",
        custom_fields: {}
      }
    ],
    templates: templates()
  });
  const res = await handleM1({
    event: ev("slo.contact_started", personPayload, { id: "evt-still-free" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.equal(res.slot, "1");
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_FIRST5_KEY, SMS_FIRST5_KEY].sort()
  );
});

test("handleM1: after five agreed-and-booked, abandoners get the gift text", async () => {
  const booked = Array.from({ length: 5 }, (_, i) => ({
    id: `cl-booked-${i}`,
    org_id: "org-1",
    email: `booked${i}@gmail.com`,
    custom_fields: {
      slo_roadmap_free_at: "2026-09-27T18:00:00.000Z",
      slo_text_slot: String(i + 1)
    }
  }));
  const db = genuineDb({
    clients: [
      ...booked,
      {
        id: "cl-1",
        org_id: "org-1",
        email: "pat@gmail.com",
        phone: "+14155550134",
        custom_fields: {}
      }
    ],
    bookings: booked.map((c) => ({ client_id: c.id, org_id: "org-1" })),
    templates: templates()
  });
  const res = await handleM1({
    event: ev("slo.contact_started", personPayload, { id: "evt-gift" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.equal(res.slot, null);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_GIFT_KEY, SMS_GIFT_KEY].sort()
  );
});

test("handleM1: yes with no booking yet does not burn a first-five seat", async () => {
  const agreedOnly = Array.from({ length: 5 }, (_, i) => ({
    id: `cl-yes-${i}`,
    org_id: "org-1",
    email: `yes${i}@gmail.com`,
    custom_fields: {
      slo_roadmap_free_at: "2026-09-27T18:00:00.000Z",
      slo_text_slot: String(i + 1)
    }
  }));
  const db = genuineDb({
    clients: [
      ...agreedOnly,
      {
        id: "cl-1",
        org_id: "org-1",
        email: "pat@gmail.com",
        phone: "+14155550134",
        custom_fields: {}
      }
    ],
    bookings: [],
    events: [],
    templates: templates()
  });
  const res = await handleM1({
    event: ev("slo.contact_started", personPayload, { id: "evt-yes-unbooked" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.ok(res.slot);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_FIRST5_KEY, SMS_FIRST5_KEY].sort()
  );
});

test("handleM1: booking.created event counts as booked for the free cap", async () => {
  const booked = Array.from({ length: 5 }, (_, i) => ({
    id: `cl-ev-${i}`,
    org_id: "org-1",
    email: `ev${i}@gmail.com`,
    custom_fields: { slo_roadmap_free_at: "2026-09-27T18:00:00.000Z" }
  }));
  const db = genuineDb({
    clients: [
      ...booked,
      {
        id: "cl-1",
        org_id: "org-1",
        email: "pat@gmail.com",
        phone: "+14155550134",
        custom_fields: {}
      }
    ],
    events: booked.map((c) => ({
      client_id: c.id,
      org_id: "org-1",
      name: "booking.created"
    })),
    templates: templates()
  });
  const res = await handleM1({
    event: ev("slo.contact_started", personPayload, { id: "evt-by-event" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.equal(res.slot, null);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_GIFT_KEY, SMS_GIFT_KEY].sort()
  );
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

test("handleM1: email-only opt-in still queues the email", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: null,
      custom_fields: {}
    }],
    templates: templates()
  });
  const res = await handleM1({
    event: ev("slo.contact_started", { ...personPayload, phone: null }, { id: "evt-email-only" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.equal(res.sms, null);
  assert.deepEqual(db.messages.map((m) => m.template_key), [EMAIL_FIRST5_KEY]);
});

test("handleCheckoutM1Sms: full M1 when phone lands at checkout and nothing was sent", async () => {
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
  const res = await handleCheckoutM1Sms({
    event: ev("slo.checkout_started", {
      email: "pat@gmail.com",
      client_id: "cl-1"
    }, { id: "evt-checkout-full", clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.equal(res.lane, "full_m1");
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_FIRST5_KEY, SMS_FIRST5_KEY].sort()
  );
  assert.ok(db.clients[0].custom_fields[LOCK_M1]);
});

test("handleCheckoutM1Sms: sends unpaid SMS once phone lands after M1 email", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-29T18:00:00.000Z", slo_text_slot: "1" }
    }],
    templates: templates()
  });
  const res = await handleCheckoutM1Sms({
    event: ev("slo.checkout_started", {
      email: "pat@gmail.com",
      client_id: "cl-1",
      actor: "person"
    }, { id: "evt-checkout-sms", clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.sent, true);
  assert.equal(res.lane, "sms_only");
  assert.deepEqual(db.messages.map((m) => m.template_key), [SMS_FIRST5_KEY]);
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

test("handleReply: after a real answer, the gift becomes the 33% coupon", async () => {
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
  assert.match(res.payUrl, /offer=197/);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_COUPON_KEY, SMS_COUPON_KEY].sort()
  );
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

test("handleReply: the first five who answer get the free Google Meet", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z", slo_text_slot: "1" }
    }],
    templates: templates()
  });
  const res = await handleReply({
    event: ev("message.inbound", {
      from: "+14155550134",
      body: "The hardest part is I don't trust anyone",
      channel: "sms"
    }, { id: "evt-yes", clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.lane, "free_roadmap");
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_FIRST5_REPLY_KEY, SMS_FIRST5_REPLY_KEY].sort()
  );
  assert.ok(db.messages.every((m) => /https?:\/\//.test(m.rendered_body)));
  assert.ok(!db.messages.some((m) => m.template_key === SMS_COUPON_KEY));
  assert.equal(db.tasks.length, 1);
});

test("handleReply: the first five who say no do not get the free roadmap", async () => {
  const db = genuineDb({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z", slo_text_slot: "1" }
    }],
    templates: templates()
  });
  const res = await handleReply({
    event: ev("message.inbound", {
      from: "+14155550134",
      body: "No",
      channel: "sms"
    }, { id: "evt-no", clientId: "cl-1" }),
    db,
    step: fakeStep()
  });
  assert.equal(res.reason, "first_five_no_agree");
  assert.equal(db.messages.length, 0);
  assert.equal(db.tasks.length, 0);
});
