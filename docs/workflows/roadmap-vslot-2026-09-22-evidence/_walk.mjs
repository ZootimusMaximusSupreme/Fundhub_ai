// Live Playwright walk of https://apply.fundhub.ai/roadmap for the video-testimonial
// slot size fix (owner ask 2026-09-22). Opens the LIVE page as it really is — nothing
// injected, no CSS appended. Measures the three .fh-b .vslot cards, the .fh-b .proofgrid
// row, the neighbouring blocks, and whether the page scrolls sideways. Saves a full-page
// 2x shot plus each element's real box to _raw/ for _mark.py.
//
//   node _walk.mjs before 1280
//   node _walk.mjs before 390
//   node _walk.mjs after  1280
//   node _walk.mjs after  390
//
// Own headless Chromium via the repo's playwright dependency. Never the shared MCP browser.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = path.join(HERE, '_raw');
fs.mkdirSync(S, { recursive: true });

const [, , phase = 'before', w = '1280'] = process.argv;
const width = +w;
const mobile = width < 768;
const URL_ = 'https://apply.fundhub.ai/roadmap';

const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const out = `${phase}-${mobile ? 'mobile' : 'desktop'}-${width}`;

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width, height: mobile ? 844 : 900 },
  deviceScaleFactor: 2,
  userAgent: mobile ? UA_ANDROID : UA_DESKTOP,
  isMobile: mobile,
  hasTouch: mobile,
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await p.goto(URL_, { waitUntil: 'load' });
await p.evaluate(() =>
  document.querySelectorAll('img').forEach((i) => {
    i.loading = 'eager';
  }),
);
await p.waitForTimeout(3500);

