// Live click-through: second Get Started on /watch -> /apply; Pick your call time on /thank-you -> /funding-book-call. Navigation only, no form filled.
import { chromium } from 'playwright';
const b = await chromium.launch();
const out = {};
for (const width of [1280, 390]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('https://apply.fundhub.ai/watch', { waitUntil: 'load' });
  await p.waitForSelector('#fh-watch-proof a.btn');
  await Promise.all([p.waitForURL(/\/apply/, { timeout: 30000 }), p.click('#fh-watch-proof a.btn')]);
  out[`watch-${width}-second-cta`] = new URL(p.url()).pathname;
  await p.goto('https://apply.fundhub.ai/thank-you', { waitUntil: 'load' });
  await p.waitForSelector('#fh-ty-book a');
  await Promise.all([p.waitForURL(/funding-book-call/, { timeout: 30000 }), p.click('#fh-ty-book a')]);
  out[`thankyou-${width}-book-cta`] = new URL(p.url()).pathname;
  out[`errors-${width}`] = errs;
  await ctx.close();
}
console.log(JSON.stringify(out));
await b.close();
