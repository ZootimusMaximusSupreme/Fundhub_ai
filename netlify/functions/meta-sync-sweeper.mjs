// The clock for the Meta pull. It does no work itself.
//
// Spec M0 step 5: the Meta sync runs every hour for the last 3 days, plus a
// nightly 28-day pass. A full pass walks every campaign, ad set and ad, then
// the numbers — not bounded by the 26 seconds /api/inngest gets, nor by the 30
// seconds a scheduled function gets (spec §4 trap 5). So this holds the clock,
// starts netlify/functions/meta-sync-background.mjs (15 minutes) with the name
// of the pass, and returns. Same split as ad-video-sweeper.mjs.
//
// The pass is chosen here from the clock: the 07:xx UTC run is the nightly
// 28-day pass (midnight Pacific), every other hour is the 3-day pass.
//
// The worker is woken with MARKETING_WORKER_SECRET (spec Appendix D, the same
// secret that wakes the marketing worker). Unset → nothing starts, the log says
// so, and an error heartbeat makes the job red in the daily pulse
// (src/pulse/heartbeats.mjs). No inline fallback: the pull never runs inside
// this 30-second function (spec §4 trap 5). No new variable.
//
// THE SCHEDULE IS DECLARED IN netlify.toml, NOT HERE — same reason as the other
// sweepers in this directory (no new npm dependency for the schedule() wrapper).

import { db as defaultDb } from "../../src/db.mjs";
import { recordHeartbeat } from "../../src/pulse/heartbeats.mjs";
import { SWEEP_CRON as WORKFLOW_CRON, passFor } from "../../src/workflows/meta-campaign-sync-sweeper.mjs";

/* Must match netlify.toml [functions."meta-sync-sweeper"] schedule. */
export const SWEEP_CRON = WORKFLOW_CRON;

export const WORKER_PATH = "/.netlify/functions/meta-sync-background";
export const AUTH_HEADER = "x-fundhub-worker";

export async function handler(_req, _ctx, deps = {}) {
  const startedAt = new Date();
  const db = deps.db || defaultDb;
  const env = deps.env || process.env;
  const doFetch = deps.fetch || fetch;
  const now = deps.now ? deps.now() : new Date();
  const base = env.URL || env.DEPLOY_URL || "";
  const secret = env.MARKETING_WORKER_SECRET || "";
  const pass = passFor(now);

  if (!base || !secret) {
    /* Still a 200: a missing variable is a thing to read in the log, not a
       deploy-level alarm. */
    const why = !base ? "no site URL in the environment" : "MARKETING_WORKER_SECRET is not set";
    console.error(`[meta-sync-sweeper] did not start the ${pass} pass: ${why}`);
    await recordHeartbeat(db, { job: "meta-sync-sweeper", runner: "netlify", startedAt, outcome: "error", error: why });
    return new Response(JSON.stringify({ ok: false, started: false, pass, error: why }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  }

  let started = false;
  let error = null;
  try {
    /* A background function answers 202 the moment it is accepted, so this
       await waits for the acceptance, not for the pull. */
    const res = await doFetch(`${base}${WORKER_PATH}?pass=${pass}`, {
      method: "POST",
      headers: { [AUTH_HEADER]: secret }
    });
    started = res.status === 202 || res.ok;
    if (!started) error = `the worker answered ${res.status}`;
  } catch (err) {
    error = String((err && err.message) || err).slice(0, 300);
  }

  if (error) console.error(`[meta-sync-sweeper] ${error}`);
  await recordHeartbeat(db, { job: "meta-sync-sweeper", runner: "netlify", startedAt, outcome: error ? "error" : "ok", error });
  return new Response(JSON.stringify({ ok: !error, started, pass, error }), {
    status: 200, headers: { "content-type": "application/json" }
  });
}

export default handler;
