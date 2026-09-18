// N18 — look only. Row-level security shape on clients / funding_rounds, the
// connecting role, and any triggers on clients, so the backfill migration is known
// to reach every row when ship applies it. BEGIN READ ONLY, rolled back. No secrets.
import { pool } from "../../../src/db.mjs";

const c = await pool().connect();
const out = {};
try {
  await c.query("BEGIN READ ONLY");
  out.role = (await c.query(
    `SELECT current_user AS who, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`)).rows[0];
  out.tables = (await c.query(
    `SELECT relname, relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner
       FROM pg_class WHERE relname IN ('clients','funding_rounds') AND relkind = 'r'`)).rows;
  out.policies = (await c.query(
    `SELECT tablename, policyname, cmd, roles::text, qual FROM pg_policies
      WHERE schemaname = 'public' AND tablename IN ('clients','funding_rounds')`)).rows;
  out.clientTriggers = (await c.query(
    `SELECT tgname, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
      WHERE t.tgrelid = 'public.clients'::regclass AND NOT t.tgisinternal`)).rows;
  out.appliedTail = (await c.query(
    `SELECT * FROM schema_migrations ORDER BY 1 DESC LIMIT 3`)).rows;
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool().end();
}
console.log(JSON.stringify(out, null, 2));
