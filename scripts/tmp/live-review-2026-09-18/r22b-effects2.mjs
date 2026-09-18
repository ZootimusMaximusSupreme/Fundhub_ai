// Hole 22 round 2 reviewer — tables that point at a client without a client_id column, and client_id tables with no timestamps. Read only.
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const SINCE = process.argv[2] || "2026-09-18T15:38:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const noTs = (await c.query(`select table_name from information_schema.columns where table_schema='public' group by table_name
     having bool_or(column_name='client_id') and not bool_or(column_name in ('created_at','updated_at'))`)).rows.map((r) => r.table_name);
  console.log("client_id tables with no timestamp:", noTs.join(",") || "none");
  for (const t of noTs) { const n = (await c.query(`select count(*)::int n from public."${t}" where client_id=$1`, [COMBO])).rows[0].n; console.log(" ", t, "combo rows total", n); }
  const refs = (await c.query(`select table_name, column_name, data_type from information_schema.columns where table_schema='public'
     and column_name in ('entity_id','subject_id','target_id','record_id','ref_id','resource_id','object_id') order by 1`)).rows;
  for (const r of refs) {
    const cols = (await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [r.table_name])).rows.map((x) => x.column_name);
    const ts = cols.includes("created_at") ? "created_at" : (cols.includes("at") ? "at" : null);
    await c.query("SAVEPOINT s");
    try {
      const n = (await c.query(`select count(*)::int n from public."${r.table_name}" where ${r.column_name}::text=$1 ${ts ? `and ${ts} >= $2` : ""}`, ts ? [COMBO, SINCE] : [COMBO])).rows[0].n;
      await c.query("RELEASE SAVEPOINT s");
      console.log(`${r.table_name}.${r.column_name} rows for combo since ${ts ? SINCE : "(no ts, all time)"}: ${n}`);
    } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); console.log(r.table_name, "ERR", e.message.slice(0, 80)); }
  }
  // letters / dispute cases totals for Combo (all time) so we know the baseline
  for (const t of ["inquiry_cases", "repair_letters", "dispute_letters", "letters", "dispute_cases", "repair_cases", "messages", "documents"]) {
    await c.query("SAVEPOINT s");
    try { const r = (await c.query(`select count(*)::int n, max(created_at) last from public."${t}" where client_id=$1`, [COMBO])).rows[0]; await c.query("RELEASE SAVEPOINT s"); console.log(`${t}: total ${r.n}, last created ${r.last?.toISOString?.() ?? "-"}`); }
    catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); console.log(`${t}: (no such table / ${e.message.slice(0, 50)})`); }
  }
} finally { await c.query("ROLLBACK"); await c.end(); }
