import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MORNING_BRIEF_LIVE,
  LINES,
  phoenixDateStamp,
  summarizeSystems,
  formatMorningText,
  loadMoney,
  money,
  EVENING_BRIEF_CRON,
  BRIEF_KINDS,
  GREETINGS,
  briefWindow,
  summarizeStoredSystems,
  buildMorningBrief,
  loadSuggestions,
  reportUrl
} from "./morning-brief.mjs";
import { textMorningBrief, last4 } from "../pulse/notify.mjs";
import { buildScorecard } from "../pulse/scorecard.mjs";
import { parseBriefDate, parseBriefKind } from "../../api/read/morning-brief.mjs";

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

test("morning systems reads MB2's scorecard as built: red with day count, customer_sees and fix; skip is not_checked", async () => {
  const card = buildScorecard({
    now: SIX_AM_AZ,
    checks: [
      { id: "health", status: "PASS", detail: "pending 0" },
      { id: "gate-relay", status: "skip", detail: "server" },
      { id: "login", status: "FAIL", detail: "HTTP 500", suggestedFix: "check the deploy", customerSees: "Staff cannot log in." }
    ],
    previous: { checks: [{ id: "login", status: "red", since: "2026-10-04" }] }
  });
  const db = { query: async (sql) => { if (/pulse_scorecards/.test(sql)) throw new Error("must not read the stored row"); return { rows: [] }; } };
  const brief = await buildMorningBrief(db, {
    orgId: "00000000-0000-0000-0000-000000000001", now: SIX_AM_AZ, env: { PLAID_ENV: "sandbox" },
    pulse: { checks: [], scorecard: card }, suggest: async () => ({ ok: true, suggestions: [] }), staffScope: (fn) => fn(db)
  });
  assert.equal(brief.systems.green, 1);
  assert.equal(brief.systems.not_checked, 1);
  assert.equal(brief.systems.red, 1);
  const red = brief.systems.reds[0];
  assert.equal(red.id, "login");
  assert.equal(red.day_count, 2);
  assert.equal(red.since, "2026-10-04");
  assert.equal(red.customer_sees, "Staff cannot log in.");
  assert.equal(red.fix, "check the deploy");
  assert.match(brief.text_body, /1 red: login \(day 2\)\./);
  assert.doesNotMatch(brief.text_body, /Nothing needs you/);
});

