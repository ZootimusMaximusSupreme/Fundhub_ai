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

const SUB_CSS = `.fh-root .hero .fh-subhead{margin:14px auto 0;font-size:clamp(18px,2.4vw,22px);font-weight:600;line-height:1.3;color:var(--ink,#111113);max-width:36ch}`;

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
const HOW_STEPS = [
  ["See how much you can get", "We check your credit with a soft pull. Your score stays the same. About 10 seconds later, your roadmap is in your portal. It shows how much you can get today, and how much once your file is fixed."],
  ["Fix your personal credit", "Your roadmap shows every item that costs you money on all three bureaus. That includes inquiries, and any name or address that does not match. Pay down the cards it names. Mail the dispute letters we write for you. Each round waits 30 days at most."],
  ["Fix your business file", "We check your Experian Business report. We flag your business scores, bad marks, high card balances, your NAICS code and your business name. You get the exact fixes, so a lender sees a business they can trust."],
  ["Apply in the right order", "Your list shows the banks most likely to say yes to a file like yours. Apply in that order, so you stack approvals, not declines."],
  ["Add aged companies if you need them", "Want more funding? Open one to two new companies a quarter, set up the right way: a clean name, the right NAICS code, and reporting from day one. As they age, they get ready for funding too. That is how you keep getting funded."],
];
function howSection(g) {
  const rows = HOW_STEPS.map(([t, d], i) =>
    `        <div class="srow"><span class="n">0${i + 1}</span><div><div class="t">${g(t)}</div><div class="d">${g(d)}</div></div></div>`).join("\n");
  return `<!-- HOW IT WORKS (2026-10-01) -->
    <section class="sect">
      <span class="kicker">${g("How It Works")}</span>
      <div class="h2">${g("Get Funded. Then Do It Again.")}</div>
      <div class="rows">
${rows}
      </div>
      <a class="btn" href="#fh-order">Get My $297 Funding Roadmap</a>
    </section>
`;
}
const HERO_CUT = [
  '<p class="fh-proofline"><b>Gene</b> runs three LLCs. With the roadmap, he opened up about $420,000 in business funding over three years.</p>',
  '<p class="lede"><b>$297.</b> We soft-pull your credit, and about 10 seconds later five documents built from your own file are waiting in your portal. Yours to keep.</p>',
];
function reorder(page, mark) {
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
  block.howNew = howSection(mark ? (t) => `<span class="fhx-new">${t}</span>` : (t) => t);
  if (NEW.length - 1 + CUT.length !== NOW.length - 1) throw new Error("a block is neither kept nor cut");
  let body = NEW.map(([k, tag]) => (mark ? `<div class="fhx-sec" data-tag="${tag}">\n${block[k]}</div><!--/fhx-sec-->\n` : block[k])).join("");
  if (mark) body += `<div class="fhx-cutbox"><b>CUT from the page</b><span>${CUT_NAMES}</span></div>\n`;
  return head + body + tail;
}

let live = reorder(s.replace(OLD_H1, `<h1>${NEW_H1}</h1>\n      <p class="fh-subhead">${NEW_SUB}</p>`), false);
live += `\n<style>\n/* New headline, 2026-10-01 — built by clickfunnels-fragments/slo/preview/roadmap-headline-draft-build.mjs */\n${SUB_CSS}\n</style>\n`;
if (process.argv.includes("--live")) {
  writeFileSync(LIVE_FILE, live);
  console.log("wrote the live fragment ../slo-01-sales.html");
  process.exit(0);
}

const G = (t) => `<span class="fhx-new">${t}</span>`;
let draft = reorder(s.replace(OLD_H1,
  `<p class="fhx-old">${OLD_H1.replace(/<\/?h1>/g, "")}</p>\n` +
  `      <h1>${G(NEW_H1)}</h1>\n      <p class="fh-subhead">${G(NEW_SUB)}</p>`), true);

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
  let share = live;
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
