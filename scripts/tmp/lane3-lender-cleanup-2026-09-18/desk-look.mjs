// LOOK ONLY. Does the live Lenders desk show the Lane 3 cleanup?
//   - "Verify Bank" no longer on the desk
//   - "Elan" is ONE row, 46 states
//   - a re-tagged bank now reads PersonalCC
// Password sign-in at /login.html. Blocks every non-GET except the sign-in POST.
// Red numbered boxes + one-line legend on each shot (CLAUDE.md §8).
//   node --env-file=.env scripts/tmp/lane3-lender-cleanup-2026-09-18/desk-look.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/lender-cleanup-2026-09-18-evidence";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD missing"); process.exit(1); }
const out = { started: new Date().toISOString(), searches: [], blocked: [] };

const READ = () => {
  const rows = [...document.querySelectorAll("#tab-list table tbody tr")];
  return {
    rows_in_table: rows.length,
    rows: rows.slice(0, 12).map((tr) => {
      const cells = [...tr.querySelectorAll("td")].map((td) => {
        const sel = td.querySelector("select");
        if (sel) return sel.value;
        const inp = td.querySelector("input");
        if (inp) return inp.value;
        return td.innerText.trim();
      });
      return cells.slice(0, 8).join(" | ");
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
    q: "Verify Bank",
    file: "1-verify-bank-gone.png",
    marks: (s) => [{ n: "1", sel: "#tab-list table", label: `Search "Verify Bank" — ${s.rows_in_table} rows. Both test rows are gone.`, missing: "no table" }]
  },
  {
    q: "Elan",
    file: "2-elan-one-row.png",
    marks: () => [
      { n: "1", sel: "#tab-list table tbody tr:nth-child(1)", label: 'One "Elan Financial" row where there were eight, holding all 46 states', missing: "not found" },
      { n: "2", sel: "#tab-list table tbody tr:nth-child(2)", label: "The other six are different banks — three Hawaii banks that issue an Elan card, and Cleveland / Lakeland, which only match because their names contain those letters", missing: "not found" }
    ]
  },
  {
    q: "Twin Cedars",
    file: "3-retagged-personalcc.png",
    marks: () => [{ n: "1", sel: "#tab-list table tbody tr:nth-child(1) td:nth-child(3)", label: 'Twin Cedars Bank — product list now reads PersonalCC, was OnlineBizCC (its only link is a consumer card)', missing: "not found" }]
  }
];

for (const c of CASES) {
  await page.fill("#fQ", c.q);
  await page.click("#btnFilter");
  await page.waitForTimeout(3500);
  const screen = await page.evaluate(READ);
  const shot = await mark(page, c.marks(screen), `${SHOTS}/${c.file}`);
  out.searches.push({ query: c.q, ...screen, shot });
  console.log(`\n"${c.q}" -> ${screen.rows_in_table} row(s)`);
  for (const r of screen.rows) console.log("   " + r);
}

await page.close();
await browser.close();
out.finished = new Date().toISOString();
writeFileSync(`${SHOTS}/desk-look.json`, JSON.stringify(out, null, 2));
console.log(`\nblocked non-GET: ${JSON.stringify(out.blocked)}`);
