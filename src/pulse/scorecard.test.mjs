// Scorecard contract rules — no database needed (MB2, 2026-10-05).

import { test } from "node:test";
import assert from "node:assert/strict";

import { toContractCheck, applyRepeats, buildScorecard, countChecks, phoenixDate } from "./scorecard.mjs";

test("the scorecard date is Arizona time, per the board contract", () => {
  // 06:30 UTC is still the previous evening in Phoenix (UTC-7, no daylight time).
  assert.equal(phoenixDate(new Date("2026-10-05T06:30:00Z")), "2026-10-04");
  assert.equal(phoenixDate(new Date("2026-10-05T13:00:00Z")), "2026-10-05");
});

test("green needs proof; a pass with no proof is not counted", () => {
  assert.deepEqual(toContractCheck({ id: "a", status: "PASS", detail: "200 at 6:00" }),
    { id: "a", group: "backend", status: "green", proof: "200 at 6:00" });
  const bare = toContractCheck({ id: "b", status: "PASS", detail: "" });
  assert.equal(bare.status, "not_checked");
});

test("a skip is not_checked with its reason, never green", () => {
  const c = toContractCheck({ id: "gmail", group: "outside", status: "skip", detail: "Gmail oauth is not set" });
  assert.equal(c.status, "not_checked");
  assert.equal(c.reason, "Gmail oauth is not set");
  assert.equal(c.proof, undefined);
});

test("a red carries what a customer sees and the fix", () => {
  const c = toContractCheck({
    id: "msg-queue-sms", group: "messages", status: "FAIL", detail: "oldest 45 min",
    suggestedFix: "read last_error", customerSees: "texts are late"
  });
  assert.equal(c.status, "red");
  assert.equal(c.customer_sees, "texts are late");
  assert.equal(c.fix, "read last_error");
  const reg = toContractCheck({ id: "reg:x", kind: "registry", path: "/app/x.html", status: "down", detail: "503" });
  assert.equal(reg.group, "front_doors");
  assert.match(reg.customer_sees, /\/app\/x\.html/);
});

test("the same red on a second morning says day 2, and keeps its first morning", () => {
  const today = [{ id: "a", group: "jobs", status: "red", proof: "late" }, { id: "b", group: "jobs", status: "red", proof: "late" }];
  const previous = { date: "2026-10-04", checks: [{ id: "a", status: "red", since: "2026-10-04", day_count: 1 }] };
  const out = applyRepeats(today, { date: "2026-10-05", previous });
  assert.equal(out[0].since, "2026-10-04");
  assert.equal(out[0].day_count, 2);
  assert.equal(out[1].since, "2026-10-05");
  assert.equal(out[1].day_count, 1);
});

test("a red that went green and came back starts again at day 1", () => {
  const previous = { checks: [{ id: "a", status: "green", proof: "ok" }] };
  const [c] = applyRepeats([{ id: "a", status: "red" }], { date: "2026-10-05", previous });
  assert.equal(c.day_count, 1);
});

test("counts are the three words, and the headline cannot hide a not-checked", () => {
  const card = buildScorecard({
    now: new Date("2026-10-05T13:00:00Z"),
    checks: [
      { id: "a", status: "PASS", detail: "ok" },
      { id: "b", status: "skip", detail: "no key" },
      { id: "c", status: "FAIL", detail: "bad" }
    ]
  });
  assert.equal(card.date, "2026-10-05");
  assert.deepEqual(countChecks(card.checks), { green: 1, red: 1, not_checked: 1 });
});
