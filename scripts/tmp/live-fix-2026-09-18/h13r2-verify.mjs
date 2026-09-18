// Hole 13 round 2 — staff portal ?id= greets Chris, not Sim, on #11. LOOK ONLY.
//
// Five browsers, all on https://fundhub.ai, all read-only:
//   normal      — password sign-in on /login.html, then the portal in the SAME
//                 browser (the saved role is there). Expect "Welcome back, Sim".
//   cookie-only — only the sign-in cookie copied into a fresh browser: no saved
//                 role, no token in local storage. The hole: "Welcome back, Chris".
//   wiped       — signed in, then local storage cleared in the same browser, the
//                 cookie kept. Same as cookie-only, reached the other way.
//   client      — no staff cookie at all; /api/auth/session answers as a CLIENT
//                 principal for #11 (canned, the real shape — no client password
//                 exists to sign in with, and minting a session would be a write).
//                 Run twice: with the client's saved role, and with none.
//                 Expect "Welcome back, Sim" from the session, and no staff read.
//   stranger    — no cookie, no token, real session answer. Expect a bounce to
//                 a sign-in page.
//
// --local swaps ONLY /app/client-portal.html for this checkout's copy. Every
// other file and every /api/ call is the live site's, so the fixed page is
// proved against live data before it ships.
//
// Blocks every non-GET except the sign-in POST. Never prints a password, token
// or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h13r2-verify.mjs [--local] [tag]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const LOCAL = process.argv.includes("--local");
const TAG = process.argv.filter((a) => !a.startsWith("--")).slice(2)[0] || (LOCAL ? "local" : "live");
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13/round2";
fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_PAGE = LOCAL ? fs.readFileSync(path.join(ROOT, "public/app/client-portal.html"), "utf8") : null;

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");
const out = { at: new Date().toISOString(), tag: TAG, base: BASE, local_page: LOCAL, no_send: true, runs: [], blocked: [] };

const CLIENT_SESSION = {
  ok: true,
  principal: "client",
  staff: {
    id: "h13r2-canned-client", role: "client", name: "Sim Eleven-Blueprint",
    status: "active", principal_kind: "client", client_id: ELEVEN
  },
  had_call: true
};

async function guard(ctx, { clientSession = false } = {}) {
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    const u = new URL(req.url());
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      if (m === "POST" && u.pathname === "/api/auth/login") return route.continue();
      out.blocked.push(`${m} ${u.pathname}`);
      return route.abort();
    }
    if (clientSession && u.pathname === "/api/auth/session") return route.fulfill({ json: CLIENT_SESSION });
    if (LOCAL_PAGE && u.origin === BASE && u.pathname === "/app/client-portal.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: LOCAL_PAGE });
    }
    return route.continue();
  });
}

const SAMPLE_AT = [800, 1500, 3000, 5000, 8000];
async function look(ctx, url, label) {
  const pg = await ctx.newPage();
  const api = [];
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  pg.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/dashboard/client") || u.pathname === "/api/auth/session") api.push(`${u.pathname} ${r.status()}`);
  });
  const t0 = Date.now();
  await pg.goto(url, { waitUntil: "commit" });
  const samples = [];
  for (const at of SAMPLE_AT) {
    const w = at - (Date.now() - t0);
    if (w > 0) await pg.waitForTimeout(w);
    samples.push({ ms: at, ...(await pg.evaluate(() => ({
      path: location.pathname,
      greeting: document.getElementById("greeting")?.innerText.trim() ?? null,
      pill: document.getElementById("who-name")?.innerText.trim() ?? null,
      fh_role: localStorage.getItem("fh_role"),
    })).catch((e) => ({ err: String(e).slice(0, 100) }))) });
  }
  const shot = `${SHOTS}/${TAG}-${label}.png`;
  await pg.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1440, height: 300 } }).catch(() => {});
  const finalPath = new URL(pg.url()).pathname;
  await pg.close();
  const run = { label, url: url.replace(BASE, ""), final_path: finalPath, api, errors, samples, shot };
  out.runs.push(run);
  return run;
}

const portal = (param) => `${BASE}/app/client-portal.html?${param}=${ELEVEN}`;
const browser = await chromium.launch({ headless: true });

// 1. normal sign-in, same browser
const a = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(a);
const lp = await a.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", password);
const lrP = lp.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
out.login = { status: (await lrP).status() };
await lp.waitForTimeout(2000);
out.saved_role_after_login = await lp.evaluate(() => localStorage.getItem("fh_role"));
const cookies = await a.cookies();
out.cookie_names = cookies.map((c) => c.name);
await look(a, portal("id"), "normal-id");
await look(a, portal("client_id"), "normal-client_id");

// 2. wiped: same browser, local storage cleared, cookie kept
await lp.evaluate(() => localStorage.clear());
await lp.close();
await look(a, portal("id"), "wiped-id-first");
await a.close();

// 3. cookie-only: fresh browser, only the cookie
for (const param of ["id", "client_id"]) {
  const b = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await guard(b);
  await b.addCookies(cookies);
  await look(b, portal(param), `cookie-only-${param}-first`);
  await look(b, portal(param), `cookie-only-${param}-reload`);
  await b.close();
}

// 4. client-style: no staff cookie, the session answers as #11's client account
for (const saved of ["client", ""]) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await guard(c, { clientSession: true });
  if (saved) await c.addInitScript((r) => { try { localStorage.setItem("fh_role", r); } catch { /* none */ } }, saved);
  await look(c, `${BASE}/app/client-portal.html`, `client-own-link-role-${saved || "none"}`);
  await c.close();
}

// 5. stranger: nothing at all
const s = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(s);
await look(s, portal("id"), "stranger-id");
await s.close();

fs.writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
for (const r of out.runs) {
  console.log(`\n${r.label}  final=${r.final_path}  api: ${r.api.join(" ; ")}${r.errors.length ? "  ERRORS " + r.errors.join(" | ") : ""}`);
  for (const x of r.samples) console.log(`  ${String(x.ms).padStart(5)}ms path=${x.path} greeting="${x.greeting}" pill="${x.pill}" fh_role=${x.fh_role}${x.err ? " ERR " + x.err : ""}`);
}
console.log("\nlogin", out.login, "saved role after login", out.saved_role_after_login, "blocked", out.blocked);
await browser.close();
