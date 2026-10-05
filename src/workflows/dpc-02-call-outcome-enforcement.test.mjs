import { test } from "node:test";
import assert from "node:assert";
import {
  handle,
  handleLateShow,
  callHappened,
  dpc02CallOutcomeEnforcement,
  dpc02LateShow
} from "./dpc-02-call-outcome-enforcement.mjs";
import { s05aNoShowRecovery } from "./s-05a-no-show-recovery.mjs";
import { pgFake, fakeStep, ev } from "./test-support.mjs";

const withStages = () => ({
  pipelineStages: [
    { pipeline_key: "sales", stage_key: "showed", pipeline_id: "pl-sales", stage_id: "st-showed", sort_order: 4 },
    { pipeline_key: "sales", stage_key: "closed_won", pipeline_id: "pl-sales", stage_id: "st-won", sort_order: 7 },
    { pipeline_key: "sales", stage_key: "lost", pipeline_id: "pl-sales", stage_id: "st-lost", sort_order: 9 }
  ]
});

const HOUR = 60 * 60 * 1000;
// A booking ending 1 hour from now.
const futureEnd = () => new Date(Date.now() + HOUR).toISOString();
// A 30-minute call starting in 30 minutes, and a closer log 10 minutes after it ends.
const callTimes = () => {
  const start = Date.now() + 30 * 60 * 1000;
  return {
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + 30 * 60 * 1000).toISOString(),
    loggedAt: new Date(start + 40 * 60 * 1000).toISOString(),
    before: new Date(start - 24 * HOUR).toISOString()
  };
};
const client = (custom_fields = {}) => ({ id: "cl-1", org_id: "org-1", email: "a@b.com", custom_fields });

test("sleepUntil is set to appointment end + 5 minutes, not a flat duration", async () => {
  const endTime = futureEnd();
  const expectedWake = new Date(new Date(endTime).getTime() + 5 * 60 * 1000);
  const sleepUntilCalls = [];
  const step = { ...fakeStep(), sleepUntil: async (id, target) => { sleepUntilCalls.push({ id, target }); } };
  const db = pgFake({ clients: [client()], ...withStages() });
  await handle({ event: ev("booking.created", { endTime }, { clientId: "cl-1" }), db, step });
  assert.equal(sleepUntilCalls.length, 1);
  assert.equal(sleepUntilCalls[0].id, "wait-until-5-min-after-end");
  // Target must be at least endTime + 5m (within 1 second tolerance for test runtime).
  assert.ok(Math.abs(sleepUntilCalls[0].target.getTime() - expectedWake.getTime()) < 1000,
    `sleepUntil target should be ~endTime+5m, got ${sleepUntilCalls[0].target.toISOString()}`);
});

test("falls back to startTime when endTime absent", async () => {
  const startTime = futureEnd();
  const sleepUntilCalls = [];
  const step = { ...fakeStep(), sleepUntil: async (id, target) => { sleepUntilCalls.push({ id, target }); } };
  const db = pgFake({ clients: [client()], ...withStages() });
  await handle({ event: ev("booking.created", { startTime }, { clientId: "cl-1" }), db, step });
  assert.equal(sleepUntilCalls.length, 1);
  const expected = new Date(new Date(startTime).getTime() + 5 * 60 * 1000);
  assert.ok(Math.abs(sleepUntilCalls[0].target.getTime() - expected.getTime()) < 1000);
});

