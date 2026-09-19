// Reviewer, hole N5 — render the live-log evidence into one page and take a
// marked screenshot (red numbered boxes + legend, CLAUDE.md §8). Reads only the
// summary JSON + log copies written by rr2-n5-logs.mjs. No network.
// Run: node rr2-n5-shot.mjs <beforeTag> <after1Tag> <after2Tag> <outName>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N5/review";
const [beforeTag, a1Tag, a2Tag, outName = "N5-review-live-logs"] = process.argv.slice(2);
const load = (t) => JSON.parse(readFileSync(path.join(DIR, `${t}-summary.json`), "utf8"));
const wins = [load(beforeTag), load(a1Tag), load(a2Tag)];
const labels = ["BEFORE fix (old deploy 15b83bf5)", "AFTER fix — check 1 (deploy 1ad2c5f8)", "AFTER fix — check 2 (deploy 1ad2c5f8)"];
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const excerpt = (tag, n) =>
  readFileSync(path.join(DIR, `${tag}-commas-inbox-sweeper.log`), "utf8")
    .split("\n")
    .filter((l) => /Duration|ERROR/.test(l))
    .slice(0, n)
    .map((l) => esc(l.replace(/"stack".*$/, "…").slice(0, 150)))
    .join("\n");

const table = (w, i) => `
  <div class="win" id="win${i}">
    <h3>${labels[i]} — ${w.window[0].slice(11, 16)}–${w.window[1].slice(11, 16)} UTC</h3>
    <table><tr><th>Timed job</th><th>Runs every</th><th>Runs seen</th><th>Most runs in one tick</th><th>"unsupported value" lines</th><th>Invoke Error lines</th></tr>
    ${w.jobs.map((j) => `<tr><td>${j.name}</td><td>${j.every_min} min</td><td>${j.runs} (expect ~${j.expected_runs_approx})</td>
      <td class="k">${j.max_runs_in_one_tick}</td><td class="k">${j.unsupported_value_lines}</td><td class="k">${j.invoke_error_lines}</td></tr>`).join("")}
    </table>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 body{font:13px -apple-system,Segoe UI,sans-serif;background:#fff;color:#111;margin:16px;width:1180px}
 h2{margin:0 0 6px} h3{margin:10px 0 4px;font-size:14px}
 table{border-collapse:collapse;width:100%} td,th{border:1px solid #ccc;padding:3px 6px;text-align:left} th{background:#f2f2f2}
 td.k{font-weight:700;text-align:center}
 pre{background:#111;color:#ddd;padding:6px;font-size:11px;white-space:pre-wrap;margin:4px 0}
 .mark{position:absolute;border:3px solid #e00;pointer-events:none}
 .num{position:absolute;background:#e00;color:#fff;font-weight:700;padding:1px 7px;border-radius:10px;font-size:13px}
 .legend{margin-top:12px;border:2px solid #e00;padding:6px 10px} .legend div{margin:2px 0}
</style></head><body>
<h2>Hole N5 — live Netlify logs of the five timed jobs (reviewer, ${new Date().toISOString().slice(0, 16)}Z)</h2>
<div>Source: <code>netlify logs --function &lt;job&gt;</code> on site transcendent-wisp-888771. Fix deploy 1ad2c5f8 went live 19:47:05 UTC.</div>
${wins.map(table).join("")}
<h3>Raw log lines, commas-inbox-sweeper (every minute)</h3>
<div id="rawB"><b>Before:</b><pre>${excerpt(beforeTag, 6)}</pre></div>
<div id="rawA"><b>After (check 1):</b><pre>${excerpt(a1Tag, 4)}</pre></div>
<div class="legend">
 <div><b>1</b> Before the fix: every tick ran 3 times and every run ended in "Function returned an unsupported value" (Invoke Error). Hole recreated on live.</div>
 <div><b>2</b> After the fix, check 1: one run per tick, zero "unsupported value", zero Invoke Error, on all five jobs.</div>
 <div><b>3</b> After the fix, check 2 (next 10 minutes): same — one run per tick, zero errors.</div>
 <div><b>4</b> Raw lines: before = ERROR after every run, runs 1 s apart (retries); after = one clean "Duration" line per minute.</div>
</div>
</body></html>`;
const htmlPath = path.join(DIR, `${outName}.html`);
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1212, height: 900 } });
await page.goto("file://" + htmlPath);
await page.evaluate(() => {
  const box = (el, n, pad = 4) => {
    const r = el.getBoundingClientRect();
    const d = document.createElement("div");
    d.className = "mark";
    Object.assign(d.style, { left: r.left + scrollX - pad + "px", top: r.top + scrollY - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    document.body.appendChild(d);
    const b = document.createElement("div");
    b.className = "num";
    b.textContent = n;
    Object.assign(b.style, { left: r.right + scrollX + pad + 4 + "px", top: r.top + scrollY - pad + "px" });
    document.body.appendChild(b);
  };
  ["win0", "win1", "win2"].forEach((id, i) => {
    const cells = [...document.querySelectorAll(`#${id} td.k`)];
    const first = cells[0].getBoundingClientRect();
    const last = cells[cells.length - 1].getBoundingClientRect();
    box({ getBoundingClientRect: () => ({ left: first.left, top: first.top, right: last.right, bottom: last.bottom, width: last.right - first.left, height: last.bottom - first.top }) }, String(i + 1));
  });
  const raw = document.querySelector("#rawB pre").getBoundingClientRect();
  const rawA = document.querySelector("#rawA pre").getBoundingClientRect();
  box({ getBoundingClientRect: () => ({ left: raw.left, top: raw.top, right: rawA.right - 40, bottom: rawA.bottom, width: rawA.right - 40 - raw.left, height: rawA.bottom - raw.top }) }, "4");
});
const png = path.join(DIR, `${outName}.png`);
await page.screenshot({ path: png, fullPage: true });
await browser.close();
console.log(png);
