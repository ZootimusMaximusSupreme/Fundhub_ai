// Hole 13 round 2 review (r13c) — explore: find the greeting, top name and staff badge on live. LOOK ONLY.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
async function guard(ctx) {
  await ctx.route("**/*", (route) => {
    const req = route.request(); const m = req.method(); const u = new URL(req.url());
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      if (m === "POST" && u.origin === BASE && u.pathname === "/api/auth/login") return route.continue();
      blocked.push(`${m} ${u.pathname}`); return route.abort();
    }
    return route.continue();
  });
}
const browser = await chromium.launch({ headless: true });
const a = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(a);
const lp = await a.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", pw);
const lr = lp.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
console.log("login status", (await lr).status());
await lp.waitForTimeout(2500);
console.log("after login path", new URL(lp.url()).pathname);
const pg = await a.newPage();
await pg.goto(`${BASE}/app/client-portal.html?id=${ELEVEN}`, { waitUntil: "domcontentloaded" });
await pg.waitForTimeout(8000);
const info = await pg.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.top > 260 || r.height === 0 || r.width === 0) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!own && !(el.tagName === "SELECT")) continue;
    out.push({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), text: (el.tagName === "SELECT" ? el.options[el.selectedIndex]?.text : own).slice(0, 80), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
  }
  return out;
});
for (const x of info) console.log(JSON.stringify(x));
console.log("blocked", blocked);
await browser.close();
