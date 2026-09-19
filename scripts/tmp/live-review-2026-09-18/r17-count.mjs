// HOLE 17 REVIEWER — read-only count of #13's documents on the live database.
// BEGIN READ ONLY, then ROLLBACK. No bare SET. Prints no secrets.
import pg from "pg";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const host = new URL(process.env.DATABASE_URL).hostname.split(".").slice(-3).join(".");
  const cols = (await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name='documents' order by ordinal_position`)).rows.map((r) => r.column_name);
  const who = (await c.query(`select current_user, (select first_name||' '||last_name from clients where id=$1) as name`, [ID])).rows[0];
  const rows = (await c.query(`select id, kind, subtype, title, mime_type, byte_size, (storage_key is not null) as has_storage_key, created_at from documents where client_id=$1 order by created_at`, [ID])).rows;
  console.log(JSON.stringify({ at: new Date().toISOString(), host, user: who.current_user, client: who.name, cols, count: rows.length, rows }, null, 2));
} finally { await c.query("ROLLBACK"); await c.end(); }
