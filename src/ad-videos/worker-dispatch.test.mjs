import test from "node:test";
import assert from "node:assert/strict";
import { dispatchJob, recoverClaim, RELEASE_SQL, RECLAIM_SQL } from "./worker-dispatch.mjs";
import { CLAIM_SQL } from "./worker-protocol.mjs";

const JOB = { type: "build_cut", adVideoId: "v1", orgId: "o1", cutVersion: 2, payload: {} };

function fakeQuery(claimRows = [{ id: "v1" }], reclaimRows = [{ id: "v1" }]) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push([sql, params]);
    if (sql === CLAIM_SQL) return { rows: claimRows };
    if (sql === RECLAIM_SQL) return { rows: reclaimRows };
    return { rows: [{ id: "v1" }] };
  };
  return { query, calls };
}

test("dispatch: claims the row with the job id, then submits", async () => {
  const { query, calls } = fakeQuery();
  const sent = [];
  const worker = { submitJob: async (a) => { sent.push(a.job); return { ok: true, jobId: "v1:build_cut:2" }; } };
  const r = await dispatchJob({ query, worker, env: {}, job: JOB });
  assert.deepEqual(r, { claimed: true, submitted: true, jobId: "v1:build_cut:2" });
  assert.deepEqual(calls, [[CLAIM_SQL, ["v1:build_cut:2", "v1"]]]);
  assert.equal(sent.length, 1);
});

test("dispatch: a row someone else holds is not claimed and nothing is sent", async () => {
  const { query } = fakeQuery([]);
  const worker = { submitJob: async () => { throw new Error("must not be called"); } };
  assert.deepEqual(await dispatchJob({ query, worker, env: {}, job: JOB }), { claimed: false, jobId: "v1:build_cut:2" });
});

test("dispatch: a refused submit gives the claim back so the row is free at once", async () => {
  const { query, calls } = fakeQuery();
  const worker = { submitJob: async () => ({ ok: false, error: "HTTP 503" }) };
  const r = await dispatchJob({ query, worker, env: {}, job: JOB });
  assert.equal(r.submitted, false);
  assert.equal(r.error, "HTTP 503");
  assert.deepEqual(calls.at(-1), [RELEASE_SQL, ["v1", "v1:build_cut:2"]]);
});

test("recover: a worker that still knows the job is left alone", async () => {
  const { query, calls } = fakeQuery();
  const worker = { getJob: async () => ({ ok: true, missing: false, job: { status: "running" } }), submitJob: async () => { throw new Error("no"); } };
  const r = await recoverClaim({ query, worker, env: {}, job: JOB, claimedJobId: "v1:build_cut:2" });
  assert.equal(r.action, "running");
  assert.equal(calls.length, 0);
});

test("recover: a 404 reclaims the row and sends the job again (spec 9.5)", async () => {
  const { query, calls } = fakeQuery();
  const sent = [];
  const worker = { getJob: async () => ({ ok: true, missing: true }), submitJob: async (a) => { sent.push(a); return { ok: true }; } };
  const r = await recoverClaim({ query, worker, env: {}, job: JOB, claimedJobId: "v1:build_cut:1" });
  assert.deepEqual(r, { action: "resent", jobId: "v1:build_cut:2" });
  assert.deepEqual(calls, [[RECLAIM_SQL, ["v1", "v1:build_cut:1", "v1:build_cut:2"]]]);
  assert.equal(sent.length, 1);
});

test("recover: an unreachable worker changes nothing; a lost reclaim race sends nothing", async () => {
  const a = fakeQuery();
  const down = { getJob: async () => ({ ok: false, error: "timed out" }), submitJob: async () => { throw new Error("no"); } };
  assert.equal((await recoverClaim({ query: a.query, worker: down, env: {}, job: JOB, claimedJobId: "x" })).action, "worker_unreachable");
  assert.equal(a.calls.length, 0);

  const b = fakeQuery([{ id: "v1" }], []);
  const missing = { getJob: async () => ({ ok: true, missing: true }), submitJob: async () => { throw new Error("no"); } };
  assert.equal((await recoverClaim({ query: b.query, worker: missing, env: {}, job: JOB, claimedJobId: "x" })).action, "running");
});

test("recover: a failed resend gives the claim back", async () => {
  const { query, calls } = fakeQuery();
  const worker = { getJob: async () => ({ ok: true, missing: true }), submitJob: async () => ({ ok: false, error: "HTTP 500" }) };
  const r = await recoverClaim({ query, worker, env: {}, job: JOB, claimedJobId: "v1:build_cut:1" });
  assert.equal(r.action, "resend_failed");
  assert.equal(calls.at(-1)[0], RELEASE_SQL);
});
