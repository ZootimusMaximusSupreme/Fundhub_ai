// The /roadmap sales page carries its own two-step checkout widget
// (owner-set 2026-09-22): clickfunnels-fragments/slo/slo-01-sales.html.
// These checks read the page source. They pin the owner decisions and the API
// contract in docs/journeys/slo-roadmap-widget-flow.md so a later edit cannot
// quietly undo them. The browser walk is a separate proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, "../../clickfunnels-fragments/slo/slo-01-sales.html");
const html = fs.readFileSync(PAGE, "utf8");

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const widgetScript = inlineScripts.find((s) => s.includes("getElementById('fhw')")) || "";
/* Everything a visitor can read before a pull result: the page with scripts,
   styles and comments removed, and with the widget's post-result panes cut out. */
const visibleBeforeResult = html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<div class="cfw-state" data-state="(?:repair|repair-done)"[\s\S]*?<\/div>\s*(?=<div class="cfw-state")/g, "");

test("every inline script on the sales page parses", () => {
  assert.ok(inlineScripts.length > 0);
  for (const code of inlineScripts) assert.doesNotThrow(() => new vm.Script(code));
});

test("the checkout is the widget on this page: no pay.html link, every CTA scrolls to it", () => {
  assert.doesNotMatch(html, /roadmap\/pay\.html/);
  assert.match(html, /<div class="fh-widget-slot" id="fh-cf-form">\s*<div class="cfw" id="fhw">/);
  assert.match(html, /<a class="btn fh-go-pay" href="#fh-order">/);
  assert.match(html, /var dest=w\|\|o;/, "CTAs scroll to the widget, falling back to the section");
});

test("the widget calls the four doors on fundhub.ai, absolute, since the page lives on apply.fundhub.ai", () => {
  assert.match(widgetScript, /var API='https:\/\/fundhub\.ai\/api\/public\/';/);
  for (const door of ["'slo-checkout'", "'slo-pull'", "'slo-status?ref='", "'slo-repair-checkout'"]) {
    assert.ok(widgetScript.includes(door), door);
  }
});

test("demo or live is read from the server, never decided by the page", () => {
  assert.match(widgetScript, /demo:b\.demo===true/);
  assert.match(widgetScript, /if\(b\.demo===true\)\{demoEl\.textContent/);
  assert.doesNotMatch(widgetScript, /SLO_DEMO_PAY/);
});

test("LIVE stores identity with defer_pull, then goes to the Commas card page", () => {
  assert.match(widgetScript, /if\(!o\.demo\)body\.defer_pull=true;/);
  assert.match(widgetScript, /if\(b\.next==='pay'\)\{/);
  assert.match(widgetScript, /location\.href=o\.checkoutUrl;/);
});

test("the consent box uses the pull form's words", () => {
  assert.match(html, /name="consent"/);
  assert.match(html, /I authorize Fundhub Credit Solutions LLC to run a soft pull of my credit report\. A soft pull does not affect my credit score\./);
});

test("prices: first business free, each extra from the server (default 1500 cents)", () => {
  assert.match(widgetScript, /var price=\{base:29700,each:1500,max:20\};/);
  assert.match(widgetScript, /c=price\.base\+price\.each\*\(n-1\)/);
  assert.match(html, /\+ Add a business \(\$15\)/);
});

test("no repair or letter-mailing words are visible before a pull result", () => {
  assert.doesNotMatch(visibleBeforeResult, /repair/i);
  assert.doesNotMatch(visibleBeforeResult, /mails? (?:your|my) letters|letter mailing|order bump/i);
});

test("the social and date of birth never reach storage, the console or the address bar", () => {
  const lines = widgetScript.split("\n");
  for (const line of lines) {
    if (/sessionStorage|localStorage|document\.cookie/.test(line)) {
      assert.doesNotMatch(line, /ssn|dob/i, line.trim());
    }
    if (/console\./.test(line)) assert.doesNotMatch(line, /ssn|dob/i, line.trim());
    if (/URLSearchParams\(\)|q\.set\(/.test(line)) assert.doesNotMatch(line, /ssn|dob/i, line.trim());
  }
  assert.match(html, /name="ssn" class="mask"[^>]*autocomplete="off"/);
});

test("after the pull: time-to-bucket is logged, funding goes to the booking page with pa", () => {
  assert.match(widgetScript, /console\.info\('fh-widget time-to-bucket '/);
  assert.match(widgetScript, /var BOOK='https:\/\/apply\.fundhub\.ai\/roadmap-book';/);
  assert.match(widgetScript, /q\.set\('pa',String\(n\)\)/);
  assert.match(widgetScript, /POLL_MS=1000,POLL_MAX_MS=90000/);
});
