// The marketing clock's logic (spec M0 step 4). Called every 15 minutes by
// netlify/functions/marketing-clock.mjs. It only READS the database, QUEUES jobs
// and says whether the worker should be woken. It does no real work: a scheduled
// function dies at 30 seconds (§4 trap 5).
//
// It does nothing at all while no org has `enabled` on, and logs "disabled".
//
// A weekly batch is due when the zone's weekday is `batch_weekday` and its clock
// has passed `batch_time`, for up to BATCH_WINDOW_HOURS after. The job's slot is
// the local date and time, so a second tick in the window queues nothing. Turning
// the machine on at 5 pm on a Monday does not fire a 7 am batch.

import { minutesOfDay, localParts } from "./time.mjs";
import { queueJob, runnableCount } from "./jobs.mjs";

export const BATCH_JOB_KIND = "write_batch";
export const BATCH_WINDOW_HOURS = 3;

/** Is a batch due for these settings at `now`? Returns the slot string or null. */
export function batchSlot(settings, now) {
  const start = minutesOfDay(settings.batch_time);
  if (start == null) return null;
  const lp = localParts(now, settings.timezone);
  if (lp.weekday !== settings.batch_weekday) return null;
  const minute = lp.hour * 60 + lp.minute;
  if (minute < start || minute >= start + BATCH_WINDOW_HOURS * 60) return null;
  return `${lp.date} ${settings.batch_time}`;
}

/**
 * clockTick(db, { now? }) -> { disabled, queued, wake }
 * `wake` is true when something is waiting for the worker.
 */
export async function clockTick(db, { now = new Date() } = {}) {
  const orgs = (await db.query(
    `SELECT org_id, batch_weekday, batch_time, timezone FROM marketing_settings WHERE enabled = true`
  )).rows;
  if (orgs.length === 0) {
    console.log("[marketing-clock] disabled: no org has the marketing machine turned on");
    return { disabled: true, queued: 0, wake: false };
  }
  let queued = 0;
  for (const s of orgs) {
    const slot = batchSlot(s, now);
    if (!slot) continue;
    const j = await queueJob(db, { orgId: s.org_id, kind: BATCH_JOB_KIND, slot });
    if (!j.duplicate) {
      queued++;
      console.log(`[marketing-clock] queued ${BATCH_JOB_KIND} for ${slot}`);
    }
  }
  const runnable = await runnableCount(db);
  const buzzes = await db.query(
    `SELECT count(*)::int AS n FROM marketing_buzzes WHERE sent_at IS NULL AND send_after <= now()`
  );
  const outbox = await db.query(
    `SELECT count(*)::int AS n FROM repo_outbox WHERE committed_at IS NULL AND error IS NULL`
  );
  const wake = runnable + buzzes.rows[0].n + outbox.rows[0].n > 0;
  return { disabled: false, queued, wake };
}
