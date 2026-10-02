#!/usr/bin/env node
/**
 * Fill the community shuffle deck on the $297 sales page from deck.json.
 *
 *   node marketing/landing-pages/slo/client-wins/build-deck.mjs
 *
 * Writes the cards between <!-- FH-DECK-CARDS:START --> and <!-- FH-DECK-CARDS:END -->
 * in marketing/landing-pages/slo/slo-01-sales.html, plus the card count and totals.
 * Card markup is the proof-card template (fundhub-proof-cards.html) with its four switches.
 * Every card comes from a real crop: deck.json holds the amount read off the crop,
 * where it was read, and the ClickFunnels image URL the crop was uploaded to.
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, "../slo-01-sales.html");
const DECK = join(HERE, "deck.json");
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n) => `$${n.toLocaleString("en-US")}`;

function card(c) {
  const win = c.kind === "win";
  if (win && !(Number.isInteger(c.amount_dollars) && c.amount_dollars > 0)) {
    throw new Error(`${c.id}: a win card needs amount_dollars read off its crop`);
  }
  if (win && !c.image?.url?.startsWith("https://")) throw new Error(`${c.id}: image url must be absolute https`);
  if (!win && !c.quote) throw new Error(`${c.id}: a quote card needs the client's own words`);
  const shot = win
    ? `<img data-slot="approval-screenshot" src="${esc(c.image.url)}" alt="${esc(c.alt)}" width="${c.image.width}" height="${c.image.height}" loading="lazy" decoding="async">`
    : `<img data-slot="approval-screenshot" src="${GIF}" alt="">`;
  return `  <article class="fh-card" data-layout="${win ? "win" : "quote"}" data-photo="off" data-name="${win ? "off" : "blur"}" data-amount="on">
    <p class="fh-eyebrow"><span class="fh-for-win">Client win</span><span class="fh-for-quote">Testimonial</span></p>
    <figure class="fh-face"><img data-slot="face" src="${GIF}" alt="" width="168" height="168"></figure>
    <h3 class="fh-headline">Approved for <span class="fh-amount" data-slot="dollar-amount">${win ? esc(money(c.amount_dollars)) : ""}</span></h3>
    <figure class="fh-shot">${shot}</figure>
    <blockquote class="fh-quote"><p data-slot="quote">${win ? "" : esc(c.quote).replace(/\n/g, "<br>")}</p></blockquote>
    <div class="fh-rule" aria-hidden="true"></div>
    <span class="fh-name" data-slot="name">${win ? "" : "Client name"}</span>
    <span class="fh-mark" role="img" aria-label="Fundhub"></span>
  </article>`;
}

const deck = JSON.parse(readFileSync(DECK, "utf8"));
const cards = deck.cards;
const wins = cards.filter((c) => c.kind === "win");
const sum = wins.reduce((t, c) => t + c.amount_dollars, 0);
const first = cards[0].kind === "win" ? cards[0].amount_dollars : 0;

let html = readFileSync(PAGE, "utf8");
const A = "<!-- FH-DECK-CARDS:START -->";
const B = "<!-- FH-DECK-CARDS:END -->";
const i = html.indexOf(A);
const j = html.indexOf(B);
if (i < 0 || j < i) throw new Error("deck markers missing in slo-01-sales.html");
html = html.slice(0, i + A.length) + "\n" + cards.map(card).join("\n") + "\n" + html.slice(j);

const setText = (id, text) => {
  const re = new RegExp(`(id="${id}"[^>]*>)[^<]*(<)`);
  if (!re.test(html)) throw new Error(`#${id} missing`);
  html = html.replace(re, (_, a, b) => a + text + b);
};
setText("fh-deck-n", String(cards.length).padStart(2, "0"));
setText("fh-deck-total", money(first));
setText("fh-deck-sum", money(sum));
setText("fh-deck-count", String(wins.length));

writeFileSync(PAGE, html);
console.log(`${cards.length} cards (${wins.length} approvals, ${cards.length - wins.length} testimonials), ${money(sum)} total`);
