// Hole 11 — Course #12 What You Own is empty. LOOK ONLY.
// Signs in as the owner through the real login page, opens #12's portal twice,
// reads What You Own + Unlock More, and reads the two APIs that paint them
// (entitlements, portal-summary). Blocks every non-GET request except the one
// sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h11-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.H11_BASE || "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-11";
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
{
  const e = await apiGet(`/api/read/entitlements?client_id=${TWELVE}&limit=200`);
  const items = e.json?.data?.items || e.json?.items || [];
  out.api.entitlements = {
    status: e.status,
    items: items.map((i) => ({
      code: i.entitlement_code, name: i.entitlement_name, active: i.active,
      source: i.source || i.source_type || null, product: i.product_code || i.product_name || null,
      granted_at: i.granted_at || i.created_at || null,
    })),
  };
  const p = await apiGet(`/api/read/portal-summary?client_id=${TWELVE}`);
  const pd = p.json?.data || p.json || {};
  out.api.portal_summary = {
    status: p.status,
    stage: pd.stage,
    documents: (pd.documents || []).map((d) => ({ kind: d.kind, subtype: d.subtype, title: d.title, download: d.download ? "(present)" : null })),
    keys: Object.keys(pd),
  };
}

for (const n of [1, 2]) {
  const pg = n === 1 ? page : await ctx.newPage();
  await pg.goto(`${BASE}/app/client-portal.html?id=${TWELVE}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(9000);
  const look = await pg.evaluate(() => {
    const txt = (el) => (el ? el.innerText.replace(/\s*\n+\s*/g, " | ").trim() : null);
    const own = document.getElementById("own-t")?.closest("section");
    const tiles = Array.from(document.querySelectorAll("[data-tile]")).map((t) => ({
      key: t.getAttribute("data-tile"), locked: t.classList.contains("locked"),
      hidden: t.classList.contains("hidden") || getComputedStyle(t).display === "none",
      badge: t.querySelector(".lockrow")?.innerText.trim(), price: t.querySelector(".tp")?.innerText.trim(),
    }));
    return {
      welcome: txt(document.querySelector("h1")),
      bodyNoOwn: document.body.classList.contains("no-own"),
      own: txt(own),
      ownRows: Array.from(document.querySelectorAll("#own-list .own")).map((r) => r.innerText.replace(/\s+/g, " ").trim()),
      tiles,
    };
  });
  const shot = `${SHOTS}/${TAG}-load${n}.png`;
  const own = pg.locator("section[aria-labelledby='own-t']");
  await own.scrollIntoViewIfNeeded();
  await own.screenshot({ path: shot });
  const tshot = `${SHOTS}/${TAG}-load${n}-tiles.png`;
  const un = pg.locator("section[aria-labelledby='unlock-t']");
  await un.scrollIntoViewIfNeeded();
  await un.screenshot({ path: tshot });
  out.loads.push({ n, look, shot, tshot });
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
