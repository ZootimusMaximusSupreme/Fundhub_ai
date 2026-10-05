/* K1 page drafts, round 2: the fixes written in, every new or changed line marked green.
 * Nothing here is live.
 *
 * Law: .claude/rules/page-edits-marked-draft.md. This script READS the live source files and
 * never changes them. Nothing is pushed to ClickFunnels. Round 1 (the red boxes Chris saw) is
 * commit 2a221be in PR #45.
 *
 * Chris answered "Please finish" to round 1, so the five picks are the ones round 1 offered:
 *   1. /roadmap "How It Works": the 5 steps become the 7 steps of the note approved 10/2/2026
 *      (marketing/ads/notes-green-screen.md lines 54-67), in the note's order.
 *   2. The 5 bold one-liners are dropped. The note's own line leads each step. Every word of the
 *      old paragraphs moves under a step, word for word (the build proves it).
 *   3. "Up to 12 funding rounds" becomes "3 to 6 funding rounds" on /watch, /thank-you,
 *      /funding-book-call, /roadmap-book and /roadmap-thank-you. The number is the 9/30 /watch
 *      video script: "a funding sequence keeps going for three to six rounds"
 *      (marketing/ads/reference/vsl-scripts-latest.md, line 24).
 *   4. The three testimonial cover pictures: the big headline becomes one small line near the
 *      bottom, same words. The new pictures are made by scripts/testimonials/render-small-thumbnails.mjs
 *      and wait in marketing/testimonials/posters-v2/ (not in public/funnel/) until Chris says push it.
 *   5. Gene's caption stays as it is.
 *
 * Run:    node marketing/landing-pages/slo/preview/k1-page-drafts-build.mjs
 * Out:    k1-drafts/<page>-draft.html   one marked draft per page, self-contained, with a button
 *                                       at the top that hides the marks
 *         k1-drafts/index.html          the drafts, what changed, what "push it" does, the 23 fixes
 *         k1-drafts/artifact-main.html  the same index as an Artifact page
 *
 * Push-ready pages (only after Chris says push it):
 *         node marketing/landing-pages/slo/preview/k1-page-drafts-build.mjs --clean <dir>
 *   writes the six changed sources, with no mark anywhere, under <dir> at the same paths they have
 *   under marketing/landing-pages/. Writing into marketing/landing-pages itself also needs
 *   --push-approved, so nobody overwrites a live source by accident.
 *
 * What the build proves on every run (it throws if any of these fail):
 *   - each moved sentence is on the live page word for word, and the moved words equal the old
 *     paragraphs' words (nothing lost, nothing added)
 *   - each clean page equals its draft with every mark stripped
 *   - each clean page differs from today's live source only by the approved edits
 *   - 16 of the status lines for the 23 fixes still match what the live page says
 * Every script, tracker, video file and card form is taken out of the drafts, so opening one sends
 * nothing to Meta, Clarity or Fundhub and cannot take a card.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapFragment } from "../../harness/_shell.js";

const here = dirname(fileURLToPath(import.meta.url));
const LP = join(here, "..", ".."); // marketing/landing-pages
const REPO = join(LP, "..", ".."); // repo root
const OUT = join(here, "k1-drafts");
const POSTERS_V2 = join(REPO, "marketing", "testimonials", "posters-v2");
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
const countOf = (s, t) => s.split(t).length - 1;
const textOf = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const bag = (t) => {
  const m = new Map();
  for (const w of t.toLowerCase().match(/[a-z0-9$,.'%+-]+/g) || []) m.set(w, (m.get(w) || 0) + 1);
  return m;
};

/* ---------- the marks ----------
   green  <ins class="fhx-new">text</ins>        new words
          class="... fhx-new" on a real element   a changed element (picture, scrolling-bar line)
   blue   <ins class="fhx-moved"><em class="fhx-from">..</em>text</ins>   old words moved word for word
          <div class="fhx-sec" data-tag="..">..</div><!--/fhx-sec-->      a new or moved section
   strip() takes every one of them out again. The build checks strip(draft source) === clean source. */
