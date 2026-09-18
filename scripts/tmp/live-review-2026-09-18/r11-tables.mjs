// Reviewer hole 11 — read only. Which tables hold purchases / grants / payments.
import { pool, close } from "../../../src/db.mjs";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const t = await c.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND (table_name ~ '(pay|order|purchas|receipt|entitle|grant|invoice|charge|sale|product|enroll|course)')
     ORDER BY 1`);
  const cols = await c.query(`
    SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) cols
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name = ANY($1)
     GROUP BY 1 ORDER BY 1`, [t.rows.map(r => r.table_name)]);
  await c.query("COMMIT");
  for (const r of cols.rows) console.log(r.table_name, "::", r.cols);
} catch (e) { try { await c.query("ROLLBACK"); } catch {} console.error("fail", e.message); process.exitCode = 1; }
finally { c.release(); await close(); }
