// Hole N6 — read only. How many times a minute the payment-queue claim runs
// on live, next to whether the api function (where the Inngest drain lives) is
// answering. The claim is the one query both the Netlify sweeper and the Inngest
// drain run on every pass, so its call count per minute is "passes per minute"
// from both clocks together.
//
// Reads pg_stat_statements through the Supabase management API (a SELECT only,
// no transaction state, not the port-6543 pooler) and GETs /api/health.
// Prints counts and status codes only — no rows, no payloads, no secrets.
// Usage: node --env-file=<.env> r2-n6-claim-rate.mjs [minutes=10]
const REF = "oqpnlusrotpxfenysfxz";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const minutes = Number(process.argv[2] || 10);

async function claimCalls() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "SELECT now() AS db_now, coalesce(sum(calls),0)::bigint AS calls " +
        "FROM extensions.pg_stat_statements " +
        "WHERE query ILIKE '%UPDATE commas_inbox%attempts = attempts +%FOR UPDATE SKIP LOCKED%'"
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return body[0];
}

async function health() {
  try {
    const r = await fetch("https://fundhub.ai/api/health", { signal: AbortSignal.timeout(15000) });
    return r.status;
  } catch {
    return "timeout";
  }
}

let prev = await claimCalls();
console.log(`${prev.db_now} start calls=${prev.calls} health=${await health()}`);
for (let i = 0; i < minutes; i++) {
  await new Promise((r) => setTimeout(r, 60000));
  const cur = await claimCalls();
  console.log(`${cur.db_now} +${Number(cur.calls) - Number(prev.calls)} claims in the last minute (total ${cur.calls}) health=${await health()}`);
  prev = cur;
}
