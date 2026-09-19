// r8 — reviewer probe: sign in via the password form, look at the three screens' structure. Look only.
// Every non-GET aborted except the one sign-in POST. Never prints password, token or cookie.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
let posts = 0; const blocked = [];
await ctx.route("**/*", (route) => {
  const r = route.request(); const u = new URL(r.url());
  if (r.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login" && posts === 0) { posts++; return route.continue(); }
  if (r.method() !== "GET") { blocked.push(`${r.method()} ${u.hostname}${u.pathname}`); return route.abort(); }
  return route.continue();
});
const login = await ctx.newPage();
await login.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await login.fill("#email", "chris@fundhub.ai"); await login.fill("#pw", pw);
const [lr] = await Promise.all([login.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 30_000 }), login.click("#go")]);
await login.waitForTimeout(2500);
console.log("login", lr.status(), (await ctx.cookies(BASE)).some((c) => c.name === "fundhub_session"));
await login.close();

const pg = await ctx.newPage();
await pg.goto(`${BASE}/app/ops-admin.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await pg.waitForTimeout(8000);
console.log(await pg.evaluate(() => {
  const hits = [...document.querySelectorAll("button,a,[role=tab],summary,h1,h2,h3,[data-kpi]")].filter((e) => /money|funded/i.test(e.textContent) && e.textContent.trim().length < 120)
    .map((e) => `${e.tagName}#${e.id}.${e.className}[${e.getAttribute("data-kpi") || e.getAttribute("data-tab") || ""}] vis=${e.offsetParent !== null} :: ${e.textContent.replace(/\s+/g, " ").trim()}`);
  return hits.join("\n");
}));
const moneyTab = pg.locator("button,[role=tab],a", { hasText: /^\s*Money\s*$/ }).first();
console.log("money tab count", await moneyTab.count());
if (await moneyTab.count()) { await moneyTab.click(); await pg.waitForTimeout(4000); }
console.log(await pg.evaluate(() => {
  const els = [...document.querySelectorAll("*")].filter((e) => e.children.length < 6 && /funded/i.test(e.textContent) && e.offsetParent !== null && e.textContent.trim().length < 200);
  return els.slice(0, 40).map((e) => `${e.tagName}#${e.id}.${String(e.className).slice(0, 40)} :: ${e.textContent.replace(/\s+/g, " ").trim()}`).join("\n");
}));
console.log("url", pg.url());
await pg.screenshot({ path: "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/29675f55-19d2-4df6-b763-23603c0bbb05/scratchpad/r8-ops-probe.png", fullPage: true });
console.log("blocked", blocked);
await browser.close();
