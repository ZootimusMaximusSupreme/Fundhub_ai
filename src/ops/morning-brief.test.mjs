import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MORNING_BRIEF_LIVE,
  LINES,
  phoenixDateStamp,
  scorecardFromPulse,
  summarizeSystems,
  formatMorningText,
  loadMoney,
  money,
  reportUrl
} from "./morning-brief.mjs";
import { textMorningBrief, last4 } from "../pulse/notify.mjs";
import { parseBriefDate } from "../../api/read/morning-brief.mjs";

// 13:00 UTC on 2026-10-05 is 6:00 a.m. Arizona.
const SIX_AM_AZ = new Date("2026-10-05T13:00:00Z");

test("the brief stays dry-run until Chris says otherwise", () => {
  assert.equal(MORNING_BRIEF_LIVE, false);
});

test("Arizona date: 6:00 a.m. and just before midnight stay on the right day", () => {
  assert.equal(phoenixDateStamp(SIX_AM_AZ), "2026-10-05");
  // 06:30 UTC on the 6th is 11:30 p.m. on the 5th in Arizona.
  assert.equal(phoenixDateStamp(new Date("2026-10-06T06:30:00Z")), "2026-10-05");
});

test("pulse result maps to the scorecard contract; skip is not_checked, never green", () => {
  const card = scorecardFromPulse({
    checks: [
      { id: "health", status: "PASS", detail: "pending 0" },
      { id: "gate-relay", status: "skip", detail: "server" },
      { id: "login", status: "FAIL", detail: "HTTP 500", suggestedFix: "check the deploy" },
      { id: "reg:read/inbox", kind: "registry", path: "/api/read/inbox", status: "up", detail: "HTTP 401" },
      { id: "reg:app/x.html", kind: "registry", path: "/app/x.html", status: "down", detail: "HTTP 404" },
      { id: "recon", status: "PASS", detail: "" }
    ]
  }, { now: SIX_AM_AZ });
  assert.equal(card.date, "2026-10-05");
  const by = Object.fromEntries(card.checks.map((c) => [c.id, c]));
  assert.equal(by.health.status, "green");
  assert.equal(by.health.group, "backend");
  assert.equal(by["gate-relay"].status, "not_checked");
  assert.equal(by["gate-relay"].group, "mac");
  assert.equal(by.login.status, "red");
  assert.equal(by.login.fix, "check the deploy");
  assert.equal(by.login.customer_sees, null);
  assert.equal(by["reg:read/inbox"].group, "backend");
  assert.equal(by["reg:app/x.html"].group, "front_doors");
  assert.equal(by["reg:app/x.html"].status, "red");
  // A pass with no proof is not green.
  assert.equal(by.recon.status, "not_checked");
});

test("systems headline never says nothing needs you while something is not checked", () => {
  const s = summarizeSystems({ checks: [
    { id: "a", status: "green", proof: "x" },
    { id: "b", status: "not_checked", proof: null }
  ] });
  assert.equal(s.green, 1);
  assert.equal(s.not_checked, 1);
  assert.match(s.line, /1 of 2 checks green/);
  assert.match(s.line, /1 not checked/);
  assert.doesNotMatch(s.line, /Nothing needs you/);

  const all = summarizeSystems({ checks: [{ id: "a", status: "green", proof: "x" }] });
  assert.match(all.line, /Nothing needs you/);

  const red = summarizeSystems({ checks: [{ id: "login", status: "red", proof: "HTTP 500", day_count: 2 }] });
  assert.match(red.line, /1 red: login \(day 2\)/);

  assert.equal(summarizeSystems(null).line, LINES.systemsMissing);
});

test("the text starts Good morning, Chris. and prints waiting lines, not numbers, when a source is missing", () => {
  const text = formatMorningText({
    now: SIX_AM_AZ,
    systems: summarizeSystems(null),
    marketing: null,
    money: { line: LINES.moneyNotConnected },
    team: { line: "Team, last 24 hours: 0 calls held, 0 no-shows, files funded unknown.", company_8: null }
  });
  assert.ok(text.startsWith("Good morning, Chris. Monday, October 5."));
  assert.match(text, /Money: not connected yet\./);
  assert.match(text, /cash collected unknown/);
  assert.match(text, /waiting on the marketing numbers/);
});

test("money is whole cents in, dollars out", () => {
  assert.equal(money(123456), "$1,234.56");
  assert.equal(money(5), "$0.05");
  assert.equal(money(null), "unknown");
});

test("money says not connected yet unless Plaid is production with a live link", async () => {
  let queried = false;
  const db = { query: async () => { queried = true; return { rows: [{ n: 0 }] }; } };
  const sandbox = await loadMoney(db, { orgId: "o", briefDate: "2026-10-05", env: { PLAID_ENV: "sandbox" } });
  assert.equal(sandbox.status, "not_connected");
  assert.equal(sandbox.line, "Money: not connected yet.");
  assert.equal(queried, false);
  const noLink = await loadMoney(db, { orgId: "o", briefDate: "2026-10-05", env: { PLAID_ENV: "production" } });
  assert.equal(noLink.status, "not_connected");
});

test("textMorningBrief: dry-run sends nothing and keeps only the last 4 digits", async () => {
  const sends = [];
  const sendImpl = async (m) => { sends.push(m); return { status: "sent", providerMessageId: "SM1" }; };
  const dry = await textMorningBrief({ body: "Good morning, Chris.", env: { PULSE_SMS_TO: "(480) 555-0199" }, dryRun: true, sendImpl });
  assert.equal(dry.delivery_status, "dry_run");
  assert.equal(dry.sent_to_last4, "0199");
  assert.equal(sends.length, 0);
  assert.ok(!JSON.stringify(dry).includes("4805550199"));

  const none = await textMorningBrief({ body: "x", env: {}, dryRun: false, sendImpl });
  assert.equal(none.delivery_status, "no_number");
  assert.equal(sends.length, 0);

  const live = await textMorningBrief({ body: "x", env: { PULSE_SMS_TO: "+14805550199" }, dryRun: false, sendImpl });
  assert.equal(live.delivery_status, "sent");
  assert.equal(live.provider_message_id, "SM1");
  assert.equal(sends[0].to, "+14805550199");
  assert.equal(last4("+1 480 555 0199"), "0199");
});

test("read endpoint date: default Arizona today, refuses bad and impossible dates", () => {
  assert.equal(parseBriefDate(undefined, SIX_AM_AZ), "2026-10-05");
  assert.equal(parseBriefDate("2026-10-04"), "2026-10-04");
  assert.equal(parseBriefDate("2026-02-30"), null);
  assert.equal(parseBriefDate("10/05/2026"), null);
  assert.equal(parseBriefDate("2026-10-05'; drop"), null);
});

test("the report link points at the MB5 page for that Arizona morning", () => {
  assert.equal(reportUrl("2026-10-05", {}), "https://fundhub.ai/app/morning-brief.html?date=2026-10-05");
  assert.equal(reportUrl("2026-10-05", { APP_BASE_URL: "https://example.test/" }),
    "https://example.test/app/morning-brief.html?date=2026-10-05");
});