const NEW = (t, marked) => (marked ? `<ins class="fhx-new">${t}</ins>` : t);
const MOVED = (from, t, marked) => (marked ? `<ins class="fhx-moved"><em class="fhx-from">from old step ${from}</em>${t}</ins>` : t);
const SEC = (tag, html, marked) => (marked ? `\n<div class="fhx-sec" data-tag="${tag}">\n${html}\n</div><!--/fhx-sec-->\n` : html);
function strip(h) {
  return h
    .replace(/\n<div class="fhx-sec" data-tag="[^"]*">\n/g, "")
    .replace(/\n<\/div><!--\/fhx-sec-->\n/g, "")
    .replace(/<em class="fhx-from">[^<]*<\/em>/g, "")
    .replace(/<ins class="fhx-(?:new|moved)">([\s\S]*?)<\/ins>/g, "$1")
    .replace(/ class="fhx-new"/g, "")
    .replace(/ fhx-new"/g, '"');
}

/* ============================================================
   /roadmap : How It Works becomes the 7 steps of the note, the three pictures get the small line
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
const OLD_ROWS_BLOCK = HIW.slice(HIW.indexOf(OLD_ROWS[0]), HIW.indexOf(OLD_ROWS[4]) + OLD_ROWS[4].length);
const OLD_BODIES = OLD_ROWS.map((r) => r.match(/<div class="d"><b>[^<]+<\/b>\s*([\s\S]*?)<\/div><\/div><\/div>$/)[1].trim());

/* The words that move, word for word, and which old step they come from. */
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
  const before = bag(textOf(OLD_BODIES.join(" ")));
  const after = bag(textOf(MOVES.flat().map(([, t]) => t).join(" ")));
  const diff = [...new Set([...before.keys(), ...after.keys()])].filter((w) => before.get(w) !== after.get(w));
  if (diff.length) throw new Error(`moved words do not match the old paragraphs: ${diff.join(", ")}`);
}

const newRows = (marked) =>
  NOTE_STEPS.map(
    (st, i) =>
      `<div class="srow"><span class="n">0${st.n}</span><div><div class="t">${NEW(st.name, marked)}</div>` +
      `<div class="d"><b>${NEW(st.line, marked)}</b> ${MOVES[i].map(([from, text]) => MOVED(from, text, marked)).join(" ")}</div></div></div>`,
  ).join("\n        ");

/* The three cover pictures. The old files stay live until the push; the new ones are written to
   marketing/testimonials/posters-v2/ and go to public/funnel/ under the -v2 names at push time. */
const POSTER_IDS = ["colin2", "gene", "sarah"];
const posterUrl = (id, v2) => `https://fundhub.ai/funnel/slo-testimonial-${id}-poster${v2 ? "-v2" : ""}.jpg`;

function roadmapSource(marked) {
  let s = SALES;
  /* How It Works */
  const hiwNew = HIW.replace(OLD_ROWS_BLOCK, () => newRows(marked));
  const tag = "How It Works, now 7 steps in the order of your approved note (10/2). Green = the note's words. Blue = old words moved word for word. The 5 bold one-liners are gone.";
  s = once(s, HIW, SEC(tag, hiwNew, marked));
  /* the three pictures */
  for (const id of POSTER_IDS) {
    const fig = [...s.matchAll(/<figure class="tcard">[\s\S]*?<\/figure>/g)].map((m) => m[0]).find((f) => f.includes(posterUrl(id, false)));
    if (!fig) throw new Error(`no testimonial card for ${id}`);
    let f = once(fig, posterUrl(id, false), posterUrl(id, true));
    if (marked) f = once(f, '<div class="vslot">', '<div class="vslot fhx-new">');
    s = once(s, fig, f);
  }
  return s;
}
function revertRoadmap(s) {
  for (const id of POSTER_IDS) s = once(s, posterUrl(id, true), posterUrl(id, false));
  return once(s, HIW.replace(OLD_ROWS_BLOCK, () => newRows(false)), HIW);
}

/* ============================================================
   The five pages that say "Up to 12 funding rounds"
   ============================================================ */
