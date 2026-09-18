// Lane h5-ccp-name. LOOK ONLY. Three fresh browser contexts load the #9 Nine-Repair
// control panel as the owner. Every non-GET request is aborted. Nothing is clicked.
// Records: every request (start, first byte, end, size) on the page clock, the moment
// each JSON body is handed to page code, every write to the #ccp-name header (with the
// calling stack), the moment the picker list is filled, and the first frame where the
// header and the picker each show "Sim Nine-Repair".
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const URL_ = `${BASE}/app/client-control-panel.html?id=${NINE}`;
const WANT = "Sim Nine-Repair";
const RAW = "/tmp/live-fix-2026-09-18/h5-ccp-name";
const RUNS = Number(process.env.RUNS || 3);
mkdirSync(RAW, { recursive: true });

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
await db.end?.();

const browser = await chromium.launch({ headless: true });
const blocked = [];
const runs = [];

for (let i = 1; i <= RUNS; i++) {
  const tag = `run${i}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addCookies([
    { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
  ]);
  await context.route("**/*", (route) => {
    const r = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) {
      blocked.push({ tag, method: r.method(), url: r.url() });
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript((WANT) => {
    const now = () => Math.round(performance.now());
    window.__h5 = { nameWrites: [], pickFills: [], json: [], frames: [], res: [], fcp: null, nameVisibleAt: null, pickerAt: null };
    const H = window.__h5;
    // Every write to the header name, with the stack that wrote it.
    const tc = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    Object.defineProperty(Node.prototype, "textContent", {
      configurable: true, enumerable: tc.enumerable, get: tc.get,
      set(v) {
        if (this && this.id === "ccp-name") {
          H.nameWrites.push({ t: now(), v: String(v), stack: (new Error().stack || "").split("\n").slice(2, 6).map((s) => s.trim()).join(" | ") });
        }
        return tc.set.call(this, v);
      },
    });
    // The picker is filled with one innerHTML write.
    const ih = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true, enumerable: ih.enumerable, get: ih.get,
      set(v) {
        if (this && this.id === "ccp-pick") H.pickFills.push({ t: now(), hasName: String(v).includes(WANT), len: String(v).length });
        return ih.set.call(this, v);
      },
    });
    // When each JSON body is handed to page code, and whether it names the client.
    const rj = Response.prototype.json;
    Response.prototype.json = function () {
      const url = this.url;
      return rj.call(this).then((d) => {
        let hasName = false;
        try { hasName = JSON.stringify(d).includes("Nine-Repair"); } catch {}
        H.json.push({ t: now(), url: url.replace(location.origin, ""), hasName });
        return d;
      });
    };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") H.fcp = Math.round(e.startTime); })
        .observe({ type: "paint", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          H.res.push({
            url: e.name.replace(location.origin, ""), type: e.initiatorType,
            start: Math.round(e.startTime), ttfb: Math.round(e.responseStart), end: Math.round(e.responseEnd),
            transfer: e.transferSize, body: e.encodedBodySize, decoded: e.decodedBodySize,
          });
        }
      }).observe({ type: "resource", buffered: true });
    } catch {}
    // Frame sampler: what a person would see, frame by frame.
    let last = "";
    const tick = () => {
      const nameEl = document.getElementById("ccp-name");
      if (nameEl) {
        const pick = document.getElementById("ccp-pick");
        const name = (nameEl.innerText || "").trim();
        const key = ((document.getElementById("ccp-key") || {}).innerText || "").replace(/\s+/g, " ").trim();
        const picker = pick && pick.selectedOptions[0] ? pick.selectedOptions[0].textContent.trim() : null;
        const opening = document.documentElement.classList.contains("ccp-opening");
        const skels = [...document.querySelectorAll(".skel")].filter((s) => getComputedStyle(s).display !== "none").length;
        const t = now();
        if (name === WANT && H.nameVisibleAt == null) H.nameVisibleAt = t;
        if (picker === WANT && H.pickerAt == null) H.pickerAt = t;
        const sig = JSON.stringify([name, key, picker, opening, skels]);
        if (sig !== last) { H.frames.push({ t, name, key, picker, opening, skels }); last = sig; }
      }
      if (performance.now() < 20000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, WANT);

  const page = await context.newPage();
  const pw = [];
  page.on("requestfinished", async (req) => {
    if (!req.url().includes("/api/")) return;
    let sizes = null; try { sizes = await req.sizes(); } catch {}
    pw.push({ url: req.url().replace(BASE, ""), method: req.method(), respBody: sizes?.responseBodySize ?? null });
  });
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: "commit", timeout: 45_000 });
  try {
    await page.waitForFunction((w) => ((document.getElementById("ccp-name") || {}).innerText || "").trim() === w, WANT, { timeout: 30_000, polling: "raf" });
  } catch {}
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${RAW}/${tag}-settled.png` });
  const h5 = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    return { ...window.__h5, dcl: Math.round(nav.domContentLoadedEventStart || 0), navTtfb: Math.round(nav.responseStart || 0), finalUrl: location.href };
  });
  runs.push({ tag, wallMs: Date.now() - t0, ...h5, pw });
  await context.close();
}

await browser.close();
writeFileSync(`${RAW}/measure.json`, JSON.stringify({ runs, blocked }, null, 2));

for (const r of runs) {
  console.log(`\n==== ${r.tag}  navTTFB=${r.navTtfb}  DCL=${r.dcl}  FCP=${r.fcp}  headerName@${r.nameVisibleAt}  picker@${r.pickerAt}`);
  const api = r.res.filter((x) => x.url.includes("/api/")).sort((a, b) => a.end - b.end);
  for (const a of api) {
    const js = r.json.find((j) => j.url === a.url);
    const size = r.pw.find((p) => p.url === a.url)?.respBody;
    console.log(`  ${String(a.start).padStart(5)} -> ttfb ${String(a.ttfb).padStart(5)} -> end ${String(a.end).padStart(5)}  (${String(a.end - a.start).padStart(4)}ms, ${size ?? a.decoded}b)  json@${js ? js.t : "-"}${js && js.hasName ? " NAME" : ""}  ${a.url.slice(0, 90)}`);
  }
  console.log("  name writes:");
  for (const w of r.nameWrites) console.log(`    ${w.t}  "${w.v}"  <= ${w.stack.slice(0, 220)}`);
  console.log("  picker fills:", JSON.stringify(r.pickFills));
  console.log("  frames:");
  for (const f of r.frames.slice(0, 10)) console.log("   ", JSON.stringify(f));
}
console.log("\nblocked non-GET:", JSON.stringify(blocked));
process.exit(0);