const measure = await p.evaluate(() => {
  const r = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return {
      x: +b.x.toFixed(1),
      y: +(b.y + scrollY).toFixed(1),
      w: +b.width.toFixed(1),
      h: +b.height.toFixed(1),
    };
  };
  const grid = document.querySelector('.fh-b .proofgrid');
  const slots = [...document.querySelectorAll('.fh-b .proofgrid .vslot')];
  const boxes = slots.map((s) => s.getBoundingClientRect());
  const cs = slots[0] ? getComputedStyle(slots[0]) : null;
  const lab = slots[0] ? getComputedStyle(slots[0].querySelector('span')) : null;
  const gaps = [];
  for (let i = 1; i < boxes.length; i++) gaps.push(+(boxes[i].left - boxes[i - 1].right).toFixed(1));
  const rowTops = new Set(boxes.map((x) => Math.round(x.top)));
  const kick = document.querySelector('.fh-b .proofgrid .kicker');
  const cards = [...document.querySelectorAll('.fh-b .cardw')];
  const btn = document.querySelector('.fh-b .btn');
  return {
    grid: r(grid),
    gridMaxWidth: grid ? getComputedStyle(grid).maxWidth : null,
    gridGap: grid ? getComputedStyle(grid).gap : null,
    slotCount: slots.length,
    card: boxes[0]
      ? { w: +boxes[0].width.toFixed(1), h: +boxes[0].height.toFixed(1) }
      : null,
    ratio: boxes[0] ? +(boxes[0].width / boxes[0].height).toFixed(4) : null,
    ratioAll: boxes.map((x) => +(x.width / x.height).toFixed(4)),
    gaps,
    rowsUsed: rowTops.size,
    style: cs
      ? {
          background: cs.backgroundColor,
          border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
          radius: cs.borderTopLeftRadius,
          aspectRatio: cs.aspectRatio,
          maxHeight: cs.maxHeight,
          padding: cs.paddingTop,
        }
      : null,
    label: lab
      ? {
          color: lab.color,
          family: lab.fontFamily.split(',')[0].replace(/"/g, ''),
          size: lab.fontSize,
          transform: lab.textTransform,
          letterSpacing: lab.letterSpacing,
        }
      : null,
    labels: slots.map((s) => s.textContent.trim()),
    heading: kick ? kick.textContent.trim() : null,
    secureFoot: r(document.querySelector('.fh-b .secure-foot')),
    cardw: cards.map(r),
    cardwText: cards.map((c) => (c.querySelector('.kicker') || {}).textContent || ''),
    btn: r(btn),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    // checkout widget: step 1 visible and a reachable Continue (never clicked/submitted)
    checkout: (() => {
      const el = document.querySelector('#fh-cf-form');
      if (!el) return null;
      const b2 = el.getBoundingClientRect();
      const s1 = el.querySelector('form.cfw-step.s1');
      const s2 = el.querySelector('form.cfw-step.s2');
      const cont = [...el.querySelectorAll('button')].find(
        (x) => x.textContent.trim().toLowerCase() === 'continue',
      );
      const cb = cont ? cont.getBoundingClientRect() : null;
      return {
        box: { x: +b2.x.toFixed(1), y: +(b2.y + scrollY).toFixed(1), w: +b2.width.toFixed(1), h: +b2.height.toFixed(1) },
        visible: b2.width > 0 && b2.height > 0,
        step1On: s1 ? s1.classList.contains('on') && getComputedStyle(s1).display !== 'none' : null,
        step2On: s2 ? s2.classList.contains('on') : null,
        stepTabs: [...el.querySelectorAll('.cfw-steps button')].map((x) => x.textContent.trim()),
        step1Fields: s1 ? [...s1.querySelectorAll('input:not([type=hidden])')].map((i) => i.name || i.type) : [],
        continueText: cont ? cont.textContent.trim() : null,
        continueReachable: !!(cb && cb.width > 0 && cb.height > 0 && !cont.disabled),
        continueBox: cb ? { x: +cb.x.toFixed(1), y: +(cb.y + scrollY).toFixed(1), w: +cb.width.toFixed(1), h: +cb.height.toFixed(1) } : null,
      };
    })(),
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
await p.waitForTimeout(1000);
await p.screenshot({ path: `${S}/${out}.png` });

const boxes = await p.evaluate(() => {
  const r = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return [b.x, b.y + scrollY, b.width, b.height].map(Math.round);
  };
  const slots = [...document.querySelectorAll('.fh-b .proofgrid .vslot')];
  return {
    grid: r(document.querySelector('.fh-b .proofgrid')),
    slot1: r(slots[0]),
    slot3: r(slots[2]),
    heading: r(document.querySelector('.fh-b .proofgrid .kicker')),
    secureFoot: r(document.querySelector('.fh-b .secure-foot')),
    cardw1: r(document.querySelectorAll('.fh-b .cardw')[0]),
    checkout: r(document.querySelector('#fh-cf-form')),
    continue: r(
      [...document.querySelectorAll('#fh-cf-form button')].find(
        (x) => x.textContent.trim().toLowerCase() === 'continue',
      ),
    ),
  };
});

// A tighter, framed shot of just the row and its neighbours (for the zoom marks).
const ctxShot = await p.evaluate(() => {
  const g = document.querySelector('.fh-b .proofgrid');
  const f = document.querySelector('.fh-b .secure-foot');
  const c = document.querySelectorAll('.fh-b .cardw')[1];
  if (!g) return null;
  const top = Math.max(0, (f || g).getBoundingClientRect().top + scrollY - 30);
  const bot = (c || g).getBoundingClientRect().bottom + scrollY + 30;
  return { top: Math.round(top), height: Math.round(bot - top) };
});
if (ctxShot) {
  await p.screenshot({
    path: `${S}/${out}-zoom.png`,
    clip: { x: 0, y: ctxShot.top, width, height: Math.min(ctxShot.height, 6000) },
  });
  const zb = {};
  for (const [k, v] of Object.entries(boxes)) if (v) zb[k] = [v[0], v[1] - ctxShot.top, v[2], v[3]];
  fs.writeFileSync(`${S}/${out}-zoom.boxes.json`, JSON.stringify({ boxes: zb }, null, 2));
}

fs.writeFileSync(`${S}/${out}.boxes.json`, JSON.stringify({ boxes }, null, 2));
fs.writeFileSync(
  `${S}/${out}.json`,
  JSON.stringify({ phase, width, ua: mobile ? 'android-chrome' : 'desktop-chrome', url: URL_, at: new Date().toISOString(), pageHeight: H, errors, ...measure }, null, 2),
);
console.log(JSON.stringify({ out, ...measure, errors }, null, 2));
await b.close();
