// Funnel B (Sorting Hat) live walk, 2026-09-22. Own headless Chromium, real-browser user agent.
// Look only: never types into the survey, never presses Confirm or Book, never submits.
// The fake booking record lives in this throwaway browser only and is cleared at the end.
//   node docs/workflows/site-proof-2026-09-22-evidence/_walk-funnel-b.mjs 1280
//   node docs/workflows/site-proof-2026-09-22-evidence/_walk-funnel-b.mjs 390
// Writes _raw/<NN-step-width>.png + .marks.json per shot and results-<width>.json; then
//   python3 docs/workflows/site-proof-2026-09-22-evidence/_mark-funnel-b.py
//
// Why a real user agent: ClickFunnels answers /apply/cf_survey with status "finished" for
// the HeadlessChrome and curl agents (measured 2026-09-22), so a bot never sees question 1.
// A real Chrome / Safari / Android agent gets "in-progress" and the first question.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'funnel-b');
const RAW = path.join(OUT, '_raw');
fs.mkdirSync(RAW, { recursive: true });

const width = Number(process.argv[2] || 1280);
const mobile = width < 600;
const dpr = mobile ? 2 : 1;
const height = mobile ? 844 : 900;
const UA = mobile
  ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
  : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const results = { width, ua: UA, steps: {}, errors: [], nonGet: [] };
const browser = await chromium.launch();

// These ClickFunnels pages scroll the BODY (html overflow hidden, body 100vh), not the window,
// so window.scrollY stays 0. __top() / __scrollTo() read and move whichever one scrolls.
async function newCtx() {
  const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, userAgent: UA });
  await c.addInitScript(() => {
    window.__top = () => Math.max(window.scrollY, document.scrollingElement ? document.scrollingElement.scrollTop : 0, document.body ? document.body.scrollTop : 0);
    window.__scrollTo = (y) => { window.scrollTo(0, y); if (document.scrollingElement) document.scrollingElement.scrollTop = y; if (document.body) document.body.scrollTop = y; };
  });
  return c;
}
function watchPage(p, tag) {
  p.on('pageerror', (e) => results.errors.push({ tag, kind: 'pageerror', text: String(e).slice(0, 400), url: p.url() }));
  p.on('console', (m) => { if (m.type() === 'error') results.errors.push({ tag, kind: 'console.error', text: m.text().slice(0, 400), src: (m.location() || {}).url || '', url: p.url() }); });
  p.on('response', (r) => { if (r.status() >= 400) results.errors.push({ tag, kind: `http ${r.status()}`, text: r.url().slice(0, 200), url: p.url() }); });
  p.on('request', (r) => {
    if (r.method() !== 'GET') results.nonGet.push(`${tag} ${r.method()} ${r.url().slice(0, 140)}`);
    if (/nr-data\.net\/jserrors/.test(r.url())) results.errors.push({ tag, kind: 'newrelic-jserror-report', text: (r.postData() || '').slice(0, 1500), url: p.url() });
  });
}

// Box helpers. Viewport shots: rect in viewport px. Clip shots: page px minus the clip origin.
async function rect(p, sel) {
  return p.evaluate((s) => {
    const e = typeof s === 'string' ? document.querySelector(s) : null;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return [r.x, r.y + __top(), r.width, r.height].map(Math.round);
  }, sel);
}
async function rectOf(locator) {
  const r = await locator.evaluate((e) => { const b = e.getBoundingClientRect(); return [b.x, b.y + __top(), b.width, b.height].map(Math.round); });
  return r;
}
function saveMarks(name, title, marks, originY, segs = null) {
  const m = marks.filter((x) => x.box).map((x) => ({ ...x, box: [x.box[0], x.box[1] - originY, x.box[2], x.box[3]].map((v) => Math.round(v * dpr)) }));
  const missing = marks.filter((x) => !x.box).map((x) => x.caption);
  fs.writeFileSync(path.join(RAW, `${name}.marks.json`), JSON.stringify({ title, dpr, marks: m, missing, segs }, null, 2));
}
async function viewportShot(p, name, title, marks) {
  await p.waitForTimeout(400);
  const sy = await p.evaluate(() => __top());
  await p.screenshot({ path: path.join(RAW, `${name}.png`) });
  saveMarks(name, title, marks, sy);
}
async function clipShot(p, name, title, marks, y0, y1) {
  // stitched from viewport-sized pieces: a fullPage shot only sees the 100vh body
  await p.waitForTimeout(300);
  const total = await p.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const top = Math.max(0, Math.floor(y0));
  const bottom = Math.min(total, Math.ceil(y1));
  const segs = [];
  let y = top, i = 0;
  while (y < bottom - 1 && i < 20) {
    await p.evaluate((v) => __scrollTo(v), y);
    await p.waitForTimeout(450);
    const actual = await p.evaluate(() => __top());
    const off = Math.max(0, y - actual);
    const h = Math.min(height - off, bottom - y);
    if (h <= 0) break;
    const file = `${name}.seg${i}.png`;
    await p.screenshot({ path: path.join(RAW, file), clip: { x: 0, y: off, width, height: h } });
    segs.push(file);
    y += h; i++;
  }
  console.error(`clip ${name}: y ${top}..${bottom} total ${total} pieces ${segs.length}`);
  saveMarks(name, title, marks, top, segs);
}
const W = String(width);

