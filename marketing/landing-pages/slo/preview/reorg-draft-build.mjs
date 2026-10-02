/* Roadmap page — reorganized DRAFT with bad copy highlighted.
 *
 * Chris, 2026-09-29: "Just do only the reorganizing of the page, and highlight
 * the copy that is bad with suggestions. Don't push live."
 *
 * Reads the live fragment (../slo-01-sales.html) WITHOUT changing it, moves the
 * sections into the order from the Roadmap Page Audit (Sep 29), and writes a
 * browser preview with numbered red marks on every bad line and the suggested
 * fix beside it. Moved copy stays word for word; the fixes are only suggestions.
 *
 * WENT LIVE 2026-09-29 (Chris: "Push it live. The business map is a free
 * bonus!"). --live wrote the clean page over ../slo-01-sales.html and froze the
 * page it was built from as slo-01-sales.before-reorg.html, which is what this
 * script reads from now on. Later copy rounds landed in this script only.
 * --live again writes the current draft (frozen page + the fixes below), with
 * every review mark stripped, over ../slo-01-sales.html.
 *
 * Run:  node marketing/landing-pages/slo/preview/reorg-draft-build.mjs [--share] [--live]
 * Out:  01-sales-reorg-draft.html  red notes on the old copy
 *       01-sales-reorg-fixed.html  every fix written in, marked green
 *       --share  01-sales-reorg-share.html, self-contained, for the shared link
 *       --live   ../slo-01-sales.html, clean, ready for the ClickFunnels push
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapFragment } from "../../harness/_shell.js";

const here = dirname(fileURLToPath(import.meta.url));
const LIVE_FILE = join(here, "..", "slo-01-sales.html");
const FROZEN = join(here, "slo-01-sales.before-reorg.html");
const s = readFileSync(existsSync(FROZEN) ? FROZEN : LIVE_FILE, "utf8");

function at(marker, from = 0) {
  const i = s.indexOf(marker, from);
  if (i < 0) throw new Error(`marker not found: ${marker}`);
  return i;
}
const between = (a, b) => s.slice(at(a), at(b));

/* ---------- cut the current page into its blocks ---------- */
const HERO = between("<!-- SECTION 1: ABOVE THE FOLD -->", "<!-- SECTION 2: THE PAIN -->");
const BRIDGE = between("<!-- SECTION 3: THE BRIDGE -->", "<!-- SECTION 4: WHAT YOU GET -->");
const WYG = between("<!-- SECTION 4: WHAT YOU GET -->", "<!-- lightbox for the sample pages -->");
const LIGHTBOX = between("<!-- lightbox for the sample pages -->", "<!-- SECTION 5: PROOF -->");
const PROOF = between("<!-- SECTION 5: PROOF -->", "<!-- SECTION 6: QUALIFICATION -->");
const QUAL = between("<!-- SECTION 6: QUALIFICATION -->", "<!-- SECTION 7: WHAT HAPPENS NEXT -->");
const NEXT = between("<!-- SECTION 7: WHAT HAPPENS NEXT -->", "<!-- SECTION 8: FAQ -->");
const FAQ = between("<!-- SECTION 8: FAQ -->", "<!-- SECTION 9: CHECKOUT (embedded) -->");
const splitAt = at("<!-- ================= SPLIT-LINE");
const checkoutEnd = s.lastIndexOf("</section>", splitAt) + "</section>".length;
const CHECKOUT = s.slice(at("<!-- SECTION 9: CHECKOUT (embedded) -->"), checkoutEnd);
const PREFIX = s.slice(0, at("<!-- SECTION 1: ABOVE THE FOLD -->"));
let SUFFIX = s.slice(checkoutEnd);

/* Video testimonials live below the checkout today. Lift them out. */
const tStart = SUFFIX.indexOf("<!-- SLOT-TESTIMONIALS");
const tEndMark = "<!-- /SLOT-TESTIMONIALS -->";
const tEnd = SUFFIX.indexOf(tEndMark) + tEndMark.length;
const TESTIMONIALS = SUFFIX.slice(tStart, tEnd);
SUFFIX = SUFFIX.slice(0, tStart) + SUFFIX.slice(tEnd);

/* ---------- What You Get: split rows / deck / Why $297 / guarantee ---------- */
const deckStart = WYG.indexOf("<!-- FH-DECK:START -->");
const deckEndMark = "<!-- FH-DECK:END -->";
const deckEnd = WYG.indexOf(deckEndMark) + deckEndMark.length;
let wygHead = WYG.slice(0, deckStart);
let DECK = WYG.slice(deckStart, deckEnd);
const wygTail = WYG.slice(deckEnd);
const GUARANTEE_CARD = wygTail.match(/<div class="cardw">\s*<span class="kicker">The Guarantee<\/span>[\s\S]*?<\/div>/)[0];
const GET_BTN = wygTail.match(/<a class="btn fh-go-pay"[^>]*>[^<]*<\/a>/)[0];

/* Funding Snapshot first, then the order a buyer asks the questions. */
const ORDER = ["snapshot", "analysis", "roadmap", "pack", "lenders"];
const rows = wygHead.match(/<div class="srow">.*<\/div>\n/g);
const byPage = Object.fromEntries(rows.map((r) => [r.match(/data-page="(\w+)"/)[1], r]));
/* Swap each row slot for the row that belongs there, keeping the indentation. */
let slot = 0;
wygHead = wygHead.replace(/<div class="srow">.*<\/div>\n/g, () => {
  const i = slot++;
  return byPage[ORDER[i]].replace(/<span class="n">\d+<\/span>/, `<span class="n">0${i + 1}</span>`);
});

/* Approvals deck keeps build-deck.mjs order: smallest first, biggest last as you scroll (Chris, 2026-09-29). */
/* Mini course, Advisors, Community text: hidden until they exist. */
DECK = DECK.replace('<div class="slim slim-course">', '<div class="slim slim-course" hidden>')
  .replace('<div class="slim slim-adv">', '<div class="slim slim-adv" hidden>')
  .replace('<div class="pk-t">Community</div><div class="pk-d">The Fundhub wins group, from the day you buy.</div>', "");

/* ---------- Proof section: keep only the deck script and industry pills ---------- */
const DECK_JS = PROOF.slice(PROOF.indexOf("<!-- FH-DECK-JS:START -->"), PROOF.indexOf("<!-- FH-DECK-JS:END -->") + "<!-- FH-DECK-JS:END -->".length);
const INDS = PROOF.match(/<div class="inds" id="fh-inds">[\s\S]*?<\/div>/)[0];

/* ---------- FAQ: add the broker-difference answer, moved word for word from The Pain ---------- */
const BROKER_BODY = "Or you paid somebody four thousand dollars, got a list of banks in a document, watched your score drop thirty points in a month, and got told the market is tough right now when you asked why.";
const FAQ2 = FAQ.replace(
  /(<details><summary>How is this different from a funding course\?<\/summary>.*?<\/details>)/,
  `$1\n        <details open data-fhx-new><summary>How is this different from paying a broker?</summary><div class="a">${BROKER_BODY}</div></details>`,
);

/* ---------- Checkout order summary: same order as What You Get ---------- */
const sumLis = CHECKOUT.match(/<li><b>[^<]+<\/b>[^<]*<\/li>/g);
const sumKey = (li) =>
  /Snapshot/.test(li) ? "snapshot" : /Analysis/.test(li) ? "analysis" : /Roadmap/.test(li) ? "roadmap" : /Dispute/.test(li) ? "pack" : "lenders";
