import { chromium } from "playwright";
const [file, tag] = process.argv.slice(2);
const SP = process.env.SP;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto("file:///");
await p.setContent(`<body style="margin:0;background:#222"><video id=v width=960 src="file://${file}"></video></body>`);
await p.waitForFunction(() => document.getElementById("v").readyState >= 1);
const dur = await p.evaluate(() => document.getElementById("v").duration);
for (const f of [0, 0.35, 0.6, 0.9]) {
  const t = Math.min(dur - 0.05, dur * f);
  await p.evaluate(async (t) => { const v = document.getElementById("v"); v.currentTime = t; await new Promise(r => v.onseeked = r); }, t);
  await p.screenshot({ path: `${SP}/f-${tag}-${f}.png` });
}
console.log(tag, "duration", dur.toFixed(2));
await b.close();
