/* K1 page drafts, round 1: red boxes only. Nothing here is live.
 *
 * Law: .claude/rules/page-edits-marked-draft.md. This script READS the live
 * source files and never changes them. Nothing is pushed to ClickFunnels.
 *
 * What Chris asked for (to-do list W6, 2026-10-04, plus the 23 /roadmap fixes
 * from the 2026-09-29 Roadmap Page Audit, board ops/workflows/knockout-2026-10-05.md):
 *   1. /roadmap "How It Works" follows the 7-step note, marketing/ads/notes-green-screen.md
 *      lines 54-67 (approved 10/2/2026), plus every one of the 23 fixes still open.
 *      Checked against the page 2026-10-05: two are still open (3 and 22).
 *   2. "Up to 12 funding rounds" becomes "3 to 6 funding rounds" on /watch, /thank-you,
 *      /funding-book-call, /roadmap-book and /roadmap-thank-you. The number comes from
 *      the /watch video script of 9/30: "a funding sequence keeps going for three to
 *      six rounds" (marketing/ads/reference/vsl-scripts-latest.md, line 24).
 *
 * Every fact on a note comes from the repo or from Chris. A fact that is not in the repo
 * (how soon Gene's first approval came) is asked for, never invented.
 *
 * Run:  node marketing/landing-pages/slo/preview/k1-page-drafts-build.mjs
 * Out:  k1-drafts/<page>-draft.html   one marked draft per page, self-contained
 *       k1-drafts/index.html          the list of drafts, the 23 fixes, and what Chris decides
 *       k1-drafts/artifact-main.html  the same index as an Artifact page (no html/head/body tags)
 * Every script, tracker, video file and card form is taken out of the drafts, so opening
 * one sends nothing to Meta, Clarity or Fundhub and cannot take a card.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapFragment } from "../../harness/_shell.js";

const here = dirname(fileURLToPath(import.meta.url));
const LP = join(here, "..", ".."); // marketing/landing-pages
const REPO = join(LP, "..", ".."); // repo root
const OUT = join(here, "k1-drafts");
mkdirSync(OUT, { recursive: true });

const rd = (...p) => readFileSync(join(LP, ...p), "utf8");
const SALES = rd("slo", "slo-01-sales.html");
const NOTE_FILE = readFileSync(join(REPO, "marketing", "ads", "notes-green-screen.md"), "utf8");

/* ---------- small helpers ---------- */
function at(s, marker, from = 0) {
  const i = s.indexOf(marker, from);
  if (i < 0) throw new Error(`marker not found: ${marker.slice(0, 90)}`);
  return i;
}
function once(s, from, to) {
  const i = at(s, from);
  if (s.indexOf(from, i + 1) >= 0) throw new Error(`marker is not unique: ${from.slice(0, 90)}`);
  return s.slice(0, i) + to + s.slice(i + from.length);
}
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const bag = (t) => {
  const m = new Map();
  for (const w of t.toLowerCase().match(/[a-z0-9$,.'%+-]+/g) || []) m.set(w, (m.get(w) || 0) + 1);
  return m;
};

/* ---------- the marks: one list per page, used by the page and by the index ---------- */
const MARKS = {};
function mark(page, where, problem, fix, extra = "") {
  const list = (MARKS[page] ||= []);
  const n = list.length + 1;
  list.push({ n, where, problem, fix });
  return (
    `<div class="fhx-note"><span class="fhx-num">${n}</span>` +
    `<span class="w"><b>Problem:</b> ${problem}</span>` +
    `<div class="s"><b>Try:</b> ${fix}</div>${extra}</div>`
  );
}

/* ---------- take everything live out of a draft ---------- */
function makeStatic(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, `<div class="fhx-checkout"><b>A frame sits here on the live page</b><i>Left out of this draft.</i></div>`)
    .replace(/(<video\b[^>]*?)\s+src="[^"]*"/gi, "$1")
    .replace(/(<video\b[^>]*?)\s+autoplay\b/gi, "$1")
    .replace(/<img\b[^>]*src="https:\/\/www\.google\.com\/s2\/favicons[^>]*>/gi, "");
}

/* ---------- bake the few pictures in: a shared copy loads nothing from fundhub.ai ---------- */
function bake(html) {
  const urls = [...new Set(html.match(/https:\/\/fundhub\.ai\/funnel\/[A-Za-z0-9._-]+\.jpg/g) || [])];
  for (const u of urls) {
    const f = join(REPO, "public", "funnel", u.split("/").pop());
    if (!existsSync(f)) throw new Error(`picture not in the repo: ${f}`);
    html = html.split(u).join("data:image/jpeg;base64," + readFileSync(f).toString("base64"));
  }
  return html;
}

/* ---------- the marked-draft toolkit (same look as reorg-draft-build.mjs) ---------- */
const TOOLKIT = (label) => `
<style>
.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:99999;background:#B00020;color:#fff;font:600 12.5px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center}
.fhx-banner a{color:#fff;text-decoration:underline;margin-left:10px;white-space:nowrap}
html body{padding-top:48px!important}
@media(max-width:760px){html body{padding-top:76px!important}}
.fhx-sec{position:relative;outline:2px dashed #2F6FEB;outline-offset:6px;margin:34px 0}
.fhx-sec::before{content:attr(data-tag);display:block;font:700 11px/1.3 system-ui,sans-serif;letter-spacing:.04em;color:#fff;background:#2F6FEB;padding:5px 9px;border-radius:4px;margin-bottom:10px;width:max-content;max-width:100%}
.fhx-bad{outline:3px solid #E00 !important;outline-offset:2px;background:rgba(255,0,0,.06) !important;position:relative}
.fhx-num{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:11px;background:#E00;color:#fff;font:700 12px system-ui,sans-serif;padding:0 6px;margin-right:6px;vertical-align:middle}
.fhx-note{display:block;margin:8px 0 14px;padding:10px 12px;border-left:4px solid #E00;background:#FFF1F1;color:#222;font:14px/1.45 system-ui,sans-serif!important;text-align:left;border-radius:4px;font-weight:400;letter-spacing:0;text-transform:none}
.fhx-note,.fhx-note .w,.fhx-note .s{font-size:14px!important;line-height:1.45!important}
.fhx-note b{color:inherit}
.fhx-note .w{color:#900}
.fhx-note .s{margin-top:6px;color:#0B5D1E}
.fhx-note .s b{color:#0B5D1E}
.fhx-note .src{margin-top:6px;color:#555;font-size:12.5px!important}
.fhx-wrap{max-width:900px;margin:12px auto;padding:0 16px}
.fhx-wrap .fhx-note{margin:10px 0 0}
.fhx-new{background:rgba(22,163,74,.18);box-shadow:0 0 0 2px rgba(22,163,74,.28);border-radius:3px}
.fhx-moved{border-bottom:2px solid #2F6FEB}
.fhx-from{display:inline-block;font:700 10px/1 ui-monospace,monospace;color:#fff;background:#2F6FEB;border-radius:3px;padding:2px 4px;margin-right:4px;vertical-align:1px;font-style:normal;letter-spacing:.03em;text-transform:none}
.fhx-checkout{box-sizing:border-box;width:calc(100% - 32px);max-width:720px;margin:24px auto;padding:18px 20px;border:2px dashed #2F6FEB;border-radius:10px;background:#F3F7FF;color:#111113;font:14px/1.5 system-ui,sans-serif;display:grid;gap:6px;text-align:left}
.fhx-checkout i{color:#555}
.fhx-pagenote{max-width:900px;margin:10px auto;padding:10px 12px;border:1px solid #D4D4D8;border-radius:6px;background:#FAFAFA;color:#333;font:13px/1.45 system-ui,sans-serif}
</style>
<div class="fhx-banner">DRAFT, NOT LIVE · Round 1 · ${label}<a href="index.html">All drafts</a></div>`;

const finish = (html, title, label) =>
  bake(makeStatic(html))
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace("</body>", `${TOOLKIT(label)}\n</body>`);

/* ============================================================
   /roadmap : How It Works follows the 7-step note, plus the fixes still open
   ============================================================ */
const NOTE_STEPS = (() => {
  // lines 54-67 of marketing/ads/notes-green-screen.md, the block between the ``` fences
  const block = NOTE_FILE.split("```").find((b) => b.includes("How to Get the Maximum Amount of Funding"));
  if (!block) throw new Error("the 7-step note is not in notes-green-screen.md");
  const steps = [...block.matchAll(/^(\d)\.\s+(.+?)\s+\S*\n(.+)$/gmu)];
  if (steps.length !== 7) throw new Error(`expected 7 steps in the note, found ${steps.length}`);
  return steps.map((m) => ({ n: +m[1], name: m[2].replace(/\s+[^\p{L}\p{N}()]+$/u, "").trim(), line: m[3].trim() }));
})();

const HIW_START = at(SALES, '<section class="sect" data-fh-section="how-it-works">');
const HIW_END = at(SALES, "</section>", HIW_START) + "</section>".length;
const HIW = SALES.slice(HIW_START, HIW_END);
const OLD_ROWS = [...HIW.matchAll(/<div class="srow">[\s\S]*?<\/div><\/div><\/div>/g)].map((m) => m[0]);
if (OLD_ROWS.length !== 5) throw new Error(`expected 5 old steps, found ${OLD_ROWS.length}`);
const OLD = OLD_ROWS.map((r) => ({
  title: r.match(/<div class="t">([^<]+)<\/div>/)[1],
  tagline: r.match(/<div class="d"><b>([^<]+)<\/b>/)[1],
  body: r.match(/<div class="d"><b>[^<]+<\/b>\s*([\s\S]*?)<\/div><\/div><\/div>$/)[1].trim(),
}));

/* The words that move, word for word, and which old step they come from. Each one is checked
   against the live page, and the proof at the bottom checks that no word was lost or added. */
const GAP = (t) => `<span class="fh-gap">${t}</span>`;
const MOVES = [
  /* new step 1 */ [[1, `I pull your credit with a soft pull. Your roadmap shows up in your portal. It shows what you qualify for right now. Even with perfect credit, your roadmap reveals the 13 hidden data points that transform a decent file into one that can secure an additional ${GAP("$100,000+")} in low-interest funding.`]],
  /* new step 2 */ [[4, `Your roadmap shows you how to open and set up a business the right way, with all the right data points in place. So lenders approve you instead of asking for income verification or other documents you may not have.`]],
  /* new step 3 */ [
    [2, `The gap is the money you are leaving on the table. You could be leaving ${GAP("$100,000 to $300,000")} in fundability by not optimizing these 13 hidden data points. It costs you money, time and opportunity. Your roadmap shows every item costing you money on all three bureaus: inquiries, names and addresses that don't match, and your business info.`],
    [3, `I check your Experian Business report for liens, bad marks, high card balances, your score, your name, your address and your NAICS code. You get the exact fix for each error I find, website included, so lenders trust you and send money to your bank account.`],
  ],
  /* new step 4 */ [[2, `Follow the roadmap, send the optimization letters, and maximize your fundability.`]],
  /* new step 5 */ [[5, `Your list shows the banks that approve files like yours.`]],
  /* new step 6 */ [[5, `Apply in that order for every business you set up to stack approvals and maximize your fundability across multiple businesses indefinitely.`]],
  /* new step 7 */ [[4, `You can repeat this process, funding company after company after company.`]],
];
for (const chunks of MOVES) for (const [, text] of chunks) at(SALES, text); // each is on the live page, word for word
{
  const before = bag(strip(OLD.map((o) => o.body).join(" ")));
  const after = bag(strip(MOVES.flat().map(([, t]) => t).join(" ")));
  const diff = [...new Set([...before.keys(), ...after.keys()])].filter((w) => before.get(w) !== after.get(w));
  if (diff.length) throw new Error(`moved words do not match the old paragraphs: ${diff.join(", ")}`);
}

const NEW_ROWS = NOTE_STEPS.map((st, i) => {
  const moved = MOVES[i]
    .map(([from, text]) => `<span class="fhx-moved"><em class="fhx-from">from old step ${from}</em>${text}</span>`)
    .join(" ");
  return `<div class="srow"><span class="n">0${st.n}</span><div><div class="t"><span class="fhx-new">${st.name}</span></div><div class="d"><b><span class="fhx-new">${st.line}</span></b> ${moved}</div></div></div>`;
});
const NEW_HIW =
  `<section class="sect">\n      <span class="kicker">How It Works</span>\n      <div class="h2">Get Every Dollar Your File Can Get. Then Do It Again, On Your Own.</div>\n      <div class="rows">\n        ` +
  NEW_ROWS.join("\n        ") +
  `\n      </div>\n      <a class="btn" href="#fh-order">Get My $147 Funding Roadmap</a>\n    </section>`;

const OLD_NOTES = [
  [
    `Today this section has five steps. The note you approved on 10/2 has seven. This first step leads with what the roadmap shows. The note's first step is what the buyer does: check your credit.`,
    `Becomes step 1, "${NOTE_STEPS[0].name}." The bold line is replaced by the note's line. Every word of the paragraph moves under step 1, unchanged. The note's emoji stay on the reel note, not the page.`,
  ],
  [
    `This one step mixes parts of three of the note's steps: 3 (match your information), 4 (the letters) and 7 (inquiries). The note keeps them apart.`,
    `The paragraph is split, word for word. "The gap is the money…" and "Your roadmap shows every item…" go under step 3. "Follow the roadmap, send the optimization letters, and maximize your fundability." goes under step 4. The bold line is replaced by the note's lines.`,
  ],
  [
    `In the note, the business check belongs to step 3, "${NOTE_STEPS[2].name}." It has no step of its own.`,
    `The whole paragraph moves under step 3, unchanged. The bold line is replaced.`,
  ],
  [
    `In the note, opening a business comes second ("do this early"), and "do it again for every business" comes last.`,
    `The first two sentences move under step 2. "You can repeat this process, funding company after company after company." moves under step 7. The bold line is replaced.`,
  ],
  [
    `The note makes this two steps: find the banks (5), then apply in the right order (6).`,
    `"Your list shows the banks that approve files like yours." moves under step 5. "Apply in that order for every business you set up…" moves under step 6. The bold line is replaced.`,
  ],
];
const OLD_MARKED = OLD_ROWS.map((r, i) =>
  r.replace('<div class="srow">', '<div class="srow fhx-bad">') +
  mark("roadmap", `How It Works, step 0${i + 1} today: "${OLD[i].title}"`, OLD_NOTES[i][0], OLD_NOTES[i][1]),
);
let HIW_OLD = HIW;
OLD_ROWS.forEach((r, i) => {
  HIW_OLD = once(HIW_OLD, r, OLD_MARKED[i]);
});

/* ---------- testimonials: the three cover pictures, and Gene's caption ---------- */
const SAME_FIX = `Keep the same words, but as one small line at the bottom of the picture, name first. Today the headline fills about a third of the picture, and the caption right under it says the same thing again.`;
const POSTERS = {
  "slo-testimonial-colin2-poster": [`The cover picture shows "Around $225,000 in funding" in huge type. It reads like an ad.`, SAME_FIX],
  "slo-testimonial-gene-poster": [`The cover picture shows "About $420,000 over three years" in huge type. It reads like an ad.`, SAME_FIX],
  "slo-testimonial-sarah-poster": [`The cover picture shows "Set to be approved for around $80,000" in four lines of huge type. It reads like an ad.`, SAME_FIX],
};
const GENE_CAPTION = [
  `"Over three years" tells a buyer this takes a long time. What a buyer wants to know is how soon the first approval came. That number is not in the repo: Gene's script only says "about $420,000 over the last three years."`,
  `I did not write a number. Give me how long Gene waited for his first approval and the line says that. If you do not have it, the caption stays as it is. The headline on his picture says "over three years" too, so it would change the same way.`,
];
const FIGS = [...SALES.matchAll(/<figure class="tcard">[\s\S]*?<\/figure>/g)].map((m) => m[0]);
if (FIGS.length !== 3) throw new Error(`expected 3 testimonial cards, found ${FIGS.length}`);
let SALES2 = SALES;
for (const fig of FIGS) {
  const id = Object.keys(POSTERS).find((k) => fig.includes(k));
  if (!id) throw new Error("testimonial card has no known cover picture");
  let f = once(fig, '<div class="vslot">', '<div class="vslot fhx-bad">');
  const who = id.includes("colin") ? "Colin" : id.includes("gene") ? "Gene" : "Sarah";
  let notes = mark("roadmap", `Testimonials, ${who}'s cover picture`, POSTERS[id][0], POSTERS[id][1]);
  if (who === "Gene") {
    f = once(f, '<figcaption class="tcap">', '<figcaption class="tcap fhx-bad">');
    notes += mark("roadmap", `Testimonials, Gene's caption`, GENE_CAPTION[0], GENE_CAPTION[1]);
  }
  f = once(f, "</figcaption>", `</figcaption>${notes}`);
  SALES2 = once(SALES2, fig, f);
}
/* the old How It Works rows were marked first, so the numbers read top to bottom */
SALES2 = once(SALES2, HIW, "@@HIW@@");

/* the index and the fix list point at these red boxes by number */
if (MARKS.roadmap.length !== 9 || !MARKS.roadmap[7].where.includes("Gene's caption")) {
  throw new Error("red box numbers moved: fix the fix list (3 and 22)");
}

/* ---------- assemble the /roadmap draft ---------- */
{
  let page = SALES2.replace(
    "@@HIW@@",
    `\n<div class="fhx-sec" data-tag="TODAY · How It Works, 5 steps · each red box says where its words go">\n${HIW_OLD}\n</div>\n` +
      `<div class="fhx-sec" data-tag="NEW · How It Works, 7 steps in the order of your approved note (10/2) · green = the note's words · blue = old words moved word for word">\n${NEW_HIW}\n</div>\n`,
  );
  /* checkout: keep the order summary, leave the card and Social Security form out */
  const cut0 = at(page, "<!-- ================= SPLIT-LINE");
  const cut1 = at(page, "<!-- SLOT-UTM");
  page =
    page.slice(0, cut0) +
    `<div class="fhx-checkout"><b>The checkout form sits here on the live page</b>` +
    `<span>Step 1 · Info &nbsp;→&nbsp; Step 2 · Card ($147) &nbsp;→&nbsp; Step 3 · Soft pull</span>` +
    `<i>Left out of this draft so nothing here can take a card or personal details.</i></div>\n` +
    page.slice(cut1);
  const label = "red = wrong, fix under it · blue dashed = new or moved · green = new words from your note";
  writeFileSync(join(OUT, "roadmap-draft.html"), finish(wrapFragment(page), "Draft · /roadmap", label));
}

/* ============================================================
   The five pages that say "Up to 12 funding rounds"
   ============================================================ */
const ROUND_PROBLEM = `The scrolling bar says "Up to 12 funding rounds." The /watch video says a funding sequence keeps going for "three to six rounds." The page and the video have to say the same number.`;
const ROUND_FIX = `3 to 6 funding rounds`;
const ROUND_SRC = `<div class="src">Where 3 to 6 comes from: the /watch video script of 9/30, "that's how a funding sequence keeps going for three to six rounds." Saved in marketing/ads/reference/vsl-scripts-latest.md, line 24.</div>`;
const OLD_ROUND = "<span>Up to 12 funding rounds</span>";
const FREEZE = `<style>
.marq{overflow:visible!important}
.marq-track{animation:none!important;width:auto!important;justify-content:center;transform:none!important}
.marq-set{flex-wrap:wrap;justify-content:center;row-gap:10px;padding:0 16px}
.marq-set + .marq-set{display:none!important}
</style>`;

const ROUND_PAGES = [
  { key: "watch", url: "/watch", file: "01-vsl.html", out: "watch-draft.html", page: () => wrapFragment(rd("01-vsl.html")) },
  { key: "thank-you", url: "/thank-you", file: "05-thank-you.html", out: "thank-you-draft.html", page: () => wrapFragment(rd("05-thank-you.html")) },
  {
    key: "funding-book-call",
    url: "/funding-book-call",
    file: "04a-book-top.html + 04b-book-bottom.html",
    out: "funding-book-call-draft.html",
    page: () =>
      wrapFragment(
        rd("04a-book-top.html") +
          `\n<div class="fhx-checkout"><b>The booking calendar sits here on the live page</b><i>It is the ClickFunnels calendar. Left out of this draft so nothing here can book a call.</i></div>\n` +
          rd("04b-book-bottom.html"),
      ),
  },
  { key: "roadmap-book", url: "/roadmap-book", file: "slo/slo-02-booking.html", out: "roadmap-book-draft.html", page: () => wrapFragment(rd("slo", "slo-02-booking.html")) },
  { key: "roadmap-thank-you", url: "/roadmap-thank-you", file: "slo/slo-03-thank-you.html", out: "roadmap-thank-you-draft.html", page: () => wrapFragment(rd("slo", "slo-03-thank-you.html")) },
];
for (const p of ROUND_PAGES) {
  let html = p.page();
  const first = at(html, OLD_ROUND);
  html = html.slice(0, first) + `<span class="fhx-bad">Up to 12 funding rounds</span>` + html.slice(first + OLD_ROUND.length);
  const m = html.match(/<div class="marq" aria-hidden="true">[\s\S]*?<\/div><\/div><\/div>/);
  if (!m) throw new Error(`no scrolling bar on ${p.url}`);
  const where = `${p.url}, the scrolling bar above the footer`;
  const note =
    `<div class="fhx-wrap"><div class="fhx-pagenote">The scrolling bar is frozen here so every line shows. Live, it scrolls. Nothing else on this page changes.</div>` +
    mark(p.key, where, ROUND_PROBLEM, ROUND_FIX, ROUND_SRC) +
    `</div>`;
  html = html.replace(m[0], () => m[0] + note);
  html = html.replace("</head>", `${FREEZE}\n</head>`);
  writeFileSync(join(OUT, p.out), finish(html, `Draft · ${p.url}`, `red = wrong, fix under it`));
}

/* ============================================================
   The 23 /roadmap fixes, checked against slo-01-sales.html on 2026-10-05
   ============================================================ */
const CUT = "You cut it on 2026-10-01";
const FIXES = [
  [1, "Move What You Get under the testimonials", "gone", `${CUT} (What You Get). The page is now headline, video, How It Works, testimonials, guarantee, FAQ, checkout.`],
  [2, "Cut the good-credit section and fold its points into the 800-score answer", "done", "The section was cut 2026-10-01. The first FAQ answer now covers the 800-score question."],
  [3, "Gene's \"over three years\" on screen one", "open", "The Gene line left screen one on 2026-10-01, but \"over three years\" is still in his caption and on his cover picture. The repo has no number for how soon his first approval came, so the draft asks you. Red box 8."],
  [4, "Show a first win within a month", "gone", `${CUT} ("Your fastest first win").`],
  [5, "Checklist of the buyer's work, with times", "gone", `${CUT} ("What Happens Next").`],
  [6, "Business Duplication Map: a sample and a real example", "done", "The sample is under \"See a sample\" in the order summary. The real document was built 2026-10-02. A real client's file cannot go on a public page (your 2026-10-02 sample rule)."],
  [7, "Tag each approval and testimonial with its product", "done", "Each of the 3 testimonials has a product line above its caption. The approvals deck was cut 2026-10-01."],
  [8, "Funding Snapshot today-and-after table, as an image on the page", "gone", `${CUT} ("Your fastest first win"). The table is in the sample for How Much You Qualify For.`],
  [9, "Samples show only what each document adds", "gone", "The samples were rebuilt on 2026-10-02 from one UnderwriteIQ file. The same number showing in two documents is what \"one file, one story\" gives, and your sample rule says never hand-edit a number (.claude/rules/sample-clients-consistent.md)."],
  [10, "Renumber the sample sections", "done", "The old numbered tabs (01 to 06, then 08) are gone. The new samples have no section numbers."],
  [11, "Discover it line ($210 balance, pay down to $350)", "gone", "There is no Discover card in the new sample. Its cards are Chase Sapphire Preferred, American Express Blue Business Cash and Capital One Spark (same rule)."],
  [12, "One dispute round count", "done", "Six. The order summary says \"all six rounds\" and the sample lists rounds 1 to 6."],
  [13, "One-line label on the dispute letter sample", "done", "\"Why you need this: the items costing you money come off, and no credit repair company gets paid to do it.\""],
  [14, "One disclaimer line on every sample", "done", "One line shows under every sample: \"Sample file for a made-up client. Yours is built from your own credit file. Estimates, not an offer of credit.\""],
  [15, "Change the DIRTY bureau labels", "done", "The word is gone. The Duplication Map sample says what to do, for example \"Pay it down before you apply.\""],
  [16, "List what the soft-pull form asks, in What Happens Next", "gone", `${CUT} (What Happens Next). Step 3 of the checkout lists everything the soft pull asks for.`],
  [17, "\"Can you do the work for me?\" says what help is available later", "done", "The answer now ends: \"If you want help later, every document has a button to book a call with my team.\""],
  [18, "\"the way a bank's underwriter does\" becomes \"the way a lender does\"", "gone", `The line was cut with "Why this works" on 2026-10-01. The word underwriter is not on the page.`],
  [19, "Good-credit header and first FAQ answer say what a funding-ready file is", "done", "The header went with the section. The first FAQ answer says a high score is not a file set up for max funding, and names the 13 hidden data points."],
  [20, "\"All five\" does not match the six items", "done", "\"All five\" is gone. The order summary lists five documents plus a free bonus, and the bonus has its own sample."],
  [21, "Remove \"systems nominal · fundhub.ai\" from the footer", "done", "It is not on the page. The footer reads: Fundhub.ai | Copyright © 2026 Fundhub LLC | All Rights Reserved."],
  [22, "Tone down the big headlines on the testimonial videos", "open", "All three cover pictures carry a huge 3-to-4-line headline. Red boxes 6, 7 and 9."],
  [23, "Write down the change time", "partly", "The change log (marketing/ads/roadmap-page-changes.md) has the 2026-09-29 and 2026-10-01 pushes. It is missing 2026-10-02 (guarantee back, new buy box; I found no push time in the repo) and 2026-10-04 (price to $147, live 3:07 p.m. Pacific, per ops/workflows/roadmap-marketing-2026-10-04.md). The push for these drafts writes its own row."],
];

/* checks that keep the list honest: each claim is read off the live page again on every build */
{
  const has = (t) => SALES.includes(t);
  const hasNo = (t) => !SALES.toLowerCase().includes(t.toLowerCase());
  const checks = [
    [2, has("My score is already 800. Why do I need this?") && hasNo("Already have good credit")],
    [3, has("over three years")],
    [7, (SALES.match(/class="fh-tprod"/g) || []).length === 3],
    [12, has("all six rounds") && has("R6")],
    [13, has("Why you need this: the items costing you money come off")],
    [14, has("Sample file for a made-up client. Yours is built from your own credit file. Estimates, not an offer of credit.")],
    [15, hasNo("DIRTY")],
    [17, has("If you want help later, every document has a button to book a call with my team.")],
    [18, hasNo("underwriter")],
    [20, hasNo("all five") && has("FREE BONUS")],
    [21, hasNo("systems nominal")],
    [1, hasNo("Here's What You Get")],
    [4, hasNo("fastest first win")],
    [5, hasNo("Your part, and how long it takes")],
    [16, hasNo("What Happens Next")],
    [11, hasNo("Discover")],
  ];
  for (const [n, ok] of checks) {
    if (!ok) throw new Error(`fix ${n}: the page no longer matches the status written for it`);
  }
}

/* ============================================================
   The index: drafts, the decisions, the 23 fixes
   ============================================================ */
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DRAFTS = [
  { key: "roadmap", url: "/roadmap", file: "roadmap-draft.html", live: "https://apply.fundhub.ai/roadmap", change: "How It Works goes from 5 steps to the 7 steps in your 10/2 note. The big headlines on the testimonial pictures. Gene's \"over three years.\"" },
  { key: "watch", url: "/watch", file: "watch-draft.html", live: "https://apply.fundhub.ai/watch", change: "\"Up to 12 funding rounds\" becomes \"3 to 6 funding rounds.\"" },
  { key: "thank-you", url: "/thank-you", file: "thank-you-draft.html", live: "https://apply.fundhub.ai/thank-you", change: "\"Up to 12 funding rounds\" becomes \"3 to 6 funding rounds.\"" },
  { key: "funding-book-call", url: "/funding-book-call", file: "funding-book-call-draft.html", live: "https://apply.fundhub.ai/funding-book-call", change: "\"Up to 12 funding rounds\" becomes \"3 to 6 funding rounds.\"" },
  { key: "roadmap-book", url: "/roadmap-book", file: "roadmap-book-draft.html", live: "https://apply.fundhub.ai/roadmap-book", change: "\"Up to 12 funding rounds\" becomes \"3 to 6 funding rounds.\"" },
  { key: "roadmap-thank-you", url: "/roadmap-thank-you", file: "roadmap-thank-you-draft.html", live: "https://apply.fundhub.ai/roadmap-thank-you", change: "\"Up to 12 funding rounds\" becomes \"3 to 6 funding rounds.\"" },
];
const DECISIONS = [
  ["How It Works: swap the 5 steps for the 7 in your 10/2 note, in its order?", "Yes. Every word of the old paragraphs moves under a step. Only the five bold one-liners are replaced (next question)."],
  ["The 5 bold one-liners (like \"Get approved, not declined.\") give way to the note's own lines. Keep any of them?", "Drop them. The note's lines do the same job."],
  ["Change \"Up to 12 funding rounds\" to \"3 to 6 funding rounds\" on all five pages?", "Yes. It is the number in your 9/30 /watch video."],
  ["Shrink the big headlines on the three testimonial pictures?", "Yes. One small line at the bottom, same words."],
  ["Gene: how long until his first approval? Give me the number, or his caption stays as it is.", "Leave it, unless you have the number."],
];
const CHIP = { done: ["DONE", "ok"], open: ["NOT DONE", "bad"], partly: ["PARTLY", "mid"], gone: ["NO LONGER TRUE", "dim"] };
const count = (k) => FIXES.filter((f) => f[2] === k).length;

const INDEX_CSS = `
:root{--bg:#FCFCFC;--fg:#111113;--muted:#52525B;--line:#E4E4E7;--card:#FFFFFF;--red:#B00020;--red-bg:#FFF1F1;--blue:#2F6FEB;--blue-bg:#EEF4FF;--green:#0B5D1E;--green-bg:#EAF6EE;--amber:#8A5A00;--amber-bg:#FFF6E0;--dim-bg:#F1F1F3;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace;--sans:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F1012;--fg:#EDEDEF;--muted:#A1A1AA;--line:#2A2B30;--card:#17181B;--red:#FF6B7F;--red-bg:#2A1317;--blue:#7FA8FF;--blue-bg:#14203A;--green:#6FD08C;--green-bg:#11261A;--amber:#F2C265;--amber-bg:#2B2210;--dim-bg:#1D1E22;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0F1012;--fg:#EDEDEF;--muted:#A1A1AA;--line:#2A2B30;--card:#17181B;--red:#FF6B7F;--red-bg:#2A1317;--blue:#7FA8FF;--blue-bg:#14203A;--green:#6FD08C;--green-bg:#11261A;--amber:#F2C265;--amber-bg:#2B2210;--dim-bg:#1D1E22;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;line-height:1.55;margin:0}
.k1{max-width:920px;margin:0 auto;padding-inline:16px;padding-block:28px 56px}
.k1 *{box-sizing:border-box}
.k1 .pill{display:inline-block;font:700 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:#fff;background:var(--red);border-radius:4px;padding:6px 8px}
.k1 h1{font-size:30px;line-height:1.15;letter-spacing:-.02em;margin:14px 0 8px;text-wrap:balance}
.k1 .lede{color:var(--muted);max-width:62ch;margin:0}
.k1 .legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin:18px 0 0;padding:0;list-style:none;font-size:13px}
.k1 .legend li{display:flex;align-items:center;gap:8px}
.k1 .sw{width:16px;height:16px;border-radius:3px;flex:0 0 auto}
.k1 .sw.r{outline:3px solid var(--red);outline-offset:-3px;background:var(--red-bg)}
.k1 .sw.b{outline:2px dashed var(--blue);outline-offset:-2px}
.k1 .sw.g{background:var(--green-bg);box-shadow:0 0 0 2px var(--green) inset}
.k1 h2{font:700 11px/1.3 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:40px 0 12px}
.k1 .decide{margin:0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:d}
.k1 .decide li{counter-increment:d;display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.k1 .decide li::before{content:counter(d);font:700 13px/28px var(--mono);text-align:center;width:28px;height:28px;border-radius:50%;background:var(--blue-bg);color:var(--blue)}
.k1 .decide b{display:block;font-weight:600}
.k1 .decide span{display:block;color:var(--muted);font-size:14px;margin-top:3px}
.k1 .after{margin:14px 0 0;color:var(--muted);font-size:14px;max-width:70ch}
.k1 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:12px}
.k1 .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;display:grid;gap:10px;align-content:start;min-width:0}
.k1 .card .u{font:600 15px/1.3 var(--mono);word-break:break-all}
.k1 .card .c{margin:0;color:var(--muted);font-size:14px}
.k1 .card .n{font:600 12px/1 var(--mono);color:var(--red)}
.k1 .open{display:inline-block;justify-self:start;background:var(--fg);color:var(--bg);text-decoration:none;font-weight:600;font-size:14px;padding:10px 14px;border-radius:8px}
.k1 .open:focus-visible,.k1 summary:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.k1 details{border-top:1px solid var(--line);padding-top:8px}
.k1 summary{cursor:pointer;font-size:13px;color:var(--muted)}
.k1 .m{margin:10px 0 0;padding:10px 12px;border-left:4px solid var(--red);background:var(--red-bg);border-radius:4px;font-size:13.5px}
.k1 .m b{font-weight:600}
.k1 .m .t{color:var(--green);margin-top:5px}
.k1 .sum{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;font-size:13px}
.k1 .sum span{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 10px}
.k1 .fixes{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.k1 .fixes li{display:grid;grid-template-columns:30px minmax(0,1fr);gap:4px 12px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.k1 .fixes .no{font:700 12px/22px var(--mono);color:var(--muted)}
.k1 .fixes .what{font-weight:600;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.k1 .fixes .why{grid-column:2;color:var(--muted);font-size:13.5px;overflow-wrap:anywhere}
.k1 .chip{font:700 10.5px/1 var(--mono);letter-spacing:.08em;border-radius:4px;padding:4px 6px;white-space:nowrap}
.k1 .chip.ok{background:var(--green-bg);color:var(--green)}
.k1 .chip.bad{background:var(--red-bg);color:var(--red)}
.k1 .chip.mid{background:var(--amber-bg);color:var(--amber)}
.k1 .chip.dim{background:var(--dim-bg);color:var(--muted)}
`;
const marksHtml = (key) =>
  (MARKS[key] || [])
    .map((m) => `<div class="m"><b>${m.n}. ${m.where}</b><div>${m.problem}</div><div class="t"><b>Try:</b> ${m.fix}</div></div>`)
    .join("");
const INDEX_BODY = `
<div class="k1">
  <span class="pill">Draft · not live</span>
  <h1>Fundhub page drafts</h1>
  <p class="lede">Round 1 of 2, 2026-10-05. Six pages, one draft each. Red boxes show what is wrong, with the fix under each one. Nothing here is on a live page, and nothing was pushed.</p>
  <ul class="legend">
    <li><span class="sw r"></span>Red box: what is wrong, fix under it</li>
    <li><span class="sw b"></span>Blue dashed box: new or moved</li>
    <li><span class="sw g"></span>Green: new words, straight from your note</li>
  </ul>

  <h2>Your call</h2>
  <ol class="decide">
    ${DECISIONS.map(([q, pick]) => `<li><div><b>${esc(q)}</b><span>My pick: ${esc(pick)}</span></div></li>`).join("\n    ")}
  </ol>
  <p class="after">Say "fix it" and I turn the red boxes into green fixes on this same link. Say "push it" and I take every mark off, push the pages, prove them live, and write the change time in the log.</p>

  <h2>The drafts</h2>
  <div class="grid">
    ${DRAFTS.map((d) => {
      const n = (MARKS[d.key] || []).length;
      return `<div class="card"><div class="u">${d.url}</div><p class="c">${esc(d.change)}</p><div class="n">${n} red box${n === 1 ? "" : "es"}</div><a class="open" href="${d.file}">Open the draft</a><details><summary>The red boxes, in words</summary>${marksHtml(d.key)}</details></div>`;
    }).join("\n    ")}
  </div>

  <h2>The 23 /roadmap fixes, checked against the page today</h2>
  <div class="sum"><span>${count("done")} done</span><span>${count("open")} not done</span><span>${count("partly")} partly</span><span>${count("gone")} no longer true</span></div>
  <ol class="fixes">
    ${FIXES.map(([n, what, st, why]) => `<li><span class="no">${n}</span><div class="what">${esc(what)} <span class="chip ${CHIP[st][1]}">${CHIP[st][0]}</span></div><div class="why">${esc(why)}</div></li>`).join("\n    ")}
  </ol>
</div>`;

writeFileSync(
  join(OUT, "artifact-main.html"),
  `<title>Fundhub Page Drafts</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap">\n<style>${INDEX_CSS}</style>\n${INDEX_BODY}\n`,
);
writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Fundhub Page Drafts</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap">\n<style>${INDEX_CSS}</style></head><body>${INDEX_BODY}</body></html>\n`,
);

console.log(
  `built ${DRAFTS.length} drafts + index. Red boxes: ${DRAFTS.map((d) => `${d.url} ${(MARKS[d.key] || []).length}`).join(", ")}. ` +
    `Fixes: ${count("done")} done, ${count("open")} not done, ${count("partly")} partly, ${count("gone")} no longer true.`,
);