let li = 0;
const CHECKOUT2 = CHECKOUT.replace(/<li><b>[^<]+<\/b>[^<]*<\/li>/g, () => {
  const want = ORDER[li++];
  return sumLis.find((x) => sumKey(x) === want);
});

/* ---------- assemble in the new order ---------- */
const G = (t) => `<span class="fhx-new">${t}</span>`;

/* ---------- round 3 (Chris, 2026-09-29): outcome first ----------
   "Why does this matter to me?" Every block leads with what the buyer gets,
   then the facts. The facts underneath are unchanged and sourced as before. */
const row = (t, d) => `<div class="srow"><span class="n"></span><div><div class="t">${G(t)}</div><div class="d">${G(d)}</div></div></div>`;
const FIRST_WIN = `<section class="sect">
      <span class="kicker">${G("Your fastest first win")}</span>
      <div class="h2">${G("Your First Win Can Come Inside a Month.")}</div>
      <div class="prose" style="margin-top:10px"><p>${G("Pay one card down to the balance your roadmap gives you. Card balances report once a month, so your middle score can move within about 30 days, before a single letter comes back.")}</p></div>
      <figure class="fh-snapfig"><div class="fh-snapdoc"><div class="fh-snaphead">How Much You Qualify For &middot; sample</div><table><tr><th></th><th>today</th><th>after the roadmap</th></tr><tr><td>middle score</td><td>672</td><td><b>700+</b></td></tr><tr><td>qualifies for</td><td>$84,500</td><td><b>$146,000</b></td></tr><tr class="fh-val"><td>value of the roadmap</td><td></td><td class="fh-val-b"><span class="fh-plus">+$61,500</span></td></tr></table><div class="wm-s">SAMPLE</div></div><figcaption>${G("From a sample report for a made-up client. Yours is built from your own credit file.")}</figcaption></figure>
    </section>`;
const GOOD_CREDIT = `<section class="sect">
      <span class="kicker">${G("Already have good credit?")}</span>
      <div class="h2">${G("A High Score Isn't the Same as a File Set Up for Maximum Funding.")}</div>
      <div class="rows">
        ${row("Your inquiries", "Get every orphan inquiry off your file. Your letters dispute each one with no matching open account — even at 800, those cost you fundability.")}
        ${row("Your personal data", "One name and one address across every bureau. Your letters cut extras that can flag even a clean file.")}
        ${row("Your business", "More funding from age, state, and every aged company you add. How long it's been open and where it's registered open local banks on top of your home state.")}
        ${row("Your business credit", "Exact fixes so lenders see a credible business and you get the most funding your file supports. We pull your Experian Business report and flag scores, blemishes, high card balances, NAICS, and business name issues.")}
        ${row("Unlimited funding over time", "Keep getting funded as long as you keep building. Structure companies right and you can run five to ten, each funded in its own name — your free Business Duplication Map lays out which comes next, where to open it, and when.")}
      </div>
    </section>`;
const CHECKLIST = `<div class="fh-work">
        <div class="fh-work-h">${G("Your part, and how long it takes")}</div>
        <ul>
          <li><span>${G("See how much you qualify for, and read your roadmap")}</span><b>${G("about 20 minutes")}</b></li>
          <li><span>${G("Pay down the cards your roadmap names")}</span><b>${G("this month")}</b></li>
          <li><span>${G("Print, sign and mail round one")}</span><b>${G("about an hour")}</b></li>
          <li><span>${G("Wait for the bureaus to answer")}</span><b>${G("30 days max, each round")}</b></li>
          <li><span>${G("Apply in the order on your lender list")}</span><b>${G("when your roadmap says go")}</b></li>
        </ul>
      </div>
      `;
const NEW_CSS = `
.fh-root .fh-snapfig{max-width:460px;margin:22px auto 0}
.fh-root .fh-snapdoc{position:relative;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px;box-shadow:0 14px 34px rgba(17,17,19,.10);transform:none}
.fh-root .fh-snaphead{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gray2);margin-bottom:10px}
.fh-root .fh-snapdoc table{width:100%;border-collapse:collapse;font-size:14px}
.fh-root .fh-snapdoc th,.fh-root .fh-snapdoc td{padding:8px 6px;border-top:1px solid var(--line);text-align:left}
.fh-root .fh-snapdoc th{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--gray2);border-top:0}
.fh-root .fh-snapdoc .wm-s{position:absolute;right:14px;bottom:10px;font-family:var(--mono);font-size:11px;letter-spacing:.3em;color:rgba(17,17,19,.18)}
.fh-root .fh-snapdoc td.fh-val-b{position:relative;overflow:visible}
.fh-root .fh-snapdoc .fh-plus{position:absolute;left:0;top:50%;transform:translate(calc(-50% - 6px),-50%);color:#15803D;font-weight:700;white-space:nowrap}
.fh-root .fh-snapfig figcaption{margin-top:10px;font-size:12.5px;color:var(--gray2);text-align:center}
.fh-root .fh-work{margin-top:22px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:16px 18px;text-align:left}
.fh-root .fh-work-h{font-weight:700;margin-bottom:8px}
.fh-root .fh-work ul{list-style:none;padding:0;margin:0}
.fh-root .fh-work li{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:14.5px}
.fh-root .fh-work li:first-child{border-top:0}
.fh-root .fh-work li b{font-family:var(--mono);font-size:11.5px;font-weight:500;color:var(--gray2);text-align:right;max-width:45%}
.fh-root .fh-tprod{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gray2);margin-bottom:4px}
.fh-root .sp-why{font-weight:600;margin:4px 0 12px;font-size:14px}
.fh-root .sp-what{margin:-6px 0 12px;font-size:13px;color:var(--gray2)}
.fh-root .fh-bonus{display:inline-block;background:#A8D8B0;color:#0A0A0A;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.14em;padding:4px 9px;border-radius:999px;margin-right:8px;vertical-align:middle}
.fh-root .lb-body .sp{position:relative;min-height:430px}
.fh-root .sp-lock{position:absolute;left:-2px;right:-2px;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:24px 18px;background:linear-gradient(180deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,.93) 60%);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);border-top:1px solid var(--line)}
.fh-root .sp-lock b{font-size:16px}
.fh-root .sp-lock span{font-size:13.5px;color:var(--gray2)}
.fh-root .sp-lock .btn{margin-top:6px;max-width:320px;padding:12px 18px;font-size:15px}
.fh-root .wm{color:rgba(255,255,255,.88)}
.fh-root .folder .wm{color:rgba(10,10,10,.92)}
`;
const tag = (n, label, html) => `\n<div class="fhx-sec" data-tag="${n} · ${label}">\n${html}\n</div><!--/fhx-sec-->\n`;
const body =
  tag(1, "Screen one", HERO) +
  tag(2, "Video testimonials · each tagged with the product behind it", `<div class="fh-b fhx-testi">${TESTIMONIALS}</div>`) +
  tag(3, "What You Get · MOVED UP right under the testimonials · every card leads with why it matters", wygHead + "</section>\n" + LIGHTBOX) +
  tag(4, "NEW · Your fastest first win, with the Funding Snapshot table", FIRST_WIN) +
  tag(5, "Already have good credit? · shorter, outcome first", GOOD_CREDIT) +
  tag(6, "Why this works · was The Bridge", BRIDGE) +
  tag(7, "Approvals · smallest first, biggest last", `<section class="sect"><span class="kicker">Approvals</span>${DECK}</section>\n${DECK_JS}`) +
  tag(8, "What happens after you buy · plus your part and how long it takes", NEXT) +
  tag(9, "Who it's for", QUAL.replace(/<\/section>\s*$/, `${INDS}\n    </section>\n`)) +
  tag(10, "Guarantee", `<section class="sect">${GUARANTEE_CARD}${GET_BTN}</section>`) +
  tag(11, "FAQ · opens with the 800-score question", FAQ2) +
  tag(12, "Checkout", CHECKOUT2);

