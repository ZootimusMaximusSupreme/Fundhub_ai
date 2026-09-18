// Hole N14 — staff portal shows "We could not load your file…" for about a
// second before the client loads. LOOK ONLY.
//
// Records, from the very first paint, every text the line under the greeting
// (#greeting-sub-pre) shows and whether it is on screen, with the time. Takes a
// screenshot the first time the error text is on screen.
//
// Runs (all on https://fundhub.ai):
//   staff-id-first / staff-id-reload — password sign-in, then #11's portal by ?id=
//                                      (the path the hole-13 reviewers saw it on)
//   staff-id-nine                    — #9 (repair, no funding): the line stays on
//                                      screen after the load
//   staff-no-id                      — same staff browser, portal with NO id: a
//                                      real failure; the error text must show
//   staff-bogus-id                   — same staff browser, an id that is no file:
//                                      a real failure; the error text must show
//   stranger-no-id                   — no sign-in at all, no id
//   client-own-link                  — /api/auth/session canned as #11's client
//                                      principal (read-only, the real shape): a
//                                      successful client load
//   client-no-file                   — session canned as a client with no file:
//                                      a real failure; the error text must show
//
// --local swaps ONLY /app/client-portal.html for this checkout's copy; every
// other file and every /api/ call is the live site's.
//
// Blocks every non-GET except the sign-in POST. Never prints a password, token
// or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n14-verify.mjs [--local] [tag]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const ERR = "We could not load your file";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd"; // Sim Nine-Repair: no funding, so the line stays on screen
const BOGUS = "00000000-0000-4000-8000-000000000000"; // no such file
const LOCAL = process.argv.includes("--local");
const TAG = process.argv.filter((a) => !a.startsWith("--")).slice(2)[0] || (LOCAL ? "local" : "live");
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N14";
fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_PAGE = LOCAL ? fs.readFileSync(path.join(ROOT, "public/app/client-portal.html"), "utf8") : null;

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");
const out = { at: new Date().toISOString(), tag: TAG, base: BASE, local_page: LOCAL, no_send: true, runs: [], blocked: [] };

const clientSession = (clientId) => ({
  ok: true,
  principal: "client",
  staff: {
    id: "n14-canned-client", role: "client", name: clientId ? "Sim Eleven-Blueprint" : "No File",
    status: "active", principal_kind: "client", client_id: clientId
  },
  had_call: true
});

