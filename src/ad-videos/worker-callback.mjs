// The worker's callback door (spec 9.5): POST /api/webhooks/video-worker.
//
// Wired as a `provider === 'video-worker'` branch in src/http/router.mjs, NOT
// in ROUTES (trap 1). The body is HMAC-signed over `${timestamp}.${body}` with
// a 5-minute window (worker-protocol.mjs), and the handler RE-READS the row
// before it acts: a callback for a job the row no longer points at, or for a
// row that has moved on, changes nothing and still answers 200 (a non-200 only
// makes the worker retry, and the sweeper catches stalls anyway).
//
// UNVERIFIED: `store.advance` enforces `states.mjs`, which does not know
// prepared / cut / animated until PR #26 (9.1) merges. Until then a callback
// that needs one of those states answers 200 `ignored` with the reason, and
// the row stays claimed until the 20-minute reclaim. No SQL here has been run.

import { JOB_FLOW, JOB_TYPES, verifyCallback } from "./worker-protocol.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** What a finished job writes onto the row. The claim is released in the same update. */
const PATCH_FOR = {
  prepare: (r) => ({ audio_storage_key: r.audio_storage_key, silences: r.silences ?? [], recorded_at: r.recorded_at ?? null }),
  build_cut: (r, now) => ({
    cut_storage_key: r.cut_storage_key,
    master_duration_seconds: r.master_duration_seconds,
    cut_at: new Date(now).toISOString(),
  }),
  copy_export: (r) => ({ submagic_storage_key: r.submagic_storage_key }),
  render_and_overlay: (r, now) => ({
    storage_final_key: r.storage_final_key,
    animation_items: r.animation_items ?? { accepted: [], skipped: [] },
    animated_at: new Date(now).toISOString(),
  }),
};

export function parseCallbackBody(rawBody) {
  let body;
  try { body = JSON.parse(String(rawBody ?? "")); } catch { return { ok: false, error: "body is not JSON" }; }
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  if (!JOB_TYPES.includes(body.type)) return { ok: false, error: "unknown job type" };
  if (!body.job_id || !body.ad_video_id || !body.org_id) return { ok: false, error: "job_id, ad_video_id and org_id are required" };
  if (!["done", "failed"].includes(body.status)) return { ok: false, error: "status must be done or failed" };
  return { ok: true, body };
}

/**
 * Decide, from the row as it is NOW, what the callback does. Pure.
 * @returns {{action:'ignore', reason}|{action:'advance', from, to, patch}|{action:'fail', from, reason}}
 */
export function decideCallback({ row, body, now = Date.now() }) {
  if (!row) return { action: "ignore", reason: "no such take" };
  if (row.worker_job_id !== body.job_id) return { action: "ignore", reason: "the row no longer points at this job" };
  const flow = JOB_FLOW[body.type];
  if (row.status !== flow.from) return { action: "ignore", reason: `the row is ${row.status}, not ${flow.from}` };

  if (body.status === "failed") {
    const e = body.error ?? {};
    return { action: "fail", from: flow.from, reason: `${e.code || "worker_failed"}: ${e.message || "the video worker reported a failure"}`.slice(0, 2000) };
  }
  const result = body.result;
  if (!isObj(result)) return { action: "ignore", reason: "a done callback carried no result" };
  return {
    action: "advance",
    from: flow.from,
    to: flow.to,
    patch: { ...PATCH_FOR[body.type](result, now), worker_job_id: null, worker_claimed_at: null },
  };
}

/**
 * The whole door. `store` defaults to ./store.mjs and is injectable for tests.
 * @returns {{status:number, body:object}}
 */
export async function handleVideoWorkerCallback({ db, rawBody, headers = {}, env = process.env, now = Date.now(), store = null }) {
  const verdict = verifyCallback({ secret: env.VIDEO_WORKER_CALLBACK_SECRET, headers, rawBody, now });
  if (!verdict.ok) return { status: 401, body: { ok: false, error: verdict.reason } };

  const parsed = parseCallbackBody(rawBody);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } };
  const { body } = parsed;

  try {
    const s = store ?? (await import("./store.mjs"));
    const row = await s.findById(db, { orgId: body.org_id, id: body.ad_video_id });
    const decision = decideCallback({ row, body, now });
    if (decision.action === "ignore") return { status: 200, body: { ok: true, ignored: true, reason: decision.reason } };

    if (decision.action === "fail") {
      await s.markFailed(db, { orgId: body.org_id, id: body.ad_video_id, from: decision.from, reason: decision.reason });
      return { status: 200, body: { ok: true, id: body.ad_video_id, status: "failed" } };
    }
    const moved = await s.advance(db, {
      orgId: body.org_id, id: body.ad_video_id, from: decision.from, to: decision.to, by: "worker", patch: decision.patch,
    });
    if (!moved) return { status: 200, body: { ok: true, ignored: true, reason: "the row moved before the callback landed" } };
    return { status: 200, body: { ok: true, id: body.ad_video_id, status: decision.to } };
  } catch (err) {
    // A 200 on purpose: a retry storm on an open door is worse than a callback
    // that did nothing, and the sweeper's 20-minute reclaim catches the stall.
    return { status: 200, body: { ok: true, ignored: true, reason: `store refused: ${String(err?.message || err)}` } };
  }
}
