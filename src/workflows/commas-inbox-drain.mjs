/* The payment-queue drain, on the scheduler that is actually running.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS — 2026-09-17.
 *
 * netlify/functions/commas-inbox-sweeper.mjs already does exactly this pass,
 * every minute, and its header explains why it was put on Netlify's cron
 * instead of Inngest. That reasoning is unchanged and that function stays
 * exactly as it is. The problem is not the code — it is the clock.
 *
 * MEASURED ON LIVE, 2026-09-17. Six commas_inbox rows sat status='pending'
 * with attempts=0, meaning nothing had even tried them. Two had been waiting
 * since 2026-09-15. The last time anything drained the queue was a single
 * 22-second burst at 17:46; nothing ran after it, across two deploys and four
 * hours. Meanwhile the Inngest clock was demonstrably alive in those same
 * hours, firing on a clean five-minute grid. So the Netlify cron is the dead
 * one, and the money path was hanging off it alone.
 *
 * netlify.toml:104-117 records this identical silent failure happening once
 * before, on 2026-09-06: a scheduled function that throws at load stops
 * running with no alarm, the queue rows just stay `pending`, and the deploy
 * that caused it is green. A single clock under the money path is the real
 * defect, and this is the second clock.
 *
 * RUNNING BOTH IS SAFE, which is why the Netlify one is left alone rather than
 * moved. claim() takes rows with FOR UPDATE SKIP LOCKED, so two passes that
 * overlap work different rows instead of the same ones or blocking; and the
 * inbox dedupes on the payment id before a row is ever written. A double pass
 * cannot count a payment twice.
 *
 * REGISTERING THIS SENDS NOTHING AND CHARGES NOTHING. It reads bytes Commas
 * already delivered and hands them to the same processor the Netlify function
 * hands them to. No money moves that has not already moved. */

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { drain } from "../payments/commas-inbox.mjs";
import { processCommasInboxRow } from "../adapters/commas.mjs";
import { ensureRegistered } from "../register-all.mjs";

/* Every minute — the same cadence as the Netlify sweeper, for the same reason
   its header gives: the delay between a client paying and the system knowing
   they paid is this number, and a human can feel it. */
export const SWEEP_CRON = "* * * * *";

export const SOURCE_WORKFLOW = "commas-inbox-drain";

/* Same bounds as the Netlify pass. Bounded because a pass that ran until the
   queue was empty would hold the function open for as long as the backlog is
   long; a row left unclaimed is still pending and is picked up next minute. */
export const BATCH = 25;
export const MAX_BATCHES_PER_PASS = 4;

/* sweep — one pass. `db` and the processor are arguments so the tests drive it
   directly, without Inngest and without a scheduler.

   NEVER THROWS. A failed pass must not take the schedule down with it, because
   the next pass a minute later is the recovery. The error is returned so the
   caller can log it. */
export async function sweep(db, options = {}) {
  const {
    limit = BATCH,
    maxBatches = MAX_BATCHES_PER_PASS,
    process: proc
  } = options;
  try {
    /* Handlers must be on the bus BEFORE anything is emitted. A cold start
       that skipped this would write the events and dispatch them to nobody —
       the payment would look processed and the money chain would never have
       run. */
    ensureRegistered();
    const result = await drain(db, {
      limit,
      maxBatches,
      process: proc || processCommasInboxRow
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      claimed: 0,
      batches: 0,
      counts: {},
      error: String(err?.message || err).slice(0, 300)
    };
  }
}

/* handle — the shape src/journeys/runner/registry.mjs expects of every
   registered workflow, so "every registered workflow is callable" stays true
   rather than this one becoming the exception.

   It has no event trigger (it is a cron), so no journey will ever reach it and
   it will always appear in the runner's neverFired list. That is the correct
   outcome for a scheduled job, not a coverage hole. */
export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

/* The scheduled definition. Registered in src/workflows/index.mjs. */
export const commasInboxDrain = inngest.createFunction(
  { id: "commas-inbox-drain", name: "Commas payment inbox drain" },
  { cron: SWEEP_CRON },
  async () => {
    const result = await sweep(db);
    if (!result.ok) {
      console.error(`[commas-inbox-drain] pass failed: ${result.error}`);
    } else if (result.claimed > 0) {
      console.log(
        `[commas-inbox-drain] processed ${result.claimed} payment event(s): ` +
        JSON.stringify(result.counts)
      );
    }
    return result;
  }
);

export default sweep;
