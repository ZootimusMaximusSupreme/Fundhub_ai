#!/usr/bin/env node
// Builds the approval cards for ApprovalCarousel from the real approval crops.
//
// Owner law (.claude/rules/proof-cards-from-source.md): the card is built from
// the source picture with the proof-card template
// (marketing/landing-pages/slo/fundhub-proof-cards.html, used as is, never
// edited): the real crop, the amount read off the picture, no photo, no name.
// Crops and amounts come from marketing/landing-pages/slo/client-wins/deck.json
// (Chris's Drive approvals, re-cropped 1200x900, names and account numbers
// blurred, every amount verified against its crop).
//
// Owner ask 2026-10-03: "use better approvals... about 20 high quality ones".
// The 18 below are the crops whose amount reads at a glance on a phone; the
// other 18 in deck.json have small email text that blurs at video size.
// Order: smallest first, climbing to the biggest (deck.json's rule).
//
// Run from the repo root (it borrows the root's Playwright, no new package):
//   node marketing/broll/scripts/approval-cards.mjs
// Optional env: PW_CHROMIUM (browser path), HTTPS_PROXY (only where the
// network needs one to reach Google Fonts).
// Writes marketing/broll/public/approval-cards/<id>.png (3x, transparent
// corners) and marketing/broll/src/templates/approvalCards.ts.

import {createRequire} from 'node:module';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kit = resolve(here, '..');
const repo = resolve(kit, '..', '..');
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(require.resolve('playwright', {paths: [process.cwd()]}));
}

const PICKS = [
  'u-10k-citizens',
  'u-10700-chase-freedom',
  't-20k-truist',
  'g-20k-instant',
  'd-23k-chase-freedom',
  'd-24k-navy',
  'd-25k-personal-card',
  't-25k-highland',
  'd-30k-navy',
  'd-41k-chase-ink',
  't-50k-keybank',
  't-50k-chase',
  'd-54k-ink',
  'd-70k-loc',
  't-74k-chase-ink',
  'd-400k-loc',
  'd-469k-loc',
  'd-500k-loc',
];

const winsDir = join(repo, 'marketing/landing-pages/slo/client-wins');
const deck = JSON.parse(readFileSync(join(winsDir, 'deck.json'), 'utf8'));
const byId = new Map(deck.cards.map((c) => [c.id, c]));
const cards = PICKS.map((id) => {
  const c = byId.get(id);
  if (!c) throw new Error(`approval-cards: ${id} is not in deck.json`);
  if (!String(c.verified || '').startsWith('ok')) throw new Error(`approval-cards: ${id} is not verified`);
  return c;
});

const template = readFileSync(join(repo, 'marketing/landing-pages/slo/fundhub-proof-cards.html'), 'utf8');
const head = template.slice(0, template.indexOf('<section class="fh-proof"'));
if (!head.includes('.fh-card')) throw new Error('approval-cards: proof-card template moved');

const dollars = (n) => `$${Number(n).toLocaleString('en-US')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// One card per block, exactly the template's article markup with its switches set.
// The style attribute only zeroes the template's tilt and shadow variables,
// because the carousel tilts and shadows the cards itself.
const articles = cards
  .map(
    (c) => `
<div class="wrap" id="${c.id}">
  <article class="fh-card" data-layout="win" data-photo="off" data-name="off" data-amount="on" style="--fh-tilt-amount:0deg;--fh-shadow:none">
    <p class="fh-eyebrow"><span class="fh-for-win">Client win</span><span class="fh-for-quote">Testimonial</span></p>
    <figure class="fh-face"><img data-slot="face" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Client photo" width="168" height="168"></figure>
    <h3 class="fh-headline">Approved for <span class="fh-amount" data-slot="dollar-amount">${dollars(c.amount_dollars)}</span></h3>
    <figure class="fh-shot"><img data-slot="approval-screenshot" src="${pathToFileURL(join(repo, c.crop)).href}" alt="${esc(c.alt || 'Approval screenshot')}"></figure>
    <blockquote class="fh-quote"><p data-slot="quote"></p></blockquote>
    <div class="fh-rule" aria-hidden="true"></div>
    <span class="fh-name" data-slot="name"></span>
    <span class="fh-mark" role="img" aria-label="Fundhub"></span>
  </article>
</div>`,
  )
  .join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8">${head}
<style>html,body{margin:0;background:transparent}.wrap{width:560px;padding:0;margin:0 0 40px}</style>
</head><body>${articles}</body></html>`;

const outDir = join(kit, 'public/approval-cards');
mkdirSync(outDir, {recursive: true});
const pagePath = join(tmpdir(), 'fundhub-approval-cards.html');
writeFileSync(pagePath, html);

const proxy = process.env.HTTPS_PROXY ? {server: process.env.HTTPS_PROXY} : undefined;
const browser = await playwright.chromium.launch({executablePath: process.env.PW_CHROMIUM || undefined, proxy});
const page = await browser.newPage({viewport: {width: 1200, height: 900}, deviceScaleFactor: 3});
await page.goto(pathToFileURL(pagePath).href, {waitUntil: 'networkidle'});
await page.evaluate(() => document.fonts.ready);

const rows = [];
for (const c of cards) {
  const el = page.locator(`#${c.id} article`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`approval-cards: ${c.id} did not render`);
  await el.screenshot({path: join(outDir, `${c.id}.png`), omitBackground: true});
  rows.push({
    id: c.id,
    width: Math.round(box.width * 3),
    height: Math.round(box.height * 3),
    amount: c.amount_dollars,
    lender: c.lender && c.lender !== 'unnamed' ? c.lender : null,
    category: c.category,
    source: c.source,
  });
}
await browser.close();

const ts = `// GENERATED by marketing/broll/scripts/approval-cards.mjs. Do not edit by hand.
// ${rows.length} approval cards built with the proof-card template from the real crops in
// marketing/landing-pages/slo/client-wins/deck.json. Amounts are the ones read off each
// crop. Images: public/approval-cards/<id>.png at 3x. Smallest first, climbing to the biggest.

export type ApprovalCard = {
  id: string;
  width: number;
  height: number;
  amount: number;
  lender: string | null;
  category: string;
  source: string;
};

export const APPROVAL_CARDS: ApprovalCard[] = ${JSON.stringify(rows, null, 2)};
`;
writeFileSync(join(kit, 'src/templates/approvalCards.ts'), ts);
console.log(`approval-cards: ${rows.length} cards written to ${outDir}`);
