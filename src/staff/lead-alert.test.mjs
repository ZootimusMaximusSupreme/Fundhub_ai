// Lead alert to Chris — the words, the recipients, and the sending.
// Every number and address below is a made-up test value. None is a real one.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SMS_STAMP,
  EMAIL_STAMP,
  leadAlertSmsTo,
  leadAlertEmailTo,
  leadAlertConfigured,
  leadName,
  formatPhone,
  leadSource,
  leadCrmLink,
  formatAlertTime,
  buildLeadAlertText,
  buildLeadAlertEmail,
  scrubError,
  sendLeadAlertSms,
  sendLeadAlertEmail
} from "./lead-alert.mjs";
import { send as resendSend } from "../messaging/providers/resend.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, "lead-alert.mjs"), "utf8");

const LEAD = {
  id: "11111111-2222-3333-4444-555555555555",
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  phone: "+16025550142",
  channelSource: "clickfunnels"
};
const AD = { ad_id: "42", utm_content: "42-ringlights" };
const ENV = {};
const LINK = "https://fundhub.ai/app/client-control-panel.html?id=11111111-2222-3333-4444-555555555555";

const ok = { status: "sent", providerMessageId: "SM1", error: null, retryable: false };

// ── the text ──────────────────────────────────────────────────────────────

test("the text carries name, phone, email, source and the CRM link, one per line", () => {
  const text = buildLeadAlertText(LEAD, { attribution: AD, env: ENV });
  assert.equal(text, [
    "New Fundhub lead",
    "Jane Smith",
    "(602) 555-0142",
    "jane@example.com",
    "Source: Ad 42 (42-ringlights)",
    `Open: ${LINK}`
  ].join("\n"));
});

test("the text is two segments or fewer", () => {
  const text = buildLeadAlertText(LEAD, { attribution: AD, env: ENV });
  assert.ok(text.length < 320, `text is ${text.length} characters`);
});

test("a missing name, phone or email still produces an alert, in plain words", () => {
  const text = buildLeadAlertText({ id: "c-1" }, { env: ENV });
  const lines = text.split("\n");
  assert.equal(lines[0], "New Fundhub lead");
  assert.equal(lines[1], "Name not given");
  assert.equal(lines[2], "Phone: not given yet");
  assert.equal(lines[3], "Email: not given");
  assert.equal(lines[4], "Source: not tagged");
  assert.match(lines[5], /^Open: https:\/\/fundhub\.ai\/app\/client-control-panel\.html\?id=c-1$/);
});

// ── the email ─────────────────────────────────────────────────────────────

test("the email subject names the lead and the number to text", () => {
  const { subject } = buildLeadAlertEmail(LEAD, { attribution: AD, env: ENV });
  assert.equal(subject, "New Fundhub lead: Jane Smith, (602) 555-0142");
});

test("the email body has the labelled lines, the Arizona time and the link on its own line", () => {
  const at = new Date("2026-10-07T22:42:00Z");
  const { body } = buildLeadAlertEmail(LEAD, { attribution: AD, env: ENV, at });
  assert.equal(body, [
    "A new lead just came in.",
    "",
    "Name: Jane Smith",
    "Phone: (602) 555-0142",
    "Email: jane@example.com",
    "Source: Ad 42 (42-ringlights)",
    "Time: 3:42 PM Arizona",
    "",
    "Open the lead in the CRM:",
    LINK
  ].join("\n"));
});

test("an email with nothing known still reads cleanly", () => {
  const { subject, body } = buildLeadAlertEmail({ id: "c-1" }, { env: ENV, at: new Date("2026-10-07T22:42:00Z") });
  assert.equal(subject, "New Fundhub lead: name not given, no phone yet");
  assert.match(body, /Name: not given\nPhone: not given yet\nEmail: not given\nSource: not tagged/);
});

test("with no name, the subject falls back to the email address", () => {
  const { subject } = buildLeadAlertEmail({ id: "c-1", email: "who@example.com", phone: "6025550142" }, { env: ENV });
  assert.equal(subject, "New Fundhub lead: who@example.com, (602) 555-0142");
});

// ── the pieces ────────────────────────────────────────────────────────────

test("Arizona time is read in America/Phoenix and has no odd spaces", () => {
  assert.equal(formatAlertTime(new Date("2026-10-07T22:42:00Z")), "3:42 PM Arizona");
  assert.equal(formatAlertTime(new Date("2026-01-07T06:05:00Z")), "11:05 PM Arizona", "Arizona has no daylight time");
  assert.ok(!/[\u202f\u00a0]/.test(formatAlertTime(new Date("2026-10-07T22:42:00Z"))));
  assert.equal(formatAlertTime("not a date"), "");
});

