// Yesdoor: the daily job that turns a paid fee safe after its refund window.
//
// The logic lives with the rest of Yesdoor in src/yesdoor/workflows/yd-fee-safe.mjs
// so it moves out with the app; this file is the Fundhub-side registration (the
// workflow index and the journey runner read this folder). A cron with no event
// trigger, so no journey reaches it: it always sits in neverFired, like every
// sweeper. Watched by the daily pulse: INNGEST_JOBS in src/pulse/heartbeats.mjs
// carries the same id and the same cron.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { runFeeSafe } from "../yesdoor/workflows/yd-fee-safe.mjs";

export const SWEEP_CRON = "0 8 * * *";

export const ydFeeSafe = inngest.createFunction(
  { id: "yd-fee-safe", name: "Yesdoor — paid fees go safe" },
  { cron: SWEEP_CRON },
  () => runFeeSafe(db)
);

/** The journey runner's entry point (src/journeys/runner/registry.mjs). */
export async function handle({ db: handleDb } = {}) {
  return runFeeSafe(handleDb || db);
}
