/* Re-take the phone "From our clients" shot with the first video card fully in the window.
 * On a phone the three cards stack one per row (shipped in the same deploy by the
 * video-stack-mobile workflow), so the row no longer fits in one viewport-height screenshot.
 * Live page, nothing injected.   node _vidshot.mjs <phase> <dir>
 */
import { createRequire } from "node:module";
const { chromium } = createRequire("/Users/chrisstanbridge/Developer/fundhub-platform/package.json")("playwright");
import fs from "node:fs";
import path from "node:path";

const PHASE = process.argv[2] || "after";
const OUT = process.argv[3];
const RAW = path.join(OUT, "_raw");
const URL = "https://apply.fundhub.ai/watch";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#fh-watch-proof", { timeout: 30000 });
await page.waitForTimeout(2500);

const slotTop = () => page.evaluate(() => {
  const s = document.querySelector("#fh-watch-proof .fhx-vslot");
  const b = s.getBoundingClientRect();
  return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), vh: innerHeight };
});

for (let i = 0; i < 300; i++) {
  const s = await slotTop();
  if (s.top >= 24 && s.bottom <= s.vh - 16) break;
  await page.mouse.wheel(0, s.top > s.vh ? 240 : 60);
  await page.waitForTimeout(40);
}
await page.waitForTimeout(500);

const meta = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const sec = document.getElementById("fh-watch-proof");
  const slots = [...sec.querySelectorAll(".fhx-vslot")];
  const rail = sec.querySelector(".fhx-rail");
  const cs = getComputedStyle(slots[0]);
  const lab = getComputedStyle(slots[0].querySelector("span"));
  const b0 = slots[0].getBoundingClientRect(), b1 = slots[1].getBoundingClientRect();
  return {
    stacked: b1.top >= b0.bottom - 1,
    slot: r(slots[0]), slotCount: slots.length, slotRects: slots.map(r),
    slotRatio: +(b0.height / b0.width).toFixed(3),
    vgap: +(b1.top - b0.bottom).toFixed(1),
    vrowLeft: +b0.left.toFixed(1), vrowRight: +b0.right.toFixed(1),
    railWidth: rail.clientWidth,
    slotStyle: { bg: cs.backgroundColor, border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor, radius: cs.borderTopLeftRadius, pad: cs.paddingTop },
    labelStyle: { color: lab.color, size: lab.fontSize, tt: lab.textTransform, ls: lab.letterSpacing, ff: lab.fontFamily.split(",")[0] },
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
  };
});
await page.screenshot({ path: path.join(RAW, `vids-390-${PHASE}.png`) });
fs.writeFileSync(path.join(RAW, `vids-390-${PHASE}.json`), JSON.stringify(meta, null, 1));
console.log("390", PHASE, JSON.stringify(meta));
await ctx.close();
await browser.close();
