// Hole 13 — staff portal ?id= greets Chris, not Sim, on #11. LOOK ONLY.
// Signs in as the owner through the real login page, then opens #11's portal
// several times on ?id= and on ?client_id=. Samples the greeting and the name
// pill from first paint until the page settles, and logs the staff read that
// paints the name (/api/dashboard/client). Blocks every non-GET request except
// the one sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h13-verify.mjs [tag] [loadsPerDoor]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.H13_BASE || "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const TAG = process.argv[2] || "verify";
const LOADS = Number(process.argv[3] || 3);
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, base: BASE, no_send: true, loads: [], blocked: [] };

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

const SAMPLE_AT = [300, 800, 1500, 2500, 3500, 5000, 8000, 12000];
const doors = [];
for (let i = 1; i <= LOADS; i++) { doors.push(["id", i]); doors.push(["client_id", i]); }

for (const [param, n] of doors) {
  const pg = await ctx.newPage();
  const api = [];
  pg.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/dashboard/client") || u.pathname === "/api/auth/session") {
      api.push({ t: Date.now(), path: u.pathname + (u.search ? "?" + u.searchParams.toString().replace(/[a-f0-9-]{36}/g, "<id>") : ""), status: r.status() });
    }
  });
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  const t0 = Date.now();
  await pg.goto(`${BASE}/app/client-portal.html?${param}=${ELEVEN}`, { waitUntil: "commit" });
  const samples = [];
  for (const at of SAMPLE_AT) {
    const wait = at - (Date.now() - t0);
    if (wait > 0) await pg.waitForTimeout(wait);
    const s = await pg.evaluate(() => ({
      greeting: document.getElementById("greeting")?.innerText.trim() ?? null,
      pill: document.getElementById("who-name")?.innerText.trim() ?? null,
      own: Array.from(document.querySelectorAll("#own-list .own")).map((r) => r.innerText.replace(/\s+/g, " ").trim().slice(0, 60)),
    })).catch((e) => ({ err: String(e).slice(0, 120) }));
    samples.push({ ms: at, ...s });
  }
  const shot = `${SHOTS}/${TAG}-${param}-load${n}.png`;
  await pg.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1440, height: 260 } });
  out.loads.push({
    door: `?${param}=`, n, url: pg.url().replace(ELEVEN, "<eleven>"),
    api: api.map((a) => ({ ms: a.t - t0, path: a.path, status: a.status })),
    samples, errors, shot,
  });
  await pg.close();
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
for (const l of out.loads) {
  console.log(`\n${l.door} load ${l.n}  url=${l.url}`);
  console.log("  api:", l.api.map((a) => `${a.ms}ms ${a.path} ${a.status}`).join(" ; "));
  for (const s of l.samples) console.log(`  ${String(s.ms).padStart(5)}ms  greeting="${s.greeting}"  pill="${s.pill}"  ownRows=${(s.own || []).length}${s.err ? " ERR " + s.err : ""}`);
  if (l.errors.length) console.log("  pageerrors:", l.errors);
}
console.log("\nlogin", out.login, "role", out.role, "blocked", out.blocked);
await browser.close();
