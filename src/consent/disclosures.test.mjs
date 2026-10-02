// The words a person is shown, and the words their row keeps, are the same words.
//
// This file exists because disclosures.mjs is append-only BY CONVENTION — the
// file says so in its own header and nothing enforced it. Editing an approved
// string in place silently rewrites what everyone who consented under that
// version is recorded as having agreed to. These checks make that edit fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOFT_PULL_DISCLOSURES,
  CURRENT_SOFT_PULL_VERSION,
  ROADMAP_SOFT_PULL_VERSION
} from "./disclosures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(HERE, p), "utf8");

/* soft-pull-v1, byte for byte as Chris approved it on 2026-07-31. If this test
   fails, an approved paragraph was edited in place — add a NEW version key. */
const V1 = [
  "I authorize Fundhub to obtain my consumer credit report through a soft inquiry.",
  "",
  "A soft inquiry does not affect my credit score and is not visible to lenders reviewing my file.",
  "",
  "I understand this authorization stays in effect until it expires or until I withdraw it, and that I may withdraw it at any time, for any reason, without giving a reason.",
  "",
  "I understand that withdrawing it does not undo a report already obtained, and does not affect anything already done with a report obtained while this authorization was in effect."
].join("\n");

test("soft-pull-v1 is frozen exactly as approved 2026-07-31", () => {
  assert.equal(SOFT_PULL_DISCLOSURES["soft-pull-v1"].text, V1);
});

/* soft-pull-v2, byte for byte as it stood when v3 was added (2026-10-02). The
   "Fundhub LLC" decision is a NEW key (v3); v2 keeps the words its rows hold. */
const V2 = [
  V1,
  "",
  "I agree that Fundhub may call me and send me text messages at the phone number I gave, including messages sent by an automatic dialing system, about my file and the services I asked for.",
  "",
  "Message and data rates may apply, and how often I am messaged varies. I can reply STOP at any time to stop the texts, or HELP for help.",
  "",
  "I understand that agreeing to calls and texts is not a condition of buying anything from Fundhub, and that I may withdraw it at any time without affecting my order or my soft pull authorization."
].join("\n");

/* soft-pull-v3 (owner-set 2026-10-02): the /roadmap checkbox words with
   "Fundhub LLC" as the company name. */
const V3 =
  "I authorize Fundhub LLC to run a soft pull of my credit report. A soft pull does not affect my credit score. I also agree Fundhub LLC may call and text me at the number I gave, including automated texts, about my file. Message and data rates may apply. Reply STOP to stop. Agreeing to texts is not a condition of buying anything.";

test("soft-pull-v2 is frozen exactly as it stood before v3", () => {
  assert.equal(SOFT_PULL_DISCLOSURES["soft-pull-v2"].text, V2);
});

test("soft-pull-v3 is the /roadmap box with Fundhub LLC, and /roadmap stores it", () => {
  const v3 = SOFT_PULL_DISCLOSURES["soft-pull-v3"];
  assert.ok(v3, "soft-pull-v3 exists");
  assert.equal(v3.version, "soft-pull-v3");
  assert.equal(v3.text, V3);
  assert.ok(Object.isFrozen(v3));
  assert.equal(ROADMAP_SOFT_PULL_VERSION, "soft-pull-v3");
  assert.doesNotMatch(v3.text, /Credit Solutions|FundHub/);
});

test("soft-pull-v2 keeps v1's words and adds the texting agreement", () => {
  const v2 = SOFT_PULL_DISCLOSURES["soft-pull-v2"];
  assert.ok(v2, "soft-pull-v2 exists");
  assert.ok(v2.text.startsWith(V1), "v2 opens with v1 unchanged — the pull terms did not move");
  const added = v2.text.slice(V1.length);
  assert.match(added, /may call me and send me text messages at the phone number I gave/);
  assert.match(added, /automatic dialing system/);
  assert.match(added, /Message and data rates may apply/);
  assert.match(added, /reply STOP at any time/);
  assert.match(added, /not a condition of buying anything from Fundhub/);
});

test("new captures use v2, so a new row's stored words mention texts", () => {
  assert.equal(CURRENT_SOFT_PULL_VERSION, "soft-pull-v2");
  assert.match(SOFT_PULL_DISCLOSURES[CURRENT_SOFT_PULL_VERSION].text, /text messages/);
});

test("a version is never removed — an old row's version must still resolve", () => {
  for (const key of ["soft-pull-v1", "soft-pull-v2", "soft-pull-v3"]) {
    assert.ok(SOFT_PULL_DISCLOSURES[key]?.text, key);
  }
});

/* The words on the box ARE the words on the row. Every page that posts a
   /roadmap soft pull (runSloPull, which stores ROADMAP_SOFT_PULL_VERSION) must
   show that version's text exactly — one character off and a person is
   recorded agreeing to a paragraph the screen never showed. */
const consentLabel = (html) => {
  const m = html.match(/<label[^>]*for="consent"[^>]*>([\s\S]*?)<\/label>|<label[^>]*class="check consent"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span><\/label>/);
  return m ? (m[1] ?? m[2]).replace(/\s+/g, " ").trim() : null;
};

for (const page of ["../../public/roadmap/pull.html", "../../marketing/landing-pages/slo/slo-01-sales.html"]) {
  test(`the consent box on ${path.basename(page)} shows the stored ${ROADMAP_SOFT_PULL_VERSION} text exactly`, () => {
    const html = read(page);
    assert.equal(consentLabel(html), SOFT_PULL_DISCLOSURES[ROADMAP_SOFT_PULL_VERSION].text);
    assert.doesNotMatch(html, /Credit Solutions|FundHub/);
  });
}
