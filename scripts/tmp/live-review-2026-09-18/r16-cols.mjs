// HOLE 16 REVIEWER — read-only column list. BEGIN READ ONLY; no SET.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  for (const t of ["agent_runs", "messages", "documents", "failed_events"]) {
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position`, [t]);
    console.log(t, ":", r.rows.map((x) => x.column_name).join(","));
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
