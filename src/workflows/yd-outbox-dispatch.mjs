// Yesdoor outbox dispatch — every five minutes. Spec §7.
//
// Marks queued yd_outbox rows `sent` through the SANDBOX dispatcher. IT SENDS
// NOTHING: no email, no text, no network call. A real provider belongs in
// src/messaging/providers/ and replaces the sandbox later (CLAUDE.md §12).
//
// The logic is src/yesdoor/crons/outbox-dispatch.mjs; this file only registers it.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { failIfNotOk, runYdCron } from "../yesdoor/crons/run.mjs";
import { outboxDispatchSweep } from "../yesdoor/crons/outbox-dispatch.mjs";

export const OUTBOX_DISPATCH_CRON = "*/5 * * * *";
export const SOURCE_WORKFLOW = "yd-outbox-dispatch";

export const sweep = (sweepDb, options = {}) => runYdCron(sweepDb, outboxDispatchSweep, options);

export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const ydOutboxDispatch = inngest.createFunction(
  { id: "yd-outbox-dispatch", name: "Yesdoor outbox dispatch" },
  { cron: OUTBOX_DISPATCH_CRON },
  async () => failIfNotOk(SOURCE_WORKFLOW, await sweep(db))
);

export default sweep;
