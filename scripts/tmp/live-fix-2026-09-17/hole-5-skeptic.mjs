// Hole 5 SKEPTIC. Independent look only. Every non-GET request is aborted. Nothing is clicked.
// Scenarios:
//   A1, A2  owner cookie, fresh browser each, ?id=Nine  (the card's RECREATE, twice)
//   A3      owner cookie, SAME browser as A2, reload     (works once but not twice?)
//   B       owner cookie, no id                          (idle words still honest?)
//   C       owner cookie, unknown id                     (no skeleton forever?)
//   D       no cookie at all, ?id=Nine                   (stranger sees private data?)
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const PAGE = `${BASE}/app/client-control-panel.html`;
const RAW = "/tmp/live-fix-2026-09-17/hole-5/skeptic";
mkdirSync(RAW, { recursive: true });

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
await db.end?.();

const browser = await chromium.launch({ headless: true });
const blocked = [];
const out = {};

async function newCtx(withCookie, tag) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  if (withCookie) {
    await context.addCookies([
      { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
      { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
    ]);
  }
  await context.route("**/*", (route) => {
    const r = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) {
      blocked.push({ tag, method: r.method(), url: r.url() });
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__frames = [];
    window.__fcp = null;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__fcp = Math.round(e.startTime); })
        .observe({ type: "paint", buffered: true });
    } catch {}
    const vis = (el) => !!el && el.offsetParent !== null;
    const txt = (id) => { const el = document.getElementById(id); return el ? (el.innerText || "").replace(/\s+/g, " ").trim() : null; };
    let last = "";
    const tick = () => {
      if (document.getElementById("ccp-name")) {
        const pick = document.getElementById("ccp-pick");
        const skels = [...document.querySelectorAll(".skel")].filter((s) => getComputedStyle(s).display !== "none").length;
        const f = {
          t: Math.round(performance.now()),
          name: txt("ccp-name"),
          key: txt("ccp-key"),
          next: txt("ccp-next-action"),
          blockers: (txt("ccp-cp-blockers") || "").slice(0, 120),
          waiting: txt("ccp-waiting-what"),
          picker: pick && pick.selectedOptions[0] ? pick.selectedOptions[0].textContent.trim() : null,
          pickerOpts: pick ? pick.options.length : null,
          opening: document.documentElement.classList.contains("ccp-opening"),
          skels,
          headVisible: vis(document.getElementById("ccp-record-head")),
        };
        const sig = JSON.stringify([f.name, f.key, f.next, f.blockers, f.waiting, f.picker, f.opening, f.skels, f.headVisible]);
        if (sig !== last) { window.__frames.push(f); last = sig; }
      }
      if (performance.now() < 25000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return context;
}

async function look(page, tag, url, { waitName = true, settle = 6000 } = {}) {
  const apiTimes = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/")) apiTimes.push({ url: u.replace(BASE, ""), status: r.status() });
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "commit", timeout: 45_000 });
  let nameAt = null;
  if (waitName) {
    try {
      await page.waitForFunction(() => ((document.getElementById("ccp-name") || {}).innerText || "").trim() === "Sim Nine-Repair", null, { timeout: 30_000, polling: "raf" });
      nameAt = await page.evaluate(() => Math.round(performance.now()));
    } catch { nameAt = "timeout 30s"; }
  }
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${RAW}/${tag}-settled.png` });
  const data = await page.evaluate(() => ({ frames: window.__frames, fcp: window.__fcp, finalUrl: location.href }));
  out[tag] = { url, nameAt, wallMs: Date.now() - t0, ...data, apiTimes };
  return out[tag];
}

// A1 + A2: two fresh browsers, the card's RECREATE.
for (const tag of ["A1", "A2"]) {
  const ctx = await newCtx(true, tag);
  const page = await ctx.newPage();
  await look(page, tag, `${PAGE}?id=${NINE}`);
  if (tag === "A2") {
    // A3: same browser, reload (warm cache).
    const page3 = await ctx.newPage();
    await look(page3, "A3", `${PAGE}?id=${NINE}`);
  }
  await ctx.close();
}

// B: no id.
{ const ctx = await newCtx(true, "B"); const p = await ctx.newPage(); await look(p, "B", PAGE, { waitName: false, settle: 8000 }); await ctx.close(); }
// C: unknown id.
{ const ctx = await newCtx(true, "C"); const p = await ctx.newPage(); await look(p, "C", `${PAGE}?id=00000000-0000-4000-8000-000000000000`, { waitName: false, settle: 10000 }); await ctx.close(); }
// D: stranger, no cookie.
{
  const ctx = await newCtx(false, "D"); const p = await ctx.newPage();
  await look(p, "D", `${PAGE}?id=${NINE}`, { waitName: false, settle: 8000 });
  out.D.bodyHasNine = await p.evaluate(() => (document.body ? document.body.innerText : "").includes("Nine-Repair"));
  out.D.bodyStart = await p.evaluate(() => (document.body ? document.body.innerText : "").replace(/\s+/g, " ").slice(0, 300));
  await ctx.close();
}

await browser.close();
out.blocked = blocked;
writeFileSync(`${RAW}/skeptic.json`, JSON.stringify(out, null, 2));

// Short summary.
for (const [k, v] of Object.entries(out)) {
  if (k === "blocked") continue;
  const f = v.frames || [];
  console.log(`\n== ${k} ${v.url.replace(BASE, "")} fcp=${v.fcp} nameAt=${v.nameAt} final=${v.finalUrl?.replace(BASE, "")}`);
  for (const fr of f.slice(0, 14)) console.log(JSON.stringify(fr));
  console.log("api:", JSON.stringify(v.apiTimes.map((a) => `${a.status} ${a.url.slice(0, 70)}`)));
  if (k === "D") console.log("D bodyHasNine:", v.bodyHasNine, "|", v.bodyStart);
}
console.log("\nblocked non-GET:", JSON.stringify(blocked));
process.exit(0);
