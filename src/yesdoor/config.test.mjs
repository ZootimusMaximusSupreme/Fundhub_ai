// YD_DEFAULTS is the one place the tunable numbers live (spec §0.8, §9). These
// tests keep it equal to the spec's own block and keep it from being edited at
// runtime. Pure: no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { YD_DEFAULTS, YD_AUTH, YD_API, YD_ROLES } from "./config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The ```js block under "## 9." in the build spec, as an object. */
function specDefaults() {
  const md = fs.readFileSync(path.join(ROOT, "docs/specs/yesdoor-mvp-build-spec.md"), "utf8");
  const section = md.slice(md.indexOf("## 9."));
  const m = /```js\n([\s\S]*?)```/.exec(section);
  assert.ok(m, "could not find the js block under §9 of the build spec");
  // The block is an object body written by us in our own doc, so evaluating it is safe.
  return new Function(`return ({${m[1]}});`)();
}

test("config: YD_DEFAULTS equals the spec §9 block exactly", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(YD_DEFAULTS)), specDefaults());
});

test("config: the numbers other parts of the spec name", () => {
  assert.equal(YD_DEFAULTS.maxOpenApplications, 3);
  assert.equal(YD_DEFAULTS.maxBackups, 5);
  assert.equal(YD_DEFAULTS.refundDays, 60);
  assert.equal(YD_DEFAULTS.disputeDays, 14);
  assert.equal(YD_DEFAULTS.registrationValidDays, 90);
  assert.equal(YD_DEFAULTS.knownProspectDays, 3);
  assert.equal(YD_DEFAULTS.brokerSplitPercent, 25);
  assert.equal(YD_DEFAULTS.margins.score, 20);
  assert.equal(YD_DEFAULTS.margins.income, 0.10);
  assert.deepEqual(YD_DEFAULTS.tiers.A, { minScore: 700, evictionYears: 7, criminal: false });
  assert.deepEqual(YD_DEFAULTS.tiers.B, { minScore: 640, evictionYears: 5 });
  assert.deepEqual(YD_DEFAULTS.tiers.C, { minScore: 580 });
});

test("config: everything is frozen, nothing can be changed at runtime", () => {
  for (const obj of [YD_DEFAULTS, YD_DEFAULTS.margins, YD_DEFAULTS.tiers, YD_DEFAULTS.tiers.A, YD_AUTH, YD_AUTH.linkLimits, YD_API, YD_ROLES, YD_ROLES.credit]) {
    assert.ok(Object.isFrozen(obj));
  }
  assert.throws(() => { "use strict"; YD_DEFAULTS.maxOpenApplications = 99; }, TypeError);
});

test("config: login rules match spec §1 (link 15 minutes, session 30 days)", () => {
  assert.equal(YD_AUTH.linkTtlMinutes, 15);
  assert.equal(YD_AUTH.sessionTtlDays, 30);
});

test("config: only ops (and the owner, who always passes) see credit details", () => {
  assert.deepEqual([...YD_ROLES.credit], ["ops"]);
  assert.ok(!YD_ROLES.credit.includes("sales") && !YD_ROLES.credit.includes("collections"));
});

test("config: only ops (and the owner) create logins; sales may add brokers but not hand out logins", () => {
  assert.deepEqual([...YD_ROLES.accounts], ["ops"]);
  assert.ok(Object.isFrozen(YD_ROLES.accounts));
  assert.ok(YD_ROLES.supply.includes("sales") && !YD_ROLES.accounts.includes("sales"));
});
