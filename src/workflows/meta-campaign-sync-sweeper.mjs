// The Meta ad-numbers sweeper — the clock behind the campaign pull.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. NUMBERS WERE BEING LOST FOR GOOD — 2026-09-09.
//
// api/campaigns/sync.mjs pulls a partner's Meta campaigns, ad sets, ads and
// their day-by-day numbers. Until today NOTHING ANYWHERE CALLED IT ON A CLOCK.
// Grepped before this file was written: `campaigns/sync` appears in
// netlify/functions/api.mjs's route map, in src/pulse/registry.mjs, and in its
// own tests. No workflow, no cron, no scheduled job. The only way a sync ever
// ran was a person opening the campaigns screen and pressing Sync.
//
// Paired with a window that only reached back seven days, that is permanent
// data loss, not a delay:
//
//   * Nobody presses the button for eight days → day eight can never be asked
//     for again. Meta still has it. This platform would never ask.
//   * ad_metrics_daily then has no row for that day, and every screen that
//     reads it renders a missing row as zero. "Nobody looked" and "we spent
//     nothing" look exactly the same on a chart.
//
// Two changes close it, and both are needed — either alone still loses days.
// The window is now 28 days (INSIGHT_WINDOW_DAYS, and its comment carries the
// reasoning), and this file is what runs the pull without anyone asking.
//
//
// WHAT ONE PASS DOES. Find every partner that has a Meta connection worth
// trying, and run the ordinary sync for each of them, one partner at a time.
// It is the SAME code path the button uses — syncPartnerConnections() — so
// there is no second, drifting copy of the pull to keep in step.
//
//
// ONE BROKEN PARTNER NEVER TAKES THE PASS DOWN. Every partner is wrapped in its
// own try/catch. A revoked token, a Meta outage, an ad account somebody deleted
// — each is recorded against that partner and the loop moves on. Same reasoning
// as finance-os-pull-sweeper.mjs's per-client catch. A pass that stopped at the
// first bad connection would be the old problem wearing a schedule.
//
//
// WHAT IT RECORDS, AND WHERE. Three places, none of them new:
//   * The tally this function returns — partners seen, partners synced, rows
//     written, who was skipped and who failed. Inngest keeps the return value
//     of every run, so that is the run log.
//   * ad_platform_connections.last_synced_at, set by the sync itself the moment
//     Meta answers.
//   * ad_platform_connections.last_error, set by the sync with Meta's own
//     sentence when a connection fails. That is what the screen already shows.
//
//
// WHY 'pending' CONNECTIONS ARE INCLUDED. It attempts exactly the rows the
// button attempts — syncBlockReason() in api/campaigns/sync.mjs is the single
// definition of "worth trying", used by both. A 'pending' row is a connection
// waiting on the partner admin to click Approve in Meta's Business Settings,
// and a successful read is the only thing in this codebase that promotes one to
// 'active'. If this pass skipped them, a partner who approved on Tuesday would
// stay pending until somebody happened to press the button. Rows that cannot
// work — no stored token, or a `pending:biz:<id>` placeholder ad account — are
// left out by the same function, because asking Meta about them only produces a
// confusing 400.
//
//
// HOURLY 3 DAYS, PLUS A NIGHTLY 28 (spec M0 step 5, 2026-10-05). The machine
// splits each week's scripts by the last 7 days of spend, and the Command
// Center is where Chris looks for how marketing is doing, so today's spend has
// to arrive within the hour. The hourly pass reads only the last 3 days, which
// is where Meta is still moving. Meta reports by whole day in the ad account's
// own timezone, so a day is not final until it has ended there: the nightly
// pass at 07:00 UTC (midnight Pacific, 01:00 Mountain) re-reads all 28 days,
// so a pass that is missed, paused or broken still costs nothing permanent.
//
// NOT AN INNGEST CRON ANY MORE. An Inngest pass runs inside the synchronous
// /api/inngest request, which Netlify kills at 26 seconds (spec §4 trap 5), and
// a full walk of an ad account (every campaign, ad set and ad, then the
// numbers) is not bounded by 26 seconds. The clock is now
// netlify/functions/meta-sync-sweeper.mjs (scheduled, it only starts the work)
// and the work runs in netlify/functions/meta-sync-background.mjs (15
// minutes) — the same split ad-video-sweeper uses. Both call sweep() below.
// metaCampaignSyncSweeper is still exported but no longer registered in
// src/workflows/index.mjs; registering it again would run every pass twice.
//
//
// REGISTERING IT SENDS NOTHING AND SPENDS NOTHING. The sync is a READ from Meta
// plus writes into our own campaigns / ad_sets / ads / ad_metrics_daily tables.
// It does not create a campaign, change a budget, pause or start anything, or
// message anybody. Campaigns go live from api/campaigns/write.mjs, which is a
// person pressing a button and is untouched by this.
//
// INNGEST_EVENT_KEY is not this file's business and is not touched by it.

import { inngest } from "./client.mjs";
import { asStaff } from "../partners/rls.mjs";
import {
  syncPartnerConnections,
  INSIGHT_WINDOW_DAYS,
  HOURLY_WINDOW_DAYS
} from "../../api/campaigns/sync.mjs";

