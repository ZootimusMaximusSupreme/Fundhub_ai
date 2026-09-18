// Hole N19 — What You Own shows both footer lines at once when it has rows. LOOK ONLY.
// Signs in as the owner through the real login page, opens the portal for a
// file WITH rows (#11, #12) and a file with NO rows (#13), twice each, and reads
// which What You Own footer lines are actually on screen (computed display).
// Blocks every non-GET request except the one sign-in POST. Never prints a
// password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n19-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.N19_BASE || "https://fundhub.ai";
const FILES = {
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  thirteen: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042",
};
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N19";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, base: BASE, no_send: true, loads: [], blocked: [] };
const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
// N19_LOCAL_PAGE=<path>: serve this checkout's client-portal.html in place of
// the deployed one (pre-ship proof). Everything else — sign-in, every API read —
// is still the live site.
const LOCAL_PAGE = process.env.N19_LOCAL_PAGE ? readFileSync(process.env.N19_LOCAL_PAGE, "utf8") : null;
out.local_page = !!LOCAL_PAGE;
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (LOCAL_PAGE && m === "GET" && new URL(req.url()).pathname === "/app/client-portal.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: LOCAL_PAGE });
  }
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

for (const [name, id] of Object.entries(FILES)) {
  for (const n of [1, 2]) {
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/app/client-portal.html?client_id=${id}`, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(9000);
    const look = await pg.evaluate(() => {
      const shown = (el) => !!el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
      const feet = Array.from(document.querySelectorAll(".own-foot")).map((f) => ({
        cls: f.className, text: f.innerText.replace(/\s+/g, " ").trim(),
        display: getComputedStyle(f).display, onScreen: shown(f),
      }));
      return {
        welcome: document.querySelector("h1")?.innerText.trim() || null,
        bodyNoOwn: document.body.classList.contains("no-own"),
        rowCount: document.querySelectorAll("#own-list .own").length,
        emptyBoxOnScreen: shown(document.getElementById("own-empty")),
        feet,
        footLinesOnScreen: feet.filter((f) => f.onScreen).map((f) => f.text),
      };
    });
    const shot = `${SHOTS}/${TAG}-${name}-load${n}.png`;
    const own = pg.locator("#own-t").locator("xpath=ancestor::section[1]");
    await own.scrollIntoViewIfNeeded();
    await own.screenshot({ path: shot });
    // Where each on-screen footer line sits inside that shot, for the red boxes.
    const sb = await own.boundingBox();
    const marks = [];
    for (const f of await pg.locator(".own-foot").all()) {
      const b = await f.boundingBox();
      if (!b || !(await f.isVisible())) continue;
      marks.push({ x: b.x - sb.x, y: b.y - sb.y, w: b.width, h: b.height, text: (await f.innerText()).trim() });
    }
    out.loads.push({ file: name, n, look, shot, marks });
    await pg.close();
  }
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
