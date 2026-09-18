// N17 — Ops CEO brief "funded files this month" counts rounds, not files. LOOK ONLY.
// Signs in as the owner through the real login page, opens Ops Admin (Money is
// the default zone), reads the CEO brief text on the screen twice, and reads
// the /api/read/ops-pulse the screen uses. Blocks every non-GET request except
// the one sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n17-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N17";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, no_send: true, loads: [], blocked: [] };

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const path = new URL(req.url()).pathname;
  if (m === "POST" && path === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${path}`);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
out.login = { status: lr.status() };
await page.waitForTimeout(2500);
if (lr.status() !== 200) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

function fundedLines(text) {
  return String(text || "").split("\n").filter((l) => /funded|Funded/.test(l));
}

for (let i = 1; i <= 2; i++) {
  const pulseResp = page.waitForResponse((r) => r.url().includes("/api/read/ops-pulse"), { timeout: 30000 }).catch(() => null);
  await page.goto(`${BASE}/app/ops-admin.html`, { waitUntil: "domcontentloaded" });
  const pr = await pulseResp;
  let pj = null;
  try { pj = pr ? await pr.json() : null; } catch { pj = null; }
  await page.waitForFunction(() => {
    const el = document.getElementById("ops-pulse-ceo");
    return el && el.textContent && el.textContent.length > 20;
  }, null, { timeout: 30000 }).catch(() => null);
  const ceoText = await page.locator("#ops-pulse-ceo").textContent().catch(() => null);
  const fundedTile = await page.locator('[data-kpi="funded"]').textContent().catch(() => null);
  // Mark the two funded-file lines on the CEO brief with numbered red boxes
  // and a legend (screen-only overlay; nothing is sent anywhere).
  const marked = await page.evaluate(() => {
    const pre = document.getElementById("ops-pulse-ceo");
    if (!pre || !pre.firstChild) return [];
    const text = pre.textContent;
    const wants = [
      { n: 1, re: /Funding advisor starting bar[^\n]*/, cap: "Funding advisor bar: funded files this month" },
      { n: 2, re: /Funding advisor funded files this month[^\n]*/, cap: "Gap note: funded files this month" },
    ];
    const found = [];
    for (const w of wants) {
      const m = w.re.exec(text);
      if (!m) continue;
      const range = document.createRange();
      range.setStart(pre.firstChild, m.index);
      range.setEnd(pre.firstChild, m.index + m[0].length);
      const rects = [...range.getClientRects()];
      if (!rects.length) continue;
      const top = Math.min(...rects.map((r) => r.top)) + window.scrollY;
      const left = Math.min(...rects.map((r) => r.left)) + window.scrollX;
      const right = Math.max(...rects.map((r) => r.right)) + window.scrollX;
      const bottom = Math.max(...rects.map((r) => r.bottom)) + window.scrollY;
      const box = document.createElement("div");
      box.style.cssText = `position:absolute;z-index:99999;border:3px solid #e00;pointer-events:none;top:${top - 4}px;left:${left - 6}px;width:${right - left + 12}px;height:${bottom - top + 8}px`;
      const tag = document.createElement("div");
      tag.textContent = String(w.n);
      tag.style.cssText = "position:absolute;left:-30px;top:-3px;background:#e00;color:#fff;font:bold 16px sans-serif;padding:2px 7px;border-radius:3px";
      box.appendChild(tag);
      document.body.appendChild(box);
      found.push({ n: w.n, cap: w.cap, line: m[0] });
    }
    if (found.length) {
      const legend = document.createElement("div");
      legend.style.cssText = "position:fixed;z-index:99999;right:16px;bottom:16px;max-width:560px;background:#fff;color:#111;border:3px solid #e00;padding:10px 12px;font:14px/1.4 sans-serif";
      legend.innerHTML = found.map((f) => `<div><b style="color:#e00">${f.n}</b> ${f.cap}: “${f.line.replace(/</g, "&lt;")}”</div>`).join("");
      document.body.appendChild(legend);
    }
    const first = document.querySelector("div[style*='border:3px solid #e00']");
    if (first) window.scrollTo(0, Math.max(0, first.getBoundingClientRect().top + window.scrollY - 200));
    return found;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${TAG}-load${i}.png`, fullPage: false });
  const fa = pj?.pulse?.bars?.funding_advisor || null;
  out.loads.push({
    load: i,
    pulse_status: pr ? pr.status() : null,
    period: pj?.pulse?.period ?? null,
    kpi_funded_count: pj?.pulse?.kpis?.funded_count ?? null,
    bar_funding_advisor: fa ? { target: fa.target, actual: fa.actual, rounds: fa.rounds ?? null, metric: fa.metric, missing: fa.missing } : null,
    gap_notes_funded: (pj?.pulse?.gaps?.notes || []).filter((n) => /[Ff]unded/.test(n)),
    screen_funded_tile: fundedTile,
    screen_ceo_funded_lines: fundedLines(ceoText),
    marks: marked.map((m) => `${m.n}: ${m.line}`),
  });
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
