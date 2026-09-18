// Hole 7 reviewer recon — LOOK ONLY. Signs in with the password form, opens #9's control panel,
// dumps the visible text near "Do this next" and "blocker", and lists the API calls the page made.
// Blocks every non-GET except the sign-in POST. Never prints a password, token or cookie.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const BASE = "https://fundhub.ai";
const ID = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const DIR = "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/29675f55-19d2-4df6-b763-23603c0bbb05/scratchpad";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
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
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const status = (await lr).status();
console.log("sign-in status", status);
if (status !== 200) { await browser.close(); process.exit(1); }
await page.waitForTimeout(2000);
const calls = [];
const bodies = {};
page.on("response", async (res) => {
  const u = new URL(res.url());
  if (!u.pathname.startsWith("/api/")) return;
  calls.push(`${res.request().method()} ${u.pathname}${u.search} -> ${res.status()}`);
  try { const t = await res.text(); if (t.includes("Nine") || t.includes(ID)) bodies[u.pathname + u.search] = t; } catch {}
});
await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.innerText.includes("Sim Nine-Repair"), null, { timeout: 30000 });
await page.waitForTimeout(5000);
const txt = await page.evaluate(() => document.body.innerText);
writeFileSync(`${DIR}/r7-recon-text.txt`, txt);
const probe = await page.evaluate(() => {
  const hits = [];
  for (const el of document.querySelectorAll("*")) {
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ");
    if (/do this next|blocker|no step applies|nothing on the step list/i.test(own)) {
      hits.push({ tag: el.tagName, id: el.id, cls: el.className, text: own.slice(0, 200), parentId: el.parentElement?.id, parentCls: el.parentElement?.className });
    }
  }
  return hits;
});
console.log(JSON.stringify(probe, null, 1));
console.log(calls.join("\n"));
writeFileSync(`${DIR}/r7-recon-bodies.json`, JSON.stringify(bodies, null, 1));
console.log("bodies with #9:", Object.keys(bodies));
console.log("blocked:", blocked);
await browser.close();
