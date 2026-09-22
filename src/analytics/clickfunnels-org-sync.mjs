// Org-wide ClickFunnels pull into funnel_page_stats. Shared by the HTTP handler
// and the daily sweeper so there is only one copy of the pull logic.

import { asStaff } from "../partners/rls.mjs";
import { listFunnels, listPages, fetchPageStats } from "./clickfunnels.mjs";

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 90;

export function resolveSyncDays(daysRaw) {
  const days = Number(daysRaw);
  return Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), MAX_DAYS) : DEFAULT_DAYS;
}

/** @returns {{ ok: true, pagesSynced, statsAvailable } | { notFound: true } | { ok: false, pagesSynced, message }} */
export async function runClickfunnelsOrgSync({ orgId, days = DEFAULT_DAYS, deps = {} }) {
  const windowDays = resolveSyncDays(days);
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const statDate = to.toISOString().slice(0, 10);

  return asStaff(async (tx) => {
    const connRow = (await tx.query(
      `SELECT * FROM analytics_connections WHERE org_id = $1 AND platform = 'clickfunnels'`,
      [orgId]
    )).rows[0];
    if (!connRow) return { notFound: true };

    const ctx = { fetch: deps.fetch };
    let pagesSynced = 0;
    let statsAttempted = false;
    let statsAvailable = false;

    try {
      const funnels = await listFunnels(connRow, ctx);

      for (const funnel of funnels) {
        const pages = await listPages(connRow, funnel.id, ctx);

        for (const page of pages) {
          const stats = await fetchPageStats(
            connRow, page.id, { from: from.toISOString(), to: to.toISOString() }, ctx
          );
          statsAttempted = true;
          if (stats.available) statsAvailable = true;

          await tx.query(
            `INSERT INTO funnel_page_stats
               (org_id, connection_id, clickfunnels_funnel_id, clickfunnels_page_id,
                funnel_name, page_name, stat_date, views, conversions)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (connection_id, clickfunnels_page_id, stat_date) DO UPDATE SET
               funnel_name = EXCLUDED.funnel_name,
               page_name   = EXCLUDED.page_name,
               views       = EXCLUDED.views,
               conversions = EXCLUDED.conversions,
               captured_at = now()`,
            [
              orgId, connRow.id, String(funnel.id), String(page.id),
              funnel.name, page.name, statDate,
              stats.available ? stats.views : null,
              stats.available ? stats.conversions : null
            ]
          );
          pagesSynced++;
        }
      }

      await tx.query(
        `UPDATE analytics_connections
            SET last_synced_at = now(), last_error = NULL, connection_state = 'active', updated_at = now()
          WHERE id = $1`,
        [connRow.id]
      );

      return { ok: true, pagesSynced, statsAvailable: statsAttempted ? statsAvailable : false };
    } catch (err) {
      const message = String(err.platformMessage || err.message || "sync failed").slice(0, 2000);
      await tx.query(
        `UPDATE analytics_connections
            SET connection_state = 'error', last_error = $2, updated_at = now()
          WHERE id = $1`,
        [connRow.id, message]
      );
      return { ok: false, pagesSynced, message };
    }
  }, deps);
}
