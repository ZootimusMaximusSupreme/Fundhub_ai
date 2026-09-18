// Hole N3 — the NEW Ops Admin page, before ship, against REAL live data.
// Signs in as the owner on the live site, then swaps only /app/ops-admin.html
// and /app/data.js for this checkout's copies. Every other /api/ read still
// goes to the live server. Every non-GET request the PAGE makes is blocked and
// recorded (after the sign-in POST) — after the fix that list must be empty.
//
// The live server does not answer GET /api/messages-outbound until the fix
// ships (it answers 405). So that one GET is answered here with the live
// status, fetched once by this script (not by the page) with the read-only
// POST {action:"status"} — the exact call the old page made on every load.
// That call runs two SELECTs and sends nothing.
//
// Never prints a password, token or cookie.
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n3-local-render.mjs [tag]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_HTML = fs.readFileSync(path.join(ROOT, "public/app/ops-admin.html"), "utf8");
const DATA_JS = fs.readFileSync(path.join(ROOT, "public/app/data.js"), "utf8");
const BASE = "https://fundhub.ai";
const TAG = process.argv[2] || "local-new";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/n3";
fs.mkdirSync(SHOTS, { recursive: true });

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), tag: TAG, no_send: true, loads: [] };
let current = null;
let liveStatus = null;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  const u = new URL(req.url());
  if (m === "GET" && u.origin === BASE && u.pathname === "/app/ops-admin.html") {
    return route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
  }
  if (m === "GET" && u.origin === BASE && u.pathname === "/app/data.js") {
    return route.fulfill({ status: 200, contentType: "application/javascript", body: DATA_JS });
  }
  if (m === "GET" && u.origin === BASE && u.pathname === "/api/messages-outbound") {
    if (current) current.gets.push(`${u.pathname} (answered with live status)`);
    return route.fulfill({ status: liveStatus.status, contentType: "application/json", body: liveStatus.body });
  }
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") {
    if (current && u.pathname.startsWith("/api/")) current.gets.push(u.pathname);
    return route.continue();
  }
  if (m === "POST" && u.pathname === "/api/auth/login" && !current) return route.continue();
  const rec = { method: m, path: u.pathname, body: req.postData() || "", blocked: true };
  if (current) current.non_get.push(rec); else (out.pre_load_non_get ||= []).push(rec);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const lr = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
out.login = { status: (await lr).status() };
await page.waitForTimeout(2500);
const token = await page.evaluate(() => localStorage.getItem("fh_token"));

{
  const r = await ctx.request.post(`${BASE}/api/messages-outbound`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { action: "status" },
  });
  liveStatus = { status: r.status(), body: await r.text() };
  out.stand_in = { note: "one read-only POST {action:'status'} by this script, not the page", status: r.status() };
  // What the live server says to a GET today, before the fix ships.
  const g = await ctx.request.get(`${BASE}/api/messages-outbound`, { headers: { authorization: `Bearer ${token}` } });
  out.live_get_before_ship = g.status();
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
  out.loads.push(current);
  current = null;
}

fs.writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
