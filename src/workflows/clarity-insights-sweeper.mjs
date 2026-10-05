// Daily Microsoft Clarity Data Export pull (2 queries — stays under 10/day quota).

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { runClarityOrgSync } from "../analytics/clarity-org-sync.mjs";

export const SOURCE_WORKFLOW = "clarity-insights-sweeper";
export const SWEEP_CRON = "30 7 * * *";

export async function sweep(deps = {}) {
  const database = deps.db || db;
  return runClarityOrgSync({
    db: database,
    token: deps.token ?? process.env.CLARITY_DATA_EXPORT_TOKEN,
    projectId: deps.projectId ?? process.env.CLARITY_PROJECT_ID,
    numOfDays: deps.numOfDays ?? 3,
    fetch: deps.fetch,
  });
}

export async function handle({ step } = {}) {
  const run = () => sweep();
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const clarityInsightsSweeper = inngest.createFunction(
  { id: "clarity-insights-sweeper", name: "Microsoft Clarity insights sweeper", retries: 0 },
  { cron: SWEEP_CRON },
  () => sweep(),
);

export default sweep;
