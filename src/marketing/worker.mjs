// The marketing worker's logic (spec M0 step 4). Run by the background function
// netlify/functions/marketing-worker-background.mjs, which gets 15 minutes.
//
// One run:
//   * at most once a minute: drain the repo outbox, send due buzzes, take back
//     claims older than 16 minutes
//   * claim jobs in short statements (FOR UPDATE SKIP LOCKED), up to 3 at once
//   * stop taking new work at minute 9, let running jobs finish, and report
//     moreWork so the function can wake itself again
//   * a job that throws is retried after a pause; at the 3rd attempt it fails with its reason
//
// Job handlers are passed in as { kind: async (job, ctx) => result }. M1 registers
// the batch writer. A kind with no handler fails at once with that reason.
//
// Never run a marketing query on ad_scripts, ad_labels, ads, campaigns or
// ad_metrics_daily on a bare connection: they force partner row-level security.
// A handler that touches them must use asStaff() (src/partners/rls.mjs), and
// must not hold its transaction open across a model, GitHub or Meta call (§4 trap 3).

import { drainOutbox as realDrain } from "../repo/outbox.mjs";
import { sendDueBuzzes as realSendBuzzes } from "./notify.mjs";
import {
  claimJobs, reclaimStale, finishJob, failJob, failJobNow, runnableCount
} from "./jobs.mjs";

export const CONCURRENCY = 3;
export const STOP_NEW_WORK_MS = 9 * 60 * 1000;
export const HOUSEKEEPING_EVERY_MS = 60 * 1000;
export const POLL_MS = 2000;

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * runWorker({ db, pool, env, handlers, ... }) ->
 *   { ran, failed, retried, drains, buzzes, reclaimed, moreWork }
 *
 * Everything outside the database is injectable so tests need no clock or network.
 */
export async function runWorker({
  db, pool, env = process.env, fetchImpl, handlers = {},
  concurrency = CONCURRENCY, stopNewWorkMs = STOP_NEW_WORK_MS,
  housekeepingEveryMs = HOUSEKEEPING_EVERY_MS, pollMs = POLL_MS,
  nowMs = () => Date.now(), sleep = realSleep,
  drainOutbox = realDrain, sendDueBuzzes = realSendBuzzes, send
} = {}) {
  const startedAt = nowMs();
  const out = { ran: 0, failed: 0, retried: 0, drains: 0, buzzes: 0, reclaimed: 0, moreWork: false };
  const running = new Set();
  let lastHousekeeping = -Infinity;
  let stoppedNewWork = false;

  const housekeeping = async () => {
    lastHousekeeping = nowMs();
    try {
      const r = await drainOutbox({ pool, env, fetchImpl });
      out.drains++;
      if (r && r.status && !["empty", "committed", "not_configured", "busy", "already_committed"].includes(r.status)) {
        console.log(`[marketing-worker] outbox drain: ${r.status}${r.message ? ` (${r.message})` : ""}`);
      }
    } catch (err) {
      console.error(`[marketing-worker] outbox drain failed: ${String((err && err.message) || err)}`);
    }
    try {
      const b = await sendDueBuzzes(db, { env, fetchImpl, send });
      out.buzzes += b.sent;
    } catch (err) {
      console.error(`[marketing-worker] buzzes failed: ${String((err && err.message) || err)}`);
    }
    try {
      out.reclaimed += (await reclaimStale(db)).length;
    } catch (err) {
      console.error(`[marketing-worker] reclaim failed: ${String((err && err.message) || err)}`);
    }
  };

  const runOne = async (job) => {
    const handler = handlers[job.kind];
    if (typeof handler !== "function") {
      await failJobNow(db, job, `no handler for job kind "${job.kind}"`);
      out.failed++;
      return;
    }
    try {
      const result = await handler(job, { db, pool, env, fetchImpl });
      await finishJob(db, job.id, result === undefined ? null : result);
      out.ran++;
    } catch (err) {
      const state = await failJob(db, job, err);
      if (state === "failed") out.failed++; else out.retried++;
      console.error(`[marketing-worker] job ${job.id} (${job.kind}) attempt ${job.attempts}: ${String((err && err.message) || err)}`);
    }
  };

  for (;;) {
    if (nowMs() - lastHousekeeping >= housekeepingEveryMs) await housekeeping();

    if (!stoppedNewWork && nowMs() - startedAt >= stopNewWorkMs) stoppedNewWork = true;

    if (!stoppedNewWork) {
      const free = concurrency - running.size;
      if (free > 0) {
        const claimed = await claimJobs(db, free);
        for (const job of claimed) {
          const p = runOne(job).finally(() => running.delete(p));
          running.add(p);
        }
      }
    }

    if (running.size === 0) {
      if (stoppedNewWork) {
        out.moreWork = (await runnableCount(db)) > 0;
        break;
      }
      // Nothing running and nothing was claimable: done for this run.
      if ((await runnableCount(db)) === 0) break;
      // Work exists but is not claimable yet (just queued): look again shortly.
      await sleep(pollMs);
      continue;
    }
    await Promise.race([...running, sleep(pollMs)]);
  }
  return out;
}
