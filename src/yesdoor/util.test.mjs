import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, ceilDiv, dollars, isoDate, num, toDate, wholeDaysBetween, yearsBack } from "./util.mjs";

test("toDate accepts dates, strings and numbers and rejects junk", () => {
  assert.equal(toDate("2026-10-07").toISOString(), "2026-10-07T00:00:00.000Z");
  assert.equal(toDate(new Date("2026-01-01")).getTime(), new Date("2026-01-01").getTime());
  assert.equal(toDate(0).getTime(), 0);
  for (const bad of [null, undefined, "", "not a date", new Date("x")]) assert.equal(toDate(bad), null);
});

test("addMonths clamps to the end of a short month and crosses years", () => {
  assert.equal(isoDate(addMonths("2026-01-31", 1)), "2026-02-28");
  assert.equal(isoDate(addMonths("2028-01-31", 1)), "2028-02-29");
  assert.equal(isoDate(addMonths("2026-10-07", 6)), "2027-04-07");
  assert.equal(isoDate(addMonths("2026-03-15", -5)), "2025-10-15");
});

test("yearsBack and wholeDaysBetween", () => {
  assert.equal(isoDate(yearsBack("2026-10-07", 7)), "2019-10-07");
  assert.equal(isoDate(yearsBack("2026-10-07", 0.5)), "2026-04-07");
  assert.equal(wholeDaysBetween("2026-01-01", "2026-01-31"), 30);
  assert.equal(wholeDaysBetween("2026-01-31", "2026-01-01"), -30);
  assert.equal(isoDate(addDays("2026-10-07", 90)), "2027-01-05");
});

test("ceilDiv is exact on integers", () => {
  assert.equal(ceilDiv(10, 5), 2);
  assert.equal(ceilDiv(11, 5), 3);
  assert.equal(ceilDiv(0, 5), 0);
});

test("num turns numeric strings into numbers and everything else into null", () => {
  assert.equal(num("3.5"), 3.5);
  assert.equal(num(0), 0);
  for (const bad of [null, undefined, "", "abc", NaN, Infinity]) assert.equal(num(bad), null);
});

test("dollars formats cents", () => {
  assert.equal(dollars(155000), "$1,550");
  assert.equal(dollars(155050), "$1,550.50");
  assert.equal(dollars(5), "$0.05");
  assert.equal(dollars(123456789), "$1,234,567.89");
  assert.equal(dollars(-250000), "-$2,500");
});