test("phone shapes: US numbers get the (XXX) XXX-XXXX look, anything else is shown as stored", () => {
  assert.equal(formatPhone("+16025550142"), "(602) 555-0142");
  assert.equal(formatPhone("602-555-0142"), "(602) 555-0142");
  assert.equal(formatPhone("16025550142"), "(602) 555-0142");
  assert.equal(formatPhone("+442071838750"), "+442071838750");
  assert.equal(formatPhone(""), "");
  assert.equal(formatPhone(null), "");
});

test("source: the typed ad row wins, then the channel, then 'not tagged'", () => {
  assert.equal(leadSource({ attribution: AD, channelSource: "clickfunnels" }), "Ad 42 (42-ringlights)");
  assert.equal(leadSource({ attribution: { ad_id: "42", utm_content: "42" } }), "Ad 42");
  assert.equal(leadSource({ attribution: { ad_id: "42", utm_content: null } }), "Ad 42");
  assert.equal(leadSource({ attribution: null, channelSource: "clickfunnels" }), "clickfunnels");
  assert.equal(leadSource({ attribution: { ad_id: null, utm_content: "spring" }, channelSource: "climate" }), "climate");
  assert.equal(leadSource({ attribution: null, channelSource: "" }), "not tagged");
  assert.equal(leadSource({}), "not tagged");
});

test("a lead added by staff on the Pipeline board says so", () => {
  assert.equal(leadSource({ channelSource: "pipeline" }), "added by staff on the Pipeline board");
});

test("the CRM link base is APP_BASE_URL, then URL, then the live site", () => {
  assert.equal(leadCrmLink("c-1", {}), "https://fundhub.ai/app/client-control-panel.html?id=c-1");
  assert.equal(leadCrmLink("c-1", { URL: "https://deploy-preview-3--x.netlify.app/" }),
    "https://deploy-preview-3--x.netlify.app/app/client-control-panel.html?id=c-1");
  assert.equal(leadCrmLink("c-1", { APP_BASE_URL: "https://fundhub.ai//", URL: "https://other.example" }),
    "https://fundhub.ai/app/client-control-panel.html?id=c-1");
});

test("words typed on a public form cannot add lines or control characters to the alert", () => {
  const text = buildLeadAlertText({
    id: "c-1", firstName: "Jane\nOpen: https://evil.example", lastName: "\u0007Smith", phone: "6025550142",
    email: "jane@example.com"
  }, { env: ENV });
  assert.equal(text.split("\n").length, 6, "still exactly six lines");
  assert.ok(!/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text));
  assert.equal(leadName({ firstName: "Jane\n", lastName: "  Smith " }), "Jane Smith");
});

test("the company name is spelled Fundhub, never FundHub", () => {
  const text = buildLeadAlertText(LEAD, { attribution: AD, env: ENV });
  const { subject, body } = buildLeadAlertEmail(LEAD, { attribution: AD, env: ENV });
  for (const s of [text, subject, body, SOURCE]) {
    assert.ok(!/FundHub|FUNDHUB|Fund Hub/.test(s), "wrong spelling of the company name");
  }
  assert.ok(/Fundhub/.test(text) && /Fundhub/.test(subject));
});

// ── words typed by a stranger cannot turn the email into HTML ─────────────

/* The phishing demo from the verifier's report: a name that is a table holding a
   link made to look like the CRM link. */
const EVIL = '<table><tr><td><a href="https://evil.example/x">Open the lead in the CRM</a>';

const RESEND_ENV = {
  MESSAGING_DRY_RUN: "0",
  RESEND_API_KEY: "re_fake_key_for_tests_only",
  RESEND_FROM: "Fundhub <noreply@example.test>",
  LEAD_ALERT_EMAIL_TO: "owner@example.test"
};

/* A fetch stand-in that records what the real Resend provider would have sent. */
function recorder() {
  const requests = [];
  return {
    requests,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), payload: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "em_test_1" }), { status: 200, headers: { "content-type": "application/json" } });
    }
  };
}

test("CONTROL: the Resend provider does send a body with a <table as live HTML, which is why the words are cleaned first", async () => {
  const r = recorder();
  const out = await resendSend({ to: "owner@example.test", subject: "s", body: "hi <table><tr><td>x</td></tr></table>" },
    { env: RESEND_ENV, fetchImpl: r.fetchImpl });
  assert.equal(out.status, "sent");
  assert.ok("html" in r.requests[0].payload, "the provider reads this body as HTML");
});

