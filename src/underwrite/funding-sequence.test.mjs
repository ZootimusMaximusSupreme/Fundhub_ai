// Funding walk order — Chris law 2026-09-26 (corrected: personal before companies;
// no-business path must not stick on companies).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  FUNDING_SEQUENCE_STEPS,
  NAICS_WRITE_PATH_BLOCKER,
  companyHasName,
  companyNaics,
  personalIsPrime,
  personalFundingReady,
  companiesReady,
  lenderListReady,
  evaluateFundingSequence
} from "./funding-sequence.mjs";

describe("FUNDING_SEQUENCE_STEPS — Chris order is the law", () => {
  test("five steps in this exact order", () => {
    assert.deepEqual(
      FUNDING_SEQUENCE_STEPS.map((s) => s.id),
      [
        "prime_personal",
        "personal_funding",
        "companies",
        "lender_list",
        "apply_forever"
      ]
    );
    assert.deepEqual(
      FUNDING_SEQUENCE_STEPS.map((s) => s.position),
      [1, 2, 3, 4, 5]
    );
  });

  test("personal funding comes before companies", () => {
    const personal = FUNDING_SEQUENCE_STEPS.find((s) => s.id === "personal_funding");
    const companies = FUNDING_SEQUENCE_STEPS.find((s) => s.id === "companies");
    assert.ok(personal.position < companies.position);
  });

  test("name and NAICS live on companies, not after lenders", () => {
    const companies = FUNDING_SEQUENCE_STEPS.find((s) => s.id === "companies");
    assert.match(companies.title, /NAICS/i);
    assert.match(companies.summary, /no company skips/i);
    const lenders = FUNDING_SEQUENCE_STEPS.find((s) => s.id === "lender_list");
    assert.ok(lenders.position > companies.position);
  });
});

describe("company name and NAICS helpers", () => {
  test("name from column or entity_data", () => {
    assert.equal(companyHasName({ name: "Acme LLC" }), true);
    assert.equal(companyHasName({ name: "  ", entity_data: { name: "Acme" } }), true);
    assert.equal(companyHasName({ name: "", entity_data: {} }), false);
  });

  test("NAICS only from entity_data — never invented", () => {
    assert.equal(companyNaics({ name: "Acme", entity_data: { naics: "541511" } }), "541511");
    assert.equal(companyNaics({ name: "Acme", entity_data: {} }), null);
    assert.equal(companyNaics({ name: "Acme" }), null);
  });
});

describe("ready gates", () => {
  test("personal prime is UnderwriteIQ fundable", () => {
    assert.equal(personalIsPrime({ fundable: true }), true);
    assert.equal(personalIsPrime({ fundable: false }), false);
    assert.equal(personalIsPrime(null), false);
  });

  test("personal funding opens once personal is prime — no company required", () => {
    assert.equal(personalFundingReady({ fundable: true }).ready, true);
    assert.equal(personalFundingReady({ fundable: false }).ready, false);
    assert.ok(personalFundingReady({ fundable: false }).blocking.includes("personal_not_prime"));
  });

  test("no companies → companies step skipped (not blocked)", () => {
    const none = companiesReady([]);
    assert.equal(none.ready, true);
    assert.equal(none.skipped, true);
    assert.equal(none.onCompanyPath, false);
    assert.equal(none.naicsWritePathBlocker, null);
    assert.deepEqual(none.blocking, []);
  });

  test("on company path, companies need name and NAICS", () => {
    const bare = companiesReady([{ name: "Acme LLC", entity_data: {} }]);
    assert.equal(bare.ready, false);
    assert.equal(bare.onCompanyPath, true);
    assert.ok(bare.blocking.includes("company_naics_missing"));
    assert.equal(bare.naicsWritePathBlocker, NAICS_WRITE_PATH_BLOCKER);

    const full = companiesReady([
      { name: "Acme LLC", entity_data: { naics: "541511" } }
    ]);
    assert.equal(full.ready, true);
    assert.equal(full.naicsWritePathBlocker, null);
  });

  test("lender list waits on personal + companies-satisfied + geography", () => {
    const early = lenderListReady({
      personalPrime: true,
      personalFunding: { ready: true },
      companies: { ready: false },
      matchStates: { home: "AZ" }
    });
    assert.equal(early.ready, false);
    assert.ok(early.blocking.includes("companies_not_ready"));

    const noGeo = lenderListReady({
      personalPrime: true,
      personalFunding: { ready: true },
      companies: { ready: true, skipped: true },
      matchStates: {}
    });
    assert.equal(noGeo.ready, false);
    assert.ok(noGeo.blocking.includes("geography_unknown"));

    const noBizOk = lenderListReady({
      personalPrime: true,
      personalFunding: { ready: true },
      companies: { ready: true, skipped: true },
      matchStates: { home: "AZ" }
    });
    assert.equal(noBizOk.ready, true);

    const ok = lenderListReady({
      personalPrime: true,
      personalFunding: { ready: true },
      companies: { ready: true },
      matchStates: { home: "AZ", business: "FL", states: ["AZ", "FL"] }
    });
    assert.equal(ok.ready, true);
  });
});

