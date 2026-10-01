/* Roadmap page — new headline and subheadline, marked DRAFT.
 *
 * Chris, 2026-10-01: "Ill Show you how to get funding forever! You need anyone
 * to fund you ever again (headline / subheadline)" — for /roadmap.
 * "You need anyone" is read as "You'll never need anyone".
 *
 * Chris, 2026-10-01: "Headline / Subheadline / VSL / How it Works /
 * Testimonials / FAQ" then "only shit should be on the funnel plus checkout".
 * How it Works is a NEW section (Chris: "how it works isnt what happens next");
 * What Happens Next is cut with every other unnamed section,
 * and so are the Gene line and the $297 line under the headline. Checkout stays last.
 *
 * Reads the live fragment (../slo-01-sales.html) WITHOUT changing it. The old
 * headline stays on the draft in red, crossed out; the new headline and the new
 * subheadline are green. The banner button hides the marks for a clean read.
 *
 * Run:  node clickfunnels-fragments/slo/preview/roadmap-headline-draft-build.mjs [--share] [--live]
 * Out:  01-sales-headline-draft.html  the draft in the CF harness
 *       --share  01-sales-headline-share.html, clean, self-contained, for the shared link
 *       --live   ../slo-01-sales.html, clean, ready for the ClickFunnels push
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapFragment } from "../../harness/_shell.js";

const here = dirname(fileURLToPath(import.meta.url));
const LIVE_FILE = join(here, "..", "slo-01-sales.html");
const s = readFileSync(LIVE_FILE, "utf8");

const OLD_H1 = "<h1>Your Credit File Could Be Worth $100K to $1M in Funding. See Exactly How Much, and the Steps to Get It.</h1>";
const NEW_H1 = "I'll Show You How to Get Funding Forever!";
const NEW_SUB = "You'll never need anyone to fund you again.";
if (!s.includes(OLD_H1)) throw new Error("live headline not found; the page changed since this script was written");

const SUB_CSS = `.fh-root .fh-gap{color:#DC2626;font-weight:700}
.fh-root .hero .fh-subhead{margin:14px auto 0;font-size:clamp(18px,2.4vw,22px);font-weight:600;line-height:1.3;color:var(--ink,#111113);max-width:36ch}`;

/* ---------- the new order ---------- */
function at(page, marker) {
  const i = page.indexOf(marker);
  if (i < 0) throw new Error(`marker not found: ${marker.slice(0, 60)}`);
  return i;
}
const M = {
  hero: "<!-- SECTION 1: ABOVE THE FOLD -->",
  testi: '<div class="fh-b fh-testi-top">',
  wyg: "<!-- SECTION 4: WHAT YOU GET -->",
  firstwin: '<section class="sect">\n      <span class="kicker">Your fastest first win</span>',
  goodcredit: '<section class="sect">\n      <span class="kicker">Already have good credit?</span>',
  bridge: "<!-- SECTION 3: THE BRIDGE -->",
  approvals: '<section class="sect"><span class="kicker">Approvals</span>',
  how: "<!-- SECTION 7: WHAT HAPPENS NEXT -->",
  qual: "<!-- SECTION 6: QUALIFICATION -->",
  guar: '<section class="sect"><div class="cardw">\n        <span class="kicker">The Guarantee</span>',
  faq: "<!-- SECTION 8: FAQ -->",
  checkout: "<!-- SECTION 9: CHECKOUT (embedded) -->",
};
const NOW = ["hero", "testi", "wyg", "firstwin", "goodcredit", "bridge", "approvals", "how", "qual", "guar", "faq", "checkout"];
/* Chris, 2026-10-01: "Headline / Subheadline / VSL / How it Works / Testimonials /
   FAQ, only shit should be on the funnel plus checkout". Everything else is cut.
   The approvals deck is cut too: an approval is not a testimonial
   (.claude/rules/proof-cards-from-source.md). */
const NEW = [
  ["hero", "1 · Headline, subheadline, VSL"],
  ["howNew", "2 · How it Works · NEW"],
  ["testi", "3 · Testimonials · was 2nd"],
  ["faq", "4 · FAQ"],
];
const CUT = ["wyg", "firstwin", "goodcredit", "bridge", "approvals", "how", "qual", "guar"];
const CUT_NAMES = "What You Get · Your fastest first win · Already have good credit? · Why this works · Approvals · What Happens Next · Who this is for · The guarantee";

