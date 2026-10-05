import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { handle, REMINDERS, sDocReminders } from "./s-doc-reminders.mjs";
import {
  handle as requestDocs,
  EMAIL_TEMPLATE_KEY as REQUEST_EMAIL,
  SMS_TEMPLATE_KEY as REQUEST_SMS
} from "./s-doc-collection.mjs";
import { FUNDING_DOC_HOLD } from "../inquiry-ops/doc-gate.mjs";
import { extractTags, classifyTag } from "../messaging/merge-tags-registry.mjs";
import { isDraftTemplateRow } from "../messaging/draft-guard.mjs";
import { pgFake, fakeStep, ev } from "./test-support.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(HERE, "../../db/seed/037_doc_reminder_texts.sql");
const KEYS = REMINDERS.map((r) => r.templateKey);

// 11:00 and 21:00 in Arizona (UTC-7, no daylight saving) on 2026-10-05.
const DAYTIME = () => new Date("2026-10-05T18:00:00Z");
const NIGHT = () => new Date("2026-10-06T04:00:00Z");
const NEXT_8AM = "2026-10-06T15:00:00.000Z";

const templates = () => [
  { org_id: "org-1", template_key: REQUEST_EMAIL, channel: "email", body: "docs needed", compliance_passed: true },
  { org_id: "org-1", template_key: REQUEST_SMS, channel: "sms", body: "docs needed sms", compliance_passed: true },
  ...KEYS.map((k) => ({ org_id: "org-1", template_key: k, channel: "sms", body: `${k} for {{contact.first_name}}`, compliance_passed: true }))
];

/* pgFake plus the four reads this workflow adds: the "already asked" read,
   the upload read, opt-outs, and nothing else. `uploads` and `uploadEvents`
   are live arrays, so a test can make an upload land mid-sleep. */
function docsDb({ customFields = { round_hold_reason: FUNDING_DOC_HOLD }, asked = true, email = "a@b.com" } = {}) {
  const db = pgFake({
    clients: [{ id: "cl-1", org_id: "org-1", first_name: "Dana", email, phone: "+16025550100", custom_fields: { ...customFields } }],
    templates: templates()
  });
  db.uploads = [];
  db.uploadEvents = [];
  db.optOuts = [];
  if (asked) db.messages.push({ org_id: "org-1", client_id: "cl-1", channel: "sms", template_key: REQUEST_SMS, provider_ref: "workflow:SMS-DOC-01-REQUEST:evt-0" });
  const base = db.query.bind(db);
  db.query = async (sql, params = []) => {
    if (/FROM documents/.test(sql) && /FROM events/.test(sql)) {
      const [orgId, clientId] = params;
      const doc = db.uploads.some((d) => d.org_id === orgId && d.client_id === clientId && d.kind === "client_upload");
      const evt = db.uploadEvents.some((e) => e.org_id === orgId && e.client_id === clientId &&
        (e.name === "docs.received" || e.name === "repair.docs.complete"));
      return { rows: [{ uploaded: doc || evt }] };
    }
    if (/SELECT 1 FROM messages/.test(sql) && /template_key IN/.test(sql)) {
      const [clientId, ...keys] = params;
      return { rows: db.messages.filter((m) => m.client_id === clientId && keys.includes(m.template_key)).slice(0, 1).map(() => ({ one: 1 })) };
    }
    if (/FROM opt_outs/.test(sql)) {
      const [clientId, channel] = params;
      return { rows: db.optOuts.filter((o) => o.client_id === clientId && o.channel === channel).map(() => ({ one: 1 })) };
    }
    return base(sql, params);
  };
  return db;
}

const reminders = (db) => db.messages.filter((m) => KEYS.includes(m.template_key));
const event = (extra = {}) => ev("deposit.paid", {}, { id: "evt-dep-1", clientId: "cl-1", ...extra });

/* A step that records what it was asked to do and can change the world while
   it "sleeps": onSleep(id) runs at each sleep, in order. */
