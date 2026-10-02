import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditCompany,
  auditCompanies,
  shellLlcSuggestion,
  websiteSuggestion,
  linkedInSuggestion,
  APPROVED_NAICS,
  SHELL_LLC_SUGGESTION_TEXT,
  SHELL_LLC_SUGGESTION_WHY,
  WEBSITE_SUGGESTION_TEXT,
  WEBSITE_SUGGESTION_WHY,
  LINKEDIN_SUGGESTION_TEXT,
  LINKEDIN_SUGGESTION_WHY
} from "./company-audit.mjs";

test("an approved code and a plain name need no change", () => {
  const out = auditCompany({ name: "Northline Systems LLC", naics: "541611" });
  assert.equal(out.naicsSuggestion.change, false);
  assert.equal(out.naicsSuggestion.status, "approved");
  assert.equal(out.nameSuggestion.change, false);
});

test("a missing code asks for the low-risk list and says why", () => {
  const out = auditCompany({ name: "Northline Systems LLC", naics: "" });
  assert.equal(out.naicsSuggestion.change, true);
  assert.equal(out.naicsSuggestion.status, "missing");
  assert.equal(out.naicsSuggestion.pick.length, APPROVED_NAICS.length);
  assert.match(out.naicsSuggestion.why, /no industry code/);
});

test("a code off the list suggests the low-risk list and says why", () => {
  const out = auditCompany({ name: "Northline Systems LLC", naics: "484121" });
  assert.equal(out.naicsSuggestion.change, true);
  assert.equal(out.naicsSuggestion.status, "not_on_list");
  assert.equal(out.naicsSuggestion.from, "484121");
  assert.ok(out.naicsSuggestion.pick.some((row) => row.code === "541611"));
  assert.match(out.naicsSuggestion.why, /not on the low-risk list/);
});

test("a flagged name suggests taking the word out and says why", () => {
  const out = auditCompany({ name: "Apex Crypto Holdings LLC", naics: "541611" });
  assert.equal(out.nameSuggestion.change, true);
  assert.ok(out.nameSuggestion.flags.includes("crypto"));
  assert.match(out.nameSuggestion.why, /crypto/);
  assert.match(out.nameSuggestion.suggestion, /Take crypto out/);
  assert.equal(out.naicsSuggestion.change, false);
});

test("shell LLC standing rule names Arizona, sole member, not a trust, two shells, one per quarter", () => {
  const out = shellLlcSuggestion({ companyCount: 0 });
  assert.equal(out.change, true);
  assert.equal(out.status, "standing_rule");
  assert.equal(out.canTellShellsApart, false);
  assert.equal(out.suggestion, SHELL_LLC_SUGGESTION_TEXT);
  assert.equal(out.why, SHELL_LLC_SUGGESTION_WHY);
  assert.match(out.suggestion, /at least two/i);
  assert.match(out.suggestion, /each quarter/i);
  assert.match(out.suggestion, /sole member/i);
  assert.match(out.suggestion, /not open them under a trust/i);
  assert.match(out.suggestion, /blank, basic, standard name/i);
  assert.match(out.suggestion, /Arizona/i);
  assert.match(out.suggestion, /\$90/);
  assert.match(out.suggestion, /no yearly fee/i);
  assert.match(out.suggestion, /separate from the company you already run/i);
  assert.match(out.suggestion, /do not have to live in Arizona/i);
  assert.match(out.suggestion, /File the LLC with the state of Arizona/i);
  assert.match(out.suggestion, /Northwest Registered Agent/i);
  assert.match(out.suggestion, /foreign-file it into your home state/i);
  assert.match(out.why, /standing Fundhub rule/);
});

test("person with no company and person with one company both get the same shell rule once", () => {
  const none = auditCompanies([]);
  const one = auditCompanies([{ name: "Northline Systems LLC", naics: "541611" }]);
  assert.equal(none.companies.length, 0);
  assert.equal(one.companies.length, 1);
  assert.equal(none.shellSuggestion.suggestion, SHELL_LLC_SUGGESTION_TEXT);
  assert.equal(one.shellSuggestion.suggestion, SHELL_LLC_SUGGESTION_TEXT);
  assert.equal(none.shellSuggestion.why, one.shellSuggestion.why);
});

test("several saved companies still get the standing shell rule once, not open-more-on-top", () => {
  const many = auditCompanies([
    { name: "One LLC", naics: "541611" },
    { name: "Two LLC", naics: "541611" },
    { name: "Three LLC", naics: "541611" }
  ]);
  assert.equal(many.companies.length, 3);
  assert.equal(many.shellSuggestion.companyCount, 3);
  assert.equal(many.shellSuggestion.suggestion, SHELL_LLC_SUGGESTION_TEXT);
  assert.match(many.shellSuggestion.why, /cannot tell a shell from an operating company/);
  assert.doesNotMatch(many.shellSuggestion.suggestion, /open two more/i);
});

test("website standing rule says set one up, banks check online, and no scanner", () => {
  const out = websiteSuggestion();
  assert.equal(out.change, true);
  assert.equal(out.status, "standing_rule");
  assert.equal(out.suggestion, WEBSITE_SUGGESTION_TEXT);
  assert.equal(out.why, WEBSITE_SUGGESTION_WHY);
  assert.match(out.suggestion, /You need a website/i);
  assert.match(out.suggestion, /Set one up/i);
  assert.match(out.suggestion, /Put the business on it/i);
  assert.match(out.why, /Banks check that you exist online/i);
  assert.match(out.why, /basic website tied to the domain/i);
  assert.match(out.why, /does not scan/i);
  assert.match(out.why, /does not call a paid website API/i);
});

test("LinkedIn standing rule says business profile and lenders like to see it", () => {
  const out = linkedInSuggestion();
  assert.equal(out.change, true);
  assert.equal(out.status, "standing_rule");
  assert.equal(out.suggestion, LINKEDIN_SUGGESTION_TEXT);
  assert.equal(out.why, LINKEDIN_SUGGESTION_WHY);
  assert.match(out.suggestion, /LinkedIn as a business profile/i);
  assert.match(out.why, /Lenders like to see/i);
  assert.match(out.why, /Owner-set 2026-09-27/);
});

test("auditCompanies returns website, LinkedIn, and shell standing rules together", () => {
  const out = auditCompanies([{ name: "Northline Systems LLC", naics: "541611" }]);
  assert.equal(out.websiteSuggestion.suggestion, WEBSITE_SUGGESTION_TEXT);
  assert.equal(out.linkedInSuggestion.suggestion, LINKEDIN_SUGGESTION_TEXT);
  assert.equal(out.shellSuggestion.suggestion, SHELL_LLC_SUGGESTION_TEXT);
  assert.equal(out.websiteSuggestion.why, WEBSITE_SUGGESTION_WHY);
  assert.equal(out.linkedInSuggestion.why, LINKEDIN_SUGGESTION_WHY);
  assert.equal(out.shellSuggestion.why, SHELL_LLC_SUGGESTION_WHY);
});
