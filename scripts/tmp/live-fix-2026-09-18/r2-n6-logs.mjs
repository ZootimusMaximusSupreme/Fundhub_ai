// Hole N6 — read only. Counts `api` function invocations minute by minute
// from Netlify's function log, so a once-a-minute timed job shows up as a
// request near the top of every minute. Prints no request bodies.
// Usage: node r2-n6-logs.mjs <startISO> <minutes> [deployId] [grep] [function=api]
import { execFileSync } from "node:child_process";

const [startIso, minutesArg = "10", deployId = "", grep = "", fn = "api"] = process.argv.slice(2);
const start = new Date(startIso);
const minutes = Number(minutesArg);
const cwd = "/Users/chrisstanbridge/Developer/fundhub-platform";

for (let i = 0; i < minutes; i++) {
  const a = new Date(start.getTime() + i * 60000);
  const b = new Date(a.getTime() + 60000);
  const args = ["logs", "--function", fn, "--since", a.toISOString(), "--until", b.toISOString(), "--json"];
  if (deployId) args.push("--deploy-id", deployId);
  let out = "";
  try {
    out = execFileSync("netlify", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = String(e.stdout || "");
  }
  const lines = out.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const inv = lines.filter((l) => /^Duration:/.test(l.message));
  const secs = inv.map((l) => l.timestamp.slice(17, 19)).join(",");
  const hits = grep ? lines.filter((l) => new RegExp(grep).test(l.message)).map((l) => `${l.timestamp.slice(11, 19)} ${l.message.slice(0, 160).replace(/\n/g, " ")}`) : [];
  const maxMs = inv.reduce((m, l) => Math.max(m, Number((l.message.match(/Duration: ([0-9.]+) ms/) || [])[1] || 0)), 0);
  const errs = lines.filter((l) => /Task timed out|timed out after|Invoke Error/.test(l.message)).length;
  console.log(`${a.toISOString().slice(11, 16)} invocations=${inv.length}${lines.length >= 100 ? " (CAPPED)" : ""} maxMs=${maxMs} timeouts-or-errors=${errs} at-seconds=[${secs}]`);
  for (const h of hits) console.log(`    ${h}`);
}