/* ---------- bad-copy marks: [css selector, text it must contain, what's wrong, suggestion] ---------- */
const NOTES = [
  [".hero .eyebrow", "", "Never names the product or says you are buying something.", "The Funding Roadmap · $297 · in your portal today"],
  [".hero h1", "", "The biggest claim on the page, with no proof on the same screen. \"We'll get you there\" also sounds done-for-you, but this is do-it-yourself.", "See how much funding your credit file can get, and the exact steps to get it. Put one roadmap result right under it, like Gene's low 600s to 810."],
  [".hero .lede", "", "No price anywhere on screen one (only a caption inside the video). \"The most amount of funding\" reads wrong.", "$297. We soft-pull your credit and about 10 seconds later five documents built from your own file are waiting in your portal."],
  [".btn", "Show Me How Much I Qualify For", "Sounds like a free check. Clicking it lands on a $297 order that later asks for a Social Security number. That surprise is where people stop.", "Get My $297 Funding Roadmap"],
  [".tcap", "Colin Schmidt", "Colin reviewed the roadmap. He did not get funded from it. It sits under \"people who bought it.\"", "Label it as a review: \"Colin Schmidt ran a funding company. He read the whole roadmap.\""],
  [".tcap", "Sarah, on Chris", "Sarah works for Fundhub and is not approved yet. A buyer who reads this stops trusting the other two.", "Swap her for a roadmap buyer with a real approval. If she stays, lead with the result once it lands."],
  [".fhx-testi .kicker", "From people who bought it", "Only Gene fits this label. Colin reviewed it, and Sarah is staff.", "People who used the roadmap"],
  [".kicker", "The Bridge", "\"The Bridge\" is a copywriter's label, not something a buyer should read.", "Why this works"],
  [".h2", "We Spent Thousands of Hours", "Long, and it is about us, not the buyer.", "It reads your file the way a bank's underwriter does."],
  [".prose p", "UnderwriteIQ reads your credit", "\"UnderwriteIQ\" is never explained. A buyer does not know what it is.", "Our software reads your credit file line by line and builds the plan off your own file."],
  [".prose p", "Ten years in this", "This \"ten years, hundreds of files\" line shows up three times on the page (here, the old Proof section, and the FAQ).", "Keep it here once. Take it out of the FAQ."],
  [".h2", "Here's What You Get", "Says the same thing as the label above it.", "Five documents, built from your own credit file, waiting in your portal today."],
  [".srow", "Capital Readiness Snapshot", "Two names: the card says \"Funding Snapshot,\" the sample says \"Capital Readiness Snapshot.\" A buyer reads that as two documents. The cover also says \"outcome: sample · median: sample · fundhub confidential,\" which looks unfinished.", "One name everywhere: Funding Snapshot. Take the template labels off every cover."],
  [".srow", "Financial Profile Assessment", "Two names again. The text also covers your future score (the Snapshot does that) and card paydown targets (the Roadmap does that). Written only for damaged files.", "Credit Analysis Report: what's hurting your file, item by item, on all three bureaus. Clean file? It shows you what's already working."],
  [".srow", "Business Readiness Roadmap", "The sample says \"6-Month Business Readiness Roadmap.\" The card says files take one to six months. The two disagree.", "Name the sample \"Credit Optimization Roadmap\" and let the length come from the file."],
  [".srow", "<b>All six rounds</b>", "The folder shows tabs 01 to 06, then jumps to 08. The text never says when rounds 2 to 6 go out. Only damaged files need this.", "Number the tabs 01 to 07. Add: \"Round 1 goes out today. Each next round goes out 30 days after the last reply.\" Clean file: \"No letters needed? The pack says so on page one.\""],
  [".srow", "Capital Partner Shortlist", "Clearest item, but it still has two names.", "Bank & Lender Match List on the card, the sample, and inside the file."],
  [".peekline", "", "Where the documents live is never said plainly. The page says \"in your account,\" \"portal,\" and \"prints.\" Business credit ($15 for each extra business) only shows up at checkout.", "All five show up in your Fundhub client portal the moment the pull finishes. Open them there, and download or print any of them. Your first business is included; each extra business is $15."],
  [".deck-foot", "", "These 16 approvals most likely came from done-for-you clients, not $297 roadmap buyers. Proof has to come from the thing being sold.", "Say where they came from (\"from our done-for-you clients\"), or keep only roadmap-buyer wins here."],
  [".srow .t", "You Fill Out the Form", "Says the form takes about ten seconds. It is really three steps: your info, card, then a soft pull that asks for your Social Security number. The card step is missing.", "01 Your info · 02 Pay $297 by card · 03 Soft pull · 04 Your five documents, about 10 seconds later. Time the real form and put that number in."],
  [".srow .d", "Run it yourself", "Blunt, and it has a stray space at the end.", "Every step is in order. You work it at your own pace."],
  [".prose p", "Every day you wait", "Pressure line. A skeptical buyer reads it as a sales push.", "Cut it."],
  [".cardw p", "If you're not happy with what you get, <b>we'll", "Doesn't say how to get the refund or how much comes back. The guarantee also shows up twice (here and at checkout).", "Email support@fundhub.ai within 7 days and you get the full $297 back. Keep it in one place."],
  ["details", "How do I know this is legit?", "Repeats \"ten years, hundreds of files\" a third time and doesn't answer the question.", "Point to proof: Gene's result, Colin's review, the phone number, and the 7-day refund."],
  ["details", "How is this different from paying a broker?", "NEW here, moved word for word from The Pain. It tells the story but never says what the buyer gets that the broker never gave them.", "A broker hands you a list of banks. This reads your own file first, fixes what's hurting it, and gives you the order to apply in so the declines don't stack."],
  ["details", "Can you do the work for me?", "Never says yes or no.", "No. This is do-it-yourself. You mail your own letters, so you hold every receipt and see every reply."],
  ["details", "How fast do I get it?", "It's about ten seconds after the soft pull, not after \"the form.\" The form has three steps.", "About ten seconds after the soft pull finishes."],
  ["#fh-order .h2", "", "Asks the free-check question again right at the checkout.", "Get Your Funding Roadmap · $297"],
  ["#fh-order .sum > .kicker", "", "Order summary lists five documents. It doesn't list business credit, the advisor, the mini course, or the community. The buyer can't tell if those are included.", "List exactly what What You Get lists. Anything charged here shows up in What You Get first."],
];

