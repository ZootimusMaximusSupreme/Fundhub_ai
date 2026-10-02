// Shared page furniture for the four deliverables, ported from
// scripts/black-reports/fundhub_gen.py:527-600 (cover, cta_page, section,
// table, util_bar, qr_html, PB) and :568-573 (render).
//
// The Python handed a body string and a stylesheet to WeasyPrint as two
// separate arguments. A browser needs one document, so renderDocument() puts the
// CSS in a <style> block. Nothing from a client goes near that block.

import { esc } from "./escape.mjs";
import { median, spaced } from "./format.mjs";
import { cleanBureaus, lenderBuckets } from "./derive.mjs";
import { BASE_CSS, COVER_CSS, PAGE_CSS } from "./css.mjs";
import { fontFaceCss } from "./fonts.mjs";

/**
 * THE LOOK SWITCH (2026-09-17). Every builder and the three pieces of chrome
 * below take `opts` last. `{ look: "gold" }` draws the gold pack
 * (ops/workflows/gold-deliverables-v5/*.pdf, printed by fundhub_pdf_template.py
 * and fh_charts.py). Anything else draws the markup the older printer,
 * scripts/black-reports/fundhub_gen.py, emits — byte for byte, because
 * port-parity.test.mjs pins it and no test is weakened to make room.
 * renderDeliverableHtml() always asks for gold, so every hosted page is gold.
 * The words never change between the two looks; only the drawing does.
 */
export const GOLD = "gold";
export const isGold = (opts) => opts?.look === GOLD;

/**
 * Where the closing panel sends a client. Owner-set 2026-09-17: the booking
 * link is this page, on every document. The gold pack printed
 * www.fundhubbookingurl.template, a placeholder that went nowhere.
 */
export const BOOK_CALL_URL = "https://apply.fundhub.ai/schedule/phonecall";

/**
 * The one CTA at the end of the pack. Owner-set 2026-09-25: the closing panel's
 * fake [ QR CODE ] box is gone and this button replaces it. Only the closing CTA
 * moved — BOOK_CALL_URL still carries the body-text booking lines in the roadmap,
 * the credit analysis and the funding snapshot, and it does not change.
 * src/underwrite/black-report-node.mjs cta() prints the same address.
 */
export const CLOSING_CTA_URL = "https://apply.fundhub.ai/roadmap-book";

/** Python PB — was a page break, is now the gap that opened the next sheet. */
export const PB = '<div class="pagebreak"></div>';

/**
 * Python qr_html(). The Python tried the optional `qrcode` package and fell
 * back to this text placeholder when it was absent (fundhub_gen.py:216-226).
 * Node has no such package here and no new dependency is being added
 * (CLAUDE.md §8), so the placeholder is the whole implementation.
 */
export function qrHtml() {
  return '<div class="qr">[ QR CODE ]</div>';
}

/** Python cover(). `footer_label` was an unused parameter there and is dropped. */
export function cover(client, doctype, title, opts = {}) {
  const med = median(client?.scores || {});
  if (isGold(opts)) return goldCover(client, doctype, title, med);
  return `
<div class="cover">
  <div><span class="brand">fundhub.</span>
       <span class="kicker">${spaced("underwrite iq")} / ${spaced("client deliverable")}</span></div>
  <div class="doctype">${esc(spaced(doctype))}</div>
  <div class="accent"></div>
  <h1>${esc(title)}</h1>
  <div class="meta">
    <div><div class="k">${spaced("applicant")}</div><div class="v">${esc(client?.applicant)}</div></div>
    <div><div class="k">${spaced("date")}</div><div class="v">${esc(client?.date)}</div></div>
    <div><div class="k">${spaced("outcome")}</div><div class="v">${esc(client?.outcome)}</div></div>
    <div><div class="k">${spaced("median score")}</div>
         <div class="v">${esc(med)}</div></div>
  </div>
  <div class="foot-dark">
    <span><span class="dot">●</span>${spaced("diagnostic complete")} · ${spaced("underwriteiq")}</span>
    <span>${spaced("fundhub confidential")}</span>
  </div>
</div>`;
}

/**
 * Python cta_page().
 *
 * F53. THE LAST PAGE OF ALL FOUR DOCUMENTS SAID "You have clean bureaus ready
 * for funding now." to every client, including one whose every bureau this
 * system had just marked DIRTY. It is the same defect as the roadmap's opening
 * paragraph and it shipped four times per pack. The lead now comes off the
 * file: the clean bureaus if there are any, otherwise the lenders already open
 * today, otherwise no claim about either.
 */
