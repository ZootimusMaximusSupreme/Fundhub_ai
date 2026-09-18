// Hole 13 round 2 — burn numbered red boxes + a caption legend onto the
// before (live) and after (fixed page, live data) cookie-only shots (CLAUDE.md
// §8). Reads the raw PNGs from the evidence folder, draws in a headless page,
// writes *-marked.png beside them. Nothing touches the site.
// Run: node scripts/tmp/live-fix-2026-09-18/h13r2-mark.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13/round2";
const JOBS = [
  {
    src: "live-before-cookie-only-id-first.png",
    title: "BEFORE (live site): cookie only, no saved role, first load of ?id= on #11 — says Chris",
    marks: [
      { n: 1, x: 532, y: 10, w: 180, h: 38, cap: "Name at the top says Chris Stanbridge (the person signed in), not the client on the file" },
      { n: 2, x: 346, y: 76, w: 175, h: 28, cap: "Greeting says Welcome back, Chris" },
    ],
  },
  {
    src: "local-after-cookie-only-id-first.png",
    title: "AFTER (fixed page, live data): same cookie-only first load of ?id= on #11 — says Sim",
    marks: [
      { n: 1, x: 502, y: 10, w: 210, h: 38, cap: "Name at the top says Sim Eleven-Blueprint — matches file #11" },
      { n: 2, x: 346, y: 76, w: 165, h: 28, cap: "Greeting says Welcome back, Sim" },
    ],
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 420 } });
for (const job of JOBS) {
  const b64 = readFileSync(`${DIR}/${job.src}`).toString("base64");
  const boxes = job.marks.map((m) => `
    <div style="position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;border:3px solid #ff2828"></div>
    <div style="position:absolute;left:${m.x - 3}px;top:${m.y + m.h + 2}px;background:#ff2828;color:#fff;font:700 14px Helvetica;padding:1px 7px">${m.n}</div>`).join("");
  const legend = job.marks.map((m) => `<div><b style="background:#ff2828;color:#fff;padding:0 6px;margin-right:8px">${m.n}</b>${m.cap}</div>`).join("");
  await page.setContent(`<body style="margin:0;background:#fff">
    <div style="position:relative;width:1440px;height:300px"><img src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>
    <div style="font:15px Helvetica;padding:10px 16px;border-top:2px solid #ff2828;line-height:1.7"><div style="font-weight:700;margin-bottom:4px">${job.title}</div>${legend}</div>
  </body>`);
  const out = `${DIR}/${job.src.replace(/\.png$/, "-marked.png")}`;
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
}
await browser.close();
