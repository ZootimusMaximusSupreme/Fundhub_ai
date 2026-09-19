// Hole 22 round 2 reviewer — who am I, what columns, what can I see. Read only. No values printed.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  console.log((await c.query("select current_user, now()")).rows[0]);
  for (const t of ["pii_identity", "crs_results", "clients", "client_consents", "events", "messages"]) {
    const cols = (await c.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t])).rows;
    const r = (await c.query(`select relrowsecurity rls, relforcerowsecurity force from pg_class where relname=$1 and relnamespace='public'::regnamespace`, [t])).rows[0];
    let n; try { await c.query("SAVEPOINT s"); n = (await c.query(`select count(*)::int n from public."${t}"`)).rows[0].n; await c.query("RELEASE SAVEPOINT s"); } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); n = "ERR " + e.message.slice(0, 80); }
    console.log(t, JSON.stringify(r), "visible", n, "|", cols.map((x) => x.column_name).join(","));
  }
  const pol = (await c.query(`select tablename, policyname, roles, cmd, qual from pg_policies where tablename in ('pii_identity','crs_results') `)).rows;
  for (const p of pol) console.log("policy", p.tablename, p.policyname, p.roles, p.cmd, (p.qual || "").slice(0, 160));
} finally { await c.query("ROLLBACK"); await c.end(); }
