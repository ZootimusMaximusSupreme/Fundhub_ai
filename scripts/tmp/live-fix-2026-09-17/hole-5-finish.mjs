// Hole 5 FINISH proof. Look only: every non-GET request is aborted, nothing is clicked.
// Two fresh page loads (a new browser context each, so no cache and no shared state).
// Every animation frame records the visible words (innerText) of the name line, the
// record head, the blockers card and the picker, so a flash of "No client open" cannot hide.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const URL = `${BASE}/app/client-control-panel.html?id=${NINE}`;
const RAW = "/tmp/live-fix-2026-09-17/hole-5";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-5";
const LOADS = Number(process.env.LOADS || 2);
const TAG = process.env.TAG || "finish";
mkdirSync(RAW, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const BAD = ["No client open", "Pick a client below.", "Open a client file to see what is blocking it."];

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });

const browser = await chromium.launch({ headless: true });
const blocked = [];
const loads = [];

// Draw numbered red boxes and a legend on the live page, then return what each box read.
async function mark(page, title, marks) {
  return page.evaluate(({ title, marks }) => {
    document.getElementById("__fh_marks")?.remove();
    const root = document.createElement("div");
    root.id = "__fh_marks";
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 15px/1.35 -apple-system,Helvetica,Arial,sans-serif;";
    const read = [];
    marks.forEach((m, i) => {
      const el = document.querySelector(m.sel);
      let text = "(missing)";
      if (el && el.tagName === "SELECT") text = el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : "";
      else if (el) text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (el && !text) {
        const sk = [...el.querySelectorAll(".skel")].filter((s) => getComputedStyle(s).display !== "none").length;
        text = sk ? `(no words, ${sk} grey loading bars)` : "(blank)";
      }
      read.push({ n: i + 1, sel: m.sel, text });
      if (!el) return;
      const r = el.getBoundingClientRect();
      const b = document.createElement("div");
      b.style.cssText = `position:fixed;left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${Math.max(r.height, 14) + 8}px;border:3px solid #ff2828;border-radius:4px;box-sizing:border-box;`;
      const n = document.createElement("div");
      n.textContent = String(i + 1);
      n.style.cssText = "position:absolute;left:-14px;top:-14px;width:24px;height:24px;border-radius:12px;background:#ff2828;color:#fff;text-align:center;line-height:24px;font-size:14px;";
      b.appendChild(n);
      root.appendChild(b);
    });
    const leg = document.createElement("div");
    leg.style.cssText = "position:fixed;left:240px;right:16px;bottom:30px;background:rgba(0,0,0,.86);color:#fff;padding:12px 16px;border:3px solid #ff2828;border-radius:6px;white-space:pre-wrap;";
    const words = [...document.querySelectorAll("#ccp-record-head, #ccp-cp-blockers")].map((e) => e.innerText).join(" ");
    const bad = ["No client open", "Pick a client below.", "Open a client file to see what is blocking it."].filter((w) => words.includes(w));
    leg.textContent = title + "\n" + marks.map((m, i) => `${i + 1}. ${m.label} — reads: "${read[i].text.slice(0, 90)}"`).join("\n")
      + `\n"No client open" words on screen right now: ${bad.length ? "YES — " + bad.join(" / ") : "none"}`;
    root.appendChild(leg);
    document.body.appendChild(root);
    return read;
  }, { title, marks });
}

