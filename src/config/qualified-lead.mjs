// QualifiedLead — the one rule for Meta's QualifiedLead event (owner-set 2026-10-05).
//
// Chris: a /apply survey taker is a qualified lead when their Available Capital
// answer is "$1k - $5k" or higher. "Less than $1k" is not. Nobody is turned away
// by this: Lead and Schedule still fire for everyone. QualifiedLead is one extra
// Meta event on the same last-question moment as the survey Lead.
//
// Where the rule runs: the /apply page (marketing/landing-pages/apply-survey.html)
// knows the answer, so it works out the yes/no and sends ONLY that flag
// (survey_answer prop `qualified`, on the last question). The answer itself never
// leaves the page through the tracker. The page keeps a copy of the list below;
// src/config/qualified-lead.test.mjs fails if the two lists differ, and
// src/ads/survey-tracking-hooks.test.mjs walks the real page with every choice
// and checks the flag against isQualifiedLead().
//
// Not the funding-call gate. That is src/config/survey-qualification.mjs (score
// 700+ and no negatives), which this file does not touch or replace.

/** The survey question this rule reads. */
export const QUALIFIED_LEAD_QUESTION = "cf_svy_available_capital";

/** Available Capital answers that make a qualified lead: "$1k - $5k" and up. */
export const QUALIFIED_CAPITAL_ANSWERS = Object.freeze([
  "$1k - $5k",
  "$5k - $25k",
  "$25k - $100k",
  "$100k+",
]);

/** The one Available Capital answer that does not. */
export const NOT_QUALIFIED_CAPITAL_ANSWERS = Object.freeze(["Less than $1k"]);

/**
 * True when the survey answers make a qualified lead. Pure, no I/O.
 * A missing or unknown Available Capital answer is false.
 * @param {Record<string, unknown>} answers keyed by survey question id (cf_svy_*)
 */
export function isQualifiedLead(answers = {}) {
  const v = answers && typeof answers === "object" ? answers[QUALIFIED_LEAD_QUESTION] : undefined;
  return typeof v === "string" && QUALIFIED_CAPITAL_ANSWERS.includes(v.trim());
}
