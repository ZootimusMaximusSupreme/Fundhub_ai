// public/slo/pull.html is the Commas success URL for the $297 SLO diagnostic.
// It collects legal name, date of birth, SSN and address so a later, separate
// task can run the soft pull. There is no pull API here — this page must never
// transmit SSN or DOB anywhere, and must never let either one reach the
// address bar, browser storage, a cookie, or the console.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, "../../public/slo/pull.html");
const html = fs.readFileSync(PAGE, "utf8");

test("the consent gate exists and names the right thing", () => {
  assert.match(html, /id="consent"/, "a consent checkbox must exist");
  assert.match(
    html,
    /authorize Fundhub Credit Solutions LLC to run a soft pull/i,
    "consent wording must name the entity and the soft pull"
  );
  assert.match(
    html,
    /does not affect my credit score/i,
    "consent wording must say a soft pull does not affect the score"
  );
});

test("submit is refused in plain words until consent is ticked", () => {
  assert.match(
    html,
    /consent\.checked/,
    "the submit handler must check whether the consent box is ticked"
  );
  assert.match(
    html,
    /check the box to authorize the soft pull/i,
    "the refusal message must be in plain words, not a raw validation error"
  );
});

test("required fields are validated in plain words", () => {
  const FIELDS = [
    "your legal first name",
    "your legal last name",
    "your date of birth",
    "your Social Security number",
    "your street address",
    "your city",
    "your state",
    "your ZIP code"
  ];
  for (const label of FIELDS) {
    assert.ok(html.includes(label), `missing plain-word validation copy for "${label}"`);
  }
});

test("the form is never method GET and has no action target", () => {
  const formTag = (html.match(/<form\b[^>]*>/i) || [""])[0];
  assert.ok(formTag, "a <form> element must exist");
  assert.doesNotMatch(formTag, /method\s*=/i, "the form must not declare a method (JS handles submit)");
  assert.doesNotMatch(formTag, /action\s*=/i, "the form must not declare an action target");
});

test("submit is handled in JS with preventDefault, never a real submission", () => {
  assert.match(html, /addEventListener\("submit"/, "must attach a submit listener");
  assert.match(html, /e\.preventDefault\(\)/, "must call preventDefault on submit");
});

test("no pull API is called from this page", () => {
  assert.doesNotMatch(html, /fetch\(/, "no fetch() may exist — there is no pull API in this task");
  assert.doesNotMatch(html, /XMLHttpRequest/, "no XMLHttpRequest may exist");
  assert.doesNotMatch(html, /navigator\.sendBeacon/, "no sendBeacon may exist");
  assert.match(
    html,
    /pull endpoint is a separate|separate,?\s*later task/i,
    "a code comment must say the pull endpoint is separate work"
  );
});

test("SSN and DOB never reach the address bar, storage, a cookie, or the console", () => {
  assert.doesNotMatch(html, /localStorage/i, "localStorage must not be used anywhere on this page");
  assert.doesNotMatch(html, /sessionStorage/i, "sessionStorage must not be used anywhere on this page");
  assert.doesNotMatch(html, /document\.cookie/i, "cookies must not be used anywhere on this page");
  assert.doesNotMatch(html, /console\.(log|info|warn|debug)/i, "no console logging on this page");

  // Every line that mentions the ssn/dob fields must be free of the sinks
  // above AND free of any write to location/history — reading the incoming
  // ?ref=/&client_id= via URLSearchParams is fine, writing ssn/dob into the
  // URL is not.
  const sinkPattern = /localstorage|sessionstorage|cookie|console\.|location\.(href|search|assign|replace)|history\.(push|replace)state/i;
  const lines = html.split("\n");
  for (const line of lines) {
    if (/\bssn\b/i.test(line) || /\bdob\b/i.test(line)) {
      assert.doesNotMatch(
        line,
        sinkPattern,
        `a line touching ssn/dob must never touch a storage/URL sink: "${line.trim()}"`
      );
    }
  }
});

test("SSN input never behaves like a normal saved field", () => {
  const ssnInputTag = (html.match(/<input\b[^>]*id="ssn"[^>]*>/i) || [""])[0];
  assert.ok(ssnInputTag, "an input with id=\"ssn\" must exist");
  assert.match(ssnInputTag, /autocomplete\s*=\s*"off"/i, "SSN input must have autocomplete=\"off\"");
  assert.match(ssnInputTag, /inputmode\s*=\s*"numeric"/i, "SSN input must have inputmode=\"numeric\"");
  assert.doesNotMatch(ssnInputTag, /type\s*=\s*"(hidden|url)"/i, "SSN input must be a normal visible field");
});

test("SSN is cleared from the DOM on valid submit", () => {
  assert.match(
    html,
    /ssnInput\.value\s*=\s*("|')("|')/,
    "the SSN input's value must be cleared once validation has read it"
  );
});

test("valid submit shows a calm building state, not a fake progress claim", () => {
  assert.match(html, /id="building"/, "a building/loading state element must exist");
  assert.match(html, /Building your pack/i, "the building state must say what it is doing");
  const block = (html.match(/<div class="card building"[\s\S]*?<\/div>\s*<\/div>/) || [""])[0];
  assert.ok(block, "the building state markup block must be found");
  assert.doesNotMatch(block, /\d+\s*%|progress bar/i, "no fabricated percentage or progress bar");
});

test("no SIM MODE, no fake testimonials, no earnings or score-increase claims", () => {
  assert.doesNotMatch(html, /SIM MODE/i, "no SIM MODE text");
  assert.doesNotMatch(html, /testimonial/i, "no testimonial markup or copy");
  assert.doesNotMatch(html, /★|verified buyer|5-star|five-star/i, "no fake review/testimonial signals");
  assert.doesNotMatch(
    html,
    /score will go up|raise your score|boost your score|guaranteed (approval|funding|results)/i,
    "no credit-outcome or funding-outcome guarantee"
  );
});

test("trust copy only uses wording already in the fragment source", () => {
  // clickfunnels-fragments/slo/slo-01-sales.html:406 — "Your $297 credits
  // toward your $3,000 deposit." This page must reuse that fact, not invent
  // new numbers or claims.
  assert.match(html, /\$297\s+credits toward your\s+\$3,000 deposit/i);
  assert.match(html, /soft pull only/i);
  assert.match(html, /zero score impact/i);
  assert.match(html, /do not sell your data/i);
});

test("reads ?ref= and optional ?client_id= but invents no ref when missing", () => {
  assert.match(html, /qp\.get\("ref"\)/, "must read ref from the query string");
  assert.match(html, /qp\.get\("client_id"\)/, "must read client_id from the query string");
  assert.match(
    html,
    /orderRef\s*=\s*qp\.get\("ref"\)\s*\|\|\s*null/,
    "a missing ref must resolve to null, never a generated placeholder"
  );
});

test("no horizontal-scroll traps: html/body overflow-x is hidden", () => {
  assert.match(html, /html,body\{overflow-x:hidden\}/);
});
