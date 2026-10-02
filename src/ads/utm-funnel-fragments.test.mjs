// The two live funnels must carry the same UTM field names Creative Factory
// writes (utm_content leading digits = ad id). A third funnel is not built.
//
// npm test's glob is src/** only, so this sits here and reads the paste files.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATTRIBUTION_KEYS, CLICK_ID_KEYS, pickAttribution } from "./attribution-keys.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const UTM_NAMES = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"
];
const EXTRA = ["landing_path", "referrer_domain"];

const APPLY_PAGES = [
  "marketing/landing-pages/01-vsl.html",
  "marketing/landing-pages/02a-apply-top.html",
  "marketing/landing-pages/02b-apply-bottom.html",
  "marketing/landing-pages/04a-book-top.html",
  "marketing/landing-pages/04b-book-bottom.html",
  "marketing/landing-pages/05-thank-you.html"
];

const DIAGNOSTIC_PAGES = [
  "public/roadmap/index.html",
  "public/roadmap/pay.html",
  "marketing/landing-pages/slo/slo-01-sales.html",
  "marketing/landing-pages/slo/slo-02-order.html",
  "marketing/landing-pages/slo/slo-03-thank-you.html"
];

function extractInlineScript(html) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(blocks.length, 1, "expected one inline script");
  return blocks[0][1].replace(/^\n/, "");
}

test("Creative Factory keys are the seven 06 writes, and utm_content is among them", () => {
  assert.deepEqual(ATTRIBUTION_KEYS, [...UTM_NAMES, ...EXTRA]);
  assert.ok(ATTRIBUTION_KEYS.includes("utm_content"));
});

test("06 paste-in and /funnel/fh-attribution.js are the same script", () => {
  const fromHtml = extractInlineScript(read("marketing/landing-pages/06-utm-hidden-fields.html"));
  const fromPublic = read("public/funnel/fh-attribution.js");
  assert.equal(fromPublic, fromHtml.endsWith("\n") ? fromHtml : fromHtml + "\n");
  for (const k of UTM_NAMES) assert.ok(fromPublic.includes(`"${k}"`), k);
  assert.ok(fromPublic.includes("fh_attribution"));
  /* Affiliate codes ride the same script but stay off ATTRIBUTION_KEYS (ad UTMs). */
  assert.ok(fromPublic.includes('"a1"') && fromPublic.includes('"a2"'), "stamps a1/a2");
  assert.ok(fromPublic.includes('qs.get("ref")'), "ref aliases to a1");
  assert.ok(fromPublic.includes("if (stored.a1 && !parsed.a1) parsed.a1 = stored.a1"),
    "slo-checkout POST carries a1");
  /* Meta Phase 4: fbclid is kept (first touch), never stamped on a form. */
  assert.ok(fromPublic.includes('qs.get("fbclid")'), "fbclid is read off the landing URL");
  assert.ok(fromPublic.includes("KEYS.concat(EXTRA).concat(AFF).forEach(function (k) { ensure(forms[i], k, data[k] || \"\"); })"),
    "hidden inputs are the UTMs, landing_path, referrer_domain, a1 and a2 only");
  assert.ok(!/var (KEYS|EXTRA|AFF) = \[[^\]]*fbclid/.test(fromPublic), "fbclid is in no stamped list");
});

test("07 paste-in and /funnel/vsl-watch-beacon.js are the same script", () => {
  const fromHtml = extractInlineScript(read("marketing/landing-pages/07-vsl-watch-beacon.html"));
  const fromPublic = read("public/funnel/vsl-watch-beacon.js");
  assert.equal(fromPublic, fromHtml.endsWith("\n") ? fromHtml : fromHtml + "\n");
  assert.ok(fromPublic.includes("fh_attribution"));
  assert.ok(fromPublic.includes("https://fundhub.ai/api/public/vsl-watch"));
});

test("apply funnel fragments load the UTM script (apply.fundhub.ai /watch /apply /funding-book-call /thank-you)", () => {
  for (const p of APPLY_PAGES) {
    const html = read(p);
    assert.ok(
      html.includes("https://fundhub.ai/funnel/fh-attribution.js"),
      `${p} must load fh-attribution.js`
    );
    assert.doesNotMatch(html, /Capital Playbook/);
  }
});

test("watch page fragment also loads the VSL beacon", () => {
  const html = read("marketing/landing-pages/01-vsl.html");
  assert.ok(html.includes("https://fundhub.ai/funnel/vsl-watch-beacon.js"));
  const attrAt = html.indexOf("fh-attribution.js");
  const beaconAt = html.indexOf("vsl-watch-beacon.js");
  assert.ok(attrAt > -1 && beaconAt > attrAt, "06 must run before 07 so the ad number is already saved");
});

test("$297 diagnostic pages load the UTM script (fundhub.ai /roadmap and CF slo paste)", () => {
  for (const p of DIAGNOSTIC_PAGES) {
    const html = read(p);
    assert.ok(
      html.includes("funnel/fh-attribution.js"),
      `${p} must load fh-attribution.js`
    );
    assert.doesNotMatch(html, /Capital Playbook/);
  }
});

test("roadmap pay posts the five UTM names plus landing_path and referrer_domain", () => {
  const html = read("public/roadmap/pay.html");
  for (const k of [...UTM_NAMES, ...EXTRA]) {
    assert.ok(html.includes(`"${k}"`), `pay.html must send ${k}`);
  }
  assert.doesNotMatch(html, /sessionStorage/, "pay.html reads hidden fields 06 already stamped; no extra store");
});

test("roadmap pull form does not use sessionStorage (SSN page)", () => {
  const html = read("public/roadmap/pull.html");
  assert.doesNotMatch(html, /sessionStorage/);
  assert.doesNotMatch(html, /fh-attribution/);
});

test("pickAttribution keeps first-touch keys and drops empties", () => {
  assert.equal(pickAttribution(null), null);
  assert.equal(pickAttribution({ email: "a@b.co" }), null);
  const got = pickAttribution({
    utm_source: "fb",
    utm_content: "42-ringlights",
    utm_term: "  ",
    extra: "nope"
  });
  assert.deepEqual(got, { utm_source: "fb", utm_content: "42-ringlights" });
});

test("pickAttribution keeps Meta's fbclid when it looks like one (Phase 4), and nothing else new", () => {
  assert.deepEqual(CLICK_ID_KEYS, ["fbclid"]);
  assert.ok(!ATTRIBUTION_KEYS.includes("fbclid"), "fbclid is not a stamped / typed-column key");
  assert.deepEqual(pickAttribution({ fbclid: " IwAR0x_9-AbC " }), { fbclid: "IwAR0x_9-AbC" });
  assert.deepEqual(pickAttribution({ utm_source: "fb", fbclid: "IwAR0x_9-AbC", gclid: "DROPME", fbc: "fb.1.1.x" }),
    { utm_source: "fb", fbclid: "IwAR0x_9-AbC" });
  const long = "a".repeat(500);
  assert.equal(pickAttribution({ fbclid: long }).fbclid, long, "500 is the most kept");
  for (const bad of ["a".repeat(501), "pat@gmail.com", "has space", "x;y", "", 12345, null, { a: 1 }]) {
    assert.equal(pickAttribution({ fbclid: bad }), null, `dropped whole, never cut: ${String(bad).slice(0, 20)}`);
  }
});
