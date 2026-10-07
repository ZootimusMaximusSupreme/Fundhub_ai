// The pulse's watch on the new-lead alert (W2, 2026-10-07).
// Every number and address below is a made-up test value.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkLeadAlerts, LEAD_ALERT_GRACE_MS, DAY_MS } from "./system-checks.mjs";
import { runDailyPulse } from "./daily-pulse.mjs";

const NOW = new Date("2026-10-07T13:00:00Z");
const BOTH = { LEAD_ALERT_SMS_TO: "+15555550100", LEAD_ALERT_EMAIL_TO: "owner@example.test" };

/* A database that answers the one read this check makes. */
function dbWith(row) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      return { rows: row ? [row] : [] };
    }
  };
}

test("no database: not checked, never a pass", async () => {
  const r = await checkLeadAlerts({ db: null, orgId: "org-1", now: NOW, env: BOTH });
  assert.equal(r.id, "lead-alerts");
  assert.equal(r.group, "messages");
  assert.equal(r.status, "skip");
});

test("settings set and every recent lead alerted: green with the count as proof", async () => {
  const r = await checkLeadAlerts({ db: dbWith({ expected: 4, no_sms: 0, no_email: 0 }), orgId: "org-1", now: NOW, env: BOTH });
  assert.equal(r.status, "PASS");
  assert.match(r.detail, /4 new lead\(s\) in the last 24 hours, all alerted by text and email/);
});

test("no leads yet and the settings set: green", async () => {
  const r = await checkLeadAlerts({ db: dbWith({ expected: 0, no_sms: 0, no_email: 0 }), orgId: "org-1", now: NOW, env: BOTH });
  assert.equal(r.status, "PASS");
});

test("a lead from the last 24 hours with no text or no email stamp is red, with both counts", async () => {
  const r = await checkLeadAlerts({ db: dbWith({ expected: 5, no_sms: 2, no_email: 1 }), orgId: "org-1", now: NOW, env: BOTH });
  assert.equal(r.status, "FAIL");
  assert.match(r.detail, /2 of 5 new lead\(s\) in the last 24 hours have no text alert and 1 have no email alert/);
  assert.match(r.suggestedFix, /Do not resend from this pulse/);
  assert.match(r.customerSees, /not being told right away/);
});

test("either setting unset is red, by name, even with no leads", async () => {
  const none = dbWith({ expected: 0, no_sms: 0, no_email: 0 });
  const both = await checkLeadAlerts({ db: none, orgId: "org-1", now: NOW, env: {} });
  assert.equal(both.status, "FAIL");
  assert.match(both.detail, /LEAD_ALERT_SMS_TO and LEAD_ALERT_EMAIL_TO have no usable value/);

  const smsOnly = await checkLeadAlerts({ db: none, orgId: "org-1", now: NOW, env: { LEAD_ALERT_EMAIL_TO: "owner@example.test" } });
  assert.equal(smsOnly.status, "FAIL");
  assert.match(smsOnly.detail, /LEAD_ALERT_SMS_TO has no usable value/);
  assert.doesNotMatch(smsOnly.detail, /LEAD_ALERT_EMAIL_TO/);
});

test("the morning-check number does not satisfy the setting", async () => {
  const r = await checkLeadAlerts({
    db: dbWith({ expected: 0, no_sms: 0, no_email: 0 }), orgId: "org-1", now: NOW,
    env: { PULSE_SMS_TO: "+15555550199", LEAD_ALERT_EMAIL_TO: "owner@example.test" }
  });
  assert.equal(r.status, "FAIL");
  assert.match(r.detail, /LEAD_ALERT_SMS_TO/);
});

test("the detail line never holds a number or an address", async () => {
  const bad = await checkLeadAlerts({ db: dbWith({ expected: 3, no_sms: 3, no_email: 3 }), orgId: "org-1", now: NOW, env: BOTH });
  const good = await checkLeadAlerts({ db: dbWith({ expected: 3, no_sms: 0, no_email: 0 }), orgId: "org-1", now: NOW, env: BOTH });
  for (const r of [bad, good]) {
    const blob = JSON.stringify(r);
    assert.ok(!blob.includes("5555550100"), blob);
    assert.ok(!blob.includes("owner@example.test"), blob);
  }
});

test("the read covers the last 24 hours less a 15 minute grace, and is bound to the company", async () => {
  const db = dbWith({ expected: 0, no_sms: 0, no_email: 0 });
  await checkLeadAlerts({ db, orgId: "org-1", now: NOW, env: BOTH });
  assert.equal(db.calls.length, 1, "one read, no writes");
  const [orgId, since, until, smsStamp, emailStamp] = db.calls[0].params;
  assert.equal(orgId, "org-1");
  assert.equal(new Date(since).getTime(), NOW.getTime() - DAY_MS);
  assert.equal(new Date(until).getTime(), NOW.getTime() - LEAD_ALERT_GRACE_MS);
  assert.equal(smsStamp, "lead_alert_sms_at");
  assert.equal(emailStamp, "lead_alert_email_at");
  assert.equal(LEAD_ALERT_GRACE_MS, 15 * 60 * 1000);
});

test("the read leaves out test files and synthetic clients, and only counts real lead-in events", async () => {
  const db = dbWith({ expected: 0, no_sms: 0, no_email: 0 });
  await checkLeadAlerts({ db, orgId: "org-1", now: NOW, env: BOTH });
  const sql = db.calls[0].sql;
  assert.match(sql, /c\.is_demo IS NOT TRUE/);
  assert.match(sql, /'synthetic'/);
  assert.match(sql, /e\.name IN \('entry\.captured', 'booking\.created'\)/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE)\b/i, "a check only reads");
});

test("the daily pulse runs the check and shows it on the scorecard", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
  const db = {
    async query(sql) {
      if (/lead_alert|c\.is_demo IS NOT TRUE/.test(String(sql)) || /count\(\*\)::int AS expected/.test(String(sql))) {
        return { rows: [{ expected: 2, no_sms: 1, no_email: 0 }] };
      }
      return { rows: [] };
    }
  };
  try {
    const result = await runDailyPulse({
      dryRun: true,
      now: NOW,
      fetchImpl: async () => ({ status: 200, text: async () => "" }),
      boardDir: tmp,
      db,
      orgId: "org-1",
      env: { ...BOTH },
      gateRelayDirs: null,
      recordRun: false,
      probesImpl: async () => []
    });
    const row = result.scorecard.checks.find((c) => c.id === "lead-alerts");
    assert.ok(row, "the lead-alerts check is on the scorecard");
    assert.equal(row.status, "red");
    assert.equal(row.group, "messages");
    assert.match(row.proof, /1 of 2 new lead\(s\)/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