const TOOLKIT = `
<style>
.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:9999;background:#B00020;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:10px 16px;text-align:center}
.fh-root{padding-top:44px}
.fhx-sec{position:relative;outline:2px dashed #2F6FEB;outline-offset:6px;margin:34px 0}
.fhx-sec::before{content:attr(data-tag);display:block;font:700 11px/1.3 system-ui,sans-serif;letter-spacing:.04em;color:#fff;background:#2F6FEB;padding:5px 9px;border-radius:4px;margin-bottom:10px;width:max-content;max-width:100%}
.fhx-bad{outline:3px solid #E00 !important;outline-offset:2px;background:rgba(255,0,0,.06) !important;position:relative}
.fhx-num{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:11px;background:#E00;color:#fff;font:700 12px system-ui,sans-serif;padding:0 6px;margin-right:6px;vertical-align:middle}
.fhx-note{display:block;margin:8px 0 14px;padding:10px 12px;border-left:4px solid #E00;background:#FFF1F1;color:#222;font:14px/1.45 system-ui,sans-serif;text-align:left;border-radius:4px}
.fhx-note .w{color:#900}
.fhx-note .s{margin-top:6px;color:#0B5D1E}
.fhx-note .s b{color:#0B5D1E}
.fh-b.fhx-testi{background:transparent}
.sticky .fhx-note{display:none}
.fh-root .deck-runway > .slimrow{grid-template-columns:minmax(0,520px) !important;grid-template-areas:"comm" !important;justify-content:center}
.fhx-testi .fhx-note{max-width:900px;margin-left:auto;margin-right:auto}
</style>
<div class="fhx-banner">DRAFT, NOT LIVE · Blue dashed boxes = the new section order · Red boxes = bad copy, with the fix under each one</div>
<script>
(function(){
  var NOTES=${JSON.stringify(NOTES)};
  function run(){
    var n=0;
    NOTES.forEach(function(x){
      var els=[].slice.call(document.querySelectorAll(x[0])).filter(function(e){return !x[1]||e.innerHTML.indexOf(x[1])>=0||e.textContent.indexOf(x[1])>=0;});
      els.forEach(function(el){
        n++;el.classList.add('fhx-bad');
        var note=document.createElement('div');note.className='fhx-note';
        note.innerHTML='<span class="fhx-num">'+n+'</span><span class="w"><b>Problem:</b> '+x[2]+'</span><div class="s"><b>Try:</b> '+x[3]+'</div>';
        var host=el.closest('.proofgrid')||el.closest('.srow')||el.closest('details')||el;
        if(host.tagName==='DETAILS')host.open=true;
        if(el.closest('.sticky')){el.insertAdjacentHTML('afterbegin','<span class="fhx-num">'+n+'</span>');return;}
        host.parentNode.insertBefore(note,host.nextSibling);
      });
    });
    /* number the marks top to bottom, in page order */
    [].slice.call(document.querySelectorAll('.fhx-num')).forEach(function(b,i){b.textContent=i+1;});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
</script>`;

const out = PREFIX + body + SUFFIX + TOOLKIT;
writeFileSync(join(here, "01-sales-reorg-draft.html"), wrapFragment(out));
console.log("built 01-sales-reorg-draft.html");

/* ---------- FIXED: every red-box fix written into the page ----------
   Chris, 2026-09-29: "FIX IT". Same new order, with the copy fixes applied.
   Rewritten words are marked green (the banner button hides the marks for a
   clean read). Facts come from the page and the repo only:
   · documents live in the client portal, each with a Download button
     (public/app/client-portal.html paintOwn)
   · first business included, each extra $15 (checkout widget, this file)
   · Gene's numbers are his own caption; the approvals deck's source file says
     only "Client Wins deck", so it is labelled "from Fundhub clients", nothing more */
