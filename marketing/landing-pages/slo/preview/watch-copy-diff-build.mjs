// Builds the marked before/after copy page for apply.fundhub.ai/watch.
// Reads nothing live and writes nothing live: it only writes watch-copy-diff.html next to this file.
// "Now" text was read off the live page on 2026-10-01. Path copy lives in public/funnel/funding-paths.js,
// the proof row in public/funnel/watch-proof.js, everything else in the ClickFunnels builder page 25061160.
// Testimonial words come from marketing/testimonials/testimonials.json (status: approved).
// Run: node marketing/landing-pages/slo/preview/watch-copy-diff-build.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const SECTIONS = [
  {
    id: "headline",
    title: "Headline",
    where: "ClickFunnels builder page",
    rows: [
      ["Small line above", "For Business Owners Who Need Real, High Volume Funding", "For business owners who need real money to grow"],
      ["Headline", "Get $50,000 to $1,000,000 in Funding in 14 Days or Less", "Get $50,000 to $1,000,000 for your business in 14 days or less"],
    ],
  },
  {
    id: "subheadline",
    title: "Subheadline",
    where: "ClickFunnels builder page",
    rows: [
      ["Line under headline", "Find out exactly what your business qualifies for in one call", "Find out how much your business can get. It takes one call."],
    ],
  },
  {
    id: "vsl",
    title: "VSL (the video and the words around it)",
    where: "ClickFunnels builder page",
    note: "The words inside the video are not on this page, so they are not changed here. Only the words around it.",
    rows: [
      ["Over the video", "Tap for sound", "Tap for sound"],
      ["Button", "Get Started", "Get Started"],
      ["Under the button", "10-second application · Soft pull · Zero score impact", "Takes 10 seconds. A soft check. Your score stays the same."],
    ],
  },
  {
    id: "how",
    title: "How it Works",
    where: "public/funnel/funding-paths.js and the ClickFunnels builder page",
    rows: [
      ["Big line", "One call. Three roads. Nobody gets turned away.", "One call. Three paths. Nobody gets turned away."],
      ["Under it", "Funding now, fix the file first, or learn to do it yourself. Soft pull only. No obligation.", "Get funded now, fix your credit first, or learn to do it yourself. Soft check only. No strings."],
      ["Small line", "What happens after you book", "What happens next"],
      ["Heading", "Your file decides where you start", "Your credit reports show us where to start"],
      ["Paragraph", "On the call, your advisor runs a tri-bureau soft pull plus an Experian business report with you. What your file shows puts you on one of these three paths.", "On the call, your helper looks at your credit reports with you. They look at your business report too. It is a soft check, so your score stays the same. What they see puts you on one of three paths."],
      ["Step 1", "Apply — 10-second application", "Apply. It takes 10 seconds."],
      ["Step 2", "Your call — Soft pull with your advisor", "Your call. We look at your reports together."],
      ["Step 3", "Your path — Where your file fits today", "Your path. We pick the best plan for you today."],
      ["Sample screen: top", "Analysis complete · Sample file A", "All done. This is a sample."],
      ["Sample screen: line 1", "Pulling Experian, Equifax, TransUnion and Experian Business", "Getting your 3 credit reports and your business report"],
      ["Sample screen: line 2", "Reviewing the file the way a lender does", "Looking at it the way a lender would"],
      ["Sample screen: line 3", "Checking personal data across all three bureaus", "Checking your info on all 3 reports"],
      ["Sample screen: line 4", "Checking business codes", "Checking your business codes"],
      ["Sample screen: line 5", "Counting recent hard inquiries", "Counting new hard credit checks"],
      ["Sample screen: line 6", "Matching against thousands of lenders", "Matching you with lenders"],
      ["Sample screen: line 7", "Comparing to thousands of past approvals", "Looking at past approvals like yours"],
      ["Sample screen: labels", "Readiness · Lenders that fit · Where this file fits today", "How ready you are. Lenders that fit. Where you fit today."],
      ["Under the sample", "Sample files. On your call, UnderwriteIQ runs this on your own file with your advisor. Path 3 is open to anyone who'd rather do the work themselves, whatever the file shows.", "These are sample files. On your call, we run this on your real file. Path 3 is open to anyone who wants to do the work on their own, no matter what the file shows."],
      ["Path 1: tag", "Your file is ready", "You are ready"],
      ["Path 1: name", "Funding in rounds", "Funding in rounds"],
      ["Path 1: text", "UnderwriteIQ matches your file to the 30 to 50 lenders that fit it. We apply in rounds and remove the new inquiries before the next round goes out, so every round starts clean.", "We find the 30 to 50 lenders that fit you best. We apply in rounds. Before each new round, we remove the new credit checks from the last one. Every round starts clean."],
      ["Path 1: sample", "Sample funding sequence · 6 inquiries removed", "Sample funding plan. 6 credit checks removed."],
      ["Path 1: footer", "Your first applications go out within 72 business hours.", "We send your first applications in 72 business hours."],
      ["Path 2: tag", "Something is holding you back", "Something is in your way"],
      ["Path 2: name", "Optimize, then fund", "Fix it first, then get funded"],
      ["Path 2: text", "We show you exactly what's holding your file back, optimize your credit for you, and fund you once your file is ready.", "We show you what is holding you back. We clean up your credit for you. When you are ready, we get you funded."],
      ["Path 2: sample", "Hard inquiries · Outdated personal data · Negative items · Utilization", "Hard credit checks. Old info on your reports. Bad marks. How much of your limit you use."],
      ["Path 2: footer", "Once your file is ready, you move to funding.", "When you are ready, you move on to funding."],
      ["Path 3: tag", "You'd rather do it yourself", "You want to do it yourself"],
      ["Path 3: name", "Your step-by-step plan", "Your plan. One step at a time."],
      ["Path 3: text", "You get the exact steps in the right order, help setting up your companies, and a detailed accountability system that walks you through every step.", "You get every step in the right order. We help you set up your companies. A tracker walks you through each step."],
      ["Path 3: sample", "Funding you can qualify for · Pay down balances in the right order · Fix how your companies are set up · Open or age companies · Mail your optimization letters · File ready for funding", "Funding you could get. Pay down balances in the right order. Set up your companies the right way. Open new companies or let them grow older. Mail your cleanup letters. Ready for funding."],
      ["Path 3: footer", "When your file is ready, we go get the funding with you, or you can do it yourself.", "When you are ready, we get the funding with you, or you can do it yourself."],
    ],
  },
  {
    id: "testimonials",
    title: "Testimonials",
    where: "public/funnel/watch-proof.js; captions from marketing/testimonials/testimonials.json",
    note: "Today the three video slots are empty placeholders. The captions below are the real approved ones, said in plain words. Nothing is added that the caption did not already say. The $ approval cards keep their amounts exactly.",
    rows: [
      ["Proof row heading", "Real approvals. Real screenshots.", "Real approvals. Real proof."],
      ["Card label", "Client win — Approved for $20,000 … $500,000", "Client win. Approved for $20,000 … $500,000. (amounts unchanged)"],
      ["Video heading", "From our clients", "From our clients"],
      ["Video 1", "[ VIDEO TESTIMONIAL 1 ]", "Colin ran a funding company for 12 years. He says he does not praise people in this business. But he went through our roadmap and would not change one thing."],
      ["Video 2", "[ VIDEO TESTIMONIAL 2 ]", "Gene owns three LLCs. He got about $420,000 in business funding over three years."],
      ["Video 3", "[ VIDEO TESTIMONIAL 3 ]", "Sarah is on our sales team. Her credit was in bad shape. She ran the roadmap, saw what to fix, and is set to be approved for about $80,000."],
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    where: "NEW. The page has no FAQ today.",
    note: "Every answer below comes from words already on this page or its footer. Nothing new is promised.",
    rows: [
      ["Question 1", "", "Will this hurt my credit score?"],
      ["Answer 1", "", "No. We use a soft check. Your score stays the same."],
      ["Question 2", "", "How long does the application take?"],
      ["Answer 2", "", "About 10 seconds."],
      ["Question 3", "", "What happens on the call?"],
      ["Answer 3", "", "Your helper looks at your credit reports and your business report with you. Then you pick one of three paths."],
      ["Question 4", "", "What are the three paths?"],
      ["Answer 4", "", "Get funded now. Fix your credit first. Or learn to do it yourself."],
      ["Question 5", "", "What if my credit is not great?"],
      ["Answer 5", "", "Nobody gets turned away. We show you what is holding you back. Then we help you clean it up."],
      ["Question 6", "", "What are funding rounds?"],
      ["Answer 6", "", "We apply to the lenders that fit you in rounds. You can have up to 12. Before each new round, we remove the new credit checks from the last one."],
      ["Question 7", "", "How fast do the applications go out?"],
      ["Answer 7", "", "We send your first applications in 72 business hours."],
      ["Question 8", "", "Are you a bank or a lender?"],
      ["Answer 8", "", "No. Fundhub is not a bank or a lender. We help you apply. The amounts you see are the most you could get. They are not an offer."],
      ["Question 9", "", "Do you sell my info?"],
      ["Answer 9", "", "No. We never sell your info."],
    ],
  },
];

