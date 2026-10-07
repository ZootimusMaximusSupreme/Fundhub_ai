// Yesdoor re-check — daily. Spec docs/specs/yesdoor-mvp-build-spec.md §6.
//
// Renters whose last finished screening is older than 30 days, and placed renters
// 90 days before their lease ends, get a new sandbox screening under the recheck
// consent stored at sign-up, and their matches are recomputed. The renter is never
// asked. A renter whose answer on an open application drops to "no" produces a
// staff event.
//
// The logic is src/yesdoor/crons/recheck.mjs; this file only registers it. It
// SENDS NOTHING: the screening is a sandbox stub and no message is queued.
// Registered in src/workflows/index.mjs; the heartbeat row comes from the client
// add-on (src/workflows/client.mjs), and the schedule is in INNGEST_JOBS
// (src/pulse/heartbeats.mjs).

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { failIfNotOk, runYdCron } from "../yesdoor/crons/run.mjs";
import { recheckSweep } from "../yesdoor/crons/recheck.mjs";

export const RECHECK_CRON = "20 10 * * *";
export const SOURCE_WORKFLOW = "yd-recheck";

/* sweep — one pass. `db` and the options are arguments so tests drive it without
   Inngest. Never throws. */
export const sweep = (sweepDb, options = {}) => runYdCron(sweepDb, recheckSweep, options);

/* handle — the shape the journey runner expects of every registered workflow. It
   has no event trigger (it is a cron), so it always lands in neverFired. */
export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const ydRecheck = inngest.createFunction(
  { id: "yd-recheck", name: "Yesdoor re-check" },
  { cron: RECHECK_CRON },
  async () => failIfNotOk(SOURCE_WORKFLOW, await sweep(db))
);

export default sweep;