const FIXES = [
  // Screen one
  ['<span class="eyebrow">For business owners going after maximum funding</span>',
   `<span class="eyebrow">${G("The Funding Roadmap · $297 · in your portal today")}</span>`],
  ["<h1>Your Credit File Could Be Worth $100K to $1M in Funding, and We'll Get You There.</h1>",
   `<h1>Your Credit File Could Be Worth $100K to $1M in Funding. ${G("See Exactly How Much, and the Steps to Get It.")}</h1>` +
   `\n      <p class="fhx-proofline">${G("<b>Gene</b> runs three LLCs. With the roadmap, he opened up about $420,000 in business funding over three years.")}</p>`],
  [/<p class="lede">We pull your credit with a soft inquiry\. 10 seconds later[^<]*<\/p>/,
   `<p class="lede">${G("<b>$297.</b> We soft-pull your credit, and about 10 seconds later five documents built from your own file are waiting in your portal.")} Yours to keep.</p>`],
  ["Show Me How Much I Qualify For", G("Get My $297 Funding Roadmap")],
  // Testimonials: the product behind each result (item 7). At push, add these
  // to marketing/testimonials/testimonials.json + build-slots.mjs, or the slot
  // rebuild drops them.
  ['<figcaption class="tcap"><b>Colin Schmidt, ran a funding company.</b>', `<figcaption class="tcap"><span class="fh-tprod">${G("$297 Funding Roadmap · reviewed it")}</span><b>Colin Schmidt, ran a funding company.</b>`],
  ['<figcaption class="tcap"><b>Gene, owner of three LLCs.</b>', `<figcaption class="tcap"><span class="fh-tprod">${G("The roadmap strategy · used it")}</span><b>Gene, owner of three LLCs.</b>`],
  [`<figcaption class="tcap"><b>Sarah, on Chris's sales team.</b>`, `<figcaption class="tcap"><span class="fh-tprod">${G("$297 Funding Roadmap · ran it")}</span><b>Sarah, on Chris's sales team.</b>`],
  [">From people who bought it<", `>${G("People who used the roadmap")}<`],
  ["<b>Colin Schmidt, ran a funding company.</b>", `<b>${G("Colin Schmidt ran a funding company and reviewed the roadmap.")}</b>`],
  ["<b>Gene, owner of three LLCs.</b> His scores started in the low 600s, the dispute letters moved him to 780 and then 810, and that opened up about $420,000 in business funding over three years.",
   `<b>Gene, owner of three LLCs.</b> ${G("About $420,000 in business funding over three years.")} His scores started in the low 600s, and the dispute letters moved him to 780 and then 810.`],
  // Credibility
  ['<span class="kicker">The Bridge</span>', `<span class="kicker">${G("Why this works")}</span>`],
  ["We Spent Thousands of Hours Building the System That Reads Your File the Way a Lender's Underwriter Does.",
   G("We Review Your File the Way a Lender Does.")],
  ["<p>UnderwriteIQ reads your credit file line by line", `<p>${G("Our software")} reads your credit file line by line`],
  ["run it through UnderwriteIQ, and the whole package is in your account in",
   `run it through ${G("our software")}, and the whole package is in your ${G("portal")} in`],
  // What You Get
  ["<div class=\"h2\">Here's What You Get.</div>",
   `<div class="h2">${G("Everything You Need to Get Funded, Built From Your Own Credit File.")}</div><div class="prose" style="margin-top:8px"><p>${G("Five documents, plus a")} <span class="fh-bonus">FREE BONUS</span></p></div>`],
  ["<span>outcome: sample</span><span>median: sample</span>", ""],
  ['<div class="cv-conf">fundhub confidential</div>', ""],
  ['<div class="cv-title">Capital Readiness Snapshot</div>', `<div class="cv-title">${G("How Much You Qualify For")}</div>`],
  // "Funding Snapshot" renamed on the page (Chris, 2026-09-29: it does not say what it is).
  // The portal and the document itself still print Funding Snapshot.
  ['<div class="t">Funding Snapshot</div>', `<div class="t">${G("How Much You Qualify For")}</div>`],
  ['<div class="cv-doc">funding snapshot</div>', '<div class="cv-doc">how much you qualify for</div>'],
  ['<li><b>Funding Snapshot</b>, how much you qualify for right now and how much once your file is optimized</li>', `<li><b>${G("How Much You Qualify For")}</b>${G(", today and once your file is optimized")}</li>`],
  // Same row inside the sample lightbox. The card itself is set in FIRST_WIN.
  ['<tr><td>funding gap</td>', `<tr><td>${G("value of the roadmap")}</td>`],
  ['<div class="cv-title">Financial Profile Assessment</div>', `<div class="cv-title">${G("Credit Analysis Report")}</div>`],
  ["<div class=\"cv-title\">Alex's 6-Month Business Readiness Roadmap</div>", `<div class="cv-title">${G("Alex's Credit Optimization Roadmap")}</div>`],
  ['<div class="cv-title">Capital Partner Shortlist</div>', `<div class="cv-title">${G("Bank &amp; Lender Match List")}</div>`],
  ["Your credit pulled from all three bureaus. Where your score sits today and where it can sit once your file is cleaned up. Every card with the exact balance to bring it down to. Every harmful item on there, named.",
   G("<b>Stop getting declined for reasons nobody told you.</b> Every item costing you money on all three bureaus, including inquiries and any name or address that doesn't match. Clean file? It shows that too.")],
  ["Every letter written for you with your accounts in it, to all three bureaus <b>and</b> directly to the creditors. <b>All six rounds</b>, round one dated and ready to mail. Print. Sign. Mail.",
   `${G("<b>Get the items costing you money taken off, without paying a credit repair company.</b>")} Every letter written for you with your accounts in it, to all three bureaus <b>and</b> directly to the creditors. <b>All six rounds</b>, round one dated and ready to mail. ${G("Each next round waits 30 days max.")} Print. Sign. Mail. ${G("Clean file? You still get the name, address and inquiry letters.")}`],
  ["How much we think you'll qualify for right now, and how much once your file is optimized. The distance between those two is what the rest of the package closes.",
   G("<b>Know what you can get before a bank ever sees your file.</b> How much you qualify for today, how much once your file is fixed, and what you are leaving on the table.")],
  ["The banks most likely to approve a file like yours where you live, the score floor on each one, and the order to apply in so you're not stacking declines.",
   G("<b>Apply only where you'll get approved, in an order that stacks approvals instead of declines.</b> The banks most likely to approve a file like yours where you live, and the score floor on each.")],
  // Owner-set 2026-09-29: inquiries DO cost fundability. The sample must not say they don't.
  ["+'<div class=\"sp-sec\"><div class=\"sp-h\">04 / what does not affect your funding</div><div class=\"sp-c\"><b>Inquiries.</b> Seven across the three bureaus. They do not affect funding decisions at Fundhub. Cleanup only.</div></div>'", ""],
  ['<div class="tab">08</div>', `<div class="tab">${G("07")}</div><div class="tab">08</div>`],
  // Owner-set 2026-09-29: never name the Social Security number before step 3 of checkout.
  [" &middot; SSN ending 3391", ""],
  ["Tap any cover for a sample page. Yours prints with your own data.",
   `Tap any cover for a sample page. ${G("Your five documents show up in your Fundhub client portal the moment the pull finishes. Open them there, and download or print any of them. Your first business is included; each extra business is $15.")}`],
  /* Good credit, still short (Chris, 2026-09-29: "what if somebody has an 800
     credit score"). Every line is a thing the documents or the engine do:
     · personal data cleanup, mismatched identity data can flag a file
       (src/deliverables/credit-analysis.mjs section 07)
     · business age changes the amount: 0.5x / 1x / 2x by age
       (src/underwrite/business-funding.mjs)
     · home state AND business state each open local banks (src/lenders/match.mjs)
     · every buyer, clean file or not, gets one name, one address, and a dispute
       of every inquiry with no matching open account (owner decision 2026-09-03,
       src/metro2/diy/personal-info-floor.mjs; letter types in letter-pack-filter.mjs)
     · business funding is summed across every company by age, up to 20 companies
       (stackedBusinessFunding, src/underwrite/business-funding.mjs)
     OWNER-SET 2026-09-29, final:
     · inquiries cost fundability; any more than zero should come off
     · unlimited funding over time is true: structure aged companies right, run
       five to ten of them; it takes time and each one needs revenue
     · the page must not read as a credit repair package, so proof leads with
       funding, not with the score climb
     · the business side is the Experian Business check: business credit scores,
       blemishes, business card balances, NAICS code flags, name flags, and the
       exact fixes so a lender sees a credible business. Experian Business only
       for now. No DUNS, no net-30, no vendor accounts ("that's not real"). The
       roadmap.mjs DUNS / net-30 steps are what UnderwriteIQ is changing. */
  ["What to do first, what comes after that, and when. Month by month, built off your own file. Some files take six months, some take one, and it tells you which on the first page.",
   `${G("<b>Reach your maximum funding fastest, with nothing to guess.</b>")} What to do first, what comes after that, and when. Month by month, built off your own file. Some files take six months, some take one, and it tells you which on the first page. ${G("Personal first, then your business.")}`],
  ["<li>Your credit is clean and you still <b>came back short</b>, or it <b>needs work</b> and you want the order to fix it in</li>",
   `<li>Your credit is clean and you still <b>came back short</b>, or it <b>needs work</b> and you want the order to fix it in</li>\n            <li>${G("Your score is <b>already high</b> and you want the <b>most your file and your business</b> can get")}</li>`],
  ["<details><summary>Will this hurt my credit score?</summary>",
   `<details><summary>${G("My score is already 800. Why would I need this?")}</summary><div class="a">${G("Because a great score isn't the same as a file banks approve for the most money. Most high-score files have gaps you can't see from the outside, and those gaps decide how much you get approved for. This finds yours, shows you how to close them, then sets you up for unlimited funding: a new company ready to fund every quarter.")}</div></details>\n        <details><summary>Will this hurt my credit score?</summary>`],
  /* Scrolling bar at the bottom (Chris, 2026-09-29: "add that rotating thing"
     from apply.fundhub.ai/watch, marketing/landing-pages/01-vsl.html). This page
     already carries the .fh-b .marq styles; only the markup was missing. Same
     place as /watch, right above the footer. The copy is the roadmap's own,
     each line true of the $297 package: soft tri-bureau pull, the five
     documents in the portal, the name/address/inquiry letters every buyer
     gets, state-matched lenders, every aged company counted, the 7-day refund,
     and "we never sell your data" (public/privacy/index.html). The /watch
     lines about funding rounds and a funding advisor are the done-for-you
     service, so they stay off this page. */
  ["<footer>", (() => {
    const items = [
      "Tri-bureau soft pull", "Soft inquiry · no score impact", "Experian Business flags checked", "Five documents built from your file",
      "In your portal in about 10 seconds", "Name, address and inquiry letters included",
      "Lenders matched to your state", "FREE BONUS: Business Duplication Map", "7-day refund", "We never sell your data",
    ];
    const set = `<div class="marq-set">${items.map((s) => `<span>${s}</span><i></i>`).join("")}</div>`;
    return `<div class="fhx-sec" data-tag="NEW · Scrolling bar, same as /watch, with roadmap copy">` +
      `<div class="marq" aria-hidden="true"><div class="marq-track" style="animation-duration:48s">${set}${set}</div></div></div><!--/fhx-sec-->\n  <footer>`;
  })()],
  /* The Business Duplication Map, a FREE BONUS (Chris, 2026-09-29: "add it to
     the funnel", then "the business map is a free bonus"). NOT BUILT YET. The row says only what Chris approved:
     each company's Experian Business check and fixes, what each can get now
     and when it passes 12 and 24 months (business-funding.mjs age steps),
     where and when to open the next company. No sample page exists, so the
     cover is not clickable and says so. */
  [/(\n\s*<\/div>\n\s*<!-- SLOT-SNEAK-PEEKS)/,
   `\n        <div class="srow"><span class="n">+</span><div class="txt"><div class="t"><span class="fh-bonus">FREE BONUS</span>${G("Business Duplication Map")}</div><div class="d">${G("<b>Keep getting funded after round one.</b> Your Experian Business check with the exact fixes, then a plan to open one to two new companies a quarter, set up right: a clean name, the right NAICS code, reporting from day one. So aged companies keep coming ready for funding.")}</div></div><a class="thumb" href="#" data-page="duplication" aria-label="Sample page"><div class="cover"><div class="cv-wm">fundhub.</div><div class="cv-kick">underwrite iq / client deliverable</div><div class="cv-doc">business duplication map</div><div class="cv-title">${G("Business Duplication Map")}</div><div class="cv-foot"><span>Alex Rivera</span><span>Sep 2026</span></div><div class="wm">CLICK HERE</div></div></a></div>$1`],
  ["<li><b>Bank &amp; Lender Match List</b>, the banks most likely to approve you where you live, and the order to apply</li>",
   `<li><b>Bank &amp; Lender Match List</b>, the banks most likely to approve you where you live, and the order to apply</li>\n          <li><b><span class="fh-bonus">FREE BONUS</span>${G("Business Duplication Map")}</b>${G(", how you go from one company to five or ten, each one funded")}</li>`],
  /* Samples (round 3). Each opens with why the buyer needs it and shows only
     what that document adds, so the Chase paydown and the funding numbers stop
     repeating. One disclaimer for every sample. No apostrophes in these: they
     sit inside single-quoted script strings. */
  ['<div class="lb-note">Sample file. Yours prints with your own data.</div>', `<div class="lb-note">${G("Sample file for a made-up client. Yours is built from your own credit file. Estimates, not an offer of credit.")}</div>`],
  [`analysis:'<div class="sp"><div class="sp-doc">Credit Analysis Report &middot; Alex Rivera</div>'`, `analysis:'<div class="sp"><div class="sp-doc">Credit Analysis Report &middot; Alex Rivera</div><div class="sp-why">${G("Why you need this: you stop getting declined for reasons nobody told you.")}</div>'`],
  [`roadmap:'<div class="sp"><div class="sp-doc">Credit Optimization Roadmap &middot; Alex Rivera</div>'`, `roadmap:'<div class="sp"><div class="sp-doc">Credit Optimization Roadmap &middot; Alex Rivera</div><div class="sp-why">${G("Why you need this: you reach your maximum funding fastest, with nothing to guess.")}</div>'`],
  [`snapshot:'<div class="sp"><div class="sp-doc">Funding Snapshot &middot; Alex Rivera</div>'`, `snapshot:'<div class="sp"><div class="sp-doc">How Much You Qualify For &middot; Alex Rivera</div><div class="sp-why">${G("Why you need this: you know what you can get before a bank ever sees your file.")}</div>'`],
  [`lenders:'<div class="sp"><div class="sp-doc">Bank &amp; Lender Match List &middot; Alex Rivera</div>'`, `lenders:'<div class="sp"><div class="sp-doc">Bank &amp; Lender Match List &middot; Alex Rivera</div><div class="sp-why">${G("Why you need this: you apply only where you will get approved, in the right order.")}</div>'`],
  [`round1:'<div class="sp"><div class="sp-doc">Dispute Letter Pack &middot; 03 Round 1 &middot; Experian</div>`, `round1:'<div class="sp"><div class="sp-doc">Dispute Letter Pack &middot; 03 Round 1 &middot; Experian</div><div class="sp-why">${G("Why you need this: the items costing you money come off, and no credit repair company gets paid to do it.")}</div><div class="sp-what">${G("What this letter does: asks Experian to fix or delete two items reported wrong on your file.")}</div>`],
  ['<td>Experian</td><td><i class="tg bad">DIRTY</i></td>', `<td>Experian</td><td><i class="tg bad">${G("DISPUTE 2")}</i></td>`],
  ['<td>TransUnion</td><td><i class="tg bad">DIRTY</i></td>', `<td>TransUnion</td><td><i class="tg bad">${G("DISPUTE 1")}</i></td>`],
  [/<table><tr><th>card<\/th><th>balance<\/th><th>limit<\/th><th>util<\/th><th>pay down to<\/th><th>status<\/th><\/tr>[\s\S]*?Target: under \$1,450 across all cards\.<\/div>/,
   `<table><tr><th>card</th><th>balance</th><th>limit</th><th>util</th><th>status</th></tr><tr><td>Chase Sapphire Preferred</td><td>$$4,120</td><td>$$5,000</td><td>82%</td><td><i class="tg bad">CRITICAL</i></td></tr><tr><td>Amex Blue Cash</td><td>$$1,980</td><td>$$6,000</td><td>33%</td><td><i class="tg warn">HIGH</i></td></tr><tr><td>Discover it</td><td>$$210</td><td>$$3,500</td><td>6%</td><td><i class="tg ok">${G("OK")}</i></td></tr></table><div class="sp-c">${G("Total revolving $$6,310 of $$14,500, 44% used. Your roadmap sets the paydown.")}</div>`],
  [/\+'<div class="sp-sec"><div class="sp-h">08 \/ the bottom line<\/div>[\s\S]*?never what a bank will hand over\.<\/div><\/div><\/div>',/, "+'</div>',"],
  [/\+'<div class="sp-sec"><div class="sp-h">07 \/ before and after<\/div>[\s\S]*?Individual results vary\.<\/div><\/div><\/div>',/, "+'</div>',"],
  [/\+'<div class="sp-sec"><div class="sp-h">03 \/ what is costing you money, in order<\/div>[\s\S]*?<\/ol><\/div>'/, ""],
  [/\+'<div class="sp-sec"><div class="sp-h">06 \/ your next step<\/div>[\s\S]*?Do not open new accounts before funding\.<\/div><\/div><\/div>',/,
   `+'<div class="sp-sec"><div class="sp-h">${G("what you are leaving on the table")}</div><div class="sp-c">${G("$$61,500 you are leaving on the table right now. The rest of the package is how you go get it.")}</div></div></div>',`],
  ["<li>Pay the Chase Sapphire down to $500 first.</li>", `<li>${G("Finish month one of your roadmap first.")}</li>`],
  ["Dispute Letter Pack &middot; 06 Complaints &middot; cover sheet", `Dispute Letter Pack &middot; ${G("06 Rounds 4 and 5")} &middot; complaints`],
  ["<tr><td>CFPB</td>", `<tr><td>${G("R4")} CFPB</td>`],
  ["<tr><td>State AG</td><td></td><td></td><td></td><td></td><td></td></tr></table>", `<tr><td>${G("R5")} State AG</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>${G("R6")}</td><td></td><td></td><td></td><td></td><td></td></tr></table>`],
  ["['complaints','06 Complaints'],['tracker','08 Tracker']", "['complaints','06 Rounds 4 and 5'],['final','07 Round 6'],['tracker','08 Tracker']"],
  [`tracker:'<div class="sp">`, `final:'<div class="sp"><div class="sp-doc">Dispute Letter Pack &middot; 07 Round 6 &middot; final notice</div><div class="warn">SEND THIS ONLY IF rounds 4 and 5 did not remove the item.</div><div class="sp-sec"><div class="sp-h">what round 6 is</div><div class="sp-c">The last letter to the bureau: a final notice, sent again after both complaints. Each round stands on stronger law than the one before it.</div></div></div>',
        duplication:'<div class="sp"><div class="sp-doc">Business Duplication Map &middot; Alex Rivera</div><div class="sp-why">${G("Why you need this: you keep getting funded after round one, one aged company after another.")}</div>'
          +'<div class="sp-sec"><div class="sp-h">your business today &middot; Rivera Supply LLC, Arizona, 14 months old</div><table><tr><th>Experian Business check</th><th>status</th><th>the fix</th></tr><tr><td>Business credit score</td><td><i class="tg ok">OK</i></td><td>Keep it reporting</td></tr><tr><td>Blemishes</td><td><i class="tg bad">1 COLLECTION</i></td><td>Settle it and have it updated</td></tr><tr><td>Business card balance</td><td><i class="tg warn">64% USED</i></td><td>Pay it down before you apply</td></tr><tr><td>NAICS code</td><td><i class="tg bad">FLAGGED</i></td><td>Use the code that matches what you sell</td></tr><tr><td>Business name</td><td><i class="tg warn">DOES NOT MATCH</i></td><td>One exact name everywhere</td></tr></table></div>'
          +'<div class="sp-sec"><div class="sp-h">what a company can get as it ages</div><table><tr><th>age</th><th>business funding</th></tr><tr><td>under 12 months</td><td>half your card funding</td></tr><tr><td>12 to 24 months</td><td>equal to your card funding</td></tr><tr><td>24 months and up</td><td><b>double your card funding</b></td></tr></table><div class="sp-c">Rivera Supply turns 24 months in July 2027. That is when its funding doubles.</div></div>'
          +'<div class="sp-sec"><div class="sp-h">your quarterly plan</div><table><tr><th>quarter</th><th>step</th></tr><tr><td>Q4 2026</td><td>Open company two, set up right: clean name, right NAICS code, reporting from day one</td></tr><tr><td>Q1 2027</td><td>Open company three the same way</td></tr><tr><td>Q3 2027</td><td>Rivera Supply passes 24 months</td></tr><tr><td>Q4 2027</td><td>Company two passes 12 months</td></tr></table><div class="sp-c">Keep opening one to two a quarter and aged companies keep coming ready for funding.</div></div></div>',
        tracker:'<div class="sp">`],
  [/<div class="sp-h">\d\d \/ /g, '<div class="sp-h">'],
  ["      function render(k,tab){", `      /* Show the top of each sample and glass the rest: the buyer sees enough to want it, not the whole thing. */
      function lock(){
        var sp=body.querySelector('.sp'); if(!sp||sp.querySelector('.sp-lock'))return;
        var first=sp.querySelector('.sp-sec,.letter,.kpis,.warn,table');
        var top=first?first.offsetTop+Math.min(first.offsetHeight,190):160;
        top=Math.min(top,sp.scrollHeight-170);
        var el=document.createElement('div'); el.className='sp-lock'; el.style.top=top+'px';
        el.innerHTML='<b>The rest is built from your own file.</b><span>Unlock yours for $297.</span><a class="btn sp-go" href="#fh-order">Get My $297 Funding Roadmap</a>';
        sp.appendChild(el);
      }
      function render(k,tab){`],
  [`body.innerHTML=html+'<div class="wm wm-lb">SAMPLE</div>'; return true;`, `body.innerHTML=html+'<div class="wm wm-lb">SAMPLE</div>'; requestAnimationFrame(lock); return true;`],
  [`if(e.target.closest&&(e.target.closest('.lb-x')||e.target.classList.contains('lb-bg')))close();`, `if(e.target.closest&&(e.target.closest('.lb-x')||e.target.closest('.sp-go')||e.target.classList.contains('lb-bg')))close();`],
  // What happens next: the buyer's part, with the time each step takes (item 5)
  [/(<div class="prose" style="margin-top:20px">\s*<p>Everything is yours to keep\. One payment, no contract\.<\/p>\s*<\/div>)/, `${CHECKLIST}$1`],
  // Footer (item 21)
  ['<div class="sysline"><span class="pulse"></span>systems nominal &middot; fundhub.ai</div>', ""],
  // Approvals carousel: the header adds up the cards seen so far; on the last card it matches the caption
  ['<span class="deck-total">Total<b id="fh-deck-total">', `<span class="deck-total">${G("Total so far")}<b id="fh-deck-total">`],
  ["real credit card and line of credit approvals.</p>", `real credit card and line of credit approvals ${G("from Fundhub clients")}.</p>`],
  // What happens after you buy
  [/<div class="srow"><span class="n">01<\/span><div><div class="t">You Fill Out the Form[\s\S]*?Run it yourself\. <\/div><\/div><\/div>/,
   [
     ["01", "Your Info", "First name, last name, email, phone."],
     ["02", "Pay $297 by Card", "One payment, no contract."],
     ["03", "Soft Pull", "We pull your credit with a soft inquiry, so your score doesn't move."],
     ["04", "Your Five Documents", "About ten seconds later they're in your portal. How much you qualify for now, how much once your file is optimized, and every step between. You work it at your own pace."],
   ].map(([n, t, d]) => `<div class="srow"><span class="n">${n}</span><div><div class="t">${G(t)}</div><div class="d">${G(d)}</div></div></div>`).join("\n        ")],
  // Who it's for
  [/<div class="prose" style="margin-top:10px">\s*<p>Every day you wait[^<]*<\/p>\s*<\/div>/, ""],
  // Guarantee: one place, and it says how
  ["<p>If you're not happy with what you get, <b>we'll refund you.</b> Just email us within 7 days.</p>",
   `<p>${G("If you're not happy with what you get, email support@fundhub.ai within 7 days and <b>you get the full $297 back.</b>")}</p>`],
  [/<div class="cardw">\s*<span class="kicker">The Guarantee<\/span>\s*<p>If you're not happy with what you get, <b>email us within 7 days and we'll refund you\.<\/b><\/p>\s*<\/div>/, ""],
  // FAQ
  [/(How do I know this is legit\?<\/summary><div class="a">)[\s\S]*?(<\/div><\/details>)/,
   `$1${G("Gene runs three LLCs and opened up about $$420,000 in business funding with the roadmap. Colin Schmidt, who ran a funding company, reviewed the roadmap and wouldn't change a thing. You can call us at (561) 304-8368 before you buy. And if you're not happy, email us within 7 days for a full refund.")}$2`],
  [BROKER_BODY, G("A broker hands you a list of banks. This reads your own file first, fixes what's hurting it, and gives you the order to apply in so the declines don't stack.")],
  ["This package is you mailing your own letters and following the steps, which means you hold every receipt and see every response.",
   G("No. This is do-it-yourself. You mail your own letters, so you hold every receipt and see every reply. If you want help later, every document ends with a button to book a call with our team.")],
  ["About ten seconds after the form.", G("About ten seconds after the soft pull finishes.")],
  // Checkout
  ["How Much Is Your File Worth? Find Out in Ten Seconds.", G("Get Your Funding Roadmap · $297")],
  ["where your score sits today and where it can sit once your file is cleaned up</li>", `${G("what's hurting your file, item by item, on all three bureaus")}</li>`],
  [/(<\/ul>)(?=\s*<div class="tot">)/,
   `$1\n        <p class="fhx-sumnote">${G("Your first business is included. Each extra business is $$15, added at the soft-pull step.")}</p>`],
];

