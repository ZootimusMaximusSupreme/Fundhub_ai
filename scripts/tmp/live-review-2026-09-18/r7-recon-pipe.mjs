// Hole 7 reviewer recon of pipeline.html Fulfillment view — LOOK ONLY. Blocks every non-GET except sign-in.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const BASE = "https://fundhub.ai";
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
const calls = []; const bodies = {};
page.on("response", async (res) => {
  const u = new URL(res.url());
  if (!u.pathname.startsWith("/api/")) return;
  calls.push(`${res.request().method()} ${u.pathname}${u.search} -> ${res.status()}`);
  try { const t = await res.text(); if (t.includes("Nine-Repair") || t.includes("be3dcfd7")) bodies[u.pathname + u.search] = t; } catch {}
});
await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const btns = await page.evaluate(() => Array.from(document.querySelectorAll("button,[role=tab],a")).filter((b) => /fulfil/i.test(b.innerText)).map((b) => ({ tag: b.tagName, id: b.id, cls: b.className, text: b.innerText.trim().slice(0, 60), type: b.getAttribute("type"), onclick: b.getAttribute("onclick"), href: b.getAttribute("href"), dataset: JSON.stringify(b.dataset) })));
console.log("fulfillment buttons:", JSON.stringify(btns, null, 1));
const urlBefore = page.url();
const fb = page.locator("button, [role=tab]").filter({ hasText: /^\s*Fulfil+ment/i }).first();
await fb.click();
await page.waitForTimeout(5000);
console.log("url before/after:", urlBefore, page.url());
const txt = await page.evaluate(() => document.body.innerText);
writeFileSync(`${DIR}/r7-pipe-text.txt`, txt);
const row = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("*")).filter((e) => e.children.length < 40 && /Sim Nine-Repair/.test(e.innerText || "") );
  // smallest containers that look like a row
  const rows = els.filter((e) => /^(TR|LI|ARTICLE)$/.test(e.tagName) || /row|card/i.test(e.className || ""));
  return rows.slice(-5).map((e) => ({ tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 80), text: e.innerText.trim().replace(/\s*\n\s*/g, " | ").slice(0, 500), buttons: Array.from(e.querySelectorAll("button,a")).map((b) => ({ tag: b.tagName, cls: String(b.className).slice(0, 60), text: b.innerText.trim(), href: b.getAttribute("href") })) }));
});
console.log(JSON.stringify(row, null, 1));
console.log(calls.join("\n"));
writeFileSync(`${DIR}/r7-pipe-bodies.json`, JSON.stringify(bodies, null, 1));
console.log("bodies with #9:", Object.keys(bodies));
console.log("blocked:", blocked);
await browser.close();
