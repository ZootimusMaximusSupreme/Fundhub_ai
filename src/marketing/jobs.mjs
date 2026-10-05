// The marketing job queue (table marketing_jobs, migration 407). Every function
// here is ONE short statement: no transaction is held open while a job runs
// (spec §4 trap 3). The worker claims, runs, then finishes in separate calls.

export const MAX_ATTEMPTS = 3;
export const STALE_CLAIM_MINUTES = 16;
export const RETRY_BACKOFF_SECONDS = 60;

/** Queue a job. `slot` makes it idempotent: the same (org, kind, slot) is queued once. */
export async function queueJob(db, { orgId, kind, payload = {}, slot = null, runAfter = null }) {
  if (!orgId || !kind) throw new Error("queueJob: orgId and kind are required");
  const body = slot ? { ...payload, slot } : payload;
  if (slot) {
    const dup = await db.query(
      `SELECT id FROM marketing_jobs WHERE org_id = $1 AND kind = $2 AND payload->>'slot' = $3 LIMIT 1`,
      [orgId, kind, String(slot)]
    );
    if (dup.rows[0]) return { id: dup.rows[0].id, duplicate: true };
  }
  const r = await db.query(
    `INSERT INTO marketing_jobs (org_id, kind, payload, run_after)
     VALUES ($1,$2,$3::jsonb, COALESCE($4::timestamptz, now())) RETURNING id`,
    [orgId, kind, JSON.stringify(body), runAfter]
  );
  return { id: r.rows[0].id, duplicate: false };
}

/** Claim up to `limit` runnable jobs. FOR UPDATE SKIP LOCKED, so two workers never take the same one. */
export async function claimJobs(db, limit) {
  if (limit <= 0) return [];
  const r = await db.query(
    `UPDATE marketing_jobs SET status = 'running', claimed_at = now(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM marketing_jobs
         WHERE status = 'queued' AND run_after <= now()
         ORDER BY run_after, created_at
         FOR UPDATE SKIP LOCKED LIMIT $1)
      RETURNING id, org_id, kind, payload, attempts`,
    [limit]
  );
  return r.rows;
}

/**
 * Take back claims older than 16 minutes (the worker died or was killed).
 * Under 3 attempts the job goes back in the line; at 3 it fails with its reason.
 */
export async function reclaimStale(db, { minutes = STALE_CLAIM_MINUTES, maxAttempts = MAX_ATTEMPTS } = {}) {
  const r = await db.query(
    `UPDATE marketing_jobs SET
        status = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'queued' END,
        finished_at = CASE WHEN attempts >= $2 THEN now() ELSE NULL END,
        claimed_at = NULL,
        error = CASE WHEN attempts >= $2
                     THEN 'gave up after ' || attempts || ' attempts: the worker stopped before the job finished'
                     ELSE 'the worker stopped before the job finished; trying again' END
      WHERE status = 'running' AND claimed_at < now() - ($1::int * interval '1 minute')
      RETURNING id, status`,
    [minutes, maxAttempts]
  );
  return r.rows;
}

export async function finishJob(db, id, result = null) {
  await db.query(
    `UPDATE marketing_jobs SET status = 'done', finished_at = now(), error = NULL, result = $2::jsonb
      WHERE id = $1`,
    [id, result === null ? null : JSON.stringify(result)]
  );
}

/** A job threw. Retry after a pause until the 3rd attempt, then fail with the reason. */
export async function failJob(db, job, err, { maxAttempts = MAX_ATTEMPTS } = {}) {
  const reason = String((err && err.message) || err).slice(0, 1000);
  if (job.attempts >= maxAttempts) {
    await db.query(
      `UPDATE marketing_jobs SET status = 'failed', finished_at = now(), claimed_at = NULL, error = $2
        WHERE id = $1`,
      [job.id, `gave up after ${job.attempts} attempts: ${reason}`]
    );
    return "failed";
  }
  await db.query(
    `UPDATE marketing_jobs SET status = 'queued', claimed_at = NULL, error = $2,
            run_after = now() + ($3::int * $4::int * interval '1 second')
      WHERE id = $1`,
    [job.id, reason, RETRY_BACKOFF_SECONDS, job.attempts]
  );
  return "queued";
}

/** A job nobody can run (no handler for its kind). Failing it now beats burning 3 attempts. */
export async function failJobNow(db, job, reason) {
  await db.query(
    `UPDATE marketing_jobs SET status = 'failed', finished_at = now(), claimed_at = NULL, error = $2 WHERE id = $1`,
    [job.id, String(reason).slice(0, 1000)]
  );
}

export async function runnableCount(db) {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM marketing_jobs WHERE status = 'queued' AND run_after <= now()`
  );
  return r.rows[0].n;
}
