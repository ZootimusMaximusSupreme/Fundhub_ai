// Sideways-scroll + 9:16 sweep across real widths, on the LIVE page after the push.
// Nothing injected. Own headless Chromium (repo playwright).
//   node _widths.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
const b = await chromium.launch();
const rows = [];
for (const width of WIDTHS) {
  const mobile = width < 768;
  const ctx = await b.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    userAgent: mobile ? UA_ANDROID : UA_DESKTOP,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const p = await ctx.newPage();
  await p.goto('https://apply.fundhub.ai/roadmap', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  rows.push(
    await p.evaluate((w) => {
      const slots = [...document.querySelectorAll('.fh-b .proofgrid .vslot')];
      const bx = slots.map((s) => s.getBoundingClientRect());
      const grid = document.querySelector('.fh-b .proofgrid').getBoundingClientRect();
      const gaps = [];
      for (let i = 1; i < bx.length; i++) gaps.push(+(bx[i].left - bx[i - 1].right).toFixed(1));
      return {
        width: w,
        grid: +grid.width.toFixed(1),
        card: `${bx[0].width.toFixed(1)}x${bx[0].height.toFixed(1)}`,
        ratios: bx.map((x) => +(x.width / x.height).toFixed(4)),
        gaps,
        across: new Set(bx.map((x) => Math.round(x.top))).size === 1 ? 3 : 'wrapped',
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    }, width),
  );
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(HERE, '_raw', 'widths.json'), JSON.stringify(rows, null, 2));
console.table(rows.map((r) => ({ ...r, ratios: r.ratios.join(','), gaps: r.gaps.join(',') })));