/* How it Works, NEW. Chris, 2026-10-01: "how it works isnt what happens next".
   How the roadmap gets you funded, then funded again. Every fact is from the
   What You Get rows on the live page (documents 01-05 and the bonus map).
   Chris, 2026-10-01: "its not just paying cards down its, optimzing you
   business file, and aged corporations if needed" — steps 3 and 5. */
/* Copy pass, Chris 2026-10-01, after The Architecture of Persuasion (Masterson):
   every block is tied to one golden thread, the two feelings Chris named:
   "independence and also no longer leaving money on the table". Grade 5 or
   lower. Voice is I / you, as in the locked $297 ads (FundHub-LOCKED-ADS.md
   house rules). Each step opens on the outcome in bold, then the facts. */
const HOW_H2 = "Get Every Dollar Your File Can Get. Then Do It Again, On Your Own.";
/* Chris's own five steps, pasted 2026-10-01 ("Credit and Business Funding
   Optimization Process"): 1 credit check + what you pre-qualify for now, even on
   perfect credit; 2 the gap, $100,000 to $300,000, the dollar amounts in red
   highlighter (Chris: "The dollar amounts in red (like red highlighter)", not "the gap"), every item
   costing money on all three bureaus; 3 business: liens, derogatory marks, high
   card balances, score, name, address, plus a website for credibility; 4 apply
   in the right order; 5 prime more business entities, the conveyor belt.
   "Typically" is written "on a lot of files" (locked-ads house rule). */
/* Chris, 2026-10-01, final order and step names: 1 See what you qualify for
   today; 2 Find the gap and optimize your personal credit; 3 Build the trust in
   the business; 4 Set up the businesses (more than one, so you apply for all of
   them); 5 Apply in the right order. "Put all the data back": every fact from
   the earlier versions of this section is kept (cards, letters, 30-day rounds,
   Experian Business, NAICS, one to two companies a quarter, stacking approvals).
   "Run each one through steps 1 to 3" cut: Chris, "it sounds really goofy". */
const HOW_STEPS = [
  // The 13 (beyond removing negatives and inquiries). Personal 6, in code:
  // src/underwrite/vendor/suggestions.cjs (card paydown, $5,000+ primary card,
  // thin-file depth, LLC seasoning, lender order) and credit-analysis.mjs
  // section 07 (personal info). Business 7, owner-set 2026-10-01 ahead of the
  // product: NAICS, liens, business card balances, business name, business
  // address, business score, website.
  ["See what you qualify for today", "Know what you can get before a bank ever sees your file.", `I pull your credit with a soft pull. Your roadmap shows up in your portal. It shows what you qualify for right now. Even with perfect credit, your roadmap reveals the 13 hidden data points that transform a decent file into one that can secure an additional <span class="fh-gap">$100,000+</span> in low-interest funding.`],
  ["Find the gap and optimize your personal credit", "Stop losing money to items nobody told you about.", `The gap is the money you are leaving on the table. You could be leaving <span class="fh-gap">$100,000 to $300,000</span> in fundability by not optimizing these 13 hidden data points. It costs you money, time and opportunity. Your roadmap shows every item costing you money on all three bureaus: inquiries, names and addresses that don't match, and your business info. Follow the roadmap, send the optimization letters, and maximize your fundability.`],
  // Owner-set 2026-10-01: this line stays ahead of the product (liens, NAICS,
  // name and address are not checked in code yet); the product gets fixed to match.
  ["Build the trust in the business", "Lenders fund businesses that look solid.", "I check your Experian Business report for liens, bad marks, high card balances, your score, your name, your address and your NAICS code. You get the exact fix for each error I find, website included, so lenders trust you and send money to your bank account."],
  ["Set up the businesses", "Never need anyone to fund you again.", "Your roadmap shows you how to open and set up a business the right way, with all the right data points in place. So lenders approve you instead of asking for income verification or other documents you may not have. You can repeat this process, funding company after company after company."],
  ["Apply in the right order", "Get approved, not declined.", "Your list shows the banks that approve files like yours. Apply in that order for every business you set up to stack approvals and maximize your fundability across multiple businesses indefinitely."],
];
function howSection(g) {
  const rows = HOW_STEPS.map(([t, lead, d], i) =>
    `        <div class="srow"><span class="n">0${i + 1}</span><div><div class="t">${g(t)}</div><div class="d">${g(`<b>${lead}</b> ${d}`)}</div></div></div>`).join("\n");
  return `<!-- HOW IT WORKS (2026-10-01) -->
    <section class="sect">
      <span class="kicker">${g("How It Works")}</span>
      <div class="h2">${g(HOW_H2)}</div>
      <div class="rows">
${rows}
      </div>
      <a class="btn" href="#fh-order">Get My $297 Funding Roadmap</a>
    </section>
`;
}

