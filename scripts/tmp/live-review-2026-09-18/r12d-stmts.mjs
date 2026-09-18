// r12d — READ ONLY. Did the catch-up's own UPDATE text run on live? pg_stat_statements calls for the
// exact FIX_SQL shape (one key, guarded by the old value). BEGIN READ ONLY, ROLLBACK. No SET. No secrets printed.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  console.log("now", (await c.query("select now() n")).rows[0].n.toISOString(), "user", (await c.query("select current_user u")).rows[0].u);
  try {
    const r = await c.query(`select calls, rows, left(regexp_replace(query, '\\s+', ' ', 'g'), 260) q
                               from extensions.pg_stat_statements
                              where query ilike '%jsonb_build_object(%employee_next_action%'
                                 or query ilike '%custom_fields->>''employee_next_action'' <> ''''%'
                              order by calls desc limit 12`);
    for (const x of r.rows) console.log(`calls=${x.calls} rows=${x.rows} :: ${x.q}`);
    if (!r.rows.length) console.log("no matching statements");
  } catch (e) { console.log("pg_stat_statements not readable:", e.message.slice(0, 160)); }
  await c.query("ROLLBACK");
} finally { await c.end(); }