for (let i = 1; i <= LOADS; i++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addCookies([
    { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
  ]);
  await context.route("**/*", (route) => {
    const r = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) {
      blocked.push({ load: i, method: r.method(), url: r.url() });
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript((BAD) => {
    window.__frames = [];
    window.__bad = [];
    window.__fcp = null;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__fcp = Math.round(e.startTime); })
        .observe({ type: "paint", buffered: true });
    } catch {}
    const txt = (id) => { const el = document.getElementById(id); return el ? (el.innerText || "").replace(/\s+/g, " ").trim() : null; };
    let last = "";
    const tick = () => {
      if (document.getElementById("ccp-name")) {
        const f = {
          t: Math.round(performance.now()),
          name: txt("ccp-name"),
          key: txt("ccp-key"),
          head: txt("ccp-record-head"),
          blockers: txt("ccp-cp-blockers"),
          picker: (() => { const s = document.querySelector("#ccp-record-head select, select"); return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent.trim() : null; })(),
          opening: document.documentElement.classList.contains("ccp-opening"),
        };
        for (const w of BAD) {
          if ((f.head || "").includes(w) || (f.blockers || "").includes(w)) window.__bad.push({ t: f.t, words: w });
        }
        const sig = JSON.stringify([f.name, f.key, f.blockers, f.picker, f.opening]);
        if (sig !== last) { window.__frames.push(f); last = sig; }
      }
      if (performance.now() < 20000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, BAD);

  const page = await context.newPage();
  await page.goto(URL, { waitUntil: "commit", timeout: 45_000 });

  // Shot A: the first moment the panel is on screen.
  await page.waitForSelector("#ccp-name", { state: "visible", timeout: 30_000 });
  const tA = await page.evaluate(() => Math.round(performance.now()));
  const readA = await mark(page, `LOAD ${i} — FIRST PAINT (${tA} ms after navigation). Live fundhub.ai, #9 Nine-Repair. Nothing clicked.`, [
    { sel: "#ccp-name", label: "Name line" },
    { sel: "#ccp-key", label: "Line under the name" },
    { sel: "#ccp-cp-blockers", label: "Active blockers" },
    { sel: "select", label: "Client picker" },
  ]);
  const shotA = `${SHOTS}/load${i}-a-first-paint.png`;
  await page.screenshot({ path: shotA });
  await page.evaluate(() => document.getElementById("__fh_marks")?.remove());

  // Shot B: the moment the name line reads Sim Nine-Repair.
  let nameAt = null;
  try {
    await page.waitForFunction(() => ((document.getElementById("ccp-name") || {}).innerText || "").trim() === "Sim Nine-Repair", null, { timeout: 30_000, polling: "raf" });
    nameAt = await page.evaluate(() => Math.round(performance.now()));
  } catch { nameAt = "timeout 30s"; }
  const readB = await mark(page, `LOAD ${i} — NAME SHOWS at ${nameAt} ms after navigation. Live fundhub.ai, #9 Nine-Repair. Nothing clicked.`, [
    { sel: "#ccp-name", label: "Name line" },
    { sel: "#ccp-key", label: "Line under the name" },
    { sel: "#ccp-cp-blockers", label: "Active blockers" },
    { sel: "select", label: "Client picker" },
  ]);
  const shotB = `${SHOTS}/load${i}-b-name-shows.png`;
  await page.screenshot({ path: shotB });
  await page.evaluate(() => document.getElementById("__fh_marks")?.remove());

  // Let the rest of the file land, then Shot C (settled).
  await page.waitForTimeout(3000);
  const readC = await mark(page, `LOAD ${i} — SETTLED (about ${nameAt === "timeout 30s" ? "?" : nameAt + 3000} ms). Live fundhub.ai, #9 Nine-Repair. Nothing clicked.`, [
    { sel: "#ccp-name", label: "Name line" },
    { sel: "#ccp-key", label: "Line under the name" },
    { sel: "#ccp-cp-blockers", label: "Active blockers" },
    { sel: "select", label: "Client picker" },
  ]);
  const shotC = `${SHOTS}/load${i}-c-settled.png`;
  await page.screenshot({ path: shotC });

  const out = await page.evaluate(() => ({
    fcp: window.__fcp,
    frames: window.__frames,
    bad: window.__bad,
    nav: (() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { responseEnd: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd) } : null; })(),
  }));
  const firstFrame = out.frames[0] || null;
  loads.push({ load: i, firstPaintMs: out.fcp, firstFrame, shotA: { atMs: tA, read: readA }, nameShowsAtMs: nameAt, shotB: { read: readB }, shotC: { read: readC }, badWordFrames: out.bad.length, badSample: out.bad.slice(0, 5), frames: out.frames, nav: out.nav });
  console.log(`load ${i}: first paint ${out.fcp} ms · first frame name="${firstFrame?.name}" key="${firstFrame?.key}" picker="${firstFrame?.picker}" · name reads Sim Nine-Repair at ${nameAt} ms · frames with No-client words: ${out.bad.length}`);
  for (const f of out.frames) console.log(`   t=${f.t} name="${f.name}" key="${(f.key || "").slice(0, 50)}" blockers="${(f.blockers || "").slice(0, 50)}" picker="${f.picker}" opening=${f.opening}`);
  await context.close();
}

writeFileSync(`${RAW}/${TAG}.json`, JSON.stringify({ url: URL, loads, blocked }, null, 2));
console.log("blocked non-GET:", JSON.stringify(blocked));
await browser.close();
await db.end?.();
process.exit(0);
