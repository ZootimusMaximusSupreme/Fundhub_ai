// Builds the marked draft of apply.fundhub.ai/thank-you (owner law: page-edits-marked-draft).
// Reads the live fragment; never changes it. Writes marketing/landing-pages/preview/05-thank-you-draft.html.
// The draft loads the same live footer scripts the page loads, then marks what changes.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const frag = readFileSync(join(ROOT, "marketing/landing-pages/05-thank-you.html"), "utf8");

const MARK_CSS = `<style>
.fhm-red{outline:3px solid #E5484D;outline-offset:6px;border-radius:6px;position:relative}
.fhm-note{display:block;margin:14px 0 22px;padding:12px 14px;border:2px solid #E5484D;border-radius:10px;background:#FFF1F1;color:#7A1013;font:500 14px/1.5 Inter,system-ui,sans-serif;text-align:left}
.fhm-note b{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:8px;border-radius:50%;background:#E5484D;color:#fff;font-size:12px}
.fhm-note .fix{display:block;margin-top:6px;color:#0A0A0A}
.fhm-bar{position:sticky;top:0;z-index:99;background:#E5484D;color:#fff;font:600 13px/1.4 Inter,system-ui,sans-serif;padding:10px 16px;text-align:center}
</style>`;

const MARK_JS = `<script>
(function(){
  function note(n, problem, fix){
    var d=document.createElement('div'); d.className='fhm-note';
    d.innerHTML='<b>'+n+'</b>'+problem+'<span class="fix"><strong>Fix:</strong> '+fix+'</span>';
    return d;
  }
  function mark(){
    var root=document.querySelector('.fh-root'); if(!root) return false;
    var hero=root.querySelector('.hero'), prose=root.querySelector('.prose'), book=document.getElementById('fh-ty-book');
    if(!book) return false;
    hero.classList.add('fhm-red');
    hero.after(note(1,'No video on this page.',
      'Add a video player that looks like the one on /watch, right here under the headline, with the heading <em>Watch this before your call</em>. It starts muted with the blue “Tap for sound” button. Until the video is filmed, the box shows <em>[ VIDEO ]</em>.'));
    book.classList.add('fhm-red');
    var p=prose&&prose.querySelector('p:not(.lead)'); if(p) p.classList.add('fhm-red');
    book.after(note(2,'Says “One step left: pick a time for your call.” and shows a <em>Pick your call time</em> button.',
      'Take both out. Put back the original: <em>Your Call Is Booked.</em> and <em>Check your email for the confirmation and calendar invite.</em>, then a <em>Confirm your call</em> block with the buttons <em>Add to Google Calendar</em>, <em>Apple / Outlook (.ics)</em>, and <em>Open your inbox to accept the invite</em> (Gmail, Outlook, Yahoo, iCloud). Every visitor sees it.'));
    return true;
  }
  var tries=0; (function go(){ if(!mark() && tries++<40) setTimeout(go,150); })();
})();
</script>`;

const BAR = `<div class="fhm-bar">DRAFT — /thank-you · red = what changes · nothing is live yet</div>`;

// Inlined so the shared Artifact link (which blocks outside scripts) still runs them.
const scripts = ["public/funnel/thankyou-sort.js", "public/funnel/funding-paths.js"]
  .map((f) => `<script>${readFileSync(join(ROOT, f), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`)
  .join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thank-You Draft</title>${MARK_CSS}</head><body style="margin:0;background:#fff">${BAR}
${frag.replace(/<script[^>]*src="https:\/\/fundhub\.ai\/funnel\/[^"]+"[^>]*><\/script>\s*/g, "")}
${scripts}
${MARK_JS}
</body></html>`;

writeFileSync(join(HERE, "05-thank-you-draft.html"), html, "utf8");
console.log("wrote marketing/landing-pages/preview/05-thank-you-draft.html");
