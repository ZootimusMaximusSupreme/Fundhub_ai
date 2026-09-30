// Daily sweeper — Next Funding Sequence ready date → closer task.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { sweep, SWEEP_CRON, SOURCE_WORKFLOW } from "../blueprint/next-funding-sequence.mjs";

export { SWEEP_CRON, SOURCE_WORKFLOW };

export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const blueprintNextFundingSequenceSweeper = inngest.createFunction(
  { id: "blueprint-next-funding-sequence-sweeper", name: "Blueprint Next Funding Sequence sweeper" },
  { cron: SWEEP_CRON },
  () => sweep(db)
);

export default sweep;
