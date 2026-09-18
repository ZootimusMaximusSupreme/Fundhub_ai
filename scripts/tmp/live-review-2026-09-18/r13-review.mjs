// Review of hole 13 — "Staff portal ?id= greets Chris, not Sim, on #11". LOOK ONLY.
// Independent re-try of the hole on live, by the reviewer (not the fixer).
//
//  A. Normal staff sign-in (real login form), fresh browser context, two rounds:
//     round 1: each load in a new tab; round 2: load 1 in the signed-in tab,
//     load 2 as a full reload. Doors: ?id= and ?client_id=, twice each per round.
//  B. Staff link path: sign in, open #11's control panel (and the pipeline),
//     open the PORTALS menu, click "Client Portal". Twice.
//  C. Cookie-only: sign in, then wipe the browser's saved role/token
//     (localStorage + sessionStorage) so only the session cookie is left. First
//     load + reload, two fresh contexts per door.
//
// Every load records a change-by-change trace of the greeting, the name at the
// top, and any visible "Chris" in the top of the page other than the staff badge,
// from first paint to 10 s. Blocks every non-GET except the one sign-in POST.
// Never prints a password, token or cookie value.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r13-review.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13/review";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const SAMPLE_AT = [500, 2000, 5000, 10000];
const out = { at: new Date().toISOString(), base: BASE, no_send: true, normal: [], staffLink: [], cookieOnly: [], blocked: [] };
const scrub = (s) => String(s ?? "").replaceAll(ELEVEN, "<eleven>");

// Runs in every document from the very start. Records each change.
const TRACE = () => {
  window.__r13 = [];
  let last = "";
  const tick = () => {
    try {
      const g = document.getElementById("greeting");
      const w = document.getElementById("who-name");
      const top = (document.body?.innerText || "").slice(0, 600);
      const topNoBadge = top.replace(/Chris Stanbridge\s*·\s*owner/g, "");
      const s = {
        greeting: g ? g.innerText.trim() : null,
        greetingVisible: g ? g.getBoundingClientRect().height > 0 : false,
        name: w ? w.innerText.trim() : null,
        badge: /Chris Stanbridge\s*·\s*\w+/.exec(top)?.[0] ?? null,
        chrisOutsideBadge: /chris/i.test(topNoBadge),
      };
      const k = JSON.stringify(s);
      if (k !== last) { last = k; window.__r13.push({ ms: Math.round(performance.now()), ...s }); }
    } catch {}
  };
  const iv = setInterval(tick, 40);
  document.addEventListener("readystatechange", tick);
  setTimeout(() => clearInterval(iv), 15000);
};

async function newCtx() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(TRACE);
  await ctx.route("**/*", (route) => {
    const r = route.request();
    const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const p = new URL(r.url()).pathname;
    if (m === "POST" && p === "/api/auth/login") return route.continue();
    out.blocked.push(`${m} ${p}`);
    return route.abort();
  });
  return { browser, ctx };
}

async function signIn(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "chris@fundhub.ai");
  await page.fill("#pw", pw);
  const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
  await page.click("#go");
  const status = (await lr).status();
  await page.waitForTimeout(3000);
  const role = await page.evaluate(() => localStorage.getItem("fh_role"));
  const cookieNames = (await ctx.cookies(BASE)).map((c) => c.name);
  return { page, status, role, cookieNames, landed: scrub(page.url()) };
}

async function mark(page) {
  await page.evaluate(() => {
    const boxes = [];
    const g = document.getElementById("greeting");
    const w = document.getElementById("who-name");
    const badge = Array.from(document.querySelectorAll("span")).find((s) => /Chris Stanbridge\s*·/.test(s.textContent) && s.children.length === 0);
    const items = [[g, 1, "Greeting"], [w, 2, "Name at the top (the file being looked at)"], [badge, 3, "Staff badge: who is signed in (not the greeting)"]];
    const layer = document.createElement("div");
    layer.id = "__r13marks";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    const legend = [];
    for (const [el, n, label] of items) {
      if (!el) { legend.push(`${n} = ${label} — not on the page yet`); continue; }
      const r = el.getBoundingClientRect();
      const h = Math.max(r.height, 22), wd = Math.max(r.width, 120);
      const b = document.createElement("div");
      b.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 4}px;width:${wd + 10}px;height:${h + 8}px;border:3px solid #e00;border-radius:4px;box-sizing:border-box`;
      const tag = document.createElement("div");
      tag.textContent = n;
      tag.style.cssText = `position:fixed;left:${r.left - 26}px;top:${r.top - 8}px;background:#e00;color:#fff;font:700 14px/20px sans-serif;width:20px;text-align:center;border-radius:10px`;
      layer.append(b, tag);
      legend.push(`${n} = ${label}: "${(el.innerText || "").trim() || "(blank)"}"`);
    }
    const lg = document.createElement("div");
    lg.style.cssText = "position:fixed;left:16px;top:228px;background:#fff;color:#111;border:2px solid #e00;font:13px/18px sans-serif;padding:6px 10px;max-width:760px";
    lg.innerHTML = legend.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    layer.append(lg);
    document.documentElement.append(layer);
  }).catch(() => {});
}
const unmark = (page) => page.evaluate(() => document.getElementById("__r13marks")?.remove()).catch(() => {});

