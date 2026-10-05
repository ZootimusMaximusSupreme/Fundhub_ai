import test from "node:test";
import assert from "node:assert/strict";
import {
  JOB_TYPES, JOB_FLOW, CLAIM_SQL, CLAIM_STALE_MINUTES, CALLBACK_WINDOW_SECONDS, VIDEO_KEY_HEADER,
  WorkerProtocolError, jobId, parseJobId, validateJobRequest, keyOk, signCallback, callbackHeaders,
  verifyCallback, audioKey, cutKey, submagicKey, finalKey, clipHash, clipKey, driveDownloadRequest,
} from "./worker-protocol.mjs";

const drive = { file_id: "1AbC_dEf", access_token: "tok" };
const GOOD = {
  prepare: { take_id: "t1", audio_key: "k.ogg", drive },
  build_cut: {
    video_kind: "ad", pieces: [{ take: "t1", start: 0, end: 1 }], takes: { t1: { drive_file_id: "f1" } },
    drive: { access_token: "tok" }, silences: {}, cut_key: "cut.mp4",
  },
  copy_export: { export_url: "https://x.test/e.mp4", submagic_key: "s.mp4" },
  render_and_overlay: { submagic_key: "s.mp4", final_key: "f.mp4", master_duration_seconds: 30, animation_mode: "fullframe", animations: [] },
};
const req = (type, over = {}) => ({ type, ad_video_id: "v1", org_id: "o1", cut_version: 2, payload: GOOD[type], ...over });

test("job ids are <ad_video_id>:<type>:<cut_version> and round-trip", () => {
  const id = jobId({ adVideoId: "v1", type: "build_cut", cutVersion: 3 });
  assert.equal(id, "v1:build_cut:3");
  assert.deepEqual(parseJobId(id), { adVideoId: "v1", type: "build_cut", cutVersion: 3 });
  assert.throws(() => jobId({ adVideoId: "a:b", type: "prepare" }), WorkerProtocolError);
  assert.throws(() => jobId({ adVideoId: "v1", type: "nope" }), /unknown job type/);
  assert.throws(() => parseJobId("garbage"), WorkerProtocolError);
});

test("every job type has a flow and a valid request", () => {
  for (const type of JOB_TYPES) {
    assert.ok(JOB_FLOW[type].from && JOB_FLOW[type].to, type);
    const job = validateJobRequest(req(type));
    assert.equal(job.id, `v1:${type}:2`);
    assert.equal(job.orgId, "o1");
  }
});

test("a request is refused at the door when it is incomplete", () => {
  assert.throws(() => validateJobRequest(null), /JSON object/);
  assert.throws(() => validateJobRequest(req("prepare", { type: "zip" })), /type must be/);
  assert.throws(() => validateJobRequest(req("prepare", { org_id: "" })), /org_id/);
  assert.throws(() => validateJobRequest(req("prepare", { job_id: "v1:prepare:9" })), /does not match/);
  assert.throws(() => validateJobRequest(req("prepare", { payload: { take_id: "t1" } })), /payload.drive/);
  assert.throws(() => validateJobRequest(req("build_cut", { payload: { ...GOOD.build_cut, video_kind: "vsl" } })), /ads only/);
  assert.throws(() => validateJobRequest(req("build_cut", { payload: { ...GOOD.build_cut, takes: { t1: {} } } })), /drive_file_id/);
  assert.throws(() => validateJobRequest(req("copy_export", { payload: {} })), /export_url/);
  assert.throws(() => validateJobRequest(req("render_and_overlay", { payload: { ...GOOD.render_and_overlay, animation_mode: "x" } })), /animation_mode/);
});

test("the claim is the spec's statement: 20 minute stale window, one row", () => {
  assert.equal(CLAIM_STALE_MINUTES, 20);
  assert.match(CLAIM_SQL, /WHERE id=\$2 AND \(worker_job_id IS NULL OR worker_claimed_at < now\(\) - interval '20 minutes'\)/);
  assert.match(CLAIM_SQL, /RETURNING id$/);
});

test("the key header: right key passes, wrong, empty and unset all fail", () => {
  assert.equal(keyOk({ [VIDEO_KEY_HEADER]: "abc" }, "abc"), true);
  assert.equal(keyOk({ [VIDEO_KEY_HEADER]: "abd" }, "abc"), false);
  assert.equal(keyOk({}, "abc"), false);
  assert.equal(keyOk({ [VIDEO_KEY_HEADER]: "" }, ""), false, "an unset key must refuse everything");
  assert.equal(keyOk({ [VIDEO_KEY_HEADER]: "abc" }, undefined), false);
});

