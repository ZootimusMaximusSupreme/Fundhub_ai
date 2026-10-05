// The video worker's client (spec 9.5). Netlify -> worker, the ONLY place that
// speaks to it. CLAUDE.md §12: outbound transmission lives in
// src/messaging/providers/* and nowhere else, so this file goes through the
// chokepoint (src/lib/outbound-fetch.mjs) like meta-capi.mjs does.
//
// THE FENCE IS `ADAPTERS`. The worker is our own service and reaches no person,
// but it spends money (Render time, R2 writes), so it stays behind the same
// dry-run switch as every other adapter: held until ADAPTERS_DRY_RUN is set off.
//
// Every call carries X-Fundhub-Video-Key. NEVER THROWS: a refusal, a held call
// or a dead worker comes back as { ok:false, error } for the caller to classify.
//
// Env (spec Appendix D): VIDEO_WORKER_URL, VIDEO_WORKER_KEY. The callback
// secret (VIDEO_WORKER_CALLBACK_SECRET) is the worker's, for signing back.

import { transmit, ADAPTERS } from "../../lib/outbound-fetch.mjs";
import { VIDEO_KEY_HEADER, jobId, validateJobRequest } from "../../ad-videos/worker-protocol.mjs";

export const PROVIDER = "video-worker";
/* Declared so src/lib/no-unfenced-transmit.test.mjs checks this file goes
   through the fenced HTTP helper. */
export const TRANSMITS = true;

export const SUBMIT_TIMEOUT_MS = 15_000;

/** { url, key } or null when the worker is not configured. */
export function workerConfig(env = process.env) {
  const url = String(env?.VIDEO_WORKER_URL ?? "").trim().replace(/\/+$/, "");
  const key = String(env?.VIDEO_WORKER_KEY ?? "").trim();
  if (!/^https?:\/\//.test(url) || !key) return null;
  return { url, key };
}

async function call(path, init, { env, fetchImpl, what }) {
  const cfg = workerConfig(env);
  if (!cfg) return { ok: false, error: "video worker is not configured (VIDEO_WORKER_URL / VIDEO_WORKER_KEY)" };
  const r = await transmit(
    `${cfg.url}${path}`,
    { ...init, headers: { "content-type": "application/json", [VIDEO_KEY_HEADER]: cfg.key, ...(init.headers || {}) } },
    { fence: ADAPTERS, what, env, fetchImpl, timeoutMs: SUBMIT_TIMEOUT_MS },
  );
  return r;
}

/** GET /health. */
export async function workerHealth({ env = process.env, fetchImpl } = {}) {
  const r = await call("/health", { method: "GET" }, { env, fetchImpl, what: "video-worker health" });
  return { ok: Boolean(r.ok), blocked: Boolean(r.blocked), status: r.status ?? 0, body: r.body ?? null, error: r.error ?? null };
}

/**
 * POST /jobs. `job` = { type, adVideoId, orgId, cutVersion, payload }. Returns
 * { ok, jobId } when the worker answered 202.
 */
export async function submitJob({ env = process.env, job, fetchImpl } = {}) {
  const id = jobId({ adVideoId: job?.adVideoId, type: job?.type, cutVersion: job?.cutVersion ?? 0 });
  const body = {
    job_id: id,
    type: job.type,
    ad_video_id: job.adVideoId,
    org_id: job.orgId,
    cut_version: job.cutVersion ?? 0,
    payload: job.payload,
  };
  // The same check the worker runs, so a bad job fails here and never costs a call.
  validateJobRequest(body);
  const r = await call("/jobs", { method: "POST", body: JSON.stringify(body) }, { env, fetchImpl, what: `video-worker ${job.type}` });
  if (r.ok && r.status === 202) return { ok: true, jobId: id };
  return { ok: false, jobId: id, blocked: Boolean(r.blocked), status: r.status ?? 0, error: r.error || `HTTP ${r.status}` };
}

/**
 * GET /jobs/:id. A 404 means the worker does not know the job (it restarted),
 * which is `missing: true` and the cue to reclaim the row and resend (spec 9.5).
 */
export async function getJob({ env = process.env, id, fetchImpl } = {}) {
  const r = await call(`/jobs/${encodeURIComponent(id)}`, { method: "GET" }, { env, fetchImpl, what: "video-worker job status" });
  if (r.status === 404) return { ok: true, missing: true };
  if (!r.ok) return { ok: false, blocked: Boolean(r.blocked), status: r.status ?? 0, error: r.error || `HTTP ${r.status}` };
  return { ok: true, missing: false, job: r.body };
}
