// Builds docs/workflows/marketing-walkthrough-2026-09-17.{md,html} from lanes.json.
//   node docs/workflows/marketing-walkthrough-2026-09-17-src/gen-sheet.mjs
//
// Same shape as the client walkthrough (live-walkthrough-2026-09-16): one row per step,
// You do / You should see, mark Worked / Broken / Not sure, notes copied out for the chat.
// The difference on this sheet is money: every control that can spend real ad money or
// post in public is collected from the lanes and printed at the top as NEVER PRESS.
import fs from "node:fs";

const HERE = new URL("./", import.meta.url);
const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const DATE = "2026-09-17";
const OUT = `${REPO}/docs/workflows/marketing-walkthrough-${DATE}`;
const data = JSON.parse(fs.readFileSync(new URL("./lanes.json", HERE), "utf8"));
const unesc = (s) => String(s ?? "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const ORDER = ["M1", "M2", "M3"];
const lanes = data.lanes.map((l) => ({ ...l, key: l.lane.slice(0, 2) })).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
const strip = (t) => unesc(t).replace(/^M\d\s*[—-]\s*/, "");

// Money and public-post warnings, in lane order, with near-duplicates dropped.
const seen = new Set();
const NEVER = [];
for (const l of lanes) {
  for (const w of l.spend_or_public) {
    const line = unesc(w).trim();
    const fingerprint = (line.match(/"[^"]+"/g) || [line.slice(0, 40)]).join("|");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    NEVER.push({ lane: l.key, line, safe: /^SAFE/i.test(line) });
  }
}
const stops = NEVER.filter((n) => !n.safe);
const safes = NEVER.filter((n) => n.safe);

const RULES = [
  "<b>This is the marketing side:</b> making ads, running them, measuring them. The client side (ad click → lead) is the other sheet, <code>live-walkthrough-2026-09-16.html</code>.",
  "<b>Order:</b> M1 make it, then M2 run it, then M3 measure it.",
  "<b>You are signed in as the owner already.</b> These are staff screens, not client pages.",
  `<b>Read the red list below first.</b> ${stops.length} buttons on these screens spend real advertising money, post in public, or connect a real account. Walking around them is the whole trick.`,
  "<b>Nothing here texts or emails a client.</b>",
  "<b>Mark each step</b> Worked / Broken / Not sure and type what you saw. Press \"Copy my notes\" and paste them into the chat.",
];

// ── Markdown ──────────────────────────────────────────────────────────────────
const cell = (s) => unesc(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = [
  `# Marketing walkthrough — ${DATE}`,
  "",
  "**Who:** Chris clicks the live site and takes notes. Claude takes the notes and fixes after.",
  `**Tickable version:** \`docs/workflows/marketing-walkthrough-${DATE}.html\`. **Scope:** checking only, no fixes mid-walk.`,
  `**Traced from:** ${cell(data.traced_from)}.`,
  "",
  "## M0 — Before you start",
  "",
  ...RULES.map((r) => `- ${r.replace(/<\/?b>/g, "**").replace(/<\/?code>/g, "`")}`),
  "",
  "### Never press",
  "",
  "| Lane | What not to press, and why |",
  "|---|---|",
  ...stops.map((n) => `| ${n.lane} | ${cell(n.line)} |`),
  "",
  "### Safe to press, named so they are not confused with the above",
  "",
  ...safes.map((n) => `- ${cell(n.line)}`),
  "",
];
for (const l of lanes) {
  md.push(`## ${l.key} — ${cell(strip(l.title))}`, "", cell(l.summary), "", "```mermaid", unesc(l.diagram), "```", "");
  for (const s of l.sections) {
    md.push(`### ${cell(s.title)}`, "", "| Step | Where | You do | You should see | Claude | Heads-up |", "|---|---|---|---|---|---|");
    for (const st of s.steps) md.push(`| ${[st.id, st.where, st.do, st.see, st.claude, st.heads_up].map(cell).join(" | ")} |`);
    md.push("");
  }
  if (l.could_not_trace.length) {
    md.push("### Watch closely — could not be traced in the code", "");
    for (const x of l.could_not_trace) md.push(`- ${cell(x)}`);
    md.push("");
  }
}
md.push("## Evidence (for Claude, not for the walk)", "");
for (const l of lanes) for (const s of l.sections) for (const st of s.steps) md.push(`- ${st.id}: ${cell(st.evidence)}`);
md.push("", "## Findings", "", "`step | worked / broken / not sure | what you saw`", "", "(paste from the tickable page)", "");
fs.writeFileSync(`${OUT}.md`, md.join("\n"));

// ── HTML ──────────────────────────────────────────────────────────────────────
const h = (s) => unesc(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const old = fs.readFileSync(`${REPO}/docs/workflows/manual-walkthrough-runbook.html`, "utf8");
const style = old.slice(old.indexOf("<style>") + 7, old.indexOf("</style>"));
const copyBtn = (v) => `<button class="copy" data-copy="${h(v)}">Copy</button>`;

const stepRow = (st) => `<tr data-step="${h(st.id)}">
<td>${h(st.id)}</td>
<td><div class="where">${/^https?:\/\//.test(unesc(st.where)) ? `<span class="link">${h(st.where)}</span>${copyBtn(unesc(st.where).split(/\s/)[0])}` : h(st.where)}</div>
<div class="do">${h(st.do)}</div>
${st.claude ? `<div class="claude"><span class="say">${h(st.claude)}</span></div>` : ""}</td>
<td>${h(st.see)}${st.heads_up ? `<div class="heads${/NEVER|MONEY|real money|public/i.test(st.heads_up) ? " stopheads" : ""}">Heads-up: ${h(st.heads_up)}</div>` : ""}</td>
<td class="mark"><div class="seg" role="group" aria-label="Result for ${h(st.id)}">
<button data-v="ok">Worked</button><button data-v="bad">Broken</button><button data-v="unsure">Not sure</button></div>
<textarea rows="2" placeholder="What you saw"></textarea></td>
</tr>`;

const laneHtml = (l) => `<h2 id="${l.key}">${l.key} · ${h(strip(l.title))}</h2>
<p class="lede">${h(l.summary)}</p>
<div class="diagram"><pre class="mermaid">${h(l.diagram)}</pre></div>
${l.sections.map((s) => `<h3>${h(s.title)}</h3>
<div class="tbl"><table><thead><tr><th>Step</th><th>You do</th><th>You should see</th><th>Your result</th></tr></thead>
<tbody>${s.steps.map(stepRow).join("\n")}</tbody></table></div>`).join("\n")}
${l.could_not_trace.length ? `<div class="known"><b>Watch closely — could not be traced in the code</b><ul>${l.could_not_trace.map((x) => `<li>${h(x)}</li>`).join("")}</ul></div>` : ""}`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Marketing Walkthrough Sheet</title>
<style>${style}
  .wrap{max-width:1320px}
  .where{font-size:13px;color:var(--mute);margin-bottom:6px}
  .do{color:var(--ink)}
  .claude{margin-top:6px}
  .heads{margin-top:8px;padding:6px 8px;border-left:3px solid var(--warn);background:var(--soft);font-size:13.5px;color:var(--ink2)}
  .heads.stopheads{border-left-color:var(--stop)}
  td.mark{min-width:230px}
  .seg{display:flex;gap:4px;margin-bottom:6px}
  .seg button{flex:1;font:600 12px/1 var(--sans);padding:8px 4px;border:1px solid var(--rule);background:var(--paper);color:var(--ink2);border-radius:4px;cursor:pointer;min-height:36px}
  .seg button[aria-pressed="true"][data-v="ok"]{background:var(--ok);border-color:var(--ok);color:var(--paper)}
  .seg button[aria-pressed="true"][data-v="bad"]{background:var(--stop);border-color:var(--stop);color:var(--paper)}
  .seg button[aria-pressed="true"][data-v="unsure"]{background:var(--warn);border-color:var(--warn);color:var(--paper)}
  textarea{width:100%;font:14px/1.4 var(--sans);padding:6px 8px;border:1px solid var(--rule);border-radius:4px;background:var(--paper);color:var(--ink);resize:vertical}
  tr.r-ok td:first-child{box-shadow:inset 3px 0 var(--ok)} tr.r-bad td:first-child{box-shadow:inset 3px 0 var(--stop)} tr.r-unsure td:first-child{box-shadow:inset 3px 0 var(--warn)}
  .bar{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--rule);padding:10px 0;margin:0 0 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .bar .big{font:600 14px/1 var(--sans);padding:10px 14px;border-radius:4px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);cursor:pointer}
  .bar .count{font-family:var(--mono);font-size:12px;color:var(--mute)}
  .stoplist{border:1px solid var(--stop);border-radius:6px;padding:4px 16px 12px;margin:16px 0;max-width:72ch}
  .stoplist h3{color:var(--stop)}
  .stoplist li{margin:0 0 8px;font-size:14.5px;color:var(--ink2)}
  .stoplist .ln{font:600 11px/1 var(--sans);letter-spacing:.1em;color:var(--mute);margin-right:6px}
  .known ul{margin:6px 0 0;padding-left:18px}
  #allnotes{min-height:120px}
</style></head><body>
<div class="wrap">
<nav><p class="lab">Marketing</p>
<a href="#M0"><span class="n">M0</span>Before you start</a>
${lanes.map((l) => `<a href="#${l.key}"><span class="n">${l.key}</span>${h(strip(l.title))}</a>`).join("\n")}
<a href="#notes"><span class="n">✎</span>My notes</a>
</nav>
<main>
<div class="bar"><button class="big" id="copyNotes">Copy my notes</button><span class="count" id="count"></span><span class="count" id="copied" aria-live="polite"></span></div>
<h1>Marketing walkthrough</h1>
<p class="lede">The screens where ads get made, run and measured. You click, you mark each step, and you paste the notes into the chat. Nothing here is a client page.</p>
<div class="kv"><b>Date</b><span>${DATE}</span><b>Where</b><span>fundhub.ai staff screens (live)</span><b>Board</b><span><code>docs/workflows/marketing-walkthrough-${DATE}.md</code></span><b>Rule</b><span>Checking only. If it breaks, mark it and keep going.</span></div>

<h2 id="M0">M0 · Before you start</h2>
<div class="rules">${RULES.map((r) => `<p>${r}</p>`).join("")}</div>
<div class="stoplist"><h3>Never press — real money, real posts, real accounts</h3><ul>
${stops.map((n) => `<li><span class="ln">${n.lane}</span>${h(n.line)}</li>`).join("\n")}
</ul></div>
${safes.length ? `<div class="known"><b>Safe to press — named so they are not confused with the list above</b><ul>${safes.map((n) => `<li>${h(n.line)}</li>`).join("")}</ul></div>` : ""}

${lanes.map(laneHtml).join("\n")}

<h2 id="notes">My notes</h2>
<p class="note">Anything that doesn't fit a step. It is included when you press "Copy my notes".</p>
<textarea id="allnotes" placeholder="Anything else"></textarea>
</main></div>
<script>
(function(){
  var KEY = "fh-marketing-walk-${DATE}";
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { saved = {}; }
  var rows = Array.prototype.slice.call(document.querySelectorAll("tr[data-step]"));
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} count(); }
  function paint(tr){
    var s = saved[tr.dataset.step] || {};
    tr.className = s.v ? "r-" + s.v : "";
    tr.querySelectorAll(".seg button").forEach(function(b){ b.setAttribute("aria-pressed", String(b.dataset.v === s.v)); });
  }
  rows.forEach(function(tr){
    var id = tr.dataset.step, ta = tr.querySelector("textarea");
    ta.value = (saved[id] || {}).n || "";
    tr.querySelectorAll(".seg button").forEach(function(b){
      b.addEventListener("click", function(){
        var cur = saved[id] || {};
        cur.v = cur.v === b.dataset.v ? "" : b.dataset.v;
        saved[id] = cur; paint(tr); save();
      });
    });
    ta.addEventListener("input", function(){ var cur = saved[id] || {}; cur.n = ta.value; saved[id] = cur; save(); });
    paint(tr);
  });
  var free = document.getElementById("allnotes");
  free.value = saved.__free || "";
  free.addEventListener("input", function(){ saved.__free = free.value; save(); });
  function count(){
    var done = rows.filter(function(tr){ return (saved[tr.dataset.step] || {}).v; }).length;
    var bad = rows.filter(function(tr){ return (saved[tr.dataset.step] || {}).v === "bad"; }).length;
    document.getElementById("count").textContent = done + " of " + rows.length + " steps marked · " + bad + " broken";
  }
  count();
  var WORD = { ok: "WORKED", bad: "BROKEN", unsure: "NOT SURE" };
  function fallback(text){
    var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(t);
  }
  function writeClip(text, done){
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function(){ fallback(text); done(); });
    else { fallback(text); done(); }
  }
  document.getElementById("copyNotes").addEventListener("click", function(){
    var lines = ["Marketing walkthrough notes ${DATE}"];
    rows.forEach(function(tr){
      var s = saved[tr.dataset.step] || {};
      if (!s.v && !(s.n || "").trim()) return;
      lines.push(tr.dataset.step + " | " + (WORD[s.v] || "-") + " | " + (s.n || "").trim().replace(/\\s+/g, " "));
    });
    if ((saved.__free || "").trim()) lines.push("OTHER | " + saved.__free.trim());
    var msg = document.getElementById("copied");
    writeClip(lines.join("\\n"), function(){ msg.textContent = "Copied " + (lines.length - 1) + " lines — paste into the chat"; });
  });
  document.querySelectorAll("button.copy").forEach(function(b){
    b.addEventListener("click", function(){ writeClip(b.dataset.copy, function(){ var o = b.textContent; b.textContent = "Copied"; setTimeout(function(){ b.textContent = o; }, 1200); }); });
  });
})();
</script>
<script type="module">
  try {
    const { default: mermaid } = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
    const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" });
    await mermaid.run({ querySelector: ".mermaid" });
  } catch (e) { /* diagrams stay as text */ }
</script>
</body></html>
`;
fs.writeFileSync(`${OUT}.html`, html);
const steps = lanes.reduce((a, l) => a + l.sections.reduce((b, s) => b + s.steps.length, 0), 0);
console.log(`wrote md + html: ${lanes.length} lanes, ${steps} steps, ${stops.length} never-press lines`);
