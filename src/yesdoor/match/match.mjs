// src/yesdoor/match/match.mjs — the matcher.
// Spec: docs/specs/yesdoor-mvp-build-spec.md §4. Pure: no database, no network,
// no clock (callers pass `now`).
//
//   matchBuilding   one renter against one building's rules -> approved | likely | no
//   riskTier        A | B | C | D from the credit file and verified income
//   lane            verified | second_chance
//   rankBackups     the top other "approved" buildings, in order
//   matchCandidates the glue: match every candidate building, then pick backups
//   buildingView    the only fields a building user may see (never credit fields)
//
// Field names follow the database columns (snake_case) so a row can be passed
// straight in:
//   screening  yd_screenings   credit_score, collections_count, eviction_count,
//                              eviction_last_at, criminal_flags, status
//   income     yd_income_checks status, monthly_income_cents
//   rules      yd_building_rules version, min_score, income_multiple, max_evictions,
//                              eviction_lookback_years, criminal_policy, confirmed_at

import { YD_DEFAULTS } from "../config.mjs";
import { evaluateCriminal, evaluateEvictions, evaluateFreshness, evaluateIncome, evaluateScore, evaluateSecondChance,
  evictionsInside, FAIL, PASS, rulesAreFresh, worstResult } from "./rules.mjs";
import { isoDate, num } from "../util.mjs";

export const MATCHABLE_BUILDING_STATUSES = Object.freeze(["signed", "live"]);

/** Only signed or live buildings are ever matched (owner-set: renters see contracted buildings only). */
export function buildingIsMatchable(status) {
  return MATCHABLE_BUILDING_STATUSES.includes(status);
}

/* ----------------------------------------------------------------- tier */

const incomeIsVerified = (income) =>
  Boolean(income) && income.status === "verified" && (num(income.monthly_income_cents) ?? 0) > 0;

/**
 * Risk tier from YD_DEFAULTS.tiers (spec §4):
 *   A  score >= 700, no evictions in 7 years, no criminal flags, verified income
 *   B  score >= 640, no evictions in 5 years
 *   C  score >= 580 with at most one eviction, OR exactly one eviction older
 *      than B's window whatever the score ("one older eviction")
 *   D  everything else, including a missing score or missing eviction count
 * "No evictions in N years" means none newer than N years.
 */
export function riskTier({ screening, income, now = new Date(), defaults = YD_DEFAULTS } = {}) {
  const score = num(screening?.credit_score);
  const count = num(screening?.eviction_count);
  if (score === null || count === null) return "D";

  const within = (years) => evictionsInside({
    count, lastAt: screening.eviction_last_at, lookbackYears: years, now
  });
  const { A, B, C } = defaults.tiers;
  const flags = screening.criminal_flags;
  const noFlags = Array.isArray(flags) && flags.length === 0;

  if (score >= A.minScore && within(A.evictionYears) === 0
    && (A.criminal === false ? noFlags : true) && incomeIsVerified(income)) return "A";
  if (score >= B.minScore && within(B.evictionYears) === 0) return "B";
  if (score >= C.minScore && count <= 1) return "C";
  if (count === 1 && within(B.evictionYears) === 0) return "C";
  return "D";
}

/** A or B is the Verified lane; C or D is Second Chance. Null stays null. */
export function lane(tier) {
  if (tier === "A" || tier === "B") return "verified";
  if (tier === "C" || tier === "D") return "second_chance";
  return null;
}

/* ---------------------------------------------------------- state rules */

/** Accepts { key: value } or yd_state_rules rows [{ key, value }]. */
function stateRuleMap(stateRules) {
  if (!stateRules) return {};
  if (Array.isArray(stateRules)) {
    return Object.fromEntries(stateRules.filter((r) => r && r.key).map((r) => [r.key, r.value]));
  }
  return stateRules;
}

/**
 * Notes the renter or building must be shown for this state. Read from the
 * yd_state_rules keys `background_check_notice_required` and
 * `screening_fee_cap_cents`. They never change the answer.
 */
