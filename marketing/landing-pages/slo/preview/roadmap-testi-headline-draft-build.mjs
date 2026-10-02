// Builds the marked draft of apply.fundhub.ai/roadmap (owner law: page-edits-marked-draft).
// Chris, 2026-10-01: testimonials rotate by click instead of sliding as you scroll; headline and
// subheadline look small and do not fit right on phone and desktop.
// Reads marketing/landing-pages/slo/slo-01-sales.html; never changes it.
//
// Writes, next to this file:
//   roadmap-testi-fixed.html   the clean page (what goes live on "push it")
//   roadmap-testi-draft.html   the same page, every change marked green
//   --share  roadmap-testi-share.html  self-contained copy for the shared link (no checkout form,
//            pictures baked in, videos show their cover picture)
// Run: node marketing/landing-pages/slo/preview/roadmap-testi-headline-draft-build.mjs [--share]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..", "..");
const live = readFileSync(join(ROOT, "marketing/landing-pages/slo/slo-01-sales.html"), "utf8");

/* The old phone row: testimonials slid sideways as the page scrolled. Replaced whole. */
const OLD_START = "<style>\n.fh-b .proofgrid .fhc-rail,.fh-b .proofgrid .fhc-track{display:contents}";
const OLD_END = "\n<style>\n/* Roadmap reorder, 2026-09-29";
const a = live.indexOf(OLD_START), b = live.indexOf(OLD_END);
if (a < 0 || b < a || live.indexOf(OLD_START, a + 1) > -1) throw new Error("testimonial row block not found exactly once");