const OLD_ROUND = "<span>Up to 12 funding rounds</span>";
const NEW_ROUND = "3 to 6 funding rounds";
function roundSource(src, marked) {
  if (countOf(src, OLD_ROUND) !== 2) throw new Error(`expected "Up to 12 funding rounds" twice (two scrolling-bar sets), found ${countOf(src, OLD_ROUND)}`);
  return src.split(OLD_ROUND).join(marked ? `<span class="fhx-new">${NEW_ROUND}</span>` : `<span>${NEW_ROUND}</span>`);
}
const revertRound = (s) => s.split(`<span>${NEW_ROUND}</span>`).join(OLD_ROUND);

const ROUND_PAGES = [
  { key: "watch", url: "/watch", rel: "01-vsl.html", out: "watch-draft.html", keyName: "apply-watch (page 25061160, builder page)" },
  { key: "thank-you", url: "/thank-you", rel: "05-thank-you.html", out: "thank-you-draft.html", keyName: "apply-thank-you (page 25063539, builder page)" },
  { key: "funding-book-call", url: "/funding-book-call", rel: "04b-book-bottom.html", top: "04a-book-top.html", out: "funding-book-call-draft.html", keyName: "apply-book (page 25062844, builder page)" },
  { key: "roadmap-book", url: "/roadmap-book", rel: join("slo", "slo-02-booking.html"), out: "roadmap-book-draft.html", keyName: "slo-297-booking (page 25516165, custom page)" },
  { key: "roadmap-thank-you", url: "/roadmap-thank-you", rel: join("slo", "slo-03-thank-you.html"), out: "roadmap-thank-you-draft.html", keyName: "slo-297-thank-you (page 25516166, custom page)" },
];

