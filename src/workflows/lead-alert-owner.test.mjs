// Lead alert to Chris — when it sends, when it stays quiet, and that it never
// sends twice. Every number and address below is a made-up test value.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, eligibility, SMS_STAMP, EMAIL_STAMP, MAX_LEAD_AGE_MS } from "./lead-alert-owner.mjs";
import { pgFake, fakeStep, ev } from "./test-support.mjs";

const NOW = new Date("2026-10-07T22:42:00Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const ENV = {
  MESSAGING_DRY_RUN: "0",
  LEAD_ALERT_SMS_TO: "+15555550100",
  LEAD_ALERT_EMAIL_TO: "owner@example.test"
};

const sent = { status: "sent", providerMessageId: "SM1", error: null, retryable: false };

/* A client row the way the database would hold it: made five minutes ago. */
const client = (extra = {}) => ({
  id: "cl-1",
  org_id: "org-1",
  first_name: "Jane",
  last_name: "Smith",
  email: "jane@example.com",
  phone: "+16025550142",
  channel_source: "clickfunnels",
  is_demo: false,
  created_at: new Date(NOW.getTime() - 5 * MIN),
  custom_fields: {},
  ...extra
});

/* pgFake already answers the once-only claim. This wrapper adds the three
   statements only this workflow makes: reading the lead, reading its ad row,
   and putting a stamp back. */
function leadDb({ clients, attribution = [] }) {
  const inner = pgFake({ clients });
  const reads = [];
  return {
    clients: inner.clients,
    reads,
    async query(sql, params = []) {
      const text = String(sql);
      if (/SELECT id, first_name, last_name, email, phone, channel_source, is_demo, created_at, custom_fields/.test(text)) {
        reads.push("lead");
        const c = inner.clients.find((x) => x.id === params[0] && x.org_id === params[1]);
        return { rows: c ? [c] : [] };
      }
      if (/FROM client_ad_attribution/.test(text)) {
        const a = attribution.find((x) => x.client_id === params[1] && x.org_id === params[0]);
        return { rows: a ? [a] : [] };
      }
      if (/custom_fields, '\{\}'::jsonb\) - \$2::text/.test(text)) {
        const c = inner.clients.find((x) => x.id === params[0]);
        if (c && c.custom_fields) delete c.custom_fields[params[1]];
        return { rows: [] };
      }
      return inner.query(sql, params);
    }
  };
}

function senders({ sms = async () => sent, email = async () => sent } = {}) {
  const calls = { sms: [], email: [] };
  return {
    calls,
    sendSms: async (message, options) => { calls.sms.push(message); return sms(message, options); },
    sendEmail: async (message, options) => { calls.email.push(message); return email(message, options); }
  };
}

const run = (db, event, s, extra = {}) =>
  handle({ event, db, step: fakeStep(), env: ENV, now: () => NOW, sendSms: s.sendSms, sendEmail: s.sendEmail, ...extra });

const entry = (extra = {}) => ev("entry.captured", {}, { clientId: "cl-1", ...extra });
const booking = (extra = {}) => ev("booking.created", {}, { clientId: "cl-1", ...extra });

// ── a new lead is told to Chris ───────────────────────────────────────────

test("a new lead sends one text and one email, and stamps both channels", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const res = await run(db, entry(), s);
  assert.equal(res.done, true);
  assert.equal(res.sms.status, "sent");
  assert.equal(res.email.status, "sent");
  assert.equal(s.calls.sms.length, 1);
  assert.equal(s.calls.email.length, 1);
  assert.ok(db.clients[0].custom_fields[SMS_STAMP]);
  assert.ok(db.clients[0].custom_fields[EMAIL_STAMP]);
});