/* ───────── STEP 1: /watch ───────── */
{
  const ctx = await newCtx();
  const p = await ctx.newPage();
  watchPage(p, 'watch');
  await p.goto('https://apply.fundhub.ai/watch?utm_source=proof', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('#fh-watch-proof', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const top = await p.evaluate(() => {
    const h1 = document.querySelector('h1');
    const v = document.querySelector('#fh-vsl') || document.querySelector('video');
    const btns = [...document.querySelectorAll('a')].filter((a) => /get started/i.test(a.textContent));
    const first = btns.find((a) => !a.closest('#fh-watch-proof'));
    return {
      h1: h1 ? h1.textContent.trim().replace(/\s+/g, ' ') : null,
      video: v ? { tag: v.tagName, src: (v.currentSrc || v.src || '').slice(0, 120), readyState: v.readyState, paused: v.paused, muted: v.muted, w: Math.round(v.getBoundingClientRect().width), h: Math.round(v.getBoundingClientRect().height) } : null,
      getStarted: btns.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), inProof: !!a.closest('#fh-watch-proof') })),
      firstBtnVisible: first ? first.getBoundingClientRect().height > 0 : false,
      sideways: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  // video frame after a few seconds (did it actually play / buffer?)
  await p.waitForTimeout(3000);
  top.videoLater = await p.evaluate(() => { const v = document.querySelector('#fh-vsl') || document.querySelector('video'); return v ? { readyState: v.readyState, currentTime: +v.currentTime.toFixed(2), paused: v.paused } : null; });
  await p.evaluate(() => __scrollTo(0));
  const b1 = await p.evaluate(() => { const a = [...document.querySelectorAll('a')].find((x) => /get started/i.test(x.textContent) && !x.closest('#fh-watch-proof')); if (!a) return null; const r = a.getBoundingClientRect(); return [r.x, r.y + __top(), r.width, r.height].map(Math.round); });
  const h1 = await rect(p, 'h1');
  const vid = (await rect(p, '#fh-media')) || (await rect(p, '#fh-vsl')) || (await rect(p, 'video'));
  // make sure headline, video and first button all fit in the shot
  const topEnd = Math.max(...[h1, vid, b1].filter(Boolean).map((r) => r[1] + r[3])) + 30;
  await clipShot(p, `01-watch-top-${W}`, `/watch?utm_source=proof at ${W}px: top of page`, [
    { caption: `Headline: "${top.h1}"`, box: h1 },
    { caption: `Video (${top.video ? top.video.tag : 'none'}; readyState ${top.videoLater ? top.videoLater.readyState : '?'}, time ${top.videoLater ? top.videoLater.currentTime : '?'}s after 3s, paused=${top.videoLater ? top.videoLater.paused : '?'})`, box: vid },
    { caption: `First Get Started -> ${top.getStarted[0] ? top.getStarted[0].href : 'missing'}`, box: b1 },
  ], 0, Math.max(topEnd, height));

  // proof block: swipe each row to the end and back like a thumb would, so lazy images load
  await p.locator('#fh-watch-proof').scrollIntoViewIfNeeded();
  await p.evaluate(async () => {
    for (const row of document.querySelectorAll('#fh-watch-proof .fhx-row')) { row.scrollLeft = row.scrollWidth; await new Promise((r) => setTimeout(r, 700)); row.scrollLeft = 0; }
    const s = document.querySelector('#fh-watch-proof'); const r = s.getBoundingClientRect();
    const base = __top(); for (let y = r.top + base - 200; y < r.bottom + base; y += 300) { __scrollTo(y); await new Promise((q) => setTimeout(q, 250)); }
  });
  await p.waitForTimeout(2500);
  const proof = await p.evaluate(() => {
    const txt = (e) => (e ? e.textContent.trim().replace(/\s+/g, ' ') : null);
    const sec = (cls) => document.querySelector(`#fh-watch-proof .${cls}`);
    const imgsIn = (el) => (el ? [...el.querySelectorAll('img[data-slot="approval-screenshot"]')] : []);
    const loaded = (a) => a.filter((i) => i.complete && i.naturalWidth > 0).length;
    const wins = sec('fhx-wins'), texts = sec('fhx-texts'), roads = sec('fhx-roads');
    const winImgs = imgsIn(wins), textImgs = imgsIn(texts);
    const roadsBtn = roads ? roads.querySelector('a') : document.querySelector('#fh-watch-proof a');
    return {
      winsHeading: txt(wins && wins.querySelector('h2')), winsCards: wins ? wins.querySelectorAll('.fh-card').length : 0,
      winsImgs: `${loaded(winImgs)}/${winImgs.length}`,
      winsAmounts: wins ? [...wins.querySelectorAll('.fh-amount')].map(txt) : [],
      textsHeading: txt(texts && texts.querySelector('h2')), textsCards: texts ? texts.querySelectorAll('.fh-card').length : 0,
      textsImgs: `${loaded(textImgs)}/${textImgs.length}`,
      textsQuotes: texts ? [...texts.querySelectorAll('.fh-quote p')].map(txt) : [],
      roadsHeading: txt(roads && roads.querySelector('h2')),
      secondBtn: roadsBtn ? { text: txt(roadsBtn), href: roadsBtn.getAttribute('href') } : null,
      sideways: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  const rw = await rect(p, '#fh-watch-proof .fhx-wins');
  const rt = await rect(p, '#fh-watch-proof .fhx-texts');
  const rr = await rect(p, '#fh-watch-proof .fhx-roads');
  const rb2 = await p.evaluate(() => { const a = document.querySelector('#fh-watch-proof .fhx-roads a') || document.querySelector('#fh-watch-proof a'); if (!a) return null; const r = a.getBoundingClientRect(); return [r.x, r.y + __top(), r.width, r.height].map(Math.round); });
  const allR = [rw, rt, rr, rb2].filter(Boolean);
  const y0 = Math.min(...allR.map((r) => r[1])) - 40, y1 = Math.max(...allR.map((r) => r[1] + r[3])) + 40;
  // clip shots are taken from the top of the document; scroll back so fixed things do not float mid-shot
  await clipShot(p, `02-watch-proof-${W}`, `/watch at ${W}px: proof block`, [
    { caption: `"${proof.winsHeading}": ${proof.winsCards} approval cards, ${proof.winsImgs} screenshots loaded (${proof.winsAmounts.join(', ')})${mobile ? ' - sideways swipe row' : ''}`, box: rw },
    { caption: `"${proof.textsHeading}": ${proof.textsCards} texts, ${proof.textsImgs} screenshots loaded${mobile ? ' - sideways swipe row' : ''}`, box: rt },
    { caption: `"${proof.roadsHeading}"`, box: rr },
    { caption: `Second ${proof.secondBtn ? proof.secondBtn.text : 'button MISSING'} -> ${proof.secondBtn ? proof.secondBtn.href : ''}`, box: rb2 },
  ], y0, y1);

  // tap one approval screenshot -> full size; Escape closes
  const shot = p.locator('#fh-watch-proof .fhx-wins img[data-slot="approval-screenshot"]').first();
  await shot.scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  const tappedBox = await rectOf(shot);
  if (mobile) await shot.tap(); else await shot.click();
  await p.waitForTimeout(1500);
  const zoom = await p.evaluate(() => {
    const o = document.querySelector('.fhz'); if (!o) return { open: false };
    const i = o.querySelector('img'); const r = i.getBoundingClientRect(); const c = o.querySelector('button').getBoundingClientRect();
    return { open: true, alt: i.alt, loaded: i.complete && i.naturalWidth > 0, natural: `${i.naturalWidth}x${i.naturalHeight}`, shown: `${Math.round(r.width)}x${Math.round(r.height)}`,
      img: [r.x, r.y + __top(), r.width, r.height].map(Math.round), close: [c.x, c.y + __top(), c.width, c.height].map(Math.round) };
  });
  await viewportShot(p, `03-watch-zoom-open-${W}`, `/watch at ${W}px: ${mobile ? 'tapped' : 'clicked'} the first approval screenshot`, [
    { caption: zoom.open ? `Opens full size: ${zoom.shown} on screen (file ${zoom.natural}), loaded=${zoom.loaded}` : 'No full-size view opened', box: zoom.img || null },
    { caption: 'Close button (Escape or a click also closes)', box: zoom.close || null },
  ]);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  const closed = await p.evaluate(() => !document.querySelector('.fhz'));
  await viewportShot(p, `04-watch-zoom-closed-${W}`, `/watch at ${W}px: after pressing Escape`, [
    { caption: closed ? 'Escape pressed: full-size view gone, back on the row' : 'Escape pressed: full-size view STILL OPEN', box: tappedBox },
  ]);
  results.steps.watch = { top, proof, zoom: { ...zoom, img: undefined, close: undefined }, escapeClosed: closed };

  /* ───────── STEP 2: first Get Started -> /apply ───────── */
  await p.evaluate(() => __scrollTo(0));
  await p.waitForTimeout(400);
  const first = p.locator('a', { hasText: /get started/i }).filter({ hasNot: p.locator('xpath=ancestor::*[@id="fh-watch-proof"]') }).first();
  const firstHref = await first.getAttribute('href');
  const navs = [];
  p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
  if (mobile) await first.tap(); else await first.click();
  await p.waitForURL(/apply\.fundhub\.ai\/apply/, { timeout: 30000 }).catch(() => {});
  // wait for question 1 to render (or for the survey to move us on)
  let q = null;
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(500);
    q = await p.evaluate(() => {
      const vis = (e) => e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden';
      const inputs = [...document.querySelectorAll('input:not([type=hidden])')].filter(vis);
      const title = [...document.querySelectorAll('h1,h2,h3,h4,div,span,p')].find((e) => vis(e) && e.children.length === 0 && /Let's Start With Your Info/i.test(e.textContent));
      return { url: location.href, inputs: inputs.map((i) => i.placeholder || i.name || i.type), title: title ? title.textContent.trim() : null };
    });
    if (q.title || !/\/apply/.test(q.url)) break;
  }
  await p.waitForTimeout(800);
  const qTitle = await p.evaluate(() => { const e = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && /Let's Start With Your Info/i.test(x.textContent) && x.getBoundingClientRect().height > 0); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y + __top(), r.width, r.height].map(Math.round); });
  const qFields = await p.evaluate(() => { const ins = [...document.querySelectorAll('input:not([type=hidden])')].filter((e) => e.getBoundingClientRect().height > 0); if (!ins.length) return null; const rs = ins.map((e) => e.getBoundingClientRect()); const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom)); return [x0, y0 + __top(), x1 - x0, y1 - y0].map(Math.round); });
  const qBtn = await p.evaluate(() => { const b = [...document.querySelectorAll('a,button')].find((e) => /elSurveyButtonNext|SurveyButton/i.test(e.className) && e.getBoundingClientRect().height > 0) || [...document.querySelectorAll('a,button')].find((e) => /^(next|continue)/i.test(e.textContent.trim()) && e.getBoundingClientRect().height > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { box: [r.x, r.y + __top(), r.width, r.height].map(Math.round), text: b.textContent.trim().replace(/\s+/g, ' ') }; });
  const pageH1 = await rect(p, 'h1');
  const shown = q && q.inputs.length ? q.inputs.map((t) => (/\d{3}/.test(t) ? 'Phone Number' : t)).join(', ') : 'none';
  const parts5 = [pageH1, qTitle, qFields, qBtn && qBtn.box].filter(Boolean);
  await clipShot(p, `05-apply-q1-${W}`, `Get Started clicked -> ${new URL(p.url()).pathname} at ${W}px (nothing typed, nothing submitted)`, [
    { caption: `Landed on ${p.url().split('?')[0]}`, box: pageH1 },
    { caption: q && q.title ? `First question: "${q.title}"` : 'First question did NOT show', box: qTitle },
    { caption: `Fields shown: ${shown} (left empty)`, box: qFields },
    { caption: `${qBtn ? qBtn.text : 'Next button'} (not pressed)`, box: qBtn ? qBtn.box : null },
  ], Math.min(...parts5.map((r) => r[1])) - 30, Math.max(...parts5.map((r) => r[1] + r[3])) + 30);
  results.steps.apply = { clickedHref: firstHref, navs, landed: p.url(), question: q };
  await ctx.close();
}

/* ───────── STEP 3: /funding-book-call standalone ───────── */
{
  const ctx = await newCtx();
  const p = await ctx.newPage();
  watchPage(p, 'book');
  await p.goto('https://apply.fundhub.ai/funding-book-call', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('.cf2__calendar-header', { timeout: 30000 });
  await p.waitForTimeout(3000);
  const hero = await p.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().replace(/\s+/g, ' ')));
  const heroBox = await p.evaluate(() => { const hs = [...document.querySelectorAll('h1')].filter((h) => h.getBoundingClientRect().height > 0); if (!hs.length) return null; const rs = hs.map((h) => h.getBoundingClientRect()); const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom)); return [x0, y0 + __top(), x1 - x0, y1 - y0].map(Math.round); });
  const calBox = await rect(p, '.cf2__wrapper') || await rect(p, '.cf2__column--left');
  const tzBox = await rect(p, '.cf2__timezone-selector--button');
  const tz = await p.evaluate(() => { const b = document.querySelector('.cf2__timezone-selector--button'); return b ? b.textContent.trim() : null; });
  const calLook = await p.evaluate(() => ({ month: (document.querySelector('.cf2__calendar-header--title') || {}).textContent, available: [...document.querySelectorAll('.cf2__calendar-grid--available')].map((b) => b.textContent.trim()), sideways: document.documentElement.scrollWidth > innerWidth + 1 }));
  const calEnd = calBox ? calBox[1] + calBox[3] : height;
  // how the calendar card is laid out: logo vs card edge, logo vs the "Select a Date & Time:" band, weekday names
  const layout = await p.evaluate(() => {
    const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + __top(), w: r.width, h: r.height, r: r.right, b: r.bottom + __top() }; };
    const card = document.querySelector('#calContainer');
    const logo = card ? card.querySelector('img') : null;
    const band = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /Select a Date & Time/.test(e.textContent));
    const row = document.querySelector('.cf2__calendar-grid tr');
    const ths = [...document.querySelectorAll('.cf2__calendar-grid--week-day')];
    const lines = (el) => { const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (!t) return 1; const rg = document.createRange(); rg.selectNodeContents(t); return new Set([...rg.getClientRects()].map((c) => Math.round(c.top))).size; };
    const c = R(card), l = R(logo), bd = R(band), g = R(document.querySelector('.cf2__calendar-grid'));
    const ov = l && bd ? { w: Math.max(0, Math.min(l.r, bd.r) - Math.max(l.x, bd.x)), h: Math.max(0, Math.min(l.b, bd.b) - Math.max(l.y, bd.y)) } : null;
    const slot = document.querySelector('.cf2__time-slot span[dir]');
    return {
      cardW: c && Math.round(c.w), gridW: g && Math.round(g.w), colW: ths[0] ? Math.round(ths[0].getBoundingClientRect().width) : null,
      weekdayLines: ths.length ? Math.max(...ths.map(lines)) : null,
      logoPastCard: c && l ? Math.round(l.r - c.r) : null, logoOverBand: ov ? Math.round(ov.w * ov.h) : 0,
      slotLines: slot ? lines(slot) : null,
      boxes: { logo: l && [l.x, l.y, l.w, l.h].map(Math.round), band: bd && [bd.x, bd.y, bd.w, bd.h].map(Math.round), row: R(row) && [R(row).x, R(row).y, R(row).w, R(row).h].map(Math.round) },
    };
  });
  const lookMarks = [];
  if (layout.logoPastCard > 0) lookMarks.push({ caption: `LOOK: calendar logo runs ${layout.logoPastCard}px past the right edge of the calendar card`, box: layout.boxes.logo });
  else if (layout.logoOverBand > 0) lookMarks.push({ caption: 'LOOK: big calendar logo sits over the grey "Select a Date & Time:" band', box: layout.boxes.logo });
  if (layout.weekdayLines > 1) lookMarks.push({ caption: `LOOK: weekday names wrap onto ${layout.weekdayLines} lines (each day column ${layout.colW}px; month grid ${layout.gridW}px wide inside a ${layout.cardW}px card)`, box: layout.boxes.row });
  if (layout.slotLines > 1) lookMarks.push({ caption: `LOOK: each time button wraps onto ${layout.slotLines} lines`, box: await rect(p, '.cf2__time-slot') });
  await clipShot(p, `06-book-hero-${W}`, `/funding-book-call at ${W}px, opened on its own`, [
    { caption: `Hero: ${hero.join(' / ')}`, box: heroBox },
    { caption: `Calendar: ${calLook.month}, open days ${calLook.available.join(', ')}`, box: calBox },
    { caption: `Time zone: ${tz}`, box: tzBox },
    ...lookMarks,
  ], 0, Math.max(height, calEnd + 30));

  // pick tomorrow (or the next open day that is not today), then the first time
  const days = p.locator('.cf2__calendar-grid--available');
  const n = await days.count();
  let pick = null;
  for (let i = 0; i < n; i++) { const cls = await days.nth(i).getAttribute('class'); if (!/--selected/.test(cls)) { pick = days.nth(i); break; } }
  if (!pick && n) pick = days.first();
  const pickedDay = pick ? (await pick.textContent()).trim() : null;
  if (pick) { if (mobile) await pick.tap(); else await pick.click(); }
  await p.waitForSelector('.cf2__time-slot', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const slot = p.locator('.cf2__time-slot').first();
  const slotCount = await p.locator('.cf2__time-slot').count();
  const slotText = slotCount ? (await slot.textContent()).trim() : null;
  const nonGetBefore = results.nonGet.length;
  if (slotCount) { await slot.scrollIntoViewIfNeeded(); if (mobile) await slot.tap(); else await slot.click(); }
  await p.waitForTimeout(1500);
  const confirm = p.locator('button.cf2__confirm-button, button.DTP__confirm-button, .cf2__time-slot--confirm, button:has-text("Confirm")').first();
  const confirmVisible = await confirm.isVisible().catch(() => false);
  const confirmText = confirmVisible ? (await confirm.textContent()).trim() : null;
  if (confirmVisible) await confirm.scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  const dayBox = await p.evaluate(() => { const e = document.querySelector('.cf2__calendar-grid--selected'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y + __top(), r.width, r.height].map(Math.round); });
  // after a time is picked the list gives way to a confirm panel that repeats the day and time
  const slotBox = await p.evaluate(() => { const e = document.querySelector('#confirm-slot-details') || document.querySelector('.cf2__time-slot'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y + __top(), r.width, r.height].map(Math.round); });
  const confirmDetails = await p.evaluate(() => { const e = document.querySelector('#confirm-slot-details'); return e ? [...e.querySelectorAll('p')].map((x) => x.textContent.trim()).join(', ') : null; });
  const confBox = confirmVisible ? await rectOf(confirm) : null;
  const newNonGet = results.nonGet.slice(nonGetBefore).filter((s) => !/directroas|nr-data|\/_cf\/s|on\.aws\/events|facebook|cronofy/.test(s));
  await viewportShot(p, `07-book-confirm-${W}`, `/funding-book-call at ${W}px: picked a day and a time, STOPPED before Confirm`, [
    { caption: `Day picked: ${calLook.month.split(' ')[0]} ${pickedDay}`, box: dayBox },
    { caption: `Time picked: ${(slotText || "none").replace(/^Select time /, "")} of ${slotCount} listed; panel reads "${confirmDetails}"`, box: slotBox },
    { caption: confirmVisible ? `"${confirmText}" button showing - NOT pressed, no booking made` : 'Confirm button did NOT show', box: confBox },
  ]);
  const stored = await p.evaluate(() => { try { return localStorage.getItem('fh_booking_v1'); } catch (e) { return 'ERR'; } });
  await p.evaluate(() => { try { localStorage.removeItem('fh_booking_v1'); sessionStorage.removeItem('fh_booking_v1'); } catch (e) {} });
  results.steps.book = { hero, tz, calLook, layout: { ...layout, boxes: undefined }, pickedDay, slotCount, slotText, confirmDetails, confirmVisible, confirmText, bookingPostsAfterSlotClick: newNonGet, storedAfterSlotPickThenCleared: stored };
  await ctx.close();
}

