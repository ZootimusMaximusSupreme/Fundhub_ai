// N3 reviewer — red numbered boxes + one-line legend per mark on the review shots (CLAUDE.md §8).
// Reads PNGs from the review folder, draws in a headless page, writes *-marked.png. Touches no site.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N3/review";
const j = (f) => JSON.parse(readFileSync(`${DIR}/${f}.json`, "utf8"));
const net = (run, i) => {
  const s = j(run).summary[i];
  return `route recorder ${s.route_writes_during_load} write requests, DevTools recorder ${s.cdp_writes_during_load}; ${s.outbound_calls_during_load.join("; ")}`;
};
const JOBS = [
  { src: "rr2-run1-load1-card.png", h: 203, title: `CHECK 1 — live, own sign-in, direct load of Ops Admin (${j("rr2-run1").loads[0].load_started})`,
    marks: [
      { n: 1, x: 10, y: 35, w: 470, h: 98, cap: `Real numbers, read by a GET. During this load: ${net("rr2-run1", 0)}` },
      { n: 2, x: 10, y: 137, w: 310, h: 48, cap: "Buttons still shown (they act only when pressed)" },
    ] },
  { src: "rr2-run2-load2-card.png", h: 203, title: `CHECK 2 — live, second separate sign-in, page held open 45 s (${j("rr2-run2").loads[1].load_started})`,
    marks: [
      { n: 1, x: 10, y: 35, w: 470, h: 98, cap: `Real numbers, read by a GET. During load + 45 s hold: ${net("rr2-run2", 1)}` },
      { n: 2, x: 10, y: 137, w: 480, h: 48, cap: "Buttons still shown, incl. Send what is waiting (2 were queued by other activity at that moment)" },
    ] },
  { src: "rr2-run2-adjacent-card.png", h: 223, title: "NEXT-DOOR PATH — button pressed with every write blocked inside the browser",
    marks: [
      { n: 1, x: 310, y: 137, w: 180, h: 48, cap: "Pressed: it still sends POST /api/messages-outbound {action: email_invoice_backlog} — the button path is unchanged" },
      { n: 2, x: 8, y: 186, w: 130, h: 28, cap: "The blocked write shows 'Failed to fetch'; nothing left the browser (live DB: 0 invoices emailed since 19:45 UTC)" },
    ] },
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1164, height: 300 } });
for (const job of JOBS) {
  const b64 = readFileSync(`${DIR}/${job.src}`).toString("base64");
  const boxes = job.marks.map((m) => `
    <div style="position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;border:3px solid #ff2828;box-sizing:border-box"></div>
    <div style="position:absolute;left:${m.x + m.w + 4}px;top:${m.y}px;background:#ff2828;color:#fff;font:700 14px Helvetica;padding:1px 7px">${m.n}</div>`).join("");
  const legend = job.marks.map((m) => `<div><b style="background:#ff2828;color:#fff;padding:0 6px;margin-right:8px">${m.n}</b>${m.cap}</div>`).join("");
  await page.setContent(`<body style="margin:0;background:#fff">
    <div style="position:relative;width:1164px;height:${job.h}px"><img src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>
    <div style="font:14px Helvetica;padding:10px 16px;border-top:2px solid #ff2828;line-height:1.7"><div style="font-weight:700;margin-bottom:4px">${job.title}</div>${legend}</div>
  </body>`);
  const out = `${DIR}/${job.src.replace(/\.png$/, "-marked.png")}`;
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
}
await browser.close();
