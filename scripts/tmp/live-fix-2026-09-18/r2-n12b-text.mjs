// HOLE N12 (attempt b) — LOOK ONLY. Every visible line of the control panel
// for one file, so every figure that could come off a stored credit report is
// named, not guessed. Lines with an @, a phone-shaped number or a street word
// are dropped (never print contact details). Non-GET requests aborted.
//   ID=<client id> [LOCAL=1] node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n12b-text.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const BASE = "https://fundhub.ai";
const ID = process.env.ID || "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const LOCAL = process.env.LOCAL === "1";
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
const LOCAL_HTML = new URL("../../../public/app/client-control-panel.html", import.meta.url);
await context.route("**/*", (route) => {
  const q = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.abort();
  if (LOCAL && new URL(q.url()).pathname === "/app/client-control-panel.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
  }
  return route.continue();
});
const page = await context.newPage();
await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => { const t = (document.getElementById("ccp-inquiries")?.textContent || "").trim(); return t && t !== "—"; }, null, { timeout: 45000 });
await page.waitForTimeout(3000);
// Open every collapsed group so nothing hides from innerText.
await page.evaluate(() => {
  document.querySelectorAll("details").forEach((d) => { d.open = true; });
  document.querySelectorAll(".group-body[hidden]").forEach((n) => { n.hidden = false; });
});
await page.waitForTimeout(500);
const text = await page.evaluate(() => document.body.innerText);
for (const line of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
  if (/\d{10}|@|\(\d{3}\)|\d{3}[-. ]\d{3}[-. ]\d{4}|\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd)\b\.?/i.test(line)) continue;
  console.log(line);
}
await browser.close();
