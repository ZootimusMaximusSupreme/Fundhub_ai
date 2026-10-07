// The B3b additions to src/yesdoor/config.mjs: pre-screen limits, cron batch sizes,
// outbox template keys. YD_DEFAULTS stays pinned to the spec (config.test.mjs);
// these are not tunable business numbers. Pure: no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { YD_CRON, YD_PRESCREEN, YD_TEMPLATES } from "./config.mjs";
import { TOUCH_KINDS } from "./schedule.mjs";

test("config: the B3b groups are frozen", () => {
  for (const o of [YD_PRESCREEN, YD_CRON, YD_TEMPLATES, YD_TEMPLATES.touch]) assert.ok(Object.isFrozen(o));
  assert.throws(() => { "use strict"; YD_PRESCREEN.minRenterAgeYears = 0; }, TypeError);
});

test("config: renters must be 18, and the limits are sane", () => {
  assert.equal(YD_PRESCREEN.minRenterAgeYears, 18);
  for (const v of Object.values(YD_PRESCREEN)) assert.ok(Number.isInteger(v) && v > 0);
  for (const v of Object.values(YD_CRON)) assert.ok(Number.isInteger(v) && v > 0);
});

test("config: every lifetime touch kind has an outbox template, and nothing else does", () => {
  assert.deepEqual(Object.keys(YD_TEMPLATES.touch).sort(), [...TOUCH_KINDS].sort());
  const keys = [...Object.values(YD_TEMPLATES.touch), YD_TEMPLATES.rulesReconfirm];
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^yd-[a-z0-9-]+$/);
});