describe("evaluateFundingSequence — walk order", () => {
  test("not fundable stays on prime_personal", () => {
    const r = evaluateFundingSequence({
      underwrite: { fundable: false },
      businesses: [{ name: "Acme", entity_data: { naics: "541511" } }],
      matchStates: { home: "TX" }
    });
    assert.equal(r.currentStepId, "prime_personal");
    assert.equal(r.allows.personalFunding, false);
    assert.equal(r.allows.companies, false);
    assert.equal(r.allows.lenderList, false);
    assert.equal(r.allows.applyForever, false);
  });

  test("no-business path: prime → personal funding → lender list (skip companies)", () => {
    const primedNoGeo = evaluateFundingSequence({
      underwrite: { fundable: true },
      businesses: [],
      matchStates: null
    });
    assert.equal(primedNoGeo.currentStepId, "lender_list");
    assert.equal(primedNoGeo.allows.personalFunding, true);
    assert.equal(primedNoGeo.allows.companies, true);
    assert.equal(primedNoGeo.allows.lenderList, true);
    assert.equal(primedNoGeo.allows.applyForever, false);
    const companiesStep = primedNoGeo.steps.find((s) => s.id === "companies");
    assert.equal(companiesStep.skipped, true);
    assert.equal(companiesStep.ready, true);
    assert.equal(primedNoGeo.blockers.naicsWritePath, null);

    const primedWithHome = evaluateFundingSequence({
      underwrite: { fundable: true },
      businesses: [],
      matchStates: { home: "TX" }
    });
    assert.equal(primedWithHome.currentStepId, "apply_forever");
    assert.equal(primedWithHome.allows.applyForever, true);
  });

  test("company path: name+NAICS required before lenders", () => {
    // Named company without NAICS — stuck on companies (not lenders)
    const namedNoNaics = evaluateFundingSequence({
      underwrite: { fundable: true },
      businesses: [{ name: "Acme LLC", entity_data: {} }],
      matchStates: { home: "TX" }
    });
    assert.equal(namedNoNaics.currentStepId, "companies");
    assert.equal(namedNoNaics.allows.lenderList, false);
    assert.ok(namedNoNaics.blockers.naicsWritePath);

    const companiesDone = evaluateFundingSequence({
      underwrite: { fundable: true },
      businesses: [{ name: "Acme LLC", entity_data: { naics: "541511" } }],
      matchStates: null
    });
    assert.equal(companiesDone.currentStepId, "lender_list");
    assert.equal(companiesDone.allows.lenderList, true);
    assert.equal(companiesDone.allows.applyForever, false);
  });

  test("after lender list is ready, current is apply_forever and never complete", () => {
    const r = evaluateFundingSequence({
      underwrite: { fundable: true },
      businesses: [{ name: "Acme LLC", entity_data: { naics: "541511" } }],
      matchStates: { home: "AZ", business: "AZ", states: ["AZ"] },
      fundingRoundCount: 3
    });
    assert.equal(r.currentStepId, "apply_forever");
    assert.equal(r.allows.applyForever, true);
    const apply = r.steps.find((s) => s.id === "apply_forever");
    assert.equal(apply.complete, false);
    assert.equal(apply.fundingRoundCount, 3);
  });

  test("no-business apply forever also never complete", () => {
    const r = evaluateFundingSequence({
      underwrite: { fundable: true },
      businesses: [],
      matchStates: { home: "CA" },
      fundingRoundCount: 1
    });
    assert.equal(r.currentStepId, "apply_forever");
    const apply = r.steps.find((s) => s.id === "apply_forever");
    assert.equal(apply.complete, false);
  });

  test("law string matches locked order", () => {
    const r = evaluateFundingSequence({});
    assert.match(r.law, /prime_personal → personal_funding → companies/);
    assert.match(r.law, /lender_list → apply_forever/);
    assert.ok(!r.law.includes("lender_list → companies"));
  });
});
