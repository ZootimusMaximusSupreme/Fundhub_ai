/* LIVE proof walk for /watch card sizes. No injection: whatever apply.fundhub.ai serves.
 *   node live-walk.mjs <phase>      phase = before | after
 * Writes raw shots + numbers to <out>/_raw.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire("/Users/chrisstanbridge/Developer/fundhub-platform/package.json")("playwright");
import fs from "node:fs";
import path from "node:path";

const PHASE = process.argv[2] || "before";
const OUT = process.argv[3] || "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/3f147f05-e8f8-4c1a-b84d-55092231358a/scratchpad/live";
const RAW = path.join(OUT, "_raw");
const URL = "https://apply.fundhub.ai/watch";

const VIEWS = [
  { w: 1280, h: 900, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", mobile: false },
  { w: 390, h: 844, ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36", mobile: true },
];

fs.mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch({ headless: true });
const all = {};

for (const v of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    userAgent: v.ua,
    isMobile: v.mobile,
    hasTouch: v.mobile,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 300)));

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#fh-watch-proof", { timeout: 30000 });
  await page.waitForTimeout(3000);

  // the deployed script hash, so we know which build we measured
  const served = await (async () => {
    const r = await fetch("https://fundhub.ai/funnel/watch-proof.js", { cache: "no-store" });
    const t = await r.text();
    const { createHash } = await import("node:crypto");
    return { len: t.length, sha: createHash("sha256").update(t).digest("hex").slice(0, 12) };
  })();

  const shots = {};
  for (const [key, sel] of [["wins", ".fhx-wins"], ["vids", ".fhx-vids"]]) {
    await page.evaluate((s) => document.querySelector("#fh-watch-proof " + s).scrollIntoView({ block: "center" }), sel);
    await page.waitForTimeout(700);
    shots[key] = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
      const sec = document.getElementById("fh-watch-proof");
      const slots = [...sec.querySelectorAll(".fhx-vslot")];
      const cards = [...sec.querySelectorAll(".fhx-track>.fh-card")];
      const onScreen = (el) => { const b = el.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0 && b.left > -1 && b.right < innerWidth + 1; };
      const vis = cards.find(onScreen) || cards[0];
      const rail = sec.querySelector(".fhx-rail");
      const cs = slots[0] ? getComputedStyle(slots[0]) : null;
      const lab = slots[0] ? getComputedStyle(slots[0].querySelector("span")) : null;
      return {
        cardCount: cards.length,
        card: vis ? r(vis) : null,
        cardSizes: cards.map((c) => { const b = c.getBoundingClientRect(); return [+b.width.toFixed(1), +b.height.toFixed(1)]; }),
        cardGap: cards[1] ? +(cards[1].getBoundingClientRect().x - cards[0].getBoundingClientRect().right).toFixed(1) : null,
        slot: slots[0] ? r(slots[0]) : null,
        slotCount: slots.length,
        slotRatio: slots[0] ? +(slots[0].getBoundingClientRect().height / slots[0].getBoundingClientRect().width).toFixed(3) : null,
        vgap: slots[1] ? +(slots[1].getBoundingClientRect().x - slots[0].getBoundingClientRect().right).toFixed(1) : null,
        vrowLeft: slots[0] ? +slots[0].getBoundingClientRect().left.toFixed(1) : null,
        vrowRight: slots.at(-1) ? +slots.at(-1).getBoundingClientRect().right.toFixed(1) : null,
        railWidth: rail ? rail.clientWidth : null,
        railLeft: rail ? +rail.getBoundingClientRect().left.toFixed(1) : null,
        railRight: rail ? +rail.getBoundingClientRect().right.toFixed(1) : null,
        slotStyle: cs ? { bg: cs.backgroundColor, border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor, radius: cs.borderTopLeftRadius, pad: cs.paddingTop } : null,
        labelStyle: lab ? { color: lab.color, size: lab.fontSize, tt: lab.textTransform, ls: lab.letterSpacing, ff: lab.fontFamily.split(",")[0] } : null,
        slotRects: slots.map(r),
        onScreenCards: cards.filter(onScreen).map(r),
      };
    });
    const nm = `${key}-${v.w}-${PHASE}`;
    await page.screenshot({ path: path.join(RAW, `${nm}.png`) });
    fs.writeFileSync(path.join(RAW, `${nm}.json`), JSON.stringify(shots[key], null, 1));
  }

  // images
  const imgs = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#fh-watch-proof .fhx-track>.fh-card img[data-slot="approval-screenshot"]')];
    const box = els[0] ? els[0].getBoundingClientRect() : null;
    return {
      total: els.length,
      loaded: els.filter((i) => i.complete && i.naturalWidth > 0).length,
      natural: els[0] ? [els[0].naturalWidth, els[0].naturalHeight] : null,
      rendered: box ? [+box.width.toFixed(1), +box.height.toFixed(1)] : null,
      fit: els[0] ? getComputedStyle(els[0]).objectFit : null,
    };
  });

  // carousel: step the page top to bottom, watch the track transform and page overflow
  const ride = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const sec = document.getElementById("fh-watch-proof");
    const track = sec.querySelector(".fhx-track");
    const rail = sec.querySelector(".fhx-rail");
    const max = document.documentElement.scrollHeight - innerHeight;
    const tx = () => { const m = new DOMMatrixReadOnly(getComputedStyle(track).transform); return +m.m41.toFixed(1); };
    let minTx = 0, overflow = 0, railScroll = 0, samples = 0, lastIn = null, railFull = null;
    for (let i = 0; i <= 60; i++) {
      scrollTo(0, Math.round((max * i) / 60));
      await sleep(40);
      samples++;
      minTx = Math.min(minTx, tx());
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) overflow++;
      if (document.body.scrollWidth > document.body.clientWidth) overflow++;
      railScroll = Math.max(railScroll, rail.scrollLeft || 0);
      const rb = rail.getBoundingClientRect();
      if (rb.top >= 0 && rb.bottom <= innerHeight) {
        const cards = [...sec.querySelectorAll(".fhx-track>.fh-card")];
        const last = cards.at(-1).getBoundingClientRect();
        lastIn = { left: +last.left.toFixed(1), right: +last.right.toFixed(1), inside: last.left >= rb.left - 1 && last.right <= rb.right + 1 };
        railFull = { left: +rb.left.toFixed(1), right: +rb.right.toFixed(1) };
      }
    }
    const trackW = track.scrollWidth, railW = rail.clientWidth;
    scrollTo(0, max);
    await sleep(400);
    const endTx = tx();
    const cards = [...sec.querySelectorAll(".fhx-track>.fh-card")];
    const lastAtEnd = cards.at(-1).getBoundingClientRect();
    const railAtEnd = rail.getBoundingClientRect();
    return {
      travelNeeded: +(trackW - railW).toFixed(1),
      minTx, endTx, samples, overflowSamples: overflow, railScrollMax: railScroll,
      lastCardWhileRailOnScreen: lastIn, railBoxWhenFullyOnScreen: railFull,
      lastCardAtPageBottom: { left: +lastAtEnd.left.toFixed(1), right: +lastAtEnd.right.toFixed(1), railLeft: +railAtEnd.left.toFixed(1), railRight: +railAtEnd.right.toFixed(1) },
      pageReachedBottom: Math.abs(scrollY - max) < 2,
    };
  });

  // end-of-slide shot: rail scrolled into view at the page bottom, last card fully inside
  const endMeta = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const sec = document.getElementById("fh-watch-proof");
    const rail = sec.querySelector(".fhx-rail");
    const track = sec.querySelector(".fhx-track");
    const tx = () => { const m = new DOMMatrixReadOnly(getComputedStyle(track).transform); return +m.m41.toFixed(1); };
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo(0, max);
    await sleep(500);
    const txAtPageBottom = tx();
    const cards = [...sec.querySelectorAll(".fhx-track>.fh-card")];
    const rb0 = rail.getBoundingClientRect();
    return {
      txAtPageBottom, txHere: tx(), scrollY: Math.round(scrollY),
      railFullyOnScreen: rb0.top >= 0 && rb0.bottom <= innerHeight,
      rail: r(rail), lastCard: r(cards.at(-1)), cardCount: cards.length,
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
      bodyScrollW: document.body.scrollWidth, bodyClientW: document.body.clientWidth,
    };
  });
  await page.screenshot({ path: path.join(RAW, `end-${v.w}-${PHASE}.png`) });
  fs.writeFileSync(path.join(RAW, `end-${v.w}-${PHASE}.json`), JSON.stringify(endMeta, null, 1));

  // tab-key fix: tab to a far card, rail must not scroll itself
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  let maxRailScroll = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    maxRailScroll = Math.max(maxRailScroll, await page.evaluate(() => document.querySelector("#fh-watch-proof .fhx-rail").scrollLeft || 0));
  }
  const tab = await page.evaluate((maxSeen) => {
    const sec = document.getElementById("fh-watch-proof");
    const rail = sec.querySelector(".fhx-rail");
    const cards = [...sec.querySelectorAll(".fhx-track>.fh-card")];
    return {
      tabsPressed: 40,
      railScrollLeftMaxSeen: maxSeen,
      railScrollLeftNow: rail.scrollLeft || 0,
      visibleCards: cards.filter((c) => { const x = c.getBoundingClientRect(); return x.right > 0 && x.left < innerWidth; }).length,
      rowStillDrawn: cards.length,
    };
  }, maxRailScroll);

  all[v.w] = { served, shots, imgs, ride, endMeta, tab, errors };
  console.log(v.w, PHASE, "card", shots.wins.card && [shots.wins.card.w, shots.wins.card.h], "slot", shots.vids.slot && [shots.vids.slot.w, shots.vids.slot.h], "imgs", imgs.loaded + "/" + imgs.total, "errors", errors.length);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, `live-${PHASE}.json`), JSON.stringify(all, null, 1));
console.log("wrote", path.join(OUT, `live-${PHASE}.json`));
