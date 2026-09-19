// r12c — READ ONLY. Columns of agent_runs, action_log, events, tasks. BEGIN READ ONLY, ROLLBACK.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  for (const t of ["agent_runs", "action_log", "events", "tasks"]) {
    const cols = await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
    console.log(t + ":", cols.rows.map((x) => x.column_name).join(","));
  }
  const ar = await c.query(`select max(created_at) m, count(*)::int n from agent_runs`);
  console.log("agent_runs latest:", ar.rows[0].m?.toISOString?.(), "n=", ar.rows[0].n);
  await c.query("ROLLBACK");
} finally { await c.end(); }