let fixed = PREFIX + body + SUFFIX;
for (const [from, to] of FIXES) {
  const hit = typeof from === "string" ? fixed.includes(from) : from.test(fixed);
  if (!hit) throw new Error(`fix did not match: ${String(from).slice(0, 80)}`);
  fixed = typeof from === "string" ? fixed.split(from).join(to) : fixed.replace(from, to);
}
fixed = fixed.replace(' data-fhx-new><summary>', '><summary>').replace("<details open><summary>How is this different from paying a broker", "<details><summary>How is this different from paying a broker");

/* Phone carousel for the testimonials (Chris, 2026-09-29: "rotate in a
   carousel instead" of stacking). WENT LIVE 2026-09-29 (Chris: "push live"),
   so it sits above --live and ships with the live page. */
{
  const { ROADMAP_CSS, ROADMAP_JS } = await import("./testi-carousel.mjs");
  const oldTag = 'data-tag="2 · Video testimonials · each tagged with the product behind it"';
  if (!fixed.includes(oldTag)) throw new Error("testimonials tag not found");
  fixed = fixed.replace(oldTag, 'data-tag="2 · Video testimonials · NEW on phones: one row that slides sideways as you scroll, same as the /watch approvals"');
  fixed += `\n<style>${ROADMAP_CSS}\n</style>\n<script>${ROADMAP_JS}\n</script>\n`;
}

