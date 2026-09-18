// Hole 22 reviewer — does the app role see pii_identity at all? Read only.
import pg from "pg";
const url = process.env[process.argv[2] || "DATABASE_URL"];
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  console.log((await c.query("select current_user")).rows[0]);
  for (const t of ["pii_identity", "clients", "client_custom_fields", "businesses", "documents", "messages"]) {
    const r = (await c.query(`select relrowsecurity rls, relforcerowsecurity force from pg_class where relname=$1 and relnamespace='public'::regnamespace`, [t])).rows[0];
    await c.query("SAVEPOINT s");
    try {
      const n = (await c.query(`select count(*)::int n from public."${t}"`)).rows[0].n;
      await c.query("RELEASE SAVEPOINT s");
      console.log(t, r, "visible total", n);
    } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); console.log(t, r, "ERR", e.message.slice(0, 100)); }
  }
} finally { await c.query("ROLLBACK"); await c.end(); }
