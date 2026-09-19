// Hole 23 reviewer — which tables hold consent / pull / credit report rows. READ ONLY.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(`SELECT table_name, string_agg(column_name||':'||data_type, ', ' ORDER BY ordinal_position) cols
    FROM information_schema.columns WHERE table_schema='public'
      AND (table_name ILIKE '%consent%' OR table_name ILIKE '%pull%' OR table_name ILIKE '%credit%' OR table_name ILIKE '%bureau%' OR table_name ILIKE '%authoriz%' OR table_name ILIKE '%permission%' OR table_name ILIKE '%crs%')
    GROUP BY table_name ORDER BY 1`);
  for (const x of r.rows) console.log(x.table_name + "\n   " + x.cols + "\n");
  await c.query("ROLLBACK");
} finally { await c.end(); }
