// Builds the marked draft of apply.fundhub.ai/apply (owner law: page-edits-marked-draft).
// Reads the live fragment; never changes it. Board: ops/workflows/apply-funnel-fixes-2026-10-01.md
//
// Writes, next to this file:
//   apply-survey-fixed.html  the clean page with the fixes, no marks (what goes live on "push it")
//   apply-survey-draft.html  the same page with every change marked in green
//   --share  apply-survey-draft-share.html  the draft as one self-contained page for the shared link
//            (approval photos inlined; the live calendar cannot load outside apply.fundhub.ai)
//
// Run: node marketing/landing-pages/preview/apply-survey-draft-build.mjs [--share]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const live = readFileSync(join(ROOT, "marketing/landing-pages/apply-survey.html"), "utf8");

/* Each fix must match the live file exactly once, or the build stops. */
const FIXES = [
  {
    id: "A2 checklist rows",
    from: ".done .ok{width:48px;",
    to: ".done > .ok{width:48px;",
  },
  {
    id: "A1 hint",
    from: "hint: 'Pick all that apply.',",
    to: "hint: 'Pick the one that matters most.',",
  },
  {
    id: "A1 no Next button",
    from: "if (multi || q.other) h += '<div class=\"actions\">",
    to: "if (q.other) h += '<div class=\"actions\">",
  },
  {
    id: "A1 one tap moves on",
    from: `        if (q.type === 'multi') {
          var arr = A[q.key] || [], o = q.opts[+b.dataset.i], k = arr.indexOf(o);
          k > -1 ? arr.splice(k, 1) : arr.push(o);
          A[q.key] = arr;
          b.setAttribute('aria-checked', k < 0);
          return;
        }`,
    to: `        if (q.type === 'multi') {   /* one tap moves on; the answer is still sent as a list */
          body.querySelectorAll('.opt').forEach(function (x) { x.setAttribute('aria-checked', 'false'); });
          b.setAttribute('aria-checked', 'true');
          A[q.key] = [q.opts[+b.dataset.i]];
          setTimeout(advance, 220);
          return;
        }`,
  },
  {
    id: "A3 slide to the calendar",
    from: "    setTimeout(function () { document.getElementById('cal').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 1600);",
    to: `    /* Slide down to the calendar on its own, then check it got there (a dropped smooth scroll jumps instead). */
    function toCal(smooth) { var c = document.getElementById('cal'); window.scrollTo({ top: c.getBoundingClientRect().top + window.pageYOffset - 16, behavior: smooth ? 'smooth' : 'auto' }); }
    setTimeout(function () { toCal(true); }, 900);
    setTimeout(function () { if (Math.abs(document.getElementById('cal').getBoundingClientRect().top - 16) > 40) toCal(false); }, 2400);`,
  },
];

let fixed = live;
for (const f of FIXES) {
  const n = fixed.split(f.from).length - 1;
  if (n !== 1) throw new Error(`${f.id}: expected 1 match in apply-survey.html, found ${n}`);
  fixed = fixed.replace(f.from, f.to);
}
writeFileSync(join(HERE, "apply-survey-fixed.html"), fixed);

/* ---------- marks (draft only; none of this reaches the live page) ---------- */
const SAMPLE = `{ contact: { first_name: 'Sample', last_name: 'Client', email: 'sample@example.com', phone: '(480) 555-1234' },
      cf_svy_funding_target_amount: '$100k - $200k', cf_svy_planned_use: 'Growth (marketing, inventory, hiring)',
      cf_svy_money_change_now: ['Stability (cover bills / buffer slow weeks)'], cf_svy_self_reported_fico: '700-749',
      cf_svy_has_business: 'Yes, 2-5 years', cf_svy_business_revenue: '$250k - $499k', cf_svy_revenue_verifiable: 'Yes, both' }`;

/* Draft-only jump buttons, so Chris does not refill the form each time. Sample answers only. */
const HOOK_FROM = "  var A = {}, at = 0;";
const HOOK_TO = `  var A = {}, at = 0;
  window.__fhDraft = function (where) {   /* DRAFT ONLY */
    var s = ${SAMPLE};
    var stop = where === 'q4' ? 'cf_svy_money_change_now' : 'cf_svy_available_capital';
    A = {};
    for (var k in s) A[k] = s[k];
    var list = path();
    at = list.findIndex(function (q) { return q.key === stop; });
    for (var i = at; i < list.length; i++) delete A[list[i].key];
    document.getElementById('cal').hidden = true; document.getElementById('trust').hidden = false;
    render(); window.scrollTo(0, 0);
  };`;