/* Testimonial captions and FAQ, same copy pass. Facts unchanged: captions keep
   only what content/testimonials/testimonials.json says; FAQ answers keep only
   what the live FAQ says. AT PUSH: the captions are generated from
   testimonials.json by scripts/testimonials/build-slots.mjs, so put the new
   captions there too, or the next slot rebuild undoes them. */
const COPY = [
  ["<b>Colin Schmidt ran a funding company and reviewed the roadmap.</b> He says he doesn't endorse people in this industry, but he went through the roadmap and would not change a thing in it.",
   "<b>Colin Schmidt ran a funding company.</b> He says he does not praise people in this business. He went through the roadmap and would not change one thing."],
  ["<b>Gene, owner of three LLCs.</b> About $420,000 in business funding over three years. His scores started in the low 600s, and the dispute letters moved him to 780 and then 810.",
   "<b>Gene owns three LLCs.</b> He got about $420,000 in business funding over three years. His scores went from the low 600s to 810."],
  ["<b>Sarah, on Chris's sales team.</b> Her credit was in bad shape, so she ran the roadmap, pinpointed exactly what to fix, and is set to be approved for around $80,000.",
   "<b>Sarah is on my sales team.</b> Her credit was in bad shape. She ran the roadmap, saw exactly what to fix, and is set to be approved for about $80,000."],
];
const FAQ = [
  // Chris, 2026-10-01: "fix this" on the FAQ. Same voice as How It Works:
  // certain, grade 5, the 13 hidden data points, never needing anyone again.
  ["My score is already 800. Why would I need this?", "My score is already 800. Why do I need this?",
   "A high score is not the same as a file set up for max funding. Even an 800 file has hidden data points that cap how much you get. Your roadmap finds all 13 and gives you the fix for each one. Then you repeat it with every company you open. That is unlimited funding over time."],
  ["Will this hurt my credit score?", "Will this hurt my credit score?",
   "No. I pull your credit with a soft pull. It won't hurt your score."],
  ["How do I know this is legit?", "How do I know this is real?",
   "Gene owns three LLCs. He got about $420,000 in business funding with the roadmap. Colin Schmidt ran a funding company. He went through the roadmap and would not change a thing. You can call us at (561) 304-8368 before you buy. Not happy? Email us within 7 days for a full refund."],
  ["How is this different from a funding course?", "How is this different from a funding course?",
   "A course charges $5,000 to $10,000 to teach you, and you still have to find the answers yourself. Your roadmap is built from your own file. Every letter is written. Every step is in order."],
  ["How is this different from paying a broker?", "How is this different from paying a broker?",
   "A broker hands you a list of banks. Your roadmap reads your file first, gives you the exact fixes, and lists the banks that approve files like yours, in order. After that, you never need a broker again."],
  ["What if my file needs a lot of work?", "What if my file needs a lot of work?",
   "Your roadmap tells you exactly what to fix and how long it takes. Some files need six months of letters. Some just need two cards paid down. You'll know the day you open it."],
  ["Can you do the work for me?", "Can you do the work for me?",
   "No. You do it yourself, so you stay in control. You mail your own letters, so you keep every receipt and see every reply. If you want help later, every document has a button to book a call with my team."],
  ["Can't I just apply on my own?", "Can't I just apply on my own?",
   "You can. But if you apply in the wrong order, on a file nobody read, each decline makes the next one harder. Your roadmap shows you what to fix first and which banks to go to."],
  ["How fast do I get it?", "How fast do I get it?",
   "About 10 seconds after the soft pull. It shows up in your portal."],
];
function applyCopy(page, g) {
  for (const [from, to] of COPY) {
    if (!page.includes(from)) throw new Error(`caption not found: ${from.slice(0, 60)}`);
    page = page.replace(from, g(to));
  }
  for (const [q, nq, a] of FAQ) {
    const re = new RegExp(`<details><summary>${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</summary><div class="a">[\\s\\S]*?</div></details>`);
    if (!re.test(page)) throw new Error(`faq not found: ${q}`);
    page = page.replace(re, () => `<details><summary>${nq === q ? nq : g(nq)}</summary><div class="a">${g(a)}</div></details>`);
  }
  return page;
}