export function ctaPage(client, opts = {}) {
  if (isGold(opts)) return goldCtaPage(client);
  const lead = ctaLead(client);
  return `
<div class="cta-page">
  <div><span class="brand">fundhub.</span>
       <span class="kicker" style="font-family:'JetBrains Mono',monospace;font-size:6.5pt;
             letter-spacing:.3em;color:#7d7d7d;margin-left:10px;">${spaced("next steps")}</span></div>
  <h2>Let Us Build Your Game Plan Together</h2>
  <div class="rule"></div>
  <p>${esc(lead)}</p>
  ${qrHtml()}
  <div class="lbl">${spaced("scan to book your call instantly")}</div>
  <p class="url">${esc(client?.booking_url)}</p>
  <p class="small">Or copy this link into your browser</p>
  <div class="foot-dark">
    <span><span class="dot">●</span>${spaced("systems nominal")} · ${spaced("fundhub.ai")}</span>
    <span>${spaced("fundhub confidential")}</span>
  </div>
</div>`;
}

/**
 * The closing panel's first sentence, off the file (F53). Shared by both looks.
 */
export function ctaLead(client) {
  const clean = cleanBureaus(client);
  const [openNow] = lenderBuckets(client);
  let lead;
  if (clean.length) {
    lead = `You have ${clean.length === 1 ? "a clean bureau" : "clean bureaus"} ready for `
      + `funding now - ${clean.join(", ")}. Apply on ${clean.length === 1 ? "it" : "those"} `
      + "while we repair the rest in parallel.";
  } else if (openNow.length) {
    lead = `You have ${openNow.length} lender${openNow.length === 1 ? "" : "s"} you can apply `
      + "to today. Book the call and we will work the list in the right order.";
  } else {
    lead = "Book the call and we will put the fixes in this pack in the order that unlocks the "
      + "most money.";
  }
  return lead;
}

/** Python section(): the numbered eyebrow, the heading, the rainbow rule. */
export function section(num, label, heading) {
  return `<div class="eyebrow">${esc(num)} / ${esc(spaced(label))}</div>`
    + `<h2>${esc(heading)}</h2><div class="rule"></div>`;
}

/**
 * Python table(). Cells are inserted RAW — the same contract the Python had, so
 * a caller can pass a `<span class="tag">` — which means every caller escapes
 * its own client data before it gets here.
 */
