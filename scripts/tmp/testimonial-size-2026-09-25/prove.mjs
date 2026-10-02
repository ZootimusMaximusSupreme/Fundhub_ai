import { chromium } from "playwright";

const PAGE_URL = "https://apply.fundhub.ai/roadmap/";
const shots = "/Users/chrisstanbridge/Developer/fundhub-platform/scripts/tmp/testimonial-size-2026-09-25/";

const browser = await chromium.launch();

for (const [label, width, height] of [["desktop", 1440, 900], ["laptop", 1280, 800], ["phone", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(PAGE_URL, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  const data = await page.evaluate(() => {
    const grid = document.querySelector(".fh-b .proofgrid");
    const slots = [...document.querySelectorAll(".fh-b .proofgrid .vslot")];
    const wrap = document.querySelector(".fh-b footer .wrap") || document.querySelector(".fh-root .wrap");
    const r = (el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      grid: grid ? r(grid) : null,
      slots: slots.map((s) => ({ ...r(s), src: s.querySelector("video")?.currentSrc || s.querySelector("video")?.src })),
      wrap: wrap ? r(wrap) : null,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      kicker: (() => { const k = document.querySelector(".fh-b .proofgrid .kicker"); if (!k) return null; const b = k.getBoundingClientRect(); const cs = getComputedStyle(k); return { h: Math.round(b.height), lineHeight: cs.lineHeight, text: k.textContent.trim() }; })(),
    };
  });
  console.log(label, JSON.stringify(data, null, 2));

  const grid = await page.$(".fh-b .proofgrid");
  await grid.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}live-${label}.png`, fullPage: false });
  await grid.screenshot({ path: `${shots}grid-${label}.png` });
  await page.close();
}

await browser.close();
