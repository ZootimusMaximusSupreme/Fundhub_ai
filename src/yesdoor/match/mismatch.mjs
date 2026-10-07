// src/yesdoor/match/mismatch.mjs — "we said approved, the building said no".
// Spec: docs/specs/yesdoor-mvp-build-spec.md §5. Pure: it decides, it writes nothing.
// B4's building/update endpoint runs the database side in one transaction.
//
// Input
//   building   { id, status, appFeeCents, appFeeWaived }
//   denial     { reason, deniedAt? }                 (a reason is required)
//   ourMatch   the match we showed the renter, { result }
//   priorMismatchAt  dates of this building's earlier mismatches (any age; the
//                    90-day window is applied here)
//   backups    already ranked by rankBackups(), best first
//
// Output
//   incrementMismatch  true only when our match said "approved"
//   pauseBuilding      true when this denial brings mismatches inside the window
//                      to mismatchPause (3) and the building is signed or live
//   refundOwedCents    the app fee we owe the renter. 0 when we did not say
//                      approved or the building waived the fee. null when the fee
//                      is owed but its amount is unknown (staff must fill it in).
//   backupsToOffer     up to maxBackups approved backups at other buildings
//   rulesReviewTask    true with pauseBuilding: staff review the rules
//   denialReason       stored for staff; rules never change automatically

import { YD_DEFAULTS } from "../config.mjs";
import { addDays, num, toDate } from "../util.mjs";

const PAUSABLE = new Set(["signed", "live"]);

export function decideMismatch({
  building, denial, ourMatch, priorMismatchAt = [], backups = [],
  now = new Date(), defaults = YD_DEFAULTS
} = {}) {
  const reason = typeof denial?.reason === "string" ? denial.reason.trim() : "";
  if (!reason) throw new Error("a denial needs a reason");
  if (!building) throw new Error("decideMismatch needs the building");

  const incrementMismatch = ourMatch?.result === "approved";
  const at = toDate(denial.deniedAt) ?? toDate(now);

  // Mismatches inside the window, counting this one.
  const windowStart = addDays(at, -defaults.mismatchWindowDays);
  const priorInWindow = (priorMismatchAt || [])
    .map(toDate)
    .filter((d) => d && d > windowStart && d <= at).length;
  const inWindow = priorInWindow + (incrementMismatch ? 1 : 0);

  const pauseBuilding = incrementMismatch
    && PAUSABLE.has(building.status)
    && inWindow >= defaults.mismatchPause;

  let refundOwedCents = 0;
  if (incrementMismatch && !building.appFeeWaived) {
    refundOwedCents = num(building.appFeeCents); // null stays null: unknown is never 0
  }

  const backupsToOffer = (backups || [])
    .filter((b) => b && b.result === "approved" && b.buildingId !== building.id)
    .slice(0, defaults.maxBackups);

  return {
    incrementMismatch,
    mismatchesInWindow: inWindow,
    pauseBuilding,
    refundOwedCents,
    backupsToOffer,
    rulesReviewTask: pauseBuilding,
    denialReason: reason
  };
}
