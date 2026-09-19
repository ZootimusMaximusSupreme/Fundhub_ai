// r20 — reviewer's own read-only look at the LIVE database for hole 20.
// BEGIN READ ONLY, then ROLLBACK. No bare SET. Prints no secrets and no mail content.
//  1. every daily-pulse run (the only live writer that records a Gmail search result)
//  2. every agent_runs row in the last 7 days whose detail mentions gmail / google / oauth
//  3. Company Brain Drive sync state (same stored Google token as Gmail on live)
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.log("DATABASE_URL not set"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const ro = (await c.query("show transaction_read_only")).rows[0].transaction_read_only;
  console.log(`transaction_read_only=${ro}  now=${(await c.query("select now()")).rows[0].now.toISOString()}`);

  const cols = (await c.query(
    `select column_name from information_schema.columns where table_name='agent_runs' order by ordinal_position`
  )).rows.map((r) => r.column_name);
  console.log(`agent_runs columns: ${cols.join(", ")}`);

  const pulses = (await c.query(
    `select id, created_at, agent_code, mode, outcome, channel, length(detail) as len, detail
       from agent_runs where trigger_event = 'cron.daily-pulse' order by created_at`
  )).rows;
  console.log(`\n1. daily-pulse rows (all time): ${pulses.length}`);
  for (const r of pulses) {
    const parts = String(r.detail || "").split(" | ");
    console.log(`  ${r.created_at.toISOString()} agent=${r.agent_code} mode=${r.mode} outcome=${r.outcome} len=${r.len}`);
    for (const p of parts) console.log(`     - ${p.slice(0, 160)}`);
  }

  const g = (await c.query(
    `select created_at, agent_code, trigger_event, outcome, left(detail, 200) as d
       from agent_runs
      where created_at > now() - interval '7 days'
        and detail ~* '(gmail|google|oauth|invalid_grant)'
      order by created_at desc limit 20`
  )).rows;
  console.log(`\n2. agent_runs (7d) mentioning gmail/google/oauth: ${g.length}`);
  for (const r of g) console.log(`  ${r.created_at.toISOString()} ${r.agent_code} ${r.trigger_event} ${r.outcome} :: ${r.d}`);

  const s = (await c.query(
    `select org_id, last_sync_at, last_error, (page_token is not null) as has_page_token
       from brain_drive_sync order by last_sync_at desc nulls last`
  )).rows;
  console.log(`\n3. brain_drive_sync rows: ${s.length}`);
  for (const r of s) console.log(`  org=${String(r.org_id).slice(0, 8)} last_sync_at=${r.last_sync_at ? r.last_sync_at.toISOString() : null} has_page_token=${r.has_page_token} last_error=${r.last_error ? String(r.last_error).slice(0, 200) : null}`);

  await c.query("ROLLBACK");
} finally {
  await c.end();
}