const HERO_CUT = [
  '<p class="fh-proofline"><b>Gene</b> runs three LLCs. With the roadmap, he opened up about $420,000 in business funding over three years.</p>',
  '<p class="lede"><b>$297.</b> We soft-pull your credit, and about 10 seconds later five documents built from your own file are waiting in your portal. Yours to keep.</p>',
];
function reorder(page, mark, g) {
  const idx = NOW.map((k) => at(page, M[k]));
  for (let i = 1; i < idx.length; i++) if (idx[i] <= idx[i - 1]) throw new Error(`blocks out of order at ${NOW[i]}`);
  const block = {};
  NOW.forEach((k, i) => { if (k !== "checkout") block[k] = page.slice(idx[i], idx[i + 1]); });
  const head = page.slice(0, idx[0]);
  const tail = page.slice(idx[NOW.length - 1]);
  for (const line of HERO_CUT) {
    if (!block.hero.includes(line)) throw new Error(`hero line not found: ${line.slice(0, 60)}`);
    block.hero = block.hero.replace(line, mark ? `<p class="fhx-old fhx-cutline">${line.replace(/<\/?p[^>]*>/g, "")}</p>` : "");
  }
  block.howNew = howSection(g);
  if (NEW.length - 1 + CUT.length !== NOW.length - 1) throw new Error("a block is neither kept nor cut");
  let body = NEW.map(([k, tag]) => (mark ? `<div class="fhx-sec" data-tag="${tag}">\n${block[k]}</div><!--/fhx-sec-->\n` : block[k])).join("");
  if (mark) body += `<div class="fhx-cutbox"><b>CUT from the page</b><span>${CUT_NAMES}</span></div>\n`;
  return head + body + tail;
}

const G = (t) => `<span class="fhx-new">${t}</span>`;
const PLAIN = (t) => t;
const CLEAN_HEAD = `<h1>${NEW_H1}</h1>\n      <p class="fh-subhead">${NEW_SUB}</p>`;
let live = reorder(applyCopy(s.replace(OLD_H1, CLEAN_HEAD), PLAIN), false, PLAIN);
live += `\n<style>\n/* New headline, 2026-10-01 — built by clickfunnels-fragments/slo/preview/roadmap-headline-draft-build.mjs */\n${SUB_CSS}\n</style>\n`;
if (process.argv.includes("--live")) {
  writeFileSync(LIVE_FILE, live);
  console.log("wrote the live fragment ../slo-01-sales.html");
  process.exit(0);
}

let draft = reorder(applyCopy(s.replace(OLD_H1,
  `<p class="fhx-old">${OLD_H1.replace(/<\/?h1>/g, "")}</p>\n` +
  `      <h1>${G(NEW_H1)}</h1>\n      <p class="fh-subhead">${G(NEW_SUB)}</p>`), G), true, G);

