// Builds the marked draft for two builder-page fixes (owner law: page-edits-marked-draft).
// Board: docs/workflows/apply-funnel-fixes-2026-10-01.md (B1, C1).
//   B1  apply.fundhub.ai/watch       line under the headline  (block: clickfunnels-fragments/01b-watch-lede.html)
//   C1  apply.fundhub.ai/thank-you   phone fit                (block: clickfunnels-fragments/05b-thank-you-fit.html)
// Reads the live pages and pushes nothing. "After" shots add the block in the test browser only.
// Lead sends, Meta, Clarity and Google tags are blocked so the walk counts as nothing.
// Writes watch-thankyou-fit-draft.html next to this file (self-contained, for the shared link).
// Run: node clickfunnels-fragments/preview/watch-thankyou-fit-draft-build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const block = (f) => readFileSync(join(ROOT, "clickfunnels-fragments", f), "utf8");
const css = (f) => block(f).match(/<style>([\s\S]*?)<\/style>/)[1];
const js = (f) => (block(f).match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
const BLOCKED = /fundhub\.ai\/api\/webhooks|facebook\.(com|net)|clarity\.ms|googletagmanager|directroas/;
/* builder pages scroll inside <body>; let the document scroll so shots can be clipped */
const SCROLL_FIX = "html,body{height:auto!important;overflow-y:visible!important}";

const browser = await chromium.launch({ channel: "chrome" });

async function open(url, w, h, after) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route(BLOCKED, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(`${url}?cb=${Date.now()}`, { waitUntil: "networkidle" }).catch(() => {});
  await p.addStyleTag({ content: SCROLL_FIX });
  if (after) await after(p);
  await p.waitForTimeout(1500);
  return { p, ctx };
}
async function shot(p, sel, w, maxH = 900) {
  const el = p.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(2200);   // let scroll-in animations finish
  const box = await el.boundingBox();
  const y = Math.max(0, box.y - 12);
  const buf = await p.screenshot({ type: "jpeg", quality: 82, clip: { x: 0, y, width: w, height: Math.min(box.height + 24, maxH) } });
  return "data:image/jpeg;base64," + buf.toString("base64");
}

/* ---- B1: /watch line ---- */
const WATCH = "https://apply.fundhub.ai/watch";
const watchAfter = async (p) => { await p.evaluate(js("01b-watch-lede.html").replace("document.addEventListener('DOMContentLoaded',", "(").replace(/\);\s*$/, ")();")); await p.addStyleTag({ content: css("01b-watch-lede.html") }); };
let s = await open(WATCH, 390, 844);
const watchBefore = await shot(s.p, ".hero", 390, 500); await s.ctx.close();
s = await open(WATCH, 390, 844, watchAfter);
const watchAfterImg = await shot(s.p, ".hero", 390, 500);
const watchLine = await s.p.$eval(".hero .lede", (e) => [e.textContent, getComputedStyle(e).visibility]); await s.ctx.close();

/* ---- C1: /thank-you on a phone ---- */
const TY = "https://apply.fundhub.ai/thank-you";
const tyAfter = async (p) => p.addStyleTag({ content: css("05b-thank-you-fit.html") });
const PAIRS = [
  [".fh-root section.hero", 700, "Top of the page. The words ran in a narrow strip with wide empty sides."],
  ["section.expect", 700, "“What happens on the call.” Three steps squeezed into a thin column."],
  ["#fhp-ai", 1000, "The UnderwriteIQ sample. Labels stacked letter by letter and “See this path” broke onto three lines."],
  [".fhp-grid > *:nth-child(1)", 900, "Path 1 card. The round bars and amounts were cramped."],
  [".fhp-grid > *:nth-child(2)", 900, "Path 2 card. The “Needs optimization” badge stuck out past the card edge."],
  [".fhp-grid > *:nth-child(3)", 900, "Path 3 card. Each checklist line wrapped onto three or four lines."],
];
const bp = await open(TY, 390, 844), ap = await open(TY, 390, 844, tyAfter);
const pairs = [];
for (const [sel, maxH, say] of PAIRS) pairs.push({ say, before: await shot(bp.p, sel, 390, maxH), after: await shot(ap.p, sel, 390, maxH) });
const tyWidth = async (p) => p.$eval(".fh-root section.hero", (e) => Math.round(e.getBoundingClientRect().width));
const [wBefore, wAfter] = [await tyWidth(bp.p), await tyWidth(ap.p)];
const [hBefore, hAfter] = [await bp.p.evaluate(() => document.body.scrollHeight), await ap.p.evaluate(() => document.body.scrollHeight)];
await bp.ctx.close(); await ap.ctx.close();

