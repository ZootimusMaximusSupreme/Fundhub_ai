// UnderwriteIQ funding walk — owner law 2026-09-26 (corrected same day).
//
// Chris's locked order:
//   1. Prime the personal credit file (existing fundable bar).
//   2. Personal funding — for people with NO business, and as the extra stack
//      when someone has a business. Personal comes before business.
//   3. Companies — only when they have companies or open aged ones. Name and
//      NAICS when a company is on the path. No company → do not stick here;
//      go personal funding → lender list → apply.
//   4. Lender list for geographic location (home and/or business state), only
//      after personal is primed, and after companies IF on the company path.
//   5. Apply forever — rounds never "complete." A round can be personal only.
//      A business round can include personal funding.
//
// PURE. No I/O. Reuses fundable, businesses.name, entity_data, and match states.
// Does not invent dollars or "unlimited funding."

/** The five steps, in walk order. Position is the law. */
export const FUNDING_SEQUENCE_STEPS = Object.freeze([
  Object.freeze({
    id: "prime_personal",
    position: 1,
    title: "Prime the personal credit file",
    summary: "Nothing else is worth doing until the personal file is prime."
  }),
  Object.freeze({
    id: "personal_funding",
    position: 2,
    title: "Personal funding",
    summary:
      "For people with no business, and as the extra stack when someone has a " +
      "business and wants more money. Personal comes before business."
  }),
  Object.freeze({
    id: "companies",
    position: 3,
    title: "Companies with a good name and NAICS",
    summary:
      "Only when they have companies or open aged ones. Name and NAICS make " +
      "the company usable. A person with no company skips this step."
  }),
  Object.freeze({
    id: "lender_list",
    position: 4,
    title: "Optimize the lender list for location",
    summary:
      "Only after the personal file is prime, and after companies are satisfied " +
      "if they are on the company path. No-business path needs home state only."
  }),
  Object.freeze({
    id: "apply_forever",
    position: 5,
    title: "Apply forever",
    summary:
      "Keep applying round after round. A round can be personal only. " +
      "A business round can include personal funding. This step never completes."
  })
]);

/**
 * NAICS storage gap (no new table needed — entity_data jsonb can hold it).
 * Nothing in the UnderwriteIQ / soft-pull / SLO company write path saves NAICS
 * today. Blocks the company path only — never a no-business personal path.
 * See docs/underwriteiq/perfect-file-syntax.md.
 */
export const NAICS_WRITE_PATH_BLOCKER =
  "Client businesses can store NAICS on entity_data.naics (jsonb) — no new table. " +
  "No UnderwriteIQ or company form write path sets it today. " +
  "Missing NAICS blocks the company path only, not a no-business personal-funding file.";

/**
 * A usable company name: non-blank text on businesses.name (or entity_data.name).
 * Does not judge "good" beyond present — no invented naming rules.
 */
export function companyHasName(biz) {
  if (!biz || typeof biz !== "object") return false;
  const fromCol = String(biz.name ?? "").trim();
  if (fromCol) return true;
  const entity = biz.entity_data && typeof biz.entity_data === "object" ? biz.entity_data : {};
  return Boolean(String(entity.name ?? "").trim());
}

/**
 * NAICS if stored on this row. entity_data.naics or entity_data.naics_code only.
 * Returns null when absent — never invents a code.
 */
