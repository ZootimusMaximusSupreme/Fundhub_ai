/* The end-of-slide shot: the furthest the approvals row travels while the whole row is
 * still on screen, so the picture shows the last card actually stopping inside the row.
 * Live page, nothing injected.   node _endshot.mjs <phase> <dir>
 */
import { createRequire } from "node:module";
const { chromium } = createRequire("/Users/chrisstanbridge/Developer/fundhub-platform/package.json")("playwright");
import fs from "node:fs";
import path from "node:path";

const PHASE = process.argv[2] || "after";
const OUT = process.argv[3];
const RAW = path.join(OUT, "_raw");
const URL = "https://apply.fundhub.ai/watch";
const VIEWS = [
  { w: 1280, h: 900, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", mobile: false },
  { w: 390, h: 844, ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36", mobile: true },
];

fs.mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const v of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, userAgent: v.ua, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#fh-watch-proof", { timeout: 30000 });
  await page.waitForTimeout(2500);

  // Scroll with a real mouse wheel: this page's own scroller does not answer window.scrollTo
  // from a fresh load, and a wheel is what a person does anyway.
  const read = () => page.evaluate(() => {
    const sec = document.getElementById("fh-watch-proof");
    const rail = sec.querySelector(".fhx-rail");
    const track = sec.querySelector(".fhx-track");
    const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    const b = rail.getBoundingClientRect();
    return { tx: +m.m41.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), full: b.top >= 0 && b.bottom <= innerHeight, vh: innerHeight };
  });
  let best = null, steps = 0;
  for (let i = 0; i < 220; i++) {
    const s = await read();
    if (s.full && (!best || s.tx < best.tx)) best = { step: i, tx: s.tx };
    if (s.bottom < 0) break;            // the row has left the top of the window
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(35);
    steps = i;
  }
  // come back up to the best spot
  for (let i = 0; i < 400; i++) {
    const s = await read();
    if (s.full && Math.abs(s.tx - (best ? best.tx : 0)) < 1) break;
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(600);

  const meta = await page.evaluate((info) => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const sec = document.getElementById("fh-watch-proof");
    const rail = sec.querySelector(".fhx-rail");
    const track = sec.querySelector(".fhx-track");
    const cards = [...sec.querySelectorAll(".fhx-track>.fh-card")];
    const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    const rb = rail.getBoundingClientRect(), lb = cards.at(-1).getBoundingClientRect();
    return {
      wheelSteps: info.steps, bestTx: info.bestTx, txHere: +m.m41.toFixed(1),
      travelNeeded: +(track.scrollWidth - rail.clientWidth).toFixed(1),
      railFullyOnScreen: rb.top >= 0 && rb.bottom <= innerHeight,
      rail: r(rail), lastCard: r(cards.at(-1)), cardCount: cards.length,
      lastCardInsideRail: lb.left >= rb.left - 1 && lb.right <= rb.right + 1,
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
      bodyScrollW: document.body.scrollWidth, bodyClientW: document.body.clientWidth,
    };
  }, { steps, bestTx: best ? best.tx : null });

  await page.screenshot({ path: path.join(RAW, `end-${v.w}-${PHASE}.png`) });
  fs.writeFileSync(path.join(RAW, `end-${v.w}-${PHASE}.json`), JSON.stringify(meta, null, 1));
  console.log(v.w, PHASE, JSON.stringify(meta));
  await ctx.close();
}
await browser.close();