/* ───────── STEP 4 + 5: /thank-you ───────── */
{
  const ctx = await newCtx();
  const p = await ctx.newPage();
  watchPage(p, 'thankyou');
  await p.goto('https://apply.fundhub.ai/thank-you', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('#fh-ty-proof', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const read = () => p.evaluate(() => {
    const txt = (e) => (e ? e.textContent.trim().replace(/\s+/g, ' ') : null);
    const vis = (e) => !!e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none';
    const proof = document.getElementById('fh-ty-proof'); const faq = document.querySelector('.fh-root section.faq');
    const pImgs = proof ? [...proof.querySelectorAll('img[data-slot="approval-screenshot"]')] : [];
    return {
      referrer: document.referrer,
      heroSec: txt(document.querySelector('.fh-root .hero h1.sec')), eyebrow: txt(document.querySelector('.fh-root .hero .eyebrow')),
      lede: txt(document.querySelector('.fh-root .hero .lede')), prose: txt(document.querySelector('.fh-root .prose p:not(.lead)')),
      bookBtn: vis(document.querySelector('#fh-ty-book a')) ? { text: txt(document.querySelector('#fh-ty-book a')), href: document.querySelector('#fh-ty-book a').getAttribute('href') } : null,
      decides: vis(document.getElementById('fh-ty-decides')) ? txt(document.querySelector('#fh-ty-decides p') || document.getElementById('fh-ty-decides')).slice(0, 160) : null,
      expectShown: vis(document.querySelector('.fh-root section.expect')), prepShown: vis(document.querySelector('.fh-root section.prep')), calShown: vis(document.getElementById('fh-cal-cta')),
      calWhen: vis(document.getElementById('fh-cal-when')) ? txt(document.getElementById('fh-cal-when')) : null,
      step3: txt([...document.querySelectorAll('.fh-root .expect .step .t')][2]),
      proofShown: vis(proof), proofCards: proof ? proof.querySelectorAll('.fh-card').length : 0,
      proofWins: proof ? proof.querySelectorAll('.fh-card[data-layout="win"]').length : 0, proofTexts: proof ? proof.querySelectorAll('.fh-card[data-layout="quote-win"]').length : 0,
      proofImgs: `${pImgs.filter((i) => i.complete && i.naturalWidth > 0).length}/${pImgs.length}`,
      proofBeforeFaq: !!(proof && faq && (proof.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING)),
      sideways: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  const r4 = await read();
  const heroBox = await rect(p, '.fh-root .hero');
  const bookBox = await rect(p, '#fh-ty-book a');
  const prose4 = await rect(p, '.fh-root .prose');
  const end4 = bookBox ? bookBox[1] + bookBox[3] + 40 : height;
  await clipShot(p, `08-ty-no-booking-${W}`, `/thank-you at ${W}px with no booking saved`, [
    { caption: `Hero: "${r4.heroSec}"`, box: heroBox },
    { caption: `Line: "${r4.prose}"`, box: prose4 },
    { caption: r4.bookBtn ? `"${r4.bookBtn.text}" -> ${r4.bookBtn.href}` : 'Pick your call time button MISSING', box: bookBox },
  ], 0, Math.max(height, end4));
  // press it
  const btn = p.locator('#fh-ty-book a');
  if (mobile) await btn.tap(); else await btn.click();
  await p.waitForURL(/funding-book-call/, { timeout: 30000 }).catch(() => {});
  await p.waitForSelector('.cf2__calendar-header', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const landed = p.url();
  const landH1 = await p.evaluate(() => { const hs = [...document.querySelectorAll('h1')].filter((h) => h.getBoundingClientRect().height > 0); if (!hs.length) return null; const rs = hs.map((h) => h.getBoundingClientRect()); const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom)); return [x0, y0 + __top(), x1 - x0, y1 - y0].map(Math.round); });
  const landCal = await rect(p, '.cf2__calendar-header');
  await viewportShot(p, `09-ty-button-lands-${W}`, `Pressed "Pick your call time" at ${W}px -> ${landed}`, [
    { caption: `Landed on ${landed}`, box: landH1 },
    { caption: 'Booking calendar loaded', box: landCal },
  ]);
  results.steps.thankyouNoBooking = { ...r4, pressedLandsOn: landed };

  /* STEP 5: fake booking in this browser only, then /funding-book-call -> /thank-you in the same tab */
  const now = Date.now();
  const start = new Date(now + 24 * 3600e3); start.setUTCMinutes(0, 0, 0);
  const rec = { name: 'Demo Tester', email: 'demo@fundhub.ai', start: start.toISOString(), end: new Date(start.getTime() + 30 * 60e3).toISOString(), tz: 'America/Phoenix', submittedAt: now, capturedAt: now, title: 'Funding Strategy Meeting — Fundhub' };
  await p.evaluate((r) => localStorage.setItem('fh_booking_v1', JSON.stringify(r)), rec);
  await Promise.all([p.waitForURL(/\/thank-you/, { timeout: 30000 }), p.evaluate(() => { location.href = '/thank-you'; })]);
  await p.waitForLoadState('load');
  await p.waitForSelector('#fh-ty-proof', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2000);
  // swipe the proof row so lazy crops load, like a thumb would
  await p.evaluate(async () => { const row = document.querySelector('#fh-ty-proof .fhy-row'); const s = document.getElementById('fh-ty-proof'); if (s) s.scrollIntoView(); await new Promise((r) => setTimeout(r, 600)); if (row) { row.scrollLeft = row.scrollWidth; await new Promise((r) => setTimeout(r, 700)); row.scrollLeft = 0; } await new Promise((r) => setTimeout(r, 1200)); __scrollTo(0); });
  await p.waitForTimeout(1200);
  const r5 = await read();
  const hero5 = await rect(p, '.fh-root .hero');
  const cal5 = await rect(p, '#fh-cal-cta');
  const when5 = await rect(p, '#fh-cal-when');
  const dec5 = await rect(p, '#fh-ty-decides');
  const exp5 = await rect(p, '.fh-root section.expect');
  const prf5 = await rect(p, '#fh-ty-proof');
  const faq5 = await rect(p, '.fh-root section.faq');
  const faqHead = faq5 ? [faq5[0], faq5[1], faq5[2], Math.min(faq5[3], 90)] : null;
  // shot A: hero -> decides -> call details
  const aEnd = Math.max(...[hero5, dec5, cal5, exp5].filter(Boolean).map((r) => r[1] + r[3])) + 30;
  await clipShot(p, `10-ty-booked-top-${W}`, `/thank-you at ${W}px: fake booking in this browser + arrived from /funding-book-call`, [
    { caption: `Hero: "${r5.heroSec}" (${r5.eyebrow})`, box: hero5 },
    { caption: `What the call decides: "${(r5.decides || 'MISSING').slice(0, 70)}..."`, box: dec5 },
    { caption: `Call steps shown; step 03 reads "${r5.step3}"`, box: exp5 },
    { caption: `Call details: "${r5.calWhen || 'MISSING'}"`, box: when5 || cal5 },
  ], 0, aEnd);
  // shot B: proof block, then the top of the FAQ
  if (prf5) {
    const bEnd = faqHead ? faqHead[1] + faqHead[3] + 20 : prf5[1] + prf5[3] + 30;
    await clipShot(p, `11-ty-booked-proof-${W}`, `/thank-you at ${W}px (booked view): approvals and texts before the FAQ`, [
      { caption: `Real approvals, real texts: ${r5.proofWins} approvals + ${r5.proofTexts} texts, ${r5.proofImgs} screenshots loaded`, box: prf5 },
      { caption: r5.proofBeforeFaq ? 'FAQ starts after the proof block' : 'FAQ is NOT after the proof block', box: faqHead },
    ], prf5[1] - 40, bEnd);
  }
  await p.evaluate(() => { try { localStorage.removeItem('fh_booking_v1'); sessionStorage.removeItem('fh_booking_v1'); } catch (e) {} });
  const cleared = await p.evaluate(() => { try { return localStorage.getItem('fh_booking_v1') === null; } catch (e) { return false; } });
  results.steps.thankyouBooked = { record: rec, ...r5, clearedAfter: cleared };
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(RAW, `results-${W}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
