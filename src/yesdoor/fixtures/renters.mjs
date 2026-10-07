// src/yesdoor/fixtures/renters.mjs — SAMPLE renters for the sandbox providers.
//
// EVERY ONE OF THESE IS A MADE-UP SAMPLE. None is a real person. The email
// domain `sample.yesdoor.test` cannot receive mail, and every row carries
// `isSample: true`.
//
// Each renter is ONE consistent person (.claude/rules/sample-clients-consistent.md):
// the credit score, collections, evictions (with dates), criminal flags and the
// verified monthly income all agree with each other and with the tier the
// engine prints for that file. Nothing here is hand-edited to look better: the
// tier is computed by riskTier() in match/match.mjs and a test fails if the
// computed tier ever differs from `expectedTier`.
//
// The tests pin the clock at FIXTURE_NOW so "old eviction" stays old.

export const SAMPLE_NOTICE = "Sample renter. Made up for the sandbox. Not a real person.";
export const FIXTURE_NOW = "2026-10-07T00:00:00.000Z";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const cents = (dollars) => dollars * 100;

export const SAMPLE_RENTERS = deepFreeze([
  {
    key: "prime-1",
    isSample: true,
    story: "Software QA lead, steady salary, never missed a payment. A clean file.",
    expectedTier: "A",
    expectedLane: "verified",
    firstName: "Priya", lastName: "Raman-Sample",
    email: "priya.raman@sample.yesdoor.test",
    address: { line1: "4410 N Example Way", city: "Scottsdale", state: "AZ", zip: "85251" },
    credit: { credit_score: 771, collections_count: 0, eviction_count: 0, eviction_last_at: null, criminal_flags: [] },
    income: {
      monthly_income_cents: cents(7200),
      sources: [{ kind: "payroll", label: "Salary, software company", monthly_cents: cents(7200) }]
    }
  },
  {
    key: "prime-2",
    isSample: true,
    story: "Nurse with a small freelance side income. One closed card from years ago, nothing negative.",
    expectedTier: "A",
    expectedLane: "verified",
    firstName: "Daniel", lastName: "Okoro-Sample",
    email: "daniel.okoro@sample.yesdoor.test",
    address: { line1: "1822 W Sample Dr", city: "Tempe", state: "AZ", zip: "85281" },
    credit: { credit_score: 728, collections_count: 0, eviction_count: 0, eviction_last_at: null, criminal_flags: [] },
    income: {
      monthly_income_cents: cents(5900),
      sources: [
        { kind: "payroll", label: "Salary, hospital", monthly_cents: cents(5100) },
        { kind: "freelance", label: "Freelance deposits", monthly_cents: cents(800) }
      ]
    }
  },
  {
    key: "tier-b",
    isSample: true,
    story: "Warehouse supervisor. One small utility collection and a nine-year-old misdemeanor. No evictions.",
    expectedTier: "B",
    expectedLane: "verified",
    firstName: "Marcus", lastName: "Bell-Sample",
    email: "marcus.bell@sample.yesdoor.test",
    address: { line1: "960 S Example St", city: "Mesa", state: "AZ", zip: "85210" },
    credit: {
      credit_score: 668, collections_count: 1, eviction_count: 0, eviction_last_at: null,
      criminal_flags: [{ category: "misdemeanor_nonviolent", years_ago: 9 }]
    },
    income: {
      monthly_income_cents: cents(4850),
      sources: [{ kind: "payroll", label: "Salary, distribution center", monthly_cents: cents(4850) }]
    }
  },
  {
    key: "tier-c-old-eviction",
    isSample: true,
    story: "Retail manager. One eviction in 2019 after a layoff, two small collections since. Steady job for four years.",
    expectedTier: "C",
    expectedLane: "second_chance",
    firstName: "Tanya", lastName: "Whitfield-Sample",
    email: "tanya.whitfield@sample.yesdoor.test",
    address: { line1: "7305 E Sample Ave", city: "Chandler", state: "AZ", zip: "85225" },
    credit: { credit_score: 612, collections_count: 2, eviction_count: 1, eviction_last_at: "2019-08-14", criminal_flags: [] },
    income: {
      monthly_income_cents: cents(3700),
      sources: [{ kind: "payroll", label: "Salary, retail chain", monthly_cents: cents(3700) }]
    }
  },
  {
    key: "tier-c-recent-eviction",
    isSample: true,
    story: "Dental office assistant. One eviction in late 2023 when a roommate left, one medical collection. Pays everything on time now.",
    expectedTier: "C",
    expectedLane: "second_chance",
    firstName: "Rosa", lastName: "Delgado-Sample",
    email: "rosa.delgado@sample.yesdoor.test",
    address: { line1: "2540 N Example Rd", city: "Glendale", state: "AZ", zip: "85301" },
    credit: { credit_score: 655, collections_count: 1, eviction_count: 1, eviction_last_at: "2023-11-20", criminal_flags: [] },
    income: {
      monthly_income_cents: cents(4100),
      sources: [{ kind: "payroll", label: "Salary, dental office", monthly_cents: cents(4100) }]
    }
  },
  {
    key: "tier-d",
    isSample: true,
    story: "Gig and warehouse work. Two evictions (the latest in 2024), four collections and a six-year-old property felony.",
    expectedTier: "D",
    expectedLane: "second_chance",
    firstName: "Jerome", lastName: "Castillo-Sample",
    email: "jerome.castillo@sample.yesdoor.test",
    address: { line1: "118 W Example Ln", city: "Phoenix", state: "AZ", zip: "85003" },
    credit: {
      credit_score: 541, collections_count: 4, eviction_count: 2, eviction_last_at: "2024-03-02",
      criminal_flags: [{ category: "felony_property", years_ago: 6 }]
    },
    income: {
      monthly_income_cents: cents(2950),
      sources: [
        { kind: "gig", label: "Rideshare deposits", monthly_cents: cents(2100) },
        { kind: "payroll", label: "Part-time warehouse", monthly_cents: cents(850) }
      ]
    }
  },
  {
    // The credit bureau cannot match this person on name and address alone. The
    // sandbox answers `no_match` until a date of birth is given, then returns
    // the file below (spec §7).
    key: "no-match",
    isSample: true,
    noMatchUntilDob: true,
    dob: "1994-05-17",
    story: "Recently moved, name spelled two ways on file. Clean report once matched by date of birth.",
    expectedTier: "B",
    expectedLane: "verified",
    firstName: "Leah", lastName: "Brandt-Sample",
    email: "leah.brandt@sample.yesdoor.test",
    address: { line1: "3391 E Example Blvd", city: "Gilbert", state: "AZ", zip: "85234" },
    credit: { credit_score: 689, collections_count: 0, eviction_count: 0, eviction_last_at: null, criminal_flags: [] },
    income: {
      monthly_income_cents: cents(5200),
      sources: [{ kind: "payroll", label: "Salary, design studio", monthly_cents: cents(5200) }]
    }
  }
]);

export function fixtureByEmail(email) {
  const e = String(email ?? "").trim().toLowerCase();
  return SAMPLE_RENTERS.find((r) => r.email === e) ?? null;
}

export function fixtureByKey(key) {
  return SAMPLE_RENTERS.find((r) => r.key === key) ?? null;
}