export function table(headers, rows, numericCols = [], opts = {}) {
  const num = new Set(numericCols);
  if (isGold(opts)) return goldTable(headers, rows, num);
  const th = headers.map((h, i) =>
    `<th class="${num.has(i) ? "num" : ""}">${esc(spaced(h))}</th>`).join("");
  const trs = rows.map((r) => {
    const tds = r.map((cell, i) =>
      `<td class="${num.has(i) ? "num" : ""}">${cell}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

/* ------------------------------------------------------------ gold look -- */

/**
 * The gold cover (fundhub_pdf_template.py cover_html()): a spectrum hairline
 * across the top, wordmark and tag, the title a third of the way down with a
 * short spectrum rule under it, four meta cells with left hairlines and mono
 * values, and the green-dot foot. The outer element stays `<div class="cover">`.
 */
function goldCover(client, doctype, title, med) {
  const meta = [
    ["applicant", client?.applicant],
    ["date", client?.date],
    ["outcome", client?.outcome],
    ["median score", med]
  ].map(([k, v]) => {
    const shown = v === null || v === undefined || v === "" ? "-" : v;
    return `<div class="cm"><div class="l">${esc(spaced(k))}</div><div class="v">${esc(shown)}</div></div>`;
  }).join("");
  return `
<div class="cover"><div class="spec-top"></div><div class="cov-in">
  <div class="cov-head"><div class="wordmark">fundhub.</div>
    <div class="cov-tag">${spaced("underwriteiq")} / ${spaced("client deliverable")}</div></div>
  <div class="cov-mid"><div class="cov-eyebrow">${esc(spaced(doctype))}</div>
    <h1 class="cov-title">${esc(title)}</h1><div class="cov-rule"></div></div>
  <div class="cov-meta">${meta}</div>
  <div class="cov-foot"><div><span class="dot">&#9679;</span>&nbsp; diagnostic complete &#183; underwriteiq</div>
    <div>fundhub confidential</div></div>
</div></div>`;
}

/**
 * The gold closing panel (fundhub_pdf_template.py CLOSING), with two changes the
 * owner made: the first sentence is the honest one off the file (ctaLead), not
 * the gold pack's "You have clean bureaus ready for funding now" on every file;
 * and the link is a real button and a real link, not the dead
 * www.fundhubbookingurl.template.
 *
 * Owner-set 2026-09-25: the gold pack's [ QR CODE ] box is gone. It never encoded
 * anything — it drew the literal words in a dashed square — so the button below is
 * the whole control, and its address is CLOSING_CTA_URL.
 */
function goldCtaPage(client) {
  const url = esc(CLOSING_CTA_URL);
  const shown = esc(CLOSING_CTA_URL.replace(/^https:\/\//, ""));
  return `
<div class="cta-page"><div class="spec-top"></div><div class="clo-in">
  <div class="cov-head"><div class="wordmark">fundhub.</div><div class="cov-tag">${spaced("next steps")}</div></div>
  <div class="clo-mid">
    <h2 class="clo-title">Let Us Build Your Game Plan Together</h2>
    <div class="clo-rule"></div>
    <p class="clo-sub">${esc(ctaLead(client))}</p>
    <div class="clo-cta"><a class="book-btn" href="${url}">Book your strategy call</a></div>
    <a class="clo-url" href="${url}">${shown}</a>
    <div class="clo-alt">Or copy this link into your browser</div>
  </div>
  <div class="clo-foot"><div><span class="dot">&#9679;</span>&nbsp; systems nominal &#183; fundhub.ai</div>
    <div>fundhub confidential</div></div>
</div></div>`;
}

/**
 * A cell the gold sheet sets in JetBrains Mono: its whole text is one number, a
 * dollar amount, a percent, a dollar range, or the "-" that stands for unknown.
 * Only the <td> gets a class. The cell's content is never wrapped or changed,
 * so every sentence and row shape the tests grep for survives.
 */
const NUMERIC_CELL = /^(?:-|[~+-]?\$?\d[\d,]*(?:\.\d+)?[KM]?%?\+?(?:\s*-\s*\$?\d[\d,]*(?:\.\d+)?[KM]?\+?)?)$/;

function goldTable(headers, rows, num) {
  const th = headers.map((h, i) =>
    `<th class="${num.has(i) ? "num" : ""}">${esc(spaced(h))}</th>`).join("");
  const trs = rows.map((r) => {
    const tds = r.map((cell, i) => {
      const cls = [num.has(i) ? "num" : "", NUMERIC_CELL.test(String(cell ?? "").trim()) ? "m" : ""]
        .filter(Boolean).join(" ");
      return `<td class="${cls}">${cell}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  return `<table class="fh"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

/**
 * A status chip. `kind` is "solid" (the worst states), "mid" (high / medium) or
 * "line" (everything else), the three weights the gold sheet uses.
 */
export function chip(text, kind = "line") {
  const k = ["solid", "mid", "line"].includes(kind) ? kind : "line";
  return `<span class="chip ${k}">${esc(spaced(text))}</span>`;
}

/** An inline book-the-call button for the body of a document. */
export function bookButton(label = "Book your strategy call") {
  return `<a class="book-btn ink" href="${esc(BOOK_CALL_URL)}">${esc(label)}</a>`;
}

/** Python util_bar(). The dashed mark sits at the 10% threshold. */
export function utilBar(label, sub, pct) {
  return `
<div class="bar-row">
  <div class="head"><span>${esc(label)}</span><span>${esc(pct)}%</span></div>
  <div class="bar-track">
    <div class="bar-fill" style="width:${Math.min(Number(pct) || 0, 100)}%"></div>
    <div class="bar-mark" style="left:10%"></div>
  </div>
  <div class="small">${esc(sub)}</div>
</div>`;
}

/**
 * The running footer. It lived in the @page margin boxes
 * (fundhub_gen.py:319-328) and a browser does not paint those, so it is an
 * ordinary element at the end of the flow. There is no page number: pages stop
 * existing and a faked count would be a lie.
 */
export function runningFoot(client, footerLabel) {
  const who = String(client?.applicant || "").toLowerCase();
  return `<footer class="running-foot">`
    + `<span>fundhub. ·confidential${who ? ` ·prepared for ${esc(who)}` : ""}</span>`
    + `<span>${esc(footerLabel)}</span>`
    + "</footer>";
}

/**
 * Python render(), minus WeasyPrint. Returns one self-contained HTML document.
 *
 * @param {object} args
 * @param {string} args.body      the document body, already built and escaped
 * @param {object} args.client    the CLIENT dict, for the footer only
 * @param {string} args.footerLabel
 * @param {string} args.title     the <title>; browsers need one, PDFs did not
 * @param {string} [args.variant] "" or "v2" — the body class the Python passed
 * @param {string} [args.fontsHref] serve the .ttf files from here instead of
 *                                  embedding them
 */
export function renderDocument({ body, client, footerLabel, title, variant = "", fontsHref = "" }) {
  // PAGE_CSS goes LAST on purpose. It is the frame that replaced @page, and
  // BASE_CSS still carries the print stylesheet's `body { margin: 0 }` — with
  // PAGE_CSS first that rule won and the page stopped centring.
  const css = [fontFaceCss({ href: fontsHref }), BASE_CSS, COVER_CSS, PAGE_CSS]
    .filter(Boolean).join("\n");
  const cls = variant ? ` class="${esc(variant)}"` : "";
  return "<!doctype html>\n"
    + '<html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${esc(title)}</title>`
    + `<style>${css}</style>`
    + `</head><body${cls}>${body}${runningFoot(client, footerLabel)}</body></html>`;
}
