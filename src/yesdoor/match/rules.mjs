// src/yesdoor/match/rules.mjs — one evaluator per building rule.
// Spec: docs/specs/yesdoor-mvp-build-spec.md §4. Pure: no database, no network, no clock.
//
// Every evaluator returns { rule, result, reason }:
//   result  pass | close | fail | unknown
//   reason  one plain-English sentence for the renter and for staff.
//
// Reasons contain real numbers (a score, a rent). They are for the renter and
// for staff. A building user never gets them (spec §8: buildings see no credit
// fields), so building responses must be built with buildingView() in match.mjs.
//
// A rule that cannot be checked returns `unknown`, never `pass`. `unknown`
// keeps the final answer at "likely": the renter is never told "approved" on a
// guess.

import { YD_DEFAULTS } from "../config.mjs";
import { ceilDiv, dollars, isoDate, num, toDate, wholeDaysBetween, yearsBack } from "../util.mjs";

export const PASS = "pass";
export const CLOSE = "close";
export const FAIL = "fail";
export const UNKNOWN = "unknown";

const SEVERITY = { [PASS]: 0, [CLOSE]: 1, [UNKNOWN]: 2, [FAIL]: 3 };

/** The most serious of several results: fail > unknown > close > pass. */
export function worstResult(results) {
  let worst = PASS;
  for (const r of results) if (SEVERITY[r] > SEVERITY[worst]) worst = r;
  return worst;
}

const entry = (rule, result, reason) => ({ rule, result, reason });
const plural = (n, one, many) => (n === 1 ? one : many);
const words = (category) => String(category).replace(/_/g, " ");

/* ---------------------------------------------------------------- score */

/**
 * pass  score >= min_score + margins.score (20)
 * close score >= min_score
 * fail  below min_score
 */
export function evaluateScore({ score, minScore, defaults = YD_DEFAULTS } = {}) {
  const have = num(score);
  const min = num(minScore);
  if (min === null) return entry("score", UNKNOWN, "This building has not told us its minimum credit score.");
  if (have === null) return entry("score", UNKNOWN, "There is no credit score on file yet.");
  const room = defaults.margins.score;
  if (have >= min + room) {
    return entry("score", PASS, `Credit score ${have} clears the building's minimum of ${min} with room to spare.`);
  }
  if (have >= min) {
    return entry("score", CLOSE,
      `Credit score ${have} meets the building's minimum of ${min}, but not with room to spare (${min + room} or more is a sure thing).`);
  }
  return entry("score", FAIL, `Credit score ${have} is below the building's minimum of ${min}.`);
}

/* --------------------------------------------------------------- income */

/**
 * Income the renter needs for a rent, in cents, as integers (no float drift at
 * the boundary). `margin` 0.10 means 10% extra room.
 */
export function requiredIncomeCents({ rentCents, multiple, margin = 0 }) {
  const milli = Math.round(multiple * 1000);
  const bp = Math.round(margin * 10000);
  return ceilDiv(rentCents * milli * (10000 + bp), 10_000_000);
}

/**
 * pass    verified monthly income >= multiple x rent x (1 + margins.income)
 * close   >= multiple x rent
 * fail    below
 * unknown income not verified (or no rent to check against)
 *
 * `income` is a yd_income_checks row: { status, monthly_income_cents }.
 * `incomeMultiple` null falls back to defaults.defaultIncomeMultiple (3).
 */
