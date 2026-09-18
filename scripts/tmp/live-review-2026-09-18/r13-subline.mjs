// Review of hole 13 — LOOK ONLY. Normal staff sign-in, then traces the line
// under the greeting on #11's portal (?id= and ?client_id=), first paint to 5 s.
// Blocks every non-GET except the one sign-in POST. Never prints a secret.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => {
  window.__sub = []; let last = "";
  const iv = setInterval(() => {
    const g = document.getElementById("greeting")?.innerText.trim() ?? "-";
    const subs = Array.from(document.querySelectorAll("[id^=greeting-sub]")).filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.innerText.trim()).join(" / ");
    const k = g + "|" + subs;
    if (k !== last) { last = k; window.__sub.push(`${Math.round(performance.now())}ms "${g}" — "${subs}"`); }
  }, 40);
  setTimeout(() => clearInterval(iv), 8000);
});
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${p}`); return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai"); await page.fill("#pw", pw);
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.click("#go"); console.log("login", (await lr).status()); await page.waitForTimeout(3000);
for (const param of ["id", "id", "client_id", "client_id"]) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/app/client-portal.html?${param}=${ELEVEN}`, { waitUntil: "commit" });
  await p.waitForTimeout(6000);
  console.log(`\n?${param}=`); for (const l of await p.evaluate(() => window.__sub)) console.log("  " + l);
  await p.close();
}
console.log("blocked", blocked);
await browser.close();