function stateNotices(stateRules, screening) {
  const map = stateRuleMap(stateRules);
  const notices = [];
  const flags = screening?.criminal_flags;
  if (map.background_check_notice_required && Array.isArray(flags) && flags.length > 0) {
    notices.push({
      key: "background_check_notice_required",
      text: "This state requires a written notice before a background record can count against a renter."
    });
  }
  const cap = num(map.screening_fee_cap_cents);
  if (cap !== null) {
    notices.push({ key: "screening_fee_cap_cents", text: "This state caps the application fee.", capCents: cap });
  }
  return notices;
}

/* ---------------------------------------------------------------- match */

/**
 * One renter against one building.
 *
 *   no        any rule fails
 *   approved  every rule passes and the rules are fresh
 *   likely    everything else (a close call, an unknown, stale rules, or a Second
 *             Chance renter at a building whose rules say accepts_second_chance = false)
 *
 * maxRentCents = verified monthly income / income_multiple (3 when the building
 * states none); null while income is unverified (unknown is never 0).
 */
export function matchBuilding({
  screening, income = null, rules, listingRentCents = null, stateRules = null,
  now = new Date(), defaults = YD_DEFAULTS
} = {}) {
  const tier = riskTier({ screening, income, now, defaults });
  const base = { riskTier: tier, lane: lane(tier), notices: [] };

  if (!screening || (screening.status && screening.status !== "complete")) {
    return {
      ...base, result: "no", maxRentCents: null, rulesVersion: null, rulesConfirmedAt: null, rulesStale: null,
      reasons: [{ rule: "screening", result: FAIL, reason: "There is no finished credit and background screening yet." }]
    };
  }
  if (!rules) {
    return {
      ...base, result: "no", maxRentCents: null, rulesVersion: null, rulesConfirmedAt: null, rulesStale: null,
      reasons: [{ rule: "rules", result: FAIL, reason: "This building has no rules on file." }]
    };
  }

  const reasons = [
    evaluateScore({ score: screening.credit_score, minScore: rules.min_score, defaults }),
    evaluateIncome({ income, rentCents: listingRentCents, incomeMultiple: rules.income_multiple, defaults }),
    evaluateEvictions({
      count: screening.eviction_count, lastAt: screening.eviction_last_at,
      maxEvictions: rules.max_evictions, lookbackYears: rules.eviction_lookback_years, now
    }),
    evaluateCriminal({ flags: screening.criminal_flags, policy: rules.criminal_policy }),
    evaluateSecondChance({ lane: base.lane, acceptsSecondChance: rules.accepts_second_chance }),
    evaluateFreshness({ confirmedAt: rules.confirmed_at, now, defaults })
  ].filter(Boolean);

  const worst = worstResult(reasons.map((r) => r.result));
  const result = worst === FAIL ? "no" : reasons.every((r) => r.result === PASS) ? "approved" : "likely";

  const monthly = num(income?.monthly_income_cents);
  const stated = num(rules.income_multiple);
  const multiple = stated !== null && stated > 0 ? stated : defaults.defaultIncomeMultiple;
  const verified = incomeIsVerified(income);

  return {
    ...base,
    result,
    reasons,
    maxRentCents: verified && monthly !== null ? Math.floor(monthly / multiple) : null,
    rulesVersion: rules.version ?? null,
    rulesConfirmedAt: isoDate(rules.confirmed_at),
    rulesStale: !rulesAreFresh({ confirmedAt: rules.confirmed_at, now, defaults }),
    notices: stateNotices(stateRules, screening)
  };
}

/**
 * What a building user may see about a renter (spec §8): the answer, whether
 * income is verified, the risk tier and the max rent. No reasons (they quote
 * credit numbers), no score, no counts, no flags, nothing raw.
 */