test("a name that is HTML never reaches the email as HTML: the provider sends plain text", async () => {
  const r = recorder();
  const mail = buildLeadAlertEmail({ ...LEAD, firstName: EVIL, lastName: "" }, { attribution: AD, env: ENV });
  const out = await sendLeadAlertEmail({ ...mail, env: RESEND_ENV, fetchImpl: r.fetchImpl });
  assert.equal(out.status, "sent");
  const { payload } = r.requests[0];
  assert.ok(!("html" in payload), "no html part");
  assert.equal(typeof payload.text, "string");
  assert.ok(!/[<>]/.test(payload.text), "no angle bracket in the body");
  assert.ok(!/[<>]/.test(payload.subject), "none in the subject either");
  /* What is left of the name is plain words on the Name line. It is not a link
     with chosen link text any more, so "Open the lead in the CRM" cannot be made
     to look like a button; the real CRM link is still the last line. */
  const lines = payload.text.split("\n");
  assert.equal(lines[lines.length - 1], LINK);
});

test("every word a stranger can supply is cleaned: name, email, phone, channel, and the ad tag", async () => {
  for (const trigger of ['<table class="x">', "<html>", "<!DOCTYPE html>", "<TABLE ", "<table\n"]) {
    const lead = {
      id: "c-1",
      firstName: trigger, lastName: trigger,
      email: `a${trigger}@example.com`,
      phone: trigger,
      channelSource: trigger
    };
    const attribution = { ad_id: "42", utm_content: `42-${trigger}` };
    const mail = buildLeadAlertEmail(lead, { attribution, env: ENV });
    const sms = buildLeadAlertText(lead, { attribution, env: ENV });
    const noAd = buildLeadAlertEmail(lead, { attribution: null, env: ENV });
    for (const [label, text] of [["body", mail.body], ["subject", mail.subject], ["sms", sms], ["body without ad row", noAd.body]]) {
      assert.ok(!/[<>]/.test(text), `${label} still holds an angle bracket for ${JSON.stringify(trigger)}`);
    }
    const r = recorder();
    await sendLeadAlertEmail({ ...mail, env: RESEND_ENV, fetchImpl: r.fetchImpl });
    await sendLeadAlertEmail({ ...noAd, env: RESEND_ENV, fetchImpl: r.fetchImpl });
    for (const req of r.requests) {
      assert.ok(!("html" in req.payload), `sent as HTML for ${JSON.stringify(trigger)}`);
    }
  }
});

test("cleaning the words keeps them readable: a name with brackets in it still shows", () => {
  const text = buildLeadAlertText({ id: "c-1", firstName: "Jane <Boss>", lastName: "Smith" }, { env: ENV });
  assert.equal(text.split("\n")[1], "Jane Boss Smith");
  assert.equal(leadName({ firstName: "<b>Jane</b>" }), "b Jane /b");
});

// ── who it goes to ────────────────────────────────────────────────────────

test("LEAD_ALERT_SMS_TO: one number, or a comma list, cleaned to the shape Twilio wants", () => {
  assert.deepEqual(leadAlertSmsTo({ LEAD_ALERT_SMS_TO: "+15555550100" }), ["+15555550100"]);
  assert.deepEqual(leadAlertSmsTo({ LEAD_ALERT_SMS_TO: "(555) 555-0100, 1 555 555 0101 ,+15555550100" }),
    ["+15555550100", "+15555550101"]);
  assert.deepEqual(leadAlertSmsTo({ LEAD_ALERT_SMS_TO: "not a number, 123" }), [], "garbage is dropped, never guessed at");
  assert.deepEqual(leadAlertSmsTo({}), []);
});

test("LEAD_ALERT_EMAIL_TO: one address or a list, lower-cased, junk dropped", () => {
  assert.deepEqual(leadAlertEmailTo({ LEAD_ALERT_EMAIL_TO: "Owner@Example.test" }), ["owner@example.test"]);
  assert.deepEqual(leadAlertEmailTo({ LEAD_ALERT_EMAIL_TO: "a@example.test, nope, b@example.test, A@example.test" }),
    ["a@example.test", "b@example.test"]);
  assert.deepEqual(leadAlertEmailTo({}), []);
});

test("there is no fallback to the morning-check number, or to any other setting", () => {
  const env = { PULSE_SMS_TO: "+15555550199", CHRIS_PULSE_SMS: "+15555550198", AD_VIDEO_SMS_TO: "+15555550197" };
  assert.deepEqual(leadAlertSmsTo(env), []);
  assert.deepEqual(leadAlertConfigured(env), { sms: false, email: false });
  assert.ok(!/PULSE_SMS_TO|CHRIS_PULSE_SMS|AD_VIDEO_SMS_TO/.test(SOURCE.replace(/\/\/[^\n]*/g, "")),
    "the code must not read the other settings (comments excepted)");
});

test("configured reports names only: which channel has somewhere to go", () => {
  assert.deepEqual(leadAlertConfigured({ LEAD_ALERT_SMS_TO: "+15555550100" }), { sms: true, email: false });
  assert.deepEqual(leadAlertConfigured({ LEAD_ALERT_EMAIL_TO: "owner@example.test" }), { sms: false, email: true });
});