/* ---------- --live: the same page with every draft mark stripped ----------
   Blue boxes, green marks and the banner are for review only. Everything else
   is the page as it goes live: real videos, the real checkout, tracking. */
if (process.argv.includes("--live")) {
  let live = fixed
    .replace(/<div class="fhx-sec" data-tag="[^"]*">/g, "")
    .replace(/<\/div><!--\/fhx-sec-->/g, "")
    .replace(/<span class="fhx-new">([\s\S]*?)<\/span>/g, (_, inner) => inner)
    .replaceAll("fhx-testi", "fh-testi-top")
    .replaceAll("fhx-proofline", "fh-proofline")
    .replaceAll("fhx-sumnote", "fh-sumnote");
  const left = live.match(/.{0,40}fhx-.{0,40}/);
  if (left) throw new Error(`draft markup left in the live page: ${left[0]}`);
  live += `
<style>
/* Roadmap reorder, 2026-09-29 — built by marketing/landing-pages/slo/preview/reorg-draft-build.mjs */
.fh-root .fh-b.fh-testi-top{background:transparent}
.fh-root .deck-runway > .slimrow{grid-template-columns:minmax(0,520px) !important;grid-template-areas:"comm" !important;justify-content:center}
.fh-root .fh-proofline{max-width:560px;margin:12px auto 0;font-size:15px;line-height:1.5;text-align:center;color:#3F3F46}
.fh-root .fh-sumnote{margin-top:10px;font-size:13px;color:#52525B}
${NEW_CSS}
</style>
`;
  if (!existsSync(FROZEN)) writeFileSync(FROZEN, s);
  writeFileSync(LIVE_FILE, live);
  console.log("wrote the live fragment ../slo-01-sales.html");
}

