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
import { SOFT_PULL_DISCLOSURES, CURRENT_SOFT_PULL_VERSION } from "./disclosures.mjs";

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
  for (const key of ["soft-pull-v1", "soft-pull-v2"]) {
    assert.ok(SOFT_PULL_DISCLOSURES[key]?.text, key);
  }
});

/* The screen is a summary of the row, not a different agreement. Both pages
   that post a soft pull have to name the texts, or a person is recorded as
   agreeing to a paragraph the screen never mentioned. */
for (const page of ["../../clickfunnels-fragments/slo/slo-01-sales.html", "../../public/roadmap/pull.html"]) {
  test(`the consent box on ${path.basename(page)} names the texts`, () => {
    const html = read(page);
    assert.match(html, /soft pull of my credit report/);
    assert.match(html, /agree Fundhub may call and text me at the number I gave, including automated texts/);
    assert.match(html, /Reply STOP to stop/);
    assert.match(html, /not a condition of buying anything/);
  });
}
