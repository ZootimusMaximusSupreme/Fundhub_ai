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

import { sweep, PASSES } from "../../src/workflows/meta-campaign-sync-sweeper.mjs";

export const AUTH_HEADER = "x-fundhub-worker";

function passFrom(req) {
  try {
    return new URL(req.url).searchParams.get("pass") || "";
  } catch {
    return "";
  }
}

export async function handler(req, _ctx, deps = {}) {
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

  return new Response(JSON.stringify({ ...result, pass }), {
    status: 200, headers: { "content-type": "application/json" }
  });
}

export default handler;
