// HOLE 12 round 2 — LOOK ONLY. Which live message templates print the saved
// next action, and has any of them ever gone out? BEGIN READ ONLY, ROLLBACK.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h12r2-templates.mjs
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(
    `select template_key, channel, count(*)::int n from message_templates
      where body ilike '%employee_next_action%' or coalesce(subject,'') ilike '%employee_next_action%'
      group by 1,2 order by 1`);
  console.log("templates that print it:", JSON.stringify(r.rows));
  const m = await c.query(`select template_key, count(*)::int n, max(created_at) last from messages where template_key ilike '%DPC05%' group by 1`);
  console.log("DPC-05 messages ever:", JSON.stringify(m.rows));
  await c.query("ROLLBACK");
} finally { await c.end(); }
