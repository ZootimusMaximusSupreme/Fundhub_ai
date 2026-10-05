import test from "node:test";
import assert from "node:assert/strict";
import { decideCallback, parseCallbackBody, handleVideoWorkerCallback, READ_ROW_SQL, RELEASE_SQL } from "./worker-callback.mjs";
import { callbackHeaders } from "./worker-protocol.mjs";

const NOW = 1_800_000_000_000;
const SECRET = "cb-secret";
const ENV = { VIDEO_WORKER_CALLBACK_SECRET: SECRET };
const K = {
  audio: "partners/p/ad-video/audio/v1.ogg",
  cut: "partners/p/ad-video/cut/v1-v1.mp4",
  sub: "partners/p/ad-video/submagic/v1-v1.mp4",
  fin: "partners/p/ad-video/final/91-r1.mp4",
};
const RESULTS = {
  prepare: { audio_storage_key: K.audio, silences: [{ start: 1, end: 1.4 }], recorded_at: "2026-10-05T10:00:00Z" },
  build_cut: { cut_storage_key: K.cut, master_duration_seconds: 31.2 },
  copy_export: { submagic_storage_key: K.sub },
  render_and_overlay: { storage_final_key: K.fin, animation_items: { accepted: [], skipped: [] } },
};

const done = (type, result = RESULTS[type], over = {}) => ({
  job_id: `v1:${type}:1`, type, ad_video_id: "v1", org_id: "o1", status: "done", result, ...over,
});
const row = (over = {}) => ({ id: "v1", status: "cut", worker_job_id: "v1:build_cut:1", ...over });

test("a finished build_cut moves cut -> staged with result columns only", () => {
  const d = decideCallback({ row: row(), now: NOW, body: done("build_cut") });
  assert.equal(d.action, "advance");
  assert.deepEqual([d.from, d.to], ["cut", "staged"]);
  assert.deepEqual(d.patch, { cut_storage_key: K.cut, master_duration_seconds: 31.2, cut_at: new Date(NOW).toISOString() });
});

test("every job type has a move that matches the spec's forward order", () => {
  const moves = { prepare: ["raw_landed", "prepared"], build_cut: ["cut", "staged"], copy_export: ["editing", "rendered"], render_and_overlay: ["rendered", "animated"] };
  for (const [type, [from, to]] of Object.entries(moves)) {
    const d = decideCallback({ row: row({ status: from, worker_job_id: `v1:${type}:1` }), body: done(type), now: NOW });
    assert.deepEqual([d.action, d.from, d.to], ["advance", from, to], type);
  }
});

test("a callback for a job the row no longer points at, or a row that moved on, changes nothing", () => {
  assert.deepEqual(decideCallback({ row: row({ worker_job_id: "v1:build_cut:2" }), body: done("build_cut") }),
    { action: "ignore", reason: "the row no longer points at this job" });
  const d = decideCallback({ row: row({ status: "staged" }), body: done("build_cut") });
  assert.match(d.reason, /staged, not cut/);
  assert.equal(decideCallback({ row: null, body: done("build_cut") }).action, "ignore");
});

test("a failed job fails the row with the worker's words", () => {
  const d = decideCallback({ row: row(), body: { ...done("build_cut", null), status: "failed", error: { code: "cut_checks", message: "the cut failed 1 check(s)" } } });
  assert.deepEqual(d, { action: "fail", from: "cut", reason: "cut_checks: the cut failed 1 check(s)" });
});

test("body parsing refuses anything but a well-formed callback", () => {
  assert.equal(parseCallbackBody("nope").ok, false);
  assert.equal(parseCallbackBody("[]").ok, false);
  assert.equal(parseCallbackBody(JSON.stringify(done("zip", {}))).ok, false);
  assert.equal(parseCallbackBody(JSON.stringify({ ...done("build_cut"), status: "maybe" })).ok, false);
  assert.equal(parseCallbackBody(JSON.stringify({ ...done("build_cut"), org_id: "" })).ok, false);
  assert.equal(parseCallbackBody(JSON.stringify(done("build_cut"))).ok, true);
});

