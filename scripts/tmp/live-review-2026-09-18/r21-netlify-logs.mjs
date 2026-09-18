// r21 — read-only: LIVE Netlify function logs for the api function (serves /api/inngest,
// where the message-dispatch sweeper runs) in a short window. Prints lines about the
// dispatcher, unsubscribe footer, template tokens, or no-book, with emails/phones masked.
// Usage: node r21-netlify-logs.mjs <sinceISO> <untilISO>
import { execFileSync } from "node:child_process";

const [since, until] = process.argv.slice(2);
const HIT = /dispatch|unsubscribe|unknown token|nobook|no-book|resend|twilio|sweeper/i;
const maskEmail = (m) => { const [u, d] = m.split("@"); return `${u.slice(0, 6)}***@${d}`; };
const scrub = (s) => String(s ?? "")
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, maskEmail)
  .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => `…${m.replace(/\D/g, "").slice(-4)}`)
  .replace(/([?&](sig|token|t|s)=)[^&\s"]+/gi, "$1<redacted>");

let calls = 0;
const all = [];
function fetchWindow(a, b) {
  calls += 1;
  const out = execFileSync("netlify", ["logs", "--source", "functions", "--function", "api", "--since", a, "--until", b, "--json"],
    { cwd: "/Users/chrisstanbridge/Developer/fundhub-platform", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.trim() ? out.trim().split("\n").map((l) => JSON.parse(l)) : [];
}
function walk(aMs, bMs, depth = 0) {
  const rows = fetchWindow(new Date(aMs).toISOString(), new Date(bMs).toISOString());
  if (rows.length >= 100 && bMs - aMs > 50 && depth < 40) {
    const mid = Math.floor((aMs + bMs) / 2);
    walk(aMs, mid, depth + 1); walk(mid, bMs, depth + 1); return;
  }
  if (rows.length >= 100) console.log(`  (window ${new Date(aMs).toISOString()} capped at 100)`);
  all.push(...rows);
}
walk(Date.parse(since), Date.parse(until));
const seen = new Set();
let total = 0;
for (const r of all.sort((x, y) => String(x.timestamp).localeCompare(String(y.timestamp)))) {
  const k = `${r.timestamp}|${r.message}`;
  if (seen.has(k)) continue;
  seen.add(k); total += 1;
  if (process.env.ALL || HIT.test(r.message)) console.log(`${r.timestamp} [${r.level ?? "-"}] ${scrub(r.message).slice(0, 260)}`);
}
console.log(`calls=${calls} lines=${total}`);
