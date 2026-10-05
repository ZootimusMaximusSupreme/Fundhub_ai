import test from "node:test";
import assert from "node:assert/strict";
import { workerConfig, workerHealth, submitJob, getJob, TRANSMITS } from "./video-worker.mjs";
import { VIDEO_KEY_HEADER } from "../../ad-videos/worker-protocol.mjs";

const ENV = { VIDEO_WORKER_URL: "https://worker.test/", VIDEO_WORKER_KEY: "k-123", ADAPTERS_DRY_RUN: "0" };
const JOB = {
  type: "copy_export", adVideoId: "v1", orgId: "o1", cutVersion: 3,
  payload: { export_url: "https://cdn.submagic.co/e.mp4", submagic_key: "partners/p/ad-video/submagic/v1-v1.mp4" },
};

function fakeFetch(status, body = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}

test("declares itself a transmitter so the structural fence test checks it", () => {
  assert.equal(TRANSMITS, true);
});

test("config needs a URL and a key; the trailing slash goes", () => {
  assert.deepEqual(workerConfig(ENV), { url: "https://worker.test", key: "k-123" });
  assert.equal(workerConfig({ VIDEO_WORKER_URL: "https://w.test" }), null);
  assert.equal(workerConfig({ VIDEO_WORKER_KEY: "k" }), null);
  assert.equal(workerConfig({ VIDEO_WORKER_URL: "not a url", VIDEO_WORKER_KEY: "k" }), null);
});

test("submit POSTs the job with the key header and the minted job id, and wants a 202", async () => {
  const { fetchImpl, calls } = fakeFetch(202, { ok: true });
  const r = await submitJob({ env: ENV, job: JOB, fetchImpl });
  assert.deepEqual(r, { ok: true, jobId: "v1:copy_export:3" });
  assert.equal(calls[0].url, "https://worker.test/jobs");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers[VIDEO_KEY_HEADER], "k-123");
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual([sent.job_id, sent.type, sent.ad_video_id, sent.org_id, sent.cut_version], ["v1:copy_export:3", "copy_export", "v1", "o1", 3]);
});

test("submit: a worker error is { ok:false } with the status, never a throw", async () => {
  const { fetchImpl } = fakeFetch(503, { error: "down" });
  const r = await submitJob({ env: ENV, job: JOB, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

test("submit: a bad job fails before any call is made", async () => {
  const { fetchImpl, calls } = fakeFetch(202);
  await assert.rejects(() => submitJob({ env: ENV, job: { ...JOB, payload: {} }, fetchImpl }), /export_url/);
  assert.equal(calls.length, 0);
});

test("the ADAPTERS fence holds every call unless it is explicitly off; nothing leaves", async () => {
  for (const flag of [undefined, "", "1", "true", "banana"]) {
    const { fetchImpl, calls } = fakeFetch(202);
    const env = { ...ENV, ADAPTERS_DRY_RUN: flag };
    if (flag === undefined) delete env.ADAPTERS_DRY_RUN;
    const r = await submitJob({ env, job: JOB, fetchImpl });
    assert.equal(r.ok, false, `flag ${flag}`);
    assert.equal(r.blocked, true, `flag ${flag}`);
    assert.equal(calls.length, 0, `flag ${flag}: nothing may leave`);
  }
});

test("not configured is a plain refusal", async () => {
  const { fetchImpl, calls } = fakeFetch(202);
  const r = await submitJob({ env: { ADAPTERS_DRY_RUN: "0" }, job: JOB, fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.error, /not configured/);
  assert.equal(calls.length, 0);
});

test("getJob: a 404 means the worker lost the job; 200 returns it; an error is not 'missing'", async () => {
  const lost = await getJob({ env: ENV, id: "v1:copy_export:3", fetchImpl: fakeFetch(404, {}).fetchImpl });
  assert.deepEqual(lost, { ok: true, missing: true });
  const f = fakeFetch(200, { id: "v1:copy_export:3", status: "running" });
  const known = await getJob({ env: ENV, id: "v1:copy_export:3", fetchImpl: f.fetchImpl });
  assert.deepEqual(known, { ok: true, missing: false, job: { id: "v1:copy_export:3", status: "running" } });
  assert.equal(f.calls[0].url, "https://worker.test/jobs/v1%3Acopy_export%3A3");
  const down = await getJob({ env: ENV, id: "x", fetchImpl: fakeFetch(502, {}).fetchImpl });
  assert.equal(down.ok, false);
  assert.notEqual(down.missing, true);
});

test("health reads /health with the key", async () => {
  const f = fakeFetch(200, { ok: true, running: null, queued: 0 });
  const r = await workerHealth({ env: ENV, fetchImpl: f.fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(f.calls[0].url, "https://worker.test/health");
  assert.equal(f.calls[0].init.headers[VIDEO_KEY_HEADER], "k-123");
});