/* ---------- build every page twice: marked (the draft) and clean (what goes live) ---------- */
const CLEAN = new Map(); // path under marketing/landing-pages -> clean source
const MARKED = new Map();
{
  const clean = roadmapSource(false);
  const marked = roadmapSource(true);
  if (strip(marked) !== clean) throw new Error("/roadmap: the clean page is not the draft with the marks stripped");
  if (revertRoadmap(clean) !== SALES) throw new Error("/roadmap: the clean page differs from the live source by more than the approved edits");
  CLEAN.set(join("slo", "slo-01-sales.html"), clean);
  MARKED.set("roadmap", marked);
}
for (const p of ROUND_PAGES) {
  const live = rd(p.rel);
  const clean = roundSource(live, false);
  const marked = roundSource(live, true);
  if (strip(marked) !== clean) throw new Error(`${p.url}: the clean page is not the draft with the marks stripped`);
  if (revertRound(clean) !== live) throw new Error(`${p.url}: the clean page differs from the live source by more than the approved edits`);
  CLEAN.set(p.rel, clean);
  MARKED.set(p.key, marked);
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

/* ---------- bake the pictures in: a shared copy loads nothing from fundhub.ai ---------- */
function bake(html) {
  const urls = [...new Set(html.match(/https:\/\/fundhub\.ai\/funnel\/[A-Za-z0-9._-]+\.jpg/g) || [])];
  for (const u of urls) {
    const name = u.split("/").pop();
    const f = name.endsWith("-poster-v2.jpg") ? join(POSTERS_V2, name) : join(REPO, "public", "funnel", name);
    if (!existsSync(f)) {
      throw new Error(`picture not found: ${f}` + (name.endsWith("-v2.jpg") ? " (run: CHROMIUM_PATH=<chromium> node scripts/testimonials/render-small-thumbnails.mjs)" : ""));
    }
    html = html.split(u).join("data:image/jpeg;base64," + readFileSync(f).toString("base64"));
  }
  return html;
}

/* ---------- the marked-draft toolkit ----------
   The "hide the marks" button is a checkbox and a label, no script, so it also works where a page
   is not allowed to run scripts. Every rule that shows a mark is switched off by :checked. */
const TOOLKIT = (legend) => `
<style>
.fhx-cb{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
.fhx-banner{position:fixed;left:0;right:0;top:0;z-index:99999;background:#0B5D1E;color:#fff;font:600 12.5px/1.4 system-ui,sans-serif;padding:8px 16px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center;text-align:center}
.fhx-banner a{color:#fff;text-decoration:underline;white-space:nowrap}
.fhx-btn{display:inline-block;cursor:pointer;background:#fff;color:#0B5D1E;border-radius:6px;padding:6px 10px;font:700 12px system-ui,sans-serif;white-space:nowrap}
.fhx-btn .off{display:none}
.fhx-cb:checked ~ .fhx-banner .fhx-btn .on{display:none}
.fhx-cb:checked ~ .fhx-banner .fhx-btn .off{display:inline}
.fhx-cb:focus-visible ~ .fhx-banner .fhx-btn{outline:3px solid #fff;outline-offset:2px}
html body{padding-top:48px!important}
@media(max-width:760px){html body{padding-top:84px!important}}

/* the marks */
.fhx-sec{position:relative;outline:2px dashed #2F6FEB;outline-offset:6px;margin:34px 0}
.fhx-sec::before{content:attr(data-tag);display:block;font:700 11px/1.3 system-ui,sans-serif;letter-spacing:.04em;color:#fff;background:#2F6FEB;padding:5px 9px;border-radius:4px;margin-bottom:10px;width:max-content;max-width:100%}
ins.fhx-new,ins.fhx-moved{text-decoration:none}
ins.fhx-new,.marq-set span.fhx-new{background:rgba(22,163,74,.18);box-shadow:0 0 0 2px rgba(22,163,74,.28);border-radius:3px}
.fhx-moved{border-bottom:2px solid #2F6FEB}
.fhx-from{display:inline-block;font:700 10px/1 ui-monospace,monospace;color:#fff;background:#2F6FEB;border-radius:3px;padding:2px 4px;margin-right:4px;vertical-align:1px;font-style:normal;letter-spacing:.03em;text-transform:none}
.vslot.fhx-new{outline:3px solid #16A34A!important;outline-offset:3px}
.vslot.fhx-new::after{content:"NEW PICTURE";position:absolute;top:8px;left:8px;z-index:3;background:#0B5D1E;color:#fff;font:700 10px/1 ui-monospace,monospace;letter-spacing:.06em;padding:5px 7px;border-radius:3px;pointer-events:none}
.fhx-checkout{box-sizing:border-box;width:calc(100% - 32px);max-width:720px;margin:24px auto;padding:18px 20px;border:2px dashed #2F6FEB;border-radius:10px;background:#F3F7FF;color:#111113;font:14px/1.5 system-ui,sans-serif;display:grid;gap:6px;text-align:left}
.fhx-checkout i{color:#555}
.fhx-pagenote{max-width:900px;margin:12px auto;padding:10px 12px;border:1px solid #D4D4D8;border-radius:6px;background:#FAFAFA;color:#333;font:13px/1.45 system-ui,sans-serif}
.fhx-pagenote,.fhx-pagenote *{font-size:13px!important;line-height:1.45!important}

/* the scrolling bar is frozen so every line shows; with the marks hidden it scrolls as it does live */
.fhx-cb:not(:checked) ~ .c-wrapper .marq{overflow:visible!important}
.fhx-cb:not(:checked) ~ .c-wrapper .marq-track{animation:none!important;width:auto!important;justify-content:center;transform:none!important}
.fhx-cb:not(:checked) ~ .c-wrapper .marq-set{flex-wrap:wrap;justify-content:center;row-gap:10px;padding:0 16px}
.fhx-cb:not(:checked) ~ .c-wrapper .marq-set + .marq-set{display:none!important}

/* hide the marks: the page reads clean */
.fhx-cb:checked ~ .c-wrapper .fhx-sec{outline:0!important;margin:0!important}
.fhx-cb:checked ~ .c-wrapper .fhx-sec::before{display:none!important}
.fhx-cb:checked ~ .c-wrapper ins.fhx-new,.fhx-cb:checked ~ .c-wrapper .marq-set span.fhx-new{background:none!important;box-shadow:none!important}
.fhx-cb:checked ~ .c-wrapper .fhx-moved{border-bottom:0!important}
.fhx-cb:checked ~ .c-wrapper .fhx-from{display:none!important}
.fhx-cb:checked ~ .c-wrapper .vslot.fhx-new{outline:0!important}
.fhx-cb:checked ~ .c-wrapper .vslot.fhx-new::after{display:none!important}
.fhx-cb:checked ~ .c-wrapper .fhx-pagenote{display:none!important}
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Round 2 · ${legend}</span><label class="fhx-btn" for="fhx-hide"><span class="on">Hide the marks</span><span class="off">Show the marks</span></label><a href="index.html">All drafts</a></div>`;

function draft(html, title, legend) {
  return bake(makeStatic(html))
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace("<body>", `<body>\n<input type="checkbox" id="fhx-hide" class="fhx-cb" aria-label="Hide the marks">`)
    .replace("</body>", `${TOOLKIT(legend)}\n</body>`);
}

/* ---------- /roadmap draft ---------- */
{
  let page = MARKED.get("roadmap");
  /* checkout: keep the order summary, leave the card and Social Security form out */
  const cut0 = at(page, "<!-- ================= SPLIT-LINE");
  const cut1 = at(page, "<!-- SLOT-UTM");
  page =
    page.slice(0, cut0) +
    `<div class="fhx-checkout"><b>The checkout form sits here on the live page</b>` +
    `<span>Step 1 · Info &nbsp;→&nbsp; Step 2 · Card ($147) &nbsp;→&nbsp; Step 3 · Soft pull</span>` +
    `<i>Left out of this draft so nothing here can take a card or personal details.</i></div>\n` +
    page.slice(cut1);
  writeFileSync(join(OUT, "roadmap-draft.html"), draft(wrapFragment(page), "Draft · /roadmap", "green = new or changed · blue = new section and moved words"));
}

/* ---------- the five scrolling-bar drafts ---------- */
for (const p of ROUND_PAGES) {
  let html;
  const note =
    `<div class="fhx-pagenote">The scrolling bar is frozen here so every line shows. Live, it scrolls. Press "Hide the marks" and it scrolls again. Nothing else on this page changes.</div>`;
  const withNote = (src) => src.replace(/(<div class="marq" aria-hidden="true">[\s\S]*?<\/div><\/div><\/div>)/, (m) => m + note);
  if (p.top) {
    html = wrapFragment(
      rd(p.top) +
        `\n<div class="fhx-checkout"><b>The booking calendar sits here on the live page</b><i>It is the ClickFunnels calendar. Left out of this draft so nothing here can book a call.</i></div>\n` +
        withNote(MARKED.get(p.key)),
    );
  } else {
    html = wrapFragment(withNote(MARKED.get(p.key)));
  }
  if (!html.includes("fhx-pagenote")) throw new Error(`no scrolling bar on ${p.url}`);
  writeFileSync(join(OUT, p.out), draft(html, `Draft · ${p.url}`, "green = new or changed"));
}

/* ============================================================
   The 23 /roadmap fixes, checked against slo-01-sales.html on 2026-10-05
   ============================================================ */
const CUT = "You cut it on 2026-10-01";
const FIXES = [
  [1, "Move What You Get under the testimonials", "gone", `${CUT} (What You Get). The page is now headline, video, How It Works, testimonials, guarantee, FAQ, checkout.`],
  [2, "Cut the good-credit section and fold its points into the 800-score answer", "done", "The section was cut 2026-10-01. The first FAQ answer now covers the 800-score question."],
  [3, "Gene's \"over three years\" on screen one", "left", "You said leave Gene's caption as it is. The screen-one line was cut 2026-10-01. \"Over three years\" stays in his caption and in the small line on his picture, because the repo has no number for how soon his first approval came."],
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
  [22, "Tone down the big headlines on the testimonial videos", "draft", "The three cover pictures now carry the same words on one small line near the bottom, with the name and business type above it. Green outlines on /roadmap."],
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
  for (const [n, ok] of checks) if (!ok) throw new Error(`fix ${n}: the page no longer matches the status written for it`);
}

/* ============================================================
   The index: what changed in green, what "push it" does, the drafts, the 23 fixes
   ============================================================ */
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ROUND_LINE = "\"Up to 12 funding rounds\" now reads \"3 to 6 funding rounds.\"";
const SMALL = (kicker, words) =>
  `The big headline is now one small line near the bottom, "${words}." The name and business type sit above it: ${kicker}.`;
const GREEN = {
  roadmap: [
    ["How It Works", `The 5 steps are now the 7 steps of your 10/2 note, in its order: ${NOTE_STEPS.map((s) => s.name).join(", ")}.`],
    ["How It Works", "Each step now opens with the note's own line, for example \"Pull your report and make sure everything on it is accurate and in line.\""],
    ["How It Works", "Every word of the old paragraphs moved under a step, word for word (blue underline, tagged with the old step number). The 5 bold one-liners are gone."],
    ["Colin's picture", SMALL("COLIN SCHMIDT · BUSINESS OWNER", "Around $225,000 in funding")],
    ["Gene's picture", SMALL("GENE · OWNER, THREE LLCS", "About $420,000 over three years")],
    ["Sarah's picture", SMALL("SARAH · SALES TEAM AT FUNDHUB", "Set to be approved for around $80,000") + " Her strip sits lower than the other two because her video has a caption burned in at that height on every frame I checked, and the strip has to cover it."],
  ],
  watch: [["The scrolling bar", ROUND_LINE]],
  "thank-you": [["The scrolling bar", ROUND_LINE]],
  "funding-book-call": [["The scrolling bar", ROUND_LINE]],
  "roadmap-book": [["The scrolling bar", ROUND_LINE]],
  "roadmap-thank-you": [["The scrolling bar", ROUND_LINE]],
};
const DRAFTS = [
  { key: "roadmap", url: "/roadmap", file: "roadmap-draft.html", change: "How It Works is now the 7 steps of your 10/2 note. The three testimonial pictures carry their headline on one small line." },
  ...ROUND_PAGES.map((p) => ({ key: p.key, url: p.url, file: p.out, change: ROUND_LINE })),
];
const PUSH = [
  "I strip every mark. The clean pages come from this same script. The script proves that each clean page is its draft with only the marks removed, and that it differs from today's live page only by the changes on this page.",
  "The three new pictures go live first: copied to the site's picture folder and shipped from the Mac, because the /roadmap page points to them. The picture links in the testimonial data file change at the same time.",
  "Then the pages go to ClickFunnels by API, never by hand. /roadmap, /roadmap-book and /roadmap-thank-you are full custom pages (keys slo-297-sales, slo-297-booking, slo-297-thank-you). /watch, /thank-you and /funding-book-call are builder pages: the push script cannot replace their body, so each gets a small marked head block that swaps the words as the page loads, the way the /watch line under the headline was changed (three new keys, not written yet). Never a full replace of a builder page.",
  "I check each live page and write one new row in the change log with the real push time. The push saves a copy of each old page first.",
];
const CHIP = { done: ["DONE", "ok"], draft: ["IN THE DRAFT", "ok"], left: ["LEFT AS IS", "mid"], partly: ["PARTLY", "mid"], gone: ["NO LONGER TRUE", "dim"] };
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
.k1 .sw.b{outline:2px dashed var(--blue);outline-offset:-2px}
.k1 .sw.g{background:var(--green-bg);box-shadow:0 0 0 2px var(--green) inset}
.k1 .sw.h{background:var(--fg)}
.k1 h2{font:700 11px/1.3 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:40px 0 12px}
.k1 .list{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.k1 .list li{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--green);border-radius:10px;padding:11px 14px}
.k1 .list b{font-weight:600}
.k1 .list span{color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.k1 .left{margin:10px 0 0;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:var(--dim-bg);color:var(--muted);font-size:14px}
.k1 .push{margin:0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:p}
.k1 .push li{counter-increment:p;display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.k1 .push li::before{content:counter(p);font:700 13px/28px var(--mono);text-align:center;width:28px;height:28px;border-radius:50%;background:var(--blue-bg);color:var(--blue)}
.k1 .after{margin:14px 0 0;color:var(--muted);font-size:14px;max-width:70ch}
.k1 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:12px}
.k1 .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;display:grid;gap:10px;align-content:start;min-width:0}
.k1 .card .u{font:600 15px/1.3 var(--mono);word-break:break-all}
.k1 .card .c{margin:0;color:var(--muted);font-size:14px}
.k1 .card .n{font:600 12px/1 var(--mono);color:var(--green)}
.k1 .open{display:inline-block;justify-self:start;background:var(--fg);color:var(--bg);text-decoration:none;font-weight:600;font-size:14px;padding:10px 14px;border-radius:8px}
.k1 .open:focus-visible,.k1 summary:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.k1 details{border-top:1px solid var(--line);padding-top:8px}
.k1 summary{cursor:pointer;font-size:13px;color:var(--muted)}
.k1 .m{margin:10px 0 0;padding:10px 12px;border-left:4px solid var(--green);background:var(--green-bg);border-radius:4px;font-size:13.5px}
.k1 .m b{font-weight:600}
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
const greenHtml = (key) =>
  (GREEN[key] || []).map(([where, what]) => `<div class="m"><b>${esc(where)}</b><div>${esc(what)}</div></div>`).join("");
const nGreen = (key) => (GREEN[key] || []).length;
const INDEX_BODY = `
<div class="k1">
  <span class="pill">Draft · not live</span>
  <h1>Fundhub page drafts</h1>
  <p class="lede">Round 2 of 2, 2026-10-05. Your five picks are written into the six drafts. Every new or changed line is green. Open a draft and press "Hide the marks" at the top to read it clean. Nothing here is on a live page, and nothing was pushed.</p>
  <ul class="legend">
    <li><span class="sw g"></span>Green: new or changed</li>
    <li><span class="sw b"></span>Blue: new section, and old words moved word for word</li>
    <li><span class="sw h"></span>"Hide the marks" button: reads the page clean</li>
  </ul>

  <h2>What changed, in green</h2>
  <ul class="list">
    ${Object.keys(GREEN).flatMap((k) => GREEN[k].map(([where, what]) => `<li><b>${esc(DRAFTS.find((d) => d.key === k).url)} · ${esc(where)}</b><span>${esc(what)}</span></li>`)).join("\n    ")}
  </ul>
  <p class="left">Not changed, your pick: Gene's caption stays as it is.</p>

  <h2>When you say "push it"</h2>
  <ol class="push">
    ${PUSH.map((t) => `<li><div>${esc(t)}</div></li>`).join("\n    ")}
  </ol>
  <p class="after">Until you say it, nothing is live, the pull request stays a draft, and the live pages are untouched.</p>

  <h2>The drafts</h2>
  <div class="grid">
    ${DRAFTS.map((d) => {
      const n = nGreen(d.key);
      return `<div class="card"><div class="u">${d.url}</div><p class="c">${esc(d.change)}</p><div class="n">${n} green change${n === 1 ? "" : "s"}</div><a class="open" href="${d.file}">Open the draft</a><details><summary>The green changes, in words</summary>${greenHtml(d.key)}</details></div>`;
    }).join("\n    ")}
  </div>

  <h2>The 23 /roadmap fixes, checked against the page today</h2>
  <div class="sum"><span>${count("done")} done</span><span>${count("draft")} in the draft</span><span>${count("left")} left as is</span><span>${count("partly")} partly</span><span>${count("gone")} no longer true</span></div>
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

/* ---------- --clean <dir>: the push-ready pages, no mark anywhere ---------- */
const ci = process.argv.indexOf("--clean");
if (ci >= 0) {
  const target = process.argv[ci + 1];
  if (!target || target.startsWith("--")) throw new Error("--clean needs a folder: --clean <dir>");
  const dir = resolve(target);
  if (dir === resolve(LP) && !process.argv.includes("--push-approved")) {
    throw new Error("that folder holds the live page sources. Chris has not said push it yet, so nothing is written. (After he does: add --push-approved.)");
  }
  for (const [rel, html] of CLEAN) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), html);
  }
  console.log(`wrote ${CLEAN.size} clean pages under ${dir}: ${[...CLEAN.keys()].join(", ")}`);
}

console.log(
  `built ${DRAFTS.length} drafts + index. Green changes: ${DRAFTS.map((d) => `${d.url} ${nGreen(d.key)}`).join(", ")}. ` +
    `Proved: moved words intact, clean = draft minus marks, clean differs from live only by the approved edits (${CLEAN.size} pages). ` +
    `Fixes: ${count("done")} done, ${count("draft")} in the draft, ${count("left")} left as is, ${count("partly")} partly, ${count("gone")} no longer true.`,
);
