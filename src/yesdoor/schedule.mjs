// src/yesdoor/schedule.mjs — who is due for what. Pure: it decides, it queues nothing.
// Spec: docs/specs/yesdoor-mvp-build-spec.md §6. The crons (B3b) read rows,
// call these, and do the writing.
//
//   rentersDueForRecheck    yd-recheck       daily
//   touchesDue              yd-touches       hourly
//   buildingsWithStaleRules yd-rules-stale   daily

import { YD_DEFAULTS } from "./config.mjs";
import { addDays, addMonths, toDate, wholeDaysBetween } from "./util.mjs";

/* ------------------------------------------------------------- rechecks */

const SCREENING_STAGES = new Set(["screened", "matched", "booked"]);
const PLACED_STAGES = new Set(["placed", "lifetime"]);

/**
 * Renters due for a new screening. Never asks the renter: it runs under the
 * consent captured at sign-up.
 *
 * renters: [{ id, stage, lastScreeningAt, leaseEnd?, recheckConsent? }]
 *   `recheckConsent === false` skips the renter. Anything else (including
 *   missing) is treated as consented, because the sign-up screen captures
 *   screening and recheck consent together.
 *
 * Two reasons, in this order of priority:
 *   stale_screening  stage screened|matched|booked and the last screening is
 *                    older than recheckDays (30), or there is none
 *   lease_end_90     stage placed|lifetime, lease ends within
 *                    leaseEndRecheckDays (90) and has not ended, and no screening
 *                    has run since the renter entered that window
 */
export function rentersDueForRecheck({ renters = [], now = new Date(), defaults = YD_DEFAULTS } = {}) {
  const due = [];
  for (const r of renters) {
    if (!r || r.recheckConsent === false) continue;
    const last = toDate(r.lastScreeningAt);

    if (SCREENING_STAGES.has(r.stage)) {
      if (!last || wholeDaysBetween(last, now) > defaults.recheckDays) {
        due.push({ renterId: r.id, reason: "stale_screening", lastScreeningAt: last ? last.toISOString() : null });
      }
      continue;
    }

    if (PLACED_STAGES.has(r.stage)) {
      const end = toDate(r.leaseEnd);
      if (!end || end <= now) continue;
      const windowStart = addDays(end, -defaults.leaseEndRecheckDays);
      if (windowStart > now) continue;
      if (!last || last < windowStart) {
        due.push({ renterId: r.id, reason: "lease_end_90", lastScreeningAt: last ? last.toISOString() : null });
      }
    }
  }
  return due.sort((a, b) => String(a.renterId).localeCompare(String(b.renterId)));
}

/* -------------------------------------------------------------- touches */

export const TOUCH_KINDS = Object.freeze(["move_in_welcome", "day_30", "month_6", "lease_end_90"]);

/** When each touch comes due. The numbers are in the names (30 days, 6 months); lease_end_90 reads config. */
function touchDueAt(kind, app, defaults) {
  const movedIn = toDate(app.movedInAt);
  switch (kind) {
    case "move_in_welcome": return movedIn;
    case "day_30": return movedIn ? addDays(movedIn, 30) : null;
    case "month_6": return movedIn ? addMonths(movedIn, 6) : null;
    case "lease_end_90": {
      const end = toDate(app.leaseEnd);
      return end ? addDays(end, -defaults.leaseEndRecheckDays) : null;
    }
    default: return null;
  }
}

const MOVED_IN_OR_LATER = new Set(["moved_in", "invoiced", "paid", "safe"]);

/**
 * Lifetime touches due now and not yet queued.
 *
 * applications:    [{ id, renterId, stage, movedInAt, leaseEnd }]
 * existingTouches: [{ applicationId, kind }]  (any row, sent or not, counts as queued)
 *
 * Only placed renters get touches: stage moved_in, invoiced, paid or safe. A
 * refunded or cancelled application gets none. lease_end_90 is skipped once the
 * lease has ended. Result is sorted by dueAt, then application id, then kind.
 */
export function touchesDue({ applications = [], existingTouches = [], now = new Date(), defaults = YD_DEFAULTS } = {}) {
  const have = new Set(existingTouches.map((t) => `${t.applicationId}|${t.kind}`));
  const nowDate = toDate(now);
  const out = [];
  for (const app of applications) {
    if (!app || !MOVED_IN_OR_LATER.has(app.stage)) continue;
    for (const kind of TOUCH_KINDS) {
      if (have.has(`${app.id}|${kind}`)) continue;
      const dueAt = touchDueAt(kind, app, defaults);
      if (!dueAt || dueAt > nowDate) continue;
      if (kind === "lease_end_90" && toDate(app.leaseEnd) <= nowDate) continue;
      out.push({ applicationId: app.id, renterId: app.renterId ?? null, kind, dueAt: dueAt.toISOString() });
    }
  }
  return out.sort((a, b) =>
    a.dueAt.localeCompare(b.dueAt)
    || String(a.applicationId).localeCompare(String(b.applicationId))
    || TOUCH_KINDS.indexOf(a.kind) - TOUCH_KINDS.indexOf(b.kind));
}

/* ---------------------------------------------------------- stale rules */

const RULES_STATUSES = new Set(["signed", "live"]);

/**
 * Buildings whose rules are past rulesStaleDays (or were never confirmed).
 * Only signed or live buildings count: the others have nobody to match.
 *
 * buildings: [{ id, status, rulesConfirmedAt }]  (confirmed_at of the CURRENT rules version)
 * Returns [{ buildingId, neverConfirmed, daysSinceConfirmed }], stalest first.
 * The cron must not queue a second re-confirm email for a building that already
 * has one queued; that check needs the outbox, so it lives in the cron.
 */
export function buildingsWithStaleRules({ buildings = [], now = new Date(), defaults = YD_DEFAULTS } = {}) {
  const out = [];
  for (const b of buildings) {
    if (!b || !RULES_STATUSES.has(b.status)) continue;
    const confirmed = toDate(b.rulesConfirmedAt);
    if (!confirmed) {
      out.push({ buildingId: b.id, neverConfirmed: true, daysSinceConfirmed: null });
      continue;
    }
    const days = wholeDaysBetween(confirmed, now);
    if (days > defaults.rulesStaleDays) {
      out.push({ buildingId: b.id, neverConfirmed: false, daysSinceConfirmed: days });
    }
  }
  return out.sort((a, b) =>
    (b.neverConfirmed - a.neverConfirmed)
    || ((b.daysSinceConfirmed ?? 0) - (a.daysSinceConfirmed ?? 0))
    || String(a.buildingId).localeCompare(String(b.buildingId)));
}