/* desktop must not move: same height and same content width with and without the block */
const db = await open(TY, 1280, 900), da = await open(TY, 1280, 900, tyAfter);
const desk = async (p) => p.evaluate(() => [document.body.scrollHeight, Math.round(document.querySelector(".fh-root section.hero").getBoundingClientRect().width)]);
const [dB, dA] = [await desk(db.p), await desk(da.p)];
await db.ctx.close(); await da.ctx.close();
await browser.close();
if (dB.join() !== dA.join()) throw new Error(`desktop moved: before ${dB} after ${dA}`);
if (watchLine[1] !== "visible") throw new Error("watch line stayed hidden after the swap");

const pair = (n, say, before, after) => `
<section class="pair">
  <p class="say"><b>${n}</b>${say}</p>
  <div class="two">
    <figure class="bad"><figcaption>Before (live now)</figcaption><img src="${before}" alt="Before, item ${n}"></figure>
    <figure class="good"><figcaption>After (draft)</figcaption><img src="${after}" alt="After, item ${n}"></figure>
  </div>
</section>`;

const html = `<title>Watch and Thank-you Draft</title>
<style>
/* review sheet: one column of before/after pairs, red = live now, green = draft */
:root{--bg:#F7F7F8;--ink:#111113;--gray:#55555E;--line:#E2E2E6;--red:#D92D20;--green:#15803D;--card:#FFFFFF;
  --sans:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:light}
body{background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans);padding-inline:16px;margin:0}
main{max-width:860px;margin:0 auto;padding-block:20px 48px;display:grid;gap:28px}
h1{font-size:24px;letter-spacing:-.02em;line-height:1.2;margin:0;text-wrap:balance}
h2{font-size:19px;letter-spacing:-.015em;margin:0;text-wrap:balance}
.top{display:grid;gap:6px}.top p,.part>p{margin:0;color:var(--gray)}
.flag{justify-self:start;font:600 12px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--green);padding:4px 9px;border-radius:6px}
.part{display:grid;gap:14px}
.pair{display:grid;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.say{margin:0}.say b{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:8px;border-radius:50%;background:var(--ink);color:#fff;font-size:12px}
.two{display:grid;grid-template-columns:1fr;gap:12px;align-items:start}
@media(min-width:700px){.two{grid-template-columns:1fr 1fr}}
figure{margin:0;min-width:0;display:grid;gap:6px;justify-items:center}
figcaption{justify-self:start;font:600 12px var(--sans);letter-spacing:.05em;text-transform:uppercase}
.bad figcaption{color:var(--red)}.good figcaption{color:var(--green)}
figure img{display:block;width:100%;max-width:390px;height:auto;border-radius:8px;border:4px solid var(--line)}
.bad img{border-color:var(--red)}.good img{border-color:var(--green)}
.facts{margin:0;padding-left:18px;color:var(--gray)}.facts li{margin:2px 0}
</style>
<main>
  <div class="top">
    <span class="flag">Draft, not live</span>
    <h1>Video page line and thank-you page on phones</h1>
    <p>Red frame is the live page today. Green frame is the draft. Shots are from the live pages on a 390px phone screen.</p>
  </div>

  <div class="part">
    <h2>Video page: line under the headline</h2>
    <p>apply.fundhub.ai/watch. Only this one line changes.</p>
    ${pair(1, "“Find out exactly what your business qualifies for in one call” becomes “" + watchLine[0] + "”", watchBefore, watchAfterImg)}
  </div>

  <div class="part">
    <h2>Thank-you page on phones</h2>
    <p>apply.fundhub.ai/thank-you. Words, order and pictures stay the same. Only the side spacing on phones changes.</p>
    <ul class="facts">
      <li>Content width on a phone: ${wBefore}px before, ${wAfter}px after, out of 390px.</li>
      <li>Page length on a phone: ${hBefore}px before, ${hAfter}px after.</li>
      <li>Computer screens do not change. Measured at 1280px wide: same length (${dB[0]}px) and same content width (${dB[1]}px).</li>
    </ul>
    ${pairs.map((x, i) => pair(i + 2, x.say, x.before, x.after)).join("\n")}
  </div>
</main>
`;
writeFileSync(join(HERE, "watch-thankyou-fit-draft.html"), html);
console.log(JSON.stringify({ watchLine, tyWidth: [wBefore, wAfter], tyHeight: [hBefore, hAfter], desktop: dB, bytes: html.length }));
