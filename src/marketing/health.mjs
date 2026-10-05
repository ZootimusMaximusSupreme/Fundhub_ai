// What the marketing health card reads (the M2 `health` route comes later and
// calls this). One call: the repo outbox, the job queue and the buzzes.

import { outboxHealth } from "../repo/outbox.mjs";

export async function marketingHealth(db) {
  const jobs = await db.query(
    `SELECT
       count(*) FILTER (WHERE status = 'queued')::int AS queued,
       count(*) FILTER (WHERE status = 'running')::int AS running,
       count(*) FILTER (WHERE status = 'failed' AND finished_at > now() - interval '7 days')::int AS failed_7d,
       min(run_after) FILTER (WHERE status = 'queued') AS oldest_queued_at
     FROM marketing_jobs`
  );
  const lastFailed = await db.query(
    `SELECT kind, error, finished_at FROM marketing_jobs
      WHERE status = 'failed' ORDER BY finished_at DESC LIMIT 1`
  );
  const buzzes = await db.query(
    `SELECT count(*)::int AS waiting FROM marketing_buzzes WHERE sent_at IS NULL`
  );
  return {
    outbox: await outboxHealth(db),
    jobs: { ...jobs.rows[0], last_failed: lastFailed.rows[0] || null },
    buzzes: buzzes.rows[0]
  };
}

export { outboxHealth };
