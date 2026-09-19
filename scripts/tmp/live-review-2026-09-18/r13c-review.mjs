// Hole 13 round 2 — REVIEW (r13c). Different tester. LOOK ONLY on https://fundhub.ai.
//
// One password sign-in on /login.html. Then:
//   normal       — same browser, ?id= and ?client_id= once each (saved role present).
//   cookie-only  — ONLY the cookie the sign-in response set, copied into a fresh browser.
//                  Two fresh browsers per link (?id=, ?client_id=) = 4 first loads.
//   wiped        — the signed-in browser with local + session storage cleared before each
//                  load, cookie kept. Two per link = 4 loads.
//   stranger     — fresh browser, nothing at all, ?id= link. Must land on sign-in.
// Every load: greeting (#greeting), top name (#who-name + #who-av) and staff badge sampled
// every ~0.1 s for 10 s. Any "Chris" in greeting or top name at any moment = FAKE.
//
// Blocks every non-GET except the sign-in POST. Never prints a password, token or cookie value.
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r13c-review.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13/review3";
fs.mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), base: BASE, file: ELEVEN, runs: [], blocked: [] };

async function guard(ctx) {
  await ctx.route("**/*", (route) => {
    const req = route.request(); const m = req.method(); const u = new URL(req.url());
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      if (m === "POST" && u.origin === BASE && u.pathname === "/api/auth/login") return route.continue();
      out.blocked.push(`${m} ${u.pathname}`); return route.abort();
    }
    return route.continue();
  });
}

const STATE = () => {
  const t = (id) => { const e = document.getElementById(id); return e ? e.innerText.trim() : null; };
  let badge = null;
  for (const s of document.querySelectorAll("span")) { const x = s.innerText.trim(); if (/·\s*(owner|admin|staff|sales|closer|csm)/i.test(x)) { badge = x; break; } }
  let ls = null; try { ls = localStorage.getItem("fh_role"); } catch { ls = "ERR"; }
  return { path: location.pathname, greeting: t("greeting"), top: t("who-name"), av: t("who-av"), badge, fh_role: ls };
};
const BOXES = () => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; };
  let badge = null;
  for (const s of document.querySelectorAll("span")) { if (/·\s*(owner|admin|staff|sales|closer|csm)/i.test(s.innerText.trim())) { badge = s; break; } }
  const av = document.getElementById("who-av"), nm = document.getElementById("who-name");
  let top = null;
  const a = box(av), n = box(nm);
  if (a && n) top = { x: a.x, y: Math.min(a.y, n.y), w: n.x + n.w - a.x, h: Math.max(a.y + a.h, n.y + n.h) - Math.min(a.y, n.y) };
  else top = n || a;
  return { greeting: box(document.getElementById("greeting")), top, badge: box(badge) };
};

async function look(ctx, url, label) {
  const pg = await ctx.newPage();
  const api = [];
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  const t0 = Date.now();
  pg.on("response", (r) => {
    try { const u = new URL(r.url()); if (u.origin === BASE && u.pathname.startsWith("/api/")) api.push(`${Date.now() - t0}ms ${r.request().method()} ${u.pathname} ${r.status()}`); } catch { /* none */ }
  });
  await pg.goto(url, { waitUntil: "commit" });
  const samples = [];
  const shots = [];
  let firstNameShot = false;
  let tick = 0;
  while (Date.now() - t0 < 10000) {
    const ms = Date.now() - t0;
    const s = await pg.evaluate(STATE).catch((e) => ({ err: String(e.message || e).slice(0, 80) }));
    samples.push({ ms, ...s });
    if (!firstNameShot && (s.greeting || s.top)) {
      firstNameShot = true;
      const f = `${SHOTS}/${label}-first-name-${ms}ms.png`;
      const boxes = await pg.evaluate(BOXES).catch(() => null);
      await pg.screenshot({ path: f, clip: { x: 0, y: 0, width: 1440, height: 300 } }).catch(() => {});
      shots.push({ file: f, ms, boxes, state: s });
    }
    tick++;
    const next = t0 + tick * 100;
    const w = next - Date.now();
    if (w > 0) await pg.waitForTimeout(w);
  }
  const endState = await pg.evaluate(STATE).catch(() => null);
  const endBoxes = await pg.evaluate(BOXES).catch(() => null);
  const f10 = `${SHOTS}/${label}-10s.png`;
  await pg.screenshot({ path: f10, clip: { x: 0, y: 0, width: 1440, height: 300 } }).catch(() => {});
  shots.push({ file: f10, ms: Date.now() - t0, boxes: endBoxes, state: endState });
  const bodyHasEleven = await pg.evaluate(() => /Eleven|Sim Eleven/.test(document.body.innerText)).catch(() => null);
  const finalUrl = new URL(pg.url());
  await pg.close();
  // collapse into a timeline of distinct states
  const timeline = [];
  for (const s of samples) {
    const key = s.err ? `ERR ${s.err}` : `path=${s.path} | greeting="${s.greeting ?? ""}" | top="${s.top ?? ""}" av="${s.av ?? ""}" | badge="${s.badge ?? ""}" | fh_role=${s.fh_role}`;
    const last = timeline[timeline.length - 1];
    if (last && last.key === key) { last.to = s.ms; last.n++; } else timeline.push({ from: s.ms, to: s.ms, n: 1, key });
  }
  const chris = samples.filter((s) => /chris/i.test(s.greeting || "") || /chris/i.test(s.top || ""));
  const run = {
    label, url: url.replace(BASE, ""), final_path: finalUrl.pathname, final_search: finalUrl.search,
    sample_count: samples.length, chris_samples: chris.length,
    first_chris_ms: chris[0]?.ms ?? null, body_has_eleven_at_10s: bodyHasEleven,
    api, errors, timeline, shots,
  };
  out.runs.push(run);
  return run;
}