/* Every hour at :17 (off the top of the hour, where every other job lands).
   The 07:xx UTC run is the nightly 28-day pass — midnight Pacific, 01:00
   Mountain — and every other hour reads 3 days. See the header. Must match
   netlify.toml [functions."meta-sync-sweeper"] and that file's SWEEP_CRON. */
export const SWEEP_CRON = "17 * * * *";
export const NIGHTLY_UTC_HOUR = 7;
export const SOURCE_WORKFLOW = "meta-campaign-sync-sweeper";

/* The two passes, by name. The scheduler sends the name, never a number of
   days, so an outside caller cannot ask for an unbounded window. */
export const PASSES = Object.freeze({
  hourly: HOURLY_WINDOW_DAYS,
  nightly: INSIGHT_WINDOW_DAYS
});

/** Which pass a clock tick runs: nightly in the 07:00 UTC hour, else hourly. */
export function passFor(now = new Date()) {
  return new Date(now).getUTCHours() === NIGHTLY_UTC_HOUR ? "nightly" : "hourly";
}

/* The partners worth a pull, read ACROSS the partner boundary.
   asStaff() is the staff scope in src/partners/rls.mjs — the same boundary
   crossing every cross-partner sweeper uses. The per-partner work underneath is
   still opened inside that partner's own scope by syncPartnerConnections(), so
   nothing here widens what a partner-scoped query can see.

   The three conditions mirror syncBlockReason() exactly: a state worth trying,
   a stored key, and a real ad account number rather than a placeholder. They
   are repeated in SQL only to avoid loading every Meta connection in the
   platform into memory to throw most of them away; syncBlockReason() remains
   the authority and runs again inside the sync. */
export const DUE_PARTNERS_SQL = `
  SELECT DISTINCT partner_id
    FROM ad_platform_connections
   WHERE platform = 'meta'
     AND connection_state IN ('active', 'pending')
     AND encrypted_access_token IS NOT NULL
     AND external_ad_account_id IS NOT NULL
     AND external_ad_account_id NOT ILIKE 'pending:%'
   ORDER BY partner_id`;

export async function duePartners({ scope = asStaff } = {}) {
  const rows = await scope((tx) => tx.query(DUE_PARTNERS_SQL).then((r) => r.rows));
  return rows.map((r) => r.partner_id).filter(Boolean);
}

/* sweep — one pass. Every collaborator is an argument, so the tests drive it
   without Inngest, without Meta and without a database.

   NEVER THROWS. A pass that fails must not take the scheduled function down
   with it: tomorrow's pass is the recovery, and the 28-day window means it can
   still fetch everything today's pass missed. The failure is returned so it is
   visible in the run log. */
export async function sweep({
  listPartners = duePartners,
  sync = syncPartnerConnections,
  deps = {},
  windowDays = INSIGHT_WINDOW_DAYS
} = {}) {
  const tally = {
    ok: true,
    window_days: windowDays,
    partners: 0,
    synced: 0,
    campaigns: 0,
    ad_sets: 0,
    ads: 0,
    days_of_numbers: 0,
    skipped: [],
    errored: []
  };

  let partnerIds;
  try {
    partnerIds = await listPartners();
  } catch (err) {
    // Could not even find out who to sync. Nothing was attempted, and saying
    // "0 partners, all fine" would be the exact lie this repo keeps catching.
    return { ...tally, ok: false, error: String((err && err.message) || err).slice(0, 300) };
  }

  tally.partners = partnerIds.length;

  for (const partnerId of partnerIds) {
    try {
      const stats = await sync({ partnerId, deps, windowDays });
      tally.synced += 1;
      tally.campaigns += stats.campaigns || 0;
      tally.ad_sets += stats.ad_sets || 0;
      tally.ads += stats.ads || 0;
      tally.days_of_numbers += stats.insights || 0;

      /* A partner can succeed in part — one campaign fails, the rest commit.
         buildSyncResponse() makes that visible to the person at the screen;
         this makes it visible in the run log rather than rounding it up to
         "synced". */
      if (Array.isArray(stats.errors) && stats.errors.length) {
        tally.errored.push({
          partner_id: partnerId,
          partial: true,
          error: String(stats.errors[0].error || stats.errors[0]).slice(0, 300)
        });
      }
    } catch (err) {
      const code = err && err.code;
      if (code === "NO_CONNECTION" || code === "NO_TOKEN") {
        /* Expected and common: a connection that exists but cannot be used
           yet. Not a fault of the pass, so it is a skip rather than an error —
           the reason still travels, and the connection row already carries it
           for the screen. */
        tally.skipped.push({
          partner_id: partnerId,
          reason: String((err && err.message) || code).slice(0, 300)
        });
      } else {
        tally.errored.push({
          partner_id: partnerId,
          error: String((err && err.message) || err).slice(0, 300)
        });
      }
    }
  }

  return tally;
}

/* handle — the shape src/journeys/runner/registry.mjs expects of every
   registered workflow. No event trigger (it is a cron), so it appears in the
   runner's neverFired list by design, same as finance-os-pull-sweeper.mjs. */
export async function handle({ step } = {}) {
  const run = () => sweep();
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const metaCampaignSyncSweeper = inngest.createFunction(
  { id: "meta-campaign-sync-sweeper", name: "Meta campaign sync sweeper" },
  { cron: SWEEP_CRON },
  () => sweep()
);

export default sweep;
