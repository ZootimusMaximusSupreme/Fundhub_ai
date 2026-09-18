import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadEnv } from "../load-env.mjs";
loadEnv();
import { db, close } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";
import { gmailConfigFromEnv, createGmailClientFromConfig, plainTextFromMessage } from "../../src/gmail/index.mjs";

const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const INQ = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const OUT = "/tmp/full-e2e-combo-inquiry-2026-09-18";
const SHOTS = `${OUT}/shots`;
mkdirSync(SHOTS, { recursive: true });

function clip(text, n = 2200) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

let token = existsSync(`${OUT}/session-token.txt`)
  ? readFileSync(`${OUT}/session-token.txt`, "utf8").trim()
  : "";
if (!token) {
  const staffRow = (await db.query(
    `SELECT id, org_id FROM staff WHERE lower(email) = lower('chris@fundhub.ai') LIMIT 1`
  )).rows[0];
  token = (await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id })).token;
  writeFileSync(`${OUT}/session-token.txt`, token);
}

const notes = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function visit(name, url, waitMs = 2500) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(waitMs);
  const rec = {
    name,
    url: page.url(),
    title: await page.title(),
    body: clip(await page.locator("body").innerText()),
  };
  await shot(name);
  notes.push(rec);
  console.log("WALK", name, rec.url, rec.body.slice(0, 180).replace(/\n/g, " "));
  return rec;
}

await visit("00-login", `${BASE}/app/pipeline.html`, 1800);
await visit("01-combo-ccp", `${BASE}/app/client-control-panel.html?id=${COMBO}`, 8000);
await visit("02-combo-present", `${BASE}/app/present.html?contact=${COMBO}`, 4000);
await visit("03-combo-portal", `${BASE}/app/client-portal.html?id=${COMBO}`, 5000);
await visit("04-combo-docs", `${BASE}/app/documents.html?client_id=${COMBO}`, 3000);
await visit("05-specialist-inq", `${BASE}/app/inquiry-remover.html`, 4000);

// Click Repair toggle if present
const repairToggle = page.getByRole("button", { name: /repair/i }).first();
const inqToggle = page.getByRole("button", { name: /inquir/i }).first();
let specialistClicks = {};
try {
  if (await repairToggle.count()) {
    await repairToggle.click();
    await page.waitForTimeout(2500);
    specialistClicks.repair = clip(await page.locator("body").innerText());
    await shot("06-specialist-repair");
  }
} catch (e) {
  specialistClicks.repair_error = String(e.message).slice(0, 200);
}
try {
  if (await inqToggle.count()) {
    await inqToggle.click();
    await page.waitForTimeout(2500);
    specialistClicks.inquiries = clip(await page.locator("body").innerText());
    await shot("07-specialist-inquiries-toggle");
  }
} catch (e) {
  specialistClicks.inquiries_error = String(e.message).slice(0, 200);
}
notes.push({ name: "06-specialist-toggles", specialistClicks: {
  repair: specialistClicks.repair?.slice(0, 1800),
  inquiries: specialistClicks.inquiries?.slice(0, 1800),
  repair_error: specialistClicks.repair_error,
  inquiries_error: specialistClicks.inquiries_error,
}});

await visit("08-t13-ccp", `${BASE}/app/client-control-panel.html?id=${INQ}`, 8000);
await visit("09-t13-portal", `${BASE}/app/client-portal.html?id=${INQ}`, 5000);
await visit("10-pipeline-fulfillment", `${BASE}/app/pipeline.html`, 2500);

// Fulfillment tab if present
try {
  const ful = page.getByText(/fulfillment/i).first();
  if (await ful.count()) {
    await ful.click();
    await page.waitForTimeout(2500);
    notes.push({ name: "11-fulfillment-tab", body: clip(await page.locator("body").innerText()) });
    await shot("11-fulfillment-tab");
  }
} catch (e) {
  notes.push({ name: "11-fulfillment-tab", error: String(e.message).slice(0, 200) });
}

