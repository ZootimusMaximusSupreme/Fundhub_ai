// Yesdoor stale rules — daily. Spec docs/specs/yesdoor-mvp-build-spec.md §6.
//
// A signed or live building whose current rules were confirmed more than 30 days
// ago (or never) is flagged with a yd_events row, and its leasing contact gets ONE
// re-confirm email per stale episode (queued; the sandbox dispatcher marks it
// sent). It changes nothing about the building or its rules.
//
// The logic is src/yesdoor/crons/rules-stale.mjs; this file only registers it.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { failIfNotOk, runYdCron } from "../yesdoor/crons/run.mjs";
import { rulesStaleSweep } from "../yesdoor/crons/rules-stale.mjs";

export const RULES_STALE_CRON = "40 10 * * *";
export const SOURCE_WORKFLOW = "yd-rules-stale";

export const sweep = (sweepDb, options = {}) => runYdCron(sweepDb, rulesStaleSweep, options);

export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const ydRulesStale = inngest.createFunction(
  { id: "yd-rules-stale", name: "Yesdoor stale rules" },
  { cron: RULES_STALE_CRON },
  async () => failIfNotOk(SOURCE_WORKFLOW, await sweep(db))
);

export default sweep;
