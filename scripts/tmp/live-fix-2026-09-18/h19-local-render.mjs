// Hole 19 — the NEW progress page, before ship, against #12's REAL live data.
// Signs in as the owner on the live site, then swaps only the HTML of
// /progress.html for this checkout's copy. Every /api/ read still goes to the
// live server. Blocks every non-GET request except the one sign-in POST.
// Nothing is sent. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h19-local-render.mjs [tag]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_HTML = fs.readFileSync(path.join(ROOT, "public/progress.html"), "utf8");
const BASE = "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const TAG = process.argv[2] || "local-new";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-19";
fs.mkdirSync(SHOTS, { recursive: true });

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), tag: TAG, no_send: true, loads: [], blocked: [] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  const u = new URL(req.url());
  if (m === "GET" && u.origin === BASE && u.pathname === "/progress.html") {
    return route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
  }
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && u.pathname === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${u.pathname}`);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const lr = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
out.login = { status: (await lr).status() };
await page.waitForTimeout(2500);

for (const [who, id] of [["twelve", TWELVE], ["twelve", TWELVE], ["eleven-control", ELEVEN]]) {
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/progress.html?client_id=${id}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(7000);
  const look = await pg.evaluate(() => {
    const txt = (el) => (el ? el.innerText.replace(/\s*\n+\s*/g, " | ").trim() : null);
    return {
      sub: txt(document.getElementById("hSub")),
      next: txt(document.getElementById("cNext")),
      checklist: txt(document.getElementById("cWaypoints")),
      newCopy: /There is no checklist on your file right now/.test(document.body.innerText),
      oldCopy: /has not been set up yet/.test(document.body.innerText),
    };
  });
  const n = out.loads.length + 1;
  const shot = `${SHOTS}/${TAG}-${who}-load${n}.png`;
  const wp = pg.locator("#cWaypoints");
  await wp.scrollIntoViewIfNeeded().catch(() => {});
  await wp.screenshot({ path: shot });
  out.loads.push({ who, look, shot });
  await pg.close();
}

fs.writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
