// N13 — the progress page AS IT WILL BE after ship, on #12's and #11's real
// live rows, before anything ships.
//
//   1. Runs THIS BRANCH's readClientProgress against the live database inside
//      BEGIN READ ONLY (then ROLLBACK) — the payload the new endpoint will give.
//   2. Signs in as the owner on the live site, swaps /progress.html for this
//      checkout's copy and answers /api/read/client-progress with that payload.
//      Every other read goes to the live server. Every non-GET request except
//      the one sign-in POST is blocked. Nothing is sent or written.
//
// LIVE=1 skips both swaps and shows the live site exactly as it is (the before
// look, and the reviewer's after-ship look).
//
// Never prints a password, token or cookie.
// Run: [LIVE=1] [VIEWPORT_W=375] node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n13-local-render.mjs [tag]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../../src/db.mjs";
import { readClientProgress } from "../../../src/progress/read.mjs";

const { chromium } = await import(process.env.PW_MODULE || "playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_HTML = fs.readFileSync(path.join(ROOT, "public/progress.html"), "utf8");
const BASE = "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const LIVE = process.env.LIVE === "1";
const TAG = process.argv[2] || (LIVE ? "live" : "local-new");
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N13";
fs.mkdirSync(SHOTS, { recursive: true });

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

// 1. The new payloads, read-only.
const payloads = {};
if (!LIVE) {
  const c = await pool().connect();
  try {
    await c.query("BEGIN READ ONLY");
    for (const id of [TWELVE, ELEVEN]) {
      const org = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [id])).rows[0].org_id;
      payloads[id] = await readClientProgress(c, { orgId: org, clientId: id });
    }
    await c.query("ROLLBACK");
  } finally {
    c.release();
    await pool().end();
  }
}

const out = { at: new Date().toISOString(), tag: TAG, live: LIVE, no_send: true, loads: [], blocked: [] };
const browser = await chromium.launch({ headless: true });
const W = Number(process.env.VIEWPORT_W || 1280);
const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  const u = new URL(req.url());
  if (!LIVE && m === "GET" && u.origin === BASE && u.pathname === "/progress.html") {
    return route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
  }
  if (!LIVE && m === "GET" && u.origin === BASE && u.pathname === "/api/read/client-progress") {
    const p = payloads[u.searchParams.get("client_id")];
    if (p) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...p }) });
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

for (const [who, id] of [["twelve", TWELVE], ["eleven", ELEVEN]]) {
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/progress.html?client_id=${id}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(6000);
  const look = await pg.evaluate(() => {
    const txt = (el) => (el ? el.innerText.replace(/\s*\n+\s*/g, " | ").trim() : null);
    return {
      fatal: txt(document.getElementById("fatal")),
      docs: txt(document.getElementById("cDocs")),
      timeline: txt(document.getElementById("cTimeline"))
    };
  });
  const docsShot = `${SHOTS}/${TAG}-${who}-docs-history.png`;
  const docs = pg.locator("#cDocs");
  await docs.scrollIntoViewIfNeeded().catch(() => {});
  const a = await docs.boundingBox();
  const b = await pg.locator("#cTimeline").boundingBox();
  let boxes = null;
  if (a && b) {
    const y = Math.max(0, a.y - 40);
    await pg.screenshot({ path: docsShot, clip: { x: 0, y, width: W, height: Math.min(1000, b.y + b.height - y + 20) } });
    // Element boxes in the saved image's own pixels, for the red-box markup.
    boxes = {
      docs: { x: a.x, y: a.y - y, w: a.width, h: a.height },
      timeline: { x: b.x, y: b.y - y, w: b.width, h: b.height }
    };
  }
  out.loads.push({ who, look, shot: docsShot, boxes });
  await pg.close();
}

fs.writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