// ---- reading grade (Flesch-Kincaid) ----
function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}
function grade(lines) {
  const text = lines.filter(Boolean).map((l) => l.replace(/[$,]\d[\d,]*/g, "x").replace(/\$[\d,]+/g, "x")).map((l) => (/[.!?]$/.test(l.trim()) ? l : l.trim() + ".")).join(" ");
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (!words.length) return null;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return Math.max(0, 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59);
}

// ---- word diff ----
function diffWords(a, b) {
  const A = a.split(/(\s+)/).filter((x) => x !== ""), B = b.split(/(\s+)/).filter((x) => x !== "");
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i].toLowerCase() === B[j].toLowerCase() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const left = [], right = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i].toLowerCase() === B[j].toLowerCase()) { left.push([A[i], 0]); right.push([B[j], 0]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { left.push([A[i], 1]); i++; }
    else { right.push([B[j], 1]); j++; }
  }
  while (i < n) left.push([A[i++], 1]);
  while (j < m) right.push([B[j++], 1]);
  return { left, right };
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const render = (parts, cls) => parts.map(([t, d]) => (d && t.trim() ? `<${cls}>${esc(t)}</${cls}>` : esc(t))).join("");

let secHtml = "";
const summary = [];
for (const s of SECTIONS) {
  const gOld = grade(s.rows.map((r) => r[1]).filter((t) => t && !t.startsWith("[")));
  const gNew = grade(s.rows.map((r) => r[2]));
  summary.push({ title: s.title, gOld, gNew });
  let rows = "";
  for (const [label, oldT, newT] of s.rows) {
    const isNew = !oldT;
    const placeholder = oldT.startsWith("[ VIDEO");
    let L, R;
    if (isNew || placeholder) {
      L = isNew ? `<span class="none">nothing here today</span>` : `<span class="none">${esc(oldT)} (empty slot)</span>`;
      R = `<ins>${esc(newT)}</ins>`;
    } else {
      const d = diffWords(oldT, newT);
      L = render(d.left, "del");
      R = render(d.right, "ins");
    }
    const same = oldT && oldT.toLowerCase() === newT.toLowerCase();
    rows += `<div class="row${same ? " same" : ""}"><div class="lab">${esc(label)}${same ? " · no change" : ""}</div><div class="cell now">${L}</div><div class="cell new">${R}</div></div>`;
  }
  const fmt = (g) => (g == null ? "–" : g.toFixed(1));
  secHtml += `<section id="${s.id}"><h2>${esc(s.title)} <span class="g">reading grade ${fmt(gOld)} → <b>${fmt(gNew)}</b></span></h2><p class="where">Lives in: ${esc(s.where)}</p>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}<div class="head"><div></div><div>NOW (live)</div><div>NEW (draft)</div></div>${rows}</section>`;
}

const sumRows = summary.map((x) => `<tr><td>${esc(x.title)}</td><td>${x.gOld == null ? "–" : x.gOld.toFixed(1)}</td><td><b>${x.gNew.toFixed(1)}</b></td></tr>`).join("");

const html = `<title>Watch Page Copy Diff</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1c1c1a;--mute:#6b6b66;--line:#e3e3de;--del-bg:#fde2e2;--del:#b42318;--ins-bg:#d9f5e3;--ins:#0b6b36}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141413;--card:#1e1e1c;--ink:#ecece8;--mute:#a0a09a;--line:#34342f;--del-bg:#4a1f1f;--del:#ff9b92;--ins-bg:#16402a;--ins:#7fe3a6}}
:root[data-theme="dark"]{--bg:#141413;--card:#1e1e1c;--ink:#ecece8;--mute:#a0a09a;--line:#34342f;--del-bg:#4a1f1f;--del:#ff9b92;--ins-bg:#16402a;--ins:#7fe3a6}
*{box-sizing:border-box}body{background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:20px;margin:36px 0 4px}.sub{color:var(--mute);margin:0 0 20px}
.g{font-size:13px;font-weight:400;color:var(--mute);margin-left:8px;white-space:nowrap}
.where,.note{color:var(--mute);font-size:14px;margin:2px 0}
.legend{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;font-size:14px}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:14px}
td,th{padding:8px 12px;text-align:left;border-bottom:1px solid var(--line)}
.head,.row{display:grid;grid-template-columns:130px 1fr 1fr;gap:0;align-items:stretch}
.head{margin-top:12px;font-size:12px;letter-spacing:.06em;color:var(--mute);padding:0 0 4px}
.row{background:var(--card);border:1px solid var(--line);border-bottom:none}.row:last-of-type{border-bottom:1px solid var(--line)}
.lab{padding:10px;font-size:12px;color:var(--mute);border-right:1px solid var(--line)}
.cell{padding:10px 12px}.now{border-right:1px solid var(--line)}
.row.same .cell{color:var(--mute)}
del,.del{background:var(--del-bg);color:var(--del);text-decoration:line-through;border-radius:3px;padding:0 2px}
ins{background:var(--ins-bg);color:var(--ins);text-decoration:none;border-radius:3px;padding:0 2px;font-weight:600}
.none{color:var(--mute);font-style:italic}
@media(max-width:700px){.head{display:none}.row{grid-template-columns:1fr}.lab{border-right:none;border-bottom:1px solid var(--line)}.now{border-right:none;border-bottom:1px solid var(--line)}.now::before{content:"NOW  ";font-size:11px;color:var(--mute)}.new::before{content:"NEW  ";font-size:11px;color:var(--mute)}}
.box{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:12px 0;font-size:14px}
</style><main>
<h1>/watch copy: now vs new</h1>
<p class="sub">apply.fundhub.ai/watch · draft only · nothing on the live page has changed</p>
<div class="legend"><span><del>red, crossed out</del> = words removed</span><span><ins>green</ins> = words added</span><span>grey row = no change</span></div>
<table><tr><th>Section</th><th>Grade now</th><th>Grade new</th></tr>${sumRows}</table>
<div class="box"><b>Left alone on purpose:</b> the $ approval cards (amounts, screenshots), the trust bar under the page, and the legal disclaimers. You did not name them.</div>
${secHtml}
<div class="box"><b>If you say push it:</b> the How it Works and Testimonials words ship from this repo. The headline, subheadline and button words live in the ClickFunnels builder page, which cannot be fully replaced, so those go in as targeted edits. Marks never go live.</div>
</main>`;

const out = join(here, "watch-copy-diff.html");
writeFileSync(out, html);
console.log("wrote", out);
for (const x of summary) console.log(x.title.padEnd(48), (x.gOld == null ? "–" : x.gOld.toFixed(1)).padStart(5), "→", x.gNew.toFixed(1));

const over = [];
for (const s of SECTIONS) for (const [label, , n] of s.rows) { const g = grade([n]); if (g != null && g > 5) over.push(`${s.title} / ${label}: ${g.toFixed(1)}`); }
console.log(over.length ? "Rows over grade 5:\n" + over.join("\n") : "No row over grade 5");
