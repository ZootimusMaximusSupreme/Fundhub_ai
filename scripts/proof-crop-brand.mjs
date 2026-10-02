#!/usr/bin/env node
/**
 * Brand one real approval crop with the Fundhub proof-card template.
 *
 *   node scripts/proof-crop-brand.mjs <manifest.json> <outDir>
 *
 * Owner decision 2026-09-23: every proof crop file ships branded.
 * The branding IS marketing/landing-pages/slo/fundhub-proof-cards.html — this script
 * reads that file's stylesheet and renders one <article class="fh-card"> per crop with
 * Playwright, so the card, the type and the fundhub mark are the real template.
 * This script NEVER edits that template (proof-cards-from-source.md).
 *
 * Manifest: [{ "id","crop","amount"|null,"alt" }, ...]
 *   crop   absolute path to the cropped real screenshot
 *   amount integer dollars READ OFF that screenshot, or null when unreadable
 *
 * No face and no name are ever drawn: data-photo="off", data-name="off".
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import pw from "playwright";
const { chromium } = pw;

const TEMPLATE = resolve("marketing/landing-pages/slo/fundhub-proof-cards.html");
const [manifestPath, outDir] = process.argv.slice(2);
if (!manifestPath || !outDir) {
  console.error("usage: proof-crop-brand.mjs <manifest.json> <outDir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const tpl = readFileSync(TEMPLATE, "utf8");
const head = tpl.slice(tpl.indexOf('<link rel="preconnect"'), tpl.indexOf("</style>") + 8);
if (!head.includes(".fh-card")) throw new Error("could not read the proof-card stylesheet");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
const dataUri = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;

const items = JSON.parse(readFileSync(manifestPath, "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });

const done = [];
for (const it of items) {
  if (it.amount != null && !(Number.isInteger(it.amount) && it.amount > 0)) {
    throw new Error(`${it.id}: amount must be a positive integer or null`);
  }
  // tilt zeroed so a standalone file is not saved rotated; a template variable, not an edit
  const article = `
<article class="fh-card" data-layout="win" data-photo="off" data-name="off" data-amount="on"
         style="--fh-tilt-amount:0deg; max-width:560px;">
  <p class="fh-eyebrow"><span class="fh-for-win">Client win</span><span class="fh-for-quote">Testimonial</span></p>
  <figure class="fh-face"><img data-slot="face" src="" alt="" width="168" height="168"></figure>
  <h3 class="fh-headline">${it.amount == null ? "Approved" : "Approved for"} <span class="fh-amount" data-slot="dollar-amount">${
    it.amount == null ? "" : esc(money(it.amount))
  }</span></h3>
  <figure class="fh-shot"><img data-slot="approval-screenshot" src="${dataUri(it.crop)}" alt="${esc(it.alt || "")}"></figure>
  <blockquote class="fh-quote"><p data-slot="quote"></p></blockquote>
  <div class="fh-rule" aria-hidden="true"></div>
  <span class="fh-name" data-slot="name"></span>
  <span class="fh-mark" role="img" aria-label="Fundhub"></span>
</article>`;
  await page.setContent(
    `<!doctype html><meta charset="utf-8">${head}
     <style>html,body{margin:0;padding:24px;background:transparent}</style>${article}`,
    { waitUntil: "networkidle" }
  );
  await page.waitForFunction(() => document.fonts.ready.then(() => true));
  const el = await page.$("article.fh-card");
  const out = `${outDir}/${it.id}.png`;
  await el.screenshot({ path: out, omitBackground: true });
  done.push({ id: it.id, out: basename(out), amount: it.amount, crop: basename(it.crop) });
  console.log(`branded ${it.id}${it.amount == null ? "  (NO AMOUNT)" : "  " + money(it.amount)}`);
}
await browser.close();
writeFileSync(`${outDir}/branded.json`, JSON.stringify(done, null, 1));
console.log(`\n${done.length} branded -> ${outDir}`);
