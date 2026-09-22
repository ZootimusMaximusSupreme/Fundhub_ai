// POST /api/analytics/clickfunnels-sync — pull funnels, pages and page stats
// from ClickFunnels and mirror them into funnel_page_stats.
//
//   body: { days?: number }   — lookback window, default 7, capped at 90 (the
//                                stats endpoint itself clamps to 90 days).
//
// STAFF ONLY, ORG-WIDE. Same posture as clickfunnels-connect.mjs.
//
// ONE ROW PER PAGE PER SYNC RUN, NOT PER DAY. funnel_page_stats is shaped
// "one row per page per day" (302's own comment), but ClickFunnels' page-stats
// endpoint returns ONE aggregate for whatever timerange you give it — it does
// not hand back a daily breakdown. Calling it once per day in the window would
// multiply this run's ClickFunnels API calls by the window length for no real
// gain, so this endpoint calls fetchPageStats() ONCE per page for the whole
// {from, to} window and stamps the row with stat_date = today (the date this
// sync ran), holding the trailing-N-day aggregate as of right now. Re-running
// the sync the same day upserts (overwrites) today's row with fresh numbers;
// distinct days build a real trend line only across distinct sync runs. This
// is a deliberate reading of "fetchPageStats per page for the window" in the
// build spec, flagged here because the alternative (N calls per page) is also
// defensible and nothing in the spec settles it either way.
//
// NEVER A FAKE ZERO. views/conversions are NULL whenever fetchPageStats
// returned {available:false} — the CLAUDE.md §12 rule for money applies here
// for the identical reason: "we don't know" and "really zero" must never look
// the same on a screen.
//
// ONE TRANSACTION, NO PARTIAL ROLLBACK ON A PLATFORM ERROR. A ClickFunnels
// failure partway through (listFunnels/listPages/fetchPageStats throwing a
// real error, not the handled available:false case) is caught INSIDE the
// asStaff() callback rather than left to propagate — propagating it would roll
// back the whole transaction, including the connection_state='error' row and
// every page already synced this run. Catching it here means both the partial
// progress and the honest error state commit together.

import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid } from "../../src/http/read-api.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import {
  runClickfunnelsOrgSync,
  resolveSyncDays,
  DEFAULT_DAYS
} from "../../src/analytics/clickfunnels-org-sync.mjs";

export default async function handler(req, res, deps = {}) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, deps);
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.STAFF)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) return res.status(403).json({ ok: false, error: "forbidden" });

  const days = resolveSyncDays((req.body || {}).days ?? DEFAULT_DAYS);

  try {
    const result = await runClickfunnelsOrgSync({ orgId, days, deps: { db: deps.db, fetch: deps.fetch } });

    if (result.notFound) {
      return res.status(404).json({
        ok: false,
        error: "no_connection",
        message: "no ClickFunnels connection — connect one first"
      });
    }
    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        error: "sync_failed",
        message: result.message,
        pages_synced: result.pagesSynced
      });
    }
    return res.status(200).json({ ok: true, pages_synced: result.pagesSynced, stats_available: result.statsAvailable });
  } catch (err) {
    if (dbDown(res, err)) return;
    throw err;
  }
}
