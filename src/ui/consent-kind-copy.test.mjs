/* The consent page must wear the words of the kind it is capturing.
 *
 * THE DEFECT THIS FILE EXISTS FOR (live walk 2026-09-17, GAP 39).
 * public/app/consent-capture.html accepts four kinds — soft_pull_consent,
 * dispute_authorization, call_recording, marketing_use — and every piece of
 * per-kind wording was chosen by ONE BOOLEAN, `isDispute`. A boolean tells two
 * things apart, not four, so opening the page with kind=call_recording or
 * kind=marketing_use titled it "Soft Pull Consent" and, after saving, told the
 * staff member "A soft pull may be requested for this client."
 *
 * The body paragraph was right the whole time, which is what made this hard to
 * see: that text comes from the server (api/consent/capture.mjs returns
 * disclosureFor(kind)), so the CALL-RECORDING-V1 badge and the recording
 * paragraph sat correctly underneath a soft-pull heading.
 *
 * This reads the file as text rather than running it: the page is an IIFE that
 * fetches on load and exports nothing.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
const PAGE = fs.readFileSync(
  path.join(ROOT, "public", "app", "consent-capture.html"), "utf8");

/** objectKeys — the top-level keys of a `var <name> = { … };` literal. */
function objectKeys(name) {
  const m = PAGE.match(new RegExp("var\\s+" + name + "\\s*=\\s*\\{([\\s\\S]*?)\\n  \\};"));
  assert.ok(m, `consent-capture.html no longer declares ${name}`);
  return (m[1].match(/^\s{4}([a-z_]+)\s*:/gm) || [])
    .map((s) => s.trim().replace(/\s*:$/, ""));
}

describe("consent-capture — each kind wears its own words (GAP 39)", () => {
  test("every kind the page accepts has its own copy", () => {
    const accepted = objectKeys("ALLOWED_KINDS");
    const copy = objectKeys("KIND_COPY");
    assert.deepEqual([...accepted].sort(), [
      "call_recording", "dispute_authorization", "marketing_use", "soft_pull_consent"
    ]);
    const missing = accepted.filter((k) => !copy.includes(k));
    assert.deepEqual(missing, [],
      `these kinds fall back to another kind's wording: ${missing.join(", ")}`);
  });

  test("the two recording kinds say recording and advertising, not soft pull", () => {
    for (const phrase of [
      "Call recording consent",
      "This call may be recorded.",
      "Marketing use consent",
      "What this client said may be used in advertising."
    ]) {
      assert.ok(PAGE.includes(phrase), `the page lost the wording: ${phrase}`);
    }
  });

  /* The two kinds that were already right must not move. This fix was scoped to
     the two that were wrong; a soft-pull heading or sentence changing here is
     the change nobody asked for. */
  test("soft pull and dispute keep the exact words they had", () => {
    for (const phrase of [
      "Soft Pull Consent",
      "Consent is on file",
      "A soft pull may be requested for this client.",
      "Consent recorded. A soft pull may now be requested for this client.",
      "Authorize dispute letters",
      "Authorization is on file",
      "Signature recorded. We can prepare dispute letters. This is not a credit pull."
    ]) {
      assert.ok(PAGE.includes(phrase), `the soft-pull/dispute wording changed: ${phrase}`);
    }
  });

  /* The regression guard proper. If someone reintroduces a two-way ternary for
     any of these three strings, four kinds collapse back into two. */
  test("the title and the after-save line are not chosen by a boolean", () => {
    assert.match(PAGE, /var title = kindCopy\.title;/,
      "the page title is back on an isDispute ternary — two kinds will wear the wrong heading");
    assert.match(PAGE, /valid: \["is-valid", kindCopy\.validLede, kindCopy\.validDetail\]/,
      "the 'consent is on file' line is back on an isDispute ternary");
    assert.match(PAGE, /say\("ok", kindCopy\.saved\);/,
      "the save confirmation is back on an isDispute ternary");
  });
});