function recordingStep(onSleep = () => {}) {
  const log = { sleeps: [], runs: [] };
  return {
    log,
    run: (id, fn) => { log.runs.push(id); return fn(); },
    sleep: async (id, duration) => { log.sleeps.push({ id, duration }); onSleep(id); },
    sleepUntil: async (id, when) => { log.sleeps.push({ id, until: new Date(when).toISOString() }); onSleep(id); }
  };
}

// ── the whole path ───────────────────────────────────────────────────────────

test("deposit.paid: the request, then a text on day 1, 3 and 5 while nothing is uploaded", async () => {
  const db = docsDb({ customFields: {}, asked: false });
  await requestDocs({ event: event(), db, step: fakeStep() });
  const res = await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });

  assert.equal(res.stopped, null);
  assert.deepEqual(db.messages.map((m) => m.template_key), [REQUEST_EMAIL, REQUEST_SMS, ...KEYS]);
  for (const m of reminders(db)) {
    assert.equal(m.channel, "sms");
    assert.equal(m.rendered_body, `${m.template_key} for Dana`);
  }
});

test("structure: sleeps of 1, 2 and 2 days, and every text comes right after its own check", async () => {
  const step = recordingStep();
  await handle({ event: event(), db: docsDb(), step, now: DAYTIME });

  assert.deepEqual(step.log.sleeps, [
    { id: "wait-day-1", duration: "1d" },
    { id: "wait-day-3", duration: "2d" },
    { id: "wait-day-5", duration: "2d" }
  ]);
  for (const { day } of REMINDERS) {
    const runs = step.log.runs;
    assert.equal(runs.indexOf(`send-day-${day}`) - runs.indexOf(`check-day-${day}`), 1, `day ${day}: check, then send`);
  }
});

// ── it stops when an upload lands ────────────────────────────────────────────

for (const [label, land] of [
  ["a client_upload document", (db) => db.uploads.push({ org_id: "org-1", client_id: "cl-1", kind: "client_upload" })],
  ["a docs.received event", (db) => db.uploadEvents.push({ org_id: "org-1", client_id: "cl-1", name: "docs.received" })],
  ["a repair.docs.complete event", (db) => db.uploadEvents.push({ org_id: "org-1", client_id: "cl-1", name: "repair.docs.complete" })]
]) {
  test(`already uploaded (${label}): no text at all`, async () => {
    const db = docsDb();
    land(db);
    const res = await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
    assert.deepEqual([res.stopped, res.atDay], ["uploaded", 1]);
    assert.equal(reminders(db).length, 0);
  });
}

test("an upload from another client or another company does not stop this one", async () => {
  const db = docsDb();
  db.uploads.push({ org_id: "org-1", client_id: "cl-2", kind: "client_upload" });
  db.uploadEvents.push({ org_id: "org-2", client_id: "cl-1", name: "docs.received" });
  db.uploads.push({ org_id: "org-1", client_id: "cl-1", kind: "dispute_letter" });
  await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
  assert.deepEqual(reminders(db).map((m) => m.template_key), KEYS);
});

test("an upload lands while it sleeps before day 3: day 1 went, nothing after", async () => {
  const db = docsDb();
  const step = recordingStep((id) => {
    if (id === "wait-day-3") db.uploadEvents.push({ org_id: "org-1", client_id: "cl-1", name: "docs.received" });
  });
  const res = await handle({ event: event(), db, step, now: DAYTIME });
  assert.deepEqual([res.stopped, res.atDay], ["uploaded", 3]);
  assert.deepEqual(reminders(db).map((m) => m.template_key), ["SMS-DOC-REMIND-DAY1"]);
  assert.ok(!step.log.runs.includes("send-day-3") && !step.log.runs.includes("send-day-5"));
});

