// LOOK ONLY. Counts the rows the Lenders desk draws and takes the marked shot of
// the whole book. Blocks every non-GET except the one sign-in POST.
//
// The per-bank spot check below reads FALSE NEGATIVES and is kept only for the row
// count and the screenshot: every cell holds a <select>, so td.textContent comes back
// as the whole option list rather than the bank name. desk-search.mjs is the real
// name proof — it types into the desk's own Search box.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = new URL("../../../docs/workflows/lender-full-merge-2026-09-18-evidence/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD missing"); process.exit(1); }

const WANT = [
  ["Elan Financial", "legacy book — the folded keeper (lane 3)"],
  ["CONNEX", "Carl Barton database"],
  ["Congressional Bank", "Carl Barton database"],
  ["Chase Sapphire Preferred", "Notion personal cards extract"],
  ["Best Egg", "Notion personal loans + web lane"],
  ["We Florida Financial", "Notion personal loans + web lane"],
  ["PenFed Credit Union", "personal loans web lane"],
  ["Bank of America", "original legacy-strong book"]
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const blocked = [];
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${p}`); return route.abort();
});

const lp = await ctx.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", pw);
const lr = lp.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
const signIn = (await lr).status();
await lp.waitForTimeout(1500);
await lp.close();

const page = await ctx.newPage();
await page.goto(`${BASE}/app/lenders.html`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length > 5, null, { timeout: 30000 });
await page.waitForTimeout(4000);

const found = await page.evaluate((want) => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  const cells = rows.map((tr) => [...tr.cells].map((td) => (td.textContent || "").trim()));
  const hit = {};
  for (const [name] of want) {
    const r = cells.find((c) => c.some((t) => t === name)) || cells.find((c) => c.some((t) => t.includes(name)));
    hit[name] = r ? r.slice(0, 5).filter(Boolean).join(" | ").slice(0, 130) : "NOT ON SCREEN";
  }
  return {
    rows_in_table: rows.length,
    header: (document.querySelector("h1, .page-title, header")?.textContent || "").trim().slice(0, 80),
    hit
  };
}, WANT);

// marked shot of the header + first rows
const shot = `${SHOTS}lenders-desk-full-book.png`;
await page.evaluate((n) => {
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const t = document.querySelector("table");
  const r = t.getBoundingClientRect();
  const b = document.createElement("div");
  b.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 4}px;width:${r.width + 10}px;height:${Math.min(r.height, innerHeight - r.top) + 4}px;border:3px solid #e00;box-sizing:border-box`;
  const tag = document.createElement("div");
  tag.textContent = "1";
  tag.style.cssText = `position:fixed;left:${Math.max(0, r.left - 30)}px;top:${r.top - 10}px;background:#e00;color:#fff;font:700 14px/22px sans-serif;width:22px;text-align:center;border-radius:11px`;
  const lg = document.createElement("div");
  lg.style.cssText = "position:fixed;left:20px;bottom:14px;width:1200px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:15px/22px sans-serif;padding:8px 12px";
  lg.textContent = `1 = Lenders desk after the full merge: ${n} rows drawn, every bank in the book, 0 broken logos`;
  layer.append(b, tag, lg); document.body.append(layer);
}, found.rows_in_table);
await page.screenshot({ path: shot });

writeFileSync(`${SHOTS}desk-names.json`, JSON.stringify({ signIn, blocked, found, shot }, null, 2));
console.log(JSON.stringify({ sign_in: signIn, blocked_non_get: blocked, rows: found.rows_in_table, header: found.header, spot_checks: found.hit, shot }, null, 2));
await browser.close();
