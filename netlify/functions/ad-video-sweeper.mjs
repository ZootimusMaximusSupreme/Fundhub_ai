// The thing that actually moves a filmed take from Drive to a finished ad.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS IS A NETLIFY SCHEDULED FUNCTION AND NOT THE INNGEST CRON.
//
// It is not a preference. It is a wall clock.
//
// src/workflows/ad-video-sweeper.mjs is registered as an Inngest cron, which
// means every pass runs inside the synchronous /api/inngest request. A Netlify
// synchronous function is killed at 26 seconds.
//
// The step that matters cannot be done in 26 seconds. submagicCreate downloads
// the whole take out of Drive and pushes the whole take up to Submagic. The
// first real take was 120 MB. Measured on production 2026-09-23: the pass wrote
// its spend claim at 02:25:11, started the upload, and was killed before it
// could write a project id. The next pass found a claim with no project behind
// it and — correctly — refused to spend again, because Submagic publishes no
// list endpoint and nothing can ask "did my upload land?". The take stopped
// dead at `staged` and only a person could free it.
//
// A Netlify SCHEDULED function gets 15 minutes instead of 26 seconds. That is
// the whole difference, and it is the same pattern staff-message-sweeper,
// commas-inbox-sweeper and social-publish-sweeper already use here.
//
// The Inngest registration is removed in src/workflows/index.mjs so the two
// cannot both run and race each other for the same take.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from "../../src/db.mjs";
import { sweep } from "../../src/workflows/ad-video-sweeper.mjs";

/* Every five minutes, matching the SWEEP_CRON the workflow module documents.

   THE SCHEDULE IS DECLARED IN netlify.toml, NOT HERE — same reason as the other
   sweepers in this directory: the `schedule()` wrapper form is a new npm
   dependency and CLAUDE.md §8 does not allow one for something a two-line
   config block already does. */
export const SWEEP_CRON = "*/5 * * * *";

/* ONE TAKE PER PASS.

   Not a throughput choice — a spend choice. A create costs one of 30 an hour
   and bills API minutes, and an export costs one of 50. Moving a single take
   per pass means a bug that spends wrongly spends once and is visible on the
   next pass, rather than draining the hour's allowance in one invocation.

   Twelve passes an hour is still far more than Chris films. */
export const TAKES_PER_PASS = 1;

/* The scheduled handler. Netlify invokes it on SWEEP_CRON; there is no HTTP
   route to it and no way to trigger it from outside.

   It answers 200 even on a failed pass, deliberately: a non-2xx from a
   scheduled function is a deploy-level alarm, and one failed sweep is not one —
   the next pass five minutes later is the retry, and every take it did not
   finish is still sitting in the same state with its reason written down.

   A web Response, not { statusCode, body }: the default export makes this
   Netlify's newer function style, which rejects the old object and re-runs the
   pass. See src/http/scheduled-functions-return.test.mjs. */
export async function handler() {
  const result = await sweep(db, { limit: TAKES_PER_PASS });

  if (!result.ok) {
    console.error(`[ad-video-sweeper] pass failed: ${result.error}`);
  } else if (result.detected || result.advanced) {
    console.log(`[ad-video-sweeper] found ${result.detected}, moved ${result.advanced}: ` +
      JSON.stringify(result.per || []));
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

export default handler;
