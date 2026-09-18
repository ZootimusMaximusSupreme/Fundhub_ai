// Hole 19 — #12 progress page has no checklist. LOOK ONLY.
// Signs in as the owner through the real login page, opens #12's progress page
// twice with ?client_id= and twice with ?id=, and reads the one API that paints
// it (GET /api/read/client-progress). Blocks every non-GET request except the
// one sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h19-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.H19_BASE || "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-19";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, base: BASE, no_send: true, api: {}, loads: [], blocked: [] };

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
out.role = await page.evaluate(() => localStorage.getItem("fh_role"));
if (lr.status() !== 200) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

async function apiGet(path) {
  const r = await ctx.request.get(`${BASE}${path}`);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  return { status: r.status(), json: j };
}

function summarize(j) {
  if (!j) return null;
  return {
    ok: j.ok,
    stage: j.stage,
    waypointCount: Array.isArray(j.waypoints) ? j.waypoints.length : null,
    waypoints: (j.waypoints || []).map((w) => ({ key: w.key, title: w.title, state: w.state, owner: w.owner })),
    nextStep: j.nextStep,
    deliverables: (j.deliverables || []).map((d) => d.title || d.kind || d.name),
    paidServices: (j.paidServices || []).map((p) => p.key || p.serviceKey || p.label),
    keys: Object.keys(j),
  };
}

for (const n of [1, 2]) {
  const p12 = await apiGet(`/api/read/client-progress?client_id=${TWELVE}`);
  out.api[`twelve_${n}`] = { status: p12.status, ...summarize(p12.json) };
}
{
  const p11 = await apiGet(`/api/read/client-progress?client_id=${ELEVEN}`);
  out.api.eleven_control = { status: p11.status, ...summarize(p11.json) };
}

const urls = [
  ["client_id", `${BASE}/progress.html?client_id=${TWELVE}`],
  ["id", `${BASE}/progress.html?id=${TWELVE}`],
];
for (const [kind, url] of urls) {
  for (const n of [1, 2]) {
    const pg = await ctx.newPage();
    await pg.goto(url, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(8000);
    const look = await pg.evaluate(() => {
      const txt = (el) => (el ? el.innerText.replace(/\s*\n+\s*/g, " | ").trim() : null);
      return {
        finalUrl: location.href,
        title: document.title,
        sub: txt(document.getElementById("hSub")),
        next: txt(document.getElementById("cNext")),
        checklist: txt(document.getElementById("cWaypoints")),
        emailMeLink: /Email me a sign-in link/i.test(document.body.innerText),
      };
    });
    const shot = `${SHOTS}/${TAG}-${kind}-load${n}.png`;
    const wp = pg.locator("#cWaypoints");
    if (await wp.count()) {
      await wp.scrollIntoViewIfNeeded().catch(() => {});
    }
    await pg.screenshot({ path: shot, fullPage: false });
    const wshot = `${SHOTS}/${TAG}-${kind}-load${n}-checklist.png`;
    if (await wp.count() && await wp.isVisible()) await wp.screenshot({ path: wshot });
    out.loads.push({ kind, n, look, shot, wshot });
    await pg.close();
  }
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
