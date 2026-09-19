// Hole 5: open the #9 control panel in several tabs at once (forces fresh
// server instances), and time how long each shows "Loading…". GET only.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";
const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const OUT = "/tmp/live-fix-2026-09-17/hole-5";
const TABS = Number(process.env.TABS || 5);
const TAG = process.env.TAG || "burst";
const staff = (await db.query(`SELECT id, org_id FROM staff WHERE lower(email)=lower($1) LIMIT 1`, ["chris@fundhub.ai"])).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
const browser = await chromium.launch({ headless: true });
async function one(i) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addCookies([
    { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
  ]);
  await context.route("**/*", (route) => {
    const m = route.request().method();
    return (m === "GET" || m === "HEAD" || m === "OPTIONS") ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const api = [];
  const starts = new Map();
  const t0 = Date.now();
  page.on("request", (r) => { if (r.url().includes("/api/")) starts.set(r, Date.now()); });
  page.on("requestfinished", async (r) => { if (starts.has(r)) api.push({ url: r.url().replace(BASE, "").slice(0, 70), startMs: starts.get(r) - t0, durMs: Date.now() - starts.get(r), status: (await r.response())?.status() }); });
  await page.goto(`${BASE}/app/client-control-panel.html?id=${NINE}`, { waitUntil: "commit", timeout: 45_000 });
  const firstPaint = await page.waitForFunction(() => document.getElementById("ccp-name")?.textContent, null, { timeout: 30_000 }).then(() => ({ ms: Date.now() - t0 }));
  const firstName = await page.locator("#ccp-name").textContent();
  let loadedMs = null;
  try { await page.waitForFunction(() => /Nine/i.test(document.getElementById("ccp-name")?.textContent || ""), null, { timeout: 30_000, polling: 50 }); loadedMs = Date.now() - t0; } catch { loadedMs = "timeout"; }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${TAG}-tab${i}.png` });
  await context.close();
  return { tab: i, firstPaintMs: firstPaint.ms, firstName, loadedMs, dashClient: api.find((a) => a.url.startsWith("/api/dashboard/client?")), slowest: api.sort((a, b) => b.durMs - a.durMs).slice(0, 4) };
}
const res = await Promise.all(Array.from({ length: TABS }, (_, i) => one(i + 1)));
for (const r of res) console.log(`tab ${r.tab}: first text "${r.firstName}" at ${r.firstPaintMs}ms; Nine shows at ${r.loadedMs}ms; dashboard/client ${r.dashClient?.durMs}ms; slowest ${r.slowest.map((a) => a.url.split("?")[0] + "=" + a.durMs).join(", ")}`);
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(res, null, 2));
await browser.close(); process.exit(0);
