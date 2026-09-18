// Hole 7 reviewer: DOM shape of the next-step box, the Active blockers list, and the Fulfillment row. LOOK ONLY.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const ID = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && new URL(r.url()).pathname === "/api/auth/login") return route.continue();
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`);
await page.fill("#email", "chris@fundhub.ai"); await page.fill("#pw", pw);
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login"));
await page.click("#go"); console.log("sign-in", (await lr).status());
await page.waitForTimeout(2000);
await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`);
await page.waitForFunction(() => document.body.innerText.includes("Sim Nine-Repair"), null, { timeout: 30000 });
await page.waitForTimeout(4000);
const skel = (sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el) return null;
  const walk = (e, d) => d > 4 ? "" : `${"  ".repeat(d)}<${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : ""}> ${Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 70)}\n` + Array.from(e.children).slice(0, 5).map((c) => walk(c, d + 1)).join("");
  return walk(el, 0);
}, sel);
console.log(await skel(".na-step"));
const secSel = await page.evaluate(() => { const t = Array.from(document.querySelectorAll(".cp-sec-title")).find((x) => /active blockers/i.test(x.innerText)); if (!t) return null; t.parentElement.setAttribute("data-r7", "blk"); return true; });
console.log(await skel("[data-r7=blk]"));
await page.goto(`${BASE}/app/pipeline.html`);
await page.waitForTimeout(3000);
await page.click("#lensFulfillment");
await page.waitForFunction(() => Array.from(document.querySelectorAll(".fh-lens-row")).some((r) => r.innerText.includes("Sim Nine-Repair")), null, { timeout: 30000 });
await page.waitForTimeout(2000);
await page.evaluate(() => { Array.from(document.querySelectorAll(".fh-lens-row")).find((r) => r.innerText.includes("Sim Nine-Repair")).setAttribute("data-r7", "row"); });
console.log(await skel("[data-r7=row]"));
await browser.close();
