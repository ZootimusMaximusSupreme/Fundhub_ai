// Finance OS monthly pull sweeper — the clock behind the included soft pull.
//
// WHAT ONE PASS DOES. For every client with an active `finance-os` subscription
// (financeOsEntitlement()) whose current billing period has not yet had a
// system-requested pull, write one queued row via requestSoftPull(). One row
// per client per period — the query below checks for an existing `system` row
// requested inside the current period before writing another.
//
// WHAT IT CANNOT DO, AND DOES NOT PRETEND TO. requestSoftPull() writes a
// ledger row. It does not call a bureau — see 380_finance_os_monthly_pull.sql's
// header: fulfilSoftPull() is called from nowhere in application code today,
// for any requester kind. A pass of this sweeper makes the honest record "a
// pull was requested"; it does not make a fresh credit file appear. Closing
// that seam is a separate, human decision, the same class as Plaid's.
//
// NEVER THROWS FOR THE WHOLE PASS. One client's consent revocation, a missing
// billing period, or a race with a human-initiated pull must not stop every
// other client's row from being written — same reasoning as
// waypoint-nudge-sweeper.mjs's per-candidate catch.
//
// THE CONSENT GATE STILL APPLIES. requestSoftPull()'s GUARD 0 reads
// soft_pull_consent at request time regardless of requester kind. A client who
// revoked consent, or never granted it, is silently skipped here — refused,
// not erred — exactly as a client-initiated pull would be.
//
// DAILY, NOT HOURLY. A billing period is measured in a month; the only thing a
// faster clock buys is a pull landing a few hours sooner in the rare case a
// period just turned over. Against that: every pass reads every client with an
// active finance-os subscription. See waypoint-nudge-sweeper.mjs's header for
// the same cadence argument at finer grain.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { requestSoftPull, SoftPullError } from "../finance/soft-pulls.mjs";
import { FINANCE_OS_TIER } from "../finance/finance-os-entitlement.mjs";

export const SWEEP_CRON = "0 6 * * *"; // 06:00 UTC daily — matches the other daily sweepers' quiet-hours-safe slot
export const SOURCE_WORKFLOW = "finance-os-pull-sweeper";

export const SCHEDULED_PULL_REASON =
  "Finance OS monthly optimization pull — included with the client's finance-os subscription, requested automatically.";

/** Every active finance-os subscriber whose current period has no `system`
 *  pull yet. One row per (org, client, subscription) — a client cannot hold
 *  two active finance-os subscriptions at once (075's window constraint). */
export async function dueClients(conn, now) {
  const res = await conn.query(
    `SELECT s.id AS subscription_id, s.org_id, s.client_id
       FROM subscriptions s
      WHERE s.tier = $1
        AND s.status = 'active'
        AND s.effective_from <= $2
        AND (s.effective_to IS NULL OR s.effective_to > $2)
        AND s.current_period_start IS NOT NULL
        AND s.current_period_end IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM soft_pull_requests r
           WHERE r.client_id = s.client_id
             AND r.requested_by_kind = 'system'
             AND r.requested_at >= s.current_period_start
        )`,
    [FINANCE_OS_TIER, now]
  );
  return res.rows;
}

/** sweep — one pass. `db` and the clock are arguments so tests drive it
    without Inngest. Returns a tally rather than throwing. */
export async function sweep(conn = db, { now = new Date() } = {}) {
  const tally = { checked: 0, requested: 0, skipped: [], errored: [] };
  const rows = await dueClients(conn, now);
  tally.checked = rows.length;

  for (const row of rows) {
    try {
      const out = await requestSoftPull(conn, {
        orgId: row.org_id,
        clientId: row.client_id,
        requestedBy: { kind: "system" },
        reason: SCHEDULED_PULL_REASON,
        subscriptionId: row.subscription_id,
        provider: "internal"
      });
      if (out.created) {
        tally.requested += 1;
      } else {
        // GUARD 2 already caught an open request (e.g. a human-initiated pull
        // this period) — correct to skip, not an error.
        tally.skipped.push({ clientId: row.client_id, reason: out.reason || "already_open" });
      }
    } catch (e) {
      // consent_required is the expected, common refusal — a client with no
      // valid soft_pull_consent on file is skipped, not logged as a fault.
      if (e instanceof SoftPullError && e.code === "consent_required") {
        tally.skipped.push({ clientId: row.client_id, reason: "consent_required" });
      } else {
        tally.errored.push({ clientId: row.client_id, error: e?.message || String(e) });
      }
    }
  }

  return tally;
}

/* handle — the shape src/journeys/runner/registry.mjs expects. No event
   trigger (it is a cron), so it appears in the runner's neverFired list by
   design, same as waypoint-nudge-sweeper.mjs. */
export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const financeOsPullSweeper = inngest.createFunction(
  { id: "finance-os-pull-sweeper", name: "Finance OS monthly pull sweeper" },
  { cron: SWEEP_CRON },
  () => sweep(db)
);

export default sweep;