test("result fields are shape-checked per job type; a bad one is refused, not half-applied", () => {
  const bad = {
    prepare: [{ ...RESULTS.prepare, audio_storage_key: "../x.ogg" }, { ...RESULTS.prepare, silences: "none" }, { ...RESULTS.prepare, silences: [{ start: "a", end: 1 }] }, { ...RESULTS.prepare, recorded_at: "yesterday-ish" }],
    build_cut: [{ ...RESULTS.build_cut, cut_storage_key: K.fin }, { ...RESULTS.build_cut, master_duration_seconds: "31" }, { ...RESULTS.build_cut, master_duration_seconds: 0 }, { cut_storage_key: K.cut }],
    copy_export: [{ submagic_storage_key: "x" }, {}],
    render_and_overlay: [{ ...RESULTS.render_and_overlay, storage_final_key: K.cut }, { ...RESULTS.render_and_overlay, animation_items: [] }, { storage_final_key: K.fin }],
  };
  for (const [type, list] of Object.entries(bad)) {
    for (const result of list) assert.equal(parseCallbackBody(JSON.stringify(done(type, result))).ok, false, `${type} ${JSON.stringify(result)}`);
    assert.equal(parseCallbackBody(JSON.stringify(done(type, null))).ok, false, `${type} with no result`);
    assert.equal(parseCallbackBody(JSON.stringify(done(type))).ok, true, type);
  }
});

// -- the door --------------------------------------------------------------

/** A db whose query() serves the explicit read, and records every statement. */
function fakeDb(current) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql === READ_ROW_SQL) return { rows: current ? [current] : [] };
      return { rows: [] };
    },
  };
}
/** A store like PR #26's: findById returns the row WITHOUT worker_job_id (its ROW_COLUMNS may omit it). */
function fakeStore(current) {
  const calls = [];
  const { worker_job_id: _omitted, ...asFindByIdShapes } = current ?? {};
  return {
    calls,
    findById: async () => { calls.push(["find"]); return current ? asFindByIdShapes : null; },
    advance: async (_db, a) => { calls.push(["advance", a]); return { ...asFindByIdShapes, status: a.to }; },
    markFailed: async (_db, a) => { calls.push(["fail", a]); return { ...asFindByIdShapes, status: "failed" }; },
  };
}
const signed = (body, secret = SECRET, now = NOW) => ({ rawBody: body, headers: callbackHeaders({ secret, body, now }) });
const quiet = [];
const log = (m) => quiet.push(m);

test("the door: a bad signature is 401 and nothing is read", async () => {
  const db = fakeDb(row());
  const store = fakeStore(row());
  const body = JSON.stringify(done("build_cut"));
  const out = await handleVideoWorkerCallback({ db, env: ENV, now: NOW, store, ...signed(body, "wrong") });
  assert.equal(out.status, 401);
  assert.equal(db.calls.length + store.calls.length, 0);
  assert.equal((await handleVideoWorkerCallback({ db, env: {}, now: NOW, store, ...signed(body) })).status, 401, "an unset secret refuses everything");
});

test("the door: a replay older than 5 minutes is refused", async () => {
  const out = await handleVideoWorkerCallback({ db: fakeDb(row()), env: ENV, now: NOW + 6 * 60_000, store: fakeStore(row()), ...signed(JSON.stringify(done("build_cut"))) });
  assert.deepEqual([out.status, out.body.error], [401, "stale_timestamp"]);
});

test("the door: worker_job_id is read by the door's own query, so a findById row without it still works", async () => {
  const current = row();
  const db = fakeDb(current);
  const store = fakeStore(current);
  assert.equal("worker_job_id" in (await store.findById()), false, "the fake store really does omit worker_job_id");
  store.calls.length = 0;
  const out = await handleVideoWorkerCallback({ db, env: ENV, now: NOW, store, log, ...signed(JSON.stringify(done("build_cut"))) });
  assert.deepEqual(out, { status: 200, body: { ok: true, id: "v1", status: "staged" } });
  assert.deepEqual(db.calls[0], [READ_ROW_SQL, ["v1", "o1"]]);
  assert.match(READ_ROW_SQL, /SELECT id, status, worker_job_id FROM ad_videos/);
  assert.deepEqual(store.calls.map((c) => c[0]), ["advance"], "findById is never needed");
  assert.equal(store.calls[0][1].by, "worker");
  assert.deepEqual(Object.keys(store.calls[0][1].patch).sort(), ["cut_at", "cut_storage_key", "master_duration_seconds"]);
});

