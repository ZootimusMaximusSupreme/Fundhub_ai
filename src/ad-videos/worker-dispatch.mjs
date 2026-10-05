// Claim a row, hand its job to the video worker, take it back when the worker
// lost it (spec 9.5 "Claims"). No network here: `worker` is the provider module
// `src/messaging/providers/video-worker.mjs` (or a fake), and `query` is any
// `(sql, params) => {rows}` — a pg client inside the caller's transaction.
//
// NEVER hold a transaction open across the worker call (spec §4 trap 3): claim
// and release are two short statements, and the HTTP call sits between them.
//
// UNVERIFIED: the columns worker_job_id / worker_claimed_at come from the 9.1
// migration (PR #26), not yet on main. No SQL here has been run against a database.

import { CLAIM_SQL, jobId } from "./worker-protocol.mjs";

/** Give the claim back (the submit failed, so the row is free again at once). */
export const RELEASE_SQL =
  "UPDATE ad_videos SET worker_job_id=NULL, worker_claimed_at=NULL WHERE id=$1 AND worker_job_id=$2 RETURNING id";

/** Take a row whose job the worker no longer knows, bypassing the 20-minute wait. */
export const RECLAIM_SQL =
  "UPDATE ad_videos SET worker_job_id=$3, worker_claimed_at=now() WHERE id=$1 AND worker_job_id=$2 RETURNING id";

/**
 * Claim the row and submit the job.
 * @returns {{claimed:boolean, submitted?:boolean, jobId?:string, error?:string}}
 */
export async function dispatchJob({ query, worker, env, job }) {
  const id = jobId({ adVideoId: job.adVideoId, type: job.type, cutVersion: job.cutVersion ?? 0 });
  const claim = await query(CLAIM_SQL, [id, job.adVideoId]);
  if (!claim.rows?.length) return { claimed: false, jobId: id };

  const sent = await worker.submitJob({ env, job });
  if (sent.ok) return { claimed: true, submitted: true, jobId: id };

  await query(RELEASE_SQL, [job.adVideoId, id]);
  return { claimed: true, submitted: false, jobId: id, error: sent.error };
}

/**
 * Look at a row that holds a claim. If the worker answers 404 (it restarted and
 * lost its table), reclaim the row and send the job again.
 * @returns {{action:'running'|'resent'|'worker_unreachable'|'resend_failed', ...}}
 */
export async function recoverClaim({ query, worker, env, job, claimedJobId }) {
  const status = await worker.getJob({ env, id: claimedJobId });
  if (!status.ok) return { action: "worker_unreachable", error: status.error };
  if (!status.missing) return { action: "running", job: status.job };

  const newId = jobId({ adVideoId: job.adVideoId, type: job.type, cutVersion: job.cutVersion ?? 0 });
  const re = await query(RECLAIM_SQL, [job.adVideoId, claimedJobId, newId]);
  if (!re.rows?.length) return { action: "running", note: "another pass already took the row" };

  const sent = await worker.submitJob({ env, job });
  if (sent.ok) return { action: "resent", jobId: newId };
  await query(RELEASE_SQL, [job.adVideoId, newId]);
  return { action: "resend_failed", error: sent.error };
}
