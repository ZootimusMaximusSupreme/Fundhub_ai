/* The morning-brief report page (MB5, ops/workflows/morning-brief-2026-10-05.md).
 *
 * Read as text, like the other screen guards: the page is plain HTML plus one
 * script, and the browser walk lives in e2e/morning-brief.spec.mjs. This file
 * pins the things that must not drift without someone meaning it to:
 *   - the six parts, in the spec's order
 *   - it reads the one endpoint MB3 built, and asks for kind (MB6)
 *   - every time is Arizona
 *   - owner/admin only in the shell, matching ROLE_SETS.OPS at the endpoint
 *   - an evening ask is never painted with a morning row
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/app");
const HTML = fs.readFileSync(path.join(APP, "morning-brief.html"), "utf8");
const JS = fs.readFileSync(path.join(APP, "morning-brief.js"), "utf8");
const SHELL = fs.readFileSync(path.join(APP, "shell.js"), "utf8");

test("six parts, in the spec's order", () => {
  const ids = [...HTML.matchAll(/<section class="sec" id="sec-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["systems", "marketing", "money", "team", "suggestions", "today"]);
});

test("reads /api/read/morning-brief with date and kind, nothing else", () => {
  assert.match(JS, /FHData\.read\("morning-brief", \{ date: current\.date, kind: current\.kind \}\)/);
  const reads = [...JS.matchAll(/FHData\.read\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(reads)], ["morning-brief"]);
  assert.match(HTML, /data-kind="morning"/);
  assert.match(HTML, /data-kind="evening"/);
});

test("every time on the page is Arizona", () => {
  const zones = [...JS.matchAll(/timeZone:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(zones.length >= 3, "the page formats its dates and times somewhere");
  for (const z of zones) assert.equal(z, "America/Phoenix");
});

test("red checks sort first", () => {
  assert.match(JS, /var ORDER = \{ red: 0, not_checked: 1, green: 2 \};/);
});

test("an evening ask is never answered with the morning row", () => {
  assert.match(JS, /if \(gotKind !== current\.kind\)/);
});

test("owner and admin only, like the endpoint", () => {
  const list = SHELL.match(/var OWNER_ADMIN_ONLY = \[([\s\S]*?)\];/)[1];
  assert.ok(list.includes('"morning-brief.html"'));
  const api = fs.readFileSync(path.resolve(APP, "../../api/read/morning-brief.mjs"), "utf8");
  assert.match(api, /requireRole\(res, staff, ROLE_SETS\.OPS\)/);
});
