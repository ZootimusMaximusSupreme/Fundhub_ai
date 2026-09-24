import { chromium } from "playwright";
const file = process.argv[2];
const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.goto("file:///");
await p.setContent(`<body style="margin:0"><video id=v width=320 src="file://${file}"></video><canvas id=c width=320 height=180></canvas></body>`);
await p.waitForFunction(() => document.getElementById("v").readyState >= 1);
for (let t = 0; t <= 1.6; t += 0.1) {
  const r = await p.evaluate(async (t) => {
    const v = document.getElementById("v");
    v.currentTime = t; await new Promise(r => v.onseeked = r);
    const c = document.getElementById("c"), x = c.getContext("2d");
    x.drawImage(v, 0, 0, 320, 180);
    const d = x.getImageData(0, 0, 320, 180).data;
    let white = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { n++; if (d[i] > 245 && d[i+1] > 245 && d[i+2] > 245) white++; }
    return Math.round(100 * white / n);
  }, t);
  console.log(t.toFixed(1) + "s  " + r + "% pure white");
}
await b.close();