test("the door: the claim is released after a move and after a failure, only for this job", async () => {
  for (const body of [done("build_cut"), { ...done("build_cut", null), status: "failed", error: { code: "ffmpeg_failed", message: "x" } }]) {
    const db = fakeDb(row());
    const store = fakeStore(row());
    const out = await handleVideoWorkerCallback({ db, env: ENV, now: NOW, store, log, ...signed(JSON.stringify(body)) });
    assert.equal(out.status, 200);
    assert.deepEqual(db.calls.at(-1), [RELEASE_SQL, ["v1", "o1", "v1:build_cut:1"]]);
    assert.match(RELEASE_SQL, /worker_job_id = NULL.*worker_claimed_at = NULL.*AND worker_job_id = \$3/);
  }
});

test("the door: a failure callback marks the row failed from the job's own state", async () => {
  const store = fakeStore(row());
  const body = JSON.stringify({ ...done("build_cut", null), status: "failed", error: { code: "ffmpeg_failed", message: "x" } });
  const out = await handleVideoWorkerCallback({ db: fakeDb(row()), env: ENV, now: NOW, store, log, ...signed(body) });
  assert.equal(out.body.status, "failed");
  assert.deepEqual([store.calls[0][0], store.calls[0][1].from], ["fail", "cut"]);
});

test("the door: a stale or duplicate callback is 200, writes nothing and releases nothing", async () => {
  const db = fakeDb(row({ status: "staged" }));
  const store = fakeStore(row({ status: "staged" }));
  const out = await handleVideoWorkerCallback({ db, env: ENV, now: NOW, store, log, ...signed(JSON.stringify(done("build_cut"))) });
  assert.equal(out.status, 200);
  assert.equal(out.body.ignored, true);
  assert.equal(store.calls.length, 0);
  assert.equal(db.calls.length, 1);
});

test("the door: a store error is logged without the body and answers 500 so the worker retries", async () => {
  const lines = [];
  const store = fakeStore(row());
  store.advance = async () => { throw Object.assign(new Error("no transition cut -> staged"), { code: "AdVideoStateError" }); };
  const body = JSON.stringify(done("build_cut"));
  const out = await handleVideoWorkerCallback({ db: fakeDb(row()), env: ENV, now: NOW, store, log: (m) => lines.push(m), ...signed(body) });
  assert.deepEqual([out.status, out.body], [500, { ok: false, error: "store_error" }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /build_cut v1: AdVideoStateError: no transition/);
  assert.ok(!lines[0].includes(SECRET) && !lines[0].includes(K.cut), "no secret and no payload in the log");
});

test("the door: a failing read is also a logged 500, not a silent 200", async () => {
  const db = { query: async () => { throw new Error("connection reset"); } };
  const out = await handleVideoWorkerCallback({ db, env: ENV, now: NOW, store: fakeStore(row()), log, ...signed(JSON.stringify(done("build_cut"))) });
  assert.equal(out.status, 500);
});

test("the door: a malformed or mis-shaped signed body is 400 (retrying cannot fix it)", async () => {
  assert.equal((await handleVideoWorkerCallback({ db: fakeDb(null), env: ENV, now: NOW, store: fakeStore(null), log, ...signed("{") })).status, 400);
  const badShape = JSON.stringify(done("build_cut", { cut_storage_key: "../../x", master_duration_seconds: 5 }));
  const out = await handleVideoWorkerCallback({ db: fakeDb(row()), env: ENV, now: NOW, store: fakeStore(row()), log, ...signed(badShape) });
  assert.equal(out.status, 400);
});
