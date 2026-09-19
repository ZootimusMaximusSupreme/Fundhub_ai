// Hole 19 reviewer — LOOK ONLY. Password sign-in on the real login page, then
// open #12's progress page twice with ?client_id= and twice with ?id=, plus #11
// as a control. Blocks every non-GET request except the one sign-in POST.
// Records the "Your checklist" box and the progress API the page itself calls.
// Draws a red numbered box on the checklist box with a one-line legend.
// Never prints a password, token or cookie.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-19/review";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }

const out = { at: new Date().toISOString(), blocked: [], loads: [], api: {} };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request();
  const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const u = new URL(r.url());
  if (m === "POST" && u.hostname.endsWith("fundhub.ai") && u.pathname === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${u.host}${u.pathname}`);
  return route.abort();
});

// Sign in through the form.
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const inputs = await page.evaluate(() => [...document.querySelectorAll("input,button")].map((e) => ({ tag: e.tagName, id: e.id, type: e.type, text: (e.innerText || e.value || "").slice(0, 40) })));
out.loginForm = inputs.filter((i) => i.type !== "hidden");
const email = page.locator('input[type="email"], #email').first();
const pass = page.locator('input[type="password"]').first();
await email.fill("chris@fundhub.ai");
await pass.fill(pw);
const respP = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 20000 });
// Click the password sign-in button — never the "Email me a sign-in link" button.
const btns = page.locator("button");
let clicked = null;
for (let i = 0; i < await btns.count(); i++) {
  const t = (await btns.nth(i).innerText()).trim();
  if (/email me/i.test(t)) continue;
  if (/sign in|log in/i.test(t) && await btns.nth(i).isVisible()) { clicked = t; await btns.nth(i).click(); break; }
}
out.loginClicked = clicked;
const lr = await respP.catch(() => null);
out.login = { status: lr ? lr.status() : null };
await page.waitForTimeout(3000);
out.afterLoginUrl = page.url();
if (!lr || lr.status() !== 200) {
  writeFileSync(`${SHOTS}/r19-live-${process.argv[2] || "run"}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

async function look(label, url) {
  const pg = await ctx.newPage();
  const apiSeen = [];
  pg.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return;
    let body = null;
    try { body = await r.json(); } catch {}
    apiSeen.push({ path: u.pathname + u.search, status: r.status(), body });
  });
  const t0 = Date.now();
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  let ready = false;
  try { await pg.getByText("Everything on your file, as it stands today.").first().waitFor({ timeout: 25000 }); ready = true; } catch {}
  await pg.waitForTimeout(3000); // let the boxes fill after the header line
  const info = await pg.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s*\n+\s*/g, " | ").replace(/\s+/g, " ").trim();
    // find the "Your checklist" heading, then its card
    const all = [...document.querySelectorAll("h1,h2,h3,h4,h5,div,span,p,strong")];
    const head = all.find((e) => /^your checklist$/i.test((e.innerText || "").trim()) && e.children.length === 0)
      || all.find((e) => /^your checklist/i.test((e.innerText || "").trim()) && (e.innerText || "").length < 40);
    let box = null;
    const wp = document.getElementById("cWaypoints");
    if (head) head.setAttribute("data-r19-head", "1");
    if (wp) wp.setAttribute("data-r19-body", "1");
    // the checklist box = the "Your checklist" heading plus the list under it
    if (head && wp) box = { text: clean(head.innerText) + " | " + clean(wp.innerText) };
    if (head) head.setAttribute("data-r19-box", "1");
    const body = document.body.innerText;
    return {
      finalUrl: location.href,
      headerLine: /Everything on your file, as it stands today\./.test(body),
      hasHeading: !!head,
      checklistBox: box ? box.text : null,
      cWaypoints: document.getElementById("cWaypoints") ? clean(document.getElementById("cWaypoints").innerText) : null,
      oldPromise: /as soon as your file is reviewed/i.test(body),
      oldNotSetUp: /has not been set up yet/i.test(body),
      newMessage: /There is no checklist on your file right now\./.test(body),
      name: clean((body.match(/^[^\n]{0,80}/) || [""])[0]),
      bodyClip: clean(body).slice(0, 1400),
    };
  });
  // mark and shoot
  const box = pg.locator('[data-r19-box="1"]');
  let shot = null;
  if (await box.count()) {
    await box.scrollIntoViewIfNeeded().catch(() => {});
    await pg.evaluate((legend) => {
      const h = document.querySelector('[data-r19-head="1"]').getBoundingClientRect();
      const bEl = document.querySelector('[data-r19-body="1"]');
      const w = bEl ? bEl.getBoundingClientRect() : h;
      const left = Math.min(h.left, w.left), top = Math.min(h.top, w.top);
      const r = { left, top, width: Math.max(h.right, w.right) - left, height: Math.max(h.bottom, w.bottom) - top };
      const mk = document.createElement("div");
      mk.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:4px solid #e00;z-index:2147483646;pointer-events:none;box-sizing:border-box`;
      const n = document.createElement("div");
      n.textContent = "1";
      n.style.cssText = `position:fixed;left:${Math.max(0, r.left - 22)}px;top:${Math.max(0, r.top - 22)}px;width:30px;height:30px;border-radius:15px;background:#e00;color:#fff;font:bold 18px/30px sans-serif;text-align:center;z-index:2147483647`;
      const lg = document.createElement("div");
      lg.textContent = legend;
      lg.style.cssText = "position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:#fff;color:#000;border-top:4px solid #e00;font:bold 16px sans-serif;z-index:2147483647";
      document.body.append(mk, n, lg);
    }, `1 = "Your checklist" box. ${label}. Reviewer look, ${new Date().toISOString().slice(0, 16)}Z.`);
    shot = `${SHOTS}/r19-${process.argv[2] || "run"}-${label}.png`;
    await pg.screenshot({ path: shot, fullPage: false });
  } else {
    shot = `${SHOTS}/r19-${process.argv[2] || "run"}-${label}-NOBOX.png`;
    await pg.screenshot({ path: shot, fullPage: true });
  }
  const progressCalls = apiSeen.filter((a) => /progress|waypoint|checklist/i.test(a.path)).map((a) => ({
    path: a.path, status: a.status,
    waypointCount: a.body && Array.isArray(a.body.waypoints) ? a.body.waypoints.length : null,
    waypoints: a.body && Array.isArray(a.body.waypoints) ? a.body.waypoints.map((w) => w.title || w.key) : null,
  }));
  out.loads.push({ label, url, ready, ms: Date.now() - t0, ...info, progressCalls, apiPaths: apiSeen.map((a) => `${a.status} ${a.path}`), shot });
  await pg.close();
}

await look("twelve-client_id-load1", `${BASE}/progress.html?client_id=${TWELVE}`);
await look("twelve-client_id-load2", `${BASE}/progress.html?client_id=${TWELVE}`);
await look("twelve-id-load1", `${BASE}/progress.html?id=${TWELVE}`);
await look("twelve-id-load2", `${BASE}/progress.html?id=${TWELVE}`);
await look("eleven-control", `${BASE}/progress.html?client_id=${ELEVEN}`);

// Direct read of the same API, for the step count.
for (const [n, id] of [["twelve", TWELVE], ["eleven", ELEVEN]]) {
  const r = await ctx.request.get(`${BASE}/api/read/client-progress?client_id=${id}`);
  let j = null; try { j = await r.json(); } catch {}
  out.api[n] = { status: r.status(), ok: j?.ok, waypointCount: Array.isArray(j?.waypoints) ? j.waypoints.length : null, waypoints: (j?.waypoints || []).map((w) => `${w.title} [${w.state}]`), keys: j ? Object.keys(j) : null };
}

writeFileSync(`${SHOTS}/r19-live-${process.argv[2] || "run"}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