draft += `
<style>
${SUB_CSS}
.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;background:#0B5D1E;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 16px}
.fhx-banner button{font:600 12px system-ui,sans-serif;background:#fff;color:#0B5D1E;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}
.fhx-banner button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.fh-root{padding-top:48px}
.fhx-new{background:rgba(22,163,74,.18);box-shadow:0 0 0 2px rgba(22,163,74,.28);border-radius:3px}
.fhx-old{max-width:34ch;margin:18px auto 0;padding:8px 12px;border:2px solid #DC2626;border-radius:6px;color:#B42318;background:#FEF2F2;text-decoration:line-through;font:600 16px/1.35 system-ui,sans-serif}
.fhx-old::before{content:"OLD HEADLINE";display:block;text-decoration:none;font:700 10px/1.4 system-ui,sans-serif;letter-spacing:.12em;color:#DC2626;margin-bottom:4px}
html.fhx-clean .fhx-new{background:none;box-shadow:none}
html.fhx-clean .fhx-old{display:none}
.fhx-sec{position:relative;outline:2px dashed #2F6FEB;outline-offset:6px;margin:34px 0}
.fhx-sec::before{content:attr(data-tag);display:block;font:700 11px/1.3 system-ui,sans-serif;color:#fff;background:#2F6FEB;padding:5px 9px;border-radius:4px;margin-bottom:10px;width:max-content;max-width:100%}
html.fhx-clean .fhx-sec{outline:0;margin:0}
.fhx-cutline::before{content:"CUT"}
.fhx-cutbox{max-width:660px;margin:34px auto 0;padding:14px 18px;border:2px solid #DC2626;border-radius:8px;background:#FEF2F2;color:#B42318;font:14px/1.5 system-ui,sans-serif;display:grid;gap:4px}
html.fhx-clean .fhx-cutbox{display:none}
html.fhx-clean .fhx-sec::before{display:none}
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Red = old headline · Green = new headline · Blue boxes = new order · Red = cut</span><button type="button" id="fhx-toggle">Hide the marks</button></div>
<script>
(function(){
  var b=document.getElementById('fhx-toggle');if(!b)return;
  var bar=b.parentNode,root=document.querySelector('.fh-root');
  function fit(){if(root)root.style.paddingTop=bar.offsetHeight+'px';}
  fit();window.addEventListener('resize',fit);
  b.addEventListener('click',function(){var on=document.documentElement.classList.toggle('fhx-clean');b.textContent=on?'Show the marks':'Hide the marks';});
})();
</script>`;
writeFileSync(join(here, "01-sales-headline-draft.html"), wrapFragment(draft));
console.log("built 01-sales-headline-draft.html");

/* --share: same rules as reorg-draft-build.mjs. Pictures baked in, videos show
   their cover, the checkout form is left out so the shared copy cannot take a
   card or personal details. */
if (process.argv.includes("--share")) {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "fh-share-"));
  /* Chris, 2026-10-01: "fix the artifact, and then put the checkout back".
     The shared copy is the clean page (no marks) with the real checkout form
     showing. Its scripts are stripped and every form refuses to submit, so the
     shared copy looks like the live checkout but cannot send anything.
     Chris: "put it how it was originally": step one only, as on the live page. */
  /* Copy pass round: the page reads clean, only the rewritten words are green,
     and the button at the top hides them. */
  let share = reorder(applyCopy(s.replace(OLD_H1, CLEAN_HEAD), G), false, G);
  share += `\n<style>\n${SUB_CSS}\n.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;background:#0B5D1E;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 16px}
.fhx-banner button{font:600 12px system-ui,sans-serif;background:#fff;color:#0B5D1E;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}
.fh-root{padding-top:48px}
.fhx-new{background:rgba(22,163,74,.18);box-shadow:0 0 0 2px rgba(22,163,74,.28);border-radius:3px}
html.fhx-clean .fhx-new{background:none;box-shadow:none}
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Green = new copy</span><button type="button" id="fhx-toggle">Hide the green</button></div>
<script>
(function(){
  var b=document.getElementById('fhx-toggle');if(!b)return;
  var bar=b.parentNode,root=document.querySelector('.fh-root');
  function fit(){if(root)root.style.paddingTop=bar.offsetHeight+'px';}
  fit();window.addEventListener('resize',fit);
  b.addEventListener('click',function(){var on=document.documentElement.classList.toggle('fhx-clean');b.textContent=on?'Show the green':'Hide the green';});
})();
</script>\n`;
  const cut0 = share.indexOf("<!-- ================= SPLIT-LINE");
  const cut1 = share.indexOf("<!-- SLOT-UTM");
  if (cut0 < 0 || cut1 < 0) throw new Error("checkout markers not found");
  let checkout = share.slice(cut0, cut1)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<form\b/g, '<form onsubmit="return false"');
  if (/<script/.test(checkout)) throw new Error("a script is left in the shared checkout");
  share = share.slice(0, cut0) +
    checkout + share.slice(cut1);
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
.fhx-checkout-note{max-width:660px;margin:0 auto 10px;font:600 13px/1.5 system-ui,sans-serif;color:#52525B;text-align:center}

.fhx-banner{padding-top:calc(10px + env(safe-area-inset-top, 0px))}
</style>
`;
  writeFileSync(join(here, "01-sales-headline-share.html"), head + share);
  console.log(`built 01-sales-headline-share.html (${urls.length} pictures baked in)`);
}
