// /funding-book-call before/after the fh-book-fit layer, 2026-09-22. Own headless Chromium, real-browser UA.
// "after" injects clickfunnels-fragments/04d-book-fit.html into the LIVE page in this throwaway browser only.
// Looks only: never picks a time, never presses Confirm or Book.
//   node docs/workflows/book-call-mobile-2026-09-22-evidence/_shoot.mjs 390
//   node docs/workflows/book-call-mobile-2026-09-22-evidence/_shoot.mjs 1280
//   python3 docs/workflows/book-call-mobile-2026-09-22-evidence/_mark.py
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const RAW = path.join(HERE, '_raw');
fs.mkdirSync(RAW, { recursive: true });
const width = Number(process.argv[2] || 390);
const mobile = width < 600;
const dpr = mobile ? 2 : 1;
const UA = mobile
  ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
  : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const css = fs.readFileSync(path.join(ROOT, 'clickfunnels-fragments/04d-book-fit.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const browser = await chromium.launch();

for (const phase of ['before', 'after']) {
  const c = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, userAgent: UA });
  const p = await c.newPage();
  await p.goto('https://apply.fundhub.ai/funding-book-call', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.cf2__time-slot', { timeout: 45000 });
  await p.waitForTimeout(1500);
  if (phase === 'after') await p.addStyleTag({ content: css });
  // tall viewport at the same width: the whole card in one picture (these pages scroll the body)
  const h = await p.evaluate(() => Math.ceil(document.querySelector('[data-page-element="AppointmentScheduler/V1"]').getBoundingClientRect().bottom + 40));
  await p.setViewportSize({ width, height: h });
  await p.waitForTimeout(900);
  const m = await p.evaluate(() => {
    const B = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
    const lines = (s) => { const e = document.querySelector(s); const rg = document.createRange(); rg.selectNodeContents(e); return new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size; };
    const sched = B('[data-page-element="AppointmentScheduler/V1"]');
    const logo = B('#calContainer > div:first-child img');
    return {
      sched, logo, band: B('#calContainer > div.w-full > div:first-child'), left: B('#calContainer > div:first-child'),
      week: B('.cf2__calendar-grid thead'), grid: B('.cf2__calendar-grid'), slot: B('.cf2__time-slot'), month: B('.cf2__calendar-header--title'),
      thW: Math.round(document.querySelector('.cf2__calendar-grid--week-day').getBoundingClientRect().width),
      weekLines: lines('.cf2__calendar-grid--week-day'), slotLines: lines('.cf2__time-slot span[dir=auto]'), monthLines: lines('.cf2__calendar-header--title'),
      logoPastCard: logo[0] + logo[2] - (sched[0] + sched[2]),
    };
  });
  await p.screenshot({ path: path.join(RAW, `${phase}-${width}.png`) });
  fs.writeFileSync(path.join(RAW, `${phase}-${width}.json`), JSON.stringify({ width, dpr, phase, ...m }, null, 2));
  console.log(phase, width, JSON.stringify(m));
  await c.close();
}
await browser.close();