test("the text and the email carry the lead's details and the CRM link", async () => {
  const db = leadDb({
    clients: [client()],
    attribution: [{ client_id: "cl-1", org_id: "org-1", ad_id: "42", utm_content: "42-ringlights" }]
  });
  const s = senders();
  await run(db, entry(), s);
  assert.deepEqual(s.calls.sms[0], {
    to: "+15555550100",
    channel: "sms",
    body: [
      "New Fundhub lead",
      "Jane Smith",
      "(602) 555-0142",
      "jane@example.com",
      "Source: Ad 42 (42-ringlights)",
      "Open: https://fundhub.ai/app/client-control-panel.html?id=cl-1"
    ].join("\n")
  });
  const mail = s.calls.email[0];
  assert.equal(mail.to, "owner@example.test");
  assert.equal(mail.subject, "New Fundhub lead: Jane Smith, (602) 555-0142");
  assert.match(mail.body, /Source: Ad 42 \(42-ringlights\)/);
  assert.match(mail.body, /Time: 3:42 PM Arizona/);
  assert.match(mail.body, /\nhttps:\/\/fundhub\.ai\/app\/client-control-panel\.html\?id=cl-1$/);
});

test("with no ad row the source line falls back to the channel, and staff-added says so", async () => {
  const s = senders();
  await run(leadDb({ clients: [client({ channel_source: "climate" })] }), entry(), s);
  assert.match(s.calls.sms[0].body, /Source: climate/);

  const s2 = senders();
  await run(leadDb({ clients: [client({ channel_source: "pipeline" })] }), entry(), s2);
  assert.match(s2.calls.sms[0].body, /Source: added by staff on the Pipeline board/);

  const s3 = senders();
  await run(leadDb({ clients: [client({ channel_source: null })] }), entry(), s3);
  assert.match(s3.calls.sms[0].body, /Source: not tagged/);
});

test("a missing phone or email still sends, and says 'not given yet'", async () => {
  const db = leadDb({ clients: [client({ phone: null, email: null, first_name: null, last_name: null })] });
  const s = senders();
  const res = await run(db, entry(), s);
  assert.equal(res.done, true);
  assert.equal(s.calls.sms.length, 1);
  assert.match(s.calls.sms[0].body, /Name not given\nPhone: not given yet\nEmail: not given\n/);
  assert.match(s.calls.email[0].body, /Phone: not given yet/);
});

// ── once per person, ever ─────────────────────────────────────────────────

test("a second entry.captured for the same person sends nothing", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  await run(db, entry({ id: "evt-1" }), s);
  const second = await run(db, entry({ id: "evt-2" }), s);
  assert.equal(second.done, true);
  assert.equal(second.sms.status, "already_alerted");
  assert.equal(second.email.status, "already_alerted");
  assert.equal(s.calls.sms.length, 1);
  assert.equal(s.calls.email.length, 1);
});

test("two events at the same moment send once", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const [a, b] = await Promise.all([
    run(db, entry({ id: "evt-a" }), s),
    run(db, booking({ id: "evt-b" }), s)
  ]);
  assert.equal(s.calls.sms.length, 1, "one text");
  assert.equal(s.calls.email.length, 1, "one email");
  const smsWins = [a, b].filter((r) => r.sms.status === "sent").length;
  assert.equal(smsWins, 1);
});

test("booking.created after entry.captured sends nothing more", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  await run(db, entry(), s);
  const res = await run(db, booking(), s);
  assert.equal(res.sms.status, "already_alerted");
  assert.equal(res.email.status, "already_alerted");
  assert.equal(s.calls.sms.length, 1);
  assert.equal(s.calls.email.length, 1);
});

test("booking.created for a brand-new person (no survey) sends one alert", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const res = await run(db, booking(), s);
  assert.equal(res.done, true);
  assert.equal(s.calls.sms.length, 1);
  assert.equal(s.calls.email.length, 1);
});

test("replaying the same booking.created event does not send twice", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const e = booking({ id: "evt-booking-1" });
  await run(db, e, s);
  await run(db, e, s);
  await run(db, e, s);
  assert.equal(s.calls.sms.length, 1);
  assert.equal(s.calls.email.length, 1);
});

// ── who is not alerted about ──────────────────────────────────────────────

test("a client made more than 24 hours ago gets no alert", async () => {
  const old = client({ created_at: new Date(NOW.getTime() - 25 * HOUR) });
  const db = leadDb({ clients: [old] });
  const s = senders();
  const res = await run(db, entry(), s);
  assert.deepEqual(res, { done: false, reason: "older_than_24h" });
  assert.equal(s.calls.sms.length + s.calls.email.length, 0);
  assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined, "no stamp claimed");
});

