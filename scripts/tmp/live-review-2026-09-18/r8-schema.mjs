// r8 — reviewer: column names of funding_rounds / clients / applications. BEGIN READ ONLY, ROLLBACK.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  for (const t of ["funding_rounds", "clients", "applications"]) {
    const cols = (await c.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t])).rows;
    console.log(`== ${t}:`, cols.map((r) => `${r.column_name}:${r.data_type}`).join(", "));
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
