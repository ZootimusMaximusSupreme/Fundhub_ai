// h20r2 — read-only: walk LIVE Netlify api-function logs (serves /api/inngest, where the
// 5-minute Blake Gmail watch runs) in small windows. The CLI returns nothing for long windows
// (measured: 15:00–16:14 → 0 lines, 16:00–16:14 → 14 lines), so windows stay at 10 minutes
// and split again if a window is capped at 100 lines.
// Prints per-window counts of Gmail/OAuth error lines only. Never prints a secret.
// Usage: node h20r2-logs.mjs <sinceISO> <untilISO> [levels comma list, default error]
import { execFileSync } from "node:child_process";

const [since, until, levelsArg = "error"] = process.argv.slice(2);
const show = levelsArg === "show"; // print each line, cut short, with anything key-like hidden
const levels = levelsArg === "all" || show ? null : levelsArg.split(",");
const STEP = 10 * 60_000;
const HIT = /invalid_client|invalid_grant|oauth token refresh|gmail|unauthorized_client/i;

function fetchWindow(a, b) {
  const args = ["logs", "--source", "functions", "--function", "api", "--since", a, "--until", b, "--json"];
  if (levels) args.push("--level", ...levels);
  const out = execFileSync("netlify", args, {
    cwd: "/Users/chrisstanbridge/Developer/fundhub-platform", encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  return out.trim() ? out.trim().split("\n").map((l) => JSON.parse(l)) : [];
}

function walk(aMs, bMs, depth = 0) {
  const rows = fetchWindow(new Date(aMs).toISOString(), new Date(bMs).toISOString());
  if (rows.length >= 100 && bMs - aMs > 5_000 && depth < 12) {
    const mid = Math.floor((aMs + bMs) / 2);
    return [...walk(aMs, mid, depth + 1), ...walk(mid, bMs, depth + 1)];
  }
  return rows;
}

for (let t = Date.parse(since); t < Date.parse(until); t += STEP) {
  const b = Math.min(t + STEP, Date.parse(until));
  const rows = walk(t, b);
  if (show) {
    for (const r of rows) {
      const m = String(r.message).replace(/\s+/g, " ").replace(/(Bearer|token|secret|key)[=: ]+\S+/gi, "$1=[hidden]");
      console.log(`${r.timestamp.slice(11, 23)} ${r.level} ${m.slice(0, 120)}`);
    }
  }
  const hits = rows.filter((r) => HIT.test(String(r.message)));
  const kinds = new Map();
  for (const r of hits) {
    const m = String(r.message).match(/\((\d{3})\): ([a-z_]+)/);
    const k = m ? `${m[1]} ${m[2]}` : String(r.message).replace(/\s+/g, " ").slice(0, 80);
    kinds.set(k, (kinds.get(k) || 0) + 1);
  }
  const first = hits[0]?.timestamp || "";
  console.log(`${new Date(t).toISOString().slice(11, 16)}-${new Date(b).toISOString().slice(11, 16)} lines=${rows.length} gmail_hits=${hits.length} ${[...kinds].map(([k, n]) => `${n}x ${k}`).join("; ")} ${first}`);
}
