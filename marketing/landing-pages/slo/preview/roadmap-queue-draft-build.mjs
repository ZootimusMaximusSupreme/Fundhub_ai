/* /roadmap queue items 2, 3, 6, 7 (owner ask 2026-10-02). GREEN marked draft.
 *
 *   2  Tap speed. Measured; every tap is already well under 200 ms. No change.
 *   3  Layout shift. The buy box no longer shoves the page around while the
 *      card form loads, after the card is paid, and after Start My Soft Pull.
 *   5  In-app reload (Facebook / Instagram) keeps a paid buyer on step 3.
 *      Behaviour only. The note says whether this copy of the page has it.
 *   6  Dead clicks. Locked tabs look locked and say why; a tap on an order
 *      summary row opens its sample; a tap on a testimonial caption plays it.
 *   7  Company name: Fundhub LLC in the soft-pull consent and the footer.
 *
 * Every visible change is outlined green with its number and a one-line note.
 * Changes nobody can see (behaviour, speed) are listed in the note at the top
 * with the measured numbers. "Hide the marks" shows the page as a buyer sees it.
 *
 * Reads the edited page (../slo-01-sales.html) WITHOUT changing it. Messages in
 * the marks are read out of the page, so the draft cannot drift from it. The
 * draft opens all three steps so every mark can be seen. It connects to
 * nothing: the attribution script is left out and the checkout calls point
 * nowhere.
 *
 * Run:  node marketing/landing-pages/slo/preview/roadmap-queue-draft-build.mjs
 * Out:  roadmap-queue-draft.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapFragment } from "../../harness/_shell.js";

const here = dirname(fileURLToPath(import.meta.url));
const s = readFileSync(join(here, "..", "slo-01-sales.html"), "utf8");

function grab(re, what) {
  const m = s.match(re);
  if (!m) throw new Error(`not found in the page: ${what}`);
  return m[1];
}
const UNPAID = grab(/var UNPAID='([^']+)';/, "the unpaid message");
const PAID_NOTE = grab(/tabNote\.textContent=paid\?'([^']+)':UNPAID/, "the paid tab note");
const HAS_ITEM5 = /function keepPaid\(/.test(s);

const mark = (n, inner, sample) => `<div class="fhx-mark${sample ? " fhx-sample" : ""}" data-n="${n}">${inner}</div>`;
const note = (n, text) => `<div class="fhx-note"><b>${n}</b><span>${text}</span></div>`;
const mk = (tag, n) => tag.replace(/^<(\w+) class="/, `<$1 data-n="${n}" class="fhx-mk `);

/* Measured 2026-10-02, Playwright, page served on a fake host with every call
   stubbed. Phone: 390x844, CPU 4x slower, Slow 4G. Computer: 1280x800. */
const TOP = [
  ["2", "Tap speed: no change needed. Slowest single tap, phone: 96 ms before, 64 ms after (computer 48 / 56 ms). The live page read the same way: 56 to 64 ms. Target is under 200 ms."],
  ["3", "Page jumps in the buy box, phone: card step 0.15 to 0, after paying 0.28 to 0, after Start My Soft Pull 0.89 to 0 (computer 0.08 / 0.26 / 0.79 to 0). Target is under 0.1."],
  ["3", "Behaviour: when a step opens, the box's top now snaps into place in one jump instead of a slow scroll. That is what stops the page under it from moving."],
  ["3", "Not changed: the page-load jump is 0.08 on a phone and 0.09 on a computer, under the 0.1 target. It comes from the headline styles at the end of the file landing after the first paint."],
  ["5", HAS_ITEM5
    ? "In-app browsers: if Facebook or Instagram reloads the page after a good payment, the buyer comes back to step 3, not a fresh $297 card form."
    : "In-app reload fix (keep a paid buyer on step 3 after Facebook or Instagram reloads the page) is NOT in this copy yet."],
  ["", "Also fundhub.ai/affiliates/ (separate page): after a partner submits the form, the thank-you box now holds the form's space, so the page under it stops jumping up. Phone 0.23 to 0, computer 0.14 to 0. Taps there: 64 to 72 ms."],
];

const TABS_OPEN = '<div class="cfw-steps" data-tabs>';
const TABNOTE = '<div class="cfw-tabnote" data-tabnote role="status" hidden></div>';
const CARDMOUNT = '<div class="cfw-cardmount" data-cardmount>';
const PULLBTN = '<button type="submit" class="cfw-btn" data-pull>Start My Soft Pull</button>';
const CONSENT = '<label class="check consent">';
const FOOT = '<div class="foot-bottom">';
const SUM = '<div class="sum">';
const SUMTOT = '<div class="tot">';
const TESTI = 'People who used the roadmap</span>';

