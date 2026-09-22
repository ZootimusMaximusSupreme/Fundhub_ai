// Re-shoot 06b (the /roadmap-book landing after demo Pay) with marks on real elements.
// Loads the exact URL the widget sent the browser to. Look only.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
const OUT = "docs/workflows/site-proof-2026-09-22-evidence/funnel-a";
for (const width of [1280, 390]) {
  const res = JSON.parse(readFileSync(`${OUT}/_results-sales-${width}.json`, "utf8"));
  const mobile = width < 600, dpr = mobile ? 2 : 1, vh = mobile ? 844 : 900;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height: vh }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(res.landed, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(2500);
  const box = async (sel) => { const r = await p.locator(sel).first().boundingBox().catch(() => null); if (!r) return null; const y2 = Math.min(vh, r.y + r.height); if (r.y >= vh || y2 - r.y < 2) return null; return { x: Math.round(Math.max(0, r.x) * dpr), y: Math.round(Math.max(0, r.y) * dpr), w: Math.round(Math.min(r.width, width) * dpr), h: Math.round((y2 - Math.max(0, r.y)) * dpr) }; };
  const found = await p.evaluate(() => {
    const all = [...document.querySelectorAll("body *")];
    const eye = all.find((e) => e.children.length === 0 && /ORDER COMPLETE/i.test(e.textContent));
    const h1 = document.querySelector("h1") || all.find((e) => e.children.length === 0 && /Want to Get There Faster/i.test(e.textContent));
    if (eye) eye.setAttribute("data-proof", "eye");
    if (h1) h1.setAttribute("data-proof", "h1");
    return { eye: eye?.textContent.trim(), h1: h1?.textContent.trim(), url: location.href };
  });
  const name = `06b-landed-roadmap-book-${width}.png`;
  await p.screenshot({ path: `${OUT}/_raw/${name}` });
  const mf = `${OUT}/shot-marks-${width}.json`;
  const m = JSON.parse(readFileSync(mf, "utf8"));
  const notes = (m[name] && m[name].notes) || [];
  m[name] = { legend: `${width}px: after demo Pay -> /roadmap-book`, marks: [
    { n: 1, caption: `Top line: "${found.eye}"`, box: await box('[data-proof="eye"]') },
    { n: 2, caption: `Headline: "${found.h1}"`, box: await box('[data-proof="h1"]') },
  ].filter((x) => x.box), notes };
  writeFileSync(mf, JSON.stringify(m, null, 2));
  console.log(width, found.eye, "|", found.h1, "| same URL:", found.url === res.landed);
  await b.close();
}