test("the 24 hour line: just inside alerts, just outside does not", () => {
  const at = (ms) => eligibility(client({ created_at: new Date(NOW.getTime() - ms) }), NOW).ok;
  assert.equal(at(MAX_LEAD_AGE_MS - MIN), true);
  assert.equal(at(MAX_LEAD_AGE_MS + MIN), false);
  assert.equal(at(0), true);
});

test("a test file (is_demo) gets no alert", async () => {
  const db = leadDb({ clients: [client({ is_demo: true })] });
  const s = senders();
  const res = await run(db, entry(), s);
  assert.deepEqual(res, { done: false, reason: "demo_client" });
  assert.equal(s.calls.sms.length + s.calls.email.length, 0);
});

test("a journey-runner synthetic client gets no alert", async () => {
  const db = leadDb({ clients: [client({ custom_fields: { synthetic: true } })] });
  const s = senders();
  const res = await run(db, entry(), s);
  assert.deepEqual(res, { done: false, reason: "synthetic_client" });
  assert.equal(s.calls.sms.length + s.calls.email.length, 0);
});

test("an event with no client does nothing", async () => {
  const db = leadDb({ clients: [] });
  const s = senders();
  const res = await run(db, ev("entry.captured", {}), s);
  assert.equal(res.done, false);
  assert.equal(s.calls.sms.length + s.calls.email.length, 0);
});

test("a client id that is not in this company does nothing", async () => {
  const db = leadDb({ clients: [client({ org_id: "org-other" })] });
  const s = senders();
  const res = await run(db, entry(), s);
  assert.equal(res.done, false);
  assert.equal(s.calls.sms.length + s.calls.email.length, 0);
});

// ── settings and the fence ────────────────────────────────────────────────

test("with both settings unset: nothing is sent, nothing is stamped, nothing throws", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const res = await run(db, entry(), s, { env: { MESSAGING_DRY_RUN: "0" } });
  assert.equal(res.done, true);
  assert.equal(res.sms.status, "not_configured");
  assert.equal(res.email.status, "not_configured");
  assert.equal(s.calls.sms.length + s.calls.email.length, 0);
  assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined);
  assert.equal(db.clients[0].custom_fields[EMAIL_STAMP], undefined);
});

test("with only the email set, the email goes and the text is skipped", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const res = await run(db, entry(), s, { env: { MESSAGING_DRY_RUN: "0", LEAD_ALERT_EMAIL_TO: "owner@example.test" } });
  assert.equal(res.sms.status, "not_configured");
  assert.equal(res.email.status, "sent");
  assert.equal(s.calls.sms.length, 0);
  assert.equal(s.calls.email.length, 1);
  assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined, "a skipped channel can still go later");
});

test("there is no fallback to the morning-check number", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const res = await run(db, entry(), s, {
    env: { MESSAGING_DRY_RUN: "0", PULSE_SMS_TO: "+15555550199", LEAD_ALERT_EMAIL_TO: "owner@example.test" }
  });
  assert.equal(res.sms.status, "not_configured");
  assert.equal(s.calls.sms.length, 0);
});

test("the messaging fence holds the alert: nothing sent, no stamp", async () => {
  for (const MESSAGING_DRY_RUN of [undefined, "", "1", "true", "banana"]) {
    const db = leadDb({ clients: [client()] });
    const s = senders();
    const env = { ...ENV };
    if (MESSAGING_DRY_RUN === undefined) delete env.MESSAGING_DRY_RUN; else env.MESSAGING_DRY_RUN = MESSAGING_DRY_RUN;
    const res = await run(db, entry(), s, { env });
    assert.deepEqual(res, { done: false, reason: "fence_held" }, `MESSAGING_DRY_RUN=${JSON.stringify(MESSAGING_DRY_RUN)}`);
    assert.equal(s.calls.sms.length + s.calls.email.length, 0);
    assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined);
  }
});

// ── a send that fails ─────────────────────────────────────────────────────

test("a failed text clears its stamp and asks for a retry; the email still goes", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders({ sms: async () => ({ status: "failed", retryable: true, error: "twilio returned HTTP 503" }) });
  await assert.rejects(run(db, entry(), s), /lead alert sms not sent: twilio returned HTTP 503/);
  assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined, "the text stamp is cleared");
  assert.ok(db.clients[0].custom_fields[EMAIL_STAMP], "the email went and is stamped");
  assert.equal(s.calls.email.length, 1);
});

