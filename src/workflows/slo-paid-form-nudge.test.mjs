import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handle,
  sloPaidFormUrl,
  blockBeforeWait,
  blockAfterWait,
  SMS_KEY,
  EMAIL_KEY,
  LOCK
} from "./slo-paid-form-nudge.mjs";
import { pgFake, ev } from "./test-support.mjs";

function templates() {
  return [
    {
      org_id: "org-1",
      template_key: SMS_KEY,
      channel: "sms",
      body: "Pick it back up here: {{form_url}}",
      compliance_passed: true
    },
    {
      org_id: "org-1",
      template_key: EMAIL_KEY,
      channel: "email",
      subject: "Your payment is in",
      body: "Pick it back up here: {{form_url}}",
      compliance_passed: true
    }
  ];
}

function paidOrder(over = {}) {
  return {
    id: "pl-1",
    client_id: "cl-1",
    link_ref: "pl_abc",
    description: "SLO diagnostic",
    status: "paid",
    paid_at: "2026-09-28T05:00:00.000Z",
    identity_stored_at: null,
    is_demo: false,
    email: "pat@gmail.com",
    phone: "+14155550134",
    ...over
  };
}

/** pgFake plus the one order read this job uses. `onRead` can change the row between calls. */
function orderDb(order, { clients, onRead } = {}) {
  const base = pgFake({
    clients: clients || [{
      id: "cl-1",
      org_id: "org-1",
      email: order?.email || "pat@gmail.com",
      phone: order?.phone || null,
      first_name: "Pat",
      custom_fields: {}
    }],
    templates: templates()
  });
  let reads = 0;
  return {
    ...base,
    async query(sql, params = []) {
      if (/FROM payment_links pl/.test(sql)) {
        reads += 1;
        if (onRead) onRead(order, reads);
        if (!order || params[1] !== order.link_ref) return { rows: [] };
        return { rows: [{ ...order }] };
      }
      return base.query(sql, params);
    }
  };
}

function stepWith(sleeps) {
  return {
    run: (_id, fn) => fn(),
    sleep: async (id) => { sleeps.push(id); }
  };
}

const pay = (ref = "pl_abc") => ev("payment.received", { ref }, { id: "evt-pay" });

test("the form link is the roadmap page with this order on it", () => {
  assert.equal(
    sloPaidFormUrl("pl_abc", "cl-1"),
    "https://apply.fundhub.ai/roadmap?ref=pl_abc&client_id=cl-1#fhw"
  );
});

test("a payment with no order ref does not wait", async () => {
  const sleeps = [];
  const db = orderDb(paidOrder());
  const res = await handle({
    event: ev("payment.received", { amount: 32 }),
    db,
    step: stepWith(sleeps)
  });
  assert.equal(res.reason, "not_slo");
  assert.deepEqual(sleeps, []);
  assert.equal(db.messages.length, 0);
});

test("a non-SLO order does not wait", async () => {
  const sleeps = [];
  const db = orderDb(paidOrder({ description: "Credit repair, done-for-you" }));
  const res = await handle({ event: pay(), db, step: stepWith(sleeps) });
  assert.equal(res.reason, "not_slo");
  assert.deepEqual(sleeps, []);
  assert.equal(db.messages.length, 0);
});

test("a demo order does not wait", async () => {
  const sleeps = [];
  const db = orderDb(paidOrder({ is_demo: true, description: "SLO diagnostic (demo, not charged)" }));
  const res = await handle({ event: pay(), db, step: stepWith(sleeps) });
  assert.equal(res.reason, "demo");
  assert.deepEqual(sleeps, []);
});

test("a company email does not wait", async () => {
  const sleeps = [];
  const db = orderDb(paidOrder({ email: "sam@fundhub.ai" }));
  const res = await handle({ event: pay(), db, step: stepWith(sleeps) });
  assert.equal(res.reason, "company_email");
  assert.deepEqual(sleeps, []);
  assert.equal(db.messages.length, 0);
});

test("a form already in does not wait and does not send", async () => {
  const sleeps = [];
  const db = orderDb(paidOrder({ identity_stored_at: "2026-09-28T05:01:00.000Z" }));
  const res = await handle({ event: pay(), db, step: stepWith(sleeps) });
  assert.equal(res.sent, false);
  assert.equal(res.reason, "form_in");
  assert.deepEqual(sleeps, []);
  assert.equal(db.messages.length, 0);
});

test("a form that arrives during the wait is not chased", async () => {
  const order = paidOrder();
  const sleeps = [];
  const db = orderDb(order, {
    onRead(_row, n) {
      if (n >= 2) order.identity_stored_at = "2026-09-28T05:10:00.000Z";
    }
  });
  const res = await handle({ event: pay(), db, step: stepWith(sleeps) });
  assert.deepEqual(sleeps, ["wait-15-min"]);
  assert.equal(res.sent, false);
  assert.equal(res.reason, "form_in");
  assert.equal(db.messages.length, 0);
});

test("an order still unpaid after the wait is not chased", async () => {
  const sleeps = [];
  const db = orderDb(paidOrder({ status: "sent", paid_at: null }));
  const res = await handle({ event: pay(), db, step: stepWith(sleeps) });
  assert.deepEqual(sleeps, ["wait-15-min"]);
  assert.equal(res.reason, "not_paid");
  assert.equal(db.messages.length, 0);
});

test("after the wait, a paid empty form gets the email and the text", async () => {
  const sleeps = [];
  const db = orderDb(paidOrder());
  const res = await handle({ event: pay(), db, step: stepWith(sleeps) });
  assert.equal(res.sent, true);
  assert.deepEqual(sleeps, ["wait-15-min"]);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_KEY, SMS_KEY].sort()
  );
  const link = "https://apply.fundhub.ai/roadmap?ref=pl_abc&client_id=cl-1#fhw";
  assert.ok(db.messages.every((m) => m.rendered_body.includes(link)));
  assert.ok(db.clients[0].custom_fields[LOCK]);
});

test("no phone still sends the email", async () => {
  const db = orderDb(paidOrder({ phone: null }), {
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: null,
      custom_fields: {}
    }]
  });
  const res = await handle({ event: pay(), db, step: stepWith([]) });
  assert.equal(res.sent, true);
  assert.equal(res.sms, null);
  assert.deepEqual(db.messages.map((m) => m.channel), ["email"]);
});

test("a second run does not send again", async () => {
  const db = orderDb(paidOrder(), {
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK]: "2026-09-28T05:20:00.000Z" }
    }]
  });
  const res = await handle({ event: pay(), db, step: stepWith([]) });
  assert.equal(res.reason, "already_sent");
  assert.equal(db.messages.length, 0);
});

test("block helpers: form in stops, unpaid waits then stops", () => {
  assert.equal(blockBeforeWait(paidOrder({ identity_stored_at: "t" })), "form_in");
  assert.equal(blockBeforeWait(paidOrder({ status: "sent", paid_at: null })), null);
  assert.equal(blockAfterWait(paidOrder({ status: "sent", paid_at: null })), "not_paid");
  assert.equal(blockAfterWait(paidOrder()), null);
});