fixed += `
<style>
.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;background:#0B5D1E;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 16px}
.fhx-banner button{font:600 12px system-ui,sans-serif;background:#fff;color:#0B5D1E;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}
.fhx-banner button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.fh-root{padding-top:48px}
.fh-b.fhx-testi{background:transparent}
.fh-root .deck-runway > .slimrow{grid-template-columns:minmax(0,520px) !important;grid-template-areas:"comm" !important;justify-content:center}
.fhx-new{background:rgba(22,163,74,.18);box-shadow:0 0 0 2px rgba(22,163,74,.28);border-radius:3px}
.btn .fhx-new{background:transparent;box-shadow:0 0 0 2px #22C55E}
.fhx-proofline{max-width:560px;margin:12px auto 0;font-size:15px;line-height:1.5;text-align:center;color:#3F3F46}
.fhx-sumnote{margin-top:10px;font-size:13px;color:#52525B}
${NEW_CSS}
.fhx-sec{position:relative;outline:2px dashed #2F6FEB;outline-offset:6px;margin:34px 0}
.fhx-sec::before{content:attr(data-tag);display:block;font:700 11px/1.3 system-ui,sans-serif;color:#fff;background:#2F6FEB;padding:5px 9px;border-radius:4px;margin-bottom:10px;width:max-content;max-width:100%}
html.fhx-clean .fhx-new{background:none;box-shadow:none}
html.fhx-clean .fhx-sec{outline:0;margin:0}
html.fhx-clean .fhx-sec::before{display:none}
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Green = rewritten copy · Blue boxes = new section order</span><button type="button" id="fhx-toggle">Hide the marks</button></div>
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
writeFileSync(join(here, "01-sales-reorg-fixed.html"), wrapFragment(fixed));
console.log("built 01-sales-reorg-fixed.html");

/* ---------- --share: one self-contained page Chris can send as a link ----------
   A shared page can load nothing from fundhub.ai or ClickFunnels, so every
   picture is shrunk and baked in. The videos are too big to bake in (the VSL
   is 57 MB), so each one shows its cover picture. The checkout form is left
   out: it is a real card and Social Security form, and a shared copy must not
   be able to send anything. */
if (process.argv.includes("--share")) {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "fh-share-"));
  let share = fixed;
  const cut0 = share.indexOf("<!-- ================= SPLIT-LINE");
  const cut1 = share.indexOf("<!-- SLOT-UTM");
  share = share.slice(0, cut0) +
    `<div class="fhx-checkout"><b>Checkout form sits here on the live page</b>` +
    `<span>Step 1 · Info (first, last, email, phone) &nbsp;→&nbsp; Step 2 · Card ($297) &nbsp;→&nbsp; Step 3 · Soft pull</span>` +
    `<i>Left out of this shared copy so nothing here can take a card or personal details.</i></div>\n` +
    share.slice(cut1);
  share = share.replace(/<script src="https:\/\/fundhub\.ai\/funnel\/fh-attribution\.js"><\/script>/, "");
  share = share.replace(/(<video[^>]*?)\s+src="https:\/\/fundhub\.ai\/funnel\/[^"]+\.mp4"/g, "$1");
  share = share.replace("Tap for sound", "Video plays on the live page");
  share = share.replace(/(<span class="tplay-pill">[\s\S]*?<\/svg>)\s*Play/g, "$1 Plays on the live page");

  const urls = [...new Set(share.match(/https:\/\/(?:statics\.myclickfunnels\.com|fundhub\.ai\/funnel)\/[^"')\s]+\.jpg/g))];
  for (const [i, u] of urls.entries()) {
    const f = join(tmp, `${i}.jpg`);
    const res = await fetch(u);
    if (!res.ok) throw new Error(`${res.status} ${u}`);
    writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    execFileSync("sips", ["-Z", "900", "-s", "format", "jpeg", "-s", "formatOptions", "72", f, "--out", f], { stdio: "ignore" });
    share = share.split(u).join("data:image/jpeg;base64," + readFileSync(f).toString("base64"));
  }

  const head = `<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roadmap Page Redraft</title>
<style>
body{background:#FCFCFC;color:#111113}
.fhx-checkout{max-width:720px;margin:24px auto;padding:18px 20px;border:2px dashed #2F6FEB;border-radius:10px;background:#F3F7FF;color:#111113;font:14px/1.5 system-ui,sans-serif;display:grid;gap:6px}
.fhx-checkout i{color:#555}
.fhx-banner{padding-top:calc(10px + env(safe-area-inset-top, 0px))}
</style>
`;
  writeFileSync(join(here, "01-sales-reorg-share.html"), head + share);
  console.log(`built 01-sales-reorg-share.html (${urls.length} pictures baked in)`);
}
