// HOLE 3 FINISH — redraw the login-page picture only. GET only: opens
// fundhub.ai/login.html, types the CSM email (no password), clicks nothing,
// draws numbered red boxes, takes one screenshot. Every non-GET is aborted.
//
//   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//     scripts/tmp/live-fix-2026-09-17/hole-3-finish-loginshot.mjs

import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-3";
const email = process.env.CSM_STAFF_EMAIL;
if (!email) { console.error("CSM_STAFF_EMAIL missing"); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const blocked = [];
await page.route("**/*", (route) => {
  const m = route.request().method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  blocked.push({ method: m, url: route.request().url() });
  return route.abort();
});
let demo = null;
page.on("response", async (resp) => {
  if (resp.url() === `${BASE}/api/auth/login` && resp.request().method() === "GET") {
    demo = await resp.json().then((j) => j?.demo?.enabled ?? null).catch(() => null);
  }
});
await page.goto(`${BASE}/login.html`, { waitUntil: "networkidle", timeout: 45000 });
await page.fill("#email", email);
const demoChildren = await page.locator("#fh-demo-mount > *").count();
const marks = await page.evaluate(({ email, demo, demoChildren }) => {
  const rect = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
  const union = (a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
  const notes = document.querySelectorAll(".login-box .card > p.note");
  const lastNote = notes[notes.length - 1].getBoundingClientRect();
  const r3 = union(rect("#fh-forgot-note"), lastNote);
  const list = [
    { r: rect("#email"), text: `A real staff address typed in (${email}). Not a demo address.` },
    { r: rect("#go"), text: "Sign in: the only button pressed in the proof runs. Password came from the main .env, never shown." },
    { r: r3, text: `Where demo sign-in buttons would show. Empty (${demoChildren} buttons). Server says demo enabled: ${demo}.` }
  ];
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const placed = [];
  list.forEach((mk, i) => {
    const b = mk.r;
    const w = b.right - b.left, h = b.bottom - b.top;
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;left:${b.left - 5}px;top:${b.top - 5}px;width:${w + 10}px;height:${h + 10}px;border:3px solid #FF2828;border-radius:4px;box-sizing:border-box`;
    const tag = document.createElement("div");
    tag.textContent = String(i + 1);
    tag.style.cssText = `position:fixed;left:${Math.max(0, b.left - 18)}px;top:${Math.max(0, b.top - 18)}px;width:26px;height:26px;border-radius:13px;background:#FF2828;color:#fff;font:700 15px/26px Helvetica,Arial,sans-serif;text-align:center`;
    layer.appendChild(box); layer.appendChild(tag);
    placed.push({ n: i + 1, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(w), h: Math.round(h) });
  });
  const legend = document.createElement("div");
  legend.style.cssText = "position:fixed;left:16px;bottom:16px;max-width:860px;background:rgba(0,0,0,.88);color:#fff;border:2px solid #FF2828;border-radius:8px;padding:10px 14px;font:500 14px/1.45 Helvetica,Arial,sans-serif";
  legend.innerHTML = "<div style='font-weight:700;margin-bottom:4px'>Hole 3 FINISH — live staff login page, fundhub.ai/login.html</div>" +
    list.map((mk, i) => `<div><b style='color:#FF6B6B'>${i + 1}</b> — ${mk.text}</div>`).join("");
  layer.appendChild(legend);
  document.body.appendChild(layer);
  return placed;
}, { email, demo, demoChildren });
await page.screenshot({ path: `${SHOTS}/1-login-page-marked.png` });
await browser.close();
console.log(JSON.stringify({ demoEnabled: demo, demoChildren, blocked, marks }));