const MARK_CSS = `<style>
/* draft marks: green = changed in this round */
.fhm-bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:99;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:center;margin-inline:-16px;padding:10px 16px;background:#15803D;color:#fff;font:600 13px/1.4 Inter,system-ui,sans-serif;text-align:center}
.fhm-bar button{border:1.5px solid rgba(255,255,255,.7);background:transparent;color:#fff;border-radius:8px;padding:6px 10px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}
.fhm-bar button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.fhm-g{outline:3px solid #16A34A;outline-offset:5px;border-radius:8px}
.fhm-note{display:block;margin:14px 0 4px;padding:11px 13px;border:2px solid #16A34A;border-radius:10px;background:#F0FDF4;color:#14532D;font:500 13.5px/1.5 Inter,system-ui,sans-serif;text-align:left}
.fhm-note b{display:inline-grid;place-items:center;width:20px;height:20px;margin-right:6px;border-radius:50%;background:#16A34A;color:#fff;font-size:11.5px;vertical-align:1px}
.fhm-note s{color:#6B7280}
.fhm-cal{display:grid;place-items:center;min-height:220px;padding:20px;text-align:center;color:var(--gray);font:500 14px/1.5 Inter,system-ui,sans-serif}
html.fhm-off .fhm-note,html.fhm-off .fhm-bar .fhm-say{display:none}
html.fhm-off .fhm-g{outline:none}
</style>`;

const MARK_BAR = `<div class="fhm-bar" role="region" aria-label="Draft controls">
  <span class="fhm-say">Draft, not live. Changes are in green.</span>
  <button type="button" id="fhm-q4">Go to question 4</button>
  <button type="button" id="fhm-end">Go to the last question</button>
  <button type="button" id="fhm-toggle" aria-pressed="false">Hide marks</button>
</div>`;

const MARK_JS = `<script>
(function () {   /* DRAFT ONLY: adds the green marks as each screen renders */
  var body = document.getElementById('body');
  function note(after, n, html) {
    if (!after || body.querySelector('.fhm-note[data-n="' + n + '"]')) return;
    var d = document.createElement('div'); d.className = 'fhm-note'; d.setAttribute('data-n', n);
    d.innerHTML = '<b>' + n + '</b>' + html; after.after(d);
  }
  function mark() {
    var h = body.querySelector('h2'); if (!h) return;
    var t = h.textContent;
    if (t === 'What Would This Money Change Right Now?') {
      var opts = body.querySelector('.opts'), hint = body.querySelector('.hint');
      opts.classList.add('fhm-g'); hint.classList.add('fhm-g');
      note(opts, 1, 'No Next button. Tap one and it moves on, same as the other questions. Your advisor still gets the answer in the same place.<br>Line above: <s>Pick all that apply.</s> → Pick the one that matters most.');
    } else if (t === 'Reviewing your answers') {
      var load = body.querySelector('.load'); load.classList.add('fhm-g');
      note(load, 2, 'Fixed the jumble. Each line stays one clean row and gets a green dot when it is done. Before, finished lines turned into big circles and the words piled on top of each other.');
    } else if (t.indexOf('qualified') > -1) {
      note(body.querySelector('.go'), 3, 'About 1 second after this shows, the page slides down to the calendar by itself. Then it checks it got there. If the slide was cut off, it jumps there.');
      document.getElementById('cal').classList.add('fhm-g');
    }
  }
  new MutationObserver(mark).observe(body, { childList: true });
  var frame = document.getElementById('fh-book-frame');
  if (frame && location.hostname !== 'apply.fundhub.ai') {
    var ph = document.createElement('div'); ph.className = 'fhm-cal';
    ph.textContent = 'The live calendar loads here on apply.fundhub.ai. It cannot load inside this preview.';
    frame.replaceWith(ph);
  }
  document.getElementById('fhm-q4').addEventListener('click', function () { window.__fhDraft('q4'); });
  document.getElementById('fhm-end').addEventListener('click', function () { window.__fhDraft('end'); });
  var tg = document.getElementById('fhm-toggle');
  tg.addEventListener('click', function () {
    var off = document.documentElement.classList.toggle('fhm-off');
    tg.textContent = off ? 'Show marks' : 'Hide marks'; tg.setAttribute('aria-pressed', off);
  });
})();
</script>`;

function once(s, from, to, id) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${id}: expected 1 match, found ${n}`);
  return s.replace(from, to);
}
let draft = fixed;
draft = once(draft, "<title>Fundhub Apply Survey</title>", "<title>Apply Survey Draft</title>", "title");
draft = once(draft, "</head>", MARK_CSS + "\n</head>", "mark css");
draft = once(draft, '<div class="wrap">', MARK_BAR + '\n<div class="wrap">', "mark bar");
draft = once(draft, HOOK_FROM, HOOK_TO, "draft hook");
draft = once(draft, "</body>", MARK_JS + "\n</body>", "mark js");
writeFileSync(join(HERE, "apply-survey-draft.html"), draft);

if (process.argv.includes("--share")) {
  let share = draft;
  for (const url of [...new Set(share.match(/https:\/\/statics\.myclickfunnels\.com\/[^"]+\.jpg/g) || [])]) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`photo ${url}: HTTP ${res.status}`);
    share = share.split(url).join("data:image/jpeg;base64," + Buffer.from(await res.arrayBuffer()).toString("base64"));
  }
  share = share.replace("<!DOCTYPE html>\n", "").replace(/<html[^>]*>\n?/, "").replace("</html>", "")
    .replace("<head>\n", "").replace("</head>\n", "").replace("<body>\n", "").replace("</body>\n", "");
  writeFileSync(join(HERE, "apply-survey-draft-share.html"), share);
}
console.log("wrote apply-survey-fixed.html, apply-survey-draft.html" + (process.argv.includes("--share") ? ", apply-survey-draft-share.html" : ""));
