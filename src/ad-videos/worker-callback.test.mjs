import test from "node:test";
import assert from "node:assert/strict";
import { decideCallback, parseCallbackBody, handleVideoWorkerCallback } from "./worker-callback.mjs";
import { callbackHeaders } from "./worker-protocol.mjs";

const NOW = 1_800_000_000_000;
const SECRET = "cb-secret";
const ENV = { VIDEO_WORKER_CALLBACK_SECRET: SECRET };

const done = (type, result, over = {}) => ({
  job_id: `v1:${type}:1`, type, ad_video_id: "v1", org_id: "o1", status: "done", result, ...over,
});
const row = (over = {}) => ({ id: "v1", status: "cut", worker_job_id: "v1:build_cut:1", ...over });

test("a finished build_cut moves cut -> staged and releases the claim", () => {
  const d = decideCallback({
    row: row(), now: NOW,
    body: done("build_cut", { cut_storage_key: "k", master_duration_seconds: 31.2 }),
  });
  assert.equal(d.action, "advance");
  assert.deepEqual([d.from, d.to], ["cut", "staged"]);
  assert.deepEqual(d.patch, {
    cut_storage_key: "k", master_duration_seconds: 31.2, cut_at: new Date(NOW).toISOString(),
    worker_job_id: null, worker_claimed_at: null,
  });
});

test("every job type has a move that matches the spec's forward order", () => {
  const cases = {
    prepare: ["raw_landed", "prepared", { audio_storage_key: "a", silences: [], recorded_at: "t" }],
    build_cut: ["cut", "staged", { cut_storage_key: "c", master_duration_seconds: 1 }],
    copy_export: ["editing", "rendered", { submagic_storage_key: "s" }],
    render_and_overlay: ["rendered", "animated", { storage_final_key: "f", animation_items: { accepted: [], skipped: [] } }],
  };
  for (const [type, [from, to, result]] of Object.entries(cases)) {
    const d = decideCallback({ row: row({ status: from, worker_job_id: `v1:${type}:1` }), body: done(type, result), now: NOW });
    assert.deepEqual([d.action, d.from, d.to], ["advance", from, to], type);
  }
});

test("a callback for a job the row no longer points at changes nothing", () => {
  const d = decideCallback({ row: row({ worker_job_id: "v1:build_cut:2" }), body: done("build_cut", {}) });
  assert.deepEqual(d, { action: "ignore", reason: "the row no longer points at this job" });
});

test("a callback for a row that has moved on changes nothing", () => {
  const d = decideCallback({ row: row({ status: "staged" }), body: done("build_cut", { cut_storage_key: "k" }) });
  assert.equal(d.action, "ignore");
  assert.match(d.reason, /staged, not cut/);
  assert.equal(decideCallback({ row: null, body: done("build_cut", {}) }).action, "ignore");
});

test("a failed job fails the row with the worker's words", () => {
  const d = decideCallback({
    row: row(),
    body: { ...done("build_cut", null), status: "failed", error: { code: "cut_checks", message: "the cut failed 1 check(s)" } },
  });
  assert.deepEqual(d, { action: "fail", from: "cut", reason: "cut_checks: the cut failed 1 check(s)" });
});

test("a done callback with no result is ignored, never half-applied", () => {
  assert.equal(decideCallback({ row: row(), body: done("build_cut", null) }).action, "ignore");
});

test("body parsing refuses anything but a well-formed callback", () => {
  assert.equal(parseCallbackBody("nope").ok, false);
  assert.equal(parseCallbackBody("[]").ok, false);
  assert.equal(parseCallbackBody(JSON.stringify({ ...done("zip", {}) })).ok, false);
  assert.equal(parseCallbackBody(JSON.stringify({ ...done("build_cut", {}), status: "maybe" })).ok, false);
  assert.equal(parseCallbackBody(JSON.stringify({ ...done("build_cut", {}), org_id: "" })).ok, false);
  assert.equal(parseCallbackBody(JSON.stringify(done("build_cut", {}))).ok, true);
});

