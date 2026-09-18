// HOLE N22 — LOOK ONLY. What an UPDATE on the staff table also does: the
// table's own triggers (by name) and its column names. BEGIN READ ONLY.
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n22-staff-shape.mjs
import { pool, close } from "../../../src/db.mjs";

const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const t = (await c.query(
    `SELECT tgname, pg_get_triggerdef(t.oid) AS def
       FROM pg_trigger t WHERE tgrelid = 'staff'::regclass AND NOT tgisinternal`)).rows;
  const cols = (await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'staff' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
  console.log(JSON.stringify({ triggers: t, columns: cols }, null, 2));
  await c.query("ROLLBACK");
} finally {
  c.release();
  await close();
}