const NEW_BLOCK = `<style>
/* Testimonials (Chris, 2026-10-01): on a phone, one video at a time. Arrows and dots rotate them,
   a swipe works too. Nothing moves when the page scrolls. Computers keep all three side by side. */
.fh-b .proofgrid .fhc-rail{display:contents}
.fh-b .proofgrid .fhc-nav{display:none}
@media(max-width:699px){
.fh-b .proofgrid{grid-template-columns:minmax(0,1fr)!important}
.fh-b .proofgrid .fhc-rail{display:flex;position:relative;gap:12px;align-items:flex-start;width:calc(100% + 48px);margin:-4px -24px 0;padding:4px 24px 6px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scroll-padding:0 24px;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.fh-b .proofgrid .fhc-rail::-webkit-scrollbar{display:none}
.fh-b .proofgrid .fhc-rail>.tcard{flex:0 0 78%;width:78%;max-width:none;scroll-snap-align:center;scroll-snap-stop:always}
.fh-b .proofgrid .fhc-rail>.tcard .vslot{width:100%;max-width:none}
/* The page holds Colin, Gene, Sarah. Chris wants Sarah, Gene, Colin on a phone. */
.fh-b .proofgrid .fhc-rail>.tcard:nth-child(1){order:3}
.fh-b .proofgrid .fhc-rail>.tcard:nth-child(3){order:1}
.fh-b .proofgrid .fhc-rail>.tcard:nth-child(2){order:2}
.fh-b .proofgrid .fhc-nav{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:4px}
.fh-b .fhc-arrow{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:1.5px solid var(--line,#E4E4E7);background:#fff;color:var(--ink,#111113);cursor:pointer;padding:0;box-shadow:0 1px 3px rgba(10,10,10,.06)}
.fh-b .fhc-arrow svg{width:18px;height:18px}
.fh-b .fhc-arrow:disabled{opacity:.35;cursor:default}
.fh-b .fhc-arrow:focus-visible,.fh-b .fhc-dot:focus-visible{outline:3px solid rgba(24,139,246,.35);outline-offset:2px}
.fh-b .fhc-dots{display:flex;align-items:center;gap:6px}
.fh-b .fhc-dot{width:8px;height:8px;border-radius:4px;border:0;padding:0;background:#D4D4D8;cursor:pointer;transition:width .2s,background .2s}
.fh-b .fhc-dot[aria-current="true"]{width:22px;background:#188bf6}
}
</style>
<script>
(function(){
  var g=document.querySelector('.fh-b .proofgrid');if(!g||g.querySelector('.fhc-rail'))return;
  var cards=[].slice.call(g.querySelectorAll(':scope > .tcard'));if(cards.length<2)return;
  var rail=document.createElement('div');rail.className='fhc-rail';
  g.insertBefore(rail,cards[0]);
  cards.forEach(function(c){rail.appendChild(c);});
  var phone=window.matchMedia('(max-width:699px)');
  /* the row shows cards in their CSS order (Sarah, Gene, Colin on a phone) */
  function list(){return cards.slice().sort(function(x,y){return (+getComputedStyle(x).order||0)-(+getComputedStyle(y).order||0);});}
  var ARROW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var nav=document.createElement('div');nav.className='fhc-nav';
  nav.innerHTML='<button type="button" class="fhc-arrow" data-go="-1" aria-label="Previous testimonial">'+ARROW+'</button>'+
    '<div class="fhc-dots"></div>'+
    '<button type="button" class="fhc-arrow" data-go="1" aria-label="Next testimonial" style="transform:scaleX(-1)">'+ARROW+'</button>';
  rail.after(nav);
  var dots=nav.querySelector('.fhc-dots'),prev=nav.querySelector('[data-go="-1"]'),next=nav.querySelector('[data-go="1"]');
  cards.forEach(function(_,i){var d=document.createElement('button');d.type='button';d.className='fhc-dot';d.setAttribute('aria-label','Testimonial '+(i+1)+' of '+cards.length);d.addEventListener('click',function(){go(i);});dots.appendChild(d);});
  var at=0;
  function go(i){
    var l=list();i=Math.max(0,Math.min(l.length-1,i));
    var c=l[i];rail.scrollTo({left:c.offsetLeft-(rail.clientWidth-c.offsetWidth)/2,behavior:'smooth'});
    paint(i);
  }
  function paint(i){
    at=i;
    [].forEach.call(dots.children,function(d,k){d.setAttribute('aria-current',k===i?'true':'false');});
    prev.disabled=i===0;next.disabled=i===cards.length-1;
  }
  function nearest(){
    var l=list(),mid=rail.scrollLeft+rail.clientWidth/2,best=0,bd=1e9;
    l.forEach(function(c,k){var d=Math.abs(c.offsetLeft+c.offsetWidth/2-mid);if(d<bd){bd=d;best=k;}});
    return best;
  }
  var t=null;
  rail.addEventListener('scroll',function(){
    clearTimeout(t);t=setTimeout(function(){
      var i=nearest();paint(i);
      /* a video that rotates out of view stops */
      list().forEach(function(c,k){var v=c.querySelector('video');if(k!==i&&v&&!v.paused&&!document.fullscreenElement&&!v.webkitDisplayingFullscreen)v.pause();});
    },90);
  },{passive:true});
  prev.addEventListener('click',function(){go(at-1);});
  next.addEventListener('click',function(){go(at+1);});
  function full(){return document.fullscreenElement||document.webkitFullscreenElement||cards.some(function(c){var v=c.querySelector('video');return v&&v.webkitDisplayingFullscreen;});}
  /* Chris, 2026-09-29: "when you press it goes full screen". On a phone, the
     Play button or the video opens that video full screen and plays it. */
  cards.forEach(function(c){
    var v=c.querySelector('video'),o=c.querySelector('.tplay');if(!v)return;
    function big(){
      if(!phone.matches||full())return;
      var p=v.play();if(p&&p.catch)p.catch(function(){});
      if(v.requestFullscreen){var f=v.requestFullscreen();if(f&&f.catch)f.catch(function(){});}
      else if(v.webkitRequestFullscreen)v.webkitRequestFullscreen();
      else if(v.webkitEnterFullscreen){try{v.webkitEnterFullscreen();}catch(e){}}
    }
    if(o)o.addEventListener('click',big);
    v.addEventListener('click',big);
  });
  paint(0);
})();
</script>

<style>
/* Headline and subheadline (Chris, 2026-10-01: "kinda off and small"). Bigger on every screen,
   lines balanced so no word sits alone on its own line. */
.fh-root .hero .eyebrow{text-wrap:balance;max-width:100%}
.fh-root .hero h1{font-size:clamp(34px,5.4vw,58px);max-width:17ch;text-wrap:balance;line-height:1.04}
.fh-root .hero p.fh-subhead{font-size:clamp(20px,2.4vw,26px);max-width:30ch;text-wrap:balance;margin-top:16px}
@media(max-width:640px){.fh-root .hero .eyebrow{font-size:10.5px;letter-spacing:.12em}}
</style>
`;
const fixed = live.slice(0, a) + NEW_BLOCK + live.slice(b);
writeFileSync(join(here, "roadmap-testi-fixed.html"), fixed);

