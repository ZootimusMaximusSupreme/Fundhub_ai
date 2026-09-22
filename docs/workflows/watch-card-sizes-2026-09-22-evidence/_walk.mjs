/* Raw shots + real element boxes for the /watch card-size proof (CLAUDE.md section 8).
 *
 * Our own headless Chromium, not the shared browser. The live page is loaded both ways:
 *   before — apply.fundhub.ai/watch exactly as it serves today
 *   after  — the same live page with this branch's public/funnel/watch-proof.js served
 *            in place of the one on fundhub.ai, so the only difference is our change.
 *
 *   node _walk.mjs before
 *   node _walk.mjs after
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, "_raw");
const REPO = path.resolve(HERE, "../../..");
const PHASE = process.argv[2] === "after" ? "after" : "before";
const SRC = "https://fundhub.ai/funnel/watch-proof.js";
const URL = "https://apply.fundhub.ai/watch";

const VIEWS = [
  { w: 1280, h: 900, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", mobile: false },
  { w: 390, h: 844, ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36", mobile: true },
];

fs.mkdirSync(RAW, { recursive: true });
const local = PHASE === "after" ? fs.readFileSync(path.join(REPO, "public/funnel/watch-proof.js"), "utf8") : null;
const browser = await chromium.launch({ headless: true });

for (const v of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    userAgent: v.ua,
    isMobile: v.mobile,
    hasTouch: v.mobile,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  if (local) await page.route(SRC, (r) => r.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: local }));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#fh-watch-proof", { timeout: 30000 });
  await page.waitForTimeout(2500);

  for (const [key, scrollTo] of [["vids", ".fhx-vids"], ["wins", ".fhx-wins"]]) {
    await page.evaluate((s) => document.querySelector("#fh-watch-proof " + s).scrollIntoView({ block: "center" }), scrollTo);
    await page.waitForTimeout(500);
    const meta = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return [+b.x.toFixed(1), +b.y.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
      const sec = document.getElementById("fh-watch-proof");
      const slots = [...sec.querySelectorAll(".fhx-vslot")];
      const cards = [...sec.querySelectorAll(".fhx-track>.fh-card")];
      const onScreen = (el) => { const b = el.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0 && b.left > -1 && b.right < innerWidth + 1; };
      const card = cards.find(onScreen) || cards[0];
      const block = sec.querySelector(".fhx-vids");
      const row = slots.length ? [slots[0].getBoundingClientRect(), slots.at(-1).getBoundingClientRect()] : null;
      return {
        slot: slots[0] ? r(slots[0]) : null,
        slotLast: slots.at(-1) ? r(slots.at(-1)) : null,
        vrow: row ? [+row[0].x.toFixed(1), +row[0].y.toFixed(1), +(row[1].right - row[0].left).toFixed(1), +row[0].height.toFixed(1)] : null,
        vblock: block ? r(block) : null,
        vgap: slots[1] ? +(slots[1].getBoundingClientRect().x - slots[0].getBoundingClientRect().right).toFixed(1) : null,
        card: card ? r(card) : null,
        cardCount: cards.length,
        cardGap: cards[1] ? +(cards[1].getBoundingClientRect().x - cards[0].getBoundingClientRect().right).toFixed(1) : null,
        railWidth: sec.querySelector(".fhx-rail").clientWidth,
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
      };
    });
    const name = `${key}-${v.w}-${PHASE}`;
    await page.screenshot({ path: path.join(RAW, `${name}.png`) });
    fs.writeFileSync(path.join(RAW, `${name}.json`), JSON.stringify(meta, null, 1));
    console.log("shot", name, JSON.stringify({ slot: meta.slot, card: meta.card }));
  }
  await ctx.close();
}
await browser.close();
