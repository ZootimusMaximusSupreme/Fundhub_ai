/* /roadmap buy box v2 + the guarantee back (owner ask 2026-10-02). GREEN marked draft.
 *
 *   1  Refund line right above the step-1 button.
 *   2  Step 1 is first name, last name, email. The phone moved to step 3 and is
 *      still required there.
 *   3  "Step 1 of 3" (then 2 of 3, 3 of 3) replaces the three step tabs.
 *   4  New line under the step-1 button.
 *   5  Step-1 button: "Continue" -> "Get My Funding Roadmap".
 *   6  The guarantee section, cut 2026-10-01, is back in its old place right
 *      before the FAQ, word for word.
 *
 * Every visible change is outlined green with its number and a one-line note
 * that shows the old words and the new ones. Changes nobody can see (tracking,
 * the server) are listed in the note at the top. "Hide the marks" shows the
 * page as a buyer sees it.
 *
 * Reads the edited page (../slo-01-sales.html) WITHOUT changing it. The new
 * words in the notes are read out of the page, so the draft cannot drift from
 * it; the old words are the ones the page held at 24c002e8. The draft opens all
 * three steps so every mark can be seen. It connects to nothing: the
 * attribution script is left out and the checkout calls point nowhere.
 *
 * Run:  node marketing/landing-pages/slo/preview/buybox-v2-draft-build.mjs
 * Out:  buybox-v2-draft.html
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
const REFUND = grab(/<p class="cfw-refund">([^<]+)<\/p>/, "the refund line");
const BUTTON = grab(/<button type="submit" class="cfw-btn">([^<]+)<\/button>\s*<div class="cfw-note">Your roadmap/, "the step-1 button");
const UNDER = grab(/<button type="submit" class="cfw-btn">[^<]+<\/button>\s*<div class="cfw-note">([^<]+)<\/div>/, "the line under the step-1 button");
const PROGRESS = grab(/<div class="cfw-progress" data-progress>([^<]+)<\/div>/, "the step line");
const PHONE_REQ = grab(/bad\(ph,'(Please enter your phone number\.)'\)/, "the phone-required message");
const PHONE_BAD = grab(/else if\(!phone10\(ph\.value\)\)bad\(ph,'([^']+)'\)/, "the phone-invalid message");
const GUARANTEE = grab(/<span class="kicker">The Guarantee<\/span>\s*<p>([\s\S]*?)<\/p>/, "the guarantee words").replace(/<\/?b>/g, "");

/* What the page said before (24c002e8). */
const OLD = {
  button: "Continue",
  under: "Step 1 of 3. Your card is next, then the short soft pull form.",
  tabs: "1 · Info | 2 · Card | 3 · Soft pull (three tabs)",
};

