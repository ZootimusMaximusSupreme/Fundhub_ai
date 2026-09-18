// Hole N15 — burn numbered red boxes + a caption legend onto the key shots
// (CLAUDE.md §8). Reads the raw PNGs from the evidence folder, draws in a
// headless page, writes *-marked.png beside them. Nothing touches the site.
// Run: node scripts/tmp/live-fix-2026-09-18/r2-N15-mark.mjs
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N15";
const JOBS = [
  {
    src: "before-b-ccp1.png",
    title: "BEFORE (live as shipped): #11's control panel — the rail's Client Portal row",
    marks: [
      { n: 1, x: 4, y: 378, w: 218, h: 32, cap: "Client Portal row. Its link was plain client-portal.html — no client on it (2 of 2 loads)" },
      { n: 2, x: 242, y: 56, w: 440, h: 26, cap: "The control panel IS open on a client: Sim Eleven-Blueprint (#11)" },
    ],
  },
  {
    src: "before-b-portal1.png",
    title: "BEFORE (live as shipped): after clicking that row — the portal opens on nobody",
    marks: [
      { n: 1, x: 348, y: 78, w: 580, h: 52, cap: "\"We could not load your file.\" — same on both clicks" },
      { n: 2, x: 646, y: 12, w: 64, h: 34, cap: "Name pill is blank dashes — no client picked" },
    ],
  },
  {
    src: "after-local-shell-b-portal1.png",
    title: "AFTER (live site + this branch's shell.js): same click from #11's control panel",
    marks: [
      { n: 1, x: 504, y: 10, w: 206, h: 38, cap: "Name pill says Sim Eleven-Blueprint — the control panel's client. Address: client-portal.html?client_id=029964c5…" },
      { n: 2, x: 348, y: 78, w: 340, h: 52, cap: "Greeting: \"Welcome back, Sim\" — no \"could not load your file\" (2 of 2 clicks)" },
    ],
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 600 } });
for (const job of JOBS) {
  const file = `${DIR}/${job.src}`;
  if (!existsSync(file)) { console.log("skip (missing)", job.src); continue; }
  const b64 = readFileSync(file).toString("base64");
  const boxes = job.marks.map((m) => `
    <div style="position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;border:3px solid #ff2828"></div>
    <div style="position:absolute;left:${m.x - 3}px;top:${m.y + m.h + 2}px;background:#ff2828;color:#fff;font:700 14px Helvetica;padding:1px 7px">${m.n}</div>`).join("");
  const legend = job.marks.map((m) => `<div><b style="background:#ff2828;color:#fff;padding:0 6px;margin-right:8px">${m.n}</b>${m.cap}</div>`).join("");
  await page.setContent(`<body style="margin:0;background:#fff">
    <div style="position:relative;width:1440px;height:460px;overflow:hidden"><img src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>
    <div style="font:15px Helvetica;padding:10px 16px;border-top:2px solid #ff2828;line-height:1.7"><div style="font-weight:700;margin-bottom:4px">${job.title}</div>${legend}</div>
  </body>`);
  const out = `${DIR}/${job.src.replace(/\.png$/, "-marked.png")}`;
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
}
await browser.close();
