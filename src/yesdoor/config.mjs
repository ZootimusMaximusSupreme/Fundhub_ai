// Yesdoor tunable numbers — ONE file (spec §0.8, §9). No magic numbers elsewhere.
//
// Chris tunes these from proven data later. Change the number here; code reads it
// from here. Two of them are also enforced by the database, which cannot read this
// file: maxOpenApplications (default of the yd.max_open_applications setting in
// 435) and disputeDays (14 days in the 435 disputes trigger).
// src/http/yesdoor-core.pg.test.mjs fails if either one drifts from the database.

/** Spec §9, exactly. Frozen so no caller can quietly change a default. */
export const YD_DEFAULTS = Object.freeze({
  maxOpenApplications: 3,
  maxBackups: 5,
  margins: Object.freeze({ score: 20, income: 0.10 }),
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

/** Login rules (spec §1): a link lasts 15 minutes, a session 30 days. */
export const YD_AUTH = Object.freeze({
  linkTtlMinutes: 15,
  sessionTtlDays: 30,
  // Link requests per address and per source address in the window.
  linkLimits: Object.freeze({ windowMinutes: 15, maxPerEmail: 3, maxPerIp: 15 }),
  // Where the emailed link points; the page (built in F1) trades the token for a session.
  loginPath: "/yesdoor/login.html",
  sessionCookie: "yesdoor_session"
});

/** API paging and limits. */
export const YD_API = Object.freeze({
  listingsPageSize: 24,
  listLimitDefault: 100,
  listLimitMax: 500
});

/** Staff role sets. `owner` passes every gate (requireRole SUPER_ROLES). Only
 *  ops and the owner see credit details (spec §1, §17.6). */
export const YD_ROLES = Object.freeze({
  staff: Object.freeze(["ops", "sales", "collections"]),
  money: Object.freeze(["ops", "collections"]),
  credit: Object.freeze(["ops"])
});
