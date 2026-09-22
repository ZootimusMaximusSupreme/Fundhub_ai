// Raw shots + element boxes for the /watch organize proof (2026-09-22).
// Loads the LIVE pages and swaps in this branch's public/funnel/watch-proof.js and
// thankyou-sort.js (the page's own footer tag is routed to the local file), so the
// shots show exactly what ships. /roadmap is only read. Nothing is submitted.
//
//   RAW=<dir> node docs/workflows/watch-organize-2026-09-22-evidence/_walk.mjs
//   python3 docs/workflows/watch-organize-2026-09-22-evidence/_mark.py <dir>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const require = createRequire(path.join(process.env.NODE_MODULES_FROM || REPO, "package.json"));
const { chromium } = require("playwright");
const RAW = process.env.RAW || path.join(HERE, "_raw");
fs.mkdirSync(RAW, { recursive: true });

const UA = {
  desk: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  phone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
};
const b = await chromium.launch();

async function open(url, { w, h, local = true }) {
  const phone = w < 700;
  const ctx = await b.newContext({ userAgent: phone ? UA.phone : UA.desk, viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  if (local) {
    for (const f of ["watch-proof.js", "thankyou-sort.js"]) {
      await p.route(new RegExp(`https://fundhub\\.ai/funnel/${f.replace(".", "\\.")}(\\?.*)?$`), (r) =>
        r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(REPO, "public/funnel", f), "utf8") }));
    }
  }
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(2500);
  return { ctx, p };
}
const scrollTo = (p, y) => p.evaluate(async (y) => {
  document.body.scrollTop = y; document.documentElement.scrollTop = y;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, y);
async function boxes(p, sels) {
  return p.evaluate((sels) => {
    const out = {};
    for (const [k, s] of Object.entries(sels)) {
      const el = document.querySelector(s); if (!el) continue;
      const r = el.getBoundingClientRect(); out[k] = [r.left, r.top, r.width, r.height];
    }
    return out;
  }, sels);
}
async function shot(p, name, sels, extra = {}) {
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(RAW, `${name}.png`) });
  fs.writeFileSync(path.join(RAW, `${name}.json`), JSON.stringify({ boxes: await boxes(p, sels), ...extra }, null, 1));
}
const absTop = (p, s) => p.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + (document.body.scrollTop || document.documentElement.scrollTop), s);

// 1. Side gutters at 390: /watch before (live), /watch after, /roadmap.
for (const [name, url, local] of [["gut-before", "https://apply.fundhub.ai/watch", false], ["gut-after", "https://apply.fundhub.ai/watch", true], ["gut-roadmap", "https://apply.fundhub.ai/roadmap", false]]) {
  const { ctx, p } = await open(url, { w: 390, h: 844, local });
  await shot(p, name, { h1: ".hero h1", media: url.endsWith("watch") ? ".media" : "video", btn: ".fh-root a.btn" });
  await ctx.close();
}
// 2. H1 at 1280: /watch before, /watch after, /roadmap.
for (const [name, url, local] of [["h1-before", "https://apply.fundhub.ai/watch", false], ["h1-after", "https://apply.fundhub.ai/watch", true], ["h1-roadmap", "https://apply.fundhub.ai/roadmap", false]]) {
  const { ctx, p } = await open(url, { w: 1280, h: 900, local });
  const st = await p.evaluate(() => { const c = getComputedStyle(document.querySelector(".hero h1")); const a = document.querySelector(".hero h1 .amt"); const ca = a && getComputedStyle(a); return { h1: `${c.fontFamily.split(",")[0]} ${c.fontWeight} ${c.fontSize} ls ${c.letterSpacing}`, amt: ca ? `${ca.fontFamily.split(",")[0]} ${ca.fontWeight} ${ca.textDecorationLine}` : "" }; });
  await shot(p, name, { h1: ".hero h1" }, st);
  await ctx.close();
}
// 3. The row slides as the page scrolls (390).
{
  const { ctx, p } = await open("https://apply.fundhub.ai/watch", { w: 390, h: 844 });
  const top = await absTop(p, ".fhx-rail");
  const h = await p.evaluate(() => document.querySelector(".fhx-rail").getBoundingClientRect().height);
  // Same band as fhxShift in watch-proof.js: the row moves while it is wholly on screen.
  const span = Math.max(844 * 0.8 - h, 844 * 0.4);
  let i = 0;
  for (const q of [0, 0.5, 1]) {
    await scrollTo(p, Math.round(top - (844 * 0.1 + span * (1 - q))));
    const st = await p.evaluate(() => ({ scroll: document.body.scrollTop || document.documentElement.scrollTop, tx: Math.round(new DOMMatrix(getComputedStyle(document.querySelector(".fhx-track")).transform).e) }));
    await shot(p, `carousel-390-${i++}`, { rail: ".fhx-rail" }, st);
  }
  await ctx.close();
}
// 4. The organized column, whole section in one tall frame.
for (const [w, h] of [[1280, 1300], [390, 1300]]) {
  const { ctx, p } = await open("https://apply.fundhub.ai/watch", { w, h });
  await scrollTo(p, Math.round((await absTop(p, "#fh-watch-proof")) - 90));
  await shot(p, `column-${w}`, { note: ".cta-note", wins: ".fhx-wins", vids: ".fhx-vids", roads: ".fhx-roads" });
  await ctx.close();
}
// 5. /thank-you: approvals only, no client texts.
for (const w of [390, 1280]) {
  const { ctx, p } = await open("https://apply.fundhub.ai/thank-you", { w, h: w < 700 ? 844 : 900 });
  await scrollTo(p, Math.round((await absTop(p, "#fh-ty-proof")) - 120));
  await shot(p, `thankyou-${w}`, { proof: "#fh-ty-proof" });
  await ctx.close();
}
await b.close();
console.log("raw shots in", RAW);
