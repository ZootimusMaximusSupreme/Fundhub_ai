import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PULSE_CRON, handle } from "./daily-pulse.mjs";

test("Inngest cron is 0 13 * * * (7:00 a.m. Denver daylight time)", () => {
  assert.equal(PULSE_CRON, "0 13 * * *");
});

test("handle is audit-only — dry-run writes findings and does not send", async () => {
  const sends = [];
  const step = {
    run: async (_name, fn) => fn()
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-wf-"));
  const out = await handle({
    db: null,
    step,
    env: {},
    dryRun: true,
    boardDir: tmp,
    fetchImpl: async (url) => {
      const pathOnly = String(url).replace(/^https?:\/\/[^/]+/, "");
      const pages = {
        "/api/health?strict=1": { status: 200, text: "{}" },
        "/login.html": { status: 200, text: "Sign in password" },
        "/app/client-control-panel.html": { status: 200, text: "Generate Apps Apply door" },
        "/api/read/underwrite": { status: 401, text: "{}" }
      };
      const hit = pages[pathOnly];
      if (hit) return { status: hit.status, text: async () => hit.text };
      if (pathOnly.startsWith("/api/")) return { status: 401, text: async () => "{}" };
      if (pathOnly.endsWith(".html")) return { status: 200, text: async () => "<html>" };
      return { status: 404, text: async () => "" };
    },
    sendSms: async (msg) => {
      sends.push(msg);
      return { status: "sent" };
    },
    sendWhatsApp: async (msg) => {
      sends.push(msg);
      return { status: "sent" };
    }
  });
  assert.equal(out.autoFix, false);
  assert.equal(out.dryRun, true);
  assert.equal(sends.length, 0);
  assert.ok(Array.isArray(out.findings));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("the morning brief runs as step 2, after the pulse, from the pulse's result", async () => {
  const order = [];
  const step = { run: async (name, fn) => { order.push(name); return fn(); } };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-wf-"));
  const seen = [];
  const fakeDb = { query: async () => ({ rows: [] }) };
  const out = await handle({
    db: fakeDb,
    step,
    env: {},
    dryRun: true,
    boardDir: tmp,
    gateRelayDirs: null,
    fetchImpl: async () => ({ status: 200, text: async () => "Sign in password Generate Apps Apply door" }),
    sendSms: async () => { throw new Error("must not send"); },
    sendWhatsApp: async () => { throw new Error("must not send"); },
    morningBrief: async (args) => { seen.push(args); return { ok: true }; }
  });
  assert.deepEqual(order, ["run-pulse", "morning-brief"]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].pulse, out);
  assert.equal(out.autoFix, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* Owner-set 2026-10-05: once the brief is live it REPLACES the pulse text.
   One text, not two. While it is not live, the old text still goes. */
async function liveRun({ briefLive }) {
  const chrisTexts = [];
  const whatsapps = [];
  const briefs = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-wf-"));
  const out = await handle({
    db: { query: async () => ({ rows: [] }) },
    step: { run: async (_name, fn) => fn() },
    env: { PULSE_SMS_TO: "+14805550199" },
    dryRun: false,
    boardDir: tmp,
    gateRelayDirs: null,
    fetchImpl: async () => ({ status: 200, text: async () => "Sign in password" }),
    sendSms: async (m) => { chrisTexts.push(m); return { status: "sent" }; },
    sendWhatsApp: async (m) => { whatsapps.push(m); return { status: "sent" }; },
    morningBrief: async (args) => { briefs.push(args); return { ok: true }; },
    briefLive
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { out, chrisTexts, briefs };
}

test("brief not live (today): the old pulse text still goes, and the brief is dry-run", async () => {
  const { out, chrisTexts, briefs } = await liveRun({ briefLive: false });
  assert.equal(chrisTexts.length, 1);
  assert.match(chrisTexts[0].body, /morning check/i);
  assert.equal(out.sms.sent, true);
  assert.equal(briefs[0].live, false);
  assert.equal(briefs[0].kind, "morning");
});

test("brief live: the pulse still runs and stores, but sends no text of its own", async () => {
  const { out, chrisTexts, briefs } = await liveRun({ briefLive: true });
  assert.equal(chrisTexts.length, 0, "one text, not two — the brief replaces the pulse text");
  assert.equal(out.sms.sent, false);
  assert.equal(out.sms.reason, "replaced_by_morning_brief");
  assert.ok(Array.isArray(out.checks) && out.checks.length > 0, "the audit still ran");
  assert.equal(briefs.length, 1);
  assert.equal(briefs[0].live, true);
  assert.equal(briefs[0].pulse, out);
});

test("a failed morning brief never hides the pulse result", async () => {
  const step = { run: async (_name, fn) => fn() };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-wf-"));
  const out = await handle({
    db: { query: async () => ({ rows: [] }) },
    step,
    env: {},
    dryRun: true,
    boardDir: tmp,
    fetchImpl: async () => ({ status: 200, text: async () => "" }),
    morningBrief: async () => { throw new Error("boom"); }
  });
  assert.ok(Array.isArray(out.checks));
  fs.rmSync(tmp, { recursive: true, force: true });
});
