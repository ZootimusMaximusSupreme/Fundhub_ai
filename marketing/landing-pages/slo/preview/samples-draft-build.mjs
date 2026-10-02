/* /roadmap "See a sample" previews — marked DRAFT for Chris (2026-10-02).
 *
 * Chris's spec (2026-10-02): each sample shows the most compelling real part of
 * that document, blurred at a logical break; data from the real UnderwriteIQ
 * engine (run on the simulated test file, never a real client); the lender
 * list shows 12 legit banks with logos and blurs the bureau. Board:
 * ops/workflows/2026-10-02-roadmap-sample-content.md.
 *
 * Reads ../slo-01-sales.html WITHOUT changing it and writes one self-contained
 * review page: the six samples as the buyer will see them, plus the order
 * summary copy changes. Green = new, amber = needs Chris's call, red = removed.
 * A button hides every mark.
 *
 * Run:  node marketing/landing-pages/slo/preview/samples-draft-build.mjs
 * Out:  samples-draft-share.html (publish as the shared Artifact link)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "slo-01-sales.html"), "utf8");

/* The page's own CSS, so every sample renders exactly as it will live. */
const css = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");

/* The sample dictionary the live viewer uses. */
const pStart = page.indexOf("      var P={");
const pEnd = page.indexOf("\n      };\n", pStart);
if (pStart < 0 || pEnd < 0) throw new Error("sample dictionary not found");
const P = new Function(`${page.slice(pStart, pEnd)}\n};return P;`)();

/* The order summary block, as it will ship. */
const sumStart = page.indexOf('<div class="sum">');
const sumEnd = page.indexOf("</div>", page.indexOf('<div class="tot">', sumStart)) + "</div>".length + "\n      </div>".length;
const summary = page.slice(sumStart, sumEnd);

const SAMPLES = [
  ["snapshot", "How Much You Qualify For", "green", "Today $199,350 and after optimization $221,500 come from the UnderwriteIQ engine run on our test file. Blur starts at the next section."],
  ["analysis", "Credit Analysis Report", "green", "Real engine output: the three scores and the cards costing money. Blur starts at Negative items."],
  ["roadmap", "Credit Optimization Roadmap", "green", "Month 1 and Month 2 action items, word for word from the engine. Months 3 to 6 are blurred."],
  ["pack", "Dispute Letter Pack", "green", "One complete Round 1 letter written by the engine, then all six rounds with locks."],
  ["lenders", "Bank & Lender Match List", "green", "12 banks from our lender book, real logos. The bureau column is blurred."],
  ["duplication", "Business Duplication Map", "amber", "Nothing in UnderwriteIQ builds this map yet. This is the old hand-written sample. Keep it, or remove the link?"],
];

const card = ([key, name, mark, note], i) => `
  <section class="row" id="s-${key}">
    <header class="row-h"><span class="num">${i + 1}</span><h2>${name}</h2></header>
    <p class="mk-note mk-${mark}">${note}</p>
    <div class="fh-root"><div class="lb-card draft-card mk-box mk-${mark}">
      <div class="lb-body">${P[key]}<div class="wm wm-lb">SAMPLE</div></div>
      <div class="lb-note">Sample file for a made-up client. Yours is built from your own credit file. Estimates, not an offer of credit.</div>
    </div></div>
  </section>`;

const prose = "<p>$297. Soft pull. Ten seconds. Everything built from your own credit data.</p>";
if (!page.includes(prose)) throw new Error("checkout prose line moved");
const marked = `<div class="prose">${prose.replace("</p>", ' <del class="mk-del">One payment, no contract.</del></p>')}</div>` + summary
  .replace('<span class="tl">Get approved for the most funding</span>',
    '<span class="tl"><span class="mk-inline mk-green">Get approved for the most funding</span> <del class="mk-del">Everything above &middot; one payment, no contract</del></span>');

/* Checkout step 1, as it will ship: the blue bar instead of "Step 1 of 3". */
const cfwStart = page.indexOf('<div class="cfw" id="fhw">');
const s1End = page.indexOf("</form>", page.indexOf('<form class="cfw-step s1 on"')) + "</form>".length;
if (cfwStart < 0 || s1End < 7) throw new Error("buy box not found");
const step1 = page.slice(cfwStart, s1End)
  .replace('<div class="cfw-progress"', '<div class="mk-inline mk-green" style="display:block;padding:4px 0"><del class="mk-del" style="display:block;text-align:center;margin:0 0 6px;font-size:13px">Step 1 of 3</del><div class="cfw-progress"')
  .replace('<i></i></div>', '<i></i></div></div>') + "</div>";