test("an upload lands while it sleeps before day 5: day 1 and 3 went, not day 5", async () => {
  const db = docsDb();
  const step = recordingStep((id) => {
    if (id === "wait-day-5") db.uploads.push({ org_id: "org-1", client_id: "cl-1", kind: "client_upload" });
  });
  const res = await handle({ event: event(), db, step, now: DAYTIME });
  assert.deepEqual([res.stopped, res.atDay], ["uploaded", 5]);
  assert.deepEqual(reminders(db).map((m) => m.template_key), ["SMS-DOC-REMIND-DAY1", "SMS-DOC-REMIND-DAY3"]);
});

test("cancelOn: a docs.received for the same client ends the run, and a missing client id never matches", () => {
  assert.equal(sDocReminders.id(), "s-doc-reminders");
  assert.deepEqual(sDocReminders.opts.triggers, [{ event: "deposit.paid" }]);
  assert.deepEqual(sDocReminders.opts.cancelOn, [{
    event: "docs.received",
    if: "event.data.clientId != null && event.data.clientId == async.data.clientId"
  }]);
});

// ── quiet hours ──────────────────────────────────────────────────────────────

test("a wake at 9pm Arizona waits until 8am before it checks or texts", async () => {
  const step = recordingStep();
  await handle({ event: event(), db: docsDb(), step, now: NIGHT });
  const waits = step.log.sleeps.filter((s) => s.until);
  assert.deepEqual(waits.map((s) => s.id), ["wait-quiet-hours-day-1", "wait-quiet-hours-day-3", "wait-quiet-hours-day-5"]);
  assert.ok(waits.every((s) => s.until === NEXT_8AM));
  const runs = step.log.runs;
  assert.ok(runs.indexOf("check-day-1") > runs.indexOf("quiet-hours-wake-day-1"));
});

test("an upload during the night wait: nothing goes out in the morning", async () => {
  const db = docsDb();
  const step = recordingStep((id) => {
    if (id === "wait-quiet-hours-day-1") db.uploads.push({ org_id: "org-1", client_id: "cl-1", kind: "client_upload" });
  });
  const res = await handle({ event: event(), db, step, now: NIGHT });
  assert.deepEqual([res.stopped, res.atDay], ["uploaded", 1]);
  assert.equal(reminders(db).length, 0);
});

test("a wake at 11am does not wait, and a prove/sim file skips the night wait like every other text", async () => {
  const day = recordingStep();
  await handle({ event: event(), db: docsDb(), step: day, now: DAYTIME });
  assert.equal(day.log.sleeps.filter((s) => s.until).length, 0);

  const sim = recordingStep();
  await handle({ event: event(), db: docsDb({ email: "chris+sim-7@fundhub.ai" }), step: sim, now: NIGHT });
  assert.equal(sim.log.sleeps.filter((s) => s.until).length, 0);
});

// ── wrong stage gets nothing ─────────────────────────────────────────────────

test("never asked (no DOC-01 request on file): no text", async () => {
  const db = docsDb({ asked: false });
  const res = await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
  assert.equal(res.stopped, "never_asked");
  assert.equal(reminders(db).length, 0);
});

for (const hold of ["Funding Paused", "Fraud Alert", "New Inquiries", null]) {
  test(`on hold for "${hold}" instead of documents: no text`, async () => {
    const db = docsDb({ customFields: { round_hold_reason: hold } });
    const res = await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
    assert.equal(res.stopped, "not_on_doc_hold");
    assert.equal(reminders(db).length, 0);
  });
}

test("the documents hold is cleared after day 1: no day 3 or day 5", async () => {
  const db = docsDb();
  const step = recordingStep((id) => {
    if (id === "wait-day-3") db.clients[0].custom_fields.round_hold_reason = null;
  });
  const res = await handle({ event: event(), db, step, now: DAYTIME });
  assert.deepEqual([res.stopped, res.atDay], ["not_on_doc_hold", 3]);
  assert.deepEqual(reminders(db).map((m) => m.template_key), ["SMS-DOC-REMIND-DAY1"]);
});