function fakeStore(current) {
  const calls = [];
  return {
    calls,
    findById: async (_db, a) => { calls.push(["find", a]); return current; },
    advance: async (_db, a) => { calls.push(["advance", a]); return { ...current, status: a.to }; },
    markFailed: async (_db, a) => { calls.push(["fail", a]); return { ...current, status: "failed" }; },
  };
}
const signed = (body, secret = SECRET, now = NOW) => ({ rawBody: body, headers: callbackHeaders({ secret, body, now }) });

test("the door: a bad signature is 401 and the store is never read", async () => {
  const store = fakeStore(row());
  const body = JSON.stringify(done("build_cut", { cut_storage_key: "k" }));
  const out = await handleVideoWorkerCallback({ db: {}, env: ENV, now: NOW, store, ...signed(body, "wrong") });
  assert.equal(out.status, 401);
  assert.equal(store.calls.length, 0);
  const none = await handleVideoWorkerCallback({ db: {}, env: {}, now: NOW, store, ...signed(body) });
  assert.equal(none.status, 401, "an unset secret refuses every callback");
});

test("the door: a replay older than 5 minutes is refused", async () => {
  const store = fakeStore(row());
  const body = JSON.stringify(done("build_cut", { cut_storage_key: "k" }));
  const out = await handleVideoWorkerCallback({ db: {}, env: ENV, now: NOW + 6 * 60_000, store, ...signed(body) });
  assert.equal(out.status, 401);
  assert.equal(out.body.error, "stale_timestamp");
});

test("the door: a good callback re-reads the row, then advances it", async () => {
  const store = fakeStore(row());
  const body = JSON.stringify(done("build_cut", { cut_storage_key: "k", master_duration_seconds: 30 }));
  const out = await handleVideoWorkerCallback({ db: {}, env: ENV, now: NOW, store, ...signed(body) });
  assert.deepEqual(out, { status: 200, body: { ok: true, id: "v1", status: "staged" } });
  assert.deepEqual(store.calls.map((c) => c[0]), ["find", "advance"]);
  assert.deepEqual(store.calls[0][1], { orgId: "o1", id: "v1" });
  assert.equal(store.calls[1][1].by, "worker");
});

test("the door: a failure callback calls markFailed from the job's own state", async () => {
  const store = fakeStore(row());
  const body = JSON.stringify({ ...done("build_cut", null), status: "failed", error: { code: "ffmpeg_failed", message: "x" } });
  const out = await handleVideoWorkerCallback({ db: {}, env: ENV, now: NOW, store, ...signed(body) });
  assert.equal(out.body.status, "failed");
  assert.equal(store.calls[1][0], "fail");
  assert.equal(store.calls[1][1].from, "cut");
});

test("the door: a stale or duplicate callback is 200 and writes nothing", async () => {
  const store = fakeStore(row({ status: "staged" }));
  const body = JSON.stringify(done("build_cut", { cut_storage_key: "k" }));
  const out = await handleVideoWorkerCallback({ db: {}, env: ENV, now: NOW, store, ...signed(body) });
  assert.equal(out.status, 200);
  assert.equal(out.body.ignored, true);
  assert.deepEqual(store.calls.map((c) => c[0]), ["find"]);
});

test("the door: a state the store refuses is 200 ignored with the reason, not a retry storm", async () => {
  const store = fakeStore(row());
  store.advance = async () => { throw new Error("no transition cut -> staged"); };
  const body = JSON.stringify(done("build_cut", { cut_storage_key: "k" }));
  const out = await handleVideoWorkerCallback({ db: {}, env: ENV, now: NOW, store, ...signed(body) });
  assert.equal(out.status, 200);
  assert.match(out.body.reason, /store refused: no transition/);
});

test("the door: a malformed signed body is 400", async () => {
  const out = await handleVideoWorkerCallback({ db: {}, env: ENV, now: NOW, store: fakeStore(null), ...signed("{") });
  assert.equal(out.status, 400);
});