const out = `<title>Roadmap Sample Previews</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${css}
/* review layer: single light look, matches the live page */
:root{--rv-bg:#F6F6F4;--rv-ink:#111113;--rv-dim:#5B5B66;--rv-green:#15803D;--rv-amber:#B45309;--rv-red:#B91C1C;--rv-line:#E4E4E7;color-scheme:light}
body{background:var(--rv-bg);color:var(--rv-ink);font-family:'Inter',system-ui,-apple-system,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding-inline:16px;padding-block:28px 64px}
.top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between}
.top h1{font-size:24px;font-weight:800;letter-spacing:-.02em;text-wrap:balance;margin:0}
.top p{color:var(--rv-dim);margin:6px 0 0;font-size:14px;line-height:1.5;max-width:52ch}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0 6px;font-size:12.5px;color:var(--rv-dim)}
.legend b{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.toggle{font:600 13px 'Inter',sans-serif;background:var(--rv-ink);color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer}
.toggle:focus-visible{outline:3px solid var(--rv-green);outline-offset:2px}
.row{margin-top:40px}
.row-h{display:flex;align-items:center;gap:10px}
.row-h h2{font-size:18px;font-weight:700;margin:0;letter-spacing:-.01em}
.num{font-family:'JetBrains Mono',monospace;font-size:11px;border:1px solid var(--rv-line);border-radius:5px;padding:3px 7px;color:var(--rv-dim);background:#fff}
.mk-note{font-size:13.5px;line-height:1.5;margin:8px 0 12px;padding:9px 12px;border-radius:8px;background:#fff;border-left:4px solid}
.mk-note.mk-green{border-color:var(--rv-green)} .mk-note.mk-amber{border-color:var(--rv-amber)}
.fh-root .draft-card{margin:0;max-height:none;overflow:visible;width:auto;max-width:none}
.fh-root .draft-card .wm-lb{position:absolute;top:30%}
.mk-box.mk-green{outline:3px solid var(--rv-green);outline-offset:3px}
.mk-box.mk-amber{outline:3px dashed var(--rv-amber);outline-offset:3px}
.mk-inline.mk-green{outline:2px solid var(--rv-green);outline-offset:2px;border-radius:3px}
.mk-del{color:var(--rv-red);text-decoration:line-through;margin-left:6px}
.sumwrap .fh-root .sum{margin-top:12px}\n.cfwrap{background:#F2F2F2;border:1px solid var(--rv-line);border-radius:10px}\n.cfwrap .cfw-step.s1{display:block}
body.clean .mk-note,body.clean .mk-del,body.clean .legend{display:none}
body.clean .mk-box,body.clean .mk-inline{outline:0}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<div class="wrap">
  <div class="top">
    <div>
      <h1>Roadmap sample previews · draft</h1>
      <p>What a buyer sees when they tap "See a sample" on /roadmap. Nothing here is live. It goes live when you say push.</p>
    </div>
    <button class="toggle" id="toggle-marks" type="button">Hide marks</button>
  </div>
  <div class="legend"><span><b style="background:var(--rv-green)"></b>New</span><span><b style="background:var(--rv-amber)"></b>Your call</span><span><b style="background:var(--rv-red)"></b>Removed</span></div>

  <section class="row sumwrap" id="s-summary">
    <header class="row-h"><span class="num">0</span><h2>Order summary</h2></header>
    <p class="mk-note mk-green">"One payment, no contract" is gone from both lines. The line beside $297 is new.</p>
    <div class="fh-root">${marked}</div>
  </section>
  <section class="row" id="s-stepbar">
    <header class="row-h"><span class="num">7</span><h2>Checkout step bar</h2></header>
    <p class="mk-note mk-green">"Step 1 of 3" words are gone. A thin blue bar shows progress instead, the same look as the /apply survey bar. It fills a third per step.</p>
    <div class="cfwrap">${step1}</div>
  </section>
${SAMPLES.map(card).join("\n")}
</div>
<script>
(function(){
  var b=document.getElementById('toggle-marks');
  b.addEventListener('click',function(){var on=document.body.classList.toggle('clean');b.textContent=on?'Show marks':'Hide marks';});
  document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.sp-go');if(a){e.preventDefault();document.getElementById('s-summary').scrollIntoView({behavior:'smooth'});}});
})();
</script>
`;

/* The Artifact viewer blocks outside images, so the lender logos ride along
   as data URIs from public/assets/lenders/ (the same files fundhub.ai serves). */
const repo = join(here, "..", "..", "..", "..");
const shared = out.replace(/https:\/\/fundhub\.ai\/assets\/lenders\/([a-z0-9-]+\.png)/g, (_, f) => {
  const buf = readFileSync(join(repo, "public", "assets", "lenders", f));
  const mime = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}).replace(/ loading="lazy"/g, "");

writeFileSync(join(here, "samples-draft-share.html"), shared);
console.log(`wrote samples-draft-share.html (${(shared.length / 1024).toFixed(0)} KB), ${SAMPLES.length} samples`);
