// r8 — reviewer probe 2: control panel Funded line and Pipeline Fulfillment tile structure. Look only.
// Every non-GET aborted except the one sign-in POST. Never prints password, token or cookie.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const SP = "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/29675f55-19d2-4df6-b763-23603c0bbb05/scratchpad";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
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
await login.waitForTimeout(2500); console.log("login", lr.status()); await login.close();

const pg = await ctx.newPage();
await pg.goto(`${BASE}/app/client-control-panel.html?id=${EIGHT}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await pg.waitForTimeout(9000);
console.log(await pg.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.children.length < 5 && /^\s*funded/i.test(e.textContent) && e.offsetParent !== null && e.textContent.trim().length < 150)
  .slice(0, 30).map((e) => `${e.tagName}#${e.id}.${String(e.className).slice(0, 40)} :: ${e.textContent.replace(/\s+/g, " ").trim()}`).join("\n")));
console.log(await pg.evaluate(() => { const e = document.getElementById("ccp-facts-funded"); if (!e) return "no #ccp-facts-funded";
  const chain = []; let x = e; while (x && x !== document.body) { const cs = getComputedStyle(x); chain.push(`${x.tagName}#${x.id}.${String(x.className).slice(0,30)} disp=${cs.display} vis=${cs.visibility} hidden=${x.hidden} open=${x.open ?? ""}`); x = x.parentElement; }
  return "text=" + e.textContent.replace(/\s+/g, " ").trim() + "\nrow=" + e.parentElement.textContent.replace(/\s+/g, " ").trim() + "\n" + chain.join("\n"); }));
console.log("group header:", await pg.evaluate(() => { const b = document.getElementById("facts-body"); const g = b.parentElement; return [...g.children].filter((c) => c !== b).map((c) => c.outerHTML.slice(0, 400)).join("\n"); }));
await pg.screenshot({ path: `${SP}/r8-ccp-probe.png` });
await pg.close();

const pp = await ctx.newPage();
await pp.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await pp.waitForTimeout(4000);
console.log(await pp.evaluate(() => [...document.querySelectorAll("button,[role=tab],a")].filter((e) => /fulfil/i.test(e.textContent)).map((e) => `${e.tagName}#${e.id} :: ${e.textContent.replace(/\s+/g, " ").trim()}`).join("\n")));
await pp.locator("button,[role=tab]", { hasText: /Fulfil/i }).first().click();
await pp.waitForTimeout(12000); await browser.close(); process.exit(0);
console.log(await pp.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.children.length < 6 && /total (approved|clients)/i.test(e.textContent) && e.offsetParent !== null && e.textContent.trim().length < 300)
  .slice(0, 20).map((e) => `${e.tagName}#${e.id}.${String(e.className).slice(0, 40)} :: ${e.textContent.replace(/\s+/g, " ").trim()}`).join("\n")));
await pp.screenshot({ path: `${SP}/r8-pipe-probe.png` });
console.log("blocked", blocked);
await browser.close();