export function buildingView(match, income = null) {
  return {
    result: match.result,
    incomeVerified: incomeIsVerified(income),
    riskTier: match.riskTier,
    maxRentCents: match.maxRentCents,
    rulesVersion: match.rulesVersion,
    rulesConfirmedAt: match.rulesConfirmedAt
  };
}

/* -------------------------------------------------------------- backups */

const cmpNullsLast = (a, b, dir) => {
  const an = num(a); const bn = num(b);
  if (an === null && bn === null) return 0;
  if (an === null) return 1;
  if (bn === null) return -1;
  return dir * (an - bn);
};

/**
 * Backups: the best OTHER approved buildings, in order.
 *
 * `matches` are objects like { buildingId, listingId?, result, maxRentCents, listingRentCents }.
 * Order:
 *   1. rent fit    the rent closest to the renter's max rent (the best unit they
 *                  can afford), whichever side of it
 *   2. payer score the building that pays Yesdoor most reliably (higher first;
 *                  `payerScore` is { [buildingId]: number })
 *   3. distance    nearest first (`distance` is { [buildingId]: miles })
 *   4. buildingId  so the order never depends on input order
 * One backup per building (its best listing). Missing numbers sort last.
 *
 * `excludeBuildingId` is the building the renter picked.
 */
export function rankBackups(matches, {
  payerScore = {}, distance = {}, excludeBuildingId = null,
  maxBackups = YD_DEFAULTS.maxBackups
} = {}) {
  const gap = (m) => {
    const max = num(m.maxRentCents); const rent = num(m.listingRentCents);
    return max === null || rent === null ? null : Math.abs(max - rent);
  };
  const ranked = (matches || [])
    .filter((m) => m && m.result === "approved" && m.buildingId !== excludeBuildingId)
    .sort((a, b) =>
      cmpNullsLast(gap(a), gap(b), 1)
      || cmpNullsLast(payerScore[a.buildingId], payerScore[b.buildingId], -1)
      || cmpNullsLast(distance[a.buildingId], distance[b.buildingId], 1)
      || String(a.buildingId).localeCompare(String(b.buildingId))
      || String(a.listingId ?? "").localeCompare(String(b.listingId ?? "")));

  const seen = new Set();
  const out = [];
  for (const m of ranked) {
    if (out.length >= maxBackups) break;
    if (seen.has(m.buildingId)) continue;
    seen.add(m.buildingId);
    out.push({ ...m, isBackup: true, backupRank: out.length + 1 });
  }
  return out;
}

/**
 * Match one renter against many candidate buildings, then pick backups.
 *
 * candidates: [{ buildingId, listingId?, status, rules, listingRentCents,
 *                stateRules?, payerScore?, distance? }]
 * Buildings that are not signed or live are skipped and listed in `skipped`.
 * `picked` (optional) is the building the renter chose; backups exclude it.
 * Returns { matches, backups, skipped }.
 */
export function matchCandidates({
  screening, income = null, candidates = [], picked = null,
  now = new Date(), defaults = YD_DEFAULTS
} = {}) {
  const matches = [];
  const skipped = [];
  for (const c of candidates) {
    if (!buildingIsMatchable(c.status)) {
      skipped.push({ buildingId: c.buildingId, reason: `building status is ${c.status}` });
      continue;
    }
    const m = matchBuilding({
      screening, income, rules: c.rules, listingRentCents: c.listingRentCents ?? null,
      stateRules: c.stateRules ?? null, now, defaults
    });
    matches.push({
      ...m, buildingId: c.buildingId, listingId: c.listingId ?? null,
      listingRentCents: c.listingRentCents ?? null, isBackup: false
    });
  }
  const payerScore = {}; const distance = {};
  for (const c of candidates) {
    if (c.payerScore !== undefined) payerScore[c.buildingId] = c.payerScore;
    if (c.distance !== undefined) distance[c.buildingId] = c.distance;
  }
  const backups = rankBackups(matches, {
    payerScore, distance, excludeBuildingId: picked, maxBackups: defaults.maxBackups
  });
  return { matches, backups, skipped };
}

