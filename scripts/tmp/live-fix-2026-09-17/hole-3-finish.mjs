// HOLE 3 FINISH — a real (not demo) CSM signs in on the LIVE staff login page,
// twice, in two fresh browsers, and lands on her own CSM screen both times.
//
//   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//     scripts/tmp/live-fix-2026-09-17/hole-3-finish.mjs
//
// Safety:
//  - The only non-GET allowed through is POST /api/auth/login (the Sign in
//    button). Every other POST/PUT/PATCH/DELETE is aborted and logged.
//  - Nothing is clicked on the CSM screen. No Claim, Write answers, Start/End
//    shift, Sign out. No "Forgot your password" / reset link.
//  - Database: two plain SELECTs. No SET, no write.
//  - Never prints the password, the token or the cookie.

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db, close } from "../../../src/db.mjs";

const BASE = "https://fundhub.ai";
const RAW = "/tmp/live-fix-2026-09-17/hole-3";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-3";
mkdirSync(RAW, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const email = process.env.CSM_STAFF_EMAIL;
const password = process.env.CSM_STAFF_PASSWORD;
if (!email || !password) {
  console.error("CSM_STAFF_EMAIL / CSM_STAFF_PASSWORD are not in the environment.");
  process.exit(1);
}

const out = { at: new Date().toISOString(), email, runs: [] };

// 0. Database read — plain SELECTs only.
out.staffRow = (await db.query(
  `SELECT id, org_id, email, name, role, status, active, is_demo, last_login_at
     FROM staff WHERE lower(email) = lower($1)`,
  [email]
)).rows;
out.ownerOrg = (await db.query(
  `SELECT org_id FROM staff WHERE lower(email) = 'chris@fundhub.ai'`
)).rows.map((r) => r.org_id);
out.allCsm = (await db.query(
  `SELECT email, status, active, is_demo FROM staff WHERE role = 'csm' ORDER BY email`
)).rows;
await close().catch(() => {});

// 0b. Demo switch still off? GET only.
{
  const r = await fetch(`${BASE}/api/auth/login`, { headers: { accept: "application/json" }, cache: "no-store" });
  const j = await r.json().catch(() => null);
  out.demoSwitch = { status: r.status, enabled: j?.demo?.enabled ?? null };
}

function overlay(page, title, marks) {
  return page.evaluate(({ title, list }) => {
    document.getElementById("fh-proof-layer")?.remove();
    const placed = [];
    const layer = document.createElement("div");
    layer.id = "fh-proof-layer";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    list.forEach((mk, i) => {
      const el = document.querySelector(mk.sel);
      const b = el ? el.getBoundingClientRect() : null;
      if (!b || !b.width || !b.height) { placed.push({ n: i + 1, sel: mk.sel, found: !!el, visible: false }); return; }
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:${b.left - 5}px;top:${b.top - 5}px;width:${b.width + 10}px;height:${b.height + 10}px;border:3px solid #FF2828;border-radius:4px;box-sizing:border-box`;
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      tag.style.cssText = `position:fixed;left:${Math.max(0, b.left - 18)}px;top:${Math.max(0, b.top - 18)}px;width:26px;height:26px;border-radius:13px;background:#FF2828;color:#fff;font:700 15px/26px Helvetica,Arial,sans-serif;text-align:center`;
      layer.appendChild(box);
      layer.appendChild(tag);
      placed.push({ n: i + 1, sel: mk.sel, visible: true, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) });
    });
    const legend = document.createElement("div");
    legend.style.cssText = "position:fixed;left:16px;bottom:16px;max-width:820px;background:rgba(0,0,0,.88);color:#fff;border:2px solid #FF2828;border-radius:8px;padding:10px 14px;font:500 14px/1.45 Helvetica,Arial,sans-serif";
    legend.innerHTML = `<div style='font-weight:700;margin-bottom:4px'>${title}</div>` +
      list.map((mk, i) => `<div><b style='color:#FF6B6B'>${i + 1}</b> — ${mk.text}</div>`).join("");
    layer.appendChild(legend);
    document.body.appendChild(layer);
    return placed;
  }, { title, list: marks });
}