test("no client on the event, or no company: nothing", async () => {
  const db = docsDb();
  const noClient = await handle({ event: ev("deposit.paid", {}, { id: "evt-x" }), db, step: fakeStep(), now: DAYTIME });
  assert.equal(noClient.done, false);
  const noOrg = await handle({ event: event({ orgId: null }), db, step: fakeStep(), now: DAYTIME });
  assert.deepEqual([noOrg.done, noOrg.reason], [false, "no_org"]);
  assert.equal(reminders(db).length, 0);
});

test("opted out of texts: nothing is queued and the run ends", async () => {
  const db = docsDb();
  db.optOuts.push({ client_id: "cl-1", channel: "sms" });
  const res = await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
  assert.deepEqual([res.stopped, res.atDay], ["opted_out", 1]);
  assert.equal(reminders(db).length, 0);
});

// ── never twice ──────────────────────────────────────────────────────────────

test("the same deposit.paid delivered twice: still one of each text", async () => {
  const db = docsDb();
  await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
  await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
  assert.deepEqual(reminders(db).map((m) => m.template_key), KEYS);
});

test("a second, different deposit.paid for the same client: still one of each text", async () => {
  const db = docsDb();
  await handle({ event: event(), db, step: fakeStep(), now: DAYTIME });
  await handle({ event: event({ id: "evt-dep-2" }), db, step: fakeStep(), now: DAYTIME });
  assert.deepEqual(reminders(db).map((m) => m.template_key), KEYS);
  assert.deepEqual(reminders(db).map((m) => m.provider_ref), KEYS.map((k) => `workflow:${k}:doc-remind:cl-1`));
});

// ── it only queues ───────────────────────────────────────────────────────────

test("the workflow only queues: no fetch, no provider, and no other outbound path", () => {
  const src = fs.readFileSync(path.resolve(HERE, "s-doc-reminders.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\bfetch\s*\(/.test(src), "no fetch");
  assert.ok(!/messaging\/providers/.test(src), "no provider import");
  assert.ok(!/INSERT INTO messages/.test(src), "rows are written by sendTemplated only");
});

// ── the words ────────────────────────────────────────────────────────────────

test("seed 037: one body per reminder, in the DOC-01 voice, with the opt-out line and nothing promised", () => {
  const sql = fs.readFileSync(SEED, "utf8");
  const bodies = Object.fromEntries(
    [...sql.matchAll(/\('(SMS-DOC-REMIND-[A-Z0-9]+)',\s*\$c\$([\s\S]*?)\$c\$\)/g)].map((m) => [m[1], m[2]])
  );
  assert.deepEqual(Object.keys(bodies).sort(), [...KEYS].sort());
  assert.match(sql, /SELECT o\.id, k\.template_key, 'sms', NULL, k\.body, true/);
  assert.match(sql, /ON CONFLICT \(org_id, template_key\) DO UPDATE SET/);

  for (const [key, body] of Object.entries(bodies)) {
    assert.ok(body.startsWith("Hey {{contact.first_name}}, Fundhub. "), `${key} opens like SMS-DOC-01-REQUEST`);
    assert.ok(body.endsWith(" Reply STOP to opt out."), `${key} keeps the opt-out line`);
    assert.ok(body.includes("{{portal_url}}"), `${key} carries the portal link`);
    assert.ok(!/FundHub|FUNDHUB|Fund Hub/.test(body), `${key} spells Fundhub right`);
    assert.ok(!/approv|guarantee|credit score|\$\d|\d+%|deadline/i.test(body), `${key} promises nothing`);
    assert.ok(!/[—‘’“”]/.test(body), `${key} is plain text, no curly quotes or long dashes`);
    assert.equal(isDraftTemplateRow({ body }), false, `${key} is not a draft`);
    for (const tag of extractTags(body)) assert.equal(classifyTag(tag), "resolvable", `${key}: {{${tag}}}`);
  }
});
