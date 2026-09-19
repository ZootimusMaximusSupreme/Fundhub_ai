// Hole N6 — read only. Splits the payment-queue claim count per minute into
// "Netlify sweeper passes" and "everything else" (the Inngest drain is the
// only other caller of claim(); see src/payments/commas-inbox.mjs importers).
//
// How: sample pg_stat_statements (SELECT only, via the Supabase management
// API — not the port-6543 pooler, no transaction state) at second :30 of each
// minute, so the sweeper's burst at the top of the minute lands wholly inside
// one window. Then count the sweeper's own invocations in each window from
// its Netlify function log. With an empty queue one pass = one claim, so
//   other = claims − sweeper invocations.
// Prints counts only — no rows, payloads or secrets.
// Usage: node --env-file=<.env> r2-n6-attribute.mjs [minutes=10]
import { execFileSync } from "node:child_process";

const REF = "oqpnlusrotpxfenysfxz";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const minutes = Number(process.argv[2] || 10);
const CWD = "/Users/chrisstanbridge/Developer/fundhub-platform";

async function sample() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "SELECT now() AS db_now, coalesce(sum(calls),0)::bigint AS calls, " +
        "(SELECT count(*) FROM commas_inbox WHERE status IN ('pending','failed','processing'))::int AS waiting " +
        "FROM extensions.pg_stat_statements " +
        "WHERE query ILIKE '%UPDATE commas_inbox%attempts = attempts +%FOR UPDATE SKIP LOCKED%'"
    })
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  const [row] = await res.json();
  return { at: new Date(row.db_now), calls: Number(row.calls), waiting: row.waiting };
}

function sweeperInvocations(from, to) {
  let out = "";
  try {
    out = execFileSync("netlify", ["logs", "--function", "commas-inbox-sweeper", "--since", from.toISOString(),
      "--until", to.toISOString(), "--json"], { cwd: CWD, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { out = String(e.stdout || ""); }
  const lines = out.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return lines.filter((l) => /^Duration:/.test(l.message) && new Date(l.timestamp) >= from && new Date(l.timestamp) < to).length;
}

const waitUntilSecond30 = async () => {
  const now = Date.now();
  const next = Math.ceil((now - 30000) / 60000) * 60000 + 30000;
  await new Promise((r) => setTimeout(r, Math.max(0, next - now)));
};

await waitUntilSecond30();
const samples = [await sample()];
for (let i = 0; i < minutes; i++) {
  await waitUntilSecond30();
  samples.push(await sample());
}
// Give Netlify's log pipeline a moment to catch up.
await new Promise((r) => setTimeout(r, 20000));
let totalClaims = 0, totalSweeper = 0;
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], b = samples[i];
  const claims = b.calls - a.calls;
  const sw = sweeperInvocations(a.at, b.at);
  totalClaims += claims; totalSweeper += sw;
  console.log(`${a.at.toISOString().slice(11, 19)}→${b.at.toISOString().slice(11, 19)} claims=${claims} sweeper=${sw} other(drain)=${claims - sw} queue-waiting=${b.waiting}`);
}
console.log(`TOTAL ${samples.length - 1} min: claims=${totalClaims} sweeper=${totalSweeper} other(drain)=${totalClaims - totalSweeper}`);
