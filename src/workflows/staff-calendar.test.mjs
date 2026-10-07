// The two staff-calendar workflows: the five-minute busy-time clock and S-04D,
// the booked call onto the closer's calendar. Driven with a fake step; no
// Inngest, no network, no Postgres.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NonRetriableError } from "inngest";
import {
  staffCalendarBusySync, handle as syncHandle, SYNC_CRON, DEAD_TOKEN_MESSAGE
} from "./staff-calendar-busy-sync.mjs";
import { heartbeatHooks, checkJobHeartbeats, SCHEDULED_EVENT, JOBS } from "../pulse/heartbeats.mjs";
import {
  s04dCloserCalendarInvite, handle as inviteHandle, MAX_ATTEMPTS, RETRY_SLEEP
} from "./s-04d-closer-calendar-invite.mjs";
import { functions } from "./index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fakeStep() {
  const runs = [];
  const sleeps = [];
  return {
    runs, sleeps,
    run: async (name, fn) => { runs.push(name); return fn(); },
    sleep: async (name, d) => { sleeps.push([name, d]); }
  };
}

test("busy sync: a five-minute cron, registered, no event trigger", () => {
  assert.equal(SYNC_CRON, "*/5 * * * *");
  const triggers = staffCalendarBusySync.opts.triggers;
  assert.deepEqual(triggers, [{ cron: SYNC_CRON }]);
  assert.ok(functions.includes(staffCalendarBusySync));
});

test("busy sync: with no token it writes the waiting note and makes no Google call", async () => {
  const updates = [];
  const db = {
    async query(sql, params) {
      if (/FROM orgs/.test(sql)) return { rows: [{ id: "org" }] };
      if (/blocks_booking = true/.test(sql)) return { rows: [{ staff_id: "s1", calendar_email: "j@x.com", staff_name: "J" }] };
      if (/UPDATE staff_calendar_links/.test(sql)) { updates.push(params); return { rows: [] }; }
      return { rows: [] };
    }
  };
  const step = fakeStep();
  const out = await syncHandle({ db, step, env: {} });
  assert.deepEqual(step.runs, ["sync-busy-blocks"]);
  assert.equal(out.note, "waiting_on_google_approval");
  assert.equal(updates[0][3], "Waiting on Chris's Google approval");
});

test("S-04D: listens to booking.created only, and is registered", () => {
  assert.deepEqual(s04dCloserCalendarInvite.opts.triggers, [{ event: "booking.created" }]);
  assert.ok(functions.includes(s04dCloserCalendarInvite));
});

test("S-04D: with no token it is skipped on the first try — no retry, no sleep", async () => {
  const step = fakeStep();
  const out = await inviteHandle({ event: { orgId: "org", payload: { email: "a@x.com", startTime: "2026-10-08T17:00:00Z" } }, db: {}, step, env: {} });
  assert.equal(out.status, "skipped");
  assert.equal(out.reason, "waiting_on_google_approval");
  assert.equal(step.runs.length, 1);
  assert.equal(step.sleeps.length, 0);
});

test("S-04D: retry budget is about ten minutes", () => {
  assert.equal(MAX_ATTEMPTS, 6);
  assert.equal(RETRY_SLEEP, "2m");
});