export function evaluateIncome({ income, rentCents, incomeMultiple, defaults = YD_DEFAULTS } = {}) {
  const monthly = num(income?.monthly_income_cents);
  if (!income || income.status !== "verified" || monthly === null) {
    return entry("income", UNKNOWN, "Income has not been verified yet.");
  }
  const rent = num(rentCents);
  if (rent === null) return entry("income", UNKNOWN, "No rent to check income against yet.");

  const stated = num(incomeMultiple);
  const multiple = stated !== null && stated > 0 ? stated : defaults.defaultIncomeMultiple;
  const basis = stated !== null && stated > 0
    ? `${multiple} times the rent`
    : `${multiple} times the rent (the building did not state a multiple, so we use ${multiple})`;
  const need = requiredIncomeCents({ rentCents: rent, multiple });
  const comfortable = requiredIncomeCents({ rentCents: rent, multiple, margin: defaults.margins.income });

  if (monthly >= comfortable) {
    return entry("income", PASS,
      `Verified income of ${dollars(monthly)} a month clears ${basis} (${dollars(need)}) with room to spare.`);
  }
  if (monthly >= need) {
    return entry("income", CLOSE,
      `Verified income of ${dollars(monthly)} a month meets ${basis} (${dollars(need)}), but not with room to spare.`);
  }
  return entry("income", FAIL,
    `Verified income of ${dollars(monthly)} a month is below ${basis} (${dollars(need)}) for this rent.`);
}

/* ------------------------------------------------------------ evictions */

/**
 * How many of the on-file evictions fall inside the lookback. We store a count
 * and the date of the MOST RECENT one, so when that one is older than the
 * window every earlier one is too. An eviction with no date counts as inside
 * (the safe side). A window of null means "any age".
 * Returns null when the count itself is unknown.
 */
export function evictionsInside({ count, lastAt, lookbackYears, now }) {
  const n = num(count);
  if (n === null) return null;
  if (n === 0) return 0;
  const years = num(lookbackYears);
  if (years === null) return n;
  const last = toDate(lastAt);
  if (!last) return n;
  return last > yearsBack(now, years) ? n : 0;
}

/**
 * fail if evictions inside the lookback are above max_evictions; pass otherwise.
 * "Inside" means newer than the lookback: exactly N years old is outside.
 */
export function evaluateEvictions({ count, lastAt, maxEvictions, lookbackYears, now } = {}) {
  const total = num(count);
  if (total === null) return entry("evictions", UNKNOWN, "Eviction history was not returned.");
  const max = num(maxEvictions);
  if (max === null) return entry("evictions", UNKNOWN, "This building has not told us how many evictions it allows.");
  if (total === 0) return entry("evictions", PASS, "No evictions on file.");

  const inside = evictionsInside({ count: total, lastAt, lookbackYears, now });
  const years = num(lookbackYears);
  const window = years === null ? "ever" : `in the last ${years} ${plural(years, "year", "years")}`;
  if (inside === 0) {
    return entry("evictions", PASS,
      `${total} ${plural(total, "eviction", "evictions")} on file, but none ${window}, which is the only window this building looks at.`);
  }
  const dateNote = toDate(lastAt) ? "" : " (the date is missing, so we count it)";
  if (inside > max) {
    return entry("evictions", FAIL,
      `${inside} ${plural(inside, "eviction", "evictions")} ${window}${dateNote}; this building allows ${max}.`);
  }
  return entry("evictions", PASS,
    `${inside} ${plural(inside, "eviction", "evictions")} ${window}${dateNote}; this building allows ${max}.`);
}

/* ------------------------------------------------------------- criminal */

/**
 * The categories a criminal flag (and so a building's criminal_policy) can use.
 * The CRS sandbox, the building portal's Rules form and the seeded sample rules
 * all speak these, and nothing else. A policy key outside this list is never
 * matched, so a test pins every stored policy to it (I2: the seed once wrote
 * felony / misdemeanor / violent and no seeded policy ever applied).
 */
export const CRIMINAL_CATEGORIES = Object.freeze(["felony_violent", "felony_property", "misdemeanor_nonviolent"]);

/**
 * criminal_policy is { category: max_years_ago | "never" | "case_by_case" }.
 *   number         a record NEWER than that many years fails; older passes
 *   "never"        any record in the category fails, whatever its age
 *   "case_by_case" close (the building decides when it sees the record)
 * A category the building has not mentioned, a flag with no age under a numeric
 * policy, or an unreadable policy value is `unknown`.
 * No flags at all passes; flags that were not returned are unknown.
 */
