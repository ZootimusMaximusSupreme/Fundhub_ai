// h20r2 — read-only: what did the live daily pulse record for its Gmail check?
// agent_runs.detail holds only FAIL rows ("gmail: ...") or "all PASS". A "skip" (token not ready)
// is not a failure, so it is invisible here — that is why "no Gmail failure row" never proved a read.
// BEGIN READ ONLY, ROLLBACK, no SET (pooler memory).
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const rows = (await c.query(
    `select created_at, mode, outcome, left(detail, 400) as detail
       from agent_runs where trigger_event = 'cron.daily-pulse'
      order by created_at desc limit 8`)).rows;
  for (const r of rows) {
    const g = String(r.detail || "").split(" | ").filter((x) => x.startsWith("gmail")).join(" | ") || "(no gmail row)";
    console.log(`${r.created_at.toISOString()} mode=${r.mode} outcome=${r.outcome} gmail=${g}`);
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
