// Hole 23 reviewer — LOOK ONLY. Sign in with the password form, open #13's control panel once,
// dump the DOM around Scores / permission / System Facts so the review script can find them.
// Blocks every non-GET request except the sign-in POST. Prints no secrets.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }
const out = { blocked: [] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method(); const u = new URL(r.url());
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && u.hostname.endsWith("fundhub.ai") && u.pathname === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${u.host}${u.pathname}`); return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.locator('input[type="email"], #email').first().fill("chris@fundhub.ai");
await page.locator('input[type="password"]').first().fill(pw);
const respP = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 20000 });
const btns = page.locator("button");
for (let i = 0; i < await btns.count(); i++) {
  const t = (await btns.nth(i).innerText()).trim();
  if (/email me/i.test(t)) continue;
  if (/sign in|log in/i.test(t) && await btns.nth(i).isVisible()) { out.clicked = t; await btns.nth(i).click(); break; }
}
const lr = await respP.catch(() => null);
out.login = lr ? lr.status() : null;
if (out.login !== 200) { console.log(JSON.stringify(out)); await browser.close(); process.exit(1); }
await page.waitForTimeout(2000);
const pg2 = await ctx.newPage();
await pg2.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await pg2.getByText("Sim Thirteen-NoBook").first().waitFor({ timeout: 30000 }).catch(() => {});
await pg2.waitForTimeout(6000);
out.dom = await pg2.evaluate(() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const desc = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : ""}`;
  const find = (re) => [...document.querySelectorAll("body *")].filter((e) => re.test(e.innerText || "") && ![...e.children].some((c) => re.test(c.innerText || ""))).slice(0, 6)
    .map((e) => { const p = e.parentElement, gp = p && p.parentElement; return { el: desc(e), text: clean(e.innerText).slice(0, 200), parent: p ? desc(p) + " :: " + clean(p.innerText).slice(0, 300) : null, gp: gp ? desc(gp) + " :: " + clean(gp.innerText).slice(0, 400) : null }; });
  return {
    scores: find(/Scores/),
    sample: find(/sample/i),
    permission: find(/written permission/i),
    systemFacts: find(/System Facts/i),
    lastPull: find(/Last Credit Pull/i),
    nums: find(/771/),
  };
});
await pg2.screenshot({ path: process.env.SHOT || "/tmp/r23-explore.png", fullPage: true });
console.log(JSON.stringify(out, null, 2));
await browser.close();