export function evaluateCriminal({ flags, policy } = {}) {
  if (flags === null || flags === undefined) {
    return entry("criminal", UNKNOWN, "Background check result was not returned.");
  }
  if (!Array.isArray(flags) || flags.length === 0) {
    return entry("criminal", PASS, "No criminal records on file.");
  }
  const parts = flags.map((flag) => {
    const category = flag?.category;
    const label = words(category ?? "unknown category");
    const known = policy && typeof policy === "object" && typeof category === "string"
      && Object.hasOwn(policy, category);
    const value = known ? policy[category] : undefined;
    if (value === undefined || value === null) {
      return { result: UNKNOWN, text: `This building has not told us how it treats ${label} records.` };
    }
    if (value === "never") {
      return { result: FAIL, text: `This building does not accept ${label} records.` };
    }
    if (value === "case_by_case") {
      return { result: CLOSE, text: `This building reviews ${label} records one by one.` };
    }
    const limit = num(value);
    if (limit === null) {
      return { result: UNKNOWN, text: `We could not read this building's rule for ${label} records.` };
    }
    const age = num(flag?.years_ago);
    if (age === null) {
      return { result: UNKNOWN, text: `A ${label} record has no date, and this building looks back ${limit} years.` };
    }
    return age < limit
      ? { result: FAIL, text: `A ${label} record from ${age} ${plural(age, "year", "years")} ago is inside this building's ${limit}-year window.` }
      : { result: PASS, text: `A ${label} record from ${age} ${plural(age, "year", "years")} ago is older than this building's ${limit}-year window.` };
  });
  const worst = worstResult(parts.map((p) => p.result));
  const text = parts.filter((p) => p.result === worst).map((p) => p.text).join(" ");
  return entry("criminal", worst, text);
}

/* --------------------------------------------------------- second chance */

/**
 * A building whose rules say accepts_second_chance = false has told us it does
 * not set out to take Second Chance renters. That is not a "no": the renter's
 * numbers may still pass every rule, and the building decides when it sees the
 * file. So the answer is capped at "likely" (this rule is `close`), never
 * `fail`. Only an explicit `false` counts; a missing value is not a refusal.
 * Returns null when the rule does not apply (the Verified lane, or a building
 * that takes Second Chance renters), so the reasons list stays as it was.
 */
export function evaluateSecondChance({ lane, acceptsSecondChance } = {}) {
  if (lane !== "second_chance" || acceptsSecondChance !== false) return null;
  return entry("second_chance", CLOSE,
    "This building does not say it takes Second Chance renters. Your numbers may still pass, so the best answer is likely and the building decides.");
}

/* ------------------------------------------------------------- freshness */

/** True when the rules were confirmed no more than rulesStaleDays ago. */
export function rulesAreFresh({ confirmedAt, now, defaults = YD_DEFAULTS }) {
  const confirmed = toDate(confirmedAt);
  if (!confirmed) return false;
  return wholeDaysBetween(confirmed, now) <= defaults.rulesStaleDays;
}

/**
 * Stale (or never confirmed) rules cap the answer at "likely", so this rule
 * returns `close` (stale) or `unknown` (never confirmed), never `fail`.
 */
export function evaluateFreshness({ confirmedAt, now, defaults = YD_DEFAULTS } = {}) {
  const confirmed = toDate(confirmedAt);
  if (!confirmed) {
    return entry("rules_freshness", UNKNOWN, "This building has never confirmed its rules, so the best answer is likely.");
  }
  const days = wholeDaysBetween(confirmed, now);
  const on = isoDate(confirmed);
  if (days > defaults.rulesStaleDays) {
    return entry("rules_freshness", CLOSE,
      `This building last confirmed its rules on ${on}, more than ${defaults.rulesStaleDays} days ago, so the best answer is likely.`);
  }
  return entry("rules_freshness", PASS, `This building confirmed its rules on ${on}.`);
}
