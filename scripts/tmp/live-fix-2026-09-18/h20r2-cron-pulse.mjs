// h20r2 — read-only: are live timed jobs reaching the site since the 16:48 UTC rollback?
// The Blake Gmail watch writes nothing on success, so look for any cron-side trace:
// agent_runs rows by trigger_event per 10 minutes. BEGIN READ ONLY, ROLLBACK, no SET.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const rows = (await c.query(
    `select to_char(date_trunc('hour', created_at) + floor(extract(minute from created_at) / 10) * interval '10 min', 'HH24:MI') as slot,
            trigger_event, count(*)::int as n
       from agent_runs
      where created_at > now() - interval '3 hours' and trigger_event like 'cron.%'
      group by 1, 2 order by 1, 2`)).rows;
  for (const r of rows) console.log(`${r.slot} UTC ${r.trigger_event} x${r.n}`);
  if (!rows.length) console.log("no cron.* agent_runs rows in the last 3 hours");
  await c.query("ROLLBACK");
} finally { await c.end(); }
