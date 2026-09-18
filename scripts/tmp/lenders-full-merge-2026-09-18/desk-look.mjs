// LOOK ONLY. Does the live Lenders desk show the one unified bank book, with logos?
// Password sign-in at /login.html, then open /app/lenders.html twice (two fresh browsers).
// Blocks every non-GET except the one sign-in POST. Never prints the password or cookie.
// Red numbered boxes + a one-line legend on each shot (CLAUDE.md §8).
//   node --env-file=.env scripts/tmp/carl-barton-2026-09-18/lenders-desk-look.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/29675f55-19d2-4df6-b763-23603c0bbb05/scratchpad/main-wt/docs/workflows/lender-full-merge-2026-09-18-evidence";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD missing"); process.exit(1); }
const out = { started: new Date().toISOString(), loads: [], blocked: [] };

/** What the screen actually says. */
const READ = () => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  const imgs = [...document.querySelectorAll("table img")];
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
  const body = document.body.innerText;
  const countLine = (body.match(/[\d,]+\s+(banks?|lenders?)/gi) || []).slice(0, 6);
  return {
    rows_in_table: rows.length,
    logo_imgs: imgs.length,
    logo_imgs_broken: broken.length,
    broken_src: broken.slice(0, 5).map((i) => i.getAttribute("src")),
    count_words_on_page: countLine,
    // Banks that only exist because of the Carl merge.
    carl_names_shown: ["CONNEX", "Congressional Bank", "Community State Bank"]
      .filter((n) => body.includes(n)),
    // Banks that were in the book before Carl, and personal products.
    pre_carl_shown: ["Chase", "American Express", "Capital One"].filter((n) => body.includes(n))
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
    lg.style.cssText = `position:fixed;left:240px;top:${Math.min(bottom + 12, innerHeight - 110)}px;width:980px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:15px/22px sans-serif;padding:8px 12px`;
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

for (const n of [1, 2]) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route("**/*", (route) => {
    const r = route.request(); const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const p = new URL(r.url()).pathname;
    if (m === "POST" && p === "/api/auth/login") return route.continue();
    out.blocked.push(`load${n} ${m} ${p}`); return route.abort();
  });
  const load = { n };
  try {
    const lp = await ctx.newPage();
    await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
    await lp.fill("#email", "chris@fundhub.ai");
    await lp.fill("#pw", pw);
    const lr = lp.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
    await lp.click("#go");
    load.sign_in_status = (await lr).status();
    await lp.waitForTimeout(2000);
    await lp.close();
    if (load.sign_in_status !== 200) { out.loads.push(load); console.log(`load ${n}: sign-in failed ${load.sign_in_status}`); await browser.close(); break; }

    const page = await ctx.newPage();
    const api = [];
    page.on("response", async (res) => {
      const u = new URL(res.url());
      if (!u.pathname.startsWith("/api/lenders")) return;
      try {
        const d = await res.json();
        api.push({
          path: u.pathname + (u.search || ""),
          status: res.status(),
          total: d?.total ?? null,
          returned: Array.isArray(d?.lenders) ? d.lenders.length : (Array.isArray(d) ? d.length : null),
          with_logo: Array.isArray(d?.lenders) ? d.lenders.filter((l) => l.logo_path).length : null
        });
      } catch { /* not json */ }
    });
    await page.goto(`${BASE}/app/lenders.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length > 5, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    load.at = new Date().toISOString();
    load.screen = await page.evaluate(READ);
    load.api = api;
    load.shot = await mark(page, [
      { n: "1", sel: "table", label: `Load ${n} — Lenders list: ${load.screen.rows_in_table} rows on screen, ${load.screen.logo_imgs} logo pictures, ${load.screen.logo_imgs_broken} broken`, missing: "no table on the page" },
      { n: "2", sel: "#tab-list", label: "List tab", missing: "not found" }
    ], `${SHOTS}/lenders-desk-load${n}.png`);
    await page.close();
  } catch (e) { load.error = String(e).slice(0, 300); }
  out.loads.push(load);
  await browser.close();
  const s = load.screen || {};
  console.log(`load ${n} @${load.at} sign-in=${load.sign_in_status} rows=${s.rows_in_table} logos=${s.logo_imgs} broken=${s.logo_imgs_broken} counts=${JSON.stringify(s.count_words_on_page)} carl=${JSON.stringify(s.carl_names_shown)} pre_carl=${JSON.stringify(s.pre_carl_shown)} api=${JSON.stringify(load.api)}${load.error ? " ERROR " + load.error : ""}`);
  if (n === 1) await new Promise((r) => setTimeout(r, 4000));
}
out.finished = new Date().toISOString();
writeFileSync(`${SHOTS}/lenders-desk-look.json`, JSON.stringify(out, null, 2));
console.log(`blocked non-GET: ${JSON.stringify(out.blocked)}`);
