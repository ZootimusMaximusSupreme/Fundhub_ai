// HOLE N12 — LOOK ONLY. Dump every label/value pair the control panel paints
// for #13 (tiles, kv rows, System Facts rows), collapsed groups included, so
// every figure that comes off the sample report can be named. Non-GET aborted.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n12-dump.mjs
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const ID = process.env.ID || "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n12-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("login failed", r.status); process.exit(1); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 2000 } });
await context.addCookies([{ name: "fundhub_session", value: m[1], domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }]);
await context.route("**/*", (route) => (["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort()));
const page = await context.newPage();
await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => { const t = (document.getElementById("ccp-inquiries")?.textContent || "").trim(); return t && t !== "—"; }, null, { timeout: 45000 });
await page.waitForTimeout(3000);
const rows = await page.evaluate(() => {
  const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");
  const out = [];
  document.querySelectorAll(".rf-tile").forEach((t) => out.push(["tile", clean(t.querySelector(".rf-label")?.textContent), clean(t.querySelector(".rf-num")?.textContent), t.querySelector(".rf-num")?.id]));
  document.querySelectorAll(".kv").forEach((t) => out.push(["kv", clean(t.querySelector(".kv-label")?.textContent), clean(t.querySelector(".kv-value")?.textContent), t.querySelector(".kv-value")?.id]));
  document.querySelectorAll(".fact-row").forEach((t) => out.push(["fact", clean(t.querySelector(".k")?.textContent), clean(t.querySelector(".v")?.textContent), t.querySelector(".v")?.id]));
  return out;
});
// Never print contact details: skip the email / phone rows and anything with an @.
for (const row of rows) {
  if (/email|phone/i.test(String(row[3] || "") + String(row[1] || "")) || /@/.test(String(row[2] || ""))) continue;
  console.log(row.join(" | "));
}
await browser.close();