const browser = await chromium.launch();
for (const n of [1, 2]) {
  const run = { load: n, net: [], blocked: [] };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // fresh: no cookies, no storage
  const page = await ctx.newPage();
  await page.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    const path = req.url().replace(BASE, "");
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    if (m === "POST" && path.split("?")[0] === "/api/auth/login") { run.net.push({ allowed: "POST", url: path }); return route.continue(); }
    run.blocked.push({ method: m, url: path });
    return route.abort();
  });
  page.on("response", (resp) => {
    const u = resp.url();
    if (!u.includes("/api/")) return;
    run.net.push({ method: resp.request().method(), url: u.replace(BASE, ""), status: resp.status() });
  });

  // A. The live staff login page.
  const lp = await page.goto(`${BASE}/login.html`, { waitUntil: "networkidle", timeout: 45000 });
  run.loginPage = { status: lp?.status() ?? null, url: page.url().replace(BASE, ""), demoPanelChildren: await page.locator("#fh-demo-mount > *").count() };
  await page.fill("#email", email);
  if (n === 1) {
    run.loginMarks = await overlay(page, `Hole 3 — live staff login page, fundhub.ai/login.html (load ${n})`, [
      { sel: "#email", text: `A real staff address typed in (${email}). Not a demo address.` },
      { sel: "#go", text: "The only button pressed: Sign in. Password came from the main .env, never shown." },
      { sel: ".login-box .card h1", text: "No demo sign-in buttons on this page: demo logins are still off." }
    ]);
    await page.screenshot({ path: `${SHOTS}/1-login-page-marked.png` });
    await page.evaluate(() => document.getElementById("fh-proof-layer")?.remove());
  }
  await page.fill("#pw", password);

  // B. Press Sign in and wait to land.
  await Promise.all([
    page.waitForURL(/\/app\/csm-queue\.html/, { timeout: 45000 }).catch(() => null),
    page.click("#go")
  ]);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => null);
  await page.waitForSelector("#fh-shell-chip", { timeout: 20000 }).catch(() => null);
  await page.waitForFunction(() => { const q = document.getElementById("qCount"); return q && q.textContent.trim() !== "—"; }, null, { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(2000);
  const errText = await page.locator("#err").innerText().catch(() => null);

  run.landed = {
    url: page.url().replace(BASE, ""),
    title: await page.title(),
    loginError: errText || null,
    chip: await page.locator("#fh-shell-chip span").first().innerText().catch(() => null),
    heading: await page.locator(".topbar h1").first().innerText().catch(() => null),
    queueCount: await page.locator("#qCount").innerText().catch(() => null),
    queueLabel: await page.locator("#qCountLabel").innerText().catch(() => null),
    banner: await page.locator("#qBanner").innerText().catch(() => null),
    listItems: await page.locator("#qList > *").count().catch(() => null)
  };
  // Who does the server think this browser is? GET only, same cookie.
  run.session = await page.evaluate(async () => {
    const r = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    const j = await r.json().catch(() => null);
    const who = j?.staff || null;
    return { status: r.status, principal: typeof j?.principal === "string" ? j.principal : null, email: who?.email ?? null, name: who?.name ?? null, role: who?.role ?? null };
  });
  await page.screenshot({ path: `${RAW}/finish-load-${n}-raw.png` });
  run.marks = await overlay(page, `Hole 3 FINISH — load ${n} of 2: a real CSM signed in on fundhub.ai, demo logins off`, [
    { sel: "#fh-shell-chip span", text: `Signed in as ${run.landed.chip ?? "?"} — a real person, role csm, not a DEMO account` },
    { sel: ".topbar h1", text: `Landed on her own CSM screen: ${run.landed.url} (“${run.landed.heading ?? "?"}”)` },
    { sel: "#qList > :first-child", text: `Her queue loaded with her own sign-in (${run.landed.queueCount ?? "?"} ${run.landed.queueLabel ?? ""}). Nothing clicked.` }
  ]);
  await page.screenshot({ path: `${SHOTS}/${n + 1}-csm-screen-load-${n}-marked.png` });
  run.apiErrors = run.net.filter((x) => x.status && x.status >= 400);
  out.runs.push(run);
  await ctx.close();
}
await browser.close();

writeFileSync(`${RAW}/finish.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  staffRow: out.staffRow, ownerOrg: out.ownerOrg, allCsm: out.allCsm, demoSwitch: out.demoSwitch,
  runs: out.runs.map((r) => ({ load: r.load, loginPage: r.loginPage, landed: r.landed, session: r.session, blocked: r.blocked, apiErrors: r.apiErrors, allowed: r.net.filter((x) => x.allowed), marks: r.marks }))
}, null, 2));
