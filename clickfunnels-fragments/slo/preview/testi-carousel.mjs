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
/* The page holds Colin, Gene, Sarah. Chris wants Sarah, Gene, Colin on a phone. */
.fh-b .proofgrid .fhc-track>.tcard:nth-child(1){order:3}
.fh-b .proofgrid .fhc-track>.tcard:nth-child(3){order:1}
.fh-b .proofgrid .fhc-track>.tcard:nth-child(2){order:2}
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
  /* fhxShift from public/funnel/watch-proof.js, except the slide finishes
     in FASTER of the /watch scroll distance. The start point is the same. */
  function fhxShift(top, height, vh, travel) {
    if (!(vh > 0) || !(travel > 0)) return 0;
    var span = Math.max(vh * 0.8 - height, vh * 0.4);
    var p = (vh * 0.1 + span - top) / (span * FASTER);
    if (p <= 0) return 0;
    if (p > 1) p = 1;
    return -p * travel;
  }
  var phone=window.matchMedia('(max-width:699px)');
  var still=window.matchMedia('(prefers-reduced-motion: reduce)');
  /* Chris, 2026-09-29: "start it 20% lower", then "20% lower" again. The
     slide begins 40% of the screen height later in the scroll than on /watch. */
  var LATER=0.4;
  /* Chris, 2026-09-29: "20% faster". The slide finishes in 80% of the scroll. */
  var FASTER=0.8;
  /* Each frame the row closes this share of the gap to where the scroll puts
     it, so a flick of the thumb glides instead of jumping. */
  var EASE=0.14;
  var travel=0,queued=false,on=false,x=null,last=0;
  function measure(){travel=Math.max(0,track.offsetWidth-rail.clientWidth);}
  function full(){return document.fullscreenElement||document.webkitFullscreenElement||[].some.call(cards,function(c){var v=c.querySelector('video');return v&&v.webkitDisplayingFullscreen;});}
  function frame(t){
    queued=false;
    if(!on)return;
    if(rail.scrollLeft)rail.scrollLeft=0;
    var r=rail.getBoundingClientRect(),vh=window.innerHeight||document.documentElement.clientHeight;
    var goal=fhxShift(r.top+vh*LATER,r.height,vh,travel);
    var dt=last?Math.min(t-last,64):16.7;last=t;
    if(x===null)x=goal;else x+=(goal-x)*(1-Math.pow(1-EASE,dt/16.7));
    if(Math.abs(goal-x)<0.3)x=goal;
    track.style.transform='translate3d('+x.toFixed(1)+'px,0,0)';
    if(x!==goal)queue();else last=0;
    /* A playing video that slides out of the row stops. */
    if(!full())[].forEach.call(cards,function(c){var v=c.querySelector('video');if(!v||v.paused)return;var b=c.getBoundingClientRect();if(b.right<0||b.left>rail.clientWidth)v.pause();});
  }
  function queue(){if(queued)return;queued=true;window.requestAnimationFrame(frame);}
  function mode(){
    var p=phone.matches;
    on=p&&!still.matches;
    rail.classList.toggle('fhc-scroll',on);
    rail.classList.toggle('fhc-swipe',p&&!on);
    x=null;last=0;
    if(on){rail.scrollLeft=0;measure();}else track.style.transform='';
    queue();
  }
  /* Chris, 2026-09-29: "when you press it goes full screen". On a phone, the
     Play button or the video opens that video full screen and plays it. */
  [].forEach.call(cards,function(c){
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
  if(!window.requestAnimationFrame){rail.classList.add('fhc-swipe');return;}
  document.addEventListener('scroll',queue,{capture:true,passive:true});
  window.addEventListener('resize',function(){if(on)measure();queue();},{passive:true});
  [phone,still].forEach(function(m){if(m.addEventListener)m.addEventListener('change',mode);else if(m.addListener)m.addListener(mode);});
  mode();
})();`;
