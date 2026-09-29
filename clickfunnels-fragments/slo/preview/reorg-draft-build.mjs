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
 * Nothing here is pushed. The output is a local preview file only.
 *
 * Run:  node clickfunnels-fragments/slo/preview/reorg-draft-build.mjs
 * Out:  clickfunnels-fragments/slo/preview/01-sales-reorg-draft.html
 * Add --share to also build 01-sales-reorg-share.html, a self-contained copy to publish as a link.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapFragment } from "../../harness/_shell.js";

const here = dirname(fileURLToPath(import.meta.url));
const s = readFileSync(join(here, "..", "slo-01-sales.html"), "utf8");

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

/* Approvals deck opens on the biggest wins: reverse the card order. */
const cStart = DECK.indexOf("<!-- FH-DECK-CARDS:START -->") + "<!-- FH-DECK-CARDS:START -->".length;
const cEnd = DECK.indexOf("<!-- FH-DECK-CARDS:END -->");
const cards = DECK.slice(cStart, cEnd).match(/<article[\s\S]*?<\/article>/g);
DECK = DECK.slice(0, cStart) + "\n" + cards.reverse().join("\n") + "\n" + DECK.slice(cEnd);
DECK = DECK.replace("smallest to biggest", "biggest first");
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
const tag = (n, label, html) => `\n<div class="fhx-sec" data-tag="${n} · ${label}">\n${html}\n</div>\n`;
const body =
  tag(1, "Screen one · unchanged position", HERO) +
  tag(2, "Video testimonials · MOVED UP from below the checkout", `<div class="fh-b fhx-testi">${TESTIMONIALS}</div>`) +
  tag(3, "Credibility · was The Bridge; the repeat Proof paragraph is removed", BRIDGE) +
  tag(4, "What You Get · Funding Snapshot moved to first; Why $297 moved into the FAQ; mini course, advisors, community hidden", wygHead + "</section>\n" + LIGHTBOX) +
  tag(5, "Approvals carousel · split out of What You Get; now opens on the biggest win", `<section class="sect"><span class="kicker">Approvals</span>${DECK}</section>\n${DECK_JS}`) +
  tag(6, "What happens after you buy · MOVED UP", NEXT) +
  tag(7, "Who it's for · industry pills moved here", QUAL.replace(/<\/section>\s*$/, `${INDS}\n    </section>\n`)) +
  tag(8, "Guarantee · its own section now", `<section class="sect">${GUARANTEE_CARD}${GET_BTN}</section>`) +
  tag(9, "FAQ · broker answer added from The Pain", FAQ2) +
  tag(10, "Checkout · order summary in the same order as What You Get", CHECKOUT2);

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
  [".srow .t", "You Fill Out the Form", "Says the form takes about ten seconds. It is really three steps: your info, card, then a soft pull that asks for your Social Security number. The card step is missing.", "01 Your info · 02 Pay $297 by card · 03 Soft pull: name, date of birth, Social Security number, address · 04 Your five documents, about 10 seconds later. Time the real form and put that number in."],
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
  let share = out;
  const cut0 = share.indexOf("<!-- ================= SPLIT-LINE");
  const cut1 = share.indexOf("<!-- SLOT-UTM");
  share = share.slice(0, cut0) +
    `<div class="fhx-checkout"><b>Checkout form sits here on the live page</b>` +
    `<span>Step 1 · Info (first, last, email, phone) &nbsp;→&nbsp; Step 2 · Card ($297) &nbsp;→&nbsp; Step 3 · Soft pull (legal name, date of birth, Social Security number, address, businesses)</span>` +
    `<i>Left out of this shared copy so nothing here can take a card or a Social Security number.</i></div>\n` +
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

  const head = `<title>Roadmap Page Redraft</title>
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
