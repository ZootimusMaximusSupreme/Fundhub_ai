// Review hole 14 — look at the shape of the two repair APIs the Repair tab calls. LOOK ONLY.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && new URL(r.url()).pathname === "/api/auth/login") return route.continue();
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`);
await page.fill("#email", "chris@fundhub.ai"); await page.fill("#pw", pw);
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.click("#go"); await lr; await page.waitForTimeout(2000);
const got = {};
page.on("response", async (res) => { const p = new URL(res.url()).pathname; if (p === "/api/repair/exceptions" || p === "/api/read/repair-cases") { try { got[p] = await res.json(); } catch (e) { got[p] = String(e); } } });
await page.goto(`${BASE}/app/inquiry-remover.html`); await page.waitForTimeout(4000);
await page.click("#tab-repair"); await page.waitForTimeout(6000);
const trim = (v, d = 0) => {
  if (Array.isArray(v)) return v.length ? [`len ${v.length}`, trim(v[0], d + 1)] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, d > 3 ? typeof x : trim(x, d + 1)]));
  return typeof v === "string" ? (v.length > 40 ? v.slice(0, 40) + "…" : v) : v;
};
for (const [p, j] of Object.entries(got)) console.log(p, JSON.stringify(trim(j), null, 1).slice(0, 3000));
await browser.close();
