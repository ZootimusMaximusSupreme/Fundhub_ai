// Meta ShowedCall — unit tests. A stand-in sender only: nothing here reaches Meta.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  onCallCompletedForMeta,
  showedCallTrigger,
  showedCallEventId,
  register,
  SHOWED_CALL_EVENT
} from "./meta-showed-call.mjs";
import { clearHandlers, getHandlers } from "../events/registry.mjs";
import { sha256 } from "../meta/user-data.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const LOG_ID = "33333333-3333-4333-8333-333333333333";
const FBC = "fb.1.1700000000000.AbCdEf123";
const FBP = "fb.1.1700000000000.1234567890";

function fakeDb(client = {}) {
  const recorded = [];
  const row = {
    id: CLIENT, email: "Dana.Person@Gmail.com", phone: "+1 (602) 555-0142", is_demo: false,
    custom_fields: { meta_fbc: FBC, meta_fbp: FBP }, ...client
  };
  return {
    recorded,
    async query(sql, params) {
      if (/FROM clients WHERE org_id/.test(sql)) return { rows: params[1] === row.id ? [row] : [] };
      if (/UPDATE events SET payload/.test(sql)) {
        recorded.push({ note: JSON.parse(params[0]).meta, eventId: params[1] });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

function fakeSender(result = { ok: true, sent: 1 }) {
  const calls = [];
  const send = async (events, opts) => { calls.push({ events, opts }); return result; };
  return { calls, send };
}

const closerLog = (outcome, payload = {}) => ({
  id: "evt-1",
  name: "call.completed",
  orgId: ORG,
  clientId: CLIENT,
  payload: { clientId: CLIENT, orgId: ORG, outcome, disposition: "closer", callOutcomeId: LOG_ID, ...payload }
});
const NOW = () => Date.parse("2026-10-05T19:00:00Z");

for (const outcome of ["deposit", "downsell", "callback", "not_a_fit"]) {
  test(`ShowedCall: a closer log of ${outcome} sends one ShowedCall`, async () => {
    const db = fakeDb();
    const s = fakeSender();
    const res = await onCallCompletedForMeta(closerLog(outcome), db, { sendMetaEvents: s.send, now: NOW, env: { META_CAPI_ENABLED: "1" } });
    assert.equal(res.sent, true);
    assert.equal(s.calls.length, 1);
    const [ev] = s.calls[0].events;
    assert.equal(s.calls[0].events.length, 1);
    assert.equal(ev.event_name, "ShowedCall");
    assert.equal(ev.event_id, `showed.${LOG_ID}`);
    assert.equal(ev.action_source, "system_generated");
    assert.equal(ev.event_time, Math.floor(NOW() / 1000));
    assert.equal(ev.custom_data, undefined);
    assert.deepEqual(ev.user_data.em, [sha256("dana.person@gmail.com")]);
    assert.ok(Array.isArray(ev.user_data.ph) && ev.user_data.ph.length === 1, "phone is hashed");
    assert.deepEqual(ev.user_data.external_id, [sha256(CLIENT)]);
    assert.equal(ev.user_data.fbc, FBC);
    assert.equal(ev.user_data.fbp, FBP);
    assert.ok(!JSON.stringify(ev).includes("Dana.Person"), "no raw email goes out");
    assert.equal(db.recorded.length, 1);
    assert.equal(db.recorded[0].eventId, "evt-1");
    assert.equal(db.recorded[0].note.event_name, "ShowedCall");
    assert.equal(db.recorded[0].note.ok, true);
    assert.equal(db.recorded[0].note.sent, 1);
    assert.equal(db.recorded[0].note.outcome, outcome);
  });
}

test("ShowedCall: a closer's No show, an AI-setter call and other events send nothing and write nothing", async () => {
  const db = fakeDb();
  const s = fakeSender();
  const cases = [
    closerLog("no_show"),
    { id: "evt-2", name: "call.completed", orgId: ORG, clientId: CLIENT, payload: { source: "bland", disposition: "voicemail", outcome: "no_answer" } },
    { id: "evt-3", name: "call.completed", orgId: ORG, clientId: CLIENT, payload: { source: "bland", disposition: "transferred", outcome: "transferred" } },
    { id: "evt-4", name: "booking.created", orgId: ORG, clientId: CLIENT, payload: { outcome: "deposit", disposition: "closer" } }
  ];
  for (const e of cases) {
    const res = await onCallCompletedForMeta(e, db, { sendMetaEvents: s.send });
    assert.equal(res.skip, "not_a_trigger");
  }
  assert.equal(s.calls.length, 0);
  assert.equal(db.recorded.length, 0);
});

test("ShowedCall: demo clients and company / test emails are skipped, and the skip is written down", async () => {
  for (const [client, skip] of [
    [{ is_demo: true }, "demo_client"],
    [{ email: "chris@fundhub.ai" }, "agent"],
    [{ email: "lead@example.com" }, "agent"],
    [{ email: null, phone: null }, "no_user_data"],
    [{ id: "someone-else" }, "client_missing"]
  ]) {
    const db = fakeDb(client);
    const s = fakeSender();
    const res = await onCallCompletedForMeta(closerLog("deposit"), db, { sendMetaEvents: s.send });
    assert.equal(res.skip, skip);
    assert.equal(s.calls.length, 0);
    assert.equal(db.recorded[0].note.skipped, skip);
  }
});

test("ShowedCall: a replay of an event already sent sends nothing", async () => {
  const db = fakeDb();
  const s = fakeSender();
  const res = await onCallCompletedForMeta(closerLog("deposit", { meta: { ok: true, sent: 1 } }), db, { sendMetaEvents: s.send });
  assert.equal(res.skip, "already_sent");
  assert.equal(s.calls.length, 0);
});

test("ShowedCall: a sender failure never throws; the error is written on the event row", async () => {
  const db = fakeDb();
  const res = await onCallCompletedForMeta(closerLog("callback"), db, {
    sendMetaEvents: async () => { throw new Error("graph 500"); }
  });
  assert.equal(res.sent, false);
  assert.equal(db.recorded[0].note.ok, false);
  assert.match(db.recorded[0].note.error, /graph 500/);
});

test("ShowedCall: a database failure never throws", async () => {
  const db = { query: async () => { throw new Error("connection reset"); } };
  const res = await onCallCompletedForMeta(closerLog("deposit"), db, { sendMetaEvents: fakeSender().send });
  assert.equal(res.sent, false);
  assert.equal(res.skip, "error");
});

test("ShowedCall: the real sender with META_CAPI_ENABLED off sends nothing", async () => {
  const db = fakeDb();
  const res = await onCallCompletedForMeta(closerLog("deposit"), db, {
    env: {},
    fetchImpl: async () => { throw new Error("must not reach the network"); }
  });
  assert.equal(res.sent, false);
  assert.equal(db.recorded[0].note.skipped, "disabled");
  assert.equal(db.recorded[0].note.sent, 0);
});

test("ShowedCall: event id is showed.<closer log id>, or the event's own id for an older event", () => {
  assert.equal(showedCallEventId({ callOutcomeId: LOG_ID }, "evt-9"), `showed.${LOG_ID}`);
  assert.equal(showedCallEventId({}, "evt-9"), "showed.evt-9");
  assert.equal(showedCallEventId({}, null), null);
  assert.equal(showedCallTrigger("call.completed", { disposition: "closer", outcome: "not_a_fit" }), true);
  assert.equal(showedCallTrigger("call.completed", { disposition: "closer", outcome: "no_show" }), false);
  assert.equal(SHOWED_CALL_EVENT, "ShowedCall");
});

test("ShowedCall: registered on call.completed", () => {
  clearHandlers();
  register();
  assert.deepEqual(getHandlers("call.completed"), [onCallCompletedForMeta]);
  clearHandlers();
});
