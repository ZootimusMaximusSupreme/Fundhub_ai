// Review hole 14 — explore. LOOK ONLY. Sign in, open Specialist page, click Repair,
// dump visible text of the Repair area and the /api requests the page made.
// Blocks every non-GET except the sign-in POST. Never prints secrets.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
const apis = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${p}`); return route.abort();
});
const page = await ctx.newPage();
page.on("response", (res) => { const u = new URL(res.url()); if (u.pathname.startsWith("/api/")) apis.push(`${res.request().method()} ${u.pathname}${u.search} -> ${res.status()}`); });
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
console.log("login status", (await lr).status());
await page.waitForTimeout(3000);
console.log("landed", new URL(page.url()).pathname);
await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
const tabs = await page.evaluate(() => Array.from(document.querySelectorAll("button, a, [role=tab]")).map((e) => ({ tag: e.tagName, id: e.id, text: (e.innerText || "").trim().slice(0, 40), role: e.getAttribute("role") })).filter((x) => /repair/i.test(x.text)));
console.log("repair-ish controls", JSON.stringify(tabs));
const apisBefore = apis.length;
const repair = page.getByRole("tab", { name: /repair/i }).first();
if (await repair.count()) await repair.click(); else await page.locator("button", { hasText: /^Repair/ }).first().click();
await page.waitForTimeout(8000);
console.log("APIs after clicking Repair:\n  " + apis.slice(apisBefore).join("\n  "));
console.log("APIs before:\n  " + apis.slice(0, apisBefore).join("\n  "));
const txt = await page.evaluate(() => document.body.innerText);
const i = txt.search(/Nothing needs you|needs you|Stuck/);
console.log("---- body text around headline ----\n" + txt.slice(Math.max(0, i - 800), i + 1500));
console.log("blocked", blocked);
await browser.close();