test("morning with no scorecard from the pulse reads today's stored one; none stored says so plainly", async () => {
  const seen = [];
  const db = { query: async (sql, params) => { seen.push({ sql, params }); return { rows: [] }; } };
  const brief = await buildMorningBrief(db, {
    orgId: "00000000-0000-0000-0000-000000000001", now: SIX_AM_AZ, env: { PLAID_ENV: "sandbox" },
    pulse: null, suggest: async () => ({ ok: true, suggestions: [] }), staffScope: (fn) => fn(db)
  });
  const stored = seen.find((q) => /FROM pulse_scorecards/.test(q.sql));
  assert.deepEqual(stored.params, ["00000000-0000-0000-0000-000000000001", "2026-10-05"]);
  assert.equal(brief.systems.status, "missing");
  assert.equal(brief.systems.line, LINES.systemsMissing);
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
  assert.match(text, /Ads and sales: could not be read\./);
  assert.match(text, /\n\nFull report: not saved$/);
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

/* ---------- evening brief (MB6) ---------- */

// 04:00 UTC on 2026-10-06 is 9:00 p.m. on Monday 2026-10-05 in Arizona.
const NINE_PM_AZ = new Date("2026-10-06T04:00:00Z");

test("evening cron is one constant and lands at 9:00 p.m. Arizona", () => {
  assert.equal(EVENING_BRIEF_CRON, "0 4 * * *");
  const [min, hour] = EVENING_BRIEF_CRON.split(" ").map(Number);
  const fire = new Date(Date.UTC(2026, 9, 6, hour, min));
  const az = new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit" }).format(fire);
  assert.equal(az.replace(/\s/g, " "), "9:00 PM");
  assert.equal(phoenixDateStamp(fire), "2026-10-05");
});

test("windows: morning is yesterday midnight to midnight; evening is since Arizona midnight", () => {
  const m = briefWindow("morning", SIX_AM_AZ);
  assert.equal(m.brief_date, "2026-10-05");
  assert.equal(m.label, "yesterday (2026-10-04)");
  assert.equal(m.to, "2026-10-05T07:00:00.000Z");
  assert.equal(m.from, "2026-10-04T07:00:00.000Z");
  assert.equal(m.day, "2026-10-04");

  const e = briefWindow("evening", NINE_PM_AZ);
  assert.equal(e.brief_date, "2026-10-05");
  assert.equal(e.label, "today so far");
  assert.equal(e.from, "2026-10-05T07:00:00.000Z"); // midnight Arizona
  assert.equal(e.to, "2026-10-06T04:00:00.000Z");
  assert.equal(e.day, "2026-10-05");

  assert.throws(() => briefWindow("noon", NINE_PM_AZ), /morning or evening/);
});

test("the evening text starts Good evening, Chris. and says plainly when no morning check is stored", () => {
  const text = formatMorningText({
    kind: "evening",
    now: NINE_PM_AZ,
    systems: summarizeStoredSystems(null),
    money: { line: LINES.moneyNotConnected },
    team: { line: "Team, today so far: 0 calls held, 0 no-shows. Last 24 hours: files funded unknown." }
  });
  assert.ok(text.startsWith("Good evening, Chris. Monday, October 5."));
  assert.match(text, /no morning check is stored for today/);
  assert.match(text, /today so far/);
  assert.equal(GREETINGS.morning, "Good morning, Chris.");
  assert.throws(() => formatMorningText({ kind: "afternoon" }), /morning or evening/);
});

test("evening systems reads the stored morning check and names its time", () => {
  const s = summarizeStoredSystems({
    ran_at: "2026-10-05T13:00:00.000Z",
    checks: [{ id: "health", status: "green", proof: "ok" }, { id: "login", status: "red", proof: "HTTP 500" }]
  });
  assert.equal(s.source, "stored_morning_check");
  assert.match(s.line.replace(/\s/g, " "), /^Systems, from this morning's check at 6:00 AM: 1 of 2 checks green\. 1 red: login\./);
  assert.equal(summarizeStoredSystems(null).source, "none_stored_today");
});

test("evening build reads this morning's stored check, never a pulse, and counts the team since midnight", async () => {
  const seen = [];
  const db = {
    query: async (sql, params) => {
      seen.push({ sql, params });
      if (/FROM pulse_scorecards/.test(sql)) {
        return { rows: [{ date: "2026-10-05", ran_at: new Date("2026-10-05T13:00:00Z"), checks: [{ id: "health", group: "backend", status: "green", proof: "ok" }] }] };
      }
      return { rows: [] };
    }
  };
  const brief = await buildMorningBrief(db, {
    orgId: "00000000-0000-0000-0000-000000000001",
    kind: "evening",
    now: NINE_PM_AZ,
    env: { PLAID_ENV: "sandbox" },
    pulse: { checks: [{ id: "login", status: "FAIL", detail: "must be ignored" }] },
    suggest: async () => ({ ok: true, suggestions: [] }),
    staffScope: (fn) => fn(db)
  });
  assert.equal(brief.kind, "evening");
  assert.equal(brief.brief_date, "2026-10-05");
  assert.ok(brief.text_body.startsWith("Good evening, Chris. Monday, October 5."));
  assert.match(brief.text_body.replace(/\s/g, " "), /Systems, from this morning's check at 6:00 AM: 1 of 1 checks green\. Nothing needs you\./);
  assert.doesNotMatch(brief.text_body, /login/);
  const stored = seen.find((q) => /FROM pulse_scorecards/.test(q.sql));
  assert.match(stored.sql, /scorecard_date = \$2::date/);
  assert.deepEqual(stored.params.slice(1), ["2026-10-05"]);
  assert.equal(brief.systems.source, "stored_morning_check");
  assert.equal(brief.report_url, "https://fundhub.ai/app/morning-brief.html?date=2026-10-05&kind=evening");
  assert.ok(brief.text_body.endsWith("\n\nFull report: https://fundhub.ai/app/morning-brief.html?date=2026-10-05&kind=evening"));
  const closers = seen.find((q) => /GROUP BY o.staff_id, s.name/.test(q.sql));
  assert.equal(closers.params[1], "2026-10-05T07:00:00.000Z");
  assert.equal(closers.params[2], "2026-10-06T04:00:00.000Z");
  const spend = seen.find((q) => /FROM ad_metrics_daily/.test(q.sql));
  assert.equal(spend.params[1], "2026-10-05");
  assert.match(brief.marketing.spend_line, /^Ad spend today so far \(2026-10-05\)/);
});

/* ---------- suggestions slot (MB4's buildSuggestions) ---------- */

const quietErr = async (fn) => {
  const orig = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = orig; }
};

test("suggestions: top 3 in the report, 1 in the text, biggest first as MB4 ranked them", async () => {
  const seen = [];
  const items = [
    { rule: "fix_broken", headline: "Fix the broken thing.", write_up: "Fix the broken thing first. It cost $1,200 this week." },
    { rule: "raise_spend_ramp", headline: "Raise spend." },
    { rule: "page_change_weekly", headline: "Change page A." },
    { rule: "page_change_weekly", headline: "Change page B." }
  ];
  const s = await loadSuggestions({}, {
    orgId: "o", briefDate: "2026-10-05", env: {},
    suggest: async (args) => { seen.push(args); return { ok: true, suggestions: items }; }
  });
  assert.equal(seen[0].date, "2026-10-05");
  assert.equal(seen[0].orgId, "o");
  assert.equal(s.items.length, 3);
  assert.equal(s.line, "Suggestion: Fix the broken thing first. It cost $1,200 this week. (2 more in the report.)");

  const one = await loadSuggestions({}, { orgId: "o", briefDate: "2026-10-05", suggest: async () => ({ ok: true, suggestions: [{ headline: "Raise spend." }] }) });
  assert.equal(one.line, "Suggestion: Raise spend.");

  const none = await loadSuggestions({}, { orgId: "o", briefDate: "2026-10-05", suggest: async () => ({ ok: true, suggestions: [] }) });
  assert.equal(none.line, "Suggestions: none today.");
  assert.deepEqual(none.items, []);
});

test("a failed buildSuggestions never stops the brief: it says none today", async () => {
  const thrown = await quietErr(() => loadSuggestions({}, { orgId: "o", briefDate: "2026-10-05", suggest: async () => { throw new Error("db gone"); } }));
  assert.equal(thrown.status, "error");
  assert.equal(thrown.line, "Suggestions: none today.");
  const refused = await quietErr(() => loadSuggestions({}, { orgId: "o", briefDate: "2026-10-05", suggest: async () => ({ ok: false, reason: "org_id_required" }) }));
  assert.equal(refused.line, "Suggestions: none today.");

  const db = { query: async () => ({ rows: [] }) };
  const brief = await quietErr(() => buildMorningBrief(db, {
    orgId: "00000000-0000-0000-0000-000000000001", now: SIX_AM_AZ, env: { PLAID_ENV: "sandbox" },
    pulse: { checks: [] }, suggest: async () => { throw new Error("boom"); }, staffScope: (fn) => fn(db)
  }));
  assert.ok(brief.text_body.startsWith("Good morning, Chris."));
  assert.match(brief.text_body, /Suggestions: none today\./);
  assert.deepEqual(brief.suggestions, []);
});

test("read endpoint kind: default morning, evening allowed, anything else refused", () => {
  assert.equal(parseBriefKind(undefined), "morning");
  assert.equal(parseBriefKind(""), "morning");
  assert.equal(parseBriefKind("evening"), "evening");
  assert.equal(parseBriefKind("morning"), "morning");
  assert.equal(parseBriefKind("night"), null);
  assert.equal(parseBriefKind("evening'; drop"), null);
  assert.deepEqual([...BRIEF_KINDS], ["morning", "evening"]);
});

test("the report link points at the MB5 page for that Arizona day; evening carries kind=evening", () => {
  assert.equal(reportUrl("2026-10-05", {}), "https://fundhub.ai/app/morning-brief.html?date=2026-10-05");
  assert.equal(reportUrl("2026-10-05", { APP_BASE_URL: "https://example.test/" }),
    "https://example.test/app/morning-brief.html?date=2026-10-05");
  assert.equal(reportUrl("2026-10-05", {}, "evening"), "https://fundhub.ai/app/morning-brief.html?date=2026-10-05&kind=evening");
});

test("both texts end with the Full report link", async () => {
  const db = { query: async () => ({ rows: [] }) };
  for (const [kind, now] of [["morning", SIX_AM_AZ], ["evening", NINE_PM_AZ]]) {
    const b = await buildMorningBrief(db, {
      orgId: "00000000-0000-0000-0000-000000000001", kind, now, env: { PLAID_ENV: "sandbox" },
      suggest: async () => ({ ok: true, suggestions: [] }), staffScope: (fn) => fn(db)
    });
    const last = b.text_body.split("\n").pop();
    assert.equal(last, `Full report: ${b.report_url}`);
  }
});