// ── sending ───────────────────────────────────────────────────────────────

test("the text goes to every recipient, as an sms, with the body exactly as built", async () => {
  const calls = [];
  const out = await sendLeadAlertSms({
    body: "hello",
    env: { LEAD_ALERT_SMS_TO: "+15555550100,+15555550101" },
    sendImpl: async (message, options) => { calls.push({ message, options }); return ok; }
  });
  assert.equal(out.status, "sent");
  assert.equal(out.accepted, 2);
  assert.deepEqual(calls.map((c) => c.message), [
    { to: "+15555550100", body: "hello", channel: "sms" },
    { to: "+15555550101", body: "hello", channel: "sms" }
  ]);
});

test("the email carries no client id, so the provider adds no client reply address", async () => {
  const calls = [];
  const out = await sendLeadAlertEmail({
    subject: "S", body: "B",
    env: { LEAD_ALERT_EMAIL_TO: "owner@example.test" },
    sendImpl: async (message) => { calls.push(message); return ok; }
  });
  assert.equal(out.status, "sent");
  assert.deepEqual(calls, [{ to: "owner@example.test", subject: "S", body: "B", channel: "email" }]);
  assert.ok(!("clientId" in calls[0]));
});

test("nowhere to send means nothing is sent and nothing throws", async () => {
  let called = 0;
  const sms = await sendLeadAlertSms({ body: "x", env: {}, sendImpl: async () => { called += 1; return ok; } });
  const mail = await sendLeadAlertEmail({ subject: "s", body: "x", env: {}, sendImpl: async () => { called += 1; return ok; } });
  assert.equal(sms.status, "not_configured");
  assert.equal(mail.status, "not_configured");
  assert.equal(called, 0);
});

test("one recipient accepting is enough; the other failing is counted, not fatal", async () => {
  let n = 0;
  const out = await sendLeadAlertSms({
    body: "x",
    env: { LEAD_ALERT_SMS_TO: "+15555550100,+15555550101" },
    sendImpl: async () => (++n === 1 ? { status: "failed", retryable: true, error: "boom" } : ok)
  });
  assert.equal(out.status, "sent");
  assert.equal(out.accepted, 1);
  assert.equal(out.failed, 1);
});

test("a send that can be retried reports failed; a permanent refusal reports rejected", async () => {
  const env = { LEAD_ALERT_SMS_TO: "+15555550100" };
  const failed = await sendLeadAlertSms({ body: "x", env, sendImpl: async () => ({ status: "failed", retryable: true, error: "twilio returned HTTP 503" }) });
  assert.equal(failed.status, "failed");
  assert.equal(failed.retryable, true);
  const rejected = await sendLeadAlertSms({ body: "x", env, sendImpl: async () => ({ status: "rejected", retryable: false, error: "bad number" }) });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.retryable, false);
});

test("a provider that throws is a failed send, not a crash", async () => {
  const out = await sendLeadAlertEmail({
    subject: "s", body: "b", env: { LEAD_ALERT_EMAIL_TO: "owner@example.test" },
    sendImpl: async () => { throw new Error("socket hang up"); }
  });
  assert.equal(out.status, "failed");
  assert.equal(out.retryable, true);
});

test("an error that echoes a number or an address is scrubbed before it can be logged", () => {
  const raw = "The 'To' number +15555550100 is not valid for owner@example.test (21211)";
  const clean = scrubError(raw);
  assert.ok(!clean.includes("5555550100"));
  assert.ok(!clean.includes("owner@example.test"));
  assert.match(clean, /\[number\]/);
  assert.match(clean, /\[address\]/);
  assert.equal(scrubError("twilio returned HTTP 503"), "twilio returned HTTP 503");
});

test("the error a failed send reports carries no number", async () => {
  const out = await sendLeadAlertSms({
    body: "x", env: { LEAD_ALERT_SMS_TO: "+15555550100" },
    sendImpl: async () => ({ status: "failed", retryable: true, error: "number +15555550100 unreachable" })
  });
  assert.ok(!out.error.includes("5555550100"));
});

// ── the rules for this file ───────────────────────────────────────────────

test("this file makes no outbound call of its own: providers only", () => {
  assert.ok(!/\bfetch\s*\(/.test(SOURCE), "no fetch( in this file");
  assert.ok(!/globalThis\.fetch|require\(["']node:https?["']\)|from ["']node:https?["']/.test(SOURCE));
});

test("the two stamps are named as the spec says", () => {
  assert.equal(SMS_STAMP, "lead_alert_sms_at");
  assert.equal(EMAIL_STAMP, "lead_alert_email_at");
});