const mark = (n, inner) => `<div class="fhx-mark" data-n="${n}">${inner}</div>`;
const note = (n, text) => `<div class="fhx-note"><b>${n}</b><span>${text}</span></div>`;
const mk = (tag, n) => tag.replace(/^<(\w+) class="/, `<$1 data-n="${n}" class="fhx-mk `);
const q = (t) => `“${t}”`;

const TOP = [
  ["2", `Phone on step 3: still required (${q(PHONE_REQ)} / ${q(PHONE_BAD)}), checked by the page and by our server. The contact is still saved the moment a real email is typed on step 1; the phone typed on step 3 joins that same record and the same ClickFunnels contact.`],
  ["2", "Unpaid visitors who leave before paying now give no phone, so the 15-minute follow-up reaches them by email only (the text needs a phone)."],
  ["3", "Every buy box event we record now says it came from buy box version 2, and one marker row records the time this goes live, so before and after can be compared. Event names did not change."],
  ["3", "Step 3 still opens only after the card is paid. The Back link on the card step still goes to step 1."],
];

const PROGRESS_TAG = `<div class="cfw-progress" data-progress>${PROGRESS}</div>`;
const EMAIL_LABEL = '<label>Email<input type="email" name="email" data-f="email" autocomplete="email" inputmode="email" maxlength="160"></label>';
const REFUND_TAG = `<p class="cfw-refund">${REFUND}</p>`;
const BUTTON_TAG = `<button type="submit" class="cfw-btn">${BUTTON}</button>`;
const UNDER_TAG = `<div class="cfw-note">${UNDER}</div>`;
const PHONE_BOX = '<div class="cfw-box">\n        <span class="cfw-kick">Your phone</span>';
const GUARANTEE_OPEN = '<section class="sect" data-fh-section="guarantee">';

const MARKS = [
  /* 3: the step line in place of the tabs */
  [PROGRESS_TAG, mk(PROGRESS_TAG, 3) + note(3, `Was ${q(OLD.tabs)}. Now one line: ${q(PROGRESS)}, then “Step 2 of 3” and “Step 3 of 3” as they move. Nothing to tap.`)],
  /* 2: the phone box is gone from step 1 */
  [EMAIL_LABEL, EMAIL_LABEL + note(2, "The Phone box that sat here is gone. Step 1 is first name, last name, email. The phone is asked on step 3 (mark 2 further down).")],
  /* 1: the refund line */
  [REFUND_TAG, mark(1, REFUND_TAG) + note(1, `New line, right above the button: ${q(REFUND)}`)],
  /* 5: the button */
  [BUTTON_TAG, mk(BUTTON_TAG, 5) + note(5, `Button was ${q(OLD.button)}. Now ${q(BUTTON)}. Same job: it opens the card step.`)],
  /* 4: the line under the button */
  [UNDER_TAG, mark(4, UNDER_TAG) + note(4, `Was ${q(OLD.under)} Now ${q(UNDER)}`)],
  /* 2: the phone box on step 3 */
  [PHONE_BOX, PHONE_BOX.replace('<div class="cfw-box">', '<div data-n="2" class="fhx-mk cfw-box">')],
  /* 6: the guarantee */
  [GUARANTEE_OPEN, note(6, `Back in its old place, right before the FAQ (it was cut on 2026-10-01). Same words as before: ${q(GUARANTEE)} Same 7 days as mark 1. Its button scrolls to the buy box.`) + mk(GUARANTEE_OPEN, 6)],
  /* draft plumbing: no tracking, no checkout calls */
  ['<script src="https://fundhub.ai/funnel/fh-attribution.js"></script>', ""],
  ["var API='https://fundhub.ai/api/public/';", "var API='data:,draft-connects-to-nothing/';"],
];

/* the step-3 phone note goes right after that box */
const PHONE_END = '<label>Phone<input type="tel" name="phone" data-f="phone" autocomplete="tel" inputmode="tel" maxlength="20"></label>\n      </div>';
MARKS.push([PHONE_END, PHONE_END + note(2, `Moved here from step 1, just before the consent box that says “the number I gave”. Still required: ${q(PHONE_REQ)} or ${q(PHONE_BAD)}`)]);

let draft = s;
for (const [from, to] of MARKS) {
  const n = draft.split(from).length - 1;
  if (n !== 1) throw new Error(`expected one match, found ${n}: ${from.slice(0, 80)}`);
  draft = draft.split(from).join(to);
}

const topNote = `<div class="fhx-top"><div class="fhx-top-h">Changes you cannot see on this page</div>${TOP.map(([n, t]) => note(n, t)).join("")}</div>`;
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
.fhx-note{display:flex;gap:8px;align-items:flex-start;margin:8px 0 12px;padding:7px 10px;background:#ECFDF3;border-left:3px solid #16A34A;border-radius:4px;font:500 12.5px/1.45 system-ui,sans-serif;color:#14532D;text-align:left;letter-spacing:0;text-transform:none}
.fhx-note b{flex:0 0 auto;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#16A34A;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center}
html:not(.fhx-clean) #fhw .cfw-step{display:block}
html:not(.fhx-clean) #fhw .cfw-step+.cfw-step{margin-top:18px;padding-top:14px;border-top:2px dashed #2F6FEB}
html.fhx-clean .fhx-note,html.fhx-clean .fhx-top{display:none}
html.fhx-clean .fhx-mark,html.fhx-clean .fhx-mk{outline:0!important;margin:0;padding:0}
html.fhx-clean .fhx-mark::before,html.fhx-clean .fhx-mk::after{display:none}
html.fhx-clean .fhx-mark{margin:0;padding:0}
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Green = buy box v2 (1 to 5) and the guarantee back (6) · All three steps shown open · This copy connects to nothing</span><a href="#fh-order">Jump to the buy box</a><button type="button" id="fhx-toggle">Hide the marks</button></div>
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

writeFileSync(join(here, "buybox-v2-draft.html"), wrapFragment(draft));
console.log("built buybox-v2-draft.html");
