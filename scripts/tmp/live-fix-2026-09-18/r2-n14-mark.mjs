// Hole N14 — burn numbered red boxes + a caption legend onto the before (live)
// and after (fixed page, live data) shots of the line under the greeting
// (CLAUDE.md §8). Reads the raw PNGs from the evidence folder, draws in a
// headless page, writes *-marked.png beside them. Nothing touches the site.
// Run: node scripts/tmp/live-fix-2026-09-18/r2-n14-mark.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N14";
const LINE = { x: 348, y: 103, w: 600, h: 30 }; // #greeting-sub-pre, measured in the page (x 354, y 106, h 24)
const JOBS = [
  {
    src: "live-before-c-staff-id-first-error-flash.png",
    title: "BEFORE (live site): staff open #11 by ?id= — first ~0.4 s of a GOOD load",
    marks: [{ n: 1, ...LINE, cap: "Says \"We could not load your file…\" although the file loads fine a moment later" }],
  },
  {
    src: "local-after-3-staff-id-first-loading.png",
    title: "AFTER (fixed page, live data): same load of #11 — same moment",
    marks: [{ n: 1, ...LINE, cap: "Says \"Loading your file…\" while the file is on its way — no error" }],
  },
  {
    src: "local-after-3-staff-id-nine-end.png",
    title: "AFTER (fixed page, live data): #9 once loaded (the line stays on screen for a repair file)",
    marks: [
      { n: 1, x: 348, y: 78, w: 170, h: 26, cap: "Greeting names the client on the file" },
      { n: 2, ...LINE, cap: "Normal words — the error was never shown on this load" },
    ],
  },
  {
    src: "local-after-3-staff-bogus-id-end.png",
    title: "AFTER (fixed page, live data): staff open an id that is no file — a REAL failure",
    marks: [{ n: 1, ...LINE, cap: "The error still shows when there really is no file" }],
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 420 } });
for (const job of JOBS) {
  const b64 = readFileSync(`${DIR}/${job.src}`).toString("base64");
  const boxes = job.marks.map((m) => `
    <div style="position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;border:3px solid #ff2828"></div>
    <div style="position:absolute;left:${m.x + m.w + 6}px;top:${m.y + 3}px;background:#ff2828;color:#fff;font:700 14px Helvetica;padding:1px 7px">${m.n}</div>`).join("");
  const legend = job.marks.map((m) => `<div><b style="background:#ff2828;color:#fff;padding:0 6px;margin-right:8px">${m.n}</b>${m.cap}</div>`).join("");
  await page.setContent(`<body style="margin:0;background:#fff">
    <div style="position:relative;width:1440px;height:320px"><img src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>
    <div style="font:15px Helvetica;padding:10px 16px;border-top:2px solid #ff2828;line-height:1.7"><div style="font-weight:700;margin-bottom:4px">${job.title}</div>${legend}</div>
  </body>`);
  const out = `${DIR}/${job.src.replace(/\.png$/, "-marked.png")}`;
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
}
await browser.close();
