import pg from "pg";
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const q = async (label, sql) => { try { const r = await c.query(sql); console.log(label, JSON.stringify(r.rows)); } catch (e) { console.log(label, "ERR", e.message.slice(0,120)); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); } };
  await q("now", "select now()");
  await q("agent_runs_by_10min_since_15", "select date_trunc('hour',created_at)+ (floor(extract(minute from created_at)/10)*10)*interval '1 minute' as slot, count(*) from agent_runs where created_at > now()-interval '2 hours' group by 1 order by 1");
  await q("messages_status_since_15", "select status, count(*), max(created_at) as last_created, max(sent_at) as last_sent from messages where created_at > now()-interval '3 hours' group by status");
  await q("queued_now", "select count(*) , min(created_at) from messages where status='queued'");
  await q("events_by_10min", "select date_trunc('hour',created_at)+ (floor(extract(minute from created_at)/10)*10)*interval '1 minute' as slot, count(*) from events where created_at > now()-interval '2 hours' group by 1 order by 1");
  await c.query("ROLLBACK");
} finally { await c.end(); }
