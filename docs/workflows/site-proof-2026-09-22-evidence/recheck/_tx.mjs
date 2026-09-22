import { chromium } from "playwright";
const b = await chromium.launch();
for (const [name, vp, ua] of [["1280", { width: 1280, height: 900 }, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"], ["390", { width: 390, height: 844 }, "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36"]]) {
  const p = await b.newPage({ viewport: vp, userAgent: ua });
  await p.goto("https://apply.fundhub.ai/roadmap/?v=" + Date.now(), { waitUntil: "load" });
  await p.waitForTimeout(2000);
  const el = await p.$(".txproof");
  await el.scrollIntoViewIfNeeded(); await p.evaluate(() => { const r = document.querySelector('.txproof').getBoundingClientRect(); scrollBy(0, r.top - 90); });
  await p.evaluate(async () => { for (const i of document.querySelectorAll('.tx-card img')) { i.loading = 'eager'; } await new Promise(r => setTimeout(r, 1500)); });
  const r = await p.evaluate(() => ({
    imgs: [...document.querySelectorAll('.tx-card img')].map(i => i.complete && i.naturalWidth > 0),
    brackets: (document.body.innerText.match(/\[[A-Z ][^\]]{2,40}\]/g) || []),
    overflow: document.documentElement.scrollWidth > innerWidth,
    sup: (() => { const s = document.querySelector('.foot-support'); const c = getComputedStyle(s); return { fs: c.fontSize, ta: c.textAlign }; })(),
    box: (() => { const r = document.querySelector('.txproof').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })()
  }));
  await p.screenshot({ path: `docs/workflows/site-proof-2026-09-22-evidence/recheck/tx-${name}.png` });
  console.log(name, JSON.stringify(r));
}
await b.close();