test("after a failed text, the next event for the same person sends the text, and only the text", async () => {
  const db = leadDb({ clients: [client()] });
  const failing = senders({ sms: async () => ({ status: "failed", retryable: true, error: "boom" }) });
  await assert.rejects(run(db, entry({ id: "evt-1" }), failing));

  const working = senders();
  const res = await run(db, booking({ id: "evt-2" }), working);
  assert.equal(res.sms.status, "sent");
  assert.equal(res.email.status, "already_alerted");
  assert.equal(working.calls.sms.length, 1);
  assert.equal(working.calls.email.length, 0, "the email is never sent twice");
});

test("a failed email clears its own stamp and never re-sends the text", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders({ email: async () => ({ status: "failed", retryable: true, error: "resend returned HTTP 500" }) });
  await assert.rejects(run(db, entry(), s), /lead alert email not sent/);
  assert.ok(db.clients[0].custom_fields[SMS_STAMP]);
  assert.equal(db.clients[0].custom_fields[EMAIL_STAMP], undefined);

  const again = senders();
  const res = await run(db, entry({ id: "evt-2" }), again);
  assert.equal(res.sms.status, "already_alerted");
  assert.equal(res.email.status, "sent");
  assert.equal(again.calls.sms.length, 0);
});

test("both channels failing reports both, and clears both stamps", async () => {
  const db = leadDb({ clients: [client()] });
  const bad = async () => ({ status: "failed", retryable: true, error: "down" });
  const s = senders({ sms: bad, email: bad });
  await assert.rejects(run(db, entry(), s), /lead alert sms not sent: down; lead alert email not sent: down/);
  assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined);
  assert.equal(db.clients[0].custom_fields[EMAIL_STAMP], undefined);
});

test("a permanent refusal clears the stamp but does not ask for a retry", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders({ sms: async () => ({ status: "rejected", retryable: false, error: "not a mobile number" }) });
  const res = await run(db, entry(), s);
  assert.equal(res.done, true);
  assert.equal(res.sms.status, "rejected");
  assert.equal(res.email.status, "sent");
  assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined, "left empty so the pulse can see it");
});

test("a provider that throws is treated as a failed send", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders({ sms: async () => { throw new Error("socket hang up"); } });
  await assert.rejects(run(db, entry(), s), /lead alert sms not sent/);
  assert.equal(db.clients[0].custom_fields[SMS_STAMP], undefined);
});

test("an error that echoes the number does not leave the workflow with the number in it", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders({
    sms: async () => ({ status: "failed", retryable: true, error: "The 'To' number +15555550100 is not valid" })
  });
  await assert.rejects(run(db, entry(), s), (err) => {
    assert.ok(!String(err.message).includes("5555550100"), err.message);
    return true;
  });
});

test("a read of the ad row that fails only changes the Source line", async () => {
  const db = leadDb({ clients: [client()] });
  const base = db.query.bind(db);
  db.query = async (sql, params) => {
    if (/FROM client_ad_attribution/.test(String(sql))) throw new Error('relation "client_ad_attribution" does not exist');
    return base(sql, params);
  };
  const s = senders();
  const res = await run(db, entry(), s);
  assert.equal(res.done, true);
  assert.match(s.calls.sms[0].body, /Source: clickfunnels/);
});

// ── what Inngest is allowed to keep ───────────────────────────────────────

test("no step hands back the lead's name, number or address", async () => {
  const db = leadDb({ clients: [client()] });
  const s = senders();
  const outs = [];
  const step = {
    run: async (id, fn) => { const r = await fn(); outs.push([id, r]); return r; },
    sleep: async () => {},
    sleepUntil: async () => {}
  };
  await handle({ event: entry(), db, step, env: ENV, now: () => NOW, sendSms: s.sendSms, sendEmail: s.sendEmail });
  assert.deepEqual(outs.map(([id]) => id), ["resolve-client", "check-eligible", "alert-sms", "alert-email"]);
  const blob = JSON.stringify(outs);
  for (const secret of ["Jane", "Smith", "jane@example.com", "6025550142", "555-0142", "5555550100", "owner@example.test"]) {
    assert.ok(!blob.includes(secret), `step output must not hold ${secret}`);
  }
});
