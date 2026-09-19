// Hole 5 look only. GET only; every non-GET request is aborted and logged.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const OUT = "/tmp/live-fix-2026-09-17/hole-5";
const RUNS = Number(process.env.RUNS || 3);
mkdirSync(OUT, { recursive: true });

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
// Record every change to the name line with its time since navigation start.
await context.addInitScript(() => {
  window.__nameLog = [];
  const start = () => {
    const el = document.getElementById("ccp-name");
    if (!el) return false;
    const rec = () => window.__nameLog.push({ t: Math.round(performance.now()), name: el.textContent, key: (document.getElementById("ccp-key") || {}).textContent });
    rec();
    new MutationObserver(rec).observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!start()) document.addEventListener("DOMContentLoaded", start);
});

const blocked = [];
await context.route("**/*", (route) => {
  const r = route.request();
  if (r.method() !== "GET" && r.method() !== "HEAD" && r.method() !== "OPTIONS") {
    blocked.push({ method: r.method(), url: r.url() });
    return route.abort();
  }
  return route.continue();
});

const runs = [];
for (let i = 1; i <= RUNS; i++) {
  const page = await context.newPage();
  const reqs = new Map();
  page.on("request", (r) => { if (r.url().includes("/api/") || r.url().includes("/app/")) reqs.set(r, { url: r.url().replace(BASE, ""), method: r.method(), start: Date.now() }); });
  page.on("requestfinished", async (r) => { const x = reqs.get(r); if (!x) return; x.end = Date.now(); try { x.status = (await r.response())?.status(); } catch {} const t = r.timing(); x.timing = t; });
  page.on("requestfailed", (r) => { const x = reqs.get(r); if (x) { x.end = Date.now(); x.failed = r.failure()?.errorText; } });
  const t0 = Date.now();
  await page.goto(`${BASE}/app/client-control-panel.html?id=${NINE}`, { waitUntil: "commit", timeout: 45_000 });
  const shots = {};
  for (const ms of [800, 2000, 3000]) {
    const wait = ms - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const p = `${OUT}/${process.env.TAG || ""}run${i}-${ms}ms.png`;
    await page.screenshot({ path: p });
    shots[ms] = { name: await page.locator("#ccp-name").textContent().catch(() => null), picker: await page.evaluate(() => { const s = document.querySelector("select"); return s ? (s.selectedOptions[0] || {}).textContent : null; }).catch(() => null) };
  }
  let loadedAt = null;
  try {
    await page.waitForFunction(() => /Nine/i.test((document.getElementById("ccp-name") || {}).textContent || ""), null, { timeout: 30_000 });
    loadedAt = Date.now() - t0;
  } catch { loadedAt = "timeout 30s"; }
  await page.screenshot({ path: `${OUT}/${process.env.TAG || ""}run${i}-loaded.png` });
  await page.waitForTimeout(1500);
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { responseEnd: Math.round(n.responseEnd), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; });
  const nameLog = await page.evaluate(() => window.__nameLog);
  const api = [...reqs.values()].map((x) => ({ ...x, startMs: x.start - t0, endMs: x.end ? x.end - t0 : null, durMs: x.end ? x.end - x.start : null, timing: undefined }))
    .sort((a, b) => a.startMs - b.startMs);
  runs.push({ run: i, loadedAtMs: loadedAt, nav, shots, nameLog, api });
  console.log(`run ${i}: name shows Nine at ${loadedAt} ms; shots`, JSON.stringify(shots));
  await page.close();
}
writeFileSync(`${OUT}/${process.env.TAG || "look"}.json`, JSON.stringify({ runs, blocked }, null, 2));
console.log("blocked non-GET:", JSON.stringify(blocked));
await browser.close();
await db.end?.();
process.exit(0);
