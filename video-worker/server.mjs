// Fundhub video worker (spec 9.5). A thin HTTP shell.
//
//   GET  /health          ffmpeg build + queue depth (needs the key header)
//   POST /jobs            {type, ad_video_id, org_id, payload, cut_version, job_id} -> 202
//   GET  /jobs/:id        the job's state; 404 when this process does not know it
//
// Every call needs X-Fundhub-Video-Key. One job runs at a time (Render Standard
// is 1 CPU, 2 GB). Jobs live in memory only: after a restart, GET /jobs/:id is
// 404 and Netlify reclaims the row and resends (spec 9.5 "Claims").
//
// All decisions are in ../src/ad-videos/ (worker-protocol, worker-jobs,
// overlay-plan, ffmpeg-plan). Nothing here is unit-tested because nothing here
// decides anything. It holds no Google credential: a job carries a one-hour
// Drive token, and that token is never logged or kept after the job runs.

import { createServer } from "node:http";
import { keyOk, validateJobRequest, WorkerProtocolError, callbackHeaders } from "../src/ad-videos/worker-protocol.mjs";
import { runJob } from "../src/ad-videos/worker-jobs.mjs";
import * as plan from "../src/ad-videos/ffmpeg-plan.mjs";
import { r2FromEnv } from "./lib/r2.mjs";
import { makeIo, withWorkDir, run } from "./lib/io.mjs";
import { renderClip } from "./lib/remotion.mjs";

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY_BYTES = 1024 * 1024;
const KEEP_JOBS = 200;
const CALLBACK_TRIES = 4;

const jobs = new Map(); // id -> { id, type, adVideoId, status, queuedAt, startedAt, finishedAt, outcome, callback }
const queue = [];
let running = null;
let ffmpegBuild = { ok: false, problems: ["not_checked"] };
let r2 = null;

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > MAX_BODY_BYTES) throw new WorkerProtocolError("body_too_large", "body over 1 MB");
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function publicView(j) {
  return {
    id: j.id, type: j.type, ad_video_id: j.adVideoId, status: j.status,
    queued_at: j.queuedAt, started_at: j.startedAt ?? null, finished_at: j.finishedAt ?? null,
    callback: j.callback ?? null,
    // The result is small and has no secret in it; Netlify can read it if a callback was lost.
    outcome: j.outcome ?? null,
  };
}

async function sendCallback(j, orgId) {
  const secret = process.env.VIDEO_WORKER_CALLBACK_SECRET;
  const url = process.env.VIDEO_WORKER_CALLBACK_URL;
  if (!secret || !url) {
    j.callback = "not_configured";
    return;
  }
  const body = JSON.stringify({
    job_id: j.id, type: j.type, ad_video_id: j.adVideoId, org_id: orgId,
    status: j.outcome.status, result: j.outcome.result ?? null, error: j.outcome.error ?? null,
  });
  for (let attempt = 1; attempt <= CALLBACK_TRIES; attempt++) {
    try {
      // Re-signed each try so a slow retry never falls outside the 5-minute window.
      const r = await fetch(url, { method: "POST", headers: callbackHeaders({ secret, body }), body });
      if (r.ok) {
        j.callback = "delivered";
        return;
      }
      j.callback = `refused_${r.status}`;
      if (r.status === 401 || r.status === 400) return; // retrying cannot fix these
    } catch (err) {
      j.callback = `unreachable: ${String(err?.message || err).slice(0, 120)}`;
    }
    await new Promise((ok) => setTimeout(ok, 2000 * attempt));
  }
}

async function work(j, orgId, job) {
  j.status = "running";
  j.startedAt = new Date().toISOString();
  const outcome = await withWorkDir(async (dir) => {
    const io = makeIo({ dir, r2, renderClip });
    return runJob({ job, io, plan });
  });
  j.outcome = outcome;
  j.status = outcome.status;
  j.finishedAt = new Date().toISOString();
  await sendCallback(j, orgId);
}

async function pump() {
  if (running || queue.length === 0) return;
  const next = queue.shift();
  running = next;
  try {
    await work(next.j, next.orgId, next.job);
  } catch (err) {
    next.j.status = "failed";
    next.j.outcome = { status: "failed", error: { code: "worker_crashed", message: String(err?.message || err).slice(0, 300) } };
    next.j.finishedAt = new Date().toISOString();
    await sendCallback(next.j, next.orgId).catch(() => {});
  } finally {
    next.job.payload = null; // the Drive token must not outlive the job
    running = null;
    while (jobs.size > KEEP_JOBS) jobs.delete(jobs.keys().next().value);
    setImmediate(pump);
  }
}

async function handle(req, res) {
  const url = new URL(req.url, "http://worker");
  if (!keyOk(req.headers, process.env.VIDEO_WORKER_KEY)) return json(res, 401, { ok: false, error: "bad or missing X-Fundhub-Video-Key" });

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, ffmpegBuild.ok ? 200 : 503, {
      ok: ffmpegBuild.ok, ffmpeg: ffmpegBuild, running: running?.j.id ?? null, queued: queue.length,
    });
  }

  if (req.method === "POST" && url.pathname === "/jobs") {
    let job;
    try {
      job = validateJobRequest(JSON.parse(await readBody(req)));
    } catch (err) {
      const code = err instanceof WorkerProtocolError ? err.code : "bad_json";
      return json(res, 400, { ok: false, error: code, message: err instanceof WorkerProtocolError ? err.message : "body is not JSON" });
    }
    const existing = jobs.get(job.id);
    if (existing) return json(res, 202, { ok: true, id: job.id, duplicate: true, status: existing.status });
    const j = { id: job.id, type: job.type, adVideoId: job.adVideoId, status: "queued", queuedAt: new Date().toISOString() };
    jobs.set(job.id, j);
    queue.push({ j, orgId: job.orgId, job });
    setImmediate(pump);
    return json(res, 202, { ok: true, id: job.id, status: "queued" });
  }

  const m = req.method === "GET" && /^\/jobs\/(.+)$/.exec(url.pathname);
  if (m) {
    const j = jobs.get(decodeURIComponent(m[1]));
    return j ? json(res, 200, publicView(j)) : json(res, 404, { ok: false, error: "unknown job" });
  }
  return json(res, 404, { ok: false, error: "not found" });
}

async function main() {
  const v = await run("ffmpeg", ["-version"]).catch((err) => ({ stdout: "", stderr: String(err?.message || err) }));
  ffmpegBuild = plan.checkFfmpegBuild(v.stdout || v.stderr);
  if (!ffmpegBuild.ok) console.error("ffmpeg is not usable:", ffmpegBuild.problems.join(", "));
  r2 = r2FromEnv();
  createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("request failed:", String(err?.message || err));
      if (!res.headersSent) json(res, 500, { ok: false, error: "internal" });
    });
  }).listen(PORT, () => console.log(`video worker listening on ${PORT}`));
}

main().catch((err) => {
  console.error("video worker could not start:", String(err?.message || err));
  process.exit(1);
});
