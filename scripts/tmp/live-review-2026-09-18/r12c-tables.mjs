// r12c — reviewer (hole 12 round 3) — READ ONLY. Which tables could hold run / change evidence?
// BEGIN READ ONLY, ROLLBACK. No bare SET. Prints no secrets.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(`select table_name from information_schema.tables where table_schema='public'
     and (table_name ~* '(run|audit|history|log|change|workflow|job|cron)') order by 1`);
  console.log(r.rows.map((x) => x.table_name).join(", "));
  const cols = await c.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='messages' order by ordinal_position`);
  console.log("messages cols:", cols.rows.map((x) => x.column_name).join(","));
  await c.query("ROLLBACK");
} finally { await c.end(); }
