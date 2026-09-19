// Hole 13 — what the overnight audit most likely saw. LOOK ONLY.
// Signs in as the owner through the real login page (context A), then copies
// ONLY the session cookie into fresh browser contexts that have no saved role
// in localStorage — the "bare owner cookie" the card allowed. Opens #11 on ?id=
// and ?client_id= and samples the greeting + name pill. Also reloads once in
// the same context to see whether it corrects itself after shell.js caches the
// role. Blocks every non-GET except the sign-in POST. Never prints a password,
// token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h13-bare-cookie.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.H13_BASE || "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const TAG = process.argv[2] || "bare-cookie";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13";
mkdirSync(SHOTS, { recursive: true });

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");
const out = { at: new Date().toISOString(), tag: TAG, base: BASE, no_send: true, runs: [], blocked: [] };

function guard(ctx) {
  return ctx.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const path = new URL(req.url()).pathname;
    if (m === "POST" && path === "/api/auth/login") return route.continue();
    out.blocked.push(`${m} ${path}`);
    return route.abort();
  });
}

const browser = await chromium.launch({ headless: true });
const a = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(a);
const lp = await a.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", password);
const lrP = lp.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
const lr = await lrP;
out.login = { status: lr.status() };
await lp.waitForTimeout(2000);
const cookies = await a.cookies();
out.cookie_names = cookies.map((c) => c.name);

const SAMPLE_AT = [800, 1500, 3000, 5000, 8000, 12000];
async function look(ctx, param, label) {
  const pg = await ctx.newPage();
  const api = [];
  pg.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/dashboard/client") || u.pathname === "/api/auth/session") api.push(`${u.pathname} ${r.status()}`);
  });
  const t0 = Date.now();
  await pg.goto(`${BASE}/app/client-portal.html?${param}=${ELEVEN}`, { waitUntil: "commit" });
  const samples = [];
  for (const at of SAMPLE_AT) {
    const w = at - (Date.now() - t0);
    if (w > 0) await pg.waitForTimeout(w);
    samples.push({ ms: at, ...(await pg.evaluate(() => ({
      greeting: document.getElementById("greeting")?.innerText.trim() ?? null,
      pill: document.getElementById("who-name")?.innerText.trim() ?? null,
      ownRows: document.querySelectorAll("#own-list .own").length,
      fh_role: localStorage.getItem("fh_role"),
    })).catch((e) => ({ err: String(e).slice(0, 100) }))) });
  }
  const shot = `${SHOTS}/${TAG}-${label}.png`;
  await pg.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1440, height: 260 } }).catch(() => {});
  await pg.close();
  return { label, door: `?${param}=`, url_end: pg.url ? undefined : undefined, api, samples, shot };
}

for (const param of ["id", "client_id"]) {
  for (const n of [1, 2]) {
    const b = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await guard(b);
    await b.addCookies(cookies);
    const first = await look(b, param, `${param}-fresh${n}-first`);
    const second = await look(b, param, `${param}-fresh${n}-reload`);
    out.runs.push(first, second);
    await b.close();
  }
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
for (const r of out.runs) {
  console.log(`\n${r.label}  api: ${r.api.join(" ; ")}`);
  for (const s of r.samples) console.log(`  ${String(s.ms).padStart(5)}ms greeting="${s.greeting}" pill="${s.pill}" ownRows=${s.ownRows} fh_role=${s.fh_role}${s.err ? " ERR " + s.err : ""}`);
}
console.log("\nlogin", out.login, "blocked", out.blocked);
await browser.close();