test("S-04D: does not edit the setter workflows or any message copy", () => {
  const src = fs.readFileSync(path.join(HERE, "s-04d-closer-calendar-invite.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /sendTemplated|createTask|ai-set-0/);
  assert.doesNotMatch(src, /\bfetch\s*\(/, "outbound calls live in the provider only");
});

test("S-04D: not on the calendar yet → sleeps and tries again, stops as soon as the closer is added", async () => {
  const answers = [{ status: "not_found" }, { status: "error", error: "HTTP 503" }, { status: "added", added: 1, already: 0 }];
  const seen = [];
  const invite = async (db, args) => { seen.push(args); return answers.shift(); };
  const step = fakeStep();
  const event = { orgId: "org", payload: { email: "a@x.com", startTime: "2026-10-08T17:00:00Z" } };
  const out = await inviteHandle({ event, db: {}, step, env: {}, invite });
  assert.equal(out.status, "added");
  assert.equal(out.attempts, 3);
  assert.deepEqual(step.runs, ["invite-closers-1", "invite-closers-2", "invite-closers-3"]);
  assert.deepEqual(step.sleeps, [["wait-1", "2m"], ["wait-2", "2m"]]);
  assert.equal(seen[0].orgId, "org");
  assert.equal(seen[0].payload.email, "a@x.com");
});

test("S-04D: gives up after the last try, with a log line, and never throws", async () => {
  const invite = async () => ({ status: "not_found" });
  const step = fakeStep();
  const out = await inviteHandle({ event: { orgId: "org", payload: {} }, db: {}, step, env: {}, invite });
  assert.equal(out.gaveUp, true);
  assert.equal(step.runs.length, MAX_ATTEMPTS);
  assert.equal(step.sleeps.length, MAX_ATTEMPTS - 1, "no pointless sleep after the last try");
});

test("S-04D: already on the call counts as done", async () => {
  const step = fakeStep();
  const out = await inviteHandle({ event: { orgId: "org", payload: {} }, db: {}, step, env: {}, invite: async () => ({ status: "already", added: 0, already: 1 }) });
  assert.equal(out.done, true);
  assert.equal(step.runs.length, 1);
});

/* ── a dead Google token reaches Chris through the 7 a.m. pulse ─────────── */

test("busy sync: a dead token fails the run (non-retriable) with a plain reason", async () => {
  const step = fakeStep();
  await assert.rejects(
    syncHandle({ db: {}, step, env: {}, sync: async () => ({ ok: false, tokenDead: true, note: "invalid_grant" }) }),
    (err) => err instanceof NonRetriableError && err.message === DEAD_TOKEN_MESSAGE
  );
  assert.deepEqual(step.runs, ["sync-busy-blocks"], "the pass ran once, inside its step");
});

test("busy sync: a blip does not fail the run", async () => {
  const out = await syncHandle({ db: {}, step: fakeStep(), env: {}, sync: async () => ({ ok: false, tokenDead: false, note: "HTTP 503" }) });
  assert.equal(out.ok, false);
});

test("busy sync: that failed run is recorded as an error heartbeat, and the pulse shows the job red", async () => {
  // 1. The heartbeat add-on on the Inngest client records the thrown error.
  const rows = [];
  const fakeDb = { query: async (sql, params) => { if (/INSERT INTO job_heartbeats/.test(sql)) rows.push(params); return { rows: [] }; } };
  const t0 = new Date("2026-10-08T13:55:00Z");
  const hooks = heartbeatHooks({ getDb: () => fakeDb, nowFn: () => t0 });
  const run = hooks.onFunctionRun({ fn: { opts: { id: "staff-calendar-busy-sync" } }, ctx: { event: { name: SCHEDULED_EVENT } } });
  let thrown;
  try {
    await syncHandle({ db: {}, step: fakeStep(), env: {}, sync: async () => ({ ok: false, tokenDead: true }) });
  } catch (err) { thrown = err; }
  await run.finished({ result: { error: thrown } });
  assert.equal(rows.length, 1);
  const [job, , , , outcome, , error] = rows[0];
  assert.equal(job, "staff-calendar-busy-sync");
  assert.equal(outcome, "error");
  assert.equal(error, DEAD_TOKEN_MESSAGE);

  // 2. The 7 a.m. pulse reads that newest heartbeat and marks the job FAIL.
  const pulseDb = { query: async () => ({ rows: [{
    job: "staff-calendar-busy-sync", last_at: t0.toISOString(), last_outcome: "error",
    last_error: error, first_ever: "2026-10-05T00:00:00Z"
  }] }) };
  const job_ = JOBS.filter((j) => j.job === "staff-calendar-busy-sync");
  assert.equal(job_.length, 1, "the job is on the pulse's list");
  const [check] = await checkJobHeartbeats({ db: pulseDb, now: new Date("2026-10-08T14:00:00Z"), jobs: job_ });
  assert.equal(check.id, "job:staff-calendar-busy-sync");
  assert.equal(check.status, "FAIL");
  assert.match(check.detail, /approval stopped working/);
});
