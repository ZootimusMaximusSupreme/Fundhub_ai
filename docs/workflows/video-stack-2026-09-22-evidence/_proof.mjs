#!/usr/bin/env node
/* Live proof, no injection. Own headless Chromium (repo playwright 1.62.1).
   Captures /watch and /roadmap at 390x844, 360x800 (Android Chrome UA) and
   1280x900 (desktop Chrome UA), records each video-testimonial card's REAL
   viewport rect, and writes shot-marks.json for _apply-marks.py so every red
   box sits on the element it describes. */
const _pw = await import(
  "/Users/chrisstanbridge/Developer/fundhub-platform/node_modules/playwright/index.js"
);
const chromium = _pw.chromium || _pw.default?.chromium;
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EV =
  "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/video-stack-2026-09-22-evidence";
const RAW = join(EV, "_raw");
const DPR = 2;

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PAGES = [
  {
    name: "watch",
    url: "https://apply.fundhub.ai/watch",
    sel: "#fh-watch-proof .fhx-vgrid > .fhx-vslot",
  },
  {
    name: "roadmap",
    url: "https://apply.fundhub.ai/roadmap",
    sel: ".fh-b .proofgrid .vslot",
  },
];

const VIEWPORTS = [
  { w: 390, h: 844, mobile: true, tag: "Android 390x844" },
  { w: 360, h: 800, mobile: true, tag: "Android 360x800" },
  { w: 1280, h: 900, mobile: false, tag: "Desktop 1280x900" },
];

const manifest = {};
const summary = [];
const browser = await chromium.launch();
mkdirSync(RAW, { recursive: true });

try {
  for (const p of PAGES) {
    for (const v of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: v.w, height: v.h },
        userAgent: v.mobile ? ANDROID_UA : DESKTOP_UA,
        deviceScaleFactor: DPR,
        isMobile: v.mobile,
        hasTouch: v.mobile,
      });
      const page = await ctx.newPage();
      await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(4000);
      await page.waitForSelector(p.sel, { timeout: 20000 });

      // Park the first card just under the top edge so a whole card is in frame.
      // /watch scrolls an inner container (body overflow:hidden auto), not the
      // window, so scrollIntoView is used and then the real scroller is nudged.
      await page.evaluate((s) => {
        const first = document.querySelector(s);
        first.scrollIntoView({ block: "start" });
        const scroller = (function find(el) {
          for (let n = el.parentElement; n; n = n.parentElement) {
            const o = getComputedStyle(n).overflowY;
            if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
          }
          return document.scrollingElement || document.documentElement;
        })(first);
        scroller.scrollTop = Math.max(0, scroller.scrollTop - 70);
      }, p.sel);
      await page.waitForTimeout(1500);

      const data = await page.evaluate(
        ([s, dpr]) => {
          const nodes = Array.from(document.querySelectorAll(s));
          const rects = nodes.map((n) => {
            const r = n.getBoundingClientRect();
            const cs = getComputedStyle(n);
            return {
              vx: r.left,
              vy: r.top,
              w: Math.round(r.width * 10) / 10,
              h: Math.round(r.height * 10) / 10,
              docTop: Math.round(r.top + window.scrollY),
              aspect: cs.aspectRatio,
              bg: cs.backgroundColor,
              border: cs.borderTopColor,
              radius: cs.borderTopLeftRadius,
            };
          });
          const firstTop = rects[0].docTop;
          const perRow = rects.filter((r) => Math.abs(r.docTop - firstTop) < 4).length;
          return {
            rects,
            perRow,
            count: nodes.length,
            vw: window.innerWidth,
            vh: window.innerHeight,
            scrollW: Math.max(
              document.documentElement.scrollWidth,
              document.body ? document.body.scrollWidth : 0,
            ),
            sideways:
              Math.max(
                document.documentElement.scrollWidth,
                document.body ? document.body.scrollWidth : 0,
              ) >
              window.innerWidth + 1,
            dpr,
          };
        },
        [p.sel, DPR],
      );

      const file = `${p.name}-${v.w}x${v.h}.png`;
      await page.screenshot({ path: join(RAW, file) });

      // Only box cards wholly inside the frame — an off-frame box is a bug.
      const marks = [];
      let n = 1;
      for (const r of data.rects) {
        const inFrame =
          r.vx >= 0 && r.vy >= 0 && r.vx + r.w <= data.vw + 0.5 && r.vy + r.h <= data.vh + 0.5;
        if (!inFrame) continue;
        marks.push({
          n,
          caption: `Video card ${n}: ${Math.round(r.w)}x${Math.round(r.h)} px, 9:16 (${r.aspect})`,
          box: {
            x: Math.round(r.vx * DPR),
            y: Math.round(r.vy * DPR),
            w: Math.round(r.w * DPR),
            h: Math.round(r.h * DPR),
          },
        });
        n += 1;
      }

      const verdict = data.perRow === 1 ? "STACKED — one per row" : `${data.perRow} per row`;
      manifest[file] = {
        legend: `${p.name === "watch" ? "/watch" : "/roadmap"} ${v.tag} — ${verdict}, no sideways scroll`,
        marks,
      };

      summary.push({
        page: p.name,
        width: v.w,
        perRow: data.perRow,
        card: `${data.rects[0].w}x${data.rects[0].h}`,
        aspect: data.rects[0].aspect,
        bg: data.rects[0].bg,
        border: data.rects[0].border,
        radius: data.rects[0].radius,
        sideways: data.sideways,
        boxed: marks.length,
        count: data.count,
      });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(EV, "shot-marks.json"), JSON.stringify(manifest, null, 2));
for (const s of summary) console.log(JSON.stringify(s));
