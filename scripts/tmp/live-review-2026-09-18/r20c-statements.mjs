// r20c — read-only: is the Inngest clock ticking on live right now?
// Reads pg_stat_statements call counters for SQL that only timed jobs run:
//   next-action-catch-up (every 5 min) — its COUNT_SQL on clients.employee_next_action
//   commas-inbox-drain (every minute)  — the commas_inbox claim query
// Run twice, minutes apart; the counter growth is the number of passes.
// BEGIN READ ONLY; no SET. Prints counts and query shapes only — never a value or secret.
import pg from "pg";
const url = process.env.DATABASE_URL;
const u = new URL(url);
console.log(`db host=${u.hostname} port=${u.port} user=${decodeURIComponent(u.username).split(".")[0]}`);
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const now = (await c.query("select now() as now")).rows[0].now;
  console.log(`db now=${new Date(now).toISOString()}`);
  const q = async (label, sql, params = []) => {
    try { const r = await c.query(sql, params); return r.rows; }
    catch (e) { console.log(label, "ERR", e.message.slice(0, 160)); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); return null; }
  };
  const ext = await q("ext", "select extname, extnamespace::regnamespace::text as ns from pg_extension where extname='pg_stat_statements'");
  console.log("ext", JSON.stringify(ext));
  const ns = ext?.[0]?.ns || "extensions";
  const rows = await q("stmts", `select calls, left(regexp_replace(query, '\\s+', ' ', 'g'), 140) as q
      from ${ns}.pg_stat_statements
     where query ilike '%employee_next_action%' or query ilike '%commas_inbox%'
     order by calls desc limit 20`);
  for (const r of rows || []) console.log(String(r.calls).padStart(8), r.q);
  const reset = await q("reset", `select stats_reset from ${ns}.pg_stat_statements_info`);
  console.log("stats_reset", JSON.stringify(reset));
  await c.query("ROLLBACK");
} finally { await c.end(); }
