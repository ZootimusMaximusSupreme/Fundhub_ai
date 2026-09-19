// Reviewer hole 11 — LOOK ONLY. Independent re-try of "Course #12 What You Own is empty".
// Signs in through the real login form (password from .env, never printed), opens #12's portal
// on two fresh loads (9 s wait each), reads What You Own + Unlock More, presses "Open course"
// once per load and logs every network request it causes. Then opens #11 once as a control.
// Every non-GET request is aborted except the one sign-in POST. Nothing is sent or changed.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-11/review";
const RAW = `${DIR}/_raw`;
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), base: BASE, blocked: [], loads: [], control: null, marks: [] };
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await ctx.route("**/*", (route) => {
    const r = route.request(); const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const path = new URL(r.url()).pathname;
    if (m === "POST" && path === "/api/auth/login") return route.continue();
    out.blocked.push(`${new Date().toISOString()} ${m} ${path}`); return route.abort();
  });

  // Sign in through the real form.
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await lp.fill("#email", "chris@fundhub.ai");
  await lp.fill("#pw", pw);
  const lrP = lp.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST", { timeout: 30000 });
  await lp.click("#go");
  const lr = await lrP;
  out.login = { status: lr.status() };
  if (lr.status() !== 200) throw new Error(`sign-in failed: ${lr.status()}`);
  await lp.waitForTimeout(2500);
  await lp.close();

  // In-page reader. Returns text and document-coordinate boxes.
  const read = () => {
    const clean = (t) => (t || "").replace(/\s*\n+\s*/g, " | ").replace(/[ \t]+/g, " ").trim();
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const title = (re) => Array.from(document.querySelectorAll(".card-title, h2, h3")).find((x) => re.test(x.innerText || ""));
    const ownT = title(/^\s*what you own\s*$/i);
    const unlT = title(/^\s*unlock more\s*$/i);
    const own = ownT ? (ownT.closest("section") || ownT.parentElement.parentElement) : null;
    const unl = unlT ? (unlT.closest("section") || unlT.parentElement.parentElement) : null;
    let tiles = unl ? Array.from(unl.querySelectorAll("[data-tile]")) : [];
    if (!tiles.length && unl) tiles = Array.from(unl.querySelectorAll("article, .tile, .card")).filter((e) => e.querySelector("button, a"));
    const tileInfo = tiles.map((t) => ({
      key: t.getAttribute("data-tile"),
      visible: !!t.offsetParent && getComputedStyle(t).display !== "none",
      text: clean(t.innerText).slice(0, 400),
      buttons: Array.from(t.querySelectorAll("button, a")).filter((b) => b.offsetParent).map((b) => (b.innerText || "").trim()).filter(Boolean),
    }));
    const cap = tiles.find((t) => /capital academy/i.test(t.innerText || ""));
    if (own) own.setAttribute("data-r11", "own");
    if (cap) cap.setAttribute("data-r11", "cap");
    const ownBtns = own ? Array.from(own.querySelectorAll("button, a")).filter((b) => b.offsetParent).map((b) => (b.innerText || "").trim()) : [];
    const courseRe = /funding mastery|open course|capital academy/i;
    return {
      welcome: clean(document.querySelector("main h1, h1")?.innerText),
      own: own ? clean(own.innerText) : null,
      ownHasNothingYet: own ? /nothing to download yet/i.test(own.innerText) : null,
      ownMentionsCourse: own ? courseRe.test(own.innerText) : null,
      ownButtons: ownBtns,
      ownBox: box(own),
      unlock: unl ? clean(unl.innerText) : null,
      tiles: tileInfo,
      cap: cap ? { text: clean(cap.innerText), buttons: Array.from(cap.querySelectorAll("button, a")).filter((b) => b.offsetParent).map((b) => (b.innerText || "").trim()).filter(Boolean), modulesShown: /funding mastery\s*·\s*modules/i.test(cap.innerText), lessonCount: (cap.innerText.match(/lesson/gi) || []).length } : null,
      capBox: box(cap),
      capInViewport: cap ? (() => { const r = cap.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })() : null,
      scrollY: Math.round(scrollY),
    };
  };

  async function markedShot(pg, name, parts) {
    // parts: [{ sel, caption }]. Scroll the first into view, grow the viewport so all fit, clip.
    const vp = pg.viewportSize();
    const first = pg.locator(parts[0].sel);
    await first.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await pg.waitForTimeout(400);
    const rects = async () => Promise.all(parts.map(async (p) => {
      const l = pg.locator(p.sel);
      if (!(await l.count())) return null;
      return l.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
    }));
    let rs = await rects();
    const bottom = Math.max(...rs.filter(Boolean).map((r) => r.y + r.h)) + 30;
    if (bottom > vp.height) {
      await pg.setViewportSize({ width: vp.width, height: Math.min(bottom + 20, 6000) });
      await pg.waitForTimeout(400);
      await first.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await pg.waitForTimeout(400);
      rs = await rects();
    }
    const ok = rs.filter(Boolean);
    const pad = 24;
    const x0 = Math.max(0, Math.min(...ok.map((r) => r.x)) - pad);
    const y0 = Math.max(0, Math.min(...ok.map((r) => r.y)) - pad);
    const x1 = Math.min(pg.viewportSize().width, Math.max(...ok.map((r) => r.x + r.w)) + pad);
    const y1 = Math.min(pg.viewportSize().height, Math.max(...ok.map((r) => r.y + r.h)) + pad);
    const raw = `${RAW}/${name}.png`;
    await pg.screenshot({ path: raw, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
    await pg.setViewportSize(vp);
    out.marks.push({ raw, out: `${DIR}/${name}.png`, boxes: parts.map((p, i) => ({ n: i + 1, caption: p.caption, ...(rs[i] ? { x: rs[i].x - x0, y: rs[i].y - y0, w: rs[i].w, h: rs[i].h } : { missing: true }) })) });
    return `${DIR}/${name}.png`;
  }

  async function openPortal(id) {
    const pg = await ctx.newPage();
    const reqs = [];
    pg.on("request", (r) => reqs.push({ t: Date.now(), m: r.method(), u: (() => { const u = new URL(r.url()); return u.host === "fundhub.ai" ? u.pathname : u.host + u.pathname; })() }));
    await pg.goto(`${BASE}/app/client-portal.html?id=${id}`, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(9000);
    return { pg, reqs };
  }

  for (const n of [1, 2]) {
    const { pg, reqs } = await openPortal(TWELVE);
    const before = await pg.evaluate(read);
    const shotBefore = await markedShot(pg, `r11-twelve-load${n}-before`, [
      { sel: "[data-r11=own]", caption: `What You Own (load ${n}, before click): ${before.ownMentionsCourse ? "course row shown" : "no course row"}` },
      { sel: "[data-r11=cap]", caption: `Unlock More - Capital Academy card: ${before.cap ? (before.cap.text.match(/Unlocked[^|]*|Included[^|]*|you own this/i) || ["see text"])[0] : "not found"}` },
    ]);
    // Press "Open course" once and log every request it causes.
    const btn = pg.locator("button, a").filter({ hasText: /^\s*Open course\s*$/ }).first();
    const hasBtn = (await btn.count()) > 0;
    const clickAt = Date.now();
    let after = null, clickReqs = [], shotAfter = null;
    if (hasBtn) {
      await btn.click();
      await pg.waitForTimeout(3000);
      clickReqs = reqs.filter((r) => r.t >= clickAt).map((r) => `${r.m} ${r.u}`);
      after = await pg.evaluate(read);
      shotAfter = await markedShot(pg, `r11-twelve-load${n}-after-open-course`, [
        { sel: "[data-r11=own]", caption: `What You Own (load ${n}): "Open course" pressed once` },
        { sel: "[data-r11=cap]", caption: `Capital Academy card after press: ${after.cap?.modulesShown ? "Funding Mastery modules open" : "modules NOT shown"}; button now "${(after.cap?.buttons || []).join(" / ")}"; in view: ${after.capInViewport}` },
      ]);
    }
    out.loads.push({ n, before, hasOpenCourseButton: hasBtn, requestsAfterClick: clickReqs, after, shotBefore, shotAfter });
    await pg.close();
  }

  // Control: #11, once.
  {
    const { pg } = await openPortal(ELEVEN);
    const look = await pg.evaluate(read);
    const shot = await markedShot(pg, `r11-control-eleven`, [
      { sel: "[data-r11=own]", caption: `#11 What You Own: ${look.ownMentionsCourse ? "course row PRESENT" : "no course row"}` },
      { sel: "[data-r11=cap]", caption: `#11 Capital Academy card: ${look.cap ? (look.cap.text.match(/Unlocked[^|]*|Included[^|]*|Locked[^|]*|you own this/i) || ["see text"])[0] : "not found"}` },
    ]);
    out.control = { id: ELEVEN, look, shot };
    await pg.close();
  }
} catch (e) {
  out.error = e.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(`${RAW}/r11-review.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