async function guard(ctx, { session = null } = {}) {
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    const u = new URL(req.url());
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      if (m === "POST" && u.pathname === "/api/auth/login") return route.continue();
      out.blocked.push(`${m} ${u.pathname}`);
      return route.abort();
    }
    if (session && u.pathname === "/api/auth/session") return route.fulfill({ json: session });
    if (LOCAL_PAGE && u.origin === BASE && u.pathname === "/app/client-portal.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: LOCAL_PAGE });
    }
    return route.continue();
  });
  // Timeline recorder: every animation frame from document start, log each
  // change of the line's text or visibility, with ms since navigation start.
  await ctx.addInitScript(() => {
    window.__n14 = [];
    let last = "";
    const tick = () => {
      const el = document.getElementById("greeting-sub-pre");
      if (el) {
        const vis = getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
        const text = el.textContent.trim();
        const key = `${vis}|${text}`;
        if (key !== last) {
          last = key;
          window.__n14.push({ ms: Math.round(performance.now()), visible: vis, text });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function look(ctx, url, label) {
  const pg = await ctx.newPage();
  const api = [];
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  pg.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/dashboard/client") || u.pathname === "/api/auth/session" ||
        u.pathname.startsWith("/api/read/portal")) api.push(`${u.pathname} ${r.status()}`);
  });
  const t0 = Date.now();
  await pg.goto(url, { waitUntil: "commit" });
  let errShot = null;
  let loadShot = null;
  // Fast loop for the first 4 s: screenshot the first moment the error is on screen.
  while (Date.now() - t0 < 4000) {
    const now = await pg.evaluate((ERR) => {
      const el = document.getElementById("greeting-sub-pre");
      if (!el) return null;
      const vis = getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
      const r = el.getBoundingClientRect();
      return { vis, err: el.textContent.includes(ERR), loading: /^Loading/.test(el.textContent.trim()), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    }, ERR).catch(() => null);
    if (!errShot && now && now.vis && now.err) {
      const file = `${SHOTS}/${TAG}-${label}-error-flash.png`;
      await pg.screenshot({ path: file, clip: { x: 0, y: 0, width: 1440, height: 320 } }).catch(() => {});
      errShot = { file, at_ms: Date.now() - t0, rect: now.rect };
    }
    if (!loadShot && now && now.vis && now.loading) {
      const file = `${SHOTS}/${TAG}-${label}-loading.png`;
      await pg.screenshot({ path: file, clip: { x: 0, y: 0, width: 1440, height: 320 } }).catch(() => {});
      loadShot = { file, at_ms: Date.now() - t0, rect: now.rect };
    }
    await pg.waitForTimeout(40);
  }
  await pg.waitForTimeout(4000);
  const final = await pg.evaluate(() => ({
    path: location.pathname,
    greeting: document.getElementById("greeting")?.innerText.trim() ?? null,
    sub_pre: document.getElementById("greeting-sub-pre")?.textContent.trim() ?? null,
    sub_pre_visible: (() => { const el = document.getElementById("greeting-sub-pre"); return !!el && getComputedStyle(el).display !== "none"; })(),
    pill: document.getElementById("who-name")?.innerText.trim() ?? null,
    signin_door: !!document.getElementById("portal-signin-door"),
    banner: document.getElementById("fh-data-banner")?.innerText.trim().slice(0, 200) ?? null,
    timeline: window.__n14 || [],
  })).catch((e) => ({ err: String(e).slice(0, 120) }));
  const endShot = `${SHOTS}/${TAG}-${label}-end.png`;
  await pg.screenshot({ path: endShot, clip: { x: 0, y: 0, width: 1440, height: 320 } }).catch(() => {});
  const endRect = await pg.evaluate(() => {
    const el = document.getElementById("greeting-sub-pre");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }).catch(() => null);
  await pg.close();
  const errorEverVisible = (final.timeline || []).some((s) => s.visible && s.text.includes(ERR));
  const run = { label, url: url.replace(BASE, ""), api, errors, error_ever_visible: errorEverVisible, error_shot: errShot, loading_shot: loadShot, end_shot: endShot, end_rect: endRect, ...final };
  out.runs.push(run);
  console.log(`\n== ${label}  (${run.url})`);
  console.log(`   api: ${api.join(", ")}`);
  for (const s of run.timeline || []) console.log(`   ${String(s.ms).padStart(5)} ms  ${s.visible ? "SHOWN " : "hidden"}  ${s.text}`);
  console.log(`   end: greeting="${run.greeting}" pill="${run.pill}" sub_pre="${run.sub_pre}" door=${run.signin_door}`);
  console.log(`   ERROR TEXT EVER ON SCREEN: ${errorEverVisible}${errShot ? ` (first seen ~${errShot.at_ms} ms, shot ${path.basename(errShot.file)})` : ""}`);
  return run;
}

const portal = (id) => `${BASE}/app/client-portal.html${id ? `?id=${id}` : ""}`;
const browser = await chromium.launch({ headless: true });

// 1. staff: password sign-in, then #11 by ?id= (first load + reload), then no id
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
await lp.close();
console.log("login status", out.login.status);
await look(a, portal(ELEVEN), "staff-id-first");
await look(a, portal(ELEVEN), "staff-id-reload");
await look(a, portal(NINE), "staff-id-nine");
await look(a, portal(""), "staff-no-id");
await look(a, portal(BOGUS), "staff-bogus-id");
await a.close();

// 2. stranger: nothing at all
const s = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(s);
await look(s, portal(""), "stranger-no-id");
await s.close();

// 3. client: session canned as #11's client (success) and as a client with no file (failure)
for (const [label, cid] of [["client-own-link", ELEVEN], ["client-no-file", null]]) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await guard(c, { session: clientSession(cid) });
  await c.addInitScript(() => { try { localStorage.setItem("fh_role", "client"); } catch { /* none */ } });
  await look(c, portal(""), label);
  await c.close();
}

await browser.close();
const file = `${SHOTS}/${TAG}-result.json`;
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log("\nblocked non-GET:", out.blocked.length ? out.blocked.join(", ") : "none");
console.log("wrote", file);