async function shot(page, file) {
  await mark(page);
  await page.screenshot({ path: `${SHOTS}/${file}`, clip: { x: 0, y: 0, width: 1440, height: 320 } }).catch(() => {});
  await unmark(page);
  return `${SHOTS}/${file}`;
}

// Watch one load already started. t0 = when navigation began (node clock).
async function watch(page, t0, shotBase, { early = false } = {}) {
  const shots = [];
  const polled = [];
  for (const at of SAMPLE_AT) {
    const wait = at - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const s = await page.evaluate(() => ({
      greeting: document.getElementById("greeting")?.innerText.trim() ?? null,
      name: document.getElementById("who-name")?.innerText.trim() ?? null,
    })).catch((e) => ({ err: String(e).slice(0, 100) }));
    polled.push({ at, ...s });
    if (early && at === 500 && shotBase) shots.push(await shot(page, `${shotBase}-0.5s.png`));
  }
  if (shotBase) shots.push(await shot(page, `${shotBase}-10s.png`));
  const trace = await page.evaluate(() => window.__r13 || []).catch(() => []);
  const chrisSeen = trace.some((t) => /chris/i.test(t.greeting || "") || /chris/i.test(t.name || "") || t.chrisOutsideBadge);
  return { url: scrub(page.url()), polled, trace, chrisSeen, shots };
}

async function load(page, url, shotBase, opts) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "commit" });
  return watch(page, t0, shotBase, opts);
}
async function reload(page, shotBase, opts) {
  const t0 = Date.now();
  await page.reload({ waitUntil: "commit" });
  return watch(page, t0, shotBase, opts);
}

const portal = (param) => `${BASE}/app/client-portal.html?${param}=${ELEVEN}`;

// ── A. Normal sign-in ─────────────────────────────────────────────────────────
for (const round of [1, 2]) {
  const { browser, ctx } = await newCtx();
  const si = await signIn(ctx);
  out.normal.push({ round, signIn: { status: si.status, role: si.role, cookieNames: si.cookieNames, landed: si.landed } });
  for (const param of ["id", "client_id"]) {
    if (round === 1) {
      for (const n of [1, 2]) {
        const p = await ctx.newPage();
        const r = await load(p, portal(param), `normal-r1-${param}-load${n}`, { early: n === 1 });
        out.normal.push({ round, door: `?${param}=`, n, how: "new tab", ...r });
        await p.close();
      }
    } else {
      const p = si.page;
      const r1 = await load(p, portal(param), `normal-r2-${param}-load1`, {});
      out.normal.push({ round, door: `?${param}=`, n: 1, how: "typed in the signed-in tab", ...r1 });
      const r2 = await reload(p, `normal-r2-${param}-load2`, {});
      out.normal.push({ round, door: `?${param}=`, n: 2, how: "reload", ...r2 });
    }
  }
  await browser.close();
}