test("no appointment time → early exit, no sleep", async () => {
  const db = pgFake({ clients: [client()], ...withStages() });
  const res = await handle({ event: ev("booking.created", {}, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.done, false);
  assert.equal(res.reason, "no_appointment_time");
});

// --- the "showed" rule ------------------------------------------------------

for (const outcome of ["deposit", "downsell", "callback", "not_a_fit"]) {
  test(`showed: a closer logged ${outcome} after the call started — moves to showed`, async () => {
    const t = callTimes();
    const db = pgFake({
      clients: [client()],
      callOutcomes: [{ client_id: "cl-1", outcome, logged_at: t.loggedAt }],
      ...withStages()
    });
    const res = await handle({ event: ev("booking.created", { startTime: t.startTime, endTime: t.endTime }, { clientId: "cl-1" }), db, step: fakeStep() });
    assert.equal(res.outcome, "showed");
    assert.equal(db.cards[0].stage_id, "st-showed");
    assert.equal(db.clients[0].custom_fields.call_outcome, "showed");
    assert.equal(db.clients[0].custom_fields.last_progress_action, "call_held");
    assert.equal(db.events.filter((e) => e.name === "booking.noshow").length, 0);
  });
}

test("no-show: a closer logged No show — not showed", async () => {
  const t = callTimes();
  const db = pgFake({
    clients: [client()],
    callOutcomes: [{ client_id: "cl-1", outcome: "no_show", logged_at: t.loggedAt }],
    ...withStages()
  });
  const res = await handle({ event: ev("booking.created", { startTime: t.startTime, endTime: t.endTime }, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.outcome, "no_show");
  assert.equal(db.cards[0].stage_id, "st-lost");
});

test("no-show: an AI-setter (Bland) call finished but no closer log — not showed", async () => {
  const t = callTimes();
  const db = pgFake({
    clients: [client()],
    events: [{ client_id: "cl-1", name: "call.completed", payload: { source: "bland", disposition: "voicemail", outcome: "no_answer" } }],
    ...withStages()
  });
  const res = await handle({ event: ev("booking.created", { startTime: t.startTime, endTime: t.endTime }, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.outcome, "no_show");
});

test("no-show: a demo closer log never counts", async () => {
  const t = callTimes();
  const db = pgFake({
    clients: [client()],
    callOutcomes: [{ client_id: "cl-1", outcome: "deposit", logged_at: t.loggedAt, is_demo: true }],
    ...withStages()
  });
  const res = await handle({ event: ev("booking.created", { startTime: t.startTime, endTime: t.endTime }, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.outcome, "no_show");
});

test("no-show: a held call from an older booking does not hide this one", async () => {
  const t = callTimes();
  const db = pgFake({
    clients: [client()],
    callOutcomes: [{ client_id: "cl-1", outcome: "callback", logged_at: t.before }],
    ...withStages()
  });
  const res = await handle({ event: ev("booking.created", { startTime: t.startTime, endTime: t.endTime }, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.outcome, "no_show");
});

test("callHappened with no booked start counts a closer log at any time (BS-01 asks it that way)", async () => {
  const t = callTimes();
  const db = pgFake({ callOutcomes: [{ client_id: "cl-1", outcome: "downsell", logged_at: t.before }] });
  assert.equal(await callHappened(db, "cl-1"), true);
  assert.equal(await callHappened(db, "cl-1", { since: t.startTime }), false);
  assert.equal(await callHappened(db, "cl-2"), false);
});

test("branch: no call — no-show, tagged, moved to lost", async () => {
  const db = pgFake({ clients: [client()], ...withStages() });
  const res = await handle({ event: ev("booking.created", { endTime: futureEnd() }, { clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(res.outcome, "no_show");
  assert.deepEqual(db.clients[0].tags, ["call:no_show"]);
  assert.equal(db.cards[0].stage_id, "st-lost");
  assert.equal(db.clients[0].custom_fields.call_outcome, "no_show");
});

test("no-show emits booking.noshow and S-05A listens for that event", async () => {
  const db = pgFake({ clients: [client()], ...withStages() });
  const endTime = futureEnd();
  const event = ev(
    "booking.created",
    { endTime, bookingUid: "bk_1", email: "a@b.com", source: "clickfunnels" },
    { clientId: "cl-1" }
  );
  await handle({ event, db, step: fakeStep() });
  const noshows = db.events.filter((e) => e.name === "booking.noshow");
  assert.equal(noshows.length, 1);
  assert.equal(noshows[0].client_id, "cl-1");
  assert.equal(noshows[0].payload.bookingUid, "bk_1");
  assert.equal(noshows[0].idempotency_key, `dpc-02:bk_1:${endTime}:booking.noshow`);
  const triggers = (s05aNoShowRecovery.opts.triggers || []).map((t) => t.event);
  assert.ok(triggers.includes("booking.noshow"), "S-05A must start on booking.noshow");
});

test("a moved call that is missed again is its own no-show", async () => {
  const db = pgFake({ clients: [client()], ...withStages() });
  const first = new Date(Date.now() + HOUR).toISOString();
  const moved = new Date(Date.now() + 25 * HOUR).toISOString();
  await handle({ event: ev("booking.created", { endTime: first, bookingUid: "bk_1", email: "a@b.com" }, { id: "evt-a", clientId: "cl-1" }), db, step: fakeStep() });
  await handle({ event: ev("booking.rescheduled", { endTime: moved, bookingUid: "bk_1", email: "a@b.com" }, { id: "evt-b", clientId: "cl-1" }), db, step: fakeStep() });
  assert.equal(db.events.filter((e) => e.name === "booking.noshow").length, 2);
});

test("duplicate delivery: replaying does not double-move the card", async () => {
  const db = pgFake({ clients: [client()], ...withStages() });
  const event = ev("booking.created", { endTime: futureEnd() }, { id: "evt-dup-dpc02", clientId: "cl-1" });
  await handle({ event, db, step: fakeStep() });
  await handle({ event, db, step: fakeStep() });
  assert.equal(db.cards.length, 1);
  assert.equal(db.events.filter((e) => e.name === "booking.noshow").length, 1);
});

test("starts on a booking or a move, and stops on a move or a cancel (same matches as S-04B)", () => {
  const triggers = (dpc02CallOutcomeEnforcement.opts.triggers || []).map((t) => t.event).sort();
  assert.deepEqual(triggers, ["booking.created", "booking.rescheduled"]);
  const cancelOn = dpc02CallOutcomeEnforcement.opts.cancelOn || [];
  const by = (name) => cancelOn.filter((c) => c.event === name).map((c) => c.if);
  for (const name of ["booking.cancelled", "booking.rescheduled"]) {
    const ifs = by(name);
    assert.ok(ifs.some((x) => /payload\.email == async\.data\.payload\.email/.test(x)), `${name} matched by email`);
    assert.ok(ifs.some((x) => /payload\.bookingUid == async\.data\.payload\.bookingUid/.test(x)), `${name} matched by booking id`);
  }
});

// --- DPC-02 — Late Show -----------------------------------------------------

const closerLog = (outcome, extra = {}) =>
  ev("call.completed", { clientId: "cl-1", orgId: "org-1", outcome, disposition: "closer", callOutcomeId: "co-1" }, { clientId: "cl-1", ...extra });
const lostCard = () => [{ id: "card-1", org_id: "org-1", client_id: "cl-1", pipeline_id: "pl-sales", stage_id: "st-lost" }];

test("late show: a closer logs after the no-show check — showed again, tag off, card back from lost", async () => {
  const db = pgFake({
    clients: [{ ...client({ call_outcome: "no_show" }), tags: ["call:no_show", "vip"] }],
    cards: lostCard(),
    ...withStages()
  });
  const res = await handleLateShow({ event: closerLog("deposit"), db, step: fakeStep() });
  assert.equal(res.outcome, "showed");
  assert.equal(res.late, true);
  assert.equal(db.clients[0].custom_fields.call_outcome, "showed");
  assert.equal(db.clients[0].custom_fields.last_progress_action, "call_held");
  assert.deepEqual(db.clients[0].tags, ["vip"]);
  assert.equal(db.cards[0].stage_id, "st-showed");
});

test("late show: Not a fit counts too", async () => {
  const db = pgFake({ clients: [client({ call_outcome: "no_show" })], cards: lostCard(), ...withStages() });
  const res = await handleLateShow({ event: closerLog("not_a_fit"), db, step: fakeStep() });
  assert.equal(res.outcome, "showed");
  assert.equal(db.cards[0].stage_id, "st-showed");
});

test("late show: a card that already moved on from lost stays where it is", async () => {
  const db = pgFake({
    clients: [client({ call_outcome: "no_show" })],
    cards: [{ id: "card-1", org_id: "org-1", client_id: "cl-1", pipeline_id: "pl-sales", stage_id: "st-won" }],
    ...withStages()
  });
  const res = await handleLateShow({ event: closerLog("deposit"), db, step: fakeStep() });
  assert.equal(res.outcome, "showed");
  assert.equal(res.card.moved, false);
  assert.equal(db.cards[0].stage_id, "st-won");
  assert.equal(db.clients[0].custom_fields.call_outcome, "showed");
});

test("late show: nothing to undo when the client is not marked no_show", async () => {
  const db = pgFake({ clients: [client({ call_outcome: "booked" })], cards: lostCard(), ...withStages() });
  const res = await handleLateShow({ event: closerLog("deposit"), db, step: fakeStep() });
  assert.equal(res.done, false);
  assert.equal(res.reason, "not_marked_no_show");
  assert.equal(db.clients[0].custom_fields.call_outcome, "booked");
  assert.equal(db.cards[0].stage_id, "st-lost");
});

test("late show: a closer's No show and an AI-setter call change nothing", async () => {
  const db = pgFake({ clients: [client({ call_outcome: "no_show" })], cards: lostCard(), ...withStages() });
  const noShow = await handleLateShow({ event: closerLog("no_show"), db, step: fakeStep() });
  assert.equal(noShow.reason, "not_showed");
  const robot = await handleLateShow({
    event: ev("call.completed", { source: "bland", disposition: "voicemail", outcome: "no_answer" }, { clientId: "cl-1" }),
    db, step: fakeStep()
  });
  assert.equal(robot.reason, "not_a_closer_log");
  assert.equal(db.clients[0].custom_fields.call_outcome, "no_show");
  assert.equal(db.cards[0].stage_id, "st-lost");
});

test("late show runs on call.completed", () => {
  const triggers = (dpc02LateShow.opts.triggers || []).map((t) => t.event);
  assert.deepEqual(triggers, ["call.completed"]);
});
