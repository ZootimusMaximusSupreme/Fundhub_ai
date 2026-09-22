import { chromium } from "playwright";
const b = await chromium.launch();
for (const [url, name] of [["https://apply.fundhub.ai/roadmap/", "roadmap"], ["https://apply.fundhub.ai/watch", "watch"]]) {
  for (const [w, h] of [[390, 844], [360, 800], [1280, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, userAgent: w < 700 ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
    await p.goto(url + "?v=" + Date.now(), { waitUntil: "load" });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const slots = [...document.querySelectorAll(".vslot, .fhx-vslot, [class*='vslot']")].filter((e) => e.offsetParent !== null);
      const boxes = slots.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), ar: +(r.height / r.width).toFixed(3) }; });
      const rows = new Set(slots.map((e) => Math.round(e.getBoundingClientRect().top))).size;
      return { n: slots.length, rows, boxes, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    console.log(name, w, JSON.stringify(r));
    await p.close();
  }
}
await b.close();
