// Daily ClickFunnels funnel_page_stats pull — same posture as meta-campaign-sync-sweeper.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { runClickfunnelsOrgSync } from "../analytics/clickfunnels-org-sync.mjs";

export const SOURCE_WORKFLOW = "clickfunnels-analytics-sweeper";
export const SWEEP_CRON = "15 7 * * *";

export async function sweep(deps = {}) {
  const database = deps.db || db;
  const orgs = (await database.query(
    `SELECT DISTINCT org_id FROM analytics_connections
      WHERE platform = 'clickfunnels' AND connection_state = 'active'`
  )).rows;

  const tally = { orgs: orgs.length, synced: 0, skipped: 0, pages: 0, errors: [] };

  for (const { org_id: orgId } of orgs) {
    try {
      const result = await runClickfunnelsOrgSync({ orgId, days: 30, deps: { db: database, fetch: deps.fetch } });
      if (result.notFound) {
        tally.skipped++;
        continue;
      }
      if (!result.ok) {
        tally.errors.push({ orgId, message: result.message });
        continue;
      }
      tally.synced++;
      tally.pages += result.pagesSynced;
    } catch (err) {
      tally.errors.push({ orgId, message: String(err.message || err).slice(0, 500) });
    }
  }

  return tally;
}

export async function handle({ step } = {}) {
  const run = () => sweep();
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const clickfunnelsAnalyticsSweeper = inngest.createFunction(
  { id: "clickfunnels-analytics-sweeper", name: "ClickFunnels analytics sweeper" },
  { cron: SWEEP_CRON },
  () => sweep()
);

export default sweep;