// Inquiry portal upload attempt if a file input exists
const idPng = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/sim-documents/08/photo-id-1.png";
let upload = { attempted: false };
try {
  await page.goto(`${BASE}/app/client-portal.html?id=${INQ}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(4000);
  const inquiryWords = clip(await page.locator("body").innerText());
  upload.portal_has_inquiry = /inquiry/i.test(inquiryWords);
  upload.portal_has_ftc = /ftc|police report/i.test(inquiryWords);
  upload.portal_has_upload = /upload|send a file|send 1 file/i.test(inquiryWords);
  const fileInputs = page.locator("input[type=file]");
  const n = await fileInputs.count();
  upload.file_inputs = n;
  if (n > 0 && existsSync(idPng)) {
    upload.attempted = true;
    await fileInputs.first().setInputFiles(idPng);
    await page.waitForTimeout(800);
    const sendBtn = page.getByRole("button", { name: /send/i }).first();
    if (await sendBtn.count()) {
      await sendBtn.click();
      await page.waitForTimeout(4000);
      upload.after = clip(await page.locator("body").innerText());
    } else {
      upload.no_send_button = true;
    }
    await shot("12-t13-upload");
  }
  notes.push({ name: "12-t13-upload", upload: { ...upload, after: upload.after?.slice(0, 1200) } });
} catch (e) {
  notes.push({ name: "12-t13-upload", error: String(e.message).slice(0, 300) });
}

// Combo Present money / names
await visit("13-combo-closer", `${BASE}/app/closer-dashboard.html?id=${COMBO}`, 3000);

const api = {};
const req = context.request;
async function get(path, key) {
  const res = await req.get(BASE + path);
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { snippet: text.slice(0, 240) }; }
  api[key] = { status: res.status(), keys: json && typeof json === "object" ? Object.keys(json).slice(0, 30) : [], json };
}
await get(`/api/dashboard/client?id=${COMBO}`, "combo_dash");
await get(`/api/read/repair-cases?client_id=${COMBO}`, "combo_repair");
await get(`/api/read/inquiry-cases?client_id=${INQ}`, "t13_cases");
await get(`/api/read/inquiry-cases`, "inq_queue");
await get(`/api/read/agent-context?client_id=${COMBO}`, "combo_context");
await get(`/api/read/portal-summary?client_id=${COMBO}`, "combo_portal");
await get(`/api/read/portal-summary?client_id=${INQ}`, "t13_portal");
await get(`/api/read/documents?client_id=${COMBO}`, "combo_docs");
await get(`/api/read/documents?client_id=${INQ}`, "t13_docs");
await get(`/api/read/funding-rounds?client_id=${COMBO}`, "combo_rounds");

await browser.close();

function slimApi(entry) {
  if (!entry) return null;
  const j = entry.json || {};
  const out = { status: entry.status };
  if (j.client) out.client = { name: `${j.client.first_name || ""} ${j.client.last_name || ""}`.trim(), email: j.client.email, next: j.next_action || j.client.employee_next_action };
  if (j.next_action) out.next_action = j.next_action;
  if (j.blockers) out.blockers = j.blockers;
  if (Array.isArray(j.cases)) out.cases = j.cases.slice(0, 8).map((c) => ({ name: c.client_name, bureau: c.selected_bureaus_raw, status: c.case_status, open: c.open_inquiry_count }));
  if (Array.isArray(j.rows)) out.rows = j.rows.slice(0, 6);
  if (Array.isArray(j.items)) out.items = j.items.slice(0, 6);
  if (j.ok !== undefined) out.ok = j.ok;
  if (j.prompt) out.has_said = /said:/i.test(String(j.prompt || j.context || ""));
  if (j.context) out.context_keys = Object.keys(j.context).slice(0, 20);
  if (j.pack) out.pack_keys = Object.keys(j.pack).slice(0, 20);
  const blob = JSON.stringify(j);
  out.has_said = out.has_said || /said:/i.test(blob);
  out.combo_name = /Combo-20260918/i.test(blob);
  out.thirteen = /Thirteen-NoBook/i.test(blob);
  return out;
}

const apiSlim = {};
for (const [k, v] of Object.entries(api)) apiSlim[k] = slimApi(v);

let gmail = { ready: false };
try {
  const cfg = gmailConfigFromEnv(process.env);
  gmail.ready = !!cfg.ready;
  gmail.missing = cfg.missing;
  if (cfg.ready) {
    const client = createGmailClientFromConfig(cfg);
    const q = `in:anywhere (to:stanbridgejchris+sim-combo-20260918@gmail.com OR to:stanbridgejchris+sim-13@gmail.com) newer_than:2d`;
    const listed = await client.listMessages({ q, maxResults: 20 });
    const msgs = [];
    for (const m of listed.messages || []) {
      const full = await client.getMessage(m.id, { format: "metadata" });
      const headers = {};
      for (const h of full.payload?.headers || []) headers[h.name] = h.value;
      msgs.push({ id: m.id, subject: headers.Subject, from: headers.From, to: headers.To, date: headers.Date, snippet: full.snippet });
    }
    gmail.q = q;
    gmail.count = msgs.length;
    gmail.msgs = msgs;
  }
} catch (e) {
  gmail.error = String(e.message).slice(0, 400);
}

writeFileSync(`${OUT}/06-walk.json`, JSON.stringify({ at: new Date().toISOString(), notes, apiSlim, gmail }, null, 2));
console.log("GMAIL", JSON.stringify({ ready: gmail.ready, missing: gmail.missing, count: gmail.count, error: gmail.error, subjects: (gmail.msgs || []).map((m) => m.subject) }));
await close();
