// Review of hole 13 — LOOK ONLY. Signs in through the real login page, then looks
// at the live page shape: where the greeting and top name live on the portal,
// and which staff screens for #11 carry a link into the client portal.
// Blocks every non-GET request except the one sign-in POST. Never prints a secret.
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r13-explore.mjs
import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const blocked = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request();
  const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${p}`);
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
const inputs = await page.$$eval("input,button", (els) => els.map((e) => `${e.tagName}#${e.id}[${e.type}] ${e.innerText || e.placeholder || ""}`.slice(0, 80)));
console.log("login form:", inputs);
await page.fill("input[type=email]", "chris@fundhub.ai");
await page.fill("input[type=password]", pw);
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.locator("button[type=submit], button:has-text('Sign in'), #go").first().click();
const resp = await lr;
console.log("login status", resp.status());
await page.waitForTimeout(3000);
console.log("after login url:", page.url().replace(ELEVEN, "<eleven>"));
console.log("localStorage keys:", await page.evaluate(() => Object.keys(localStorage)));
console.log("fh_role:", await page.evaluate(() => localStorage.getItem("fh_role")));

// Portal shape
await page.goto(`${BASE}/app/client-portal.html?id=${ELEVEN}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const shape = await page.evaluate(() => {
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = walker.nextNode())) {
    const own = Array.from(n.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join(" ");
    if (/welcome|sim|chris|eleven/i.test(own)) {
      const r = n.getBoundingClientRect();
      hits.push({ tag: n.tagName, id: n.id, cls: String(n.className).slice(0, 40), text: own.slice(0, 80), y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 });
    }
  }
  const selects = Array.from(document.querySelectorAll("select")).map((s) => ({ id: s.id, val: s.options[s.selectedIndex]?.text }));
  return { hits, selects, top: document.body.innerText.slice(0, 500) };
});
console.log(JSON.stringify(shape, null, 2));

// Staff screens for #11 that link into the portal
for (const path of [
  `/app/client-control-panel.html?id=${ELEVEN}`,
  `/app/client-control-panel.html?client_id=${ELEVEN}`,
  `/app/pipeline.html`,
  `/app/csm-queue.html`,
]) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6000);
  const links = await p.evaluate((eleven) => {
    const out = [];
    for (const a of document.querySelectorAll("a[href], [data-href], button[onclick]")) {
      const href = a.getAttribute("href") || a.getAttribute("data-href") || a.getAttribute("onclick") || "";
      if (/portal/i.test(href) || /portal/i.test(a.innerText || "")) out.push({ text: (a.innerText || "").trim().slice(0, 50), href: href.replace(eleven, "<eleven>").slice(0, 140), target: a.getAttribute("target") });
    }
    return out;
  }, ELEVEN);
  console.log(`\n${path.replace(ELEVEN, "<eleven>")} -> ${p.url().replace(ELEVEN, "<eleven>")}`);
  console.log(JSON.stringify(links.slice(0, 20), null, 1));
  await p.close();
}
console.log("blocked:", blocked);
await browser.close();
