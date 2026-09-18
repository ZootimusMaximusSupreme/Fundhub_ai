// LOOK ONLY. Types a bank name into the desk's Search box and clicks Apply filters,
// once per source that fed the merge. Blocks every non-GET except the one sign-in.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = new URL("../../../docs/workflows/lender-full-merge-2026-09-18-evidence/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD missing"); process.exit(1); }

const WANT = [
  ["Elan Financial", "legacy book — folded to one row by lane 3"],
  ["CONNEX", "Carl Barton database"],
  ["Congressional Bank", "Carl Barton database"],
  ["Chase Sapphire Preferred", "Notion personal cards extract"],
  ["Best Egg", "Notion personal loans"],
  ["We Florida Financial", "Notion personal loans"],
  ["PenFed Credit Union", "personal loans web lane"]
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
await page.waitForTimeout(3000);

const searchSel = 'input[placeholder="Name…"], input[placeholder="Name..."]';
const results = [];
for (const [name, source] of WANT) {
  await page.fill(searchSel, name);
  await page.click('button:has-text("Apply filters")');
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const trs = [...document.querySelectorAll("table tbody tr")];
    return {
      rows: trs.length,
      first: trs.slice(0, 3).map((tr) => [...tr.querySelectorAll("td")]
        .map((td) => (td.innerText || td.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean).slice(0, 6).join(" | ").slice(0, 150))
    };
  });
  results.push({ search: name, source, rows_shown: r.rows, rows: r.first });
  console.log(`${name.padEnd(26)} ${String(r.rows).padStart(4)} row(s)  ${r.first[0] || "— nothing —"}`);
}

await page.fill(searchSel, "Best Egg");
await page.click('button:has-text("Apply filters")');
await page.waitForTimeout(1800);
const shot = `${SHOTS}lenders-desk-search-best-egg.png`;
await page.evaluate(() => {
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const put = (el, n, label, y) => {
    const r = el.getBoundingClientRect();
    const b = document.createElement("div");
    b.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 4}px;width:${r.width + 10}px;height:${r.height + 8}px;border:3px solid #e00;box-sizing:border-box;border-radius:4px`;
    const tag = document.createElement("div");
    tag.textContent = n;
    tag.style.cssText = `position:fixed;left:${Math.max(0, r.left - 28)}px;top:${r.top - 10}px;background:#e00;color:#fff;font:700 14px/22px sans-serif;width:22px;text-align:center;border-radius:11px`;
    layer.append(b, tag);
  };
  const input = document.querySelector('input[placeholder="Name…"], input[placeholder="Name..."]');
  const row = document.querySelector("table tbody tr");
  if (input) put(input, "1");
  if (row) put(row, "2");
  const lg = document.createElement("div");
  lg.style.cssText = "position:fixed;left:20px;bottom:14px;width:1200px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:15px/22px sans-serif;padding:8px 12px";
  lg.innerHTML = "1 = searched the live desk for &quot;Best Egg&quot; (a bank that came in from the Notion personal-loans page)<br>2 = the one row it returns — PersonalLoans, in the book, no duplicate";
  layer.append(lg); document.body.append(layer);
});
await page.screenshot({ path: shot });

writeFileSync(`${SHOTS}desk-search.json`, JSON.stringify({ signIn, blocked, results, shot }, null, 2));
console.log(`\nsign-in ${signIn} · blocked non-GET ${JSON.stringify(blocked)}`);
await browser.close();
