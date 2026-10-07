// src/yesdoor/config.mjs — every tunable Yesdoor number lives here and nowhere else.
// Spec: docs/specs/yesdoor-mvp-build-spec.md §9. Deep-frozen so no module can
// change a default at run time.

export const YD_DEFAULTS = Object.freeze({
  maxOpenApplications: 3,
  maxBackups: 5,
  margins: Object.freeze({ score: 20, income: 0.1 }),
  defaultIncomeMultiple: 3,
  rulesStaleDays: 30,
  recheckDays: 30,
  leaseEndRecheckDays: 90,
  refundDays: 60,
  disputeDays: 14,
  mismatchPause: 3,
  mismatchWindowDays: 90,
  registrationValidDays: 90,
  knownProspectDays: 3,
  brokerSplitPercent: 25,
  tiers: Object.freeze({
    A: Object.freeze({ minScore: 700, evictionYears: 7, criminal: false }),
    B: Object.freeze({ minScore: 640, evictionYears: 5 }),
    C: Object.freeze({ minScore: 580 })
  })
});
