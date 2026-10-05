// The long half of the Meta pull (spec M0 step 5). A background function: up to
// 15 minutes, started by netlify/functions/meta-sync-sweeper.mjs.
//
// It runs the same sweep() the Inngest cron used to run
// (src/workflows/meta-campaign-sync-sweeper.mjs): every partner with a usable
// Meta connection, one at a time, each in its own scope. READS from Meta and
// writes our own campaigns / ad_sets / ads / ad_metrics_daily rows. It never
// creates, starts, pauses or re-budgets anything on Meta.
//
// THIS IS AN OPEN URL, so it checks a shared secret (MARKETING_WORKER_SECRET).
// No secret configured is a closed door.
//
// ?pass=hourly reads the last 3 days; ?pass=nightly reads 28. Any other value is
// refused: the caller names a pass, never a number of days.

import { db as defaultDb } from "../../src/db.mjs";
import { recordHeartbeat } from "../../src/pulse/heartbeats.mjs";
import { sweep, PASSES } from "../../src/workflows/meta-campaign-sync-sweeper.mjs";

/* The pull's own result, written under the clock's job name
   (src/pulse/heartbeats.mjs NETLIFY_JOBS). It lands after the clock's "woke
   it" heartbeat, so a pull that fails is the newest heartbeat and the job is
   red in the daily pulse. A pass where some partners failed is an error too. */
export function heartbeatFor(result) {
  if (!result || !result.ok) {
    return { outcome: "error", error: (result && result.error) || "the pull did not run" };
  }
  const failed = Array.isArray(result.errored) ? result.errored : [];
  if (failed.length) {
    return {
      outcome: "error",
      error: `${failed.length} of ${result.partners} partners failed: ${String(failed[0].error || "").slice(0, 200)}`
    };
  }
  return { outcome: "ok", error: null };
}

export const AUTH_HEADER = "x-fundhub-worker";

function passFrom(req) {
  try {
    return new URL(req.url).searchParams.get("pass") || "";
  } catch {
    return "";
  }
}

export async function handler(req, _ctx, deps = {}) {
  const startedAt = new Date();
  const db = deps.db || defaultDb;
  const env = deps.env || process.env;
  const run = deps.sweep || sweep;
  const expected = env.MARKETING_WORKER_SECRET || "";
  const got = req?.headers?.get ? req.headers.get(AUTH_HEADER) : null;

  if (!expected || got !== expected) {
    console.error("[meta-sync-background] refused: the shared secret did not match");
    return new Response("no", { status: 404 });
  }

  const pass = passFrom(req);
  if (!Object.prototype.hasOwnProperty.call(PASSES, pass)) {
    return new Response(JSON.stringify({ ok: false, error: "pass must be hourly or nightly" }), {
      status: 400, headers: { "content-type": "application/json" }
    });
  }

  console.log(`[meta-sync-background] build ${String(env.COMMIT_REF || "unknown").slice(0, 8)} starting the ${pass} pass`);
  const result = await run({ windowDays: PASSES[pass] });
  if (!result.ok) console.error(`[meta-sync-background] ${pass} pass failed: ${result.error}`);
  else console.log(`[meta-sync-background] ${pass} pass: ${result.synced}/${result.partners} partners, ` +
    `${result.ads} ads, ${result.days_of_numbers} days of numbers, ${result.errored.length} with errors`);

  const beat = heartbeatFor(result);
  await recordHeartbeat(db, {
    job: "meta-sync-sweeper", runner: "netlify", startedAt,
    outcome: beat.outcome, error: beat.error,
    itemCount: Number.isInteger(result.days_of_numbers) ? result.days_of_numbers : null
  });

  return new Response(JSON.stringify({ ...result, pass }), {
    status: 200, headers: { "content-type": "application/json" }
  });
}

export default handler;