test("a callback verifies inside 5 minutes and fails outside it, tampered or with another secret", () => {
  const now = 1_800_000_000_000;
  const body = JSON.stringify({ job_id: "v1:prepare:0", status: "done" });
  const headers = callbackHeaders({ secret: "s3", body, now });
  assert.deepEqual(verifyCallback({ secret: "s3", headers, rawBody: body, now }), { ok: true });
  assert.deepEqual(verifyCallback({ secret: "s3", headers, rawBody: body, now: now + (CALLBACK_WINDOW_SECONDS - 1) * 1000 }), { ok: true });
  assert.equal(verifyCallback({ secret: "s3", headers, rawBody: body, now: now + (CALLBACK_WINDOW_SECONDS + 1) * 1000 }).reason, "stale_timestamp");
  assert.equal(verifyCallback({ secret: "s3", headers, rawBody: body, now: now - 400_000 }).reason, "stale_timestamp");
  assert.equal(verifyCallback({ secret: "s3", headers, rawBody: body + " ", now }).reason, "bad_signature");
  assert.equal(verifyCallback({ secret: "other", headers, rawBody: body, now }).reason, "bad_signature");
  assert.equal(verifyCallback({ secret: "s3", headers: {}, rawBody: body, now }).reason, "missing_headers");
  assert.equal(verifyCallback({ secret: "", headers, rawBody: body, now }).reason, "secret_not_set");
  assert.throws(() => signCallback({ secret: "", timestamp: "1", body: "x" }), /not set/);
});

test("a signature is bound to its timestamp", () => {
  const a = signCallback({ secret: "s", timestamp: "100", body: "b" });
  const b = signCallback({ secret: "s", timestamp: "101", body: "b" });
  assert.notEqual(a, b);
});

test("R2 keys follow the spec's layout and refuse unsafe parts", () => {
  assert.equal(finalKey({ partnerId: "p-1", adNumber: "91", round: 2 }), "partners/p-1/ad-video/final/91-r2.mp4");
  assert.equal(audioKey({ partnerId: "p", adVideoId: "v" }), "partners/p/ad-video/audio/v.ogg");
  assert.equal(cutKey({ partnerId: "p", adVideoId: "v", cutVersion: 3 }), "partners/p/ad-video/cut/v-v3.mp4");
  assert.equal(submagicKey({ partnerId: "p", adVideoId: "v", cutVersion: 3 }), "partners/p/ad-video/submagic/v-v3.mp4");
  assert.throws(() => finalKey({ partnerId: "../x", adNumber: "1" }), /not safe/);
  assert.throws(() => finalKey({ partnerId: "p", adNumber: "1/2" }), /not safe/);
});

test("the clip hash ignores key order and changes with anything that changes pixels", () => {
  const base = { template: "QualifyToday", props: { a: 1, b: { y: 2, x: 1 } }, frames: 75 };
  const same = { template: "QualifyToday", props: { b: { x: 1, y: 2 }, a: 1 }, frames: 75 };
  assert.equal(clipHash(base), clipHash(same));
  assert.notEqual(clipHash(base), clipHash({ ...base, props: { a: 2, b: { y: 2, x: 1 } } }));
  assert.notEqual(clipHash(base), clipHash({ ...base, frames: 76 }));
  assert.notEqual(clipHash(base), clipHash({ ...base, template: "SoftPull" }));
  assert.notEqual(clipHash(base), clipHash({ ...base, mode: "overlay" }));
  assert.match(clipKey(base), /^cache\/animations\/[0-9a-f]{64}\.mp4$/);
  assert.match(clipKey({ ...base, mode: "overlay" }), /\.mov$/);
});

test("copy_export only fetches https links (a file:// or http:// URL is refused at the door)", () => {
  for (const bad of ["file:///etc/passwd", "http://x.test/e.mp4", "ftp://x.test/e"]) {
    assert.throws(() => validateJobRequest(req("copy_export", { payload: { ...GOOD.copy_export, export_url: bad } })), /https link/);
  }
});

test("the Drive request uses the job's bearer token and refuses odd ids", () => {
  const r = driveDownloadRequest({ fileId: "1AbC_dEf", accessToken: "tok" });
  assert.match(r.url, /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/1AbC_dEf\?alt=media/);
  assert.equal(r.headers.authorization, "Bearer tok");
  assert.throws(() => driveDownloadRequest({ fileId: "a/../b", accessToken: "t" }), /bad Drive file id/);
  assert.throws(() => driveDownloadRequest({ fileId: "ok", accessToken: "" }), /no Drive token/);
});
