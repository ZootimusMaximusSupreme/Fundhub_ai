// Hole 22 reviewer — read-only schema look: which live tables carry client_id, and
// which columns look like address / survey / intake. BEGIN READ ONLY, no SET.
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const who = (await c.query("select current_user, (select rolbypassrls from pg_roles where rolname=current_user) bypass")).rows[0];
  console.log("role", who);
  const tabs = (await c.query(`
    select table_schema, table_name from information_schema.columns
     where column_name='client_id' and table_schema='public'
     order by table_name`)).rows;
  console.log("tables with client_id:", tabs.length);
  const counts = [];
  for (const t of tabs) {
    await c.query("SAVEPOINT s");
    try {
      const n = (await c.query(`select count(*)::int n from public."${t.table_name}" where client_id::text = $1`, [COMBO])).rows[0].n;
      await c.query("RELEASE SAVEPOINT s");
      if (n > 0) counts.push([t.table_name, n]);
    } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); counts.push([t.table_name, "ERR " + e.message.slice(0, 80)]); }
  }
  console.log("rows for Combo by table:", JSON.stringify(counts));
  const addrCols = (await c.query(`
    select table_name, column_name, data_type from information_schema.columns
     where table_schema='public' and (column_name ilike '%addr%' or column_name ilike '%street%' or column_name ilike '%zip%' or column_name ilike '%postal%' or column_name ilike '%city%')
     order by 1,2`)).rows;
  console.log("address-like columns:", JSON.stringify(addrCols.map(r => `${r.table_name}.${r.column_name}:${r.data_type}`)));
} finally { await c.query("ROLLBACK"); await c.end(); }
