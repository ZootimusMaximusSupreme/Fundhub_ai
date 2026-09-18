// Hole N15 — sidebar "Client Portal" link on a client's control panel opens a
// portal with no client. LOOK ONLY. Signs in as the owner through the real
// login page, opens #11's control panel, reads the sidebar Client Portal row's
// href, clicks it (twice, in two fresh tabs), and records what the portal shows.
// Also reads the same row on Pipeline and Documents (the "elsewhere" baseline).
// Blocks every non-GET request except the one sign-in POST. Never prints a
// password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N15-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.N15_BASE || "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N15";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), base: BASE, tag: TAG, no_send: true, loads: [], elsewhere: [], blocked: [] };
const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

// N15_LOCAL_SHELL=<path>: serve this branch's public/app/shell.js in place of
// the live one (pre-ship proof on live data). Unset = the live site as shipped.
const LOCAL_SHELL = process.env.N15_LOCAL_SHELL || "";
out.local_shell = !!LOCAL_SHELL;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  if (LOCAL_SHELL && new URL(route.request().url()).pathname === "/app/shell.js") {
    return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(LOCAL_SHELL, "utf8") });
  }
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

function portalRow(pg) {
  return pg.evaluate(() => {
    const links = Array.from(document.querySelectorAll("#side a.navitem"));
    const a = links.find((x) => /Client Portal/.test(x.textContent || ""));
    if (!a) return null;
    return { href: a.getAttribute("href"), gated: a.hasAttribute("data-fh-gated") };
  });
}

function portalState(pg) {
  return pg.evaluate(() => {
    const body = document.body ? document.body.innerText : "";
    return {
      url: location.pathname + location.search,
      couldNotLoad: /could not load your file/i.test(body),
      namesEleven: /Eleven/i.test(body),
      head: body.replace(/\s+/g, " ").trim().slice(0, 400),
    };
  });
}

// ── From #11's control panel, twice, each in a fresh tab.
for (const n of [1, 2]) {
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app/client-control-panel.html?id=${ELEVEN}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(7000);
  const row = await portalRow(pg);
  // Open the Portals group if it is collapsed, then click the row like a person.
  await pg.evaluate(() => {
    const g = document.querySelector('#side .navgroup[data-fh-section="portals"]');
    if (g && g.classList.contains("closed")) g.querySelector(".navhead").click();
  });
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: `${SHOTS}/${TAG}-ccp${n}.png` });
  const link = pg.locator("#side a.navitem", { hasText: "Client Portal" });
  await link.scrollIntoViewIfNeeded();
  await Promise.all([pg.waitForURL(/client-portal\.html/, { timeout: 15000 }), link.click()]);
  await pg.waitForTimeout(9000);
  const st = await portalState(pg);
  await pg.screenshot({ path: `${SHOTS}/${TAG}-portal${n}.png` });
  out.loads.push({ n, row, portal: st });
  await pg.close();
}

// ── Elsewhere baseline: the same row on Pipeline and on Documents.
for (const scr of ["pipeline.html", "documents.html"]) {
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app/${scr}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(5000);
  out.elsewhere.push({ screen: scr, row: await portalRow(pg) });
  await pg.close();
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