// ── B. Staff link path ───────────────────────────────────────────────────────
{
  const { browser, ctx } = await newCtx();
  const si = await signIn(ctx);
  out.staffLink.push({ signIn: { status: si.status, role: si.role } });
  const starts = [
    ["control-panel", `${BASE}/app/client-control-panel.html?id=${ELEVEN}`],
    ["control-panel", `${BASE}/app/client-control-panel.html?id=${ELEVEN}`],
    ["pipeline", `${BASE}/app/pipeline.html`],
  ];
  let i = 0;
  for (const [from, start] of starts) {
    i++;
    const p = await ctx.newPage();
    await p.goto(start, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(6000);
    const menu = p.locator("button", { hasText: "PORTALS" }).first();
    if (await menu.count()) await menu.click().catch(() => {});
    await p.waitForTimeout(500);
    const link = p.locator("a", { hasText: "Client Portal" }).first();
    const href = (await link.count()) ? await link.getAttribute("href") : null;
    const visible = (await link.count()) ? await link.isVisible() : false;
    let r = { url: null };
    if (href !== null) {
      const t0 = Date.now();
      await Promise.all([p.waitForURL(/client-portal\.html/, { waitUntil: "commit", timeout: 15000 }).catch(() => {}), link.click({ force: !visible })]);
      r = await watch(p, t0, `stafflink-${from}-${i}`, { early: false });
    }
    out.staffLink.push({ from, n: i, linkHref: scrub(href), linkVisibleAfterMenu: visible, ...r });
    await p.close();
  }
  await browser.close();
}

// ── C. Cookie-only (no saved role in the browser) ────────────────────────────
for (const param of ["id", "client_id"]) {
  for (const fresh of [1, 2]) {
    const { browser, ctx } = await newCtx();
    const si = await signIn(ctx);
    await si.page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    const left = await si.page.evaluate(() => Object.keys(localStorage));
    const p = await ctx.newPage();
    const first = await load(p, portal(param), fresh === 1 ? `cookieonly-${param}-fresh${fresh}-first` : null, {});
    const again = await reload(p, fresh === 1 ? `cookieonly-${param}-fresh${fresh}-reload` : null, {});
    const afterKeys = await p.evaluate(() => ({ keys: Object.keys(localStorage), role: localStorage.getItem("fh_role") }));
    out.cookieOnly.push({ door: `?${param}=`, fresh, cookieNames: si.cookieNames, localStorageAfterWipe: left, localStorageAfterLoads: afterKeys, first, reload: again });
    await browser.close();
  }
}

writeFileSync(`${SHOTS}/review.json`, JSON.stringify(out, null, 2));

const fmt = (r) => r.polled.map((s) => `${s.at / 1000}s greeting="${s.greeting ?? "-"}" name="${s.name ?? "-"}"`).join(" | ");
const states = (r) => r.trace.map((t) => `${t.ms}ms g="${t.greeting ?? "-"}"${t.greetingVisible ? "" : "(hidden)"} n="${t.name ?? "-"}"${t.chrisOutsideBadge ? " CHRIS-TOP" : ""}`).join("\n      ");
console.log("\n=== A. NORMAL SIGN-IN");
for (const x of out.normal) {
  if (x.signIn) { console.log(`round ${x.round} sign-in: status ${x.signIn.status}, saved role ${x.signIn.role}, cookies [${x.signIn.cookieNames.join(",")}], landed ${x.signIn.landed}`); continue; }
  console.log(`\nr${x.round} ${x.door} load ${x.n} (${x.how}) chrisSeen=${x.chrisSeen}\n  ${fmt(x)}\n  trace:\n      ${states(x)}`);
}
console.log("\n=== B. STAFF LINK PATH");
for (const x of out.staffLink) {
  if (x.signIn) { console.log(`sign-in ${x.signIn.status} role ${x.signIn.role}`); continue; }
  console.log(`\n${x.from} #${x.n}: link href="${x.linkHref}" visible=${x.linkVisibleAfterMenu} -> ${x.url} chrisSeen=${x.chrisSeen}`);
  if (x.polled) console.log(`  ${fmt(x)}\n  trace:\n      ${states(x)}`);
}
console.log("\n=== C. COOKIE-ONLY");
for (const x of out.cookieOnly) {
  console.log(`\n${x.door} fresh ${x.fresh}: cookies [${x.cookieNames.join(",")}], storage after wipe ${JSON.stringify(x.localStorageAfterWipe)}, after loads ${JSON.stringify(x.localStorageAfterLoads)}`);
  console.log(`  first  chrisSeen=${x.first.chrisSeen}: ${fmt(x.first)}\n      ${states(x.first)}`);
  console.log(`  reload chrisSeen=${x.reload.chrisSeen}: ${fmt(x.reload)}\n      ${states(x.reload)}`);
}
console.log("\nblocked non-GET:", out.blocked);
