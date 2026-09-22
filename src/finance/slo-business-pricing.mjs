// $297 diagnostic: business add-on price.
//
// Owner-set 2026-09-22: on the $297 checkout the FIRST business is free and
// each extra business is $15. Integer cents, always (CLAUDE.md §12).
//
// This is a separate product from src/finance/soft-pull-pricing.mjs ($32 base
// + $10 per business, no free business). That file is not touched and neither
// price is derived from the other.
//
// SLO_MAX_BUSINESSES is a safety ceiling against abuse, not an advertised cap.
// It is the same 20 the staff approve form already uses.

import { fromCents } from "../commissions/money.mjs";
import { formatCents } from "../config/offers.mjs";
import { SLO_PRICE_CENTS } from "../slo/offer.mjs";
import { SOFT_PULL_MAX_BUSINESSES } from "./soft-pull-pricing.mjs";

export const SLO_FREE_BUSINESSES = 1;
export const SLO_EXTRA_BUSINESS_CENTS = 1500;
export const SLO_MAX_BUSINESSES = SOFT_PULL_MAX_BUSINESSES;

function assertCount(count, { min = 0 } = {}) {
  if (!Number.isInteger(count) || count < min || count > SLO_MAX_BUSINESSES) {
    throw new RangeError(
      `business count must be an integer ${min}–${SLO_MAX_BUSINESSES}, got ${count}`
    );
  }
}

/** Extra businesses beyond the free one. 0 and 1 are both 0. */
export function sloExtraBusinessCount(count) {
  assertCount(count);
  return Math.max(0, count - SLO_FREE_BUSINESSES);
}

/** What the extras cost, in cents. */
export function sloExtraBusinessCents(count) {
  return sloExtraBusinessCount(count) * SLO_EXTRA_BUSINESS_CENTS;
}

/** The whole $297 checkout for `count` businesses (1 included). */
export function sloCheckoutTotalCents(count = SLO_FREE_BUSINESSES) {
  assertCount(count, { min: SLO_FREE_BUSINESSES });
  return SLO_PRICE_CENTS + sloExtraBusinessCents(count);
}

/**
 * Extras owed that the checkout did not charge: businesses sent on the pull
 * form beyond the number paid for. Never negative. `paid` below 1 is read as 1,
 * because the base price always includes the free business.
 */
export function sloBusinessOwedCents({ submitted, paid }) {
  assertCount(submitted);
  const covered = Math.max(SLO_FREE_BUSINESSES, Number.isInteger(paid) ? paid : SLO_FREE_BUSINESSES);
  return Math.max(0, submitted - covered) * SLO_EXTRA_BUSINESS_CENTS;
}

/** What a page may show. Every figure is the server's, never typed in HTML. */
export function sloBusinessPricingPublic(count = SLO_FREE_BUSINESSES) {
  const extraCount = sloExtraBusinessCount(count);
  const extraCents = extraCount * SLO_EXTRA_BUSINESS_CENTS;
  return {
    count,
    freeCount: SLO_FREE_BUSINESSES,
    extraCount,
    eachCents: SLO_EXTRA_BUSINESS_CENTS,
    eachDisplay: formatCents(SLO_EXTRA_BUSINESS_CENTS),
    extraCents,
    extraAmount: fromCents(extraCents),
    extraDisplay: formatCents(extraCents),
    max: SLO_MAX_BUSINESSES
  };
}
