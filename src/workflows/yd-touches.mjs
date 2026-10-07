// Yesdoor lifetime touches — hourly. Spec docs/specs/yesdoor-mvp-build-spec.md §6.
//
// For every placed renter, queues the touches that have come due (move-in
// welcome, day 30, month 6, 90 days before the lease ends): one yd_touches row and
// one queued yd_outbox email each, written once. Nothing is sent from here; the
// sandbox dispatcher (yd-outbox-dispatch) marks the email sent and sends nothing
// either.
//
// The logic is src/yesdoor/crons/touches.mjs; this file only registers it.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { failIfNotOk, runYdCron } from "../yesdoor/crons/run.mjs";
import { touchesSweep } from "../yesdoor/crons/touches.mjs";

export const TOUCHES_CRON = "10 * * * *";
export const SOURCE_WORKFLOW = "yd-touches";

export const sweep = (sweepDb, options = {}) => runYdCron(sweepDb, touchesSweep, options);

export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const ydTouches = inngest.createFunction(
  { id: "yd-touches", name: "Yesdoor lifetime touches" },
  { cron: TOUCHES_CRON },
  async () => failIfNotOk(SOURCE_WORKFLOW, await sweep(db))
);

export default sweep;
