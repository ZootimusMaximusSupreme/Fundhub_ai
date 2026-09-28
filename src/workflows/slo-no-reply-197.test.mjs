import { test } from "node:test";
import assert from "node:assert/strict";
import { agreesToRoadmap, nextTextSlot, DISCOUNT_CENTS } from "../slo/discount-197.mjs";
import { handleNoReply, EMAIL_197_KEY, SMS_197_KEY } from "./slo-no-reply-197.mjs";
import { LOCK_M1 } from "./slo-genuine-followup.mjs";
import { pgFake, ev } from "./test-support.mjs";

test("agreesToRoadmap: a yes counts, a worry does not", () => {
  assert.equal(agreesToRoadmap("Yes I want the roadmap"), true);
  assert.equal(agreesToRoadmap("I was worried about getting burned"), false);
  assert.equal(agreesToRoadmap(""), false);
});

test("nextTextSlot: only the first five", () => {
  assert.equal(nextTextSlot(0), 1);
  assert.equal(nextTextSlot(4), 5);
  assert.equal(nextTextSlot(5), null);
});

test("discount price is $197", () => {
  assert.equal(DISCOUNT_CENTS, 19700);
});

function dbFor197(seed = {}) {
  const base = pgFake(seed);
  const paid = seed.paidDiagnostic || false;
  return {
    ...base,
    async query(sql, params = []) {
      if (/FROM payment_links pl/.test(sql) && /JOIN clients c/.test(sql)) {
        return { rows: paid ? [{ "?column?": 1 }] : [] };
      }
      if (/custom_fields->>\$2 AS replied/.test(sql)) {
        const c = base.clients.find((row) => row.id === params[0]);
        if (!c) return { rows: [] };
        const cf = c.custom_fields || {};
        return { rows: [{ replied: cf[params[1]] || null, m1: cf[params[2]] || null }] };
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
              ghl_contact_id: "ghl-test",
              email: c.email,
              phone: c.phone,
              first_name: null,
              last_name: null
            }]
            : []
        };
      }
      return base.query(sql, params);
    }
  };
}

const person = {
  actor: "person",
  email: "pat@gmail.com",
  phone: "+14155550134",
  name: "Pat Lee"
};

const templates = [
  { org_id: "org-1", template_key: SMS_197_KEY, channel: "sms", body: "197 sms {{pay_url}}", compliance_passed: true },
  { org_id: "org-1", template_key: EMAIL_197_KEY, channel: "email", subject: "$197", body: "197 email {{pay_url}}", compliance_passed: true }
];

test("handleNoReply: silence queues the $197 text and email", async () => {
  const db = dbFor197({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z" }
    }],
    templates
  });
  const res = await handleNoReply({
    event: ev("slo.contact_started", person, { id: "evt-197" }),
    db,
    step: { run: (_id, fn) => fn(), sleep: async () => {} }
  });
  assert.equal(res.sent, true);
  assert.match(res.payUrl, /offer=197/);
  assert.match(res.payUrl, /apply\.fundhub\.ai\/roadmap/);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_197_KEY, SMS_197_KEY].sort()
  );
});

test("handleNoReply: a reply skips the discount", async () => {
  const db = dbFor197({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z", slo_replied_at: "2026-09-27T19:00:00.000Z" }
    }],
    templates
  });
  const res = await handleNoReply({
    event: ev("slo.contact_started", person),
    db,
    step: { run: (_id, fn) => fn(), sleep: async () => {} },
    mint: async () => { throw new Error("should not mint"); }
  });
  assert.equal(res.reason, "they_replied");
  assert.equal(db.messages.length, 0);
});
