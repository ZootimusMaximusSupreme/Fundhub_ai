// Reviewer hole 11 — burn red numbered boxes + a one-line-per-mark legend onto the raw shots.
// Offline only: renders each raw PNG in a local headless page with overlays, then screenshots it.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-11/review";
const data = JSON.parse(readFileSync(`${DIR}/_raw/r11-review.json`, "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  for (const m of data.marks) {
    const b64 = readFileSync(m.raw).toString("base64");
    const boxes = m.boxes.filter((b) => !b.missing).map((b) =>
      `<div style="position:absolute;left:${b.x - 3}px;top:${b.y - 3}px;width:${b.w + 6}px;height:${b.h + 6}px;border:4px solid #ff2828;box-sizing:border-box"></div>` +
      `<div style="position:absolute;left:${b.x - 3}px;top:${Math.max(0, b.y - 3)}px;background:#ff2828;color:#fff;font:bold 20px Helvetica,Arial;padding:2px 9px">${b.n}</div>`).join("");
    const legend = m.boxes.map((b) => `<div style="margin:4px 0"><b style="display:inline-block;background:#ff2828;color:#fff;padding:0 8px;margin-right:8px">${b.n}</b>${esc(b.caption)}${b.missing ? " (element not found)" : ""}</div>`).join("");
    const html = `<html><body style="margin:0;background:#fff"><div style="position:relative;display:inline-block"><img id="i" src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>` +
      `<div id="lg" style="font:16px Helvetica,Arial;color:#111;background:#fff8e1;border-top:3px solid #ff2828;padding:10px 14px">${legend}</div></body></html>`;
    await page.setContent(html);
    const w = await page.evaluate(() => document.getElementById("i").naturalWidth);
    await page.setViewportSize({ width: Math.max(w, 700), height: 600 });
    await page.screenshot({ path: m.out, fullPage: true });
    console.log("marked", m.out);
  }
} finally { await browser.close(); }
