// HOLE 3 — redraw the red boxes on the saved raw screenshot. Offline: the page
// is built from the PNG as a data URL, so there is no network and no new login.
//   node scripts/tmp/live-fix-2026-09-17/hole-3-remark.mjs
// Box positions are the real element positions from the live run
// (prove.json marks for #1; read off the raw shot for #2 and #3).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const DIR = "/tmp/live-fix-2026-09-17/hole-3";
const png = readFileSync(`${DIR}/csm-queue-elena-raw.png`).toString("base64");
const marks = [
  { x: 323, y: 77, w: 190, h: 16, text: "Signed in as the new real person, Elena Brooks, role csm (not the demo account)" },
  { x: 423, y: 8, w: 96, h: 26, text: "Her home page: the Client Success queue, “My queue” (csm-queue.html)" },
  { x: 253, y: 236, w: 1162, h: 119, text: "Her queue loaded with her own sign-in. Nothing was clicked." }
];
const boxes = marks.map((m, i) => `
  <div style="position:absolute;left:${m.x - 4}px;top:${m.y - 4}px;width:${m.w + 8}px;height:${m.h + 8}px;border:3px solid #FF2828;border-radius:4px;box-sizing:border-box"></div>
  <div style="position:absolute;left:${Math.max(0, m.x - 16)}px;top:${Math.max(0, m.y - 16)}px;width:24px;height:24px;border-radius:12px;background:#FF2828;color:#fff;font:700 14px/24px Helvetica,Arial,sans-serif;text-align:center">${i + 1}</div>`).join("");
const legend = `
  <div style="position:absolute;left:16px;bottom:16px;max-width:780px;background:rgba(0,0,0,.88);color:#fff;border:2px solid #FF2828;border-radius:8px;padding:10px 14px;font:500 14px/1.45 Helvetica,Arial,sans-serif">
    <div style="font-weight:700;margin-bottom:4px">Hole 3 proof — a real Client Success person can sign in (demo sign-ins stay off)</div>
    ${marks.map((m, i) => `<div><b style="color:#FF6B6B">${i + 1}</b> — ${m.text}</div>`).join("")}
  </div>`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.route("**/*", (route) => route.abort());
await page.setContent(`<!doctype html><html><body style="margin:0;position:relative;width:1440px;height:900px;overflow:hidden">
  <img src="data:image/png;base64,${png}" style="position:absolute;left:0;top:0;width:1440px;height:900px">${boxes}${legend}</body></html>`);
await page.waitForFunction(() => document.images[0] && document.images[0].complete);
await page.screenshot({ path: `${DIR}/csm-queue-elena-marked.png` });
await browser.close();
console.log(`${DIR}/csm-queue-elena-marked.png`);
