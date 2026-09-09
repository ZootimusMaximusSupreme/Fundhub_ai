// Meta = marketing ads. Read only.
// Does not create campaigns. Does not buy, pause, or scale ads.
// Special ad category is mandatory and fail-closed in src/adplatforms/meta.mjs
// via ad_platform_category_map.

import { MIN_N_RATE } from "./discoveries.mjs";

export function specialAdCategoryRule() {
  return {
    required: true,
    fail_closed: true,
    source: "ad_platform_category_map",
    note: "Category map must be set before any Meta write. The brain does not create campaigns."
  };
}

export function costPerBooked({ spendCents, bookedN } = {}) {
  const n = Number(bookedN);
  const spend = Number(spendCents);
  if (!Number.isFinite(n) || n < MIN_N_RATE) {
    return {
      status: "INSUFFICIENT",
      cost_cents: null,
      n: Number.isFinite(n) ? n : 0,
      note: `Need ${MIN_N_RATE} booked calls. Have ${Number.isFinite(n) ? n : 0}. Do not invent a cost.`
    };
  }
  if (spendCents == null || spendCents === "") {
    return {
      status: "INSUFFICIENT",
      cost_cents: null,
      n,
      note: "Ad spend is missing. Do not invent a cost."
    };
  }
  if (!Number.isFinite(spend) || spend < 0) {
    return {
      status: "INSUFFICIENT",
      cost_cents: null,
      n,
      note: "Ad spend is missing. Do not invent a cost."
    };
  }
  return {
    status: "MEASURED",
    cost_cents: Math.round(spend / n),
    n,
    note: "Spend divided by booked calls. Read only."
  };
}

/* watchRate — THE ONE PLACE a video drop-off rate is worked out.
 *
 * Two rates are read by everybody who buys ads, and both are this same division:
 *
 *   hook rate = kept watching past the opening ÷ impressions
 *                                              did the opening stop them
 *   hold rate = p75 views ÷ kept watching past the opening
 *                                              did the middle keep them
 *
 * ⚠️ WHICH META NUMBERS THESE ARE MADE FROM, AND WHAT THEY ARE NOT.
 * "Kept watching past the opening" is ad_metrics_daily.video_continuous_2s_watched,
 * filled from Meta's video_continuous_2_sec_watched_actions — people who watched
 * two continuous seconds. META PUBLISHES NO 3-SECOND FIELD, in any spelling
 * (checked 2026-09-09 against Meta's own SDK field list; see 378's header). So
 * the hook rate computed here IS NOT the number Ads Manager shows beside the
 * words "hook rate", and it must never be labelled as if it were. Same words,
 * different arithmetic. A screen that prints this should say what it is: how
 * many people kept watching past the opening, out of everyone who saw the ad.
 *
 * Meta also gives us video_plays — how many plays started at all. It is stored
 * (378) and is the right denominator for a different question, "of the people
 * who started it, how many stayed". This function does not choose a denominator;
 * the caller passes one. api/read/ad-spine.mjs passes impressions.
 *
 * They are NOT two functions and NOT two columns. 378_ad_video_metrics.sql's
 * header says why: a rate defined in two places is how two different answers to
 * the same question turn up on two different screens.
 *
 * THE RULES, IN THE ORDER THEY ARE CHECKED:
 *
 *   1. EITHER SIDE UNKNOWN → null. A photo ad has no video views at all —
 *      there is no video — so it has no hook rate, and that is a fact and not a
 *      zero (378's whole header, and CLAUDE.md §12). A rate built out of a NULL
 *      is a NULL.
 *   2. DENOMINATOR ZERO → null. Nothing to divide by. Not 0, not "0%".
 *   3. DENOMINATOR UNDER MIN_N_RATE → null, and say how far short it is. A hook
 *      rate off 4 impressions is noise dressed as a number. This is the SAME
 *      threshold costPerBooked refuses under, imported from the same place
 *      (src/ops/discoveries.mjs) — there is no second rule about small samples
 *      anywhere in this system.
 *
 * The status words are costPerBooked's, deliberately: MEASURED or INSUFFICIENT,
 * with the reason in `note`. A screen that can already draw one of these can
 * draw the other without learning a second vocabulary.
 *
 * `rate` is a plain fraction (0.32 means 32%), rounded to four decimal places so
 * a screen does not print 0.30000000000000004. Nothing here formats a percent —
 * that is the screen's decision, the same way cents are left as cents.
 *
 * IT MAY COME BACK ABOVE 1, AND THAT IS NOT CORRUPTION. Meta estimates,
 * de-duplicates and restates these counts after the fact, so on a given day p75
 * can land above the past-the-opening count. Clamping it would hide a real Meta
 * restatement behind a number that looks fine.
 */
export function watchRate({ numerator, denominator } = {}) {
  const unknown = (note) => ({ status: "INSUFFICIENT", rate: null, n: null, note });

  if (numerator == null || numerator === "" || denominator == null || denominator === "") {
    return unknown("Meta did not report this number. A photo ad has no video views at all. Do not invent a rate.");
  }

  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || top < 0 || bottom < 0) {
    return unknown("Meta did not report this number. A photo ad has no video views at all. Do not invent a rate.");
  }
  if (bottom === 0) {
    return { status: "INSUFFICIENT", rate: null, n: 0, note: "Nothing to divide by. Do not invent a rate." };
  }
  if (bottom < MIN_N_RATE) {
    return {
      status: "INSUFFICIENT",
      rate: null,
      n: bottom,
      note: `Need ${MIN_N_RATE}. Have ${bottom}. Too few to be a rate. Do not invent a rate.`
    };
  }

  return {
    status: "MEASURED",
    rate: Math.round((top / bottom) * 10000) / 10000,
    n: bottom,
    note: "Counted by Meta, divided here. Read only."
  };
}

export function marketingSnapshot({ ads = {}, bookedN = null } = {}) {
  return {
    spend_cents: ads.spend_cents ?? null,
    spend_status: ads.status || "missing",
    cost_per_booked: costPerBooked({ spendCents: ads.spend_cents, bookedN }),
    special_ad_category: specialAdCategoryRule(),
    note: "Live Marketing API write is unverified. The brain does not buy, pause, or scale ads. Category map must be set before any spend write."
  };
}

export default { specialAdCategoryRule, costPerBooked, watchRate, marketingSnapshot };
