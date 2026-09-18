// Hole 13 — burn numbered red boxes + a caption legend onto the two key shots
// (CLAUDE.md §8). Reads the raw PNGs from the evidence folder, draws in a
// headless page, writes *-marked.png beside them. Nothing touches the site.
// Run: node scripts/tmp/live-fix-2026-09-18/h13-mark.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13";
const JOBS = [
  {
    src: "verify-id-load1.png",
    title: "Real staff sign-in (password page), ?id= on #11 — settles on Sim",
    marks: [
      { n: 1, x: 500, y: 10, w: 210, h: 38, cap: "Name pill says Sim Eleven-Blueprint — matches file #11" },
      { n: 2, x: 348, y: 78, w: 170, h: 26, cap: "Greeting says Welcome back, Sim" },
    ],
  },
  {
    src: "bare-cookie-id-fresh1-first.png",
    title: "Cookie only, no saved role, FIRST load of ?id= on #11 — says Chris",
    marks: [
      { n: 1, x: 532, y: 10, w: 180, h: 38, cap: "Name pill says Chris Stanbridge (the signed-in owner), not the file" },
      { n: 2, x: 348, y: 78, w: 175, h: 26, cap: "Greeting says Welcome back, Chris. A reload of the same page says Sim." },
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
    <div style="position:relative;width:1440px;height:260px"><img src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>
    <div style="font:15px Helvetica;padding:10px 16px;border-top:2px solid #ff2828;line-height:1.7"><div style="font-weight:700;margin-bottom:4px">${job.title}</div>${legend}</div>
  </body>`);
  const out = `${DIR}/${job.src.replace(/\.png$/, "-marked.png")}`;
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
}
await browser.close();
