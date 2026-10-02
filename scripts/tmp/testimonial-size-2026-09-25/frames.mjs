import { chromium } from "playwright";

const shots = "/Users/chrisstanbridge/Developer/fundhub-platform/scripts/tmp/testimonial-size-2026-09-25/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://apply.fundhub.ai/roadmap/", { waitUntil: "load" });
const grid = await page.$(".fh-b .proofgrid");
await grid.scrollIntoViewIfNeeded();
await page.waitForTimeout(9000);
console.log(
  JSON.stringify(
    await page.evaluate(() =>
      [...document.querySelectorAll(".fh-b .proofgrid video")].map((v) => ({
        title: v.title,
        readyState: v.readyState,
        vw: v.videoWidth,
        vh: v.videoHeight,
        dur: v.duration,
        box: (() => { const b = v.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}`; })(),
      }))
    ),
    null,
    2
  )
);
await grid.screenshot({ path: `${shots}grid-desktop-warm.png` });
await browser.close();
