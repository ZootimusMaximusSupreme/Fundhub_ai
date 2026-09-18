#!/usr/bin/env node
// Follow-up prove only: messages table, Twilio list, bureau door upload, no second Stage.
import { loadEnv } from "../load-env.mjs";
loadEnv();
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { db, close } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const PACK = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/sim-documents/09";
const OUT = "/tmp/full-e2e-repair-2026-09-18";
mkdirSync(OUT, { recursive: true });
const ev = {};

const msgCols = (await db.query(
  `SELECT column_name FROM information_schema.columns
    WHERE table_name = 'messages' ORDER BY ordinal_position`
)).rows.map((r) => r.column_name);
ev.message_columns = msgCols;

const select = ["channel", "status", "template_key", "to_address", "created_at"]
  .filter((c) => msgCols.includes(c));
if (msgCols.includes("provider")) select.push("provider");
if (msgCols.includes("provider_message_id")) select.push("provider_message_id");
if (msgCols.includes("last_error")) select.push("last_error");
if (msgCols.includes("subject")) select.push("subject");

ev.messages = (await db.query(
  `SELECT ${select.join(", ")} FROM messages WHERE client_id = $1
    ORDER BY created_at DESC LIMIT 40`,
  [NINE]
)).rows;

ev.messages_recent = (await db.query(
  `SELECT ${select.join(", ")} FROM messages
    WHERE client_id = $1 AND created_at >= '2026-09-18T08:50:00Z'
    ORDER BY created_at DESC`,
  [NINE]
)).rows;

ev.runs_tonight = (await db.query(
  `SELECT agent_code, outcome, created_at FROM agent_runs
    WHERE client_id = $1 AND created_at >= '2026-09-18T08:50:00Z'
    ORDER BY created_at DESC`,
  [NINE]
)).rows;

ev.tasks_tonight = (await db.query(
  `SELECT title, created_at FROM tasks
    WHERE client_id = $1 AND created_at >= '2026-09-18T08:50:00Z'
    ORDER BY created_at DESC`,
  [NINE]
)).rows;

const sid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SEND_ACCOUNT_SID || "";
const tok = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_SEND_AUTH_TOKEN || "";
if (sid && tok && sid.length > 20) {
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`);
  url.searchParams.set("To", "+16616054248");
  url.searchParams.set("PageSize", "20");
  url.searchParams.set("DateSent>", "2026-09-17");
  const res = await fetch(url, {
    headers: { authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64") }
  });
  const body = await res.json().catch(() => ({}));
  ev.twilio = {
    status: res.status,
    count: Array.isArray(body.messages) ? body.messages.length : null,
    error: body.message || body.code || null,
    rows: (body.messages || []).slice(0, 10).map((m) => ({
      date: m.date_sent || m.date_created,
      status: m.status,
      to: m.to,
      from: m.from,
      body: String(m.body || "").slice(0, 80)
    }))
  };
} else {
  ev.twilio = { skipped: "sid/token look like placeholders (len<=20)" };
}

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }
]);
const page = await ctx.newPage();
await page.goto(`${BASE}/app/client-portal.html?id=${NINE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(3500);
const bureauVisible = await page.evaluate(() => !document.body.classList.contains("no-bureau-door"));
ev.bureau_door_visible = bureauVisible;
if (bureauVisible) {
  const door = page.locator(".upload-door.door-bureau");
  await door.locator("[data-subtype]").selectOption("bureau_letter");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15_000 }),
    door.locator("[data-upload-btn]").click()
  ]);
  await chooser.setFiles(`${PACK}/bureau-letter-2.png`);
  await page.waitForTimeout(400);
  const btn = door.locator("[data-upload-btn]");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/documents-upload") && r.request().method() === "POST", { timeout: 60_000 }),
    btn.click()
  ]);
  let body; try { body = await resp.json(); } catch { body = { text: await resp.text() }; }
  ev.bureau_upload = {
    http: resp.status(),
    ok: !!(body && body.ok),
    button: (await btn.innerText()).trim(),
    id: body?.documents?.[0]?.id || null,
    kind: body?.documents?.[0]?.kind || null
  };
  await page.screenshot({ path: `${OUT}/upload-bureau-blurry.png`, fullPage: true });
} else {
  ev.bureau_upload = { skipped: "door not visible" };
}
await browser.close();

await new Promise((r) => setTimeout(r, 8000));
ev.runs_after_bureau = (await db.query(
  `SELECT agent_code, outcome, created_at FROM agent_runs
    WHERE client_id = $1 AND created_at >= '2026-09-18T08:50:00Z'
    ORDER BY created_at DESC LIMIT 8`,
  [NINE]
)).rows;
ev.messages_after_bureau = (await db.query(
  `SELECT ${select.join(", ")} FROM messages
    WHERE client_id = $1 AND created_at >= '2026-09-18T08:50:00Z'
    ORDER BY created_at DESC`,
  [NINE]
)).rows;

writeFileSync(`${OUT}/prove-followup.json`, JSON.stringify(ev, null, 2));
console.log(JSON.stringify({
  message_n: ev.messages.length,
  recent_n: ev.messages_recent.length,
  twilio: ev.twilio && { status: ev.twilio.status, count: ev.twilio.count, skipped: ev.twilio.skipped, error: ev.twilio.error },
  bureau: ev.bureau_upload,
  runs_tonight: ev.runs_tonight.length,
  tasks_tonight: ev.tasks_tonight.map((t) => t.title)
}, null, 2));
await close().catch(() => {});