export function companyNaics(biz) {
  if (!biz || typeof biz !== "object") return null;
  const entity = biz.entity_data && typeof biz.entity_data === "object" ? biz.entity_data : {};
  const raw = entity.naics ?? entity.naics_code ?? null;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

/** UnderwriteIQ fundable flag is the prime gate we already measure. */
export function personalIsPrime(underwrite) {
  return underwrite?.fundable === true;
}

/**
 * Personal funding step: open once the personal file is prime.
 * No company or NAICS required.
 */
export function personalFundingReady(underwrite) {
  const ready = personalIsPrime(underwrite);
  return {
    ready,
    blocking: ready ? [] : ["personal_not_prime"]
  };
}

/**
 * Companies step.
 * - No saved companies → not on the company path. Ready (skipped). Do not block.
 * - One or more companies → need ≥1 with a name AND a NAICS. Missing NAICS
 *   blocks this path only.
 */
export function companiesReady(businesses = []) {
  const rows = Array.isArray(businesses) ? businesses : [];
  if (rows.length === 0) {
    return {
      ready: true,
      onCompanyPath: false,
      skipped: true,
      companyCount: 0,
      namedCount: 0,
      withNaicsCount: 0,
      blocking: [],
      naicsWritePathBlocker: null
    };
  }
  const named = rows.filter(companyHasName);
  const withNaics = rows.filter((b) => companyNaics(b));
  const blocking = [];
  if (named.length === 0) blocking.push("company_name_missing");
  if (withNaics.length === 0) blocking.push("company_naics_missing");
  return {
    ready: named.length > 0 && withNaics.length > 0,
    onCompanyPath: true,
    skipped: false,
    companyCount: rows.length,
    namedCount: named.length,
    withNaicsCount: withNaics.length,
    blocking,
    naicsWritePathBlocker: withNaics.length === 0 ? NAICS_WRITE_PATH_BLOCKER : null
  };
}

/**
 * Lender list step: personal prime, companies satisfied (or skipped), and at
 * least one geographic state so match can optimize by location.
 */
export function lenderListReady({ personalPrime, personalFunding, companies, matchStates } = {}) {
  if (!personalPrime) {
    return { ready: false, blocking: ["personal_not_prime"] };
  }
  if (personalFunding && !personalFunding.ready) {
    return { ready: false, blocking: ["personal_funding_not_ready"] };
  }
  if (!companies?.ready) {
    return { ready: false, blocking: ["companies_not_ready"] };
  }
  const home = matchStates?.home ? String(matchStates.home).trim() : "";
  const business = matchStates?.business ? String(matchStates.business).trim() : "";
  const states = Array.isArray(matchStates?.states)
    ? matchStates.states.map((s) => String(s || "").trim()).filter(Boolean)
    : [];
  const hasGeo = Boolean(home || business || states.length);
  if (!hasGeo) {
    return { ready: false, blocking: ["geography_unknown"] };
  }
  return { ready: true, blocking: [] };
}

/**
 * Walk the law. Returns which step is current and whether later steps are allowed.
 *
 * apply_forever never completes — once prior steps are ready, current stays
 * apply_forever.
 *
 * @param {object} [input]
 * @param {object} [input.underwrite]  computeUnderwrite result (fundable)
 * @param {object[]} [input.businesses]  businesses rows (name, entity_data)
 * @param {{home?: string|null, business?: string|null, states?: string[]}} [input.matchStates]
 * @param {number|null} [input.fundingRoundCount]  optional; informational only
 */
export function evaluateFundingSequence({
  underwrite = null,
  businesses = [],
  matchStates = null,
  fundingRoundCount = null
} = {}) {
  const personalPrime = personalIsPrime(underwrite);
  const personalFunding = personalFundingReady(underwrite);
  const companies = companiesReady(businesses);
  const lenders = lenderListReady({
    personalPrime,
    personalFunding,
    companies,
    matchStates
  });

  const steps = FUNDING_SEQUENCE_STEPS.map((step) => {
    if (step.id === "prime_personal") {
      return {
        ...step,
        ready: personalPrime,
        blocking: personalPrime ? [] : ["not_fundable"],
        allowsNext: personalPrime
      };
    }
    if (step.id === "personal_funding") {
      return {
        ...step,
        ready: personalFunding.ready,
        blocking: personalFunding.blocking,
        allowsNext: personalFunding.ready
      };
    }
    if (step.id === "companies") {
      return {
        ...step,
        ready: companies.ready,
        blocking: companies.blocking,
        allowsNext: personalFunding.ready && companies.ready,
        onCompanyPath: companies.onCompanyPath,
        skipped: companies.skipped,
        companyCount: companies.companyCount,
        namedCount: companies.namedCount,
        withNaicsCount: companies.withNaicsCount,
        naicsWritePathBlocker: companies.naicsWritePathBlocker
      };
    }
    if (step.id === "lender_list") {
      return {
        ...step,
        ready: lenders.ready,
        blocking: lenders.blocking,
        allowsNext: lenders.ready
      };
    }
    // apply_forever — never "done"
    return {
      ...step,
      ready: lenders.ready,
      complete: false,
      blocking: lenders.ready ? [] : ["prior_steps_incomplete"],
      allowsNext: false,
      fundingRoundCount:
        fundingRoundCount == null || !Number.isFinite(Number(fundingRoundCount))
          ? null
          : Number(fundingRoundCount)
    };
  });

  let current = steps[0];
  for (const step of steps) {
    if (!step.ready || step.id === "apply_forever") {
      current = step;
      break;
    }
  }

  return {
    law:
      "prime_personal → personal_funding → companies (if any; name+NAICS) → " +
      "lender_list → apply_forever",
    order: FUNDING_SEQUENCE_STEPS.map((s) => s.id),
    currentStepId: current.id,
    currentStep: current,
    steps,
    allows: {
      personalFunding: personalPrime,
      companies: personalFunding.ready,
      lenderList: personalFunding.ready && companies.ready,
      applyForever: lenders.ready
    },
    blockers: {
      naicsWritePath: companies.naicsWritePathBlocker
    }
  };
}

export default evaluateFundingSequence;
