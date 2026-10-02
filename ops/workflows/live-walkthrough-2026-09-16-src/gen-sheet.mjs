// Builds ops/workflows/live-walkthrough-2026-09-16.{md,html} from lanes.json (the four lane traces).
//   node ops/workflows/live-walkthrough-2026-09-16-src/gen-sheet.mjs
import fs from "node:fs";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const out = { result: JSON.parse(fs.readFileSync(new URL("./lanes.json", import.meta.url), "utf8")) };
const unesc = (s) => String(s ?? "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const ORDER = ["L4", "L1", "L2", "L3"];
const lanes = out.result.lanes
  .map((l) => ({ ...l, key: l.lane.slice(0, 2) }))
  .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

// ---------- Corrections from the pre-walk checks (2026-09-16) ----------
// ops/workflows/live-walkthrough-2026-09-16-prewalk-check.md and
// ops/workflows/sim-documents/MATRIX.md.
const M = "ops/workflows/sim-documents/MATRIX.md";
const PATCH = {
  "L1.5": {
    do: "Open the email titled \"Your soft-pull assessment — authorize, then pay\". Click \"Open soft-pull authorization form\". Fill the form with the values in ops/workflows/sim-documents/NN/consent-form.txt (NN = the client number): the client's own name, SSN 666-15-4480, and the same fake birth date and address for everyone. Skip \"+ Add a business\". Click \"I agree — submit soft-pull approval\" once.",
  },
  "L1.10": {
    see: "The Scores tile fills. Card Use shows a percent (a real pull would show \"not measured\" there — the fake file carries extra numbers). For #8, #11 and #12 the Documents list gets the Credit Analysis Report, Credit Optimization Roadmap, Funding Snapshot, Bank and Lender Match List and Capital Readiness Summary. #9 and #10 get no documents from a push.",
    heads_up: "Those documents are built on Claude's laptop, so a download may fail. No email or text tells the client they are ready.",
  },
  "L2.2": {
    heads_up: "About 3 hours after paying, #8 also gets \"ID needed\" messages, and one more email 2 days later. Uploading does not stop them — nothing marks the ID as received.",
  },
  "L2.4": {
    see: "The client portal opens as Sim Eight. The fake documents are already built: ops/workflows/sim-documents/08/.",
    claude: "",
  },
  "L2.5": {
    do: `First open #8's Client Control Panel, expand "Credit & Hold Status", and check "On Hold Because" reads "Documents Pending Approval" (ignore the "On hold because" box in "Funding round" — it stays a dash). Then, in the portal, upload #8's bad files in the order in ${M}: photo-id-2, photo-id-4, photo-id-3 as "Photo ID", then bank-statement-2 as "Bank statement". Pick the type, press "Upload documents" to choose the file, then "Send 1 file". Set the type again before every file. Wait for each answer and reload the panel.`,
    see: "Each one comes back \"one thing needs fixing\" (a text, plus a note in the Send a file card after a reload). photo-id-4 may instead make a staff task \"Document hold — …\". \"On Hold Because\" still reads \"Documents Pending Approval\" after every one.",
    heads_up: "If \"On Hold Because\" says anything else before you start, tell Claude. If nothing comes back, or a staff task says \"Check this id document by hand — nobody has read it\", the checker could not read the file. Tell Claude. Texts wait between 8 pm and 8 am Arizona time.",
  },
  "L2.6": {
    do: "Upload ssn-card-1 as \"Social Security card\" and reload the panel. Then upload photo-id-1 as \"Photo ID\". If it comes back \"one thing needs fixing\", write that down, say \"put identity on file #8\", and upload photo-id-1 again. Then upload proof-of-address-1 as \"Proof of address\".",
    see: "The Social Security card: email \"Documents approved — you're moving\" plus a text, and \"On Hold Because\" is now empty. Then each good file sends the same approved email and text.",
    claude: "if the good ID bounces: say \"put identity on file #8\"",
    heads_up: "Known bug: the wrong-person ID from L2.5 still counts toward a full ID-and-address set. If the card comes back hold, the \"SIMULATED\" line on it is the likely reason. If the pause never lifts, L2.10 to L2.12 are refused — stop and tell Claude.",
  },
  "L2.15": {
    do: "Say \"put identity on file #9\" first. Then in the client portal as Sim Nine, box \"ID and personal documents\": upload ops/workflows/sim-documents/09/photo-id-1.png as \"Photo ID\", then proof-of-address-1.png as \"Proof of address\".",
    see: "The approved email and text arrive. On the Repair board the card moves to \"Analysis\". Either file approved is enough to unlock \"Stage\".",
    claude: "say \"put identity on file #9\"",
    heads_up: "If neither file is approved, stop and tell Claude. Nothing on screen can approve a document by hand, and \"Stage\" will keep saying the ID has not been read.",
  },
  "L2.18": {
    do: "After L1 minted the $200 pay link, tell Claude to push the payment. Say \"put identity on file #10\". Upload 10/photo-id-1.png as \"Photo ID\" and 10/proof-of-address-1.png as \"Proof of address\". Then \"Stage\" and read the letters as for #9, push credit again, and \"Stage\" for round 2.",
    claude: "say \"push payment #10\", \"put identity on file #10\", later \"push credit #10\" before round 2",
    heads_up: "If neither upload is approved, stop and tell Claude — \"Stage\" cannot make letters until one is.",
  },
  "L2.19": {
    heads_up: "The trial ends when a bureau answer is confirmed, not on a timer. That is L3.14.",
  },
  "L3.14": {
    where: "Client portal as Sim Ten, box \"Upload your bureau response\"; then https://fundhub.ai/app/inquiry-remover.html, \"Repair\"",
    do: "Upload 10/bureau-letter-2.png as \"Letter from a credit bureau\", then 10/bureau-letter-1.png the same way. On the Specialist desk press \"Repair\" and reload. In the box \"Needs a human read\", press \"Mark as checked\" on the row \"Bureau answer needs a look\" that shows \"Confidence 0.576\". Then click the \"Trial ending\" tile.",
    see: "The blurry letter gets \"Please retake your bureau letter photo\" and the card moves to \"Response received\". The good one waits under \"Needs a human read\". After the press the button reads \"Checked\", and #10's Gmail gets \"We reviewed your bureau response\" twice, \"Round 2 is out\" (expected), and \"Your trial rounds are complete — next steps\". #10 is counted under \"Trial ending\", the Repair card lands on \"Round complete\", and a task \"Re-pull CRS and re-underwrite — new round\" appears under \"No date on it\".",
    heads_up: "The box lists the whole company with no client names. If there is more than one row, stop and tell Claude before pressing. The row label will read \"Send letters\", not \"Trial done — sales\", because letters are never mailed. Upload the letters only after round-1 letters are staged, or they are ignored. Do this BEFORE L3.15.",
  },
};
const INSERT_AFTER = {
  "L2.17": [{
    id: "L2.17b", client: "#9",
    where: "Client portal as Sim Nine, box \"Upload your bureau response\"",
    do: "After round 2 is staged, upload 09/bureau-letter-2.png as \"Letter from a credit bureau\", then 09/bureau-letter-1.png the same way.",
    see: "The blurry one gets \"Please retake your bureau letter photo\" and the card moves to \"Response received\". The good one is confirmed with no staff press: #9's Gmail gets \"We reviewed your bureau response\" three times (only one lists the accounts) and a \"Round N is out\" email. After a reload the Repair card sits on \"Round complete\".",
    claude: "",
    heads_up: "The answers are applied to all three bureaus. Uploading after round 2 is staged keeps the round-2 letters clean.",
    evidence: "src/repair/parse-loop.mjs:6,:69,:79-93; src/metro2/inbound/confirm.mjs:132-161; live parseResponseText on the rendered letter scores 0.90",
  }],
};
for (const l of lanes) for (const s of l.sections) {
  s.steps = s.steps.flatMap((st) => {
    const fixed = PATCH[st.id] ? { ...st, ...PATCH[st.id] } : st;
    return [fixed, ...(INSERT_AFTER[st.id] || [])];
  });
}

// Anything that reads like a forbidden click gets printed for a human look.
for (const l of lanes) for (const s of l.sections) for (const st of s.steps) {
  if (/\b(Pull (TransUnion|Experian|Equifax|TU|EX|EQ)|Send with mail|delete|Pay \$|Pay soft|Enroll)\b/i.test(st.do)) {
    console.log(`CHECK ${st.id}: ${st.do}`);
  }
}

const CLIENTS = [
  ["#8", "Sim Eight-Funding", "stanbridgejchris+sim-08@gmail.com", "https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=funding600&utm_content=42-ringlights&utm_term=sun", "Soft pull → Funding done-for-you ($3,000) → funded → success fee"],
  ["#9", "Sim Nine-Repair", "stanbridgejchris+sim-09@gmail.com", "https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=sorting&utm_content=43&utm_term=nosun", "Soft pull → Credit repair done-for-you ($1,000, six rounds) → letters"],
  ["#10", "Sim Ten-Trial", "stanbridgejchris+sim-10@gmail.com", "https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=sorting&utm_content=45&utm_term=sun", "Soft pull → Repair trial ($200, two rounds) → upsell"],
  ["#11", "Sim Eleven-Blueprint", "stanbridgejchris+sim-11@gmail.com", "https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=uwiq&utm_content=26-underwriter&utm_term=sun", "Capital Blueprint → portal"],
  ["#12", "Sim Twelve-Academy", "stanbridgejchris+sim-12@gmail.com", "https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=premium&utm_content=82&utm_term=nosun", "Capital Academy → portal"],
  ["#13", "Sim Thirteen-NoBook", "stanbridgejchris+sim-13@gmail.com", "https://apply.fundhub.ai/watch?utm_source=fb&utm_medium=paid&utm_campaign=sorting&utm_content=43&utm_term=nosun", "Fills the survey, does NOT book → chase messages"],
  ["#14", "Sim Fourteen (spare)", "stanbridgejchris+sim-14@gmail.com", "same link as the client you rerun", "Only if a run above fails"],
];

const SAY = [
  ["push credit #N", "Claude puts a fake three-bureau credit file on that client. No bureau is called."],
  ["push payment #N", "Claude marks the open pay link as paid with a fake receipt. Needs you to press \"Send pay link\" first. It refuses the $32 soft-pull link."],
  ["make docs #N", "Already done for #8 to #12: ops/workflows/sim-documents/NN/. What to upload, in what order, and what should come back: ops/workflows/sim-documents/MATRIX.md."],
  ["put identity on file #N", "Claude writes the fake address and birth date where the document checker reads them, on that test client only. Use it when a good ID comes back \"one thing needs fixing\"."],
  ["check texts #N", "Claude checks the texts that went to the agent phone for that client."],
];

const NEVER = [
  ["\"Pull TransUnion\", \"Pull Experian\", \"Pull Equifax\"", "Client Control Panel", "Real credit pull"],
  ["\"Pay soft-pull assessment\" / \"Pay $32 assessment\"", "Soft-pull email and form page", "Paying starts a real credit pull"],
  ["Any pay link or Pay button", "Emails, texts, portal", "Real charge. Claude pushes the receipt instead"],
  ["\"Send with mail\"", "Specialist desk", "Real paper mail"],
  ["The old trial Enroll button", "Specialist desk", "Caps a client at the $200 two-round trial"],
  ["Anything that deletes", "Anywhere", "—"],
];

const RULES = [
  "fundhub.ai is running the <b>Sept 12 build</b>. If the new laptop build gets deployed first, the marketing screens change. See \"If the new build is live\" under L4.",
  "<b>Walk order:</b> 1) L4, all clients come in from their ad links. 2) L1, each client on the closer deck. 3) L2, fulfillment for #8, #9, #10. 4) L3, the money and the next offer.",
  "<b>New private window for every client</b> (Cmd+Shift+N). One email can run the funnel once.",
  "<b>Phone on every client: +16616054248</b> (the agent phone). Texts go there. Say \"check texts #N\".",
  "<b>Emails</b> land in your Gmail under the +sim-NN address.",
  "<b>Consent form values</b> for each client are in <code>ops/workflows/sim-documents/NN/consent-form.txt</code>. <b>Uploads</b> follow <code>ops/workflows/sim-documents/MATRIX.md</code>: the order, and what should pass or fail.",
  "<b>Push credit before push payment</b>, every client. Reload the deck and the file after each push; they do not refresh on their own.",
  "<b>Old test clients still exist:</b> Walk1–Walk4 and Sim One–Five. They are marked demo, so they are <b>hidden from Pipeline</b>. Their emails cannot run the funnel again. Use the fresh #8–#14.",
  "<b>Notes:</b> mark each step Worked / Broken / Not sure and type what you saw. Press \"Copy my notes\" and paste them into the chat.",
];

// ---------- Markdown ----------
const md = [];
const cell = (s) => unesc(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
md.push("# Live walkthrough — 2026-09-16");
md.push("");
md.push("**Who:** Chris clicks the live site and takes notes. Claude pushes the fake credit files and payments, and takes the notes.");
md.push("**Tickable version:** `ops/workflows/live-walkthrough-2026-09-16.html` (open it beside the site). **Scope:** checking only. No new features, no fixes mid-walk.");
md.push("**Traced from:** the build fundhub.ai was serving (`f739305e`, 2026-09-12). Local main was merged with it at `02c47b21`.");
md.push("");
md.push("## L0 — Before you start");
md.push("");
for (const r of RULES) md.push(`- ${r.replace(/<\/?b>/g, "**")}`);
md.push("");
md.push("### Test clients");
md.push("");
md.push("| # | Name | Email | Ad link (open first, private window) | Path |");
md.push("|---|---|---|---|---|");
for (const c of CLIENTS) md.push(`| ${c.map(cell).join(" | ")} |`);
md.push("");
md.push("### Say this to Claude");
md.push("");
md.push("| You say | Claude does |");
md.push("|---|---|");
for (const s of SAY) md.push(`| \`${s[0]}\` | ${cell(s[1])} |`);
md.push("");
md.push("### Never click");
md.push("");
md.push("| What | Where | Why |");
md.push("|---|---|---|");
for (const n of NEVER) md.push(`| ${n.map(cell).join(" | ")} |`);
md.push("");
for (const l of lanes) {
  md.push(`## ${l.key} — ${cell(l.title.replace(/^L\d\s*[—-]\s*/, ""))}`);
  md.push("");
  md.push(cell(l.summary));
  md.push("");
  md.push("```mermaid");
  md.push(unesc(l.diagram));
  md.push("```");
  md.push("");
  for (const s of l.sections) {
    md.push(`### ${cell(s.title)}`);
    md.push("");
    md.push("| Step | Client | Where | You do | You should see | Claude | Heads-up |");
    md.push("|---|---|---|---|---|---|---|");
    for (const st of s.steps) {
      md.push(`| ${[st.id, st.client, st.where, st.do, st.see, st.claude, st.heads_up].map(cell).join(" | ")} |`);
    }
    md.push("");
  }
  if (l.laptop_only_changes.length) {
    md.push("### If the new build is live");
    md.push("");
    for (const x of l.laptop_only_changes) md.push(`- ${cell(x)}`);
    md.push("");
  }
  if (l.could_not_trace.length) {
    md.push("### Watch closely — could not be traced in the code");
    md.push("");
    for (const x of l.could_not_trace) md.push(`- ${cell(x)}`);
    md.push("");
  }
}
md.push("## Evidence (for Claude, not for the walk)");
md.push("");
for (const l of lanes) for (const s of l.sections) for (const st of s.steps) md.push(`- ${st.id}: ${cell(st.evidence)}`);
md.push("");
md.push("## Findings");
md.push("");
md.push("`step | worked / broken / not sure | what you saw`");
md.push("");
md.push("(paste from the tickable page)");
md.push("");
fs.writeFileSync(`${REPO}/ops/workflows/live-walkthrough-2026-09-16.md`, md.join("\n"));

// ---------- HTML ----------
const h = (s) => unesc(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const old = fs.readFileSync(`${REPO}/ops/workflows/manual-walkthrough-runbook.html`, "utf8");
const style = old.slice(old.indexOf("<style>") + 7, old.indexOf("</style>"));
const copyBtn = (v) => `<button class="copy" data-copy="${h(v)}">Copy</button>`;

const nav = [
  `<a href="#l0"><span class="n">L0</span>Before you start</a>`,
  ...lanes.map((l) => `<a href="#${l.key}"><span class="n">${l.key}</span>${h(l.title.replace(/^L\d\s*[—-]\s*/, ""))}</a>`),
  `<a href="#notes"><span class="n">✎</span>My notes</a>`,
].join("\n");

const stepRow = (st) => `<tr data-step="${h(st.id)}">
<td>${h(st.id)}<div class="who">${h(st.client)}</div></td>
<td><div class="where">${/^https?:\/\//.test(unesc(st.where)) ? `<span class="link">${h(st.where)}</span>${copyBtn(st.where)}` : h(st.where)}</div>
<div class="do">${h(st.do)}</div>
${st.claude ? `<div class="claude"><span class="say">${h(st.claude)}</span></div>` : ""}</td>
<td>${h(st.see)}${st.heads_up ? `<div class="heads">Heads-up: ${h(st.heads_up)}</div>` : ""}</td>
<td class="mark"><div class="seg" role="group" aria-label="Result for ${h(st.id)}">
<button data-v="ok">Worked</button><button data-v="bad">Broken</button><button data-v="unsure">Not sure</button></div>
<textarea rows="2" placeholder="What you saw"></textarea></td>
</tr>`;

const laneHtml = (l) => `<h2 id="${l.key}">${l.key} · ${h(l.title.replace(/^L\d\s*[—-]\s*/, ""))}</h2>
<p class="lede">${h(l.summary)}</p>
<div class="diagram"><pre class="mermaid">${h(l.diagram)}</pre></div>
${l.sections.map((s) => `<h3>${h(s.title)}</h3>
<div class="tbl"><table><thead><tr><th>Step</th><th>You do</th><th>You should see</th><th>Your result</th></tr></thead>
<tbody>${s.steps.map(stepRow).join("\n")}</tbody></table></div>`).join("\n")}
${l.laptop_only_changes.length ? `<div class="known"><b>If the new build is live</b><ul>${l.laptop_only_changes.map((x) => `<li>${h(x)}</li>`).join("")}</ul></div>` : ""}
${l.could_not_trace.length ? `<div class="known"><b>Watch closely — could not be traced in the code</b><ul>${l.could_not_trace.map((x) => `<li>${h(x)}</li>`).join("")}</ul></div>` : ""}`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live Walkthrough Sheet</title>
<style>${style}
  .wrap{max-width:1320px}
  td .who{font-size:12px;margin-top:4px}
  .where{font-size:13px;color:var(--mute);margin-bottom:6px}
  .do{color:var(--ink)}
  .claude{margin-top:6px}
  .heads{margin-top:8px;padding:6px 8px;border-left:3px solid var(--warn);background:var(--soft);font-size:13.5px;color:var(--ink2)}
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
  .known ul{margin:6px 0 0;padding-left:18px}
  #allnotes{min-height:120px}
</style></head><body>
<div class="wrap">
<nav><p class="lab">Walkthrough</p>
${nav}
</nav>
<main>
<div class="bar"><button class="big" id="copyNotes">Copy my notes</button><span class="count" id="count"></span><span class="count" id="copied" aria-live="polite"></span></div>
<h1>Live walkthrough</h1>
<p class="lede">You click the live site and mark each step. Claude pushes the fake credit files and payments when you say so, then takes your notes.</p>
<div class="kv"><b>Date</b><span>2026-09-16</span><b>Where</b><span>fundhub.ai · apply.fundhub.ai (live)</span><b>Board</b><span><code>ops/workflows/live-walkthrough-2026-09-16.md</code></span><b>Rule</b><span>Checking only. If it breaks, mark it and keep going.</span></div>

<h2 id="l0">L0 · Before you start</h2>
<div class="rules">${RULES.map((r) => `<p>${r}</p>`).join("")}</div>
<h3>Test clients</h3>
<div class="tbl"><table><thead><tr><th>#</th><th>Name / email</th><th>Ad link</th><th>Path</th></tr></thead><tbody>
${CLIENTS.map((c) => `<tr><td>${h(c[0])}</td><td>${h(c[1])}<div class="link">${h(c[2])}</div>${copyBtn(c[2])}</td><td>${/^https/.test(c[3]) ? `<span class="link">${h(c[3])}</span>${copyBtn(c[3])}` : h(c[3])}</td><td>${h(c[4])}</td></tr>`).join("\n")}
</tbody></table></div>
<h3>Say this to Claude</h3>
<div class="tbl"><table><tbody>${SAY.map((s) => `<tr><td><span class="say">${h(s[0])}</span></td><td>${h(s[1])}</td></tr>`).join("")}</tbody></table></div>
<div class="rules stop"><p><b>Never click</b></p>${NEVER.map((n) => `<p>${h(n[0])} — ${h(n[1])}. ${h(n[2])}.</p>`).join("")}</div>

${lanes.map(laneHtml).join("\n")}

<h2 id="notes">My notes</h2>
<p class="note">Anything that doesn't fit a step. It is included when you press "Copy my notes".</p>
<textarea id="allnotes" data-key="free" placeholder="Anything else"></textarea>
</main></div>
<script>
(function(){
  var KEY = "fh-live-walk-2026-09-16";
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { saved = {}; }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} count(); }
  var rows = Array.prototype.slice.call(document.querySelectorAll("tr[data-step]"));
  function paint(tr){
    var s = saved[tr.dataset.step] || {};
    tr.className = s.v ? "r-" + s.v : "";
    tr.querySelectorAll(".seg button").forEach(function(b){ b.setAttribute("aria-pressed", String(b.dataset.v === s.v)); });
  }
  rows.forEach(function(tr){
    var id = tr.dataset.step, ta = tr.querySelector("textarea");
    var s = saved[id] || {};
    ta.value = s.n || "";
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
  function writeClip(text, done){
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function(){ fallback(text); done(); });
    } else { fallback(text); done(); }
  }
  function fallback(text){
    var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(t);
  }
  document.getElementById("copyNotes").addEventListener("click", function(){
    var lines = ["Live walkthrough notes 2026-09-16"];
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
fs.writeFileSync(`${REPO}/ops/workflows/live-walkthrough-2026-09-16.html`, html);
const steps = lanes.reduce((a, l) => a + l.sections.reduce((b, s) => b + s.steps.length, 0), 0);
console.log(`wrote md + html: ${lanes.length} lanes, ${steps} steps`);
