// Live Playwright walk for docs/workflows/2026-09-22-watch-proof.md, after ship + push.
// Opens the LIVE page as it really is (the footer loads the fundhub.ai scripts; nothing
// injected), checks it, saves a full-page 2x shot plus each block's box to _raw/ for _mark.py.
//   node _walk.mjs watch 1280 watch-1280
//   node _walk.mjs watch 1280 watch-1280-zoom none zoom
//   node _walk.mjs thankyou 1280 thankyou-1280-booked booked
//   node _walk.mjs thankyou 390 thankyou-390-not-booked none
//   node _walk.mjs thankyou 390 thankyou-390-back back   (record saved, no hop from the booking page)
// booked = fresh fh_booking_v1 record AND arriving from /funding-book-call (the referrer
// ClickFunnels gives a real booker). back = the same record, arriving from anywhere else.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = path.join(HERE, '_raw'); fs.mkdirSync(S, { recursive: true });
const [, , which = 'watch', w = '390', out = 'full', mode = 'none', extra = ''] = process.argv;
const url = which === 'watch' ? 'https://apply.fundhub.ai/watch' : 'https://apply.fundhub.ai/thank-you';
const width = +w;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
if (mode !== 'none') {
  const now = Date.now();
  const rec = { start: new Date(now + 26 * 3600e3).toISOString(), end: new Date(now + 26.5 * 3600e3).toISOString(), tz: 'America/Chicago', name: 'Test', email: 't@example.com', capturedAt: now };
  await ctx.addInitScript((r) => { try { localStorage.setItem('fh_booking_v1', JSON.stringify(r)); } catch (e) {} }, rec);
}
const p = await ctx.newPage();
const errors = [];
const failed = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('requestfailed', (r) => failed.push(r.url()));
p.on('response', (r) => { if (r.status() >= 400 && /fundhub\.ai\/funnel\//.test(r.url())) failed.push(`${r.status()} ${r.url()}`); });
const referer = mode === 'booked' ? 'https://apply.fundhub.ai/funding-book-call' : mode === 'back' ? 'https://fundhub.ai/' : undefined;
await p.goto(url, { waitUntil: 'load', referer });
await p.evaluate(() => document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; }));
await p.waitForTimeout(3000);
const check = await p.evaluate(() => {
  const scope = document.getElementById('fh-watch-proof') || document.getElementById('fh-ty-proof');
  const imgs = scope ? [...scope.querySelectorAll('img[data-slot="approval-screenshot"]')] : [];
  const tags = (s) => document.querySelectorAll(`script[src="https://fundhub.ai/funnel/${s}"]`).length;
  return {
    referrer: document.referrer,
    scriptTags: { attribution: tags('fh-attribution.js'), beacon: tags('vsl-watch-beacon.js'), watchProof: tags('watch-proof.js'), thankyouSort: tags('thankyou-sort.js') },
    proofImages: `${imgs.filter((i) => i.complete && i.naturalWidth > 0).length}/${imgs.length}`,
    quotes: [...document.querySelectorAll('.fh-card[data-layout="quote-win"] .fh-quote p')].map((q) => q.textContent),
    ctas: [...document.querySelectorAll('.fh-root a.btn, #fh-ty-book a')].map((a) => `${a.textContent.trim()} -> ${a.getAttribute('href')}`),
    h1sec: (document.querySelector('.fh-root .hero h1.sec') || {}).textContent || null,
    prose: (document.querySelector('.fh-root .prose p:not(.lead)') || {}).textContent || null,
    step3: ([...document.querySelectorAll('.fh-root .expect .step .t')][2] || {}).textContent || null,
    stepsShown: (() => { const e = document.querySelector('.fh-root section.expect'); return e ? getComputedStyle(e).display !== 'none' : null; })(),
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});
if (extra === 'zoom') {
  const shot = p.locator('img[data-slot="approval-screenshot"]').first();
  await shot.click();
  await p.waitForTimeout(1200);
  check.zoom = await p.evaluate(() => { const o = document.querySelector('.fhz img'); return o ? { w: Math.round(o.getBoundingClientRect().width), loaded: o.complete && o.naturalWidth > 0 } : null; });
  await p.screenshot({ path: `${S}/${out}.png` });
  const boxes = await p.evaluate(() => { const e = document.querySelector('.fhz img'); const r = e.getBoundingClientRect(); const x = document.querySelector('.fhz button').getBoundingClientRect(); return { zoomimg: [r.x, r.y, r.width, r.height].map(Math.round), zoomclose: [x.x, x.y, x.width, x.height].map(Math.round) }; });
  fs.writeFileSync(`${S}/${out}.boxes.json`, JSON.stringify({ H: 844, boxes }));
  await p.keyboard.press('Escape');
  check.zoomClosedOnEscape = await p.evaluate(() => !document.querySelector('.fhz'));
} else {
  const H = await p.evaluate(() => { let m = 0; document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect().bottom + scrollY; if (r > m) m = r; }); return Math.ceil(m); });
  await p.setViewportSize({ width, height: H });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${S}/${out}.png` });
  const boxes = await p.evaluate(() => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
    const q = (s) => r(document.querySelector(s));
    return {
      wins: q('#fh-watch-proof .fhx-wins'), texts: q('#fh-watch-proof .fhx-texts'), roads: q('#fh-watch-proof .fhx-roads'),
      btn1: r([...document.querySelectorAll('.fh-root a.btn[href="/apply"]')].find((a) => !a.closest('#fh-watch-proof'))),
      decides: q('#fh-ty-decides'), book: q('#fh-ty-book'), proof: q('#fh-ty-proof'), hero: q('.fh-root .hero'),
      step3: r([...document.querySelectorAll('.fh-root .expect .step')][2]),
    };
  });
  check.H = H;
  fs.writeFileSync(`${S}/${out}.boxes.json`, JSON.stringify({ H, boxes }));
}
check.errors = errors;
check.failed = failed;
fs.writeFileSync(`${S}/${out}.check.json`, JSON.stringify(check, null, 2));
console.log(out, JSON.stringify(check));
await b.close();
