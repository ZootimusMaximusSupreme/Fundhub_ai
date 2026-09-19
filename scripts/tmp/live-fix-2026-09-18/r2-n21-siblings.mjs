// Hole N21 side look. LOOK ONLY. Opens every folding header on #13's live
// control panel once and reads its words while open. Every non-GET request is
// aborted. Never prints the password or the cookie.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n21-siblings.mjs
import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n21-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("login failed", r.status); process.exit(1); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([{ name: "fundhub_session", value: m[1], domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }]);
await context.route("**/*", (route) => (["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort()));
const page = await context.newPage();
await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => /Thirteen/.test(document.getElementById("ccp-name")?.textContent || ""), null, { timeout: 45000 });
const ids = await page.$$eval("button.group-title.tog", (bs) => bs.map((b) => b.getAttribute("aria-controls")));
for (const id of ids) {
  const sel = `button.group-title.tog[aria-controls="${id}"]`;
  const visible = await page.locator(sel).isVisible();
  if (visible) await page.locator(sel).click();
  const look = await page.$eval(sel, (b) => ({
    header: b.textContent.trim().replace(/\s+/g, " "),
    ariaExpanded: b.getAttribute("aria-expanded"),
    bodyShowing: !document.getElementById(b.getAttribute("aria-controls")).hidden,
  }));
  console.log(id, visible ? "" : "(header not visible)", JSON.stringify(look));
}
await browser.close();
