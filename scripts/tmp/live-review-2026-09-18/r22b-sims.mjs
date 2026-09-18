// Hole 22 round 2 reviewer — which clients are the Sims? Names only for test files. Read only.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const rows = (await c.query(`select id, first_name, last_name, client_code, is_demo, created_at from clients where first_name ilike 'sim%' or last_name ~ '[0-9]{6,}' or first_name ~* '^(eight|nine|ten|eleven|twelve|thirteen|combo)' or last_name ~* '(nobook|combo)' order by created_at`)).rows;
  for (const r of rows) console.log(r.id, "|", r.first_name, r.last_name, "|", r.client_code, "| demo", r.is_demo, "|", r.created_at.toISOString());
} finally { await c.query("ROLLBACK"); await c.end(); }
