// src/config/qualified-lead.test.mjs — the one QualifiedLead rule (owner-set 2026-10-05).
//
// What this proves: Available Capital "$1k - $5k" or higher is qualified and
// "Less than $1k" is not; every choice the /apply page and the ClickFunnels map
// offer is decided one way or the other; and the /apply page's own copy of the
// list is this list, word for word. The page walk that checks the flag the page
// actually sends is in src/ads/survey-tracking-hooks.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  QUALIFIED_LEAD_QUESTION, QUALIFIED_CAPITAL_ANSWERS, NOT_QUALIFIED_CAPITAL_ANSWERS, isQualifiedLead,
} from "./qualified-lead.mjs";
import { CF_SURVEY_QUESTIONS } from "../survey/cf-question-map.mjs";

const HTML = fs.readFileSync(
  fileURLToPath(new URL("../../marketing/landing-pages/apply-survey.html", import.meta.url)), "utf8");

/** A single-quoted JS array literal from the page: var NAME = ['a', 'b']; */
function pageList(name) {
  const m = HTML.match(new RegExp(`var ${name} = \\[([^\\]]*)\\];`));
  assert.ok(m, `the page has var ${name}`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

/** The page's Available Capital choices, in order. */
function pageCapitalOptions() {
  const m = HTML.match(/key: 'cf_svy_available_capital'[\s\S]*?opts: \[([^\]]*)\]/);
  assert.ok(m, "the page has the Available Capital question");
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

test("$1k - $5k and higher is qualified", () => {
  for (const a of ["$1k - $5k", "$5k - $25k", "$25k - $100k", "$100k+"]) {
    assert.equal(isQualifiedLead({ cf_svy_available_capital: a }), true, a);
  }
});

test("Less than $1k is not qualified", () => {
  assert.equal(isQualifiedLead({ cf_svy_available_capital: "Less than $1k" }), false);
});

test("no answer, or an answer that is not a choice, is not qualified", () => {
  for (const answers of [{}, undefined, null, { cf_svy_available_capital: "" }, { cf_svy_available_capital: "$1k" },
    { cf_svy_available_capital: ["$1k - $5k"] }, { cf_svy_available_capital: 5000 }, { cf_svy_business_revenue: "$1M+" }]) {
    assert.equal(isQualifiedLead(answers), false, JSON.stringify(answers));
  }
});

test("reads only the Available Capital question", () => {
  assert.equal(QUALIFIED_LEAD_QUESTION, "cf_svy_available_capital");
  assert.equal(isQualifiedLead({ cf_svy_available_capital: "$100k+", cf_svy_self_reported_fico: "500-579" }), true,
    "score does not change it");
});

test("every Available Capital choice is decided, on the page and in the ClickFunnels map", () => {
  const decided = [...NOT_QUALIFIED_CAPITAL_ANSWERS, ...QUALIFIED_CAPITAL_ANSWERS];
  assert.deepEqual(pageCapitalOptions(), decided, "the page's choices, in order");
  const cf = CF_SURVEY_QUESTIONS.find((q) => q.payloadKey === QUALIFIED_LEAD_QUESTION);
  assert.deepEqual(cf.options, decided, "the ClickFunnels map's choices, in order");
});

test("the /apply page's copy of the list is this list, word for word", () => {
  assert.deepEqual(pageList("QUALIFIED_CAPITAL"), [...QUALIFIED_CAPITAL_ANSWERS]);
});
