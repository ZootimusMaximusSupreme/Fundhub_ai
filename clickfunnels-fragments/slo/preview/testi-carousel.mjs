/* Phone carousel for the three /roadmap video testimonials — PREVIEW ONLY.
 *
 * Chris, 2026-09-29: on a phone the three testimonials stack, so it takes
 * 4-6 thumb swipes to reach "Everything You Need to Get Funded". He wants the
 * carousel /watch already has. This copies the /watch approvals row
 * (public/funnel/watch-proof.js, .fhx-rail / .fhx-track, motion() and the
 * fhxShift math, read and not changed): the cards sit in one row that runs to
 * both screen edges, and as the page scrolls down the row slides sideways, so
 * one testimonial is in view at a time and the page never stops. Reduced
 * motion: the same row as a plain sideways swipe, as on /watch.
 *
 * Phones only (699px, the break both pages already share). Desktop is
 * untouched. Same videos, posters and captions; nothing is rewritten.
 * slo-01-sales.html does not read this file.
 */

/* One card at a time, the next one peeking in at the edge, like /watch. */
const W = 250;

/* On desktop the rail and track are display:contents, so the cards stay grid
   items exactly as today. */
export const ROADMAP_CSS = `
.fh-b .proofgrid .fhc-rail,.fh-b .proofgrid .fhc-track{display:contents}
@media(max-width:699px){
.fh-b .proofgrid{grid-template-columns:minmax(0,1fr)!important}
.fh-b .proofgrid .fhc-rail{display:block;position:relative;overflow:hidden;justify-self:stretch;min-width:0;width:calc(100% + 48px);margin:-4px -24px -20px;padding:4px 0 20px}
.fh-b .proofgrid .fhc-track{display:flex;align-items:flex-start;gap:12px;width:max-content;padding:0 24px}
.fh-b .proofgrid .fhc-scroll{overflow:clip}
.fh-b .proofgrid .fhc-scroll .fhc-track{will-change:transform}
.fh-b .proofgrid .fhc-track>.tcard{flex:0 0 ${W}px;width:${W}px;max-width:none}
.fh-b .proofgrid .fhc-track>.tcard .vslot{width:100%;max-width:none}
.fh-b .proofgrid .fhc-swipe{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scroll-padding:0 24px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.fh-b .proofgrid .fhc-swipe::-webkit-scrollbar{display:none}
.fh-b .proofgrid .fhc-swipe .fhc-track{transform:none!important}
.fh-b .proofgrid .fhc-swipe .tcard{scroll-snap-align:start}
}`;

export const ROADMAP_JS = `
(function(){
  var g=document.querySelector('.fh-b .proofgrid');if(!g||g.querySelector('.fhc-rail'))return;
  var cards=g.querySelectorAll(':scope > .tcard');if(cards.length<2)return;
  var rail=document.createElement('div');rail.className='fhc-rail';
  var track=document.createElement('div');track.className='fhc-track';
  rail.appendChild(track);g.insertBefore(rail,cards[0]);
  [].forEach.call(cards,function(c){track.appendChild(c);});
  /* fhxShift, word for word from public/funnel/watch-proof.js. */
  function fhxShift(top, height, vh, travel) {
    if (!(vh > 0) || !(travel > 0)) return 0;
    var span = Math.max(vh * 0.8 - height, vh * 0.4);
    var p = (vh * 0.1 + span - top) / span;
    if (p <= 0) return 0;
    if (p > 1) p = 1;
    return -p * travel;
  }
  var phone=window.matchMedia('(max-width:699px)');
  var still=window.matchMedia('(prefers-reduced-motion: reduce)');
  var travel=0,queued=false,on=false;
  function measure(){travel=Math.max(0,track.offsetWidth-rail.clientWidth);}
  function frame(){
    queued=false;
    if(!on)return;
    if(rail.scrollLeft)rail.scrollLeft=0;
    var r=rail.getBoundingClientRect(),vh=window.innerHeight||document.documentElement.clientHeight;
    var x=fhxShift(r.top,r.height,vh,travel);
    track.style.transform='translate3d('+x.toFixed(1)+'px,0,0)';
    /* A playing video that slides out of the row stops. */
    [].forEach.call(cards,function(c){var v=c.querySelector('video');if(!v||v.paused)return;var b=c.getBoundingClientRect();if(b.right<0||b.left>rail.clientWidth)v.pause();});
  }
  function queue(){if(queued)return;queued=true;window.requestAnimationFrame(frame);}
  function mode(){
    var p=phone.matches;
    on=p&&!still.matches;
    rail.classList.toggle('fhc-scroll',on);
    rail.classList.toggle('fhc-swipe',p&&!on);
    if(on){rail.scrollLeft=0;measure();}else track.style.transform='';
    queue();
  }
  if(!window.requestAnimationFrame){rail.classList.add('fhc-swipe');return;}
  document.addEventListener('scroll',queue,{capture:true,passive:true});
  window.addEventListener('resize',function(){if(on)measure();queue();},{passive:true});
  [phone,still].forEach(function(m){if(m.addEventListener)m.addEventListener('change',mode);else if(m.addListener)m.addListener(mode);});
  mode();
})();`;
