// Review hole 14 — find the headline, the line under it, and the tiles in the live DOM. LOOK ONLY.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
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
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.click("#go"); await lr; await page.waitForTimeout(2000);
await page.goto(`${BASE}/app/inquiry-remover.html`); await page.waitForTimeout(4000);
await page.click("#tab-repair"); await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const desc = (e) => e ? `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : ""}` : null;
  const path = (e) => { const a = []; while (e && e !== document.body) { a.unshift(desc(e)); e = e.parentElement; } return a.join(" > "); };
  const all = Array.from(document.querySelectorAll("body *")).filter((e) => e.getBoundingClientRect().height > 0);
  const leaf = (re) => all.filter((e) => re.test((e.innerText || "").trim()) && !Array.from(e.children).some((c) => re.test((c.innerText || "").trim())));
  const out = {};
  out.subline = leaf(/Nothing needs you|needs you|waiting on a bureau|stuck\./i).map((e) => ({ path: path(e), text: e.innerText.trim(), r: e.getBoundingClientRect().toJSON() }));
  out.headline = leaf(/of \d+ open/i).map((e) => ({ path: path(e), text: e.innerText.trim(), parentText: e.parentElement.innerText.trim(), r: e.getBoundingClientRect().toJSON() }));
  out.tiles = ["NEED ME", "READY TO SEND", "WAITING ON BUREAU", "STUCK", "TRIAL ENDING"].map((lab) => leaf(new RegExp("^" + lab + "$", "i")).map((e) => { const t = e.closest("button, [role=button], .tile, [data-filter]") || e.parentElement; return { label: lab, labelPath: path(e), tile: path(t), tileText: t.innerText.trim(), r: t.getBoundingClientRect().toJSON() }; }));
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