const MARKS = [
  /* 6: the step tabs and the line a locked tab shows */
  [TABS_OPEN, mk(TABS_OPEN, 6)],
  [TABNOTE, TABNOTE + mark(6, `<div class="cfw-tabnote">${UNPAID}</div>`, true) + mark(6, `<div class="cfw-tabnote">${PAID_NOTE}</div>`, true) +
    note(6, "A step that cannot open looks locked: grey, dashed, a small lock. Before paying that is Soft pull. After paying it is Info and Card. A tap shows one of the two lines above.")],
  /* 3: the card box holds its full height while the card form loads */
  [CARDMOUNT, mk(CARDMOUNT, 3)],
  ['<div class="cfw-total"><span>Total today</span>', note(3, "The card box is full height from the start, with the loading line on top. The total and the button no longer jump down when the card form arrives.") + '<div class="cfw-total"><span>Total today</span>'],
  /* 3: the status panes keep the box's height */
  [PULLBTN, PULLBTN + note(3, "After Start My Soft Pull, the box keeps this height while the file is read, so the page under it does not jump up. Only shows after a real pull.")],
  /* 7: consent and footer (their notes are added below) */
  [CONSENT, mk(CONSENT, 7)],
  [FOOT, mk(FOOT, 7)],
  /* 6: order summary rows */
  [SUM, mk(SUM, 6)],
  [SUMTOT, note(6, "A tap anywhere on a row opens that row's sample. It used to work only on “See a sample”.") + SUMTOT],
  /* 6: testimonial captions */
  [TESTI, TESTI + `<div style="grid-column:1/-1">${note(6, "A tap on the words under a video now plays it, same as the Play button.")}</div>`],
  /* draft plumbing: no tracking, no checkout calls */
  ['<script src="https://fundhub.ai/funnel/fh-attribution.js"></script>', ""],
  ["var API='https://fundhub.ai/api/public/';", "var API='data:,draft-connects-to-nothing/';"],
];

/* the consent note goes right after the consent label */
const CONSENT_END = 'Agreeing to texts is not a condition of buying anything.</span></label>';
MARKS.push([CONSENT_END, CONSENT_END + note(7, "Company name is now Fundhub LLC. It said “Fundhub Credit Solutions LLC” and “Fundhub may call and text me”. Same words as the stored consent record.")]);
const FOOT_LINE = /(<div[^>]*class="fhx-mk foot-bottom">[^\n]*\n)/;

let draft = s;
for (const [from, to] of MARKS) {
  const n = draft.split(from).length - 1;
  if (n !== 1) throw new Error(`expected one match, found ${n}: ${from.slice(0, 80)}`);
  draft = draft.split(from).join(to);
}
if (!FOOT_LINE.test(draft)) throw new Error("footer line not found");
draft = draft.replace(FOOT_LINE, `$1    ${note(7, "The copyright line now names Fundhub LLC.")}\n`);

const topNote = `<div class="fhx-top"><div class="fhx-top-h">Changes you cannot see on this page, with the numbers</div>${TOP.map(([n, t]) => note(n || "+", t)).join("")}</div>`;
draft = draft.replace('<div class="fh-root">', `<div class="fh-root">\n${topNote}`);

draft += `
<style>
.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;background:#0B5D1E;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 16px}
.fhx-banner button,.fhx-banner a{font:600 12px system-ui,sans-serif;background:#fff;color:#0B5D1E;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;text-decoration:none}
.fhx-banner button:focus-visible,.fhx-banner a:focus-visible{outline:2px solid #fff;outline-offset:2px}
.fh-root{padding-top:48px}
.fhx-top{max-width:900px;margin:12px auto 0;padding:10px 16px 4px}
.fhx-top-h{font:700 13px/1.4 system-ui,sans-serif;color:#14532D;margin-bottom:4px}
.fhx-mark{position:relative;outline:2px solid #16A34A;outline-offset:2px;border-radius:6px;margin:16px 0 6px;padding:6px 10px 6px 16px}
.fhx-mark::before,.fhx-mk::after{content:attr(data-n);position:absolute;z-index:2;width:20px;height:20px;border-radius:50%;background:#16A34A;color:#fff;font:700 11px/20px system-ui,sans-serif;text-align:center;letter-spacing:0}
.fhx-mark::before{top:-12px;left:-10px}
.fhx-mk{position:relative;outline:2px solid #16A34A!important;outline-offset:2px}
.fhx-mk::after{top:-10px;right:-8px}
html:not(.fhx-clean) .fh-b .proofgrid .tcap{outline:2px solid #16A34A;outline-offset:3px;border-radius:4px}
.fhx-note{display:flex;gap:8px;align-items:flex-start;margin:8px 0 12px;padding:7px 10px;background:#ECFDF3;border-left:3px solid #16A34A;border-radius:4px;font:500 12.5px/1.45 system-ui,sans-serif;color:#14532D;text-align:left;letter-spacing:0;text-transform:none}
.fhx-note b{flex:0 0 auto;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#16A34A;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center}
html:not(.fhx-clean) #fhw .cfw-step{display:block}
html:not(.fhx-clean) #fhw .cfw-step+.cfw-step{margin-top:18px;padding-top:14px;border-top:2px dashed #2F6FEB}
html.fhx-clean .fhx-note,html.fhx-clean .fhx-sample,html.fhx-clean .fhx-top{display:none}
html.fhx-clean .fhx-mark,html.fhx-clean .fhx-mk{outline:0!important;margin:0;padding:0}
html.fhx-clean .fhx-mark::before,html.fhx-clean .fhx-mk::after{display:none}
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Green = /roadmap queue items 3, 6, 7 · All three steps shown open · This copy connects to nothing</span><a href="#fh-order">Jump to the buy box</a><button type="button" id="fhx-toggle">Hide the marks</button></div>
<script>
(function(){
  var b=document.getElementById('fhx-toggle');if(!b)return;
  /* The banner wraps to two lines on a phone. Push the page down by its real
     height so it never covers the logo. */
  var bar=b.parentNode,root=document.querySelector('.fh-root');
  function fit(){if(root)root.style.paddingTop=bar.offsetHeight+'px';}
  fit();window.addEventListener('resize',fit);
  b.addEventListener('click',function(){var on=document.documentElement.classList.toggle('fhx-clean');b.textContent=on?'Show the marks':'Hide the marks';});
})();
</script>`;

writeFileSync(join(here, "roadmap-queue-draft.html"), wrapFragment(draft));
console.log(`built roadmap-queue-draft.html (item 5 ${HAS_ITEM5 ? "in" : "NOT in"} this copy)`);
