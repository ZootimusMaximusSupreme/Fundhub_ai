/* Roadmap buy box — wiring fixes 1, 4 and 5. GREEN marked draft (round 2).
 *
 * Source: docs/audits/wiring-audit-2026-10-02.md. Chris approved these fixes,
 * so every changed line or control in the buy box is marked green with its
 * fix number and a one-line note:
 *   1  The Soft pull tab stays locked until the card is paid. An unpaid try
 *      gets a plain message and goes back to the card, never
 *      "Your payment went through".
 *   4  The $15 extra-business option and its lines are hidden until charging
 *      for it is built (EXTRA_BIZ in the page turns them back on).
 *   5  The address warning names the real button, Start My Soft Pull.
 *
 * Reads the edited page (../slo-01-sales.html) WITHOUT changing it. The
 * messages shown in the marks are read out of the page, so the draft cannot
 * drift from it. The draft opens all three steps so every mark can be seen;
 * "Hide the marks" puts the buy box back the way a buyer sees it.
 * The draft connects to nothing: the tracking script is left out and the
 * checkout calls point nowhere.
 *
 * Run:  node marketing/landing-pages/slo/preview/wiring-fixes-draft-build.mjs
 * Out:  wiring-fixes-draft.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapFragment } from "../../harness/_shell.js";

const here = dirname(fileURLToPath(import.meta.url));
const LIVE_FILE = join(here, "..", "slo-01-sales.html");
const s = readFileSync(LIVE_FILE, "utf8");

function grab(re, what) {
  const m = s.match(re);
  if (!m) throw new Error(`not found in the page: ${what}`);
  return m[1];
}
const UNPAID = grab(/var UNPAID='([^']+)';/, "the unpaid message");
const ADDR_MSG = grab(/var ADDR_MSG="([^"]+)";/, "the address warning");

/* A mark outlines what the buyer sees. A sample mark shows a message the page
   only shows at that moment, so it is gone when the marks are hidden. */
const mark = (n, inner, sample) => `<div class="fhx-mark${sample ? " fhx-sample" : ""}" data-n="${n}">${inner}</div>`;
const note = (n, text) => `<div class="fhx-note"><b>${n}</b><span>${text}</span></div>`;

const ADDLINE = '<p class="cfw-addline">We pull business credit too.<span data-extra hidden> Your first business is included. Each extra one is $15.</span></p>';
const ADDBTN = '<button type="button" class="cfw-add" hidden data-add>+ Add a business ($15)</button>';
const SUMNOTE = '<p class="fh-sumnote" data-extra hidden>Your first business is included. Each extra business is $15, added at the soft-pull step.</p>';
const STREET = '<label>Street address<input type="text" name="address" data-f="address" autocomplete="address-line1" maxlength="48" placeholder="123 Main St"></label>';

const MARKS = [
  /* 1: the tab, and the message an unpaid try now gets */
  ['<button type="button" data-tab="3">3 &middot; Soft pull</button></div>',
   '<button type="button" data-tab="3" class="fhx-mk" data-n="1">3 &middot; Soft pull</button></div>\n    ' +
   mark(1, `<div class="cfw-formerr" role="note">${UNPAID}</div>`, true) +
   note(1, "The Soft pull tab stays locked until the card is paid. An unpaid try now shows this message and goes back to the card. It used to say “Your payment went through.”")],
  /* 4: the order summary line */
  [SUMNOTE, `${SUMNOTE}\n        ${note(4, "Hidden until we can charge for it: the line that said each extra business is $15.")}`],
  /* 4: step 3 intro and the add button */
  [ADDLINE, mark(4, ADDLINE) + note(4, "“Your first business is included. Each extra one is $15.” is hidden. Only “We pull business credit too.” shows.")],
  [ADDBTN, `${ADDBTN}\n      ${note(4, "Hidden: the “+ Add a business ($15)” button. One business per order until charging for extras is built.")}`],
  /* 5: the address warning, shown under the street box */
  [STREET, STREET + mark(5, `<span class="ferr fwarn">${ADDR_MSG}</span>`, true) +
   note(5, "Shows only when we cannot find the address. It now names the real button, Start My Soft Pull. It said “tap Pay again”.")],
  /* draft plumbing: no tracking, no checkout calls */
  ['<script src="https://fundhub.ai/funnel/fh-attribution.js"></script>', ""],
  ["var API='https://fundhub.ai/api/public/';", "var API='data:,draft-connects-to-nothing/';"],
];

let draft = s;
for (const [from, to] of MARKS) {
  const n = draft.split(from).length - 1;
  if (n !== 1) throw new Error(`expected one match, found ${n}: ${from.slice(0, 80)}`);
  draft = draft.split(from).join(to);
}

draft += `
<style>
.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;background:#0B5D1E;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 16px}
.fhx-banner button,.fhx-banner a{font:600 12px system-ui,sans-serif;background:#fff;color:#0B5D1E;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;text-decoration:none}
.fhx-banner button:focus-visible,.fhx-banner a:focus-visible{outline:2px solid #fff;outline-offset:2px}
.fh-root{padding-top:48px}
.fhx-mark{position:relative;outline:2px solid #16A34A;outline-offset:2px;border-radius:6px;margin:16px 0 6px;padding:6px 10px 6px 16px}
.fhx-mark::before,.fhx-mk::after{content:attr(data-n);position:absolute;z-index:2;width:20px;height:20px;border-radius:50%;background:#16A34A;color:#fff;font:700 11px/20px system-ui,sans-serif;text-align:center;letter-spacing:0}
.fhx-mark::before{top:-12px;left:-10px}
.fhx-mk{position:relative;outline:2px solid #16A34A!important;outline-offset:2px}
.fhx-mk::after{top:-10px;right:-8px}
.fhx-note{display:flex;gap:8px;align-items:flex-start;margin:8px 0 12px;padding:7px 10px;background:#ECFDF3;border-left:3px solid #16A34A;border-radius:4px;font:500 12.5px/1.45 system-ui,sans-serif;color:#14532D;text-align:left}
.fhx-note b{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:#16A34A;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center}
html:not(.fhx-clean) #fhw .cfw-step{display:block}
html:not(.fhx-clean) #fhw .cfw-step+.cfw-step{margin-top:18px;padding-top:14px;border-top:2px dashed #2F6FEB}
html.fhx-clean .fhx-note,html.fhx-clean .fhx-sample{display:none}
html.fhx-clean .fhx-mark,html.fhx-clean .fhx-mk{outline:0!important;margin:0;padding:0}
html.fhx-clean .fhx-mark::before,html.fhx-clean .fhx-mk::after{display:none}
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Green = approved fixes 1, 4, 5 in the buy box · All three steps shown open · This copy connects to nothing</span><a href="#fh-order">Jump to the buy box</a><button type="button" id="fhx-toggle">Hide the marks</button></div>
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

writeFileSync(join(here, "wiring-fixes-draft.html"), wrapFragment(draft));
console.log("built wiring-fixes-draft.html");
