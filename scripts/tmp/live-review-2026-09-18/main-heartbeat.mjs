// Read-only heartbeat: any sign a timed (Inngest) job ran after 17:02 UTC re-register.
import pg from "pg";
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await c.connect();
const q = async (label, sql) => { try { const r = await c.query(sql); console.log(label, JSON.stringify(r.rows)); } catch (e) { console.log(label, "ERR", e.message.slice(0, 140)); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); } };
try {
  await c.query("BEGIN READ ONLY");
  await q("now", "select now()");
  await q("agent_runs_since_1630", "select agent_id, outcome, created_at from agent_runs where created_at > '2026-09-18 16:30:00+00' order by created_at desc limit 10");
  await q("events_since_1630", "select type, created_at from events where created_at > '2026-09-18 16:30:00+00' order by created_at desc limit 10");
  await q("messages_since_1630", "select template_key, status, created_at from messages where created_at > '2026-09-18 16:30:00+00' order by created_at desc limit 10");
  await q("doc_retry_queue", "select count(*) filter (where true) as n from information_schema.tables where table_name ilike '%retry%'");
  await q("retry_tables", "select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%retry%' or table_name ilike '%queue%' or table_name ilike '%cron%' or table_name ilike '%heartbeat%')");
  await c.query("ROLLBACK");
} finally { await c.end(); }