/* ---------- marks (draft only) ---------- */
const MARKS = `
<style>
.fhm-bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:999;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:center;padding:10px 16px;background:#15803D;color:#fff;font:600 13px/1.4 Inter,system-ui,sans-serif;text-align:center}
.fhm-bar button{border:1.5px solid rgba(255,255,255,.7);background:transparent;color:#fff;border-radius:8px;padding:6px 10px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}
.fhm-g{outline:3px solid #16A34A!important;outline-offset:6px;border-radius:8px}
.fhm-note{display:block;max-width:560px;margin:14px auto 4px;padding:11px 13px;border:2px solid #16A34A;border-radius:10px;background:#F0FDF4;color:#14532D;font:500 13.5px/1.5 Inter,system-ui,sans-serif;text-align:left}
.fhm-note b{display:inline-grid;place-items:center;width:20px;height:20px;margin-right:6px;border-radius:50%;background:#16A34A;color:#fff;font-size:11.5px}
html.fhm-off .fhm-note{display:none}html.fhm-off .fhm-g{outline:none!important}
</style>
<script>
document.addEventListener('DOMContentLoaded',function(){   /* DRAFT ONLY */
  var bar=document.createElement('div');bar.className='fhm-bar';
  bar.innerHTML='<span>Draft, not live. Changes are in green.</span><button type="button" id="fhm-toggle">Hide marks</button>';
  document.body.prepend(bar);
  function note(after,n,txt){var d=document.createElement('div');d.className='fhm-note';d.innerHTML='<b>'+n+'</b>'+txt;after.after(d);}
  var h1=document.querySelector('.fh-root .hero h1'),sub=document.querySelector('.fh-root .hero .fh-subhead'),eb=document.querySelector('.fh-root .hero .eyebrow');
  [h1,sub,eb].forEach(function(e){e&&e.classList.add('fhm-g');});
  if(sub)note(sub,1,'Headline and the line under it are bigger on phones and computers. Lines are balanced, so &ldquo;Forever!&rdquo; and &ldquo;again.&rdquo; no longer sit alone. Same words.');
  var g=document.querySelector('.fh-b .proofgrid');
  if(g){g.classList.add('fhm-g');note(g,2,'On a phone the videos no longer slide as you scroll. One shows at a time. Tap the arrows or dots to rotate, or swipe. Computers still show all three side by side.');}
  var tg=document.getElementById('fhm-toggle');
  tg.addEventListener('click',function(){var off=document.documentElement.classList.toggle('fhm-off');tg.textContent=off?'Show marks':'Hide marks';});
});
</script>
`;
const draft = fixed + MARKS;
writeFileSync(join(here, "roadmap-testi-draft.html"), draft);

if (process.argv.includes("--share")) {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "fh-share-"));
  let share = draft;
  const cut0 = share.indexOf("<!-- ================= SPLIT-LINE"), cut1 = share.indexOf("<!-- SLOT-UTM");
  share = share.slice(0, cut0) +
    `<div class="fhx-checkout"><b>Checkout form sits here on the live page</b><i>Left out of this shared copy so nothing here can take a card or personal details.</i></div>\n` +
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
<title>Roadmap Testimonials Draft</title>
<style>
body{background:#FCFCFC;color:#111113}
.fhx-checkout{max-width:720px;margin:24px auto;padding:18px 20px;border:2px dashed #2F6FEB;border-radius:10px;background:#F3F7FF;color:#111113;font:14px/1.5 system-ui,sans-serif;display:grid;gap:6px}
</style>
`;
  writeFileSync(join(here, "roadmap-testi-share.html"), head + share);
  console.log(`built roadmap-testi-share.html (${urls.length} pictures baked in)`);
}
console.log("built roadmap-testi-fixed.html, roadmap-testi-draft.html");