const portal = (param) => `${BASE}/app/client-portal.html?${param}=${ELEVEN}`;
const browser = await chromium.launch({ headless: true });

// sign in with the password form
const A = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(A);
const lp = await A.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", pw);
const lrP = lp.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
const lr = await lrP;
const setCookieNames = (await lr.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split("=")[0].trim());
out.login = { status: lr.status(), set_cookie_names: setCookieNames };
if (lr.status() !== 200 || setCookieNames.length === 0) {
  console.log("SIGN-IN FAILED", out.login);
  fs.writeFileSync(`${SHOTS}/review3.json`, JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(2);
}
await lp.waitForTimeout(2500);
out.after_login_path = new URL(lp.url()).pathname;
out.storage_after_login = await lp.evaluate(() => ({ local_keys: Object.keys(localStorage), session_keys: Object.keys(sessionStorage), fh_role: localStorage.getItem("fh_role") }));
const allCookies = await A.cookies();
out.all_cookie_names = allCookies.map((c) => `${c.name}@${c.domain}`);
const sessionCookies = allCookies.filter((c) => setCookieNames.includes(c.name));
out.copied_cookie_names = sessionCookies.map((c) => `${c.name}@${c.domain} httpOnly=${c.httpOnly}`);
await lp.close();

// 1. normal: same browser, saved role present
await look(A, portal("id"), "normal-id");
await look(A, portal("client_id"), "normal-client_id");

// 2. cookie-only: only the session cookie in a fresh browser, two per link
for (const param of ["id", "client_id"]) {
  for (const n of [1, 2]) {
    const B = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await guard(B);
    await B.addCookies(sessionCookies);
    await look(B, portal(param), `cookieonly-${param}-fresh${n}`);
    await B.close();
  }
}

// 3. wiped: signed-in browser, local + session storage cleared before each load, cookie kept
for (const param of ["id", "client_id"]) {
  for (const n of [1, 2]) {
    const c = await A.newPage();
    await c.goto(`${BASE}/robots.txt`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await c.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    const left = await c.evaluate(() => Object.keys(localStorage).length);
    await c.close();
    const r = await look(A, portal(param), `wiped-${param}-${n}`);
    r.local_keys_before = left;
  }
}
out.cookie_still_there_after_wiped = (await A.cookies()).some((c) => setCookieNames.includes(c.name));
await A.close();

// 4. stranger: nothing at all
const S = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(S);
await look(S, portal("id"), "stranger-id");
await S.close();

fs.writeFileSync(`${SHOTS}/review3.json`, JSON.stringify(out, null, 2));
console.log("login", out.login.status, "set-cookie names", out.login.set_cookie_names, "after login", out.after_login_path);
console.log("storage after login keys", out.storage_after_login.local_keys, "fh_role", out.storage_after_login.fh_role);
console.log("all cookies", out.all_cookie_names, "copied", out.copied_cookie_names);
for (const r of out.runs) {
  console.log(`\n=== ${r.label}  ${r.url}  final=${r.final_path}${r.final_search}  samples=${r.sample_count}  CHRIS=${r.chris_samples}${r.first_chris_ms != null ? " first@" + r.first_chris_ms + "ms" : ""}  eleven_on_page@10s=${r.body_has_eleven_at_10s}`);
  for (const t of r.timeline) console.log(`  ${String(t.from).padStart(5)}–${String(t.to).padStart(5)}ms (${t.n}) ${t.key}`);
  console.log("  api:", r.api.join(" ; "));
  if (r.errors.length) console.log("  page errors:", r.errors.join(" | "));
}
console.log("\ncookie kept after wipes", out.cookie_still_there_after_wiped);
console.log("blocked non-GETs", out.blocked);
await browser.close();
