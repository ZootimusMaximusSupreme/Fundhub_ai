// The worker's callback door (spec 9.5): POST /api/webhooks/video-worker.
//
// Wired as a `provider === 'video-worker'` branch in src/http/router.mjs, NOT
// in ROUTES (trap 1). The body is HMAC-signed over `${timestamp}.${body}` with
// a 5-minute window (worker-protocol.mjs), and the handler RE-READS the row
// before it acts: a callback for a job the row no longer points at, or for a
// row that has moved on, changes nothing and still answers 200 (a non-200 only
// makes the worker retry).
//
// THE ROW IS READ HERE, with this file's own query, for `status` and
// `worker_job_id`. It does not rely on `store.findById` returning those
// columns (PR #26's ROW_COLUMNS may not list worker_job_id). The store is used
// only for the state moves, so `states.mjs` stays the one place that allows them.
// The claim is released with an explicit UPDATE after the move, so no patch
// depends on worker_* columns being patchable.
//
// A store error is logged (code and a clipped message, no body, no token) and
// answers 500 so the worker retries; the 20-minute reclaim catches the rest.
//
// UNVERIFIED: no SQL here has been run. `store.advance` enforces `states.mjs`,
// which does not know prepared / cut / animated until PR #26 (9.1) merges.

import { JOB_FLOW, JOB_TYPES, validKey, verifyCallback } from "./worker-protocol.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const num = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const iso = (v) => v === null || (typeof v === "string" && !Number.isNaN(Date.parse(v)));

/** The only columns this door reads. */
export const READ_ROW_SQL = "SELECT id, status, worker_job_id FROM ad_videos WHERE id = $1 AND org_id = $2";
/** Give the claim back once the job is settled, only if it is still this job's. */
export const RELEASE_SQL =
  "UPDATE ad_videos SET worker_job_id = NULL, worker_claimed_at = NULL WHERE id = $1 AND org_id = $2 AND worker_job_id = $3";

export async function readJobRow(db, { orgId, id }) {
  const r = await db.query(READ_ROW_SQL, [id, orgId]);
  return r.rows?.[0] ?? null;
}

/** What each finished job writes onto the row (result columns only). */
const PATCH_FOR = {
  prepare: (r) => ({ audio_storage_key: r.audio_storage_key, silences: r.silences, recorded_at: r.recorded_at ?? null }),
  build_cut: (r, now) => ({
    cut_storage_key: r.cut_storage_key,
    master_duration_seconds: r.master_duration_seconds,
    cut_at: new Date(now).toISOString(),
  }),
  copy_export: (r) => ({ submagic_storage_key: r.submagic_storage_key }),
  render_and_overlay: (r, now) => ({
    storage_final_key: r.storage_final_key,
    animation_items: r.animation_items,
    animated_at: new Date(now).toISOString(),
  }),
};

/** Shape of each result. A done callback that fails this is a 400, never half-applied. */
const RESULT_SHAPE = {
  prepare: (r) =>
    validKey("audio", r.audio_storage_key) &&
    Array.isArray(r.silences) && r.silences.every((s) => isObj(s) && num(s.start) && num(s.end)) &&
    iso(r.recorded_at ?? null),
  build_cut: (r) => validKey("cut", r.cut_storage_key) && num(r.master_duration_seconds) && r.master_duration_seconds > 0,
  copy_export: (r) => validKey("submagic", r.submagic_storage_key),
  render_and_overlay: (r) =>
    validKey("final", r.storage_final_key) &&
    isObj(r.animation_items) && Array.isArray(r.animation_items.accepted) && Array.isArray(r.animation_items.skipped),
};

export function parseCallbackBody(rawBody) {
  let body;
  try { body = JSON.parse(String(rawBody ?? "")); } catch { return { ok: false, error: "body is not JSON" }; }
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  if (!JOB_TYPES.includes(body.type)) return { ok: false, error: "unknown job type" };
  if (!body.job_id || !body.ad_video_id || !body.org_id) return { ok: false, error: "job_id, ad_video_id and org_id are required" };
  if (!["done", "failed"].includes(body.status)) return { ok: false, error: "status must be done or failed" };
  if (body.status === "done" && !(isObj(body.result) && RESULT_SHAPE[body.type](body.result))) {
    return { ok: false, error: `the ${body.type} result is missing a field or has the wrong shape` };
  }
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
  if (!isObj(body.result)) return { action: "ignore", reason: "a done callback carried no result" };
  return { action: "advance", from: flow.from, to: flow.to, patch: PATCH_FOR[body.type](body.result, now) };
}

/**
 * The whole door. `store` defaults to ./store.mjs and is injectable for tests.
 * @returns {{status:number, body:object}}
 */
export async function handleVideoWorkerCallback({ db, rawBody, headers = {}, env = process.env, now = Date.now(), store = null, log = console.error }) {
  const verdict = verifyCallback({ secret: env.VIDEO_WORKER_CALLBACK_SECRET, headers, rawBody, now });
  if (!verdict.ok) return { status: 401, body: { ok: false, error: verdict.reason } };

  const parsed = parseCallbackBody(rawBody);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } };
  const { body } = parsed;
  const key = { orgId: body.org_id, id: body.ad_video_id };

  try {
    const row = await readJobRow(db, key);
    const decision = decideCallback({ row, body, now });
    if (decision.action === "ignore") return { status: 200, body: { ok: true, ignored: true, reason: decision.reason } };

    const s = store ?? (await import("./store.mjs"));
    let status;
    if (decision.action === "fail") {
      await s.markFailed(db, { ...key, from: decision.from, reason: decision.reason });
      status = "failed";
    } else {
      const moved = await s.advance(db, { ...key, from: decision.from, to: decision.to, by: "worker", patch: decision.patch });
      if (!moved) return { status: 200, body: { ok: true, ignored: true, reason: "the row moved before the callback landed" } };
      status = decision.to;
    }
    await db.query(RELEASE_SQL, [key.id, key.orgId, body.job_id]);
    return { status: 200, body: { ok: true, id: key.id, status } };
  } catch (err) {
    // 500 so the worker retries. Logged without the body, the signature or any token.
    log(`[video-worker-callback] ${body.type} ${key.id}: ${err?.code || err?.name || "error"}: ${String(err?.message || err).slice(0, 200)}`);
    return { status: 500, body: { ok: false, error: "store_error" } };
  }
}
