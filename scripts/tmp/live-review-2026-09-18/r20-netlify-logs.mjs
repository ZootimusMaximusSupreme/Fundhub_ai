// r20 — read-only: page through LIVE Netlify function logs (api function, which serves
// /api/inngest, so the daily pulse and the 5-minute Blake Gmail watch run inside it).
// The CLI returns at most 100 lines per call, so each window is split until it fits.
// Prints only lines that mention Gmail / Google / OAuth / Blake / pulse, cut short.
// Usage: node r20-netlify-logs.mjs <sinceISO> <untilISO> [levels comma list]
import { execFileSync } from "node:child_process";

const [since, until, levelsArg] = process.argv.slice(2);
const levels = levelsArg ? levelsArg.split(",") : null;
const HIT = /gmail|google|oauth|invalid_grant|blake|pulse|insufficient|scope|unauthori[sz]ed|401|403/i;
let calls = 0;
const all = [];

function fetchWindow(a, b) {
  calls += 1;
  const args = ["logs", "--source", "functions", "--function", "api", "--since", a, "--until", b, "--json"];
  if (levels) args.push("--level", ...levels);
  const out = execFileSync("netlify", args, { cwd: "/Users/chrisstanbridge/Developer/fundhub-platform", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.trim() ? out.trim().split("\n").map((l) => JSON.parse(l)) : [];
}

function walk(aMs, bMs, depth = 0) {
  const rows = fetchWindow(new Date(aMs).toISOString(), new Date(bMs).toISOString());
  if (rows.length >= 100 && bMs - aMs > 50 && depth < 40) {
    const mid = Math.floor((aMs + bMs) / 2);
    walk(aMs, mid, depth + 1);
    walk(mid, bMs, depth + 1);
    return;
  }
  if (rows.length >= 100) console.log(`  (window ${new Date(aMs).toISOString()} still capped at 100 — some lines may be missing)`);
  all.push(...rows);
}

walk(Date.parse(since), Date.parse(until));
const seen = new Set();
const hits = [];
for (const r of all) {
  const key = `${r.timestamp}|${r.message}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (HIT.test(String(r.message))) hits.push(r);
}
console.log(`cli calls=${calls} lines=${seen.size} matching=${hits.length}`);
const byMsg = new Map();
for (const r of hits) {
  const m = String(r.message).replace(/\s+/g, " ").replace(/(Bearer|token|secret|key)[=: ]+\S+/gi, "$1=[hidden]").slice(0, 240);
  const cur = byMsg.get(m) || { n: 0, first: r.timestamp, last: r.timestamp, level: r.level };
  cur.n += 1; cur.last = r.timestamp;
  byMsg.set(m, cur);
}
for (const [m, v] of byMsg) console.log(`${v.n}x [${v.level}] ${v.first}..${v.last} ${m}`);
if (process.env.R20_DUMP) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.R20_DUMP, all.map((r) => JSON.stringify(r)).join("\n"));
  console.log(`dumped ${all.length} lines to scratch file`);
}
