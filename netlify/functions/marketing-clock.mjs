// The clock for the marketing machine. It does no work itself.
//
// A SCHEDULED function is killed at 30 seconds (spec §4 trap 5), so this only
// reads the database, queues jobs and wakes the background worker, which gets
// 15 minutes. While no org has the machine turned on it queues nothing and logs
// "disabled", but still wakes the worker for waiting repo saves and due buzzes.
// It always returns a 200 Response: a non-2xx from a scheduled
// function is a deploy-level alarm, and a missing variable is not one.
//
// THE SCHEDULE IS DECLARED IN netlify.toml, NOT HERE (CLAUDE.md §8, no new dependency).

import { db } from "../../src/db.mjs";
import { clockTick } from "../../src/marketing/clock.mjs";
import { wakeWorker } from "../../src/marketing/wake.mjs";

export const SWEEP_CRON = "*/15 * * * *";

const json = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" }
});

export async function handler() {
  try {
    const tick = await clockTick(db);
    let woke = null;
    if (tick.wake) {
      woke = await wakeWorker();
      if (woke.error) console.error(`[marketing-clock] did not wake the worker: ${woke.error}`);
    }
    return json({ ok: true, disabled: tick.disabled, queued: tick.queued, woke: woke ? woke.started : false });
  } catch (err) {
    const error = String((err && err.message) || err).slice(0, 300);
    console.error(`[marketing-clock] ${error}`);
    return json({ ok: false, error });
  }
}

export default handler;
