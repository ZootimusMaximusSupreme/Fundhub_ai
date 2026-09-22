// Live proof that the $297 checkout widget still works after the push: step 1 (Contact)
// is the open step and its Continue button is on screen and enabled. NOTHING is submitted
// and Continue is never clicked. Own headless Chromium (repo playwright).
//   node _checkout.mjs 1280
//   node _checkout.mjs 390
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = path.join(HERE, '_raw');
const width = +(process.argv[2] || 1280);
const mobile = width < 768;
const out = `checkout-${mobile ? 'mobile' : 'desktop'}-${width}`;

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width, height: mobile ? 844 : 900 },
  deviceScaleFactor: 2,
  userAgent: mobile
    ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  isMobile: mobile,
  hasTouch: mobile,
});
const p = await ctx.newPage();
await p.goto('https://apply.fundhub.ai/roadmap', { waitUntil: 'load' });
await p.waitForTimeout(3500);

const info = await p.evaluate(() => {
  const el = document.querySelector('#fh-cf-form');
  const s1 = el.querySelector('form.cfw-step.s1');
  const cont = [...el.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Continue');
  const r = (e) => {
    const b = e.getBoundingClientRect();
    return [b.x, b.y + scrollY, b.width, b.height].map(Math.round);
  };
  return {
    widget: r(el),
    tabs: r(el.querySelector('.cfw-steps')),
    step1: r(s1),
    continue: r(cont),
    step1Open: s1.classList.contains('on') && getComputedStyle(s1).display !== 'none',
    continueEnabled: !cont.disabled,
    fields: [...s1.querySelectorAll('input:not([type=hidden])')].map((i) => i.name),
    grid: r(document.querySelector('.fh-b .proofgrid')),
  };
});

const H = await p.evaluate(() => {
  let m = 0;
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect().bottom + scrollY;
    if (r > m) m = r;
  });
  return Math.ceil(m);
});
await p.setViewportSize({ width, height: Math.min(H, 20000) });
await p.waitForTimeout(800);
const top = Math.max(0, info.widget[1] - 40);
const bot = info.grid[1] + info.grid[3] + 30;
await p.screenshot({ path: `${S}/${out}.png`, clip: { x: 0, y: top, width, height: bot - top } });
const boxes = {};
for (const k of ['widget', 'tabs', 'step1', 'continue', 'grid'])
  boxes[k] = [info[k][0], info[k][1] - top, info[k][2], info[k][3]];
fs.writeFileSync(`${S}/${out}-zoom.boxes.json`, JSON.stringify({ boxes }, null, 2));
fs.writeFileSync(`${S}/${out}.json`, JSON.stringify({ width, at: new Date().toISOString(), submitted: false, clickedContinue: false, ...info }, null, 2));
console.log(JSON.stringify(info, null, 2));
await b.close();
