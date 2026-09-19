// Hole N3 — burn numbered red boxes + a caption legend onto the before (live)
// and after (fixed page, live data) Outbound Mail panel shots (CLAUDE.md §8).
// Reads the raw PNGs from the evidence folder, draws in a headless page, writes
// *-marked.png beside them. Nothing touches the site.
// Run: node scripts/tmp/live-fix-2026-09-18/r2-n3-mark.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/n3";
const JOBS = [
  {
    src: "before-block-load1-panel.png", h: 97,
    title: "BEFORE (live site, write requests blocked): the page sent 1 POST /api/messages-outbound on each of 2 loads",
    marks: [
      { n: 1, x: 8, y: 36, w: 830, h: 30, cap: "With the POST blocked the panel is empty — it could only fill itself by sending a write-type request on page load" },
    ],
  },
  {
    src: "before-baseline-load1-panel.png", h: 203,
    title: "BEFORE (live site, only the POST {action:status} let through): what the panel needs to show",
    marks: [
      { n: 1, x: 8, y: 38, w: 470, h: 96, cap: "Summary, counts, how mail is sent, and the unsent-invoice line" },
      { n: 2, x: 8, y: 138, w: 316, h: 48, cap: "Pause sending and Email unsent invoices buttons" },
    ],
  },
  {
    src: "local-new-load1-panel.png", h: 203,
    title: "AFTER (fixed page, live data, every write request blocked): 0 write requests on each of 2 loads",
    marks: [
      { n: 1, x: 8, y: 38, w: 470, h: 96, cap: "Same summary, counts, routes and invoice line as before — now read with a GET" },
      { n: 2, x: 8, y: 138, w: 316, h: 48, cap: "Same buttons. They still only act when clicked (POST, owner/admin)" },
    ],
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1164, height: 300 } });
for (const job of JOBS) {
  const b64 = readFileSync(`${DIR}/${job.src}`).toString("base64");
  const boxes = job.marks.map((m) => `
    <div style="position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;border:3px solid #ff2828"></div>
    <div style="position:absolute;left:${m.x + m.w + 4}px;top:${m.y}px;background:#ff2828;color:#fff;font:700 14px Helvetica;padding:1px 7px">${m.n}</div>`).join("");
  const legend = job.marks.map((m) => `<div><b style="background:#ff2828;color:#fff;padding:0 6px;margin-right:8px">${m.n}</b>${m.cap}</div>`).join("");
  await page.setContent(`<body style="margin:0;background:#fff">
    <div style="position:relative;width:1164px;height:${job.h}px"><img src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>
    <div style="font:15px Helvetica;padding:10px 16px;border-top:2px solid #ff2828;line-height:1.7"><div style="font-weight:700;margin-bottom:4px">${job.title}</div>${legend}</div>
  </body>`);
  const out = `${DIR}/${job.src.replace(/\.png$/, "-marked.png")}`;
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
}
await browser.close();
