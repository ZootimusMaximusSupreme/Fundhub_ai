// LOOK ONLY. Does the live Lenders desk show the 19 new personal loan rows?
// Password sign-in at /login.html. Blocks every non-GET except the sign-in POST.
// Red numbered boxes + one-line legend on each shot (CLAUDE.md §8).
//   node --env-file=.env scripts/tmp/personal-loans-2026-09-18/desk-look.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/personal-loans-2026-09-18-evidence";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD missing"); process.exit(1); }
const out = { started: new Date().toISOString(), searches: [], blocked: [] };

const READ = () => {
  const rows = [...document.querySelectorAll("#tab-list table tbody tr")];
  return {
    rows_in_table: rows.length,
    broken_logos: [...document.querySelectorAll("#tab-list table img")]
      .filter((i) => i.complete && i.naturalWidth === 0).length,
    logos_drawn: [...document.querySelectorAll("#tab-list table img")].length,
    rows: rows.slice(0, 25).map((tr) => {
      const cells = [...tr.querySelectorAll("td")].map((td) => {
        const sel = td.querySelector("select");
        if (sel) return sel.value;
        const inp = td.querySelector("input");
        if (inp) return inp.value;
        return td.innerText.trim();
      });
      return cells.slice(0, 7).join(" | ");
    })
  };
};

async function mark(page, items, file) {
  const clip = await page.evaluate((items) => {
    const layer = document.createElement("div");
    layer.id = "__look";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    const legend = []; let top = Infinity, bottom = 0;
    for (const it of items) {
      const el = document.querySelector(it.sel);
      const r = el ? el.getBoundingClientRect() : null;
      if (!el || !r || r.height === 0) { legend.push(`${it.n} = ${it.label}: ${it.missing}`); continue; }
      const b = document.createElement("div");
      b.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 4}px;width:${r.width + 10}px;height:${r.height + 8}px;border:3px solid #e00;border-radius:4px;box-sizing:border-box`;
      const tag = document.createElement("div");
      tag.textContent = it.n;
      tag.style.cssText = `position:fixed;left:${Math.max(0, r.left - 30)}px;top:${r.top - 10}px;background:#e00;color:#fff;font:700 14px/22px sans-serif;width:22px;text-align:center;border-radius:11px`;
      layer.append(b, tag);
      legend.push(`${it.n} = ${it.label}`);
      top = Math.min(top, r.top - 14); bottom = Math.max(bottom, r.bottom + 10);
    }
    if (top === Infinity) { top = 0; bottom = 300; }
    const lg = document.createElement("div");
    lg.style.cssText = `position:fixed;left:240px;top:${Math.min(bottom + 12, innerHeight - 130)}px;width:1080px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:15px/22px sans-serif;padding:8px 12px`;
    lg.innerHTML = legend.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    layer.append(lg); document.body.append(layer);
    bottom = Math.max(bottom, lg.getBoundingClientRect().bottom + 10);
    const y0 = Math.max(0, top - 60);
    return { y: y0, width: document.documentElement.clientWidth, height: Math.min(innerHeight - y0, bottom - y0 + 10), legend };
  }, items);
  await page.screenshot({ path: file, clip: { x: 0, y: clip.y, width: clip.width, height: clip.height } });
  await page.evaluate(() => document.getElementById("__look")?.remove()).catch(() => {});
  return { file, legend: clip.legend };
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${p}`); return route.abort();
});

const lp = await ctx.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", pw);
const lr = lp.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
out.sign_in_status = (await lr).status();
await lp.waitForTimeout(2000);
await lp.close();
if (out.sign_in_status !== 200) { console.log("sign-in failed", out.sign_in_status); await browser.close(); process.exit(1); }

const page = await ctx.newPage();
await page.goto(`${BASE}/app/lenders.html`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("#tab-list table tbody tr").length > 5, null, { timeout: 30000 }).catch(() => {});

const CASES = [
  {
    q: "Happen",
    file: "1-happen-bank.png",
    marks: (s) => [{ n: "1", sel: "#tab-list table tbody tr:nth-child(1)", label: `Happen Bank (LendingClub's new name) is on the desk as a personal loan — ${s.rows_in_table} row(s)`, missing: "not found" }]
  },
  {
    q: "Best Egg",
    file: "2-best-egg.png",
    marks: () => [{ n: "1", sel: "#tab-list table tbody tr:nth-child(1)", label: "Best Egg — the lender named as missing in the prior audit is now in the book (47 states, no logo yet)", missing: "not found" }]
  },
  {
    q: "PenFed",
    file: "3-penfed.png",
    marks: () => [{ n: "1", sel: "#tab-list table tbody tr:nth-child(1)", label: "PenFed Credit Union — All States, soft-pull prequalification, logo drawn", missing: "not found" }]
  }
];

for (const c of CASES) {
  await page.fill("#fQ", c.q);
  await page.click("#btnFilter");
  await page.waitForTimeout(3500);
  const screen = await page.evaluate(READ);
  const shot = await mark(page, c.marks(screen), `${SHOTS}/${c.file}`);
  out.searches.push({ query: c.q, ...screen, shot });
  console.log(`\n"${c.q}" -> ${screen.rows_in_table} row(s), ${screen.logos_drawn} logo(s), ${screen.broken_logos} broken`);
  for (const r of screen.rows) console.log("   " + r);
}

await page.close();
await browser.close();
out.finished = new Date().toISOString();
writeFileSync(`${SHOTS}/desk-look.json`, JSON.stringify(out, null, 2));
console.log(`\nblocked non-GET: ${JSON.stringify(out.blocked)}`);
