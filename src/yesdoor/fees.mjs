// src/yesdoor/fees.mjs — the money arithmetic of a placement. Pure: no database,
// no clock. Integer cents everywhere (CLAUDE.md §12); the rounding is the same
// half-away-from-zero rule the Fundhub commission ledger uses, from the one
// allowlisted money module.
//
//   placementFeeCents   what the building owes for one lease
//   brokerShareCents    what the first-touch broker earns on that fee
//   feeSafeAt           the moment a paid fee can no longer be refunded
//   invoiceDueAt        when the building's invoice falls due
//   refundWindowOpen    may the building still report "the renter left"?

import { percentOf, roundHalfUp } from "../commissions/money.mjs";
import { YD_DEFAULTS } from "./config.mjs";
import { addDays, toDate } from "./util.mjs";

const wholeCents = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * The placement fee for a lease.
 *   percent_first_month  fee_percent of one month's rent (100 = a full month)
 *   flat                 fee_flat_cents
 * Returns null when the amount cannot be known (missing terms or rent): unknown
 * is never 0. A computed 0 (a 0% deal) is 0, and the caller earns no fee row.
 */
export function placementFeeCents({ feeKind, feePercent = null, feeFlatCents = null, rentCents = null } = {}) {
  if (feeKind === "flat") {
    const flat = wholeCents(feeFlatCents);
    return Number.isInteger(flat) && flat >= 0 ? flat : null;
  }
  if (feeKind === "percent_first_month") {
    const rent = wholeCents(rentCents);
    const pct = feePercent === null || feePercent === undefined || feePercent === "" ? null : Number(feePercent);
    if (!Number.isInteger(rent) || rent <= 0 || pct === null || !Number.isFinite(pct) || pct < 0) return null;
    return percentOf(rent, pct);
  }
  return null;
}

/**
 * The broker's share of a placement fee. `splitPercent` is in percent units
 * (25 = 25%). Only a licensed "split" partner shares; a "software" partner pays
 * for the tool and earns nothing here. Returns 0 when there is no share.
 */
export function brokerShareCents({ feeCents, splitPercent, plan = "split" } = {}) {
  if (plan !== "split") return 0;
  const fee = wholeCents(feeCents);
  const pct = Number(splitPercent);
  if (!Number.isInteger(fee) || fee <= 0 || !Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(fee, percentOf(fee, Math.min(pct, 100)));
}

/** paid + refund_days. The default is the 60-day window of YD_DEFAULTS. */
export function feeSafeAt({ paidAt, refundDays = YD_DEFAULTS.refundDays } = {}) {
  const paid = toDate(paidAt);
  return paid ? addDays(paid, refundDays) : null;
}

/** May the building still report that the renter left? Inside refund_days of the payment. */
export function refundWindowOpen({ paidAt, refundDays = YD_DEFAULTS.refundDays, now = new Date() } = {}) {
  const safe = feeSafeAt({ paidAt, refundDays });
  return safe ? toDate(now) < safe : false;
}

/** issued + the building's payment terms (days). */
export function invoiceDueAt({ issuedAt, termsDays = 30 } = {}) {
  const issued = toDate(issuedAt);
  return issued ? addDays(issued, termsDays) : null;
}

/** A refund reverses the original in full: the same cents, the other sign. */
export function reversalCents(feeCents) {
  const fee = wholeCents(feeCents);
  if (!Number.isInteger(fee) || fee <= 0) throw new Error("only a positive fee can be reversed");
  return roundHalfUp(-fee);
}
