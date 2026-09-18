// Hole N3 — Ops Admin fires POST /api/messages-outbound on every page load. LOOK ONLY.
// Signs in as the owner through the real login page, opens /app/ops-admin.html,
// and records every request that is not a GET (method, path, body).
//
// Mode "block" (default): every non-GET except the one sign-in POST is BLOCKED
// and recorded. Two fresh loads. This is the hole check: after the fix the
// blocked list must be empty.
//
// Mode "baseline": same, except a POST /api/messages-outbound whose body is
// exactly {"action":"status"} is let through — that action only reads
// (outboxStatus + unemailedInvoices are SELECTs) — so the screenshot shows what
// the Outbound Mail panel says today. Any other body is still blocked.
//
// Never prints a password, token or cookie.
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n3-verify.mjs [block|baseline] [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.N3_BASE || "https://fundhub.ai";
const MODE = process.argv[2] || "block";
const TAG = process.argv[3] || MODE;
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/n3";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), base: BASE, mode: MODE, tag: TAG, loads: [] };
const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

let current = null; // the load being recorded
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  const path = new URL(req.url()).pathname;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") {
    if (current && path.startsWith("/api/")) current.gets.push(path);
    return route.continue();
  }
  if (m === "POST" && path === "/api/auth/login") return route.continue();
  let body = req.postData() || "";
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { parsed = null; }
  const rec = { method: m, path, body: parsed ?? (body ? "(non-JSON body)" : "") };
  const isStatusOnly = m === "POST" && path === "/api/messages-outbound" && parsed &&
    Object.keys(parsed).length === 1 && parsed.action === "status";
  if (MODE === "baseline" && isStatusOnly) {
    rec.let_through = true;
    if (current) current.non_get.push(rec);
    return route.continue();
  }
  rec.blocked = true;
  if (current) current.non_get.push(rec); else (out.pre_load_non_get ||= []).push(rec);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
out.login = { status: lr.status() };
await page.waitForTimeout(2500);
out.role = await page.evaluate(() => localStorage.getItem("fh_role"));
if (lr.status() !== 200) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

for (let i = 1; i <= 2; i++) {
  current = { load: i, non_get: [], gets: [] };
  await page.goto(`${BASE}/app/ops-admin.html?n3=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  current.panel = await page.evaluate(() => {
    const t = (id) => { const el = document.getElementById(id); return el ? el.innerText.trim() : null; };
    const vis = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).display !== "none" : null; };
    return {
      summary: t("outboxSummary"), detail: t("outboxDetail"), msg: t("outboxMsg"),
      send_visible: vis("outboxSend"), toggle_visible: vis("outboxToggle"),
      toggle_text: t("outboxToggle"), invoices_visible: vis("outboxInvoices"),
    };
  });
  const card = await page.$("#outboxCard");
  if (card) {
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${SHOTS}/${TAG}-load${i}-panel.png` });
  }
  await page.screenshot({ path: `${SHOTS}/${TAG}-load${i}-full.png`, fullPage: false });
  out.loads.push(current);
  current = null;
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
