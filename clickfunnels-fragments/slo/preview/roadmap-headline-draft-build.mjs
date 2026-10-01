/* Roadmap page — new headline and subheadline, marked DRAFT.
 *
 * Chris, 2026-10-01: "Ill Show you how to get funding forever! You need anyone
 * to fund you ever again (headline / subheadline)" — for /roadmap.
 * "You need anyone" is read as "You'll never need anyone".
 *
 * Reads the live fragment (../slo-01-sales.html) WITHOUT changing it. The old
 * headline stays on the draft in red, crossed out; the new headline and the new
 * subheadline are green. The banner button hides the marks for a clean read.
 *
 * Run:  node clickfunnels-fragments/slo/preview/roadmap-headline-draft-build.mjs [--share] [--live]
 * Out:  01-sales-headline-draft.html  the draft in the CF harness
 *       --share  01-sales-headline-share.html, self-contained, for the shared link
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

if (process.argv.includes("--live")) {
  let live = s.replace(OLD_H1, `<h1>${NEW_H1}</h1>\n      <p class="fh-subhead">${NEW_SUB}</p>`);
  live += `\n<style>\n/* New headline, 2026-10-01 — built by clickfunnels-fragments/slo/preview/roadmap-headline-draft-build.mjs */\n${SUB_CSS}\n</style>\n`;
  writeFileSync(LIVE_FILE, live);
  console.log("wrote the live fragment ../slo-01-sales.html");
  process.exit(0);
}

const G = (t) => `<span class="fhx-new">${t}</span>`;
let draft = s.replace(OLD_H1,
  `<p class="fhx-old">${OLD_H1.replace(/<\/?h1>/g, "")}</p>\n` +
  `      <h1>${G(NEW_H1)}</h1>\n      <p class="fh-subhead">${G(NEW_SUB)}</p>`);

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
</style>
<div class="fhx-banner"><span>DRAFT, NOT LIVE · Red = old headline · Green = new headline and subheadline</span><button type="button" id="fhx-toggle">Hide the marks</button></div>
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
  let share = draft;
  const cut0 = share.indexOf("<!-- ================= SPLIT-LINE");
  const cut1 = share.indexOf("<!-- SLOT-UTM");
  if (cut0 < 0 || cut1 < 0) throw new Error("checkout markers not found");
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
  writeFileSync(join(here, "01-sales-headline-share.html"), head + share);
  console.log(`built 01-sales-headline-share.html (${urls.length} pictures baked in)`);
}
