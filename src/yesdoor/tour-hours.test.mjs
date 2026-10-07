// Pure tests for tour hours. No database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTourHours, tourFits, localParts, hoursSummary } from "./tour-hours.mjs";

const SEED = { "mon-fri": "09:00-17:00", sat: "10:00-16:00" };

// 2026-10-07 is a Wednesday. Arizona is UTC-7 all year (no daylight saving).
const az = (iso) => `${iso}-07:00`;

test("hours: the seed shape parses; a range and a single day both work", () => {
  const p = parseTourHours(SEED);
  assert.equal(p.ok, true);
  for (const d of [1, 2, 3, 4, 5]) assert.deepEqual(p.windows[d], [{ open: 540, close: 1020 }]);
  assert.deepEqual(p.windows[6], [{ open: 600, close: 960 }]);
  assert.equal(p.windows[0], undefined, "Sunday is not named, so closed");
});

test("hours: a range can wrap over the weekend, and a day can have two windows", () => {
  const p = parseTourHours({ "fri-mon": "10:00-14:00", tue: ["09:00-12:00", "13:00-17:00"] });
  assert.equal(p.ok, true);
  for (const d of [5, 6, 0, 1]) assert.ok(p.windows[d], `day ${d}`);
  assert.equal(p.windows[2].length, 2);
});

test("hours: bad keys and bad windows are reported in plain words, not guessed", () => {
  const p = parseTourHours({ funday: "09:00-17:00", mon: "17:00-09:00", tue: "9am-5pm", wed: [] });
  assert.equal(p.ok, false);
  assert.equal(p.errors.length, 4);
  assert.match(p.errors[0], /not a day/);
  assert.equal(parseTourHours([]).ok, false);
  assert.equal(parseTourHours("mon").ok, false);
});

test("hours: empty or missing means the building has not said, so any time fits", () => {
  assert.equal(parseTourHours({}).ok, true);
  assert.deepEqual(tourFits({ startsAt: az("2026-10-07T03:00:00"), minutes: 30, hours: {}, timeZone: "America/Phoenix" }), { ok: true, reason: null });
  assert.equal(tourFits({ startsAt: az("2026-10-07T03:00:00"), minutes: 30, hours: null, timeZone: "America/Phoenix" }).ok, true);
});

test("fits: inside the hours, in the building's own time zone", () => {
  const f = (iso) => tourFits({ startsAt: az(iso), minutes: 30, hours: SEED, timeZone: "America/Phoenix" });
  assert.equal(f("2026-10-07T09:00:00").ok, true);          // Wednesday, the minute it opens
  assert.equal(f("2026-10-07T16:30:00").ok, true);          // ends exactly at 17:00
  assert.deepEqual(f("2026-10-07T16:31:00"), { ok: false, reason: "outside" });
  assert.deepEqual(f("2026-10-07T08:59:00"), { ok: false, reason: "outside" });
  assert.equal(f("2026-10-10T10:00:00").ok, true);          // Saturday
  assert.deepEqual(f("2026-10-10T16:00:00"), { ok: false, reason: "outside" });
  assert.deepEqual(f("2026-10-11T11:00:00"), { ok: false, reason: "closed" });   // Sunday
});

test("fits: the same instant is a different local time in another zone", () => {
  // 16:00 UTC on a Wednesday is 09:00 in Phoenix (UTC-7, no daylight saving) and
  // 12:00 in New York (EDT, UTC-4). This checks the conversion, not a building.
  const instant = "2026-10-07T16:00:00Z";
  assert.deepEqual(localParts(new Date(instant), "America/Phoenix"), { day: 3, minutes: 9 * 60 });
  assert.deepEqual(localParts(new Date(instant), "America/New_York"), { day: 3, minutes: 12 * 60 });
});

test("fits: a building whose own hours do not parse is refused, not waved through", () => {
  assert.deepEqual(tourFits({ startsAt: az("2026-10-07T10:00:00"), minutes: 30, hours: { mon: "late" }, timeZone: "America/Phoenix" }),
    { ok: false, reason: "bad_hours" });
});

test("summary: a line a renter can read", () => {
  assert.match(hoursSummary(SEED), /Mon 09:00-17:00/);
  assert.match(hoursSummary(SEED), /Sat 10:00-16:00/);
  assert.equal(hoursSummary({}), "");
});
